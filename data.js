/* ═══════════════════════════════════════
   data.js — Stato, Storage, GitHub Sync
   Versione 1.1
═══════════════════════════════════════ */

/* ─── STATE ─────────────────────────────── */
let currentPropId = localStorage.getItem('octo_current_prop') || 'attico';
let calSources = [];
let bookTypes  = {};
let pastCache  = {};
let liveBooks     = [];
let nextYearBooks = [];   // prenotazioni anno prossimo (checkout >= 1 gen anno+1)
let sortSt     = { col:'checkin', dir:'asc' };
let editModeActive = false;

/* ─── Storage Key Helpers ─────────────────────────────── */
function skCals()  { return `octo_cals_${currentPropId}_v3`; }
function skTypes() { return `octo_types_${currentPropId}_v3`; }
function skPast()  { return `octo_past_${currentPropId}_v3`; }
function skFiscal(){ return `octo_fiscal_${currentPropId}_v3`; }
function skLive()      { return `octo_live_${currentPropId}_v3`; }
function skNextYear()  { return `octo_nextyear_${currentPropId}_v3`; }

function saveCals()   {
  const v = JSON.stringify(calSources);
  localStorage.setItem(skCals(), v);
  DB.save(skCals(), v);
}
function saveTypes()  {
  const v = JSON.stringify(bookTypes);
  localStorage.setItem(skTypes(), v);
  DB.save(skTypes(), v);
}
function savePast()   {
  const v = JSON.stringify(pastCache);
  localStorage.setItem(skPast(), v);
  DB.save(skPast(), v);
}
function saveLive() {
  if (currentPropId === 'admin' || currentPropId === 'confronto' || currentPropId === 'cerca') return;
  const v = JSON.stringify(liveBooks.map(serBook));
  localStorage.setItem(skLive(), v);
  DB.save(skLive(), v);
}
function saveNextYear() {
  if (currentPropId === 'admin' || currentPropId === 'confronto' || currentPropId === 'cerca') return;
  const v = JSON.stringify(nextYearBooks.map(serBook));
  localStorage.setItem(skNextYear(), v);
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
  localStorage.setItem(skFiscal(), v);
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
  const elGest = document.getElementById('fpGestione');
  if (elBk)   elBk.value    = d.bkComm  !== undefined ? d.bkComm  : '16';
  if (elAb)   elAb.value    = d.abComm  !== undefined ? d.abComm  : '15.5';
  if (elDir)  elDir.checked = d.inclDir !== undefined ? d.inclDir : false;
  if (elGest) elGest.value  = getGestione(currentPropId);
}

/* ─── Global Settings ─────────────────────────────── */
const SK_GLOBAL = 'octo_admin_global_v3';
function loadGlobalSettings() {
  try { return JSON.parse(localStorage.getItem(SK_GLOBAL) || '{}'); } catch(e) { return {}; }
}
function saveGlobalSettings(obj) {
  const v = JSON.stringify({ ...loadGlobalSettings(), ...obj });
  localStorage.setItem(SK_GLOBAL, v);
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
  const v = JSON.stringify({ ...loadSpese(), ...obj });
  localStorage.setItem(SK_SPESE, v);
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
function saveGestione(propId, val) {
  const cur = loadGestione();
  cur[propId] = parseFloat(val) || 0;
  const v = JSON.stringify(cur);
  localStorage.setItem(SK_GESTIONE, v);
  DB.save(SK_GESTIONE, v);
}
function getGestione(propId) {
  return parseFloat(loadGestione()[propId] ?? 0);
}

/* ─── Manual Bookings ─────────────────────────────── */
function skManual(propId) { return `octo_manual_${propId}_v3`; }
function loadManual(propId) {
  try { return JSON.parse(localStorage.getItem(skManual(propId)) || '[]'); } catch(e) { return []; }
}
function saveManual(propId, arr) {
  const v = JSON.stringify(arr);
  localStorage.setItem(skManual(propId), v);
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

/* ─── Price Overrides (sopravvivono al refresh del calendario) ─────────────────────────────── */
function skPriceOverrides(propId) { return `octo_priceov_${propId}_v3`; }
function loadPriceOverrides(propId) {
  try { return JSON.parse(localStorage.getItem(skPriceOverrides(propId)) || '{}'); } catch(e) { return {}; }
}
function setPriceOverride(propId, uid, value) {
  const d = loadPriceOverrides(propId);
  const v = String(value == null ? '' : value).trim();
  if (v === '') delete d[uid];
  else d[uid] = parseFloat(v);
  const json = JSON.stringify(d);
  localStorage.setItem(skPriceOverrides(propId), json);
  DB.save(skPriceOverrides(propId), json);
}

/* ─── Incasso Netto Overrides ─────────────────────────────── */
function skIncasso(propId) { return `octo_incasso_${propId}_v3`; }
function loadIncasso(propId) {
  try { return JSON.parse(localStorage.getItem(skIncasso(propId)) || '{}'); } catch(e) { return {}; }
}
function setIncassoEntry(propId, uid, value) {
  const d = loadIncasso(propId);
  const v = String(value).trim();
  if (v === '' || v === null) delete d[uid];
  else d[uid] = parseFloat(v) || 0;
  const json = JSON.stringify(d);
  localStorage.setItem(skIncasso(propId), json);
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
  const seen   = new Set();
  const result = [];
  liveBooks.forEach(b => {
    seen.add(b.uid);
    result.push({ ...b, isPast: !!(b.checkout && b.checkout <= TODAY) });
  });
  Object.values(pastCache).forEach(raw => {
    const b = deserBook(raw);
    if (!seen.has(b.uid)) {
      seen.add(b.uid);
      result.push({ ...b, isPast: true });
    }
  });
  // Include manual bookings for current property
  if (currentPropId && currentPropId !== 'admin' && currentPropId !== 'confronto' && currentPropId !== 'cerca') {
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
  const prop = PROPERTIES.find(p => p.id === currentPropId);
  return prop && !prop.allView && !prop.adminView && !prop.confrontoView;
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
function resetDB() {
  const prop = PROPERTIES.find(p => p.id === currentPropId);
  if (!confirm(`⚠️ Elimina TUTTI i dati di "${prop?.name || currentPropId}"?\n(calendari, tipologie, storico)\n\nConfermi?`)) return;
  localStorage.removeItem(skCals());
  localStorage.removeItem(skTypes());
  localStorage.removeItem(skPast());
  localStorage.removeItem(skLive());
  localStorage.removeItem(skManual(currentPropId));
  localStorage.removeItem(skIncasso(currentPropId));
  localStorage.removeItem(skPriceOverrides(currentPropId));
  calSources = []; bookTypes = {}; pastCache = {}; liveBooks = []; nextYearBooks = [];
  renderSidebar();
  renderAll();
  sbStatus('ok', 'Database resettato.');
}

function resetCurrentFromAdmin() {
  const last = localStorage.getItem('octo_current_prop') || 'attico';
  const prop = PROPERTIES.find(p => p.id === last);
  if (!confirm(`⚠️ Elimina TUTTI i dati di "${prop?.name || last}"?`)) return;
  localStorage.removeItem(`octo_cals_${last}_v3`);
  localStorage.removeItem(`octo_types_${last}_v3`);
  localStorage.removeItem(`octo_past_${last}_v3`);
  localStorage.removeItem(`octo_live_${last}_v3`);
  localStorage.removeItem(`octo_manual_${last}_v3`);
  localStorage.removeItem(`octo_incasso_${last}_v3`);
  localStorage.removeItem(`octo_priceov_${last}_v3`);
  renderAdminView();
}

function resetAllFromAdmin() {
  if (!confirm('⚠️ Elimina TUTTI i dati di TUTTI gli appartamenti?\n\nQuesta operazione è irreversibile.')) return;
  PROPERTIES.filter(p => !p.allView && !p.adminView && !p.confrontoView).forEach(({ id }) => {
    localStorage.removeItem(`octo_cals_${id}_v3`);
    localStorage.removeItem(`octo_types_${id}_v3`);
    localStorage.removeItem(`octo_past_${id}_v3`);
    localStorage.removeItem(`octo_live_${id}_v3`);
    localStorage.removeItem(`octo_manual_${id}_v3`);
    localStorage.removeItem(`octo_incasso_${id}_v3`);
    localStorage.removeItem(`octo_priceov_${id}_v3`);
  });
  renderAdminView();
}
