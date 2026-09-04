/* ═══════════════════════════════════════
   data.js — Stato, Storage, Sync
   Versione 1.5.0
═══════════════════════════════════════ */

/* ─── STATE ─────────────────────────────── */
// init() imposta sempre 'confronto' all'avvio; questo è solo il valore
// iniziale prima del bootstrap.
let currentPropId = localStorage.getItem('octo_current_prop') || 'confronto';
let calSources = [];
let bookTypes  = {};
let pastCache  = {};
let liveBooks     = [];
let nextYearBooks = [];   // prenotazioni anno prossimo (checkout >= 1 gen anno+1)
let sortSt     = { col:'checkin', dir:'asc' };
let editModeActive = false;

/* ─── TOMBSTONE (cancellazioni sincronizzate) ─────────────────────────
   v1.5.0. Le chiavi "critiche" (priceov, incasso, ratings, dirtax…)
   vengono FUSE fra dispositivi in db.js con {...locale, ...cloud}: la
   fusione protegge dalle sovrascritture, ma non sa cancellare. Una voce
   eliminata su un device riappariva al primo pull perché l'altro device
   la ripubblicava.
   Il registro qui sotto marca ogni cancellazione con un timestamp
   proprio, esattamente come già facevano gli override dei tag:
       { "<chiaveStorage>|<uid>": { d: 1|0, ts } }
   d:1 = cancellata, d:0 = ri-creata dopo la cancellazione.
   Il registro si fonde per-voce (db.js lo tratta come _typesovr_) e non
   viene mai ripulito, quindi una fusione ingenua sarebbe corretta anche
   per lui: le voci si aggiungono soltanto.                            */
const SK_TOMBS = 'octo_tombs_v3';

function loadTombs() {
  try { return JSON.parse(localStorage.getItem(SK_TOMBS) || '{}'); } catch(e) { return {}; }
}

/** Registra (o revoca) la cancellazione di una voce.
 *  @param {string} storageKey  chiave localStorage che contiene l'oggetto
 *  @param {string} entryId     uid della voce
 *  @param {boolean} deleted    true = cancellata, false = ri-creata      */
function markTomb(storageKey, entryId, deleted) {
  if (typeof viewingArchive !== 'undefined' && viewingArchive) return;
  const t = loadTombs();
  t[storageKey + '|' + entryId] = { d: deleted ? 1 : 0, ts: Date.now() };
  const v = JSON.stringify(t);
  lsSet(SK_TOMBS, v);
  DB.save(SK_TOMBS, v);
}

/** Rimuove da `obj` le voci marcate come cancellate. Muta e ritorna obj. */
function applyTombs(storageKey, obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const t      = loadTombs();
  const prefix = storageKey + '|';
  Object.entries(t).forEach(([k, e]) => {
    if (!e || !e.d || !k.startsWith(prefix)) return;
    delete obj[k.slice(prefix.length)];
  });
  return obj;
}

/* ─── Storage Key Helpers ─────────────────────────────── */
function skCals()  { return `octo_cals_${currentPropId}_v3`; }
function skTypes() { return `octo_types_${currentPropId}_v3`; }
function skPast()  { return `octo_past_${currentPropId}_v3`; }
function skFiscal(){ return `octo_fiscal_${currentPropId}_v3`; }
function skLive()      { return `octo_live_${currentPropId}_v3`; }
function skNextYear()  { return `octo_nextyear_${currentPropId}_v3`; }

function saveCals()   {
  const v = JSON.stringify(calSources);
  lsSet(skCals(), v);
  DB.save(skCals(), v);
}
function saveTypes()  {
  const v = JSON.stringify(bookTypes);
  lsSet(skTypes(), v);
  DB.save(skTypes(), v);
}

function savePast()   {
  const v = JSON.stringify(pastCache);
  lsSet(skPast(), v);
  DB.save(skPast(), v);
}
function saveLive() {
  // v1.5.0: isSpecialProp() copre TUTTE le pseudo-schede. Il controllo
  // precedente ne elencava solo tre e lasciava passare spese/grafici/
  // calendario, creando chiavi octo_live_spese_v3 senza senso.
  if (isSpecialProp(currentPropId)) return;
  const v = JSON.stringify(liveBooks.map(serBook));
  lsSet(skLive(), v);
  DB.save(skLive(), v);
}
function saveNextYear() {
  if (isSpecialProp(currentPropId)) return;
  const v = JSON.stringify(nextYearBooks.map(serBook));
  lsSet(skNextYear(), v);
  DB.save(skNextYear(), v);
}
function loadNextYear() {
  try { return JSON.parse(localStorage.getItem(skNextYear()) || '[]').map(deserBook); } catch(e) { return []; }
}
function saveFiscal() {
  const d = {
    regime:  document.getElementById('btnForfettario')?.classList.contains('active') ? 'forfettario' : 'cedolare',
    bkComm:  document.getElementById('fpBkComm')?.value    || '16',
    abComm:  document.getElementById('fpAbComm')?.value    || '15.5',
    inclDir: document.getElementById('fpCedDiretta')?.checked || false,
  };
  const v = JSON.stringify(d);
  lsSet(skFiscal(), v);
  DB.save(skFiscal(), v);
}
function loadFiscal() {
  let d = {};
  try { d = JSON.parse(localStorage.getItem(skFiscal()) || '{}'); } catch(e) {}
  const regime = d.regime || 'cedolare';
  setRegime(regime, false);
  const elBk   = document.getElementById('fpBkComm');
  const elAb   = document.getElementById('fpAbComm');
  const elDir  = document.getElementById('fpCedDiretta');
  if (elBk)   elBk.value    = d.bkComm  !== undefined ? d.bkComm  : '16';
  if (elAb)   elAb.value    = d.abComm  !== undefined ? d.abComm  : '15.5';
  if (elDir)  elDir.checked = d.inclDir !== undefined ? d.inclDir : false;
  // Popola i tre campi gestione
  const gd = getGestioneDetail(currentPropId);
  const elAff  = document.getElementById('fpAffitto');
  const elCond = document.getElementById('fpCondominio');
  const elVar  = document.getElementById('fpVarie');
  if (elAff)  elAff.value  = gd.affitto;
  if (elCond) elCond.value = gd.condominio;
  if (elVar)  elVar.value  = gd.varie;
}

/* ─── Global Settings ─────────────────────────────── */
const SK_GLOBAL = 'octo_admin_global_v3';
function loadGlobalSettings() {
  try { return JSON.parse(localStorage.getItem(SK_GLOBAL) || '{}'); } catch(e) { return {}; }
}
function saveGlobalSettings(obj) {
  const v = JSON.stringify({ ...loadGlobalSettings(), ...obj });
  lsSet(SK_GLOBAL, v);
  DB.save(SK_GLOBAL, v);
}
function getAllowPriceEdit() {
  return loadGlobalSettings().allowPriceEdit === true;
}

/* ─── Spese Operative ─────────────────────────────── */
const SK_SPESE = 'octo_spese_v3';
function loadSpese() {
  try { return JSON.parse(localStorage.getItem(SK_SPESE) || '{}'); } catch(e) { return {}; }
}
function saveSpese(obj) {
  if (typeof viewingArchive !== 'undefined' && viewingArchive) return;
  const v = JSON.stringify({ ...loadSpese(), ...obj });
  lsSet(SK_SPESE, v);
  DB.save(SK_SPESE, v);
}
function getSpese() {
  const d = loadSpese();
  return {
    luce:           parseFloat(d.luce           ?? 3),
    welcomePack:    parseFloat(d.welcomePack    ?? 15),
    pulizie:        parseFloat(d.pulizie        ?? 50),
    lavanderia:     parseFloat(d.lavanderia     ?? 20),
    contanti:       parseFloat(d.contanti       ?? 0),
    tassaSoggiorno: parseFloat(d.tassaSoggiorno ?? 0),
  };
}

/* ─── Affitto / Gestione per appartamento ─────────────────────────────── */
const SK_GESTIONE = 'octo_gestione_v3';
function loadGestione() {
  try { return JSON.parse(localStorage.getItem(SK_GESTIONE) || '{}'); } catch(e) { return {}; }
}

/**
 * Salva una voce di gestione per un appartamento.
 * @param {string} propId
 * @param {string} field  — 'affitto' | 'condominio' | 'varie'
 * @param {number} val
 */
function saveGestioneField(propId, field, val) {
  // In archivio la vista è dichiarata "sola lettura": fino alla v1.4.3
  // gestione e spese scrivevano comunque sulle chiavi archiviate.
  if (typeof viewingArchive !== 'undefined' && viewingArchive) return;
  const all = loadGestione();
  if (!all[propId] || typeof all[propId] !== 'object') {
    // Migrazione: se il valore era un numero singolo, lo sposta in 'affitto'
    const old = parseFloat(all[propId]) || 0;
    all[propId] = { affitto: old, condominio: 0, varie: 0 };
  }
  all[propId][field] = parseFloat(val) || 0;
  const v = JSON.stringify(all);
  lsSet(SK_GESTIONE, v);
  DB.save(SK_GESTIONE, v);
}

/** Ritorna la somma totale annua (affitto + condominio + varie) */
function getGestione(propId) {
  const all = loadGestione();
  const entry = all[propId];
  if (!entry) return 0;
  if (typeof entry === 'number') return entry; // compatibilità vecchio formato
  return (parseFloat(entry.affitto) || 0) + (parseFloat(entry.condominio) || 0) + (parseFloat(entry.varie) || 0);
}

/** Ritorna le singole voci {affitto, condominio, varie} */
function getGestioneDetail(propId) {
  const all = loadGestione();
  const entry = all[propId];
  if (!entry || typeof entry === 'number') {
    return { affitto: parseFloat(entry) || 0, condominio: 0, varie: 0 };
  }
  return {
    affitto:    parseFloat(entry.affitto)    || 0,
    condominio: parseFloat(entry.condominio) || 0,
    varie:      parseFloat(entry.varie)      || 0,
  };
}

/** Retrocompatibilità: salva come oggetto (usato da codice legacy) */
function saveGestione(propId, val) {
  saveGestioneField(propId, 'affitto', val);
}

/* ─── Tassazione Dirette con attribuzione bonifico (v1.4) ────────────
   Flag per singola prenotazione Diretta: se spuntato, la prenotazione
   è "tracciata" (pagata con bonifico) e va tassata. Il pop-up chiede
   su QUALE appartamento è arrivato il bonifico: la base imponibile
   viene attribuita a quell'appartamento e tassata con la SUA aliquota
   (cedolare 21/26% o forfettario).
   Struttura: { uid: { srcProp:'attico', taxProp:'stoccolma', ts } }
   Mappa GLOBALE (non per appartamento) così Confronto e Grafici
   possono attribuire la base tra appartamenti diversi.               */
const SK_DIRTAX = 'octo_dirtax_v3';

function loadDirTax() {
  try { return applyTombs(SK_DIRTAX,
    JSON.parse(localStorage.getItem(SK_DIRTAX) || '{}')); } catch(e) { return {}; }
}
function getDirTax(uid) {
  const e = loadDirTax()[uid];
  return (e && e.taxProp) ? e : null;
}
function setDirTax(uid, srcProp, taxProp) {
  const d = loadDirTax();
  if (!taxProp) { delete d[uid]; markTomb(SK_DIRTAX, uid, true); }
  else { d[uid] = { srcProp, taxProp, ts: Date.now() }; markTomb(SK_DIRTAX, uid, false); }
  const v = JSON.stringify(d);
  lsSet(SK_DIRTAX, v);
  DB.save(SK_DIRTAX, v);
}
/** La prenotazione diretta `uid` va tassata su QUESTO appartamento?
 *  – flag attivo  → sì solo se il bonifico è attribuito a propId
 *  – flag assente → vale l'impostazione di appartamento inclDir      */
function dirTaxAppliesHere(uid, propId, inclDir) {
  const e = getDirTax(uid);
  if (e) return e.taxProp === propId;
  return !!inclDir;
}

/** Base imponibile delle dirette di ALTRI appartamenti il cui bonifico
 *  è attribuito a propId (v1.4.2). Le dirette dello stesso appartamento
 *  non sono incluse: vengono già contate a origine con il flag.
 *  Recupera i prezzi dagli storage live/past/manual dell'appartamento
 *  di provenienza. */
function getDirTaxIncomingBase(propId) {
  let tot = 0;
  const map   = loadDirTax();
  const cache = {};   // srcProp → { uid: prezzo }
  Object.entries(map).forEach(([uid, e]) => {
    if (!e || e.taxProp !== propId) return;
    const src = e.srcProp || propId;
    if (src === propId) return;   // le proprie sono contate a origine
    if (!cache[src]) {
      const m = {};
      try { JSON.parse(localStorage.getItem(`octo_live_${src}_v3`) || '[]')
        .forEach(b => { if (b.uid && b.prezzo != null) m[b.uid] = b.prezzo; }); } catch(_) {}
      try { Object.values(JSON.parse(localStorage.getItem(`octo_past_${src}_v3`) || '{}'))
        .forEach(b => { if (b.uid && b.prezzo != null && m[b.uid] === undefined) m[b.uid] = b.prezzo; }); } catch(_) {}
      try { JSON.parse(localStorage.getItem(`octo_manual_${src}_v3`) || '[]')
        .forEach(b => { if (b.uid && b.prezzo != null && m[b.uid] === undefined) m[b.uid] = b.prezzo; }); } catch(_) {}
      cache[src] = m;
    }
    const p = cache[src][uid];
    if (typeof p === 'number') tot += p;
  });
  return tot;
}

/* ─── Sync Log ────────────────────────────────────────────────────────────────
   Registro cronologico delle sincronizzazioni iCal.
   Ogni voce: { ts, propId, propName, nLive, nPast, calResults,
                newUids, removedUids, allFailed }
   Max 300 voci, più recente in cima.
──────────────────────────────────────────────────────────────────────────── */
const SK_SYNC_LOG = 'octo_sync_log_v3';
const SYNC_LOG_MAX = 300;

function loadSyncLog() {
  try { return JSON.parse(localStorage.getItem(SK_SYNC_LOG) || '[]'); } catch(e) { return []; }
}
function appendSyncLogEntry(entry) {
  const log = loadSyncLog();
  log.unshift({ ...entry, ts: Date.now() });
  if (log.length > SYNC_LOG_MAX) log.length = SYNC_LOG_MAX;
  const v = JSON.stringify(log);
  lsSet(SK_SYNC_LOG, v);
  DB.save(SK_SYNC_LOG, v);
}
function clearSyncLog() {
  const v = '[]';
  lsSet(SK_SYNC_LOG, v);
  DB.save(SK_SYNC_LOG, v);
}


/* ─── Manual Bookings ─────────────────────────────── */
function skManual(propId) { return `octo_manual_${propId}_v3`; }
function loadManual(propId) {
  try { return JSON.parse(localStorage.getItem(skManual(propId)) || '[]'); } catch(e) { return []; }
}
function saveManual(propId, arr) {
  const v = JSON.stringify(arr);
  lsSet(skManual(propId), v);
  DB.save(skManual(propId), v);
}
function addManualEntry(propId, entry) {
  const arr = loadManual(propId);
  arr.push({ ...entry, uid: entry.uid || ('man_' + Math.random().toString(36).slice(2,9)) });
  saveManual(propId, arr);
}
function removeManualEntry(propId, uid) {
  saveManual(propId, loadManual(propId).filter(e => e.uid !== uid));
}
function updateManualEntry(propId, uid, fields) {
  saveManual(propId, loadManual(propId).map(e => e.uid === uid ? { ...e, ...fields } : e));
}

/* ─── Type Overrides (tag manuali — sync multi-device) ──────────────────────
   Ogni modifica manuale del tag (booking/airbnb/diretta) viene registrata qui
   con timestamp PER SINGOLA PRENOTAZIONE. A differenza di octo_types_* (che
   viene riscritto in blocco ad ogni refresh e quindi può essere sovrascritto
   da un dispositivo con dati vecchi), questa mappa si fonde tra dispositivi
   prendendo per ogni uid il valore più recente. Un valore t='' è un tombstone
   (tag rimosso manualmente).
   Struttura: { uid: { t:'diretta'|'booking'|'airbnb'|'', ts:1234567890 } }  */
function skTypeOvr(propId) { return `octo_typesovr_${propId}_v3`; }

function loadTypeOverrides(propId) {
  try { return JSON.parse(localStorage.getItem(skTypeOvr(propId)) || '{}'); } catch(e) { return {}; }
}

function setTypeOverride(propId, uid, tag) {
  if (typeof viewingArchive !== 'undefined' && viewingArchive) return; // niente override in archivio
  const d = loadTypeOverrides(propId);
  d[uid] = { t: tag || '', ts: Date.now() };
  const v = JSON.stringify(d);
  lsSet(skTypeOvr(propId), v);
  DB.save(skTypeOvr(propId), v);
}

/** Applica gli override manuali su una mappa types (bookTypes o propTypes).
 *  Da chiamare DOPO ogni load/parse, così i tag manuali vincono sempre
 *  su default e auto-detect. Ritorna la stessa mappa (mutata). */
function applyTypeOverrides(propId, typesMap) {
  if (typeof viewingArchive !== 'undefined' && viewingArchive) return typesMap;
  const d = loadTypeOverrides(propId);
  Object.entries(d).forEach(([uid, e]) => {
    if (!e || typeof e !== 'object') return;
    if (e.t) typesMap[uid] = e.t;
    else     delete typesMap[uid];
  });
  return typesMap;
}

/* ─── Price Overrides (sopravvivono al refresh del calendario) ─────────────────────────────── */

/* ─── Giudizi Ospiti (Ratings) ─────────────────────────────── */
function skRatings(propId) { return `octo_ratings_${propId}_v3`; }
function loadRatings(propId) {
  try { return applyTombs(skRatings(propId),
    JSON.parse(localStorage.getItem(skRatings(propId)) || '{}')); } catch(e) { return {}; }
}
function saveRating(propId, uid, rating, nota) {
  const all = loadRatings(propId);
  if (!rating && !nota) {
    delete all[uid];
    markTomb(skRatings(propId), uid, true);
  } else {
    all[uid] = { rating: rating || '', nota: (nota || '').trim() };
    markTomb(skRatings(propId), uid, false);
  }
  const json = JSON.stringify(all);
  lsSet(skRatings(propId), json);
  DB.save(skRatings(propId), json);
}
function getRating(propId, uid) {
  const all = loadRatings(propId);
  return all[uid] || { rating: '', nota: '' };
}
function skPriceOverrides(propId) { return `octo_priceov_${propId}_v3`; }
function loadPriceOverrides(propId) {
  try { return applyTombs(skPriceOverrides(propId),
    JSON.parse(localStorage.getItem(skPriceOverrides(propId)) || '{}')); } catch(e) { return {}; }
}
function setPriceOverride(propId, uid, value) {
  const d = loadPriceOverrides(propId);
  const v = String(value == null ? '' : value).trim();
  if (v === '') { delete d[uid]; markTomb(skPriceOverrides(propId), uid, true); }
  else { d[uid] = parseFloat(v); markTomb(skPriceOverrides(propId), uid, false); }
  const json = JSON.stringify(d);
  lsSet(skPriceOverrides(propId), json);
  DB.save(skPriceOverrides(propId), json);
}

/* ─── Incasso Netto Overrides ─────────────────────────────── */
function skIncasso(propId) { return `octo_incasso_${propId}_v3`; }
function loadIncasso(propId) {
  try { return applyTombs(skIncasso(propId),
    JSON.parse(localStorage.getItem(skIncasso(propId)) || '{}')); } catch(e) { return {}; }
}
function setIncassoEntry(propId, uid, value) {
  const d = loadIncasso(propId);
  const v = String(value).trim();
  if (v === '' || v === null) { delete d[uid]; markTomb(skIncasso(propId), uid, true); }
  else { d[uid] = parseFloat(v) || 0; markTomb(skIncasso(propId), uid, false); }
  const json = JSON.stringify(d);
  lsSet(skIncasso(propId), json);
  DB.save(skIncasso(propId), json);
}

/* ─── Book Serialization ─────────────────────────────── */
function serBook(b) {
  return { ...b, checkin: b.checkin?.getTime() || null, checkout: b.checkout?.getTime() || null };
}
function deserBook(b) {
  return { ...b, checkin: b.checkin ? new Date(b.checkin) : null, checkout: b.checkout ? new Date(b.checkout) : null };
}

/* ─── Past Cache ─────────────────────────────── */
function moveToPastCache() {
  liveBooks.forEach(b => {
    if (b.checkout && b.checkout <= TODAY && b.source !== 'blocked') {
      if (!pastCache[b.uid]) {
        pastCache[b.uid] = serBook(b);
      }
    }
  });
  savePast();
}

function clearPast() {
  if (!confirm('Rimuovere tutte le prenotazioni passate dall\'archivio?')) return;
  pastCache = {};
  savePast();
  renderAll();
}

/* ─── Merged Bookings ─────────────────────────────── */
function getMergedBookings() {
  const seen      = new Set();  // uid già visti
  const seenKey   = new Set();  // nome+checkin già visti (collision guard uid diversi)
  const result    = [];

  function _collKey(b) {
    // Chiave nome+checkin per rilevare duplicati con uid diverso
    if (!b.checkin || !b.nome || b.nome === '—') return null;
    const ci = (b.checkin instanceof Date ? b.checkin : new Date(b.checkin));
    return b.nome.trim().toLowerCase() + '_' + ci.getFullYear() + '-' + ci.getMonth() + '-' + ci.getDate();
  }

  liveBooks.forEach(b => {
    if (seen.has(b.uid)) return;
    const ck = _collKey(b);
    if (ck && seenKey.has(ck)) return;  // stesso ospite già aggiunto con uid diverso
    seen.add(b.uid);
    if (ck) seenKey.add(ck);
    result.push({ ...b, isPast: !!(b.checkout && b.checkout <= TODAY) });
  });
  Object.values(pastCache).forEach(raw => {
    const b = deserBook(raw);
    if (seen.has(b.uid)) return;
    const ck = _collKey(b);
    if (ck && seenKey.has(ck)) return;
    seen.add(b.uid);
    if (ck) seenKey.add(ck);
    result.push({ ...b, isPast: true });
  });
  // Include manual bookings for current property
  if (currentPropId && !isSpecialProp(currentPropId)) {
    loadManual(currentPropId).forEach(m => {
      if (seen.has(m.uid)) return;
      seen.add(m.uid);
      const checkin  = m.checkin  ? new Date(m.checkin)  : null;
      const checkout = m.checkout ? new Date(m.checkout) : null;
      // Inject into bookTypes so render.js tag system works
      if (!bookTypes[m.uid]) bookTypes[m.uid] = m.bookType || 'diretta';
      result.push({
        uid: m.uid, source: 'manual', nome: m.nome || '—',
        checkin, checkout,
        checkin_str:  fmtDate(checkin),
        checkout_str: fmtDate(checkout),
        prezzo: m.prezzo != null ? m.prezzo : null,
        notti: m.notti || null,
        isPast: !!(checkout && checkout <= TODAY),
        _cid: currentPropId, _cname: '(manuale)', _sum: '', _desc: '',
        warnings: [], isManual: true,
      });
    });
  }
  return result;
}

/* ─── Edit Mode ─────────────────────────────── */
function currentPropHasEditMode() {
  // v1.5.0: il vecchio test citava prop.allView, campo rimosso da config.js
  return !isSpecialProp(currentPropId);
}

function toggleEditMode() {
  editModeActive = !editModeActive;
  const btn = document.getElementById('btnEditMode');
  if (btn) {
    btn.classList.toggle('btn-acc', editModeActive);
    btn.classList.toggle('btn-gh',  !editModeActive);
    btn.innerHTML = editModeActive ? '✏️ Modifica ON' : '✏️ Attiva modifica';
  }
  renderAll();
}

/* ─── Delete Booking (past or future) ─────────────────────────────── */
function deletePastBooking(uid) { deleteBooking(uid); } // alias compatibilità
function deleteBooking(uid) {
  const all = getMergedBookings();
  const found = all.find(x => x.uid === uid);
  const lbl = (found && !found.isPast) ? 'futura' : 'passata';
  if (!confirm('Eliminare questa prenotazione ' + lbl + '?\nL\'operazione è irreversibile.')) return;
  if (pastCache[uid]) { delete pastCache[uid]; savePast(); }
  const prevLen = liveBooks.length;
  liveBooks = liveBooks.filter(b => b.uid !== uid);
  if (liveBooks.length !== prevLen) saveLive();
  removeManualEntry(currentPropId, uid);
  renderAll();
}

function updateNome(uid, val) {
  const nome = val.trim() || '—';
  // Update live cache
  const lb = liveBooks.find(b => b.uid === uid);
  if (lb) lb.nome = nome;
  // Update past cache
  if (pastCache[uid]) pastCache[uid].nome = nome;
  // Update manual booking if applicable
  const manuals = loadManual(currentPropId);
  if (manuals.find(m => m.uid === uid)) {
    updateManualEntry(currentPropId, uid, { nome });
  }
  savePast();
  saveLive();
  updateTableFooter(getMergedBookings().filter(b => b.source !== 'blocked'));
}


/* ─── Reset helpers ─────────────────────────────── */
/** Elenco completo delle chiavi anno-corrente di una proprietà */
function propStorageKeys(propId) {
  return ['cals','types','past','live','manual','incasso','priceov','typesovr','ratings','nextyear']
    .map(sfx => `octo_${sfx}_${propId}_v3`);
}

function resetDB() {
  const prop = PROPERTIES.find(p => p.id === currentPropId);
  if (!confirm(`⚠️ Elimina TUTTI i dati di "${prop?.name || currentPropId}"?\n(calendari, tipologie, storico)\n\nConfermi?`)) return;
  // v1.5.0 — DB.delMany cancella anche i documenti Firestore e i timestamp
  // locali. Con la sola removeItem i dati restavano nel cloud e sugli altri
  // dispositivi, e non tornavano nemmeno qui (timestamp locale troppo alto).
  DB.delMany(propStorageKeys(currentPropId));
  calSources = []; bookTypes = {}; pastCache = {}; liveBooks = []; nextYearBooks = [];
  renderSidebar();
  renderAll();
  sbStatus('ok', 'Database resettato.');
}

function resetCurrentFromAdmin() {
  const last = localStorage.getItem('octo_current_prop') || 'attico';
  const prop = PROPERTIES.find(p => p.id === last);
  if (!confirm(`⚠️ Elimina TUTTI i dati di "${prop?.name || last}"?`)) return;
  DB.delMany(propStorageKeys(last));
  renderAdminView();
}

function resetAllFromAdmin() {
  if (!confirm('⚠️ Elimina TUTTI i dati di TUTTI gli appartamenti?\n\nQuesta operazione è irreversibile.')) return;
  const keys = [];
  realProperties().forEach(({ id }) => keys.push(...propStorageKeys(id)));
  DB.delMany(keys);
  renderAdminView();
}
