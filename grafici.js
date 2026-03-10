/* ═══════════════════════════════════════════════════════════════════════
   grafici.js — Dashboard Grafici & Analytics
   Versione 1.0

   Grafici prodotti:
   1. Linee mensili  — Lordo / Spese totali / Utile netto (anno selezionato)
   2. Barre mensili  — Notti occupate per appartamento (stacked)
   3. Torta          — Ripartizione entrate: Utile / Commissioni / Tasse / Spese op
   4. Barre orizz.   — Classifica appartamenti per utile netto
   5. Linee multi-anno — Confronto lordo totale anno per anno (se ci sono archivi)
═══════════════════════════════════════════════════════════════════════ */

/* ── Chart.js instances (per destroy/rebuild) ── */
const _charts = {};

/* ── Colori appartamenti ── */
const PROP_COLORS = {
  attico:     '#4E9AF1',
  montenero:  '#56C28A',
  stoccolma:  '#E8894B',
  frescura:   '#A67CF7',
  villa:      '#F2C94C',
  corso:      '#E05C7A',
  anfiteatro: '#5DD4D0',
  scaro:      '#FF9F40',
};

/* ════════════════════════════════════════════════════════════════════
   ENTRY POINT
════════════════════════════════════════════════════════════════════ */
function renderGraficiView() {
  document.getElementById('statsWrap').style.display  = 'none';
  document.getElementById('resWrap').style.display    = 'none';
  document.getElementById('welcome').style.display    = 'none';
  const mp = document.getElementById('manualPanelWrap');  if (mp) mp.style.display = 'none';
  const iw = document.getElementById('incassoWidgetWrap'); if (iw) iw.style.display = 'none';
  const sc = document.getElementById('scIncassoCard');     if (sc) sc.style.display = 'none';
  const scO = document.getElementById('scOccCard');          if (scO) scO.style.display = 'none';
  const sr = document.getElementById('speseRealiWidgetWrap'); if (sr) sr.style.display = 'none';
  const _ow = document.getElementById('occWidget'); if (_ow) _ow.style.display = 'none';

  ['adminView','confrontoView','cercaView','graficiView'].forEach(id => {
    document.getElementById(id)?.remove();
  });

  // Distruggi chart precedenti
  Object.values(_charts).forEach(c => { try { c.destroy(); } catch(_){} });
  Object.keys(_charts).forEach(k => delete _charts[k]);

  /* ── Raccogli dati da localStorage ── */
  const data = _buildGraficiData(viewYear, viewingArchive);

  /* ── HTML contenitore ── */
  const mainC = document.getElementById('mainC');
  mainC.insertAdjacentHTML('beforeend', _buildGraficiHTML(data));

  /* ── Inizializza Chart.js se non ancora caricato ── */
  if (typeof Chart === 'undefined') {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
    s.onload = () => _initCharts(data);
    document.head.appendChild(s);
  } else {
    _initCharts(data);
  }
}

/* ════════════════════════════════════════════════════════════════════
   BUILD DATI
════════════════════════════════════════════════════════════════════ */
function _buildGraficiData(year, isArchive) {
  const MONTHS = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  const realProps = PROPERTIES.filter(p => !p.adminView && !p.confrontoView && !p.cercaView && !p.graficiView);
  const spese     = _gSpese(isArchive, year);
  const IVA=0.22, FEE_PAG=0.015, COEFF=0.40, IRPEF=0.05, INPS=0.2448;

  /* ── Per ogni proprietà: calcola KPI e breakdown mensile ── */
  const propData = realProps.map(prop => {
    const types  = _gGet(isArchive, year, 'types',  prop.id, '{}');
    const fiscal = _gGet(isArchive, year, 'fiscal', prop.id, '{}');
    const bkComm = parseFloat(fiscal.bkComm  ?? 16)   / 100;
    const abComm = parseFloat(fiscal.abComm  ?? 15.5) / 100;
    const inclDir = fiscal.inclDir ?? false;
    const isForf  = (fiscal.regime ?? 'cedolare') === 'forfettario';
    const CED     = 0.21; // aliquota base (approximazione per grafici)

    // Unisci live + past + manual
    const books = [];
    const seen  = new Set();

    const addBook = (raw, isPast) => {
      const b = _deserBook(raw);
      if (!b.checkin || seen.has(b.uid) || b.source === 'blocked') return;
      seen.add(b.uid);
      b._bookType = types[b.uid] || '';
      b.isPast = isPast;
      // Filtra per anno
      if (b.checkin.getFullYear() !== year) return;
      books.push(b);
    };

    try { (_gGet(isArchive, year, 'live', prop.id, '[]') || []).forEach(r => addBook(r, false)); } catch(e){}
    try { Object.values(_gGet(isArchive, year, 'past', prop.id, '{}') || {}).forEach(r => addBook(r, true)); } catch(e){}
    try { (_gGet(isArchive, year, 'manual', prop.id, '[]') || []).forEach(m => {
      if (seen.has(m.uid)) return;
      const ci = m.checkin ? new Date(m.checkin) : null;
      const co = m.checkout ? new Date(m.checkout) : null;
      if (!ci || ci.getFullYear() !== year) return;
      seen.add(m.uid);
      books.push({ uid:m.uid, source:'manual', nome:m.nome||'—', checkin:ci, checkout:co,
        prezzo:m.prezzo??null, notti:m.notti||(ci&&co?Math.round((co-ci)/86400000):null),
        _bookType:m.bookType||'diretta', isPast:true });
    }); } catch(e){}

    // Breakdown mensile
    const monthly = Array.from({length:12}, () => ({
      lordo:0, comm:0, tasse:0, speseOp:0, utile:0, notti:0, nPrenotazioni:0,
    }));

    books.filter(b => b.prezzo !== null).forEach(b => {
      const m   = b.checkin.getMonth();
      const p   = b.prezzo;
      const nn  = b.notti || 0;
      const bt  = b._bookType;
      const isOTA = bt === 'booking' || bt === 'airbnb';

      let comm = 0, nettoComm = p;
      if (bt === 'booking') {
        comm = p * bkComm + p * FEE_PAG + p * bkComm * IVA;
        nettoComm = p - comm;
      } else if (bt === 'airbnb') {
        comm = p * abComm + p * abComm * IVA;
        nettoComm = p - comm;
      }

      let tax = 0;
      if (isForf)      tax = p * COEFF * (IRPEF + INPS);
      else if (isOTA)  tax = p * CED;
      else if (inclDir) tax = p * CED;

      const speseOp = (spese.luce||0)*nn
        + ((spese.welcomePack||0)+(spese.pulizie||0)+(spese.lavanderia||0))
        + (isOTA ? (spese.tassaSoggiorno||0)*nn : 0);

      monthly[m].lordo   += p;
      monthly[m].comm    += comm;
      monthly[m].tasse   += tax;
      monthly[m].speseOp += speseOp;
      monthly[m].utile   += (nettoComm - tax - speseOp);
      monthly[m].notti   += nn;
      monthly[m].nPrenotazioni++;
    });

    const totLordo   = monthly.reduce((s,m)=>s+m.lordo, 0);
    const totComm    = monthly.reduce((s,m)=>s+m.comm, 0);
    const totTasse   = monthly.reduce((s,m)=>s+m.tasse, 0);
    const totSpeseOp = monthly.reduce((s,m)=>s+m.speseOp, 0);
    const totUtile   = monthly.reduce((s,m)=>s+m.utile, 0);
    const totNotti   = monthly.reduce((s,m)=>s+m.notti, 0);
    const gestione   = _gGestione(isArchive, year, prop.id);

    return {
      prop, monthly, books,
      totLordo, totComm, totTasse, totSpeseOp,
      totUtile: totUtile - gestione,
      totNotti, gestione,
      color: PROP_COLORS[prop.id] || '#999',
    };
  }).filter(d => d.totLordo > 0);

  /* ── Aggregato mensile totale (con gestione distribuita proporzionalmente al lordo) ── */
  const aggMonthly = Array.from({length:12}, (_,i) => {
    const lordo   = propData.reduce((s,d)=>s+d.monthly[i].lordo,   0);
    const comm    = propData.reduce((s,d)=>s+d.monthly[i].comm,    0);
    const tasse   = propData.reduce((s,d)=>s+d.monthly[i].tasse,   0);
    const speseOp = propData.reduce((s,d)=>s+d.monthly[i].speseOp, 0);
    const utile   = propData.reduce((s,d)=>s+d.monthly[i].utile,   0);
    const notti   = propData.reduce((s,d)=>s+d.monthly[i].notti,   0);
    // Gestione distribuita proporzionalmente: quota_mensile = gestione_prop * (lordo_mese / lordo_annuo)
    const gestione = propData.reduce((s,d) => {
      if (!d.totLordo) return s;
      return s + d.gestione * (d.monthly[i].lordo / d.totLordo);
    }, 0);
    return { lordo, comm, tasse, speseOp, utile, notti, gestione,
             utileNetto: lordo - comm - tasse - speseOp - gestione };
  });

  /* ── Totali complessivi ── */
  const totLordo   = propData.reduce((s,d)=>s+d.totLordo,   0);
  const totComm    = propData.reduce((s,d)=>s+d.totComm,    0);
  const totTasse   = propData.reduce((s,d)=>s+d.totTasse,   0);
  const totSpeseOp = propData.reduce((s,d)=>s+d.totSpeseOp, 0);
  const totGest    = propData.reduce((s,d)=>s+d.gestione,   0);
  const totUtile   = propData.reduce((s,d)=>s+d.totUtile,   0);
  const totNotti   = propData.reduce((s,d)=>s+d.totNotti,   0);

  /* ── Utile per titolare (Mamma vs GP) ── */
  const nettoMamma = propData.filter(d=>MAMMA_IDS.includes(d.prop.id)).reduce((s,d)=>s+d.totUtile,0);
  const nettoGP    = propData.filter(d=>GP_IDS.includes(d.prop.id)).reduce((s,d)=>s+d.totUtile,0);

  /* ── Dati multi-anno (da archivi) ── */
  const archivedYears = getArchivedYears();
  const multiAnno = _buildMultiAnnoData([...archivedYears, CURRENT_YEAR].sort());

  /* ── Distribuzione Spese Reali ── */
  const TAG_COLORS = {
    Spese:'#4E9AF1', Pulizie:'#56C28A', Lavanderia:'#A67CF7',
    Condominio:'#F2A93B', Manutenzione:'#E05C7A', Tasse:'#FF6B6B',
    Affitto:'#B84228', Bombola:'#5DADE2', ENEL:'#F39C12', Varie:'#8A8A8A'
  };
  let speseRealiRaw = [];
  try { speseRealiRaw = JSON.parse(localStorage.getItem(isArchive ? `octo_arch_${year}_spese_reali_v3` : 'octo_spese_reali_v3') || '[]'); } catch(_) {}

  // Per tag
  const speseByTag = {};
  speseRealiRaw.forEach(e => {
    speseByTag[e.tag] = (speseByTag[e.tag]||0) + (parseFloat(e.importo)||0);
  });
  // Per appartamento
  const speseByProp = {};
  speseRealiRaw.forEach(e => {
    speseByProp[e.propId] = (speseByProp[e.propId]||0) + (parseFloat(e.importo)||0);
  });
  // Per mese
  const speseByMonth = Array(12).fill(0);
  speseRealiRaw.forEach(e => {
    if (!e.data) return;
    const m = parseInt(e.data.split('-')[1], 10) - 1;
    if (m >= 0 && m < 12) speseByMonth[m] += parseFloat(e.importo)||0;
  });
  const totSpeseReali = speseRealiRaw.reduce((s,e)=>s+(parseFloat(e.importo)||0), 0);

  return {
    year, propData, aggMonthly, MONTHS,
    totLordo, totComm, totTasse, totSpeseOp, totGest, totUtile, totNotti,
    nettoMamma, nettoGP,
    multiAnno,
    speseByTag, speseByProp, speseByMonth, totSpeseReali, TAG_COLORS,
  };
}

/* ── Helper lettura da storage year-aware ── */
function _gGet(isArchive, year, suffix, propId, emptyVal) {
  const key = isArchive
    ? `octo_arch_${year}_${suffix}_${propId}_v3`
    : `octo_${suffix}_${propId}_v3`;
  try { return JSON.parse(localStorage.getItem(key) || emptyVal); } catch(e) { return JSON.parse(emptyVal); }
}
function _gSpese(isArchive, year) {
  const key = isArchive ? `octo_arch_${year}_octo_spese_v3` : 'octo_spese_v3';
  try { const d = JSON.parse(localStorage.getItem(key)||'{}');
    return { luce:+(d.luce??3), welcomePack:+(d.welcomePack??15),
      pulizie:+(d.pulizie??50), lavanderia:+(d.lavanderia??20),
      tassaSoggiorno:+(d.tassaSoggiorno??0) }; } catch(e) { return {luce:3,welcomePack:15,pulizie:50,lavanderia:20,tassaSoggiorno:0}; }
}
function _gGestione(isArchive, year, propId) {
  const key = isArchive ? `octo_arch_${year}_octo_gestione_v3` : 'octo_gestione_v3';
  try { return parseFloat(JSON.parse(localStorage.getItem(key)||'{}')[propId] ?? 0); } catch(e){ return 0; }
}
function _deserBook(b) {
  return { ...b, checkin: b.checkin?new Date(b.checkin):null, checkout:b.checkout?new Date(b.checkout):null };
}

/* ── Multi-anno: lordo totale per anno ── */
function _buildMultiAnnoData(years) {
  return years.map(y => {
    const isCur  = (y === CURRENT_YEAR);
    const isArch = !isCur;
    const realProps = PROPERTIES.filter(p => !p.adminView && !p.confrontoView && !p.cercaView && !p.graficiView);
    let lordo=0, utile=0, notti=0;
    realProps.forEach(prop => {
      const types  = _gGet(isArch, y, 'types',  prop.id, '{}');
      const fiscal = _gGet(isArch, y, 'fiscal', prop.id, '{}');
      const bkComm = parseFloat(fiscal.bkComm??16)/100;
      const abComm = parseFloat(fiscal.abComm??15.5)/100;
      const isForf = (fiscal.regime??'cedolare')==='forfettario';
      const CED=0.21; const IVA=0.22,FEE_PAG=0.015,COEFF=0.40,IRPEF=0.05,INPS=0.2448;
      const sp = _gSpese(isArch, y);

      const books = [];
      const seen  = new Set();
      const add = (raw, past) => {
        const b = _deserBook(raw);
        if (!b.checkin || seen.has(b.uid) || b.source==='blocked') return;
        if (b.checkin.getFullYear() !== y) return;
        seen.add(b.uid);
        b._bookType = types[b.uid]||'';
        books.push(b);
      };
      try { (_gGet(isArch,y,'live',prop.id,'[]')||[]).forEach(r=>add(r,false)); } catch(e){}
      try { Object.values(_gGet(isArch,y,'past',prop.id,'{}')||{}).forEach(r=>add(r,true)); } catch(e){}
      try { (_gGet(isArch,y,'manual',prop.id,'[]')||[]).forEach(m=>{
        if (seen.has(m.uid)) return;
        const ci=m.checkin?new Date(m.checkin):null;
        if (!ci||ci.getFullYear()!==y) return;
        seen.add(m.uid);
        books.push({uid:m.uid,prezzo:m.prezzo??null,notti:m.notti||null,_bookType:m.bookType||'diretta',source:'manual'});
      }); } catch(e){}

      books.filter(b=>b.prezzo!==null).forEach(b => {
        const p=b.prezzo, bt=b._bookType, nn=b.notti||0;
        const isOTA=bt==='booking'||bt==='airbnb';
        let comm=0, nc=p;
        if (bt==='booking') { comm=p*bkComm+p*FEE_PAG+p*bkComm*IVA; nc=p-comm; }
        else if (bt==='airbnb') { comm=p*abComm+p*abComm*IVA; nc=p-comm; }
        let tax=0;
        if (isForf) tax=p*COEFF*(IRPEF+INPS);
        else if (isOTA||fiscal.inclDir) tax=p*CED;
        const so=(sp.luce||0)*nn+((sp.welcomePack||0)+(sp.pulizie||0)+(sp.lavanderia||0))+(isOTA?(sp.tassaSoggiorno||0)*nn:0);
        lordo += p;
        utile += (nc-tax-so);
        notti += nn;
      });
    });
    return { year:y, lordo, utile: utile - (realProps.reduce((s,pr)=>s+_gGestione(isArch,y,pr.id),0)), notti };
  }).filter(d => d.lordo > 0);
}

/* ════════════════════════════════════════════════════════════════════
   BUILD HTML
════════════════════════════════════════════════════════════════════ */
function _buildGraficiHTML(d) {
  const fmt = n => '€' + Math.round(n).toLocaleString('it-IT');
  const pct = (a, tot) => tot > 0 ? (a/tot*100).toFixed(1)+'%' : '—';

  const kpiCards = [
    { ico:'💰', lbl:'Lordo totale',    val:fmt(d.totLordo),   color:'#4E9AF1', sub:`${d.totNotti} notti totali` },
    { ico:'🔁', lbl:'Commissioni OTA', val:fmt(d.totComm),    color:'#F2A93B', sub:pct(d.totComm, d.totLordo)+' del lordo' },
    { ico:'🏛',  lbl:'Tasse',           val:fmt(d.totTasse),   color:'#E05C7A', sub:pct(d.totTasse, d.totLordo)+' del lordo' },
    { ico:'🔧', lbl:'Spese operative', val:fmt(d.totSpeseOp), color:'#A67CF7', sub:'Luce · pulizie · welcome' },
    { ico:'📈', lbl:'Utile netto',     val:fmt(d.totUtile),   color:'#56C28A', sub:pct(d.totUtile, d.totLordo)+' del lordo' },
  ].map(k => `
    <div class="gc-kpi-card">
      <div class="gc-kpi-ico" style="color:${k.color}">${k.ico}</div>
      <div class="gc-kpi-body">
        <div class="gc-kpi-val" style="color:${k.color}">${k.val}</div>
        <div class="gc-kpi-lbl">${k.lbl}</div>
        <div class="gc-kpi-sub">${k.sub}</div>
      </div>
    </div>`).join('');

  const showMultiAnno = d.multiAnno.length >= 2;

  return `
  <div id="graficiView" class="grafici-view">

    <!-- Header -->
    <div class="gc-header">
      <div class="gc-title-block">
        <div class="gc-eyebrow">Analisi rendimenti</div>
        <div class="gc-title">📈 Dashboard Grafici <span class="gc-year-badge">${d.year}</span></div>
      </div>
      <div class="gc-header-actions">
        <button class="btn btn-gh btn-sm" onclick="renderGraficiView()">↺ Aggiorna</button>
      </div>
    </div>

    <!-- KPI summary row -->
    <div class="gc-kpi-row">${kpiCards}</div>

    <!-- RIGA 1: Andamento mensile lordo/spese/utile + Torta ripartizione -->
    <div class="gc-row-2col">

      <div class="gc-card gc-card-wide">
        <div class="gc-card-hdr">
          <span class="gc-card-title">📅 Andamento mensile — Ripartizione entrate</span>
          <div class="gc-legend-row" id="legendMensile" style="flex-wrap:wrap;gap:6px"></div>
        </div>
        <div class="gc-canvas-wrap">
          <canvas id="chartMensile" style="min-height:260px"></canvas>
        </div>
      </div>

      <div class="gc-card">
        <div class="gc-card-hdr">
          <span class="gc-card-title">🥧 Ripartizione entrate</span>
        </div>
        <div class="gc-canvas-wrap gc-canvas-pie">
          <canvas id="chartTorta"></canvas>
        </div>
        <div class="gc-torta-legend" id="tortaLegend"></div>
      </div>

    </div>

    <!-- RIGA 2: Lordo per appartamento (stacked) + Lordo vs Netto mensile -->
    <div class="gc-row-2col">

      <div class="gc-card">
        <div class="gc-card-hdr">
          <span class="gc-card-title">🏠 Lordo mensile per appartamento</span>
        </div>
        <div class="gc-canvas-wrap">
          <canvas id="chartLordoStack"></canvas>
        </div>
      </div>

      <div class="gc-card">
        <div class="gc-card-hdr">
          <span class="gc-card-title">📊 Lordo vs Netto — mese per mese</span>
        </div>
        <div class="gc-canvas-wrap">
          <canvas id="chartLordoNetto"></canvas>
        </div>
      </div>

    </div>

    <!-- RIGA 3: Classifica appartamenti (intera larghezza) -->
    <div class="gc-row-full">
      <div class="gc-card">
        <div class="gc-card-hdr">
          <span class="gc-card-title">🏆 Classifica appartamenti — Lordo vs Utile netto</span>
        </div>
        <div class="gc-canvas-wrap" id="gcClassificaWrap">
          <canvas id="chartClassifica"></canvas>
        </div>
      </div>
    </div>

    ${showMultiAnno ? `
    <!-- RIGA 3: Trend multi-anno -->
    <div class="gc-row-full">
      <div class="gc-card">
        <div class="gc-card-hdr">
          <span class="gc-card-title">📆 Confronto annuale — Lordo vs Utile</span>
          <span class="gc-card-sub">Tutti gli anni archiviati + anno corrente</span>
        </div>
        <div class="gc-canvas-wrap gc-canvas-thin">
          <canvas id="chartMultiAnno"></canvas>
        </div>
      </div>
    </div>` : ''}

    <!-- RIGA SPESE REALI -->
    ${d.totSpeseReali > 0 ? `
    <div class="gc-row-2col">

      <div class="gc-card">
        <div class="gc-card-hdr">
          <span class="gc-card-title">🔧 Spese reali per categoria</span>
          <span class="gc-card-sub">Totale: −€${Math.round(d.totSpeseReali).toLocaleString('it-IT')}</span>
        </div>
        <div style="display:flex;gap:16px;align-items:flex-start">
          <div class="gc-canvas-wrap gc-canvas-pie" style="flex:0 0 160px;height:180px">
            <canvas id="chartSpeseDonut"></canvas>
          </div>
          <div id="speseLegend" style="flex:1;display:flex;flex-direction:column;gap:5px;padding-top:4px"></div>
        </div>
      </div>

      <div class="gc-card">
        <div class="gc-card-hdr">
          <span class="gc-card-title">📅 Spese reali per mese</span>
        </div>
        <div class="gc-canvas-wrap">
          <canvas id="chartSpeseMensile"></canvas>
        </div>
      </div>

    </div>
    <div class="gc-row-full">
      <div class="gc-card">
        <div class="gc-card-hdr">
          <span class="gc-card-title">🏠 Spese reali per appartamento</span>
        </div>
        <div class="gc-canvas-wrap gc-canvas-thin">
          <canvas id="chartSpeseProp"></canvas>
        </div>
      </div>
    </div>` : `
    <div class="gc-row-full">
      <div class="gc-card" style="align-items:center;justify-content:center;padding:30px;opacity:.55">
        <div style="font-size:28px;margin-bottom:8px">🔧</div>
        <div style="font-size:13px;font-weight:700;color:var(--ink)">Nessuna spesa reale registrata</div>
        <div style="font-size:11px;color:var(--ink2);margin-top:4px">Vai alla scheda Spese per aggiungere le spese operative reali</div>
      </div>
    </div>`}

  </div>`;
}

/* ════════════════════════════════════════════════════════════════════
   INIT CHARTS
════════════════════════════════════════════════════════════════════ */
function _initCharts(d) {
  Chart.defaults.color = '#6A6050';  // var(--ink2) light theme
  Chart.defaults.font.family = "'Manrope', sans-serif";
  Chart.defaults.font.size   = 11;

  const grid = {
    color: 'rgba(15,31,46,0.07)',
    drawBorder: false,
  };
  const noGrid = { display: false };
  const tooltipStyle = {
    backgroundColor: '#FDFAF4',
    borderColor: '#D5CCB8',
    borderWidth: 1,
    padding: 10,
    cornerRadius: 8,
    titleColor: '#18160F',
    bodyColor: '#6A6050',
    callbacks: {
      label: ctx => {
        const val = ctx.parsed.y ?? ctx.parsed;
        return ` ${ctx.dataset.label}: €${Math.round(val).toLocaleString('it-IT')}`;
      }
    }
  };

  /* ─── 1. Andamento mensile ─────────────────────────────────────────
     Barre stacked (comm + tasse + sp.op + gestione + utile GP + utile Mamma)
     + linea "Utile netto pulito" sovrapposta
     Scala fine: step calcolato su valore massimo / 8 per leggibilità
  ─────────────────────────────────────────────────────────────────── */
  const mLabels     = d.MONTHS;
  const mLordo      = d.aggMonthly.map(m => Math.round(m.lordo));
  const mComm       = d.aggMonthly.map(m => Math.round(m.comm));
  const mTasse      = d.aggMonthly.map(m => Math.round(m.tasse));
  const mSpeseOp    = d.aggMonthly.map(m => Math.round(m.speseOp));
  const mGestione   = d.aggMonthly.map(m => Math.round(m.gestione));
  const mUtileNetto = d.aggMonthly.map(m => Math.round(m.utileNetto));

  // Utile netto Mamma vs GP mensile (proporzionato al lordo del mese)
  const totLordoMamma = d.propData.filter(pd=>MAMMA_IDS.includes(pd.prop.id)).reduce((s,pd)=>s+pd.totLordo,0);
  const totLordoGP    = d.propData.filter(pd=>GP_IDS.includes(pd.prop.id)).reduce((s,pd)=>s+pd.totLordo,0);
  const totNettoMamma = d.propData.filter(pd=>MAMMA_IDS.includes(pd.prop.id)).reduce((s,pd)=>s+pd.totUtile,0);
  const totNettoGP    = d.propData.filter(pd=>GP_IDS.includes(pd.prop.id)).reduce((s,pd)=>s+pd.totUtile,0);

  const mUtileMamma = d.aggMonthly.map((m,i) => {
    if (!totLordoMamma) return 0;
    // quota mensile proporzionale al lordo Mamma del mese su lordo Mamma annuo
    const lordoMammaMese = d.propData
      .filter(pd=>MAMMA_IDS.includes(pd.prop.id))
      .reduce((s,pd)=>s+pd.monthly[i].lordo, 0);
    return Math.max(0, Math.round(lordoMammaMese > 0 ? totNettoMamma * (lordoMammaMese / totLordoMamma) : 0));
  });
  const mUtileGP = mUtileNetto.map((v,i) => Math.max(0, v - mUtileMamma[i]));

  // Scala Y fine: step = maxLordo / 8, arrotondato a centinaia
  const maxVal   = Math.max(...mLordo.filter(v=>v>0), 1000);
  const rawStep  = maxVal / 8;
  const mag      = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const stepSize = Math.ceil(rawStep / (mag * 2)) * (mag * 2);   // arrotonda al doppio dell'ordine di grandezza

  // Registra il plugin inline per l'etichetta max
  Chart.register({
    id: 'maxBarLabel',
    afterDraw(chart) {
      const plugin = chart.config.options?.plugins?.maxBarLabel;
      if (plugin?.afterDraw) plugin.afterDraw(chart);
    }
  });

  _charts.mensile = new Chart(document.getElementById('chartMensile'), {
    type: 'bar',
    data: {
      labels: mLabels,
      datasets: [
        {
          label: 'Commissioni OTA',
          data: mComm,
          backgroundColor: '#F2A93B',
          borderColor: '#F2A93B',
          borderWidth: 0,
          borderRadius: 0,
          stack: 'breakdown',
          order: 3,
        },
        {
          label: 'Tasse (ced./forf.)',
          data: mTasse,
          backgroundColor: '#E05C7A',
          borderColor: '#E05C7A',
          borderWidth: 0,
          borderRadius: 0,
          stack: 'breakdown',
          order: 3,
        },
        {
          label: 'Spese operative',
          data: mSpeseOp,
          backgroundColor: '#A67CF7',
          borderColor: '#A67CF7',
          borderWidth: 0,
          borderRadius: 0,
          stack: 'breakdown',
          order: 3,
        },
        {
          label: 'Affitti / Gestione',
          data: mGestione,
          backgroundColor: '#B84228',
          borderColor: '#B84228',
          borderWidth: 0,
          borderRadius: 0,
          stack: 'breakdown',
          order: 3,
        },
        {
          label: 'Utile netto Mamma',
          data: mUtileMamma,
          backgroundColor: '#56C28A',
          borderColor: '#56C28A',
          borderWidth: 0,
          borderRadius: 0,
          stack: 'breakdown',
          order: 3,
        },
        {
          label: 'Utile netto GP',
          data: mUtileGP,
          backgroundColor: '#4E9AF1',
          borderColor: '#4E9AF1',
          borderWidth: 0,
          borderRadius: 3,
          stack: 'breakdown',
          order: 3,
        },

        {
          label: 'Linea netto Mamma',
          data: mUtileMamma,
          type: 'line',
          borderColor: '#56C28A',
          backgroundColor: 'transparent',
          pointBackgroundColor: '#56C28A',
          pointBorderColor: '#fff',
          pointBorderWidth: 1.5,
          pointRadius: 4,
          pointHoverRadius: 7,
          tension: 0.35,
          fill: false,
          borderWidth: 2,
          order: 1,
          yAxisID: 'y',
          datalabels: { display: false },
        },
        {
          label: 'Linea netto GP',
          data: mUtileGP,
          type: 'line',
          borderColor: '#4E9AF1',
          backgroundColor: 'transparent',
          pointBackgroundColor: '#4E9AF1',
          pointBorderColor: '#fff',
          pointBorderWidth: 1.5,
          pointRadius: 4,
          pointHoverRadius: 7,
          tension: 0.35,
          fill: false,
          borderWidth: 2,
          order: 1,
          yAxisID: 'y',
          datalabels: { display: false },
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        // Plugin inline: etichetta lordo sopra ogni barra mensile
        maxBarLabel: {
          afterDraw(chart) {
            const ctx = chart.ctx;
            const ds  = chart.data.datasets;
            const fmt = v => v >= 1000
              ? '€' + (v/1000).toFixed(v%1000===0?0:1) + 'k'
              : '€' + Math.round(v).toLocaleString('it-IT');

            function drawLabel(x, y, label, bgColor, txtColor) {
              ctx.save();
              ctx.font = 'bold 9px Manrope, sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              const w = ctx.measureText(label).width + 8;
              ctx.fillStyle = bgColor;
              ctx.beginPath();
              if (ctx.roundRect) ctx.roundRect(x - w/2, y - 14, w, 14, 3);
              else { ctx.rect(x - w/2, y - 14, w, 14); }
              ctx.fill();
              ctx.fillStyle = txtColor;
              ctx.fillText(label, x, y);
              ctx.restore();
            }

            // ── Etichette lordo totale stacked (somma di tutti i segmenti) ──
            // Usa il segmento più in alto per trovare la Y
            const stackedDs = ds.filter(d => d.stack === 'breakdown' && !d.hidden);
            if (stackedDs.length) {
              const topDs   = stackedDs[stackedDs.length - 1];
              const topMeta = chart.getDatasetMeta(ds.indexOf(topDs));
              const lordoDs = ds.find(d => d.label === 'Lordo incassato');
              // Se non c'è lordo dataset separato, calcola la somma degli stacked
              const nMonths = topDs.data.length;
              for (let i = 0; i < nMonths; i++) {
                const bar = topMeta?.data[i];
                if (!bar) continue;
                // Somma tutti i valori stacked
                let total = 0;
                stackedDs.forEach(sds => { total += (sds.data[i] || 0); });
                if (!total) continue;
                drawLabel(bar.x, bar.y - 4, fmt(total), 'rgba(20,36,58,.78)', '#A8D4FF');
              }
            }

            // ── Etichette linea GP ──
            const gpLine = ds.find(d => d.label === 'Linea netto GP');
            if (gpLine) {
              const gpMeta = chart.getDatasetMeta(ds.indexOf(gpLine));
              gpLine.data.forEach((v, i) => {
                if (!v) return;
                const pt = gpMeta?.data[i];
                if (!pt) return;
                drawLabel(pt.x, pt.y - 6, fmt(v), 'rgba(20,68,120,.72)', '#A8D4FF');
              });
            }

            // ── Etichette linea Mamma ──
            const mammaLine = ds.find(d => d.label === 'Linea netto Mamma');
            if (mammaLine) {
              const mMeta = chart.getDatasetMeta(ds.indexOf(mammaLine));
              mammaLine.data.forEach((v, i) => {
                if (!v) return;
                const pt = mMeta?.data[i];
                if (!pt) return;
                drawLabel(pt.x, pt.y - 6, fmt(v), 'rgba(20,68,40,.72)', '#A8FFA8');
              });
            }
          }
        },
        tooltip: {
          backgroundColor:'#1A2231', borderColor:'rgba(255,255,255,.12)', borderWidth:1,
          cornerRadius:10, padding:12, titleColor:'#fff', bodyColor:'rgba(255,255,255,.8)',
          callbacks: {
            title: items => `${mLabels[items[0].dataIndex]} — Lordo: €${mLordo[items[0].dataIndex].toLocaleString('it-IT')}`,
            label: ctx => {
              const i = ctx.dataIndex;
              const m = d.aggMonthly[i];
              const labels = {
                'Commissioni OTA':    ` 📘 Comm. OTA:        −€${Math.round(m.comm).toLocaleString('it-IT')}`,
                'Tasse (ced./forf.)': ` 🏛  Tasse:            −€${Math.round(m.tasse).toLocaleString('it-IT')}`,
                'Spese operative':    ` ⚡ Sp. operative:    −€${Math.round(m.speseOp).toLocaleString('it-IT')}`,
                'Affitti / Gestione': ` 🏠 Affitti/gest.:    −€${Math.round(m.gestione).toLocaleString('it-IT')}`,
                'Utile netto Mamma':  ` 👩 Utile Mamma:      €${mUtileMamma[i].toLocaleString('it-IT')}`,
                'Utile netto GP':     ` 👤 Utile GP:         €${mUtileGP[i].toLocaleString('it-IT')}`,
                'Lordo incassato':    null,
                'Linea netto Mamma':  ` 👩 Linea Mamma:      €${mUtileMamma[i].toLocaleString('it-IT')}`,
                'Linea netto GP':    ` 👤 Linea GP:         €${mUtileGP[i].toLocaleString('it-IT')}`,
              };
              return labels[ctx.dataset.label] ?? null;
            },
            filter: ctx => ctx.parsed.y !== 0,
          }
        },
      },
      scales: {
        x: { stacked: true, grid, ticks: { color: '#6A6050', font:{size:10} } },
        y: {
          stacked: true, grid,
          ticks: {
            color: '#6A6050', font:{size:10},
            stepSize,
            maxTicksLimit: 9,
            callback: v => {
              if (Math.abs(v) >= 1000) return '€' + (v/1000).toFixed(v%1000===0?0:1) + 'k';
              return '€' + v;
            }
          },
          beginAtZero: true,
        },
      },
    }
  });

  // Legenda custom mensile
  const legendEl = document.getElementById('legendMensile');
  if (legendEl) {
    const items = [
      { c:'#F2A93B', l:'Comm. OTA' },
      { c:'#E05C7A', l:'Tasse' },
      { c:'#A67CF7', l:'Sp. operative' },
      { c:'#B84228', l:'Affitti/gest.' },
      { c:'#56C28A', l:'Utile Mamma' },
      { c:'#4E9AF1', l:'Utile GP' },
      { c:'#56C28A', l:'Linea Mamma', line:true },
      { c:'#4E9AF1', l:'Linea GP', line:true },
    ];
    legendEl.innerHTML = items.map(x =>
      x.line
        ? `<span style="display:inline-block;width:18px;height:3px;background:${x.c};border-radius:2px;vertical-align:middle;margin-right:4px"></span><span style="font-size:10px;color:var(--ink2)">${x.l}</span>`
        : `<span class="gc-leg-dot" style="background:${x.c}"></span><span style="font-size:10px;color:var(--ink2)">${x.l}</span>`
    ).join('');
  }

  /* ─── 2. Torta ripartizione ─────────────────────────────────────────
     Breakdown del lordo totale in 6 fette:
     Commissioni OTA · Tasse · Sp.operative · Affitti/Gestione ·
     Utile netto Mamma · Utile netto GP
     L'utile negativo viene assorbito dal totale "Utile" per non avere fette negative.
  ─────────────────────────────────────────────────────────────────── */
  const totaleLordo = d.totLordo || 1;
  const utileMammaVal = Math.max(0, totNettoMamma);
  const utileGPVal    = Math.max(0, totNettoGP);
  // Resto non assegnato (se utile < 0, la differenza rimane in "Comm/Tasse")
  const tortaPieces = [
    { lbl: 'Commissioni OTA',         val: d.totComm,    color: '#F2A93B' },
    { lbl: 'Tasse (ced. / forf.)',     val: d.totTasse,   color: '#E05C7A' },
    { lbl: 'Spese operative (stim.)',  val: d.totSpeseOp, color: '#A67CF7' },
    { lbl: 'Affitti / Gestione',       val: d.totGest,    color: '#B84228' },
    { lbl: '👩 Utile netto Mamma',    val: utileMammaVal, color: '#56C28A' },
    { lbl: '👤 Utile netto GP',       val: utileGPVal,    color: '#4E9AF1' },
  ].filter(x => x.val >= 0);

  const totalePezzi = tortaPieces.reduce((s,x)=>s+x.val,0);

  _charts.torta = new Chart(document.getElementById('chartTorta'), {
    type: 'doughnut',
    data: {
      labels: tortaPieces.map(x => x.lbl),
      datasets: [{
        data:            tortaPieces.map(x => x.val),
        backgroundColor: tortaPieces.map(x => x.color),
        borderColor:     '#F2EDE3',
        borderWidth: 3,
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '60%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1A2231', borderColor:'rgba(255,255,255,.12)', borderWidth:1,
          cornerRadius:8, padding:10, titleColor:'#fff', bodyColor:'rgba(255,255,255,.8)',
          callbacks: {
            label: ctx => {
              const v   = ctx.parsed;
              const pct = (v / totaleLordo * 100).toFixed(1);
              return ` €${Math.round(v).toLocaleString('it-IT')} — ${pct}% del lordo`;
            }
          }
        },
      },
    }
  });

  // Legenda torta estesa
  const tortaLeg = document.getElementById('tortaLegend');
  if (tortaLeg) {
    tortaLeg.innerHTML = tortaPieces.map(x => {
      const pct = (x.val / totaleLordo * 100).toFixed(1);
      const isMammaGP = x.lbl.startsWith('👩') || x.lbl.startsWith('👤');
      return `
        <div class="gc-torta-leg-row" ${isMammaGP ? 'style="font-weight:700;opacity:1"' : ''}>
          <span class="gc-leg-dot" style="background:${x.color}"></span>
          <span class="gc-torta-lbl">${x.lbl}</span>
          <span class="gc-torta-val">€${Math.round(x.val).toLocaleString('it-IT')}</span>
          <span class="gc-torta-pct" style="${isMammaGP?'color:'+x.color+';font-weight:700':''}">
            ${pct}%
          </span>
        </div>`;
    }).join('') + `
        <div class="gc-torta-leg-row" style="border-top:1px solid var(--bdr);margin-top:6px;padding-top:6px;opacity:.7">
          <span class="gc-leg-dot" style="background:transparent;border:1.5px solid var(--ink2)"></span>
          <span class="gc-torta-lbl" style="font-size:9.5px">Lordo totale</span>
          <span class="gc-torta-val">€${Math.round(d.totLordo).toLocaleString('it-IT')}</span>
          <span class="gc-torta-pct">100%</span>
        </div>`;
  }

  /* ─── 3. Lordo mensile stacked per appartamento ──── */
  _charts.lordoStack = new Chart(document.getElementById('chartLordoStack'), {
    type: 'bar',
    data: {
      labels: d.MONTHS,
      datasets: d.propData.map(pd => ({
        label: pd.prop.name,
        data:  pd.monthly.map(m => Math.round(m.lordo)),
        backgroundColor: pd.color + 'CC',
        borderColor:     pd.color,
        borderWidth: 1,
        borderRadius: 3,
        stack: 'lordo',
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true, position: 'bottom',
          labels: { color:'#6A6050', font:{size:10}, boxWidth:10, padding:8 }
        },
        tooltip: {
          backgroundColor:'#FDFAF4', borderColor:'#D5CCB8', borderWidth:1,
          cornerRadius:8, padding:10, titleColor:'#18160F', bodyColor:'#6A6050',
          callbacks: {
            title: items => {
              const i = items[0].dataIndex;
              const tot = d.propData.reduce((s,pd)=>s+Math.round(pd.monthly[i].lordo),0);
              return `${d.MONTHS[i]} — Totale: €${tot.toLocaleString('it-IT')}`;
            },
            label: ctx => ` ${ctx.dataset.label}: €${Math.round(ctx.parsed.y).toLocaleString('it-IT')}`
          }
        },
        stackTotalLabel: {
          afterDraw(chart) {
            const ctx2 = chart.ctx;
            const ds2  = chart.data.datasets.filter(ds => !ds.hidden);
            if (!ds2.length) return;
            const topDs   = ds2[ds2.length - 1];
            const topMeta = chart.getDatasetMeta(chart.data.datasets.indexOf(topDs));
            const nM = topDs.data.length;
            ctx2.save();
            ctx2.font = 'bold 9px Manrope, sans-serif';
            ctx2.textAlign = 'center';
            ctx2.textBaseline = 'bottom';
            for (let i = 0; i < nM; i++) {
              const bar = topMeta?.data[i];
              if (!bar) continue;
              let tot = 0;
              chart.data.datasets.forEach(sds => { if (!sds.hidden) tot += (sds.data[i]||0); });
              if (!tot) continue;
              const lbl = tot >= 1000 ? '€'+(tot/1000).toFixed(tot%1000===0?0:1)+'k' : '€'+tot.toLocaleString('it-IT');
              const w = ctx2.measureText(lbl).width + 8;
              ctx2.fillStyle = 'rgba(20,36,58,.75)';
              ctx2.beginPath();
              if (ctx2.roundRect) ctx2.roundRect(bar.x - w/2, bar.y - 18, w, 14, 3);
              else ctx2.rect(bar.x - w/2, bar.y - 18, w, 14);
              ctx2.fill();
              ctx2.fillStyle = '#E8D4FF';
              ctx2.fillText(lbl, bar.x, bar.y - 4);
            }
            ctx2.restore();
          }
        },
      },
      scales: {
        x: { stacked: true, grid, ticks: { color:'#6A6050', font:{size:10} } },
        y: { stacked: true, grid, ticks: { color:'#6A6050', font:{size:10},
          callback: v => '€'+(v>=1000?(v/1000).toFixed(0)+'k':v) } },
      },
    }
  });
  Chart.register({ id:'stackTotalLabel', afterDraw(chart){ const p=chart.config.options?.plugins?.stackTotalLabel; if(p?.afterDraw) p.afterDraw(chart); } });

  /* ─── 3b. Lordo vs Netto mese per mese ──────────── */
  // Spese totali mensili = comm + tasse + speseOp + gestione
  const mSpese = d.aggMonthly.map(m => Math.round((m.comm||0)+(m.tasse||0)+(m.speseOp||0)+(m.gestione||0)));

  _charts.lordoNetto = new Chart(document.getElementById('chartLordoNetto'), {
    type: 'bar',
    data: {
      labels: d.MONTHS,
      datasets: [
        {
          label: 'Lordo',
          data:  d.aggMonthly.map(m => Math.round(m.lordo)),
          backgroundColor: 'rgba(78,154,241,0.55)',
          borderColor: '#4E9AF1',
          borderWidth: 1.5,
          borderRadius: 4,
        },
        {
          label: 'Spese totali',
          data:  mSpese,
          backgroundColor: 'rgba(224,92,122,0.55)',
          borderColor: '#E05C7A',
          borderWidth: 1.5,
          borderRadius: 4,
        },
        {
          label: 'Utile netto',
          data:  d.aggMonthly.map(m => Math.round(m.utile)),
          backgroundColor: d.aggMonthly.map(m => m.utile < 0 ? 'rgba(224,92,122,0.35)' : 'rgba(86,194,138,0.55)'),
          borderColor: d.aggMonthly.map(m => m.utile < 0 ? '#E05C7A' : '#56C28A'),
          borderWidth: 1.5,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true, position: 'bottom',
          labels: { color:'#6A6050', font:{size:10}, boxWidth:10, padding:8 }
        },
        tooltip: {
          backgroundColor:'#FDFAF4', borderColor:'#D5CCB8', borderWidth:1,
          cornerRadius:8, padding:10, titleColor:'#18160F', bodyColor:'#6A6050',
          callbacks: {
            title: items => {
              const i = items[0].dataIndex;
              const m = d.aggMonthly[i];
              return `${d.MONTHS[i]} — Lordo €${Math.round(m.lordo).toLocaleString('it-IT')}`;
            },
            label: ctx => {
              const i  = ctx.dataIndex;
              const m  = d.aggMonthly[i];
              const lbl = ctx.dataset.label;
              if (lbl === 'Spese totali') {
                return [
                  ` Spese totali: €${mSpese[i].toLocaleString('it-IT')}`,
                  `   📘 Comm.: €${Math.round(m.comm).toLocaleString('it-IT')}`,
                  `   🏛 Tasse: €${Math.round(m.tasse).toLocaleString('it-IT')}`,
                  `   ⚡ Sp.op.: €${Math.round(m.speseOp).toLocaleString('it-IT')}`,
                  `   🏠 Gestione: €${Math.round(m.gestione).toLocaleString('it-IT')}`,
                ];
              }
              return ` ${lbl}: €${Math.round(ctx.parsed.y).toLocaleString('it-IT')}`;
            }
          }
        },
      },
      scales: {
        x: { grid, ticks: { color:'#6A6050', font:{size:10} } },
        y: { grid, ticks: { color:'#6A6050', font:{size:10},
          callback: v => '€'+(v>=1000?(v/1000).toFixed(0)+'k':v) } },
      },
    }
  });

  /* ─── 4. Classifica appartamenti (barre orizzontali) ── */
  const classWrap = document.getElementById('gcClassificaWrap');
  if (classWrap) classWrap.style.height = Math.max(180, d.propData.length * 44) + 'px';
  const sorted  = [...d.propData].sort((a,b) => b.totUtile - a.totUtile);
  _charts.classifica = new Chart(document.getElementById('chartClassifica'), {
    type: 'bar',
    data: {
      labels:   sorted.map(pd => pd.prop.icon + ' ' + pd.prop.name),
      datasets: [
        {
          label: 'Lordo',
          data:  sorted.map(pd => Math.round(pd.totLordo)),
          backgroundColor: sorted.map(pd => pd.color + '55'),
          borderColor:     sorted.map(pd => pd.color),
          borderWidth: 1.5, borderRadius:4,
        },
        {
          label: 'Utile netto',
          data:  sorted.map(pd => Math.round(pd.totUtile)),
          backgroundColor: sorted.map(pd => pd.color + 'CC'),
          borderColor:     sorted.map(pd => pd.color),
          borderWidth: 1.5, borderRadius:4,
        },
      ],
    },
    options: {
      indexAxis: 'y',
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true, position: 'bottom',
          labels: { color:'#6A6050', font:{size:10}, boxWidth:10, padding:8 }
        },
        tooltip: {
          backgroundColor:'#1A2E3E', borderColor:'rgba(255,255,255,.1)', borderWidth:1,
          cornerRadius:8, padding:10, titleColor:'#fff', bodyColor:'rgba(255,255,255,.75)',
          callbacks: { label: ctx => ` ${ctx.dataset.label}: €${Math.round(ctx.parsed.x).toLocaleString('it-IT')}` }
        },
      },
      scales: {
        x: { grid, ticks:{ color:'#6A6050', font:{size:10},
          callback: v => '€'+(v>=1000?(v/1000).toFixed(0)+'k':v) } },
        y: { grid: noGrid, ticks:{ color:'#18160F', font:{size:10,weight:'600'} } },
      },
    }
  });

  /* ─── 5. Multi-anno (se disponibile) ──────────────────── */
  /* ─── Spese Reali charts ─────────────────────── */
  if (d.totSpeseReali > 0) {
    const tagEntries = Object.entries(d.speseByTag).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
    const tagLabels  = tagEntries.map(([t])=>t);
    const tagValues  = tagEntries.map(([,v])=>Math.round(v));
    const tagColors  = tagLabels.map(t => d.TAG_COLORS[t] || '#999');

    // Donut per tag
    if (document.getElementById('chartSpeseDonut')) {
      _charts.speseDonut = new Chart(document.getElementById('chartSpeseDonut'), {
        type: 'doughnut',
        data: {
          labels: tagLabels,
          datasets: [{ data: tagValues, backgroundColor: tagColors, borderColor:'#F2EDE3', borderWidth:3, hoverOffset:5 }]
        },
        options: {
          responsive:true, maintainAspectRatio:false, cutout:'62%',
          plugins: {
            legend:{display:false},
            tooltip:{
              backgroundColor:'#FDFAF4', borderColor:'#D5CCB8', borderWidth:1,
              cornerRadius:8, padding:10, titleColor:'#18160F', bodyColor:'#6A6050',
              callbacks:{ label: ctx => ` €${Math.round(ctx.parsed).toLocaleString('it-IT')} (${(ctx.parsed/d.totSpeseReali*100).toFixed(1)}%)` }
            }
          }
        }
      });

      // Legenda custom
      const leg = document.getElementById('speseLegend');
      if (leg) {
        leg.innerHTML = tagEntries.map(([t,v])=>{
          const col = d.TAG_COLORS[t]||'#999';
          const pct = (v/d.totSpeseReali*100).toFixed(1);
          return `<div style="display:flex;align-items:center;gap:6px">
            <span style="flex-shrink:0;width:9px;height:9px;border-radius:50%;background:${col}"></span>
            <span style="flex:1;font-size:10px;color:var(--ink2)">${t}</span>
            <span style="font-size:11px;font-weight:700;color:#C03020">€${Math.round(v).toLocaleString('it-IT')}</span>
            <span style="font-size:9px;color:var(--ink2);min-width:30px;text-align:right">${pct}%</span>
          </div>`;
        }).join('');
      }
    }

    // Barre mensili spese
    if (document.getElementById('chartSpeseMensile')) {
      _charts.speseMensile = new Chart(document.getElementById('chartSpeseMensile'), {
        type:'bar',
        data:{
          labels: d.MONTHS,
          datasets:[{
            label:'Spese reali',
            data: d.speseByMonth.map(v=>Math.round(v)),
            backgroundColor:'rgba(224,92,122,0.5)',
            borderColor:'#E05C7A', borderWidth:1.5, borderRadius:5,
          }]
        },
        options:{
          responsive:true, maintainAspectRatio:false,
          plugins:{
            legend:{display:false},
            tooltip:{
              backgroundColor:'#FDFAF4', borderColor:'#D5CCB8', borderWidth:1,
              cornerRadius:8, padding:10, titleColor:'#18160F', bodyColor:'#6A6050',
              callbacks:{ label: ctx => ` Spese: €${Math.round(ctx.parsed.y).toLocaleString('it-IT')}` }
            }
          },
          scales:{
            x:{grid, ticks:{color:'#6A6050', font:{size:10}}},
            y:{grid, ticks:{color:'#6A6050', font:{size:10}, callback: v=>'€'+(v>=1000?(v/1000).toFixed(0)+'k':v)}}
          }
        }
      });
    }

    // Barre orizzontali per appartamento
    if (document.getElementById('chartSpeseProp')) {
      const propEntries = Object.entries(d.speseByProp).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
      const realProps = PROPERTIES.filter(p=>!p.adminView&&!p.confrontoView&&!p.cercaView&&!p.graficiView&&!p.speseView);
      const propLabels = propEntries.map(([id])=>{ const p=realProps.find(x=>x.id===id); return p?(p.icon+' '+p.name):id; });
      const propVals   = propEntries.map(([,v])=>Math.round(v));
      const propCols   = propEntries.map(([id])=>PROP_COLORS[id]||'#999');

      const hw = document.getElementById('chartSpeseProp');
      if (hw) hw.parentElement.style.height = Math.max(100, propEntries.length*38)+'px';

      _charts.speseProp = new Chart(hw, {
        type:'bar',
        data:{
          labels: propLabels,
          datasets:[{
            label:'Spese reali',
            data: propVals,
            backgroundColor: propCols.map(c=>c+'88'),
            borderColor: propCols, borderWidth:1.5, borderRadius:5,
          }]
        },
        options:{
          indexAxis:'y',
          responsive:true, maintainAspectRatio:false,
          plugins:{
            legend:{display:false},
            tooltip:{
              backgroundColor:'#FDFAF4', borderColor:'#D5CCB8', borderWidth:1,
              cornerRadius:8, padding:10, titleColor:'#18160F', bodyColor:'#6A6050',
              callbacks:{ label: ctx => ` €${Math.round(ctx.parsed.x).toLocaleString('it-IT')}` }
            }
          },
          scales:{
            x:{grid, ticks:{color:'#6A6050', font:{size:10}, callback: v=>'€'+(v>=1000?(v/1000).toFixed(0)+'k':v)}},
            y:{grid:noGrid, ticks:{color:'#18160F', font:{size:10,weight:'600'}}}
          }
        }
      });
    }
  }

    if (d.multiAnno.length >= 2 && document.getElementById('chartMultiAnno')) {
    const maLabels = d.multiAnno.map(x => String(x.year));
    _charts.multiAnno = new Chart(document.getElementById('chartMultiAnno'), {
      type: 'bar',
      data: {
        labels: maLabels,
        datasets: [
          {
            label: 'Lordo',
            data:  d.multiAnno.map(x => Math.round(x.lordo)),
            backgroundColor: 'rgba(78,154,241,0.25)',
            borderColor: '#4E9AF1', borderWidth:2, borderRadius:6,
            yAxisID: 'y',
          },
          {
            label: 'Utile netto',
            data:  d.multiAnno.map(x => Math.round(x.utile)),
            backgroundColor: 'rgba(86,194,138,0.4)',
            borderColor: '#56C28A', borderWidth:2, borderRadius:6,
            yAxisID: 'y',
          },
          {
            label: 'Notti',
            data:  d.multiAnno.map(x => x.notti),
            type: 'line',
            borderColor: '#F2C94C', backgroundColor: 'rgba(242,201,76,0.08)',
            pointBackgroundColor: '#F2C94C', tension:0.4, fill:false,
            pointRadius:5, borderWidth:2,
            yAxisID: 'y2',
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode:'index', intersect:false },
        plugins: {
          legend: {
            display:true, position:'bottom',
            labels:{ color:'#5A4A38', font:{size:10}, boxWidth:10, padding:10 }
          },
          tooltip: {
            backgroundColor:'#1A2E3E', borderColor:'rgba(255,255,255,.1)', borderWidth:1,
            cornerRadius:8, padding:10, titleColor:'#fff', bodyColor:'rgba(255,255,255,.75)',
            callbacks: {
              label: ctx => {
                if (ctx.datasetIndex === 2) return ` Notti: ${ctx.parsed.y}`;
                return ` ${ctx.dataset.label}: €${Math.round(ctx.parsed.y).toLocaleString('it-IT')}`;
              }
            }
          },
        },
        scales: {
          x:  { grid, ticks:{ color:'#5A4A38', font:{size:11,weight:'700'} } },
          y:  { position:'left',  grid, ticks:{ color:'#6A6050', font:{size:10},
            callback: v => '€'+(v>=1000?(v/1000).toFixed(0)+'k':v) } },
          y2: { position:'right', grid:noGrid, ticks:{ color:'#9A7A20', font:{size:10},
            callback: v => v+' notti' } },
        },
      },
    });
  }
}
