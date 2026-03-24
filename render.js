/* ═══════════════════════════════════════
   render.js — Rendering: Tabella, Stats, Sidebar
   Versione 1.1
═══════════════════════════════════════ */

/* ─── Utility ─────────────────────────────── */
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtDate(d) {
  if (!d) return '';
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
}
function genId() { return Math.random().toString(36).slice(2, 9); }
function dl(b, n) {
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: n });
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 100);
}
function ds() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

/* ─── Validation ─────────────────────────────── */
function runValidation(books) {
  books.forEach(b => { b.warnings = []; });
  const real = books
    .filter(b => b.source !== 'blocked' && b.checkin && !b.isPast)
    .sort((a, b) => a.checkin - b.checkin);
  for (let i = 0; i < real.length - 1; i++) {
    const a = real[i], nx = real[i+1];
    if (a.checkout && nx.checkin && a.checkout > nx.checkin) {
      a.warnings.push(`Sovrapposizione con ${nx.nome}`);
      nx.warnings.push(`Sovrapposizione con ${a.nome}`);
    }
  }
}

/* ─── Gap Rows (Sabato → Sabato) ─────────────────────────────── */
function buildGapRows(fromDate, toDate) {
  if (!fromDate || !toDate) return [];
  const rows  = [];
  const gapMs = toDate - fromDate;
  if (gapMs <= 0) return [];

  // Trova il primo sabato >= fromDate
  let cursor = new Date(fromDate);
  cursor.setHours(0, 0, 0, 0);
  const daysToSat = (6 - cursor.getDay() + 7) % 7;
  cursor.setDate(cursor.getDate() + daysToSat);

  // Se il primo sabato è già >= toDate → singola riga parziale
  if (cursor >= toDate) {
    const nights = Math.round(gapMs / 86400000);
    if (nights > 0) {
      rows.push({ type:'gap', from:new Date(fromDate), to:new Date(toDate),
        fromStr:fmtDate(fromDate), toStr:fmtDate(toDate), nights, full:false });
    }
    return rows;
  }

  // Genera righe Sab→Sab
  while (cursor < toDate) {
    const next = new Date(cursor);
    next.setDate(next.getDate() + 7);
    const end    = next <= toDate ? next : new Date(toDate);
    const nights = Math.round((end - cursor) / 86400000);
    if (nights > 0) {
      rows.push({ type:'gap', from:new Date(cursor), to:new Date(end),
        fromStr:fmtDate(cursor), toStr:fmtDate(end), nights, full: nights === 7 });
    }
    cursor = next;
  }
  return rows;
}

/* ─── RenderAll ─────────────────────────────── */
function renderAll() {
  const all  = getMergedBookings();
  runValidation(all);
  const real = all.filter(b => b.source !== 'blocked');
  saveLive();
  const show = real.length > 0;

  document.getElementById('welcome').style.display   = show ? 'none' : '';
  document.getElementById('statsWrap').style.display  = show ? '' : 'none';
  document.getElementById('resWrap').style.display    = show ? '' : 'none';

  const btnEM = document.getElementById('btnEditMode');
  if (btnEM) {
    btnEM.style.display = currentPropHasEditMode() ? '' : 'none';
    btnEM.classList.toggle('btn-acc', editModeActive);
    btnEM.classList.toggle('btn-gh',  !editModeActive);
    btnEM.innerHTML = editModeActive ? '✏️ Modifica ON' : '✏️ Attiva modifica';
  }

  if (show) {
    renderStats(real);
    renderTable(all);
    renderOverlaps(all);
  }

  // Ripristina visibilità pannelli appartamento (potevano essere nascosti da confronto/tutti)
  const mp = document.getElementById('manualPanelWrap');  if (mp) mp.style.display = '';
  const scI = document.getElementById('scIncassoCard');   if (scI) scI.style.display = '';
  const scO = document.getElementById('scOccCard');       if (scO) scO.style.display = '';
  const srw = document.getElementById('speseRealiWidgetWrap'); if (srw) srw.style.display = '';
  const nyp = document.getElementById('nextYearPanelWrap'); if (nyp) nyp.style.display = '';
  const occ = document.getElementById('occWidget'); if (occ) occ.style.display = '';
  // Aggiorna widget incasso nella riga stats
  updateIncassoStat(real);
  renderManualPanel();
  renderNextYearPanel();
  renderSpeseRealiWidget();
  renderOccupazioneWidget();
}

/* ─── Incasso Netto — aggiorna solo il widget stat ─────────────────────────────── */
function updateIncassoStat(real) {
  const propId  = currentPropId;
  const fiscal  = JSON.parse(localStorage.getItem(`octo_fiscal_${propId}_v3`) || '{}');
  const bkComm  = parseFloat(fiscal.bkComm  ?? 16)   / 100;
  const abComm  = parseFloat(fiscal.abComm  ?? 15.5) / 100;
  const inclDir = fiscal.inclDir ?? false;
  const isForf  = (fiscal.regime ?? 'cedolare') === 'forfettario';
  const IVA = 0.22, FEE_PAG = 0.015, CED_ALI = 0.21, COEFF = 0.40, IRPEF = 0.05, INPS = 0.2448;

  // Soglia cedolare per Villa e Corso (sul valore tasse, non lordo):
  // – fino alla soglia: cedolare già coperta dal canone concordato → guadagno (non detrarre)
  // – oltre la soglia: solo l'eccedenza è un costo reale
  const THRESHOLD_MAP = { villa: 1134, corso: 1285.2 };
  const threshold = THRESHOLD_MAP[propId] || 0;

  // Spese Reali registrate per questo appartamento
  let speseRealiTot = 0;
  try {
    const sr = JSON.parse(localStorage.getItem('octo_spese_reali_v3') || '[]');
    speseRealiTot = sr.filter(e => e.propId === propId).reduce((s,e) => s + (parseFloat(e.importo)||0), 0);
  } catch(e) {}

  let totLordo = 0, totComm = 0, totTasse = 0, nPast = 0;

  real.filter(b => b.isPast && b.prezzo !== null).forEach(b => {
    const bt = bookTypes[b.uid] || b._bookType || '';
    const p  = b.prezzo;

    let comm = 0, nettoComm = null;
    if (bt === 'booking') {
      comm = p * bkComm + p * FEE_PAG + p * bkComm * IVA;
      nettoComm = p - comm;
    } else if (bt === 'airbnb') {
      comm = p * abComm + p * abComm * IVA;
      nettoComm = p - comm;
    } else if (bt === 'diretta') {
      comm = 0;
      nettoComm = p;
    }
    if (nettoComm === null) return;

    let tax = 0;
    if (isForf) {
      tax = p * COEFF * (IRPEF + INPS);
    } else {
      const isOTA = bt === 'booking' || bt === 'airbnb';
      if (isOTA || (bt === 'diretta' && inclDir)) tax = p * CED_ALI;
    }

    totLordo += p;
    totComm  += comm;
    totTasse += tax;
    nPast++;
  });

  // ── Aggiustamento soglia cedolare (Villa / Corso) ──────────────────
  let taxGain = 0, taxCost = 0;
  if (!isForf && threshold > 0) {
    taxGain = Math.min(totTasse, threshold);    // coperto dal regime → guadagno
    taxCost = Math.max(0, totTasse - threshold); // eccedenza → costo reale
  } else {
    taxCost = totTasse;
  }

  const totNetto       = totLordo - totComm - taxCost;
  const nettoDopoSpese = totNetto - speseRealiTot;

  const el = document.getElementById('sIncasso');
  if (el) el.textContent = nPast > 0 ? `€${nettoDopoSpese.toFixed(0)}` : '—';

  // Breakdown sotto il valore
  const card = document.getElementById('scIncassoCard');
  if (!card) return;
  let bk = card.querySelector('.incasso-breakdown');
  if (!bk) {
    bk = document.createElement('div');
    bk.className = 'incasso-breakdown';
    bk.style.cssText = 'font-size:9.5px;color:var(--ink2);margin-top:6px;line-height:1.75;border-top:1px solid var(--bdr);padding-top:5px;text-align:left';
    card.appendChild(bk);
  }
  if (nPast > 0) {
    const taxLbl = isForf ? `Forf.(${(COEFF*(IRPEF+INPS)*100).toFixed(1)}%)` : `Ced.${(CED_ALI*100).toFixed(0)}%`;

    let tasseRow = '';
    if (!isForf && threshold > 0) {
      // Mostra guadagno e costo separati
      if (taxGain > 0 && taxCost === 0) {
        // tutto coperto dal regime
        tasseRow =
          `<div>🏛 Tasse lorde (${taxLbl}): €${totTasse.toFixed(0)}</div>` +
          `<div style="color:#145C38">✅ Tutto coperto dal regime concordato (+€${taxGain.toFixed(0)} guadagno)</div>`;
      } else if (taxGain > 0 && taxCost > 0) {
        // parzialmente coperto
        tasseRow =
          `<div>🏛 Tasse lorde (${taxLbl}): €${totTasse.toFixed(0)}</div>` +
          `<div style="color:#145C38">&nbsp;&nbsp;✅ Coperto regime: <b>+€${taxGain.toFixed(0)}</b></div>` +
          `<div>&nbsp;&nbsp;🔺 Eccedenza (costo): <span style="color:#C0392B">−€${taxCost.toFixed(0)}</span></div>`;
      } else {
        tasseRow = `<div>🏛 Tasse (${taxLbl}): <span style="color:#C0392B">−€${taxCost.toFixed(0)}</span></div>`;
      }
    } else {
      tasseRow = `<div>🏛 Tasse (${taxLbl}): <span style="color:#C0392B">−€${taxCost.toFixed(0)}</span></div>`;
    }

    const speseRow = speseRealiTot > 0
      ? `<div>🔧 Spese reali: <span style="color:#C0392B">−€${speseRealiTot.toFixed(0)}</span></div>`
      : '';

    bk.innerHTML =
      `<div style="font-weight:600;margin-bottom:2px">${nPast} prenot. passate</div>` +
      `<div>🟢 Lordo: <b>€${totLordo.toFixed(0)}</b></div>` +
      `<div>📘🌸 Comm.: <span style="color:#C0392B">−€${totComm.toFixed(0)}</span></div>` +
      tasseRow +
      speseRow;
  } else {
    bk.innerHTML = '';
  }
}

/* ─── Manual Bookings Panel (per ogni appartamento) ─────────────────────────────── */
function _tsToInput(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function propAddManual() {
  const propId = currentPropId;
  const ci = document.getElementById('mpf_ci')?.value;
  const co = document.getElementById('mpf_co')?.value;
  const nm = (document.getElementById('mpf_nm')?.value || '').trim() || '—';
  const pr = document.getElementById('mpf_pr')?.value;
  const tg = document.getElementById('mpf_tg')?.value || 'diretta';
  if (!ci || !co) { alert('Inserisci date check-in e check-out.'); return; }
  const checkin  = new Date(ci); checkin.setHours(0,0,0,0);
  const checkout = new Date(co); checkout.setHours(0,0,0,0);
  if (checkout <= checkin) { alert('Il check-out deve essere dopo il check-in.'); return; }
  addManualEntry(propId, {
    nome: nm,
    checkin:  checkin.getTime(),
    checkout: checkout.getTime(),
    notti: Math.round((checkout - checkin) / 86400000),
    prezzo: pr !== '' && pr != null ? parseFloat(pr) : null,
    bookType: tg,
  });
  renderAll();
}

function propRemoveManual(uid) {
  if (!confirm('Rimuovere questa prenotazione manuale?')) return;
  removeManualEntry(currentPropId, uid);
  renderAll();
}

function propEditManualField(uid, field, value) {
  const propId = currentPropId;
  const fields = {};
  if (field === 'nome')    { fields.nome    = value.trim() || '—'; }
  if (field === 'prezzo')  { fields.prezzo  = value !== '' ? parseFloat(value) : null; }
  if (field === 'bookType'){ fields.bookType = value; }
  if (field === 'checkin' || field === 'checkout') {
    if (!value) return;
    const d = new Date(value); d.setHours(0,0,0,0);
    fields[field] = d.getTime();
    const arr   = loadManual(propId);
    const entry = arr.find(e => e.uid === uid);
    if (entry) {
      const ci = field === 'checkin'  ? d.getTime() : entry.checkin;
      const co = field === 'checkout' ? d.getTime() : entry.checkout;
      if (ci && co && co > ci) fields.notti = Math.round((co - ci) / 86400000);
    }
  }
  updateManualEntry(propId, uid, fields);
  renderAll();
}

function renderManualPanel() {
  const wrapId = 'manualPanelWrap';
  let wrap = document.getElementById(wrapId);
  const mainC = document.getElementById('mainC');
  if (!mainC) return;

  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = wrapId;
    mainC.appendChild(wrap);
  }

  const propId  = currentPropId;
  const entries = loadManual(propId);

  const tagOpts = (sel) => ['booking','airbnb','diretta'].map(t =>
    `<option value="${t}" ${sel===t?'selected':''}>${t==='booking'?'📘 Booking':t==='airbnb'?'🌸 AirBnB':'🟢 Diretta'}</option>`
  ).join('');

  const rows = entries.map(e => {
    return `<tr>
      <td style="padding:3px 4px">
        <input type="date" value="${_tsToInput(e.checkin)}"
          style="border:1px solid var(--bdr);border-radius:4px;padding:2px 5px;font-size:10px;background:var(--bg);color:var(--ink)"
          onchange="propEditManualField('${e.uid}','checkin',this.value)">
      </td>
      <td style="padding:3px 4px">
        <input type="date" value="${_tsToInput(e.checkout)}"
          style="border:1px solid var(--bdr);border-radius:4px;padding:2px 5px;font-size:10px;background:var(--bg);color:var(--ink)"
          onchange="propEditManualField('${e.uid}','checkout',this.value)">
      </td>
      <td style="padding:3px 4px">
        <input type="text" value="${esc(e.nome)}"
          style="border:1px solid var(--bdr);border-radius:4px;padding:2px 6px;font-size:11px;width:100px;background:var(--bg);color:var(--ink)"
          onblur="propEditManualField('${e.uid}','nome',this.value)">
      </td>
      <td style="text-align:center;padding:3px 4px;font-size:11px;opacity:.5">${e.notti||'—'}</td>
      <td style="padding:3px 4px">
        <div style="display:flex;align-items:center;gap:2px">
          <span style="font-size:10px;opacity:.5">€</span>
          <input type="number" value="${e.prezzo!=null?e.prezzo:''}" placeholder="—"
            style="border:1px solid var(--bdr);border-radius:4px;padding:2px 5px;font-size:11px;width:72px;text-align:right;background:var(--bg);color:var(--ink)"
            onblur="propEditManualField('${e.uid}','prezzo',this.value)">
        </div>
      </td>
      <td style="padding:3px 4px">
        <select style="border:1px solid var(--bdr);border-radius:4px;padding:2px 5px;font-size:10px;background:var(--bg);color:var(--ink)"
          onchange="propEditManualField('${e.uid}','bookType',this.value)">
          ${tagOpts(e.bookType||'diretta')}
        </select>
      </td>
      <td style="padding:3px 4px">
        <button onclick="propRemoveManual('${e.uid}')"
          style="border:none;background:rgba(192,57,43,.12);color:#C0392B;border-radius:4px;padding:2px 8px;cursor:pointer;font-size:11px;font-weight:700">✕</button>
      </td>
    </tr>`;
  }).join('');

  const totalPrezzo = entries.reduce((s, e) => s + (e.prezzo || 0), 0);

  wrap.innerHTML = `
    <div style="margin-top:16px;border:1px solid var(--bdr);border-radius:10px;overflow:hidden">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:var(--bg2,#F7F5F2);border-bottom:1px solid var(--bdr)">
        <span style="font-size:12px;font-weight:700;color:var(--ink)">✏️ Prenotazioni Manuali
          <span style="font-size:10px;font-weight:400;opacity:.5;margin-left:6px">${entries.length} voce${entries.length!==1?'i':''}</span>
        </span>
        ${totalPrezzo > 0 ? `<span style="font-size:12px;font-weight:700;color:#145C38">€${totalPrezzo.toFixed(0)}</span>` : ''}
      </div>
      ${entries.length > 0 ? `
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse">
          <thead><tr style="border-bottom:1px solid var(--bdr);background:var(--bg)">
            <th style="text-align:left;padding:5px 4px;font-size:10px;opacity:.5;font-weight:600">Check-in</th>
            <th style="text-align:left;padding:5px 4px;font-size:10px;opacity:.5;font-weight:600">Check-out</th>
            <th style="text-align:left;padding:5px 4px;font-size:10px;opacity:.5;font-weight:600">Nome</th>
            <th style="text-align:center;padding:5px 4px;font-size:10px;opacity:.5;font-weight:600">Nn</th>
            <th style="text-align:right;padding:5px 4px;font-size:10px;opacity:.5;font-weight:600">€</th>
            <th style="padding:5px 4px;font-size:10px;opacity:.5;font-weight:600">Canale</th>
            <th></th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>` : '<div style="padding:10px 14px;font-size:11px;opacity:.5">Nessuna prenotazione manuale.</div>'}
      <!-- Form aggiunta -->
      <div style="padding:10px 14px;border-top:1px solid var(--bdr);display:flex;flex-wrap:wrap;gap:6px;align-items:flex-end">
        <div><div style="font-size:9px;opacity:.5;margin-bottom:2px">Check-in</div>
          <input type="date" id="mpf_ci"
            style="border:1px solid var(--bdr);border-radius:5px;padding:4px 6px;font-size:11px;background:var(--bg);color:var(--ink)"></div>
        <div><div style="font-size:9px;opacity:.5;margin-bottom:2px">Check-out</div>
          <input type="date" id="mpf_co"
            style="border:1px solid var(--bdr);border-radius:5px;padding:4px 6px;font-size:11px;background:var(--bg);color:var(--ink)"></div>
        <div><div style="font-size:9px;opacity:.5;margin-bottom:2px">Nome ospite</div>
          <input type="text" id="mpf_nm" placeholder="Cognome"
            style="border:1px solid var(--bdr);border-radius:5px;padding:4px 7px;font-size:11px;width:100px;background:var(--bg);color:var(--ink)"></div>
        <div><div style="font-size:9px;opacity:.5;margin-bottom:2px">€ Prezzo</div>
          <input type="number" id="mpf_pr" min="0" step="1" placeholder="0"
            style="border:1px solid var(--bdr);border-radius:5px;padding:4px 6px;font-size:11px;width:72px;background:var(--bg);color:var(--ink)"></div>
        <div><div style="font-size:9px;opacity:.5;margin-bottom:2px">Canale</div>
          <select id="mpf_tg"
            style="border:1px solid var(--bdr);border-radius:5px;padding:4px 6px;font-size:11px;background:var(--bg);color:var(--ink)">
            <option value="booking">📘 Booking</option>
            <option value="airbnb">🌸 AirBnB</option>
            <option value="diretta" selected>🟢 Diretta</option>
          </select></div>
        <button onclick="propAddManual()"
          style="background:var(--acc);color:#fff;border:none;border-radius:6px;padding:6px 14px;font-size:11px;font-weight:700;cursor:pointer">
          + Aggiungi
        </button>
      </div>
    </div>`;
}

function currentPropHasData() {
  return (liveBooks.length > 0 || Object.keys(pastCache).length > 0);
}


/* ─── Stats Cards ─────────────────────────────── */
function renderStats(real) {
  const future = real.filter(b => !b.isPast);
  const n      = real.length;
  const nights = future.reduce((s, b) => s + (b.notti || 0), 0);
  const withP  = real.filter(b => b.prezzo !== null);
  const rev    = withP.reduce((s, b) => s + b.prezzo, 0);
  const avg    = withP.length ? rev / withP.length : 0;

  const tc = {};
  real.forEach(b => { const t = bookTypes[b.uid]; if (t) tc[t] = (tc[t] || 0) + 1; });
  const tyHTML = Object.entries(tc).map(([t, c]) =>
    `<span style="color:var(--${t==='booking'?'bk':t==='airbnb'?'ab':'di'}-txt);font-weight:700">${c} ${t}</span>`
  ).join('<br>') || '<span style="opacity:.4">—</span>';

  document.getElementById('sN').textContent  = n;
  document.getElementById('sNi').textContent = nights;
  document.getElementById('sR').textContent  = rev > 0 ? `€${rev.toFixed(0)}` : '—';
  document.getElementById('sRA').textContent = withP.length ? `media €${avg.toFixed(0)}` : '—';
  document.getElementById('sTy').innerHTML   = tyHTML;

  const dates = real.filter(b => !b.isPast).map(b => b.checkin).filter(Boolean).sort((a, b) => a - b);
  document.getElementById('sPer').textContent = dates.length >= 2
    ? `${fmtDate(dates[0])} → ${fmtDate(dates[dates.length-1])}`
    : dates.length === 1 ? fmtDate(dates[0]) : '—';

  // Inietta card Incasso Netto nella riga stats se non esiste già
  const statsRow = document.querySelector('.stats');
  if (statsRow && !document.getElementById('scIncassoCard')) {
    const card = document.createElement('div');
    card.className = 'sc sc-netto';
    card.id = 'scIncassoCard';
    card.innerHTML = `<div class="sc-lbl">💰 CASSA OGGI</div>
      <div class="sc-val" id="sIncasso" style="color:#145C38">—</div>
      <div class="sc-sub">prenotazioni incassate</div>`;
    statsRow.appendChild(card);
  }
  if (statsRow && !document.getElementById('scOccCard')) {
    const oCard = document.createElement('div');
    oCard.className = 'sc';
    oCard.id = 'scOccCard';
    oCard.innerHTML = `<div class="sc-lbl">📊 OCC. · RevPAR</div>
      <div class="sc-val" id="sOccPct" style="font-size:18px">—</div>
      <div class="sc-sub" id="sRevPAR">RevPAR —</div>
      <div class="sc-sub" id="sNetRevPAR" style="color:#2AAF6A;font-weight:600">Net —</div>`;
    statsRow.appendChild(oCard);
  }

  recalcFiscal();
}

/* ─── Spese Reali Widget (per scheda appartamento) ─────────────────────────────── */
function renderSpeseRealiWidget() {
  const wrap = document.getElementById('speseRealiWidgetWrap');
  if (!wrap) return;

  const propId = currentPropId;
  // Carica spese reali per questa proprietà, anno corrente
  let speseAll = [];
  try { speseAll = JSON.parse(localStorage.getItem('octo_spese_reali_v3') || '[]'); } catch(e) {}
  const propSpese = speseAll.filter(e => e.propId === propId);

  if (!propSpese.length) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }
  wrap.style.display = '';

  const tagColors = {
    Spese:'#4E9AF1', Pulizie:'#56C28A', Lavanderia:'#A67CF7',
    Condominio:'#F2A93B', Manutenzione:'#E05C7A', Tasse:'#FF6B6B', Varie:'#8A8A8A'
  };

  // Raggruppa per tag
  const byTag = {};
  propSpese.forEach(e => {
    byTag[e.tag] = (byTag[e.tag] || 0) + (parseFloat(e.importo) || 0);
  });
  const totale = propSpese.reduce((s,e) => s + (parseFloat(e.importo)||0), 0);

  const tagRows = Object.entries(byTag)
    .sort((a,b) => b[1]-a[1])
    .map(([tag, imp]) => {
      const col = tagColors[tag] || '#999';
      return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid var(--bg2)">
        <span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${col};flex-shrink:0"></span>
        <span style="flex:1;font-size:10px;color:var(--ink2)">${tag}</span>
        <span style="font-size:11px;font-weight:700;color:#C03020">−€${imp.toLocaleString('it-IT',{minimumFractionDigits:0,maximumFractionDigits:0})}</span>
      </div>`;
    }).join('');

  // Ultime 3 voci
  const recenti = [...propSpese].sort((a,b)=>(b.data||'').localeCompare(a.data||'')).slice(0,3);
  const recentiRows = recenti.map(e => {
    const [y,m,dd] = (e.data||'').split('-');
    const dateStr = dd && m ? `${dd}/${m}` : '—';
    const col = tagColors[e.tag] || '#999';
    return `<div style="display:flex;align-items:center;gap:5px;padding:2px 0;font-size:10px">
      <span style="color:var(--ink2);min-width:30px">${dateStr}</span>
      <span style="flex:1;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.descrizione||e.tag}</span>
      <span style="font-weight:700;color:#C03020;white-space:nowrap">−€${parseFloat(e.importo||0).toLocaleString('it-IT',{minimumFractionDigits:0,maximumFractionDigits:0})}</span>
    </div>`;
  }).join('');

  wrap.innerHTML = `
    <div style="background:var(--surf);border:1px solid var(--bdr);border-radius:12px;padding:14px 16px;margin-top:8px;box-shadow:var(--sh)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="font-size:11px;font-weight:700;color:var(--ink)">🔧 Spese Reali registrate</div>
        <div style="font-family:'Fraunces',serif;font-size:15px;font-weight:700;color:#C03020">
          −€${totale.toLocaleString('it-IT',{minimumFractionDigits:0,maximumFractionDigits:0})}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.7px;font-weight:700;color:var(--ink2);margin-bottom:6px">Per categoria</div>
          ${tagRows}
          <div style="margin-top:6px;font-size:10px;color:var(--ink2)">${propSpese.length} voci totali</div>
        </div>
        <div>
          <div style="font-size:9px;text-transform:uppercase;letter-spacing:.7px;font-weight:700;color:var(--ink2);margin-bottom:6px">Ultime registrate</div>
          ${recentiRows}
          <div style="margin-top:8px">
            <button class="btn btn-gh btn-sm" onclick="switchProp('spese')" style="width:100%;font-size:10px">
              → Vedi tutte le spese
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

/* ─── Next Year Bookings Panel ─────────────────────────────── */
function renderNextYearPanel() {
  const wrapId = 'nextYearPanelWrap';
  let wrap = document.getElementById(wrapId);
  const mainC = document.getElementById('mainC');
  if (!mainC) return;

  if (!wrap) {
    wrap = document.createElement('div');
    wrap.id = wrapId;
    // Insert before speseRealiWidgetWrap or append
    const srw = document.getElementById('speseRealiWidgetWrap');
    if (srw) mainC.insertBefore(wrap, srw);
    else mainC.appendChild(wrap);
  }

  const books = nextYearBooks.filter(b => b.source !== 'blocked');
  if (!books.length) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }
  wrap.style.display = '';

  const ny = CURRENT_YEAR + 1;
  books.sort((a,b) => (a.checkin||0) - (b.checkin||0));

  const rows = books.map(b => {
    const bt = bookTypes[b.uid] || b._bookType || '—';
    const srcIco = bt==='airbnb'?'🌸':bt==='booking'?'📘':bt==='diretta'?'🟢':'⬜';
    const prz = b.prezzo != null ? `€${b.prezzo}` : '—';
    return `<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--bg2);font-size:11px">
      <span style="min-width:16px">${srcIco}</span>
      <span style="flex:1;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${b.nome||'—'}</span>
      <span style="color:var(--ink2);white-space:nowrap">${fmtDate(b.checkin)} → ${fmtDate(b.checkout)}</span>
      <span style="font-weight:700;color:#145C38;white-space:nowrap">${prz}</span>
      <span style="color:var(--ink2)">${b.notti||'?'} gg</span>
    </div>`;
  }).join('');

  const totLordo = books.reduce((s,b) => s + (b.prezzo||0), 0);

  wrap.innerHTML = `
    <div style="background:var(--surf);border:1.5px dashed var(--acc);border-radius:12px;padding:14px 16px;margin-top:8px;box-shadow:var(--sh)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--ink)">📅 Prenotazioni ${ny}</div>
          <div style="font-size:9.5px;color:var(--ink2);margin-top:2px">${books.length} pren. · caricate al 1° gennaio ${ny}</div>
        </div>
        <div style="text-align:right">
          <div style="font-family:'Fraunces',serif;font-size:15px;font-weight:700;color:var(--acc)">€${Math.round(totLordo).toLocaleString('it-IT')}</div>
          <div style="font-size:10px;color:var(--ink2)">lordo previsto</div>
        </div>
      </div>
      <div>${rows}</div>
    </div>`;
}

/* ─── Fiscal Regime Toggle ─────────────────────────────── */
function setRegime(regime, save = true) {
  const isCed  = regime === 'cedolare';
  const btnCed = document.getElementById('btnCedolare');
  const btnFor = document.getElementById('btnForfettario');
  const detCed = document.getElementById('fpCedDetails');
  const detFor = document.getElementById('fpForfDetails');
  const taxCard= document.getElementById('scTaxCard');
  const taxLbl = document.getElementById('scTaxLbl');
  const cedVal = document.getElementById('sCed');

  if (btnCed) btnCed.classList.toggle('active', isCed);
  if (btnFor) btnFor.classList.toggle('active', !isCed);
  if (detCed) detCed.style.display = isCed  ? '' : 'none';
  if (detFor) detFor.style.display = !isCed ? '' : 'none';

  if (taxCard) taxCard.className = isCed ? 'sc sc-cedolare' : 'sc sc-forfettario';
  if (taxLbl)  taxLbl.innerHTML  = isCed
    ? 'Cedolare secca <span style="font-size:9px;opacity:.6">(21%)</span>'
    : 'Tasse forfettario <span style="font-size:9px;opacity:.6">(5%+INPS)</span>';
  if (cedVal)  cedVal.style.color = isCed ? '#B86010' : '#7B3FC4';

  if (save) { saveFiscal(); recalcFiscal(); } else recalcFiscal();
}

/* ─── Fiscal Recalculation ─────────────────────────────── */
function recalcFiscal() {
  // Usa TUTTE le prenotazioni dell'anno (past+future) per coerenza con scheda Confronto
  const all = getMergedBookings().filter(b => b.source !== 'blocked' && b.prezzo !== null);

  const bkComm  = parseFloat(document.getElementById('fpBkComm')?.value  || 16)   / 100;
  const abComm  = parseFloat(document.getElementById('fpAbComm')?.value  || 15.5) / 100;
  const inclDir = document.getElementById('fpCedDiretta')?.checked || false;
  const isForf  = document.getElementById('btnForfettario')?.classList.contains('active') || false;

  const IVA       = 0.22;
  const FEE_PAG   = 0.015;
  const CED_ALI   = 0.21;
  const COEFF     = 0.40;
  const IRPEF     = 0.05;
  const INPS      = 0.2448;

  let taxBase    = 0;
  let nettoLordo = 0;

  all.forEach(b => {
    if (!b.prezzo) return;
    const bt = bookTypes[b.uid] || b._bookType || b.bookType
      || (b.source === 'airbnb' ? 'airbnb' : b.source === 'booking' ? 'booking' : 'diretta');
    const p = b.prezzo;
    if (bt === 'booking') {
      const comm = p * bkComm, feePag = p * FEE_PAG, ivaComm = comm * IVA;
      nettoLordo += p - comm - feePag - ivaComm;
      taxBase    += p;
    } else if (bt === 'airbnb') {
      const comm = p * abComm, ivaComm = comm * IVA;
      nettoLordo += p - comm - ivaComm;
      taxBase    += p;
    } else {
      nettoLordo += p;
      if (inclDir) taxBase += p;
    }
  });

  let taxAmount, nettoFinale, subLabel, nettoSubLabel;

  if (isForf) {
    const imponibile = taxBase * COEFF;
    const irpefAmt   = imponibile * IRPEF;
    const inpsAmt    = imponibile * INPS;
    taxAmount        = irpefAmt + inpsAmt;
    nettoFinale      = nettoLordo - taxAmount;
    subLabel         = taxBase > 0
      ? `Impon. €${imponibile.toFixed(0)} · IRPEF €${irpefAmt.toFixed(0)} + INPS €${inpsAmt.toFixed(0)}`
      : 'Base €0';
    nettoSubLabel    = nettoLordo > 0
      ? `netto comm. €${nettoLordo.toFixed(0)} − tasse €${taxAmount.toFixed(0)}`
      : 'dopo commissioni + tasse';
    const fpPct = document.getElementById('fpForfPct');
    if (fpPct) fpPct.textContent = `${((IRPEF + INPS) * COEFF * 100).toFixed(2)}`;
  } else {
    taxAmount    = taxBase * CED_ALI;
    nettoFinale  = nettoLordo - taxAmount;
    const types  = ['Booking', 'AirBnB', ...(inclDir ? ['Diretta'] : [])];
    subLabel     = `Base €${taxBase.toFixed(0)} · ${types.join(' + ')}`;
    nettoSubLabel = nettoLordo > 0
      ? `netto comm. €${nettoLordo.toFixed(0)} − ced. €${taxAmount.toFixed(0)}`
      : 'dopo commissioni + cedolare';
  }

  const sCed    = document.getElementById('sCed');
  const sCedSub = document.getElementById('sCedSub');
  if (sCed) {
    sCed.textContent     = taxBase > 0 ? `€${taxAmount.toFixed(0)}` : '—';
    sCedSub.textContent  = subLabel;
  }
  const sNetto    = document.getElementById('sNetto');
  const sNettoSub = document.getElementById('sNettoSub');
  const sNettoGest= document.getElementById('sNettoGest');
  if (sNetto) {
    const gestione = getGestione(currentPropId);
    // SpesesOp stimate su tutte le prenotazioni (uguale a confronto)
    const sp_ = getSpese();
    const _nn  = all.reduce((s,b)=>s+(b.notti||0), 0);
    const _nb  = all.filter(b=>b.prezzo!=null).length;
    const _nOTA= all.filter(b=>{
      const bt2 = bookTypes[b.uid]||b._bookType||b.bookType||b.source||'';
      return bt2==='booking'||bt2==='airbnb';
    }).reduce((s,b)=>s+(b.notti||0), 0);
    const speseOp = (parseFloat(sp_.luce)||0)*_nn
      + ((parseFloat(sp_.welcomePack)||0)+(parseFloat(sp_.pulizie)||0)+(parseFloat(sp_.lavanderia)||0))*_nb
      + (parseFloat(sp_.tassaSoggiorno)||0)*_nOTA;
    const nettoFin = nettoFinale - gestione - speseOp;
    sNetto.textContent = nettoLordo > 0 ? `€${nettoFin.toFixed(0)}` : '—';
    const gestLabel  = gestione > 0 ? ` − gest.€${gestione.toFixed(0)}` : '';
    const speseLabel = speseOp  > 0 ? ` − sp.op.€${speseOp.toFixed(0)}` : '';
    sNettoSub.innerHTML = nettoLordo > 0
      ? nettoSubLabel + gestLabel + speseLabel
      : 'dopo commissioni + tasse + spese';
  }
}

/* ─── Editable Price (Diretta) ─────────────────────────────── */
function updatePrice(uid, rawVal) {
  const val   = parseFloat(String(rawVal).replace(',', '.'));
  const price = isNaN(val) ? null : val;
  // Persist override so it survives calendar refresh
  setPriceOverride(currentPropId, uid, price);
  // Update live cache
  const lb = liveBooks.find(b => b.uid === uid);
  if (lb) lb.prezzo = price;
  // Update past cache
  if (pastCache[uid]) pastCache[uid].prezzo = price;
  // Update manual booking if applicable
  const manuals = loadManual(currentPropId);
  if (manuals.find(m => m.uid === uid)) {
    updateManualEntry(currentPropId, uid, { prezzo: price });
  }
  savePast();
  saveLive();
  // Aggiorna stats e footer senza perdere il focus
  renderStats(getMergedBookings().filter(b => b.source !== 'blocked'));
  updateTableFooter(getMergedBookings().filter(b => b.source !== 'blocked'));
}

/* ─── Table Footer (shared helper) ─────────────────────────────── */
function buildTfootHtml(books) {
  const live = books.filter(b => !b.isPast);
  const totN = live.reduce((s, b) => s + (b.notti || 0), 0);
  const totP = live.filter(b => b.prezzo !== null).reduce((s, b) => s + b.prezzo, 0);
  return `<tr>
    <td colspan="2" style="font-weight:700">TOTALE · ${live.length} prenotazioni live</td>
    <td></td>
    <td class="f-n">${totN}</td>
    <td class="f-p">€&thinsp;${totP.toFixed(2)}</td>
    <td></td>
  </tr>`;
}

function updateTableFooter(books) {
  const tfoot = document.getElementById('tFoot');
  if (tfoot) tfoot.innerHTML = buildTfootHtml(books);
}

/* ─── Sort ─────────────────────────────── */
function sortBy(col) {
  sortSt = { col, dir: sortSt.col === col && sortSt.dir === 'asc' ? 'desc' : 'asc' };
  renderAll();
}

function getSorted(books) {
  const { col, dir } = sortSt;
  return [...books].sort((a, b) => {
    let va = a[col], vb = b[col];
    if (va instanceof Date) va = va.getTime();
    if (vb instanceof Date) vb = vb.getTime();
    va = va ?? (typeof vb === 'number' ? -Infinity : '');
    vb = vb ?? (typeof va === 'number' ? -Infinity : '');
    return (va < vb ? -1 : va > vb ? 1 : 0) * (dir === 'asc' ? 1 : -1);
  });
}

/* ─── Table Render ─────────────────────────────── */
function renderTable(all) {
  const tbody = document.getElementById('tBody');
  const tfoot = document.getElementById('tFoot');
  const books = getSorted(all.filter(b => b.source !== 'blocked'));

  if (!books.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-st"><div class="ei">📭</div><p>Nessun dato</p></div></td></tr>`;
    tfoot.innerHTML = '';
    return;
  }

  const DEC31 = new Date(viewYear, 11, 31);
  const rows  = [];
  for (let i = 0; i < books.length; i++) {
    rows.push({ type:'booking', data:books[i] });
    if (i < books.length - 1) {
      const cur = books[i], nxt = books[i+1];
      if (!cur.isPast && !nxt.isPast && cur.checkout && nxt.checkin) {
        buildGapRows(cur.checkout, nxt.checkin).forEach(g => rows.push(g));
      }
    }
    // Gap trailing fino al 31/12 dopo l'ultima prenotazione futura
    if (i === books.length - 1 && !books[i].isPast && books[i].checkout) {
      buildGapRows(books[i].checkout, DEC31).forEach(g => rows.push(g));
    }
  }

  tbody.innerHTML = rows.map(row =>
    row.type === 'gap' ? renderGapRow(row) : renderBookingRow(row.data)
  ).join('');

  // Footer — usa il helper condiviso
  tfoot.innerHTML = buildTfootHtml(books);
}

/* ─── Booking Row ─────────────────────────────── */
function renderBookingRow(b) {
  const bt       = bookTypes[b.uid] || '';
  const tCls     = bt ? `t-${bt}` : 't-none';
  const pastCls  = b.isPast ? 'is-past' : '';
  const needType = !bt && !b.isPast ? 'need-type' : '';
  const warnTip  = b.warnings.length ? ` title="${esc(b.warnings.join(', '))}"` : '';

  const pastBadge = b.isPast ? '<span class="past-badge">passata</span>' : '';
  const warnIcon  = b.warnings.length ? ' <span style="color:#C07010;font-size:10px" title="Sovrapposizione">⚠</span>' : '';

  const inEditMode = editModeActive && currentPropHasEditMode();

  // Nome cell
  const nomeCell = inEditMode
    ? `<td class="name-c">
        <input class="edit-nome-input" type="text"
          value="${esc(b.nome)}" placeholder="Cognome ospite"
          onchange="updateNome('${b.uid}', this.value)"
          title="Modifica nome ospite">
        ${pastBadge}${warnIcon}
      </td>`
    : `<td class="name-c">${esc(b.nome)}${pastBadge}${warnIcon}</td>`;

  // Prezzo cell
  const canEditPrice = inEditMode || (bt === 'diretta' && getAllowPriceEdit());
  let priceCell;
  if (canEditPrice) {
    const val = b.prezzo !== null ? b.prezzo.toFixed(2) : '';
    priceCell = `<td class="pc">
      <div class="price-edit-wrap">
        <span class="price-edit-prefix">€</span>
        <input class="price-edit-input" type="number" min="0" step="0.01"
          value="${val}" placeholder="0.00"
          oninput="updatePrice('${b.uid}', this.value)"
          title="Modifica prezzo">
      </div></td>`;
  } else if (b.prezzo !== null) {
    priceCell = `<td class="pc"><span class="price-v">€&thinsp;${b.prezzo.toFixed(2)}</span></td>`;
  } else {
    priceCell = `<td class="pc"><span class="price-nd">n.d.</span></td>`;
  }

  const nightsCell = b.notti !== null
    ? `<td class="nc"><span class="nb">${b.notti}</span></td>`
    : `<td class="nc" style="opacity:.4">—</td>`;

  const pills = ['booking','airbnb','diretta'].map(t =>
    `<button class="pill p-${t==='booking'?'bk':t==='airbnb'?'ab':'di'}${bt===t?' on':''}"
      onclick="setType('${b.uid}','${t}',this)">${t==='booking'?'Booking':t==='airbnb'?'AirBnB':'Diretta'}</button>`
  ).join('');

  const uid_safe = b.uid.replace(/[^a-z0-9]/gi, '_');

  const ratingCell = buildRatingCell(b.uid, b.isPast);

  // Delete button for past bookings in edit mode
  const deleteCell = (inEditMode && b.isPast)
    ? `<td style="padding:4px;text-align:center">
        <button onclick="deletePastBooking('${b.uid}')"
          style="background:#C03020;color:#fff;border:none;border-radius:6px;padding:3px 8px;font-size:10px;cursor:pointer;font-weight:700"
          title="Elimina prenotazione passata">✕</button>
      </td>`
    : (inEditMode ? '<td></td>' : '');

  return `<tr class="${tCls} ${pastCls} ${needType}" id="r-${uid_safe}"${warnTip}>
    <td class="dc">${b.checkin_str}</td>
    <td class="dc">${b.checkout_str}</td>
    ${nomeCell}
    ${nightsCell}
    ${priceCell}
    <td><div class="pills">${pills}</div></td>
    ${ratingCell}
    ${deleteCell}
  </tr>`;
}


/* ─── Rating Picker ─────────────────────────────── */
const RATING_OPTS = [
  { key:'blu',       color:'#2E86DE', label:'Eccellente'  },
  { key:'verde',     color:'#27AE60', label:'Positivo'    },
  { key:'giallo',    color:'#F0C040', label:'Nella norma' },
  { key:'rosso',     color:'#C0392B', label:'Problematico'},
];

function buildRatingCell(uid, isPast) {
  if (!isPast) return '<td class="rating-c"></td>';
  const propId = currentPropId;
  const saved  = getRating(propId, uid);
  const cur    = saved.rating || '';
  const nota   = saved.nota   || '';
  const uid_s  = uid.replace(/[^a-z0-9]/gi,'_');

  const btns = RATING_OPTS.map(o => {
    const active = cur === o.key;
    return `<button class="rating-btn${active?' rating-active':''}"
      style="border-color:${active?o.color:'transparent'};background:${active?o.color+'33':'transparent'}"
      title="${o.label}"
      onclick="toggleRating('${uid}','${o.key}',this)">
      <span style="display:inline-block;width:13px;height:13px;border-radius:50%;background:${o.color};opacity:${active?'1':'0.35'};vertical-align:middle;transition:opacity .15s"></span>
    </button>`;
  }).join('');

  const noteId  = `note-${uid_s}`;
  const noteVal = esc(nota);
  const noteRow = `<div class="rating-note-row" id="${noteId}-wrap" style="${nota?'':'display:none'}">
    <input class="rating-note-input" id="${noteId}" type="text"
      placeholder="Nota ospite…" value="${noteVal}" maxlength="200"
      onchange="saveRatingNota('${uid}', this.value)"
      onblur="saveRatingNota('${uid}', this.value)">
  </div>`;

  const showNoteBtn = `<button class="rating-note-btn" title="Aggiungi nota"
    onclick="toggleRatingNote('${uid_s}')" style="${nota?'color:var(--acc)':''}">✏️</button>`;

  return `<td class="rating-c">
    <div class="rating-wrap">
      <div class="rating-btns">${btns}${showNoteBtn}</div>
      ${noteRow}
    </div>
  </td>`;
}

function toggleRating(uid, key, btn) {
  const propId = currentPropId;
  const saved  = getRating(propId, uid);
  const newKey = saved.rating === key ? '' : key;   // toggle off if same
  saveRating(propId, uid, newKey, saved.nota);
  // Update buttons in-place without full re-render
  const row = btn.closest('tr');
  if (!row) return;
  const btns = row.querySelectorAll('.rating-btn');
  btns.forEach((b, i) => {
    const o = RATING_OPTS[i];
    const active = o.key === newKey;
    b.classList.toggle('rating-active', active);
    b.style.background  = active ? o.color + '33' : 'transparent';
    b.style.borderColor = active ? o.color        : 'transparent';
    const dot = b.querySelector('span');
    if (dot) dot.style.opacity = active ? '1' : '0.35';
  });
}

function toggleRatingNote(uid_s) {
  const wrap = document.getElementById(`note-${uid_s}-wrap`);
  const inp  = document.getElementById(`note-${uid_s}`);
  if (!wrap) return;
  const visible = wrap.style.display !== 'none';
  wrap.style.display = visible ? 'none' : '';
  if (!visible && inp) inp.focus();
}

function saveRatingNota(uid, nota) {
  const propId = currentPropId;
  const saved  = getRating(propId, uid);
  saveRating(propId, uid, saved.rating, nota);
}
/* ─── Gap Row ─────────────────────────────── */
function renderGapRow(g) {
  const fullLabel = g.full ? 'Settimana libera' : 'Periodo libero';
  return `<tr class="gap-row">
    <td>${g.fromStr}</td>
    <td>${g.toStr}</td>
    <td style="font-style:italic;color:var(--gap-txt)">— ${fullLabel} —</td>
    <td style="text-align:center">${g.nights}</td>
    <td></td>
    <td></td>
  </tr>`;
}

/* ─── Overlap Alert ─────────────────────────────── */
function renderOverlaps(all) {
  const ov = all.filter(b => b.warnings.length);
  const el = document.getElementById('ovAlert');
  if (ov.length) {
    el.innerHTML = `⚠️ <strong>${ov.length} prenotazioni con avvisi:</strong> ${ov.map(b => esc(b.nome)).join(', ')}`;
    el.classList.add('on');
  } else {
    el.classList.remove('on');
  }
}

/* ─── Type Assignment ─────────────────────────────── */
function setType(uid, type, btn) {
  const row = btn.closest('tr');
  const cur = bookTypes[uid];

  if (cur === type) {
    delete bookTypes[uid];
  } else {
    bookTypes[uid] = type;
  }
  saveTypes();

  const newT          = bookTypes[uid];
  const prevWasDiretta = cur  === 'diretta';
  const nowIsDiretta   = newT === 'diretta';

  if (prevWasDiretta || nowIsDiretta) {
    // Ridisegna la riga completa se il prezzo può cambiare visibilità
    const all = getMergedBookings();
    const b   = all.find(x => x.uid === uid);
    if (b) {
      b.warnings = b.warnings || [];
      const tmp  = document.createElement('tbody');
      tmp.innerHTML = renderBookingRow(b);
      row.replaceWith(tmp.firstElementChild);
    }
  } else {
    // Solo aggiorna classe e pills
    row.classList.remove('t-booking','t-airbnb','t-diretta','t-none','need-type');
    row.classList.add(newT ? `t-${newT}` : 't-none');
    if (!newT && !row.classList.contains('is-past')) row.classList.add('need-type');
    row.querySelectorAll('.pill').forEach(p => p.classList.remove('on'));
    if (newT) btn.classList.add('on');
  }

  renderStats(getMergedBookings().filter(b => b.source !== 'blocked'));
}

/* ─── Sidebar ─────────────────────────────── */
function renderSidebar() {
  const el = document.getElementById('calList');
  if (!calSources.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--ink2);opacity:.6">Nessun calendario.</div>';
    return;
  }

  // Helper per badge tag (evita duplicazione inline)
  function tagBadge(tag) {
    if (!tag || tag === 'auto') return '<span style="font-size:9px;opacity:.5;margin-left:5px">auto</span>';
    const bg    = tag==='booking' ? 'var(--bk-bg)' : tag==='airbnb' ? 'var(--ab-bg)' : 'var(--di-bg)';
    const color = tag==='booking' ? 'var(--bk-txt)': tag==='airbnb' ? 'var(--ab-txt)': 'var(--di-txt)';
    const label = tag==='booking' ? 'Booking' : tag==='airbnb' ? 'AirBnB' : 'Diretta';
    return `<span style="display:inline-block;padding:1px 6px;border-radius:3px;font-size:9px;font-weight:700;background:${bg};color:${color};margin-left:5px">${label}</span>`;
  }

  el.innerHTML = calSources.map(c => `
    <div class="cal-card" style="margin-bottom:6px">
      <div class="cal-top">
        <div class="cal-dot ${c.err ? 'err' : (c.cnt > 0 ? 'ok' : '')}" id="cd-${c.id}"></div>
        <div style="flex:1">
          <div class="cal-nm">${esc(c.name)}${tagBadge(c.defaultTag)}</div>
          <div class="cal-url">${esc(c.url.length > 50 ? c.url.slice(0,50)+'…' : c.url)}</div>
          <div class="cal-info">${c.err
            ? `<span style="color:#C0392B">${esc(c.err)}</span>`
            : `<b>${c.cnt}</b> prenotazioni`
          }</div>
        </div>
        <button class="cal-del" onclick="removeCal('${c.id}')">✕</button>
      </div>
    </div>`
  ).join('');
}

function sbStatus(type, msg, spin = false) {
  const el = document.getElementById('sbSt');
  el.className  = `st-bar on ${type}`;
  el.innerHTML  = (spin ? '<div class="spin"></div>' : '') + `<span>${esc(msg)}</span>`;
}
function sbStatusClear() { document.getElementById('sbSt').className = 'st-bar'; }
function setDot(id, state) { const d = document.getElementById(`cd-${id}`); if (d) d.className = `cal-dot ${state}`; }

/* ─── Export ─────────────────────────────── */
function getExportRows() {
  return getSorted(getMergedBookings().filter(b => b.source !== 'blocked'));
}

function exportCSV() {
  const hdr  = ['Check-in','Check-out','Cognome','Notti','Prezzo €','Tipologia','Calendario','Passata'];
  const rows = [hdr, ...getExportRows().map(b => [
    b.checkin_str, b.checkout_str, b.nome,
    b.notti ?? '',
    b.prezzo !== null ? b.prezzo.toFixed(2).replace('.', ',') : '',
    bookTypes[b.uid] || '',
    b._cname || '',
    b.isPast ? 'Sì' : 'No',
  ])];
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(';')).join('\r\n');
  dl(new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8;' }), `prenotazioni_${ds()}.csv`);
}

function exportXLSX() {
  if (!window.XLSX) { alert('SheetJS non disponibile.'); return; }
  const data = getExportRows().map(b => ({
    'Check-in':   b.checkin_str,
    'Check-out':  b.checkout_str,
    'Cognome':    b.nome,
    'Notti':      b.notti,
    'Prezzo €':   b.prezzo,
    'Tipologia':  bookTypes[b.uid] || '',
    'Calendario': b._cname || '',
    'Passata':    b.isPast ? 'Sì' : 'No',
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [11,11,20,7,10,10,14,8].map(w => ({ wch:w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Prenotazioni');
  XLSX.writeFile(wb, `prenotazioni_${ds()}.xlsx`);
}

/* ════════════════════════════════════════════════════════════════════
   EXPORT TUTTE LE PRENOTAZIONI (tutti gli appartamenti, per anno)
════════════════════════════════════════════════════════════════════ */
function _getAllBooksForYear(targetYear) {
  const isArch = (targetYear !== CURRENT_YEAR);
  const realProps = PROPERTIES.filter(p => !p.adminView && !p.confrontoView && !p.cercaView && !p.graficiView && !p.speseView);
  const rows = [];

  realProps.forEach(prop => {
    const sfx = k => isArch
      ? `octo_arch_${targetYear}_${k}_${prop.id}_v3`
      : `octo_${k}_${prop.id}_v3`;
    let types = {};
    try { types = JSON.parse(localStorage.getItem(sfx('types')) || '{}'); } catch(e){}

    const seen = new Set();
    const add  = (raw, isManual) => {
      if (!raw || seen.has(raw.uid)) return;
      const ci = raw.checkin  ? new Date(raw.checkin)  : null;
      const co = raw.checkout ? new Date(raw.checkout) : null;
      if (!ci || ci.getFullYear() !== targetYear) return;
      if (raw.source === 'blocked') return;
      seen.add(raw.uid);
      rows.push({
        appartamento: prop.name,
        checkin:      ci ? `${String(ci.getDate()).padStart(2,'0')}/${String(ci.getMonth()+1).padStart(2,'0')}/${ci.getFullYear()}` : '',
        checkout:     co ? `${String(co.getDate()).padStart(2,'0')}/${String(co.getMonth()+1).padStart(2,'0')}/${co.getFullYear()}` : '',
        cognome:      raw.nome || '—',
        notti:        raw.notti ?? (ci && co ? Math.round((co-ci)/86400000) : null),
        prezzo:       raw.prezzo ?? null,
        tipologia:    types[raw.uid] || (isManual ? raw.bookType : '') || '',
        fonte:        isManual ? 'manuale' : (raw._cname || 'calendario'),
        isPast:       co ? co < new Date() : false,
      });
    };

    try { JSON.parse(localStorage.getItem(sfx('live'))||'[]').forEach(b => add(b, false)); } catch(e){}
    try { Object.values(JSON.parse(localStorage.getItem(sfx('past'))||'{}')).forEach(b => add(b, false)); } catch(e){}
    try { JSON.parse(localStorage.getItem(sfx('manual'))||'[]').forEach(b => add(b, true)); } catch(e){}
  });

  rows.sort((a,b) => (a.appartamento+a.checkin).localeCompare(b.appartamento+b.checkin));
  return rows;
}

function exportAllBookingsXLSX(targetYear) {
  const yr = targetYear ?? viewYear;
  if (!window.XLSX) { alert('SheetJS non disponibile.'); return; }
  const rows = _getAllBooksForYear(yr);
  if (!rows.length) { alert(`Nessuna prenotazione trovata per il ${yr}.`); return; }

  // Un foglio per appartamento + un foglio riepilogo
  const wb = XLSX.utils.book_new();

  // Foglio riepilogo globale
  const allData = rows.map(r => ({
    'Appartamento': r.appartamento,
    'Check-in':     r.checkin,
    'Check-out':    r.checkout,
    'Ospite':       r.cognome,
    'Notti':        r.notti,
    'Prezzo €':     r.prezzo,
    'Tipologia':    r.tipologia,
    'Fonte':        r.fonte,
  }));
  const wsAll = XLSX.utils.json_to_sheet(allData);
  wsAll['!cols'] = [16,11,11,20,7,10,12,12].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb, wsAll, `Tutte ${yr}`);

  // Un foglio per appartamento
  const props = [...new Set(rows.map(r=>r.appartamento))];
  props.forEach(nome => {
    const propRows = rows.filter(r=>r.appartamento===nome).map(r=>({
      'Check-in':  r.checkin,
      'Check-out': r.checkout,
      'Ospite':    r.cognome,
      'Notti':     r.notti,
      'Prezzo €':  r.prezzo,
      'Tipologia': r.tipologia,
    }));
    const ws = XLSX.utils.json_to_sheet(propRows);
    ws['!cols'] = [11,11,20,7,10,12].map(w=>({wch:w}));
    // Truncate sheet name to 31 chars (Excel limit)
    XLSX.utils.book_append_sheet(wb, ws, nome.slice(0,31));
  });

  // Foglio spese
  try {
    const speseKey = yr !== CURRENT_YEAR ? `octo_arch_${yr}_spese_reali_v3` : 'octo_spese_reali_v3';
    const speseArr = JSON.parse(localStorage.getItem(speseKey)||'[]');
    if (speseArr.length) {
      const speseData = speseArr.map(e => {
        const prop = PROPERTIES.find(p=>p.id===e.propId);
        return { 'Data':e.data, 'Appartamento':prop?.name||e.propId, 'Tag':e.tag, 'Descrizione':e.descrizione||'', 'Importo €':parseFloat(e.importo||0) };
      });
      const wsS = XLSX.utils.json_to_sheet(speseData);
      wsS['!cols'] = [12,16,14,30,10].map(w=>({wch:w}));
      XLSX.utils.book_append_sheet(wb, wsS, `Spese ${yr}`);
    }
  } catch(_){}

  XLSX.writeFile(wb, `prenotazioni_${yr}.xlsx`);
}

function exportAllBookingsCSV(targetYear) {
  const yr   = targetYear ?? viewYear;
  const rows = _getAllBooksForYear(yr);
  if (!rows.length) { alert(`Nessuna prenotazione trovata per il ${yr}.`); return; }
  const hdr  = ['Appartamento','Check-in','Check-out','Ospite','Notti','Prezzo €','Tipologia','Fonte'];
  const data = rows.map(r => [r.appartamento,r.checkin,r.checkout,r.cognome,r.notti??'',r.prezzo!=null?r.prezzo.toFixed(2).replace('.',','):'',r.tipologia,r.fonte]);
  const csv  = [hdr,...data].map(row=>row.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\r\n');
  dl(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}), `prenotazioni_${yr}.csv`);
}

/* ─── Occupazione Widget ─────────────────────────────────────────────────────────
   Griglia 12 mesi × occupazione/RevPAR/avg notte per l'appartamento corrente.
   Confronto con anno precedente se disponibile in archivio.
─────────────────────────────────────────────────────────────────────────────── */

const OCC_TARGET_KEY = 'octo_occ_target_v3';  // target % globale, persistente

function _getOccTarget() {
  return parseFloat(localStorage.getItem(OCC_TARGET_KEY) || '60');
}
function _setOccTarget(v) {
  localStorage.setItem(OCC_TARGET_KEY, String(parseFloat(v) || 60));
}

function _daysInMonth(year, month) { return new Date(year, month + 1, 0).getDate(); }

function _occMonthlyStats(books, year, types) {
  const months = Array.from({ length: 12 }, (_, i) => ({
    notti: 0, lordo: 0, comm: 0, tasse: 0, speseOpStimat: 0, available: _daysInMonth(year, i)
  }));
  books.forEach(b => {
    const ci = b.checkin instanceof Date ? b.checkin : (b.checkin ? new Date(b.checkin) : null);
    if (!ci || b.source === 'blocked') return;
    const m = ci.getMonth();
    if (ci.getFullYear() !== year) return;
    if (b.notti > 0) months[m].notti += b.notti;
    if (b.prezzo != null) months[m].lordo += b.prezzo;
  });
  return months;
}

function _loadArchiveBooks(year, propId) {
  const result = []; const seen = new Set();
  [
    [`octo_arch_${year}_live_${propId}_v3`,   raw => JSON.parse(raw || '[]')],
    [`octo_arch_${year}_past_${propId}_v3`,   raw => Object.values(JSON.parse(raw || '{}'))],
    [`octo_arch_${year}_manual_${propId}_v3`, raw => JSON.parse(raw || '[]')],
  ].forEach(([key, parse]) => {
    try { parse(localStorage.getItem(key)).forEach(b => {
      const d = deserBook(b);
      if (!seen.has(d.uid)) { seen.add(d.uid); result.push(d); }
    }); } catch(_) {}
  });
  return result;
}

/* ─── Calcola NetRevPAR mensile ─────────────────────────────────────────────
   Mese completato  → lordo − comm − tasse − speseReali_mese (registrate per quel mese)
   Mese futuro/cor. → lordo − comm − tasse − speseOp_stimate − gestione/12
   Gestione/affitto annuale diviso per 12 (quota fissa mensile)
──────────────────────────────────────────────────────────────────────────── */
function _calcNetRevPAR(books, year, propId, isArchive) {
  const IVA = 0.22, FEE_PAG = 0.015, COEFF = 0.40, IRPEF = 0.05, INPS = 0.2448;

  const _get = (key, def) => { try { return JSON.parse(localStorage.getItem(key) || def); } catch(_) { return JSON.parse(def); } };
  const pfx  = isArchive ? `octo_arch_${year}_` : '';
  const fiscal  = _get(isArchive ? `octo_arch_${year}_fiscal_${propId}_v3`  : `octo_fiscal_${propId}_v3`,  '{}');
  const types   = _get(isArchive ? `octo_arch_${year}_types_${propId}_v3`   : `octo_types_${propId}_v3`,   '{}');
  const spese   = _get(isArchive ? `octo_arch_${year}_spese_v3`             : 'octo_spese_v3',             '{}');
  const gestAll = _get(isArchive ? `octo_arch_${year}_gestione_v3`          : 'octo_gestione_v3',          '{}');

  const bkComm  = parseFloat(fiscal.bkComm  ?? 16)   / 100;
  const abComm  = parseFloat(fiscal.abComm  ?? 15.5) / 100;
  const inclDir = fiscal.inclDir ?? false;
  const isForf  = (fiscal.regime ?? 'cedolare') === 'forfettario';
  const CED     = parseFloat(fiscal.cedAliquota ?? 21) / 100;

  // Gestione annuale ÷ 12 = quota mensile fissa
  const _gestEntry = gestAll[propId];
  const gestioneAnnua = !_gestEntry ? 0
    : typeof _gestEntry === 'number' ? _gestEntry
    : (parseFloat(_gestEntry.affitto)||0) + (parseFloat(_gestEntry.condominio)||0) + (parseFloat(_gestEntry.varie)||0);
  const gestioneMensile = gestioneAnnua / 12;

  // Spese reali per mese per questo appartamento
  const srKey  = isArchive ? `octo_arch_${year}_spese_reali_v3` : 'octo_spese_reali_v3';
  const srRaw  = _get(srKey, '[]');
  const srMese = Array(12).fill(0);   // spesa reale per mese
  const srHasMese = Array(12).fill(false); // almeno una voce registrata per quel mese
  srRaw.filter(e => e.propId === propId).forEach(e => {
    if (!e.data) return;
    const m = parseInt(e.data.split('-')[1], 10) - 1;
    if (m >= 0 && m < 12) { srMese[m] += parseFloat(e.importo) || 0; srHasMese[m] = true; }
  });

  // Calcola comm + tasse + speseOpStimate per mese dai booking
  const mesi = Array.from({ length: 12 }, () => ({ lordo: 0, comm: 0, tasse: 0, speseOpSt: 0, notti: 0 }));
  books.forEach(b => {
    const ci = b.checkin instanceof Date ? b.checkin : (b.checkin ? new Date(b.checkin) : null);
    if (!ci || b.source === 'blocked' || b.prezzo == null) return;
    if (ci.getFullYear() !== year) return;
    const m = ci.getMonth(), p = b.prezzo, nn = b.notti || 0;
    const bt = types[b.uid] || b._bookType || b.bookType || '';
    const isOTA = bt === 'booking' || bt === 'airbnb';

    let comm = 0;
    if (bt === 'booking') comm = p * bkComm + p * FEE_PAG + p * bkComm * IVA;
    else if (bt === 'airbnb') comm = p * abComm + p * abComm * IVA;

    let tax = 0;
    if (isForf) tax = p * COEFF * (IRPEF + INPS);
    else if (isOTA || (bt === 'diretta' && inclDir)) tax = p * CED;

    const speseOp = (parseFloat(spese.luce || 0)) * nn
      + (parseFloat(spese.welcomePack || 0) + parseFloat(spese.pulizie || 0) + parseFloat(spese.lavanderia || 0))
      + (isOTA ? parseFloat(spese.tassaSoggiorno || 0) * nn : 0);

    mesi[m].lordo    += p;
    mesi[m].comm     += comm;
    mesi[m].tasse    += tax;
    mesi[m].speseOpSt+= speseOp;
    mesi[m].notti    += nn;
  });

  const TODAY_M = new Date().getMonth();
  const IS_CUR  = year === CURRENT_YEAR;

  return mesi.map((m, i) => {
    const available   = _daysInMonth(year, i);
    if (!m.lordo) return { netNetto: null, netRevPAR: null, usedReal: false };

    // Mese completato = anno archivio OPPURE anno corrente con mese già chiuso (i < TODAY_M)
    const isCompleted = !IS_CUR || i < TODAY_M;

    let netto, usedReal = false;
    if (isCompleted && srHasMese[i]) {
      // Mese chiuso con spese reali registrate per quel mese → usa le reali
      // (le spese reali già includono tutto: pulizie, luce, gestione, ecc.)
      netto    = m.lordo - m.comm - m.tasse - srMese[i];
      usedReal = true;
    } else {
      // Mese futuro o mese chiuso senza spese reali → usa stima
      // gestione mensile = annuale / 12 (quota fissa)
      netto = m.lordo - m.comm - m.tasse - m.speseOpSt - gestioneMensile;
    }

    return { netNetto: netto, netRevPAR: netto / available, usedReal };
  });
}

function renderOccupazioneWidget() {
  const wrapId = 'occWidget';
  let wrap = document.getElementById(wrapId);
  const mainC = document.getElementById('mainC');
  if (!mainC) return;
  if (!wrap) { wrap = document.createElement('div'); wrap.id = wrapId; mainC.appendChild(wrap); }

  const propId = currentPropId;
  if (!propId || ['admin','confronto','cerca','grafici','spese'].includes(propId)) {
    wrap.style.display = 'none'; return;
  }

  const target   = _getOccTarget();
  const year     = viewYear;
  const prevYear = year - 1;
  const isArchive = viewingArchive;

  // Dati anno corrente
  const curBooks = getMergedBookings().filter(b => b.source !== 'blocked');
  const priceOv  = loadPriceOverrides(propId);
  curBooks.forEach(b => { if (priceOv[b.uid] != null) b.prezzo = priceOv[b.uid]; });
  const cur    = _occMonthlyStats(curBooks, year);
  const netCur = _calcNetRevPAR(curBooks, year, propId, isArchive);

  // Dati anno precedente
  const hasPrev   = getArchivedYears().includes(prevYear);
  const prevBooks = hasPrev ? _loadArchiveBooks(prevYear, propId) : [];
  if (hasPrev) {
    const pov = (() => { try { return JSON.parse(localStorage.getItem(`octo_arch_${prevYear}_priceov_${propId}_v3`) || '{}'); } catch(_) { return {}; } })();
    prevBooks.forEach(b => { if (pov[b.uid] != null) b.prezzo = pov[b.uid]; });
  }
  const prev = hasPrev ? _occMonthlyStats(prevBooks, prevYear) : null;

  // Totali
  const totNotti    = cur.reduce((s, m) => s + m.notti, 0);
  const totAvail    = cur.reduce((s, m) => s + m.available, 0);
  const totLordo    = cur.reduce((s, m) => s + m.lordo, 0);
  const totOcc      = totAvail ? (totNotti / totAvail * 100) : 0;
  const totRevPAR   = totAvail ? (totLordo / totAvail) : 0;
  const totAvgNotte = totNotti ? (totLordo / totNotti) : 0;
  const validNet    = netCur.filter(x => x.netRevPAR !== null);
  const totNetRevPAR = totAvail && validNet.length
    ? validNet.reduce((s, x) => s + x.netNetto, 0) / totAvail : 0;

  const MONTHS_SHORT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  const TODAY_M   = new Date().getMonth();
  const IS_CUR    = year === CURRENT_YEAR;

  function semaforo(occ, tgt) {
    if (occ >= tgt * 1.1)  return { bg:'rgba(86,194,138,.18)',  txt:'#2AAF6A', dot:'#2AAF6A' };
    if (occ >= tgt * 0.85) return { bg:'rgba(158,221,106,.15)', txt:'#6AAA20', dot:'#6AAA20' };
    if (occ >= tgt * 0.60) return { bg:'rgba(240,192,64,.18)',  txt:'#C09800', dot:'#C09800' };
    if (occ > 0)           return { bg:'rgba(232,112,64,.18)',  txt:'#C05020', dot:'#C05020' };
    return { bg:'transparent', txt:'var(--ink2)', dot:'rgba(0,0,0,.2)' };
  }

  function fmtPct(v)  { return v.toFixed(0) + '%'; }
  function fmtEur(v)  { return '€' + Math.round(v).toLocaleString('it-IT'); }
  function fmtNotte(v){ return v != null ? '€' + Math.round(v).toLocaleString('it-IT') : '—'; }
  function diffBadge(d, prv) {
    if (!prv) return '';
    const diff = d - prv;
    if (Math.abs(diff) < 1) return '';
    const col = diff > 0 ? '#2AAF6A' : '#C03020';
    return `<span style="font-size:9px;color:${col};margin-left:3px">${diff>0?'+':''}${diff.toFixed(0)}%</span>`;
  }

  const rows = MONTHS_SHORT.map((mName, i) => {
    const m        = cur[i];
    const occ      = m.available ? (m.notti / m.available * 100) : 0;
    const avgN     = m.notti ? m.lordo / m.notti : 0;
    const revpar   = m.available ? m.lordo / m.available : 0;
    const sem      = semaforo(occ, target);
    const isFuture = IS_CUR && i > TODAY_M;
    const isToday  = IS_CUR && i === TODAY_M;
    const net      = netCur[i];

    const prevM      = prev ? prev[i] : null;
    const prevOcc    = prevM?.available ? (prevM.notti / prevM.available * 100) : 0;
    const prevRevPAR = prevM?.available ? prevM.lordo / prevM.available : 0;

    const rowBg = isToday ? 'background:rgba(var(--acc-rgb),.06)' : (i % 2 === 0 ? 'background:var(--bg2)' : '');
    const opacity = isFuture ? 'opacity:.45' : '';

    return `
      <tr style="${rowBg};${opacity}${isToday ? ';border-left:3px solid var(--acc)' : ''}">
        <td style="padding:7px 10px;font-size:13px;font-weight:700;color:var(--ink);white-space:nowrap">
          ${mName}${isToday ? ' <span style="font-size:9px;color:var(--acc)">●</span>' : ''}
          ${net?.usedReal ? '<span title="Spese reali" style="font-size:8px;color:#56C28A;margin-left:3px">✓R</span>' : ''}
        </td>
        <td style="padding:7px 8px;text-align:center">
          ${m.notti > 0
            ? `<div style="display:inline-flex;align-items:center;gap:5px;background:${sem.bg};border-radius:7px;padding:3px 9px">
                <span style="width:7px;height:7px;border-radius:50%;background:${sem.dot};flex-shrink:0"></span>
                <span style="font-size:13px;font-weight:700;color:${sem.txt}">${fmtPct(occ)}</span>
                ${prev ? diffBadge(occ, prevOcc) : ''}
               </div>`
            : `<span style="font-size:12px;color:var(--ink2);opacity:.35">—</span>`}
        </td>
        <td style="padding:7px 8px;text-align:center;font-size:12px;color:var(--ink2)">
          ${m.notti > 0 ? `<span style="font-weight:700;color:var(--ink)">${m.notti}</span>/<span>${m.available}</span>` : `<span style="opacity:.3">0/${m.available}</span>`}
        </td>
        <td style="padding:7px 8px;text-align:right;font-size:13px;font-weight:600;color:var(--ink)">
          ${m.lordo > 0 ? fmtEur(m.lordo) : '<span style="opacity:.3">—</span>'}
        </td>
        <td style="padding:7px 8px;text-align:right;font-size:12px;color:var(--ink2)">
          ${avgN > 0 ? fmtNotte(avgN) : '<span style="opacity:.3">—</span>'}
        </td>
        <td style="padding:7px 8px;text-align:right;font-size:12px">
          ${revpar > 0
            ? `<span style="font-weight:600;color:#7B5CF0">${fmtNotte(revpar)}</span>
               ${prevRevPAR > 0 ? `<span style="font-size:9px;color:${revpar>=prevRevPAR?'#2AAF6A':'#C03020'};margin-left:2px">${revpar>=prevRevPAR?'▲':'▼'}</span>` : ''}`
            : '<span style="opacity:.3">—</span>'}
        </td>
        <td style="padding:7px 8px;text-align:right;font-size:12px">
          ${net?.netRevPAR != null
            ? `<span style="font-weight:700;color:${net.netRevPAR >= 0 ? '#2AAF6A' : '#C03020'}">${fmtNotte(net.netRevPAR)}</span>`
            : '<span style="opacity:.3">—</span>'}
        </td>
      </tr>`;
  }).join('');

  const semTot   = semaforo(totOcc, target);
  const occColor = semTot.txt;

  // Aggiorna card in cima (stat row)
  const _occEl     = document.getElementById('sOccPct');
  const _revEl     = document.getElementById('sRevPAR');
  const _netRevEl  = document.getElementById('sNetRevPAR');
  const _occCard   = document.getElementById('scOccCard');
  if (_occEl) _occEl.textContent = totNotti > 0 ? fmtPct(totOcc) : '—';
  if (_revEl) _revEl.textContent = totRevPAR > 0 ? 'RevPAR ' + fmtNotte(totRevPAR) : 'RevPAR —';
  if (_netRevEl) {
    _netRevEl.textContent = totNetRevPAR !== 0 ? 'Net ' + fmtNotte(totNetRevPAR) : 'Net —';
    _netRevEl.style.color = totNetRevPAR >= 0 ? '#2AAF6A' : '#C03020';
  }
  if (_occCard) {
    const sem = semaforo(totOcc, target);
    _occCard.querySelector('.sc-val').style.color = sem.txt;
  }

  wrap.style.display = '';
  wrap.innerHTML = `
    <div style="background:var(--surf);border:1px solid var(--bdr);border-radius:12px;padding:0;margin-top:8px;box-shadow:var(--sh);overflow:hidden">

      <!-- Header gradiente -->
      <div style="background:linear-gradient(135deg,#1A3A5C 0%,#1E4976 100%);padding:14px 18px 14px 18px">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <div>
            <div style="font-size:17px;font-weight:700;color:#E8F4FF;letter-spacing:-.3px">🏠 Occupazione ${year}</div>
            <div style="font-size:11px;color:rgba(180,215,255,.75);margin-top:3px">
              ${totNotti} notti · ${totAvail} giorni disponibili${hasPrev ? ` · vs ${prevYear}` : ''}
            </div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
            <div style="text-align:center;padding:7px 12px;background:rgba(255,255,255,.13);border-radius:9px;min-width:52px">
              <div style="font-size:9.5px;color:rgba(180,215,255,.75);text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px">Occ.</div>
              <div style="font-size:16px;font-weight:700;color:${occColor}">${fmtPct(totOcc)}</div>
            </div>
            <div style="text-align:center;padding:7px 12px;background:rgba(255,255,255,.13);border-radius:9px;min-width:52px">
              <div style="font-size:9.5px;color:rgba(180,215,255,.75);text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px">Lordo</div>
              <div style="font-size:16px;font-weight:700;color:#E8F4FF">${fmtEur(totLordo)}</div>
            </div>
            <div style="text-align:center;padding:7px 12px;background:rgba(255,255,255,.13);border-radius:9px;min-width:52px">
              <div style="font-size:9.5px;color:rgba(180,215,255,.75);text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px">RevPAR</div>
              <div style="font-size:16px;font-weight:700;color:#C8AAFF">${fmtNotte(totRevPAR)}</div>
            </div>
            <div style="text-align:center;padding:7px 12px;background:rgba(255,255,255,.13);border-radius:9px;min-width:52px">
              <div style="font-size:9.5px;color:rgba(180,215,255,.75);text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px">Net RevPAR</div>
              <div style="font-size:16px;font-weight:700;color:${totNetRevPAR >= 0 ? '#7AE8A8' : '#FF8888'}">${fmtNotte(totNetRevPAR)}</div>
            </div>
            <div style="text-align:center;padding:7px 12px;background:rgba(255,255,255,.13);border-radius:9px;min-width:52px">
              <div style="font-size:9.5px;color:rgba(180,215,255,.75);text-transform:uppercase;letter-spacing:.6px;margin-bottom:2px">€/notte</div>
              <div style="font-size:16px;font-weight:700;color:#E8F4FF">${fmtNotte(totAvgNotte)}</div>
            </div>
            <div style="display:flex;align-items:center;gap:5px;padding:4px 0">
              <span style="font-size:10px;color:rgba(180,215,255,.75)">Target</span>
              <input type="number" min="10" max="100" step="5" value="${target}"
                onchange="_setOccTarget(this.value); renderOccupazioneWidget()"
                style="width:44px;font-size:12px;font-weight:700;padding:4px 6px;border:1px solid rgba(255,255,255,.3);border-radius:6px;background:rgba(255,255,255,.15);color:#E8F4FF;text-align:center;outline:none">
              <span style="font-size:10px;color:rgba(180,215,255,.75)">%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Legenda semaforo + nota reale -->
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;padding:9px 18px;background:var(--bg2);border-bottom:1px solid var(--bdr)">
        <div style="display:flex;gap:14px;flex-wrap:wrap">
          ${[
            ['#2AAF6A', `≥ ${Math.round(target*1.1)}% eccellente`],
            ['#6AAA20', `≥ ${Math.round(target*0.85)}% buono`],
            ['#C09800', `≥ ${Math.round(target*0.60)}% sufficiente`],
            ['#C05020', '< soglia'],
          ].map(([col,lbl]) => `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;color:var(--ink2)">
            <span style="width:8px;height:8px;border-radius:50%;background:${col}"></span>${lbl}
          </span>`).join('')}
        </div>
        <span style="font-size:10px;color:#56C28A;font-weight:600">✓R = spese reali usate</span>
      </div>

      <!-- Tabella mesi -->
      <div style="overflow-x:auto;padding:0 0 4px 0">
        <table style="width:100%;border-collapse:collapse;min-width:500px">
          <thead>
            <tr style="border-bottom:2px solid var(--bdr);background:var(--bg2)">
              <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--ink2);font-weight:700">Mese</th>
              <th style="padding:8px 8px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--ink2);font-weight:700">Occ.%</th>
              <th style="padding:8px 8px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--ink2);font-weight:700">Notti</th>
              <th style="padding:8px 8px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--ink2);font-weight:700">Lordo</th>
              <th style="padding:8px 8px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:var(--ink2);font-weight:700">€/notte</th>
              <th style="padding:8px 8px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:#7B5CF0;font-weight:700">RevPAR</th>
              <th style="padding:8px 8px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:#2AAF6A;font-weight:700">Net RevPAR</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>
            <tr style="border-top:2px solid var(--bdr);background:var(--bg2)">
              <td style="padding:8px 10px;font-size:13px;font-weight:700;color:var(--ink)">Totale</td>
              <td style="padding:8px 8px;text-align:center">
                <span style="font-size:14px;font-weight:700;color:${occColor}">${fmtPct(totOcc)}</span>
              </td>
              <td style="padding:8px 8px;text-align:center;font-size:12px;color:var(--ink2)">
                <span style="font-weight:700;color:var(--ink)">${totNotti}</span>/${totAvail}
              </td>
              <td style="padding:8px 8px;text-align:right;font-size:13px;font-weight:700;color:var(--ink)">${fmtEur(totLordo)}</td>
              <td style="padding:8px 8px;text-align:right;font-size:12px;color:var(--ink2)">${fmtNotte(totAvgNotte)}</td>
              <td style="padding:8px 8px;text-align:right;font-size:13px;font-weight:700;color:#7B5CF0">${fmtNotte(totRevPAR)}</td>
              <td style="padding:8px 8px;text-align:right;font-size:13px;font-weight:700;color:${totNetRevPAR >= 0 ? '#2AAF6A' : '#C03020'}">${fmtNotte(totNetRevPAR)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      ${hasPrev ? `<div style="padding:8px 18px;font-size:10px;color:var(--ink2);opacity:.6;text-align:right;border-top:1px solid var(--bdr)">
        ▲▼ variazione occupazione e RevPAR vs ${prevYear}
      </div>` : ''}
    </div>`;
}
