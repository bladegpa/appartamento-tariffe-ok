/* ═══════════════════════════════════════
   db.js — Firebase Firestore Sync Layer
   Versione 1.0

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
function dbSave(key, value) {
  // CRITICO: aggiorna il timestamp locale SUBITO (non solo dopo il push cloud).
  // Senza questo, dbPullAll vede _getLocalTs(key) = 0 e il cloud sovrascrive
  // sempre le modifiche locali, anche quelle più recenti.
  _setLocalTs(key, Date.now());

  if (!_dbEnabled || !_dbReady) return;

  // Debounce: se arriva un secondo save sulla stessa chiave
  // entro 800 ms, annulla il precedente
  if (_syncPending.has(key)) clearTimeout(_syncPending.get(key));

  const tid = setTimeout(async () => {
    _syncPending.delete(key);
    await _pushToCloud(key, value);
  }, 800);

  _syncPending.set(key, tid);
}

async function _pushToCloud(key, value) {
  if (!_db) return;
  try {
    _dbSetStatus('sync', '☁ Salvataggio…');
    await _db.collection(DB_COLLECTION).doc(_sanitizeKey(key)).set({
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
  if (!_dbEnabled || !_dbReady || !_db) return;

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

      // Confronta timestamp: usa il cloud solo se più recente
      const localTs = _getLocalTs(key);
      if (cloudTs >= localTs) {
        localStorage.setItem(key, cloudVal);
        _setLocalTs(key, cloudTs);
        updated++;
      }
    });

    _dbSetStatus('ok', `☁ Sincronizzato (${updated} aggiornamenti)`);
    setTimeout(() => _dbSetStatus('idle', '☁'), 4000);
    console.info(`[db] Pull completato — ${updated} chiavi aggiornate da cloud.`);
  } catch (e) {
    console.warn('[db] Errore pull cloud:', e.message);
    _dbSetStatus('err', '☁ Errore download');
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
      const ref = _db.collection(DB_COLLECTION).doc(_sanitizeKey(key));
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

/* ─── HELPERS INTERNI ───────────────────────────────────── */

// Firestore non ammette '/' né caratteri speciali nei doc ID
function _sanitizeKey(k)   { return k.replace(/[^a-zA-Z0-9_-]/g, '__'); }
function _desanitizeKey(k) { return k.replace(/__/g, '_'); }

// Timestamp locale per ogni chiave (per decidere chi è più recente)
const _TS_PREFIX = '_dbts_';
function _getLocalTs(key)       { return parseInt(localStorage.getItem(_TS_PREFIX + key) || '0', 10); }
function _setLocalTs(key, ts)   { localStorage.setItem(_TS_PREFIX + key, String(ts)); }

/* ─── STATUS BADGE ──────────────────────────────────────── */
function _dbSetStatus(state, label) {
  const el = document.getElementById('dbStatus');
  if (!el) return;
  el.textContent = label;
  el.className   = 'db-status db-status-' + state;
}

/* ─── EXPORT PUBBLICO ───────────────────────────────────── */
const DB = { init: dbInit, save: dbSave, pullAll: dbPullAll, pushAll: dbPushAll };
