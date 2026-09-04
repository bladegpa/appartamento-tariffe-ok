/* ═══════════════════════════════════════
   db.js — Firebase Firestore Sync Layer
   Versione 1.5.0

   Strategia:
   · localStorage resta il layer primario (veloce, offline)
   · Firestore è il layer di sincronizzazione cloud
   · Ogni salvataggio locale viene propagato al cloud in modo asincrono
   · All'avvio l'app carica i dati cloud (se più recenti di quelli locali)
   · In assenza di connessione o config Firebase, tutto funziona offline
═══════════════════════════════════════ */

/* ─── CONFIGURAZIONE FIREBASE ──────────────────────────────
   Sostituisci con i valori reali presi dalla Firebase Console
   (Impostazioni progetto → Le tue app → SDK snippet → Config)
─────────────────────────────────────────────────────────── */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBgNiwMY5OcuPVJqDCQkiZXk6yc43t0upU",
  authDomain:        "appartamento-tariffe-ok.firebaseapp.com",
  projectId:         "appartamento-tariffe-ok",
  storageBucket:     "appartamento-tariffe-ok.firebasestorage.app",
  messagingSenderId: "454697588357",
  appId:             "1:454697588357:web:0c82e4c52d2aa50f01fbec"
};

/* ─── COLLEZIONE FIRESTORE ─────────────────────────────── */
const DB_COLLECTION = 'gestionale';  // Non cambiare dopo il primo deploy

/* ─── STATO INTERNO ─────────────────────────────────────── */
let _db          = null;   // istanza Firestore
let _dbReady     = false;  // Firebase inizializzato correttamente
let _dbEnabled   = false;  // true solo se config non è placeholder
let _syncPending = new Map(); // chiave → timeout debounce
let _syncErrors  = 0;

/* ─── INIT ─────────────────────────────────────────────── */
function dbInit() {
  // Se la config è ancora placeholder, lavora solo offline
  if (FIREBASE_CONFIG.apiKey === 'INSERISCI_API_KEY') {
    _dbSetStatus('offline', '☁ Cloud non configurato');
    console.info('[db] Firebase non configurato — modalità solo locale.');
    return;
  }

  try {
    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    _db      = firebase.firestore();
    _dbReady = true;
    _dbEnabled = true;

    // Abilita persistenza offline del SDK (opzionale ma utile)
    _db.enablePersistence({ synchronizeTabs: true })
      .catch(err => {
        if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
          console.warn('[db] Persistenza offline non disponibile:', err.code);
        }
      });

    _dbSetStatus('sync', '☁ Connesso');
    console.info('[db] Firebase Firestore inizializzato.');
  } catch (e) {
    console.error('[db] Errore inizializzazione Firebase:', e);
    _dbSetStatus('offline', '☁ Errore Firebase');
  }
}

/* ─── SALVA (localStorage + cloud) ─────────────────────── */
/**
 * Chiamato da ogni funzione save* in data.js.
 * Scrive su localStorage immediatamente, poi invia al cloud
 * con un debounce di 800 ms per ridurre le scritture.
 * @param {string} key   — chiave localStorage (es. 'octo_cals_attico_v3')
 * @param {string} value — valore JSON già serializzato
 */
// Chiavi critiche → push immediato (0ms debounce): tag, prezzi, nomi
// Tutte le altre → debounce 600ms per ridurre le scritture
const _CRITICAL_KEY_PATTERNS = ['_types_', '_typesovr_', '_priceov_', '_incasso_', '_manual_', '_gestione', '_spese', '_ratings_', '_dirtax', '_tombs', '_archived_years', '_last_year'];
function _isCritical(key) {
  return _CRITICAL_KEY_PATTERNS.some(p => key.includes(p));
}

function dbSave(key, value) {
  // CRITICO: aggiorna il timestamp locale SUBITO (non solo dopo il push cloud).
  // Senza questo, dbPullAll vede _getLocalTs(key) = 0 e il cloud sovrascrive
  // sempre le modifiche locali, anche quelle più recenti.
  _setLocalTs(key, Date.now());

  if (!_dbEnabled || !_dbReady) return;

  if (_syncPending.has(key)) clearTimeout(_syncPending.get(key));

  const delay = _isCritical(key) ? 0 : 600;

  const tid = setTimeout(async () => {
    _syncPending.delete(key);
    await _pushToCloud(key, value);
  }, delay);

  _syncPending.set(key, tid);
}

// Flush forzato di tutti i save pendenti (chiamato su beforeunload)
function dbFlushPending() {
  if (!_dbEnabled || !_dbReady) return;
  _syncPending.forEach((tid, key) => {
    clearTimeout(tid);
    _syncPending.delete(key);
    const val = localStorage.getItem(key);
    if (val !== null) _pushToCloud(key, val);  // fire & forget
  });
}

async function _pushToCloud(key, value) {
  if (!_db) return;
  const docId = _sanitizeKey(key);
  if (!docId) return;
  try {
    _dbSetStatus('sync', '☁ Salvataggio…');
    await _db.collection(DB_COLLECTION).doc(docId).set({
      value:     value,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      clientTs:  Date.now(),
    });
    _syncErrors = 0;
    _dbSetStatus('ok', '☁ Sincronizzato');
    // Resetta badge dopo 3 s
    setTimeout(() => _dbSetStatus('idle', '☁'), 3000);
  } catch (e) {
    _syncErrors++;
    console.warn('[db] Errore salvataggio cloud:', e.message);
    _dbSetStatus('err', `☁ Errore (${_syncErrors})`);
  }
}

/* ─── CARICA (all'avvio, cloud sovrascrive locale se più recente) ─ */
/**
 * Scarica TUTTI i documenti della collezione e aggiorna
 * localStorage se il dato cloud è più recente.
 * Ritorna una Promise che si risolve quando il pull è completato.
 */
async function dbPullAll() {
  if (!_dbEnabled || !_dbReady || !_db) return 0;

  _dbSetStatus('sync', '☁ Download dati…');
  try {
    const snapshot = await _db.collection(DB_COLLECTION).get();
    let updated = 0;

    snapshot.forEach(doc => {
      const key      = _desanitizeKey(doc.id);
      const data     = doc.data();
      const cloudVal = data.value;
      const cloudTs  = data.clientTs || 0;

      if (!cloudVal) return;

      // ── MERGE SPECIALE: override manuali dei tag (octo_typesovr_*) ──
      // Ogni voce ha il proprio timestamp: si fonde SEMPRE (indipendentemente
      // dal timestamp della chiave) prendendo per ogni uid il valore più
      // recente. Così un tag cambiato su un dispositivo non può mai essere
      // sovrascritto da un altro dispositivo con dati vecchi.
      // Chiavi a fusione per-voce con timestamp proprio: oltre agli override
      // dei tag, dalla v1.5.0 anche il registro dei tombstone (octo_tombs_v3),
      // che deve fondersi allo stesso modo per non perdere cancellazioni.
      if (key.includes('_typesovr_') || key === SK_TOMBS_KEY) {
        try {
          const localObj = JSON.parse(localStorage.getItem(key) || '{}');
          const cloudObj = JSON.parse(cloudVal);
          const merged   = { ...localObj };
          let changedLocal = false;
          Object.entries(cloudObj).forEach(([uid, e]) => {
            if (!e || typeof e !== 'object') return;
            const le = merged[uid];
            if (!le || (e.ts || 0) > (le.ts || 0)) { merged[uid] = e; changedLocal = true; }
          });
          const mergedJson = JSON.stringify(merged);
          if (changedLocal) {
            lsSet(key, mergedJson);
            updated++;
          }
          // Se il locale contiene voci più recenti del cloud, ripubblica il merge
          if (mergedJson !== cloudVal) _pushToCloud(key, mergedJson);
          _setLocalTs(key, Math.max(cloudTs, _getLocalTs(key)));
        } catch(_) {}
        return; // chiave gestita, non passare alla logica standard
      }

      // Confronta timestamp: usa il cloud solo se più recente
      const localTs = _getLocalTs(key);

      if (cloudTs >= localTs) {
        // Per types e priceov: MERGE (unione) invece di sostituzione.
        // Garantisce che le modifiche fatte su un device non cancellino
        // le modifiche fatte sull'altro device.
        if (_isCritical(key) && localTs > 0) {
          try {
            const localObj  = JSON.parse(localStorage.getItem(key) || (cloudVal.trim().startsWith('{') ? '{}' : '[]'));
            const cloudObj  = JSON.parse(cloudVal);
            // Merge solo per oggetti (types, priceov, gestione, spese)
            if (localObj && typeof localObj === 'object' && !Array.isArray(localObj) &&
                cloudObj && typeof cloudObj === 'object' && !Array.isArray(cloudObj)) {
              // Cloud vince sui singoli valori (è più recente come timestamp globale)
              const merged = { ...localObj, ...cloudObj };
              // v1.5.0 — TOMBSTONE: senza questo passaggio una voce cancellata
              // su un dispositivo (un override prezzo tolto, un giudizio
              // eliminato) riappariva al primo pull, perché l'altro dispositivo
              // la ripubblicava e la fusione la reintroduceva. Il registro
              // octo_tombs_v3 marca le cancellazioni con un timestamp proprio.
              try { if (typeof applyTombs === 'function') applyTombs(key, merged); } catch(_) {}
              const mergedJson = JSON.stringify(merged);
              lsSet(key, mergedJson);
              _setLocalTs(key, cloudTs);
              // Se la fusione (o i tombstone) hanno prodotto un risultato
              // diverso dal cloud, ripubblica: così la cancellazione si
              // propaga anche agli altri dispositivi.
              if (mergedJson !== cloudVal) _pushToCloud(key, mergedJson);
              updated++;
              return;
            }
          } catch(_) {}
        }
        // Fallback: sostituzione normale
        lsSet(key, cloudVal);
        _setLocalTs(key, cloudTs);
        updated++;
      }
    });

    _dbSetStatus('ok', `☁ Sincronizzato (${updated} aggiornamenti)`);
    setTimeout(() => _dbSetStatus('idle', '☁'), 4000);
    console.info(`[db] Pull completato — ${updated} chiavi aggiornate da cloud.`);
    return updated;
  } catch (e) {
    console.warn('[db] Errore pull cloud:', e.message);
    _dbSetStatus('err', '☁ Errore download');
    return 0;
  }
}

/* ─── PUSH FORZATO (tutti i dati locali → cloud) ─────────── */
/**
 * Carica TUTTO localStorage verso Firestore.
 * Usato dal pannello Admin per forzare il backup iniziale.
 */
async function dbPushAll() {
  if (!_dbEnabled || !_dbReady || !_db) {
    alert('Firebase non configurato. Controlla db.js.');
    return;
  }

  const keys = Object.keys(localStorage).filter(k => k.startsWith('octo_'));
  if (!keys.length) { alert('Nessun dato locale da caricare.'); return; }

  _dbSetStatus('sync', `☁ Upload ${keys.length} chiavi…`);
  let ok = 0, fail = 0;

  // Scrivi in batch da 500 (limite Firestore)
  const BATCH_SIZE = 499;
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = _db.batch();
    const slice = keys.slice(i, i + BATCH_SIZE);
    slice.forEach(key => {
      const val = localStorage.getItem(key);
      if (val === null) return;
      const docId = _sanitizeKey(key);
      if (!docId) return;
      const ref = _db.collection(DB_COLLECTION).doc(docId);
      batch.set(ref, {
        value:     val,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        clientTs:  Date.now(),
      });
      _setLocalTs(key, Date.now());
    });
    try {
      await batch.commit();
      ok += slice.length;
    } catch (e) {
      fail += slice.length;
      console.error('[db] Errore batch upload:', e);
    }
  }

  _dbSetStatus('ok', `☁ Upload completato (${ok} ok, ${fail} errori)`);
  setTimeout(() => _dbSetStatus('idle', '☁'), 5000);
}

/* ─── CANCELLA (localStorage + cloud) ───────────────────── */
/**
 * v1.5.0 — CRITICO. Fino alla v1.4.3 i reset facevano solo
 * localStorage.removeItem(): il documento restava su Firestore e il
 * timestamp locale restava alto, quindi il dato non tornava nemmeno in
 * locale ma continuava a esistere sugli altri dispositivi. Risultato:
 * appartamento vuoto su un device e pieno sull'altro, per sempre.
 * Usare SEMPRE questa funzione al posto di localStorage.removeItem()
 * per le chiavi sincronizzate.
 * @param {string} key
 */
function dbDelete(key) {
  localStorage.removeItem(key);
  _clearLocalTs(key);
  if (_syncPending.has(key)) { clearTimeout(_syncPending.get(key)); _syncPending.delete(key); }
  if (!_dbEnabled || !_dbReady || !_db) return;
  const docId = _sanitizeKey(key);
  if (!docId) return;
  _db.collection(DB_COLLECTION).doc(docId).delete()
    .then(() => console.info('[db] Cancellato dal cloud:', key))
    .catch(e => console.warn('[db] Errore cancellazione cloud:', key, e.message));
}

/** Cancella più chiavi in batch (max 499 per commit, limite Firestore) */
async function dbDeleteMany(keys) {
  keys.forEach(k => { localStorage.removeItem(k); _clearLocalTs(k); });
  if (!_dbEnabled || !_dbReady || !_db) return;
  const BATCH_SIZE = 499;
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = _db.batch();
    keys.slice(i, i + BATCH_SIZE).forEach(k => {
      const docId = _sanitizeKey(k);
      if (docId) batch.delete(_db.collection(DB_COLLECTION).doc(docId));
    });
    try { await batch.commit(); }
    catch (e) { console.error('[db] Errore batch delete:', e); }
  }
}

/* ─── HELPERS INTERNI ───────────────────────────────────── */
// Chiave del registro tombstone (definita anche in data.js come SK_TOMBS;
// qui serve prima che data.js sia valutato)
const SK_TOMBS_KEY = 'octo_tombs_v3';


// Firestore non ammette '/' né caratteri speciali nei doc ID.
// v1.5.0 — le due funzioni NON erano inverse: _sanitizeKey mappava ogni
// carattere strano su '__' e _desanitizeKey riportava ogni '__' a '_',
// quindi il round-trip era corretto solo perché nessuna chiave conteneva
// caratteri speciali. Adesso le chiavi sono validate e non trasformate:
// il doc ID è identico alla chiave localStorage.
const _KEY_RE = /^[a-zA-Z0-9_-]+$/;
function _sanitizeKey(k) {
  if (!_KEY_RE.test(k)) {
    console.warn('[db] Chiave non valida per Firestore (ignorata):', k);
    return null;
  }
  return k;
}
function _desanitizeKey(k) { return k; }

// Timestamp locale per ogni chiave (per decidere chi è più recente)
const _TS_PREFIX = '_dbts_';
function _getLocalTs(key)       { return parseInt(localStorage.getItem(_TS_PREFIX + key) || '0', 10); }
function _setLocalTs(key, ts)   { lsSet(_TS_PREFIX + key, String(ts)); }
function _clearLocalTs(key)     { localStorage.removeItem(_TS_PREFIX + key); }

/** Rimuove le chiavi _dbts_ orfane (chiave dati non più presente).
 *  Fino alla v1.4.3 crescevano indefinitamente in parallelo ai dati. */
function dbPruneTimestamps() {
  let n = 0;
  Object.keys(localStorage)
    .filter(k => k.startsWith(_TS_PREFIX))
    .forEach(k => {
      const dataKey = k.slice(_TS_PREFIX.length);
      if (localStorage.getItem(dataKey) === null) { localStorage.removeItem(k); n++; }
    });
  if (n) console.info(`[db] ${n} timestamp orfani rimossi.`);
  return n;
}

/* ─── STATUS BADGE ──────────────────────────────────────── */
function _dbSetStatus(state, label) {
  const el = document.getElementById('dbStatus');
  if (!el) return;
  el.textContent = label;
  el.className   = 'db-status db-status-' + state;
}

/* ─── EXPORT PUBBLICO ───────────────────────────────────── */
const DB = { init: dbInit, save: dbSave, del: dbDelete, delMany: dbDeleteMany,
             pullAll: dbPullAll, pushAll: dbPushAll, flush: dbFlushPending,
             pruneTs: dbPruneTimestamps };
