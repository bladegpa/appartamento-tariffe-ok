/* ═══════════════════════════════════════════════════════════════════════
   spese.js — Spese Operative Reali per Appartamento
   Versione 1.0

   Struttura entry:
   { uid, propId, data, tag, descrizione, importo, createdAt }

   Tag disponibili:
   Spese · Pulizie · Lavanderia · Condominio · Manutenzione · Tasse · Varie
═══════════════════════════════════════════════════════════════════════ */

const SPESE_TAGS = ['Spese','Pulizie','Lavanderia','Condominio','Manutenzione','Tasse','Affitto','Bombola','ENEL','Varie'];
const SPESE_TAG_COLORS = {
  Spese:'#4E9AF1', Pulizie:'#56C28A', Lavanderia:'#A67CF7',
  Condominio:'#F2A93B', Manutenzione:'#E05C7A', Tasse:'#FF6B6B', Affitto:'#B84228', Bombola:'#5DADE2', Varie:'#8A8A8A'
};

// Stato UI locale
let _speseFilterProp = 'all';
let _speseFilterTag  = 'all';
let _speseSelectedTag = SPESE_TAGS[0];

/* ── Storage key ── */
function skSpeseReali(year) {
  const y = year ?? viewYear;
  return (viewingArchive || y !== CURRENT_YEAR)
    ? `octo_arch_${y}_spese_reali_v3`
    : `octo_spese_reali_v3`;
}

function loadSpeseReali() {
  try { return JSON.parse(localStorage.getItem(skSpeseReali()) || '[]'); } catch(e) { return []; }
}
function saveSpeseReali(arr) {
  const v = JSON.stringify(arr);
  localStorage.setItem(skSpeseReali(), v);
  try { DB.save(skSpeseReali(), v); } catch(_){}
}

function addSpeseEntry(entry) {
  const arr = loadSpeseReali();
  arr.push({ ...entry, uid: 'sp_' + Date.now() + Math.random().toString(36).slice(2,6), createdAt: Date.now() });
  arr.sort((a,b) => (b.data||'').localeCompare(a.data||''));
  saveSpeseReali(arr);
}
function removeSpeseEntry(uid) {
  saveSpeseReali(loadSpeseReali().filter(e => e.uid !== uid));
}

/* ════════════════════════════════════════════════════════════════════
   ENTRY POINT
════════════════════════════════════════════════════════════════════ */
function renderSpeseView() {
  document.getElementById('statsWrap').style.display  = 'none';
  document.getElementById('resWrap').style.display    = 'none';
  document.getElementById('welcome').style.display    = 'none';
  const mp = document.getElementById('manualPanelWrap');  if (mp) mp.style.display = 'none';
  const iw = document.getElementById('incassoWidgetWrap'); if (iw) iw.style.display = 'none';
  const sc = document.getElementById('scIncassoCard');     if (sc) sc.style.display = 'none';
  const scO = document.getElementById('scOccCard');          if (scO) scO.style.display = 'none';
  const sr = document.getElementById('speseRealiWidgetWrap'); if (sr) sr.style.display = 'none';

  ['adminView','confrontoView','cercaView','graficiView','speseView'].forEach(id =>
    document.getElementById(id)?.remove()
  );

  _speseFilterProp = 'all';
  _speseFilterTag  = 'all';
  _speseSelectedTag = SPESE_TAGS[0];

  const mainC = document.getElementById('mainC');
  mainC.insertAdjacentHTML('beforeend', _buildSpeseHTML());
  _bindSpeseEvents();
}

/* ════════════════════════════════════════════════════════════════════
   HTML
════════════════════════════════════════════════════════════════════ */
function _buildSpeseHTML() {
  const realProps = PROPERTIES.filter(p =>
    !p.adminView && !p.confrontoView && !p.cercaView && !p.graficiView && !p.speseView
  );

  const propOpts = realProps.map(p =>
    `<option value="${p.id}">${p.icon} ${p.name}</option>`
  ).join('');

  const tagPills = SPESE_TAGS.map(t =>
    `<button class="spese-tag-pill${t === _speseSelectedTag ? ' sel' : ''}"
      onclick="_selectTag('${t}',this)" type="button">
      <span class="stag-dot stag-${t}"></span>${t}
    </button>`
  ).join('');

  const today = new Date().toISOString().split('T')[0];

  const archiveBadge = viewingArchive
    ? `<span class="gc-year-badge" style="margin-left:8px">📦 Archivio ${viewYear}</span>` : '';

  return `
  <div id="speseView" class="spese-view">

    <!-- Header -->
    <div class="spese-header">
      <div>
        <div class="gc-eyebrow">Gestionale costi</div>
        <div class="spese-title">🔧 Spese Reali${archiveBadge}</div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <button class="btn btn-gh btn-sm" onclick="exportSpeseCSV()">⬇ CSV Spese</button>
        ${viewingArchive ? '' : '<button class="btn btn-acc btn-sm" onclick="_scrollSpeseForm()">+ Aggiungi</button>'}
      </div>
    </div>

    <!-- KPI summary -->
    <div class="spese-kpi-row" id="speseKpiRow"></div>

    ${viewingArchive ? '' : `
    <!-- Form inserimento (in cima) -->
    <div class="spese-form-card" id="speseFormCard">
      <h3>➕ Aggiungi spesa</h3>
      <div class="spese-form-grid">
        <div>
          <div class="spese-form-label">Data</div>
          <input class="spese-form-input" type="date" id="spData" value="${today}">
        </div>
        <div>
          <div class="spese-form-label">Appartamento</div>
          <select class="spese-form-input" id="spProp">${propOpts}</select>
        </div>
        <div>
          <div class="spese-form-label">Descrizione</div>
          <input class="spese-form-input" type="text" id="spDesc" placeholder="Es: Pulizia mensile…">
        </div>
        <div>
          <div class="spese-form-label">Importo €</div>
          <input class="spese-form-input" type="number" id="spImporto" placeholder="0.00" step="0.01" min="0">
        </div>
        <div style="grid-column:1/-1">
          <div class="spese-form-label" style="margin-bottom:8px">Tag</div>
          <div class="spese-tag-pills">${tagPills}</div>
        </div>
        <div style="grid-column:1/-1;display:flex;justify-content:flex-end;gap:10px">
          <button class="btn btn-gh" type="button" onclick="_resetSpeseForm()">✕ Azzera</button>
          <button class="btn btn-acc" type="button" onclick="_submitSpeseForm()">✓ Salva spesa</button>
        </div>
      </div>
    </div>`}

    <!-- Filtri -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
      <div class="spese-filters" id="speseFilterProp">
        <button class="spese-filter-pill active" data-prop="all" onclick="_filterSpeseProp('all',this)">Tutti</button>
        ${realProps.map(p =>
          `<button class="spese-filter-pill" data-prop="${p.id}"
            onclick="_filterSpeseProp('${p.id}',this)">${p.icon} ${p.name}</button>`
        ).join('')}
      </div>
      <div class="spese-filters" id="speseFilterTag">
        <button class="spese-filter-pill active" data-tag="all" onclick="_filterSpeseTag('all',this)">Tutti i tag</button>
        ${SPESE_TAGS.map(t =>
          `<button class="spese-filter-pill" data-tag="${t}"
            onclick="_filterSpeseTag('${t}',this)">
            <span class="stag-dot stag-${t}"></span>${t}
          </button>`
        ).join('')}
      </div>
    </div>

    <!-- Lista spese -->
    <div class="spese-list-card" id="speseListCard">
      <div class="spese-list-hdr">
        <span class="spese-list-title" id="speseListTitle">Tutte le spese</span>
        <span class="spese-tot-badge" id="speseTotBadge"></span>
      </div>
      <div id="speseListBody"></div>
    </div>

  </div>`;
}

/* ════════════════════════════════════════════════════════════════════
   EVENTS & RENDER
════════════════════════════════════════════════════════════════════ */
function _bindSpeseEvents() {
  _renderSpeseList();
  _renderSpeseKpi();
}

function _selectTag(tag, btn) {
  _speseSelectedTag = tag;
  document.querySelectorAll('.spese-tag-pill').forEach(p => p.classList.remove('sel'));
  btn.classList.add('sel');
}

function _filterSpeseProp(prop, btn) {
  _speseFilterProp = prop;
  document.querySelectorAll('#speseFilterProp .spese-filter-pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  _renderSpeseList();
  _renderSpeseKpi();
}
function _filterSpeseTag(tag, btn) {
  _speseFilterTag = tag;
  document.querySelectorAll('#speseFilterTag .spese-filter-pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  _renderSpeseList();
  _renderSpeseKpi();
}

function _filteredSpese() {
  return loadSpeseReali().filter(e => {
    if (_speseFilterProp !== 'all' && e.propId !== _speseFilterProp) return false;
    if (_speseFilterTag  !== 'all' && e.tag    !== _speseFilterTag)  return false;
    return true;
  });
}

function _renderSpeseList() {
  const list  = _filteredSpese();
  const body  = document.getElementById('speseListBody');
  const title = document.getElementById('speseListTitle');
  const badge = document.getElementById('speseTotBadge');
  if (!body) return;

  const tot = list.reduce((s,e) => s + (parseFloat(e.importo)||0), 0);
  if (badge) badge.textContent = `Totale: €${tot.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}`;

  const filtLabel = [
    _speseFilterProp !== 'all' ? PROPERTIES.find(p=>p.id===_speseFilterProp)?.name : null,
    _speseFilterTag  !== 'all' ? _speseFilterTag : null,
  ].filter(Boolean).join(' · ') || 'Tutte le spese';
  if (title) title.textContent = filtLabel;

  if (!list.length) {
    body.innerHTML = `<div class="spese-empty">📭 Nessuna spesa registrata${_speseFilterProp!=='all'||_speseFilterTag!=='all'?' per i filtri selezionati':''}</div>`;
    return;
  }

  body.innerHTML = list.map(e => {
    const prop = PROPERTIES.find(p => p.id === e.propId);
    const tagColor = SPESE_TAG_COLORS[e.tag] || '#999';
    const canDel   = !viewingArchive;
    return `
    <div class="spese-entry" id="spe_${e.uid}">
      <span class="spese-entry-date">${_fmtSpeseDate(e.data)}</span>
      <span class="spese-entry-prop">${prop?.icon||''} ${prop?.name||e.propId}</span>
      <span class="spese-entry-tag" style="border-left:3px solid ${tagColor}">
        ${e.tag}
      </span>
      <span class="spese-entry-desc">${esc(e.descrizione||'—')}</span>
      <span class="spese-entry-amt">−€${parseFloat(e.importo||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
      ${canDel ? `<button class="spese-entry-del" onclick="_deleteSpeseEntry('${e.uid}')" title="Elimina">✕</button>` : ''}
    </div>`;
  }).join('');
}

function _renderSpeseKpi() {
  const row = document.getElementById('speseKpiRow');
  if (!row) return;

  const all  = loadSpeseReali();

  // KPI: totale, per tag, per prop
  const totAll = all.reduce((s,e) => s + (parseFloat(e.importo)||0), 0);

  const byTag = {};
  SPESE_TAGS.forEach(t => byTag[t] = 0);
  all.forEach(e => { byTag[e.tag] = (byTag[e.tag]||0) + (parseFloat(e.importo)||0); });

  const topTag  = Object.entries(byTag).sort((a,b)=>b[1]-a[1])[0];
  const n       = all.length;
  const media   = n > 0 ? totAll / n : 0;

  const fmt = v => '€' + v.toLocaleString('it-IT',{minimumFractionDigits:0,maximumFractionDigits:0});

  row.innerHTML = [
    { ico:'💸', lbl:'Totale spese', val:fmt(totAll), sub:`${n} voci registrate` },
    { ico:'📌', lbl:'Categoria top', val:topTag?.[0]||'—', sub:topTag?fmt(topTag[1]):'', color: topTag?SPESE_TAG_COLORS[topTag[0]]:undefined },
    { ico:'📊', lbl:'Media per voce', val:fmt(media), sub:'importo medio' },
  ].map(k => `
    <div class="spese-kpi">
      <div style="font-size:20px;margin-bottom:4px">${k.ico}</div>
      <div class="spese-kpi-val" ${k.color?`style="color:${k.color}"`:''}>${k.val}</div>
      <div class="spese-kpi-lbl">${k.lbl}</div>
      ${k.sub ? `<div style="font-size:10px;color:var(--ink2);margin-top:2px">${k.sub}</div>` : ''}
    </div>`).join('');
}

function _fmtSpeseDate(d) {
  if (!d) return '—';
  const [y,m,dd] = d.split('-');
  return `${dd}/${m}/${y}`;
}

function _deleteSpeseEntry(uid) {
  if (!confirm('Eliminare questa voce di spesa?')) return;
  removeSpeseEntry(uid);
  _renderSpeseList();
  _renderSpeseKpi();
}

function _submitSpeseForm() {
  const data    = document.getElementById('spData')?.value?.trim();
  const propId  = document.getElementById('spProp')?.value?.trim();
  const desc    = document.getElementById('spDesc')?.value?.trim();
  const importo = parseFloat(document.getElementById('spImporto')?.value);

  if (!data)              { alert('Inserisci una data.'); return; }
  if (!propId)            { alert('Seleziona un appartamento.'); return; }
  if (!_speseSelectedTag) { alert('Seleziona un tag.'); return; }
  if (isNaN(importo) || importo <= 0) { alert('Inserisci un importo valido.'); return; }

  addSpeseEntry({ data, propId, tag: _speseSelectedTag, descrizione: desc||'', importo });
  _renderSpeseList();
  _renderSpeseKpi();

  // Reset form (keep date and prop, reset desc/importo)
  const descEl = document.getElementById('spDesc');
  const impEl  = document.getElementById('spImporto');
  if (descEl) descEl.value = '';
  if (impEl)  impEl.value  = '';

  // Flash feedback
  const btn = document.querySelector('#speseFormCard .btn-acc');
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '✓ Salvata!';
    btn.style.background = '#2A9A62';
    setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 1200);
  }
}

function _resetSpeseForm() {
  const today = new Date().toISOString().split('T')[0];
  const di = document.getElementById('spData');    if(di) di.value = today;
  const de = document.getElementById('spDesc');    if(de) de.value = '';
  const ii = document.getElementById('spImporto'); if(ii) ii.value = '';
  // Reset tag pills
  _speseSelectedTag = SPESE_TAGS[0];
  document.querySelectorAll('.spese-tag-pill').forEach((p,i) => {
    p.classList.toggle('sel', i===0);
  });
}

function _scrollSpeseForm() {
  document.getElementById('speseFormCard')?.scrollIntoView({ behavior:'smooth', block:'start' });
}

/* ── Escape HTML ── */
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ════════════════════════════════════════════════════════════════════
   EXPORT CSV SPESE
════════════════════════════════════════════════════════════════════ */
function exportSpeseCSV() {
  const list = _filteredSpese();
  if (!list.length) { alert('Nessuna spesa da esportare.'); return; }
  const header = ['Data','Appartamento','Tag','Descrizione','Importo'];
  const rows   = list.map(e => {
    const prop = PROPERTIES.find(p=>p.id===e.propId);
    return [e.data, prop?.name||e.propId, e.tag, e.descrizione||'', parseFloat(e.importo||0).toFixed(2)];
  });
  const csv = [header, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(';'))
    .join('\n');
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8'});
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url, download: `spese_${viewYear}.csv`
  });
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
}
