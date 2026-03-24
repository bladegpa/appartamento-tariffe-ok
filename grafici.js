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
    const bkComm  = parseFloat(fiscal.bkComm  ?? 16)   / 100;
    const abComm  = parseFloat(fiscal.abComm  ?? 15.5) / 100;
    const inclDir = fiscal.inclDir ?? false;
    const isForf  = (fiscal.regime ?? 'cedolare') === 'forfettario';
        const IVA = 0.22, FEE_PAG = 0.015, COEFF = 0.40, IRPEF = 0.05, INPS = 0.2448;
    let cedAliquota = 0.21;

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

    let _totLordoOTA=0, _totLordoDir=0, _totNettoLordo=0, _totTaxBase=0, _totNotti=0, _totNBooks=0, _totNottiOTA=0;
    books.filter(b => b.prezzo !== null).forEach(b => {
      const m   = b.checkin.getMonth();
      const p   = b.prezzo;
      const nn  = b.notti || 0;
      // Usa b._bookType esattamente come confronto ('' = skip, identico a calcKpi)
      const bt = b._bookType;
      if (bt !== 'booking' && bt !== 'airbnb' && bt !== 'diretta') return;
      const isOTA = bt === 'booking' || bt === 'airbnb';

      let comm = 0;
      if (bt === 'booking') {
        const _c=p*bkComm,_f=p*FEE_PAG,_i=_c*IVA; comm=_c+_f+_i;
        _totLordoOTA+=p; _totTaxBase+=p; _totNottiOTA+=nn;
      } else if (bt === 'airbnb') {
        const _c=p*abComm,_i=_c*IVA; comm=_c+_i;
        _totLordoOTA+=p; _totTaxBase+=p; _totNottiOTA+=nn;
      } else {
        _totLordoDir+=p; if(inclDir) _totTaxBase+=p;
      }
      _totNettoLordo += p - comm;
      _totNBooks++;

      let tax = 0;
      if (isForf) tax = p * COEFF * (IRPEF + INPS);
      else if (isOTA || (bt==='diretta' && inclDir)) tax = p * cedAliquota;

      const speseOp = (spese.luce||0)*nn
        + ((spese.welcomePack||0)+(spese.pulizie||0)+(spese.lavanderia||0))
        + (isOTA ? (spese.tassaSoggiorno||0)*nn : 0);

      monthly[m].lordo   += p;
      monthly[m].comm    += comm;
      monthly[m].tasse   += tax;
      monthly[m].speseOp += speseOp;
      monthly[m].utile   += (p - comm - tax - speseOp);
      monthly[m].notti   += nn;
      monthly[m].nPrenotazioni++;
    });
    // nottiAll = TUTTI i libri (anche senza prezzo) — identico a calcSpeseOp di views.js
    const _nottiAll  = books.reduce((s,b)=>s+(b.notti||0), 0);
    const _speseOpTot = (spese.luce||0)*_nottiAll + ((spese.welcomePack||0)+(spese.pulizie||0)+(spese.lavanderia||0))*_totNBooks + (spese.tassaSoggiorno||0)*_totNottiOTA;

    const totLordo   = monthly.reduce((s,m)=>s+m.lordo, 0);
    const totComm    = monthly.reduce((s,m)=>s+m.comm, 0);
    const totNotti   = monthly.reduce((s,m)=>s+m.notti, 0);
    const gestione   = _gGestione(isArchive, year, prop.id);
    const _taxAmt    = isForf ? _totTaxBase*COEFF*(IRPEF+INPS) : _totLordoOTA*cedAliquota+(inclDir?_totLordoDir*cedAliquota:0);
    const _netto     = _totNettoLordo - _taxAmt - _speseOpTot - gestione;

    return {
      prop, monthly, books,
      totLordo, totComm,
      totTasse: _taxAmt, totSpeseOp: _speseOpTot,
      totUtile: _netto,
      totNotti, gestione,
      _lordoOTA: _totLordoOTA, _lordoDir: _totLordoDir,
      _nettoLordo: _totNettoLordo, isForf, inclDir, cedAliquota,
      color: PROP_COLORS[prop.id] || '#999',
    };
  }).filter(d => d.totLordo > 0);

  /* ── Post-processing aliquote cedolari e soglie (identico a views.js) ── */
  const _km = {}; propData.forEach(d => _km[d.prop.id] = d);
  const stD=_km['stoccolma'],frD=_km['frescura'];
  if(stD&&frD&&!stD.isForf&&!frD.isForf){
    if(stD._lordoOTA>=frD._lordoOTA){stD.cedAliquota=0.21;frD.cedAliquota=0.26;}
    else{stD.cedAliquota=0.26;frD.cedAliquota=0.21;}
  }
  const vlD=_km['villa'],coD=_km['corso'];
  if(vlD)vlD._threshold=1134; if(coD)coD._threshold=1285.2;
  if(vlD&&coD&&!vlD.isForf&&!coD.isForf){
    if(vlD._lordoOTA>=coD._lordoOTA){vlD.cedAliquota=0.21;coD.cedAliquota=0.26;}
    else{vlD.cedAliquota=0.26;coD.cedAliquota=0.21;}
  }
  propData.forEach(d => {
    if(d.isForf) return;
    const thr = d._threshold||0;
    const newTax = d._lordoOTA*d.cedAliquota+(d.inclDir?d._lordoDir*d.cedAliquota:0);
    let nettoDopoTax;
    if(thr>0){
      const rec=Math.min(newTax,thr), exc=Math.max(0,newTax-thr);
      nettoDopoTax = d._nettoLordo + rec - exc;
    } else { nettoDopoTax = d._nettoLordo - newTax; }
    d.totTasse  = newTax;
    d.totUtile  = nettoDopoTax - d.totSpeseOp - d.gestione;
    if(d.totLordo>0) d.monthly.forEach(m=>{
      const r=m.lordo/d.totLordo;
      m.tasse=newTax*r; m.utile=m.lordo-m.comm-m.tasse-m.speseOp;
    });
  });

  /* ── Aggregato mensile totale (con gestione distribuita proporzionalmente al lordo) ── */
  const aggMonthly = Array.from({length:12}, (_,i) => {
    const lordo   = propData.reduce((s,d)=>s+d.monthly[i].lordo,   0);
    const comm    = propData.reduce((s,d)=>s+d.monthly[i].comm,    0);
    const tasse   = propData.reduce((s,d)=>s+d.monthly[i].tasse,   0);
    const speseOp = propData.reduce((s,d)=>s+d.monthly[i].speseOp, 0);
    const utile   = propData.reduce((s,d)=>s+d.monthly[i].utile,   0);
    const notti   = propData.reduce((s,d)=>s+d.monthly[i].notti,   0);
    // Gestione distribuita proporzionalmente: quota_mensile = gestione_prop * (lordo_mese / lordo_annuo)
    const gestione = propData.reduce((s,d) => s + d.gestione / 12, 0);
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

  // Spese reali per prop per mese (per calcolo netto mensile)
  const speseRealiByPropMonth = {};
  speseRealiRaw.forEach(e => {
    if (!e.data || !e.propId) return;
    const mo = parseInt(e.data.split('-')[1], 10) - 1;
    if (mo < 0 || mo > 11) return;
    if (!speseRealiByPropMonth[e.propId]) speseRealiByPropMonth[e.propId] = Array(12).fill(0);
    speseRealiByPropMonth[e.propId][mo] += parseFloat(e.importo)||0;
  });

  // Netto mensile per proprietà: lordo - comm - tasse - speseReali(se mese passato) altrimenti speseOp - gestione/12
  const TODAY_M = new Date().getMonth();
  const IS_CUR  = year === CURRENT_YEAR;
  propData.forEach(pd => {
    const gestMensile = pd.gestione / 12;
    const srProp = speseRealiByPropMonth[pd.prop.id] || Array(12).fill(0);
    pd.monthlyNetto = pd.monthly.map((m, i) => {
      if (!m.lordo) return 0;
      const isCompleted = !IS_CUR || i < TODAY_M;
      const spese = (isCompleted && srProp[i] > 0) ? srProp[i] : m.speseOp;
      return Math.round(m.lordo - m.comm - m.tasse - spese - gestMensile);
    });
  });

  return {
    year, propData, aggMonthly, MONTHS,
    totLordo, totComm, totTasse, totSpeseOp, totGest, totUtile, totNotti,
    nettoMamma, nettoGP,
    multiAnno,
    speseByTag, speseByProp, speseByMonth, totSpeseReali, TAG_COLORS,
    speseRealiByPropMonth,
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
  try {
    const entry = JSON.parse(localStorage.getItem(key)||'{}')[propId];
    if (!entry) return 0;
    if (typeof entry === 'number') return entry;
    return (parseFloat(entry.affitto)||0) + (parseFloat(entry.condominio)||0) + (parseFloat(entry.varie)||0);
  } catch(e){ return 0; }
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
    { ico:'🔧', lbl:'Spese operative', val:fmt(d.totSpeseOp), color:'#A67CF7', sub:pct(d.totSpeseOp,d.totLordo)+' del lordo' },
    { ico:'🏠', lbl:'Gestione/Affitto',  val:fmt(d.totGest),    color:'#B84228', sub:pct(d.totGest,d.totLordo)+' del lordo' },
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

    <!-- G1: Lordo · Spese · Netto -->
    <div class="gc-row-full">
      <div class="gc-card">
        <div class="gc-card-hdr">
          <span style="display:inline-block;background:var(--acc);color:#fff;font-size:9px;font-weight:700;padding:1px 7px;border-radius:10px;margin-right:6px">G1</span><span class="gc-card-title">📊 Lordo · Spese · Netto — mese per mese</span>
          <div class="gc-legend-row" id="legendLSN" style="flex-wrap:wrap;gap:6px"></div>
        </div>
        <div class="gc-canvas-wrap" style="min-height:300px">
          <canvas id="chartLordoSpeseNetto"></canvas>
        </div>
      </div>
    </div>

    <!-- G2: Torta -->
    <div class="gc-row-full">
      <div class="gc-card">
        <div class="gc-card-hdr">
          <span style="display:inline-block;background:var(--acc);color:#fff;font-size:9px;font-weight:700;padding:1px 7px;border-radius:10px;margin-right:6px">G2</span><span class="gc-card-title">🥧 Ripartizione entrate sul lordo</span>
        </div>
        <div style="display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap">
          <div style="flex:0 0 200px;height:200px;position:relative">
            <canvas id="chartTorta"></canvas>
          </div>
          <div class="gc-torta-legend" id="tortaLegend" style="flex:1;min-width:200px;padding-top:8px"></div>
        </div>
      </div>
    </div>

    <!-- G3: Classifica -->
    <div class="gc-row-full">
      <div class="gc-card">
        <div class="gc-card-hdr">
          <span style="display:inline-block;background:var(--acc);color:#fff;font-size:9px;font-weight:700;padding:1px 7px;border-radius:10px;margin-right:6px">G3</span><span class="gc-card-title">🏆 Classifica appartamenti — Lordo vs Utile netto</span>
        </div>
        <div id="gcClassificaWrap" style="position:relative;min-height:300px">
          <canvas id="chartClassifica"></canvas>
        </div>
      </div>
    </div>

    <!-- G4: Spese reali per appartamento -->
    ${d.totSpeseReali > 0 ? `
    <div class="gc-row-full">
      <div class="gc-card">
        <div class="gc-card-hdr">
          <span style="display:inline-block;background:var(--acc);color:#fff;font-size:9px;font-weight:700;padding:1px 7px;border-radius:10px;margin-right:6px">G4</span><span class="gc-card-title">🔧 Spese reali per appartamento</span>
          <span class="gc-card-sub">Totale: −€${Math.round(d.totSpeseReali).toLocaleString('it-IT')}</span>
        </div>
        <div id="gcSpesePropWrap" style="position:relative;min-height:260px">
          <canvas id="chartSpeseProp"></canvas>
        </div>
      </div>
    </div>` : ''}

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

  // Aggregati Mamma / GP (erano definiti nel blocco mensile rimosso)
  const totNettoMamma = d.propData.filter(pd=>MAMMA_IDS.includes(pd.prop.id)).reduce((s,pd)=>s+pd.totUtile,0);
  const totNettoGP    = d.propData.filter(pd=>GP_IDS.includes(pd.prop.id)).reduce((s,pd)=>s+pd.totUtile,0);
  /* ─── G1. Lordo · Spese · Netto ─── */
  if (document.getElementById('chartLordoSpeseNetto')) {
    const _g1L=d.aggMonthly.map(m=>Math.round(m.lordo));
    const _g1S=d.aggMonthly.map(m=>Math.round((m.comm||0)+(m.tasse||0)+(m.speseOp||0)+(m.gestione||0)));
    const _g1N=d.aggMonthly.map(m=>Math.round(m.utileNetto));
    const _g1F=v=>Math.abs(v)>=1000?'€'+(Math.abs(v)/1000).toFixed(1)+'k':'€'+Math.abs(Math.round(v)).toLocaleString('it-IT');
    _charts.lordoSpeseNetto=new Chart(document.getElementById('chartLordoSpeseNetto'),{
      type:'bar',data:{labels:d.MONTHS,datasets:[
        {label:'Lordo',data:_g1L,backgroundColor:'rgba(78,154,241,0.55)',borderColor:'#4E9AF1',borderWidth:1.5,borderRadius:4},
        {label:'Spese totali',data:_g1S,backgroundColor:'rgba(242,169,59,0.65)',borderColor:'#F2A93B',borderWidth:1.5,borderRadius:4},
        {label:'Netto',data:_g1N,backgroundColor:_g1N.map(v=>v<0?'rgba(224,92,122,0.45)':'rgba(86,194,138,0.65)'),borderColor:_g1N.map(v=>v<0?'#E05C7A':'#56C28A'),borderWidth:1.5,borderRadius:4},
      ]},
      options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{display:false},
          tooltip:{backgroundColor:'#1A2231',borderColor:'rgba(255,255,255,.12)',borderWidth:1,cornerRadius:10,padding:12,titleColor:'#fff',bodyColor:'rgba(255,255,255,.8)',
            callbacks:{
              title:items=>'G1 · '+d.MONTHS[items[0].dataIndex]+' — Lordo: €'+_g1L[items[0].dataIndex].toLocaleString('it-IT'),
              label:ctx=>{const i=ctx.dataIndex,m=d.aggMonthly[i];
                if(ctx.dataset.label==='Lordo') return ' 💰 Lordo: €'+_g1L[i].toLocaleString('it-IT');
                if(ctx.dataset.label==='Spese totali') return [' 🔴 Spese: €'+_g1S[i].toLocaleString('it-IT'),'   📘 Comm.: €'+Math.round(m.comm||0).toLocaleString('it-IT'),'   🏛 Tasse: €'+Math.round(m.tasse||0).toLocaleString('it-IT'),'   ⚡ Sp.op.: €'+Math.round(m.speseOp||0).toLocaleString('it-IT'),'   🏠 Gestione: €'+Math.round(m.gestione||0).toLocaleString('it-IT')];
                return ' 📈 Netto: €'+_g1N[i].toLocaleString('it-IT');}
            }},
          g1Lbl:{afterDraw(ch){const ctx2=ch.ctx;ctx2.save();ch.data.datasets.forEach((ds,di)=>{const meta=ch.getDatasetMeta(di);if(ds.hidden)return;meta.data.forEach((bar,i)=>{const val=ds.data[i];if(!val)return;ctx2.font='bold 9px Manrope,sans-serif';ctx2.textAlign='center';ctx2.textBaseline='bottom';const col=ds.label==='Lordo'?'#4E9AF1':ds.label==='Spese totali'?'#E05C7A':(val<0?'#E05C7A':'#56C28A');ctx2.fillStyle=col;ctx2.fillText(_g1F(val),bar.x,val>=0?bar.y-4:bar.y+14);});});ctx2.restore();}}
        },
        scales:{x:{grid,ticks:{color:'#6A6050',font:{size:10}}},y:{grid,ticks:{color:'#6A6050',font:{size:10},callback:v=>'€'+(v>=1000?(v/1000).toFixed(0)+'k':v)},beginAtZero:true}}
      }
    });
    Chart.register({id:'g1Lbl',afterDraw(ch){const p=ch.config.options?.plugins?.g1Lbl;if(p?.afterDraw)p.afterDraw(ch);}});
    const _lLSN=document.getElementById('legendLSN');
    if(_lLSN)_lLSN.innerHTML=[{c:'#4E9AF1',l:'Lordo'},{c:'#E05C7A',l:'Spese totali'},{c:'#56C28A',l:'Netto'}].map(x=>'<span class="gc-leg-dot" style="background:'+x.c+'"></span><span style="font-size:10px;color:var(--ink2)">'+x.l+'</span>').join('');
  }

  /* ─── 2. Torta ripartizione ─────────────────────────────────────────

     Breakdown del lordo totale in 6 fette:
     Commissioni OTA · Tasse · Sp.operative · Affitti/Gestione ·
     Utile netto Mamma · Utile netto GP
     L'utile negativo viene assorbito dal totale "Utile" per non avere fette negative.
  ─────────────────────────────────────────────────────────────────── */
  const totaleLordo = d.totLordo || 1;
  const tortaPieces = [
    { lbl: 'Commissioni OTA',       val: d.totComm,             color: '#F2A93B' },
    { lbl: 'Tasse (ced. / forf.)',  val: d.totTasse,            color: '#E05C7A' },
    { lbl: 'Spese operative',       val: d.totSpeseOp,          color: '#A67CF7' },
    { lbl: 'Affitti / Gestione',    val: d.totGest,             color: '#B84228' },
    { lbl: '📈 Utile netto totale', val: Math.max(0,d.totUtile), color: '#56C28A' },
  ].filter(x => x.val > 0);

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
              return ` ${pct}% — €${Math.round(v).toLocaleString('it-IT')}`;
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
      return `
        <div class="gc-torta-leg-row">
          <span class="gc-leg-dot" style="background:${x.color}"></span>
          <span class="gc-torta-lbl">${x.lbl}</span>
          <span class="gc-torta-val">€${Math.round(x.val).toLocaleString('it-IT')}</span>
          <span class="gc-torta-pct" style="color:var(--ink);font-weight:600">
            ${pct}%
          </span>
        </div>`;
    }).join('') + `
        <div class="gc-torta-leg-row" style="border-top:1px solid var(--bdr);margin-top:6px;padding-top:6px;opacity:.7">
          <span class="gc-leg-dot" style="background:transparent;border:1.5px solid var(--ink2)"></span>
          <span class="gc-torta-lbl" style="font-size:9.5px">Lordo totale</span>
          <span class="gc-torta-val">€${Math.round(d.totLordo).toLocaleString('it-IT')}</span>
          <span class="gc-torta-pct">100%</span>
        </div>
        <div style="border-top:1px solid var(--bdr);margin-top:6px;padding-top:6px;font-size:9px;color:var(--ink2);line-height:1.8">
          <div>👩 Mamma: <b>€${Math.round(d.nettoMamma).toLocaleString('it-IT')}</b> (${d.totLordo>0?(d.nettoMamma/d.totLordo*100).toFixed(1):'0'}%)</div>
          <div>👤 GP: <b>€${Math.round(d.nettoGP).toLocaleString('it-IT')}</b> (${d.totLordo>0?(d.nettoGP/d.totLordo*100).toFixed(1):'0'}%)</div>
        </div>`;
  }

  /* ─── G3. Classifica appartamenti (barre orizzontali) ── */
  const clWrap = document.getElementById('gcClassificaWrap');
  const sorted = [...d.propData].sort((a,b) => b.totLordo - a.totLordo);
  if (clWrap) {
    const h = Math.max(300, sorted.length * 52 + 60);
    clWrap.style.height = h + 'px';
  }
  if (document.getElementById('chartClassifica')) {
    _charts.classifica = new Chart(document.getElementById('chartClassifica'), {
      type: 'bar',
      data: {
        labels: sorted.map(pd => pd.prop.icon + ' ' + pd.prop.name),
        datasets: [
          {
            label: 'Lordo',
            data:  sorted.map(pd => Math.round(pd.totLordo)),
            backgroundColor: sorted.map(pd => pd.color + '55'),
            borderColor:     sorted.map(pd => pd.color),
            borderWidth: 1.5, borderRadius: 4,
          },
          {
            label: 'Utile netto',
            data:  sorted.map(pd => Math.round(pd.totUtile)),
            backgroundColor: sorted.map(pd => pd.totUtile < 0 ? 'rgba(224,92,122,0.7)' : pd.color + 'CC'),
            borderColor:     sorted.map(pd => pd.totUtile < 0 ? '#E05C7A' : pd.color),
            borderWidth: 1.5, borderRadius: 4,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true, position: 'top',
            labels: { color:'#6A6050', font:{size:10}, boxWidth:10, padding:10 }
          },
          tooltip: {
            backgroundColor:'#1A2E3E', borderColor:'rgba(255,255,255,.1)', borderWidth:1,
            cornerRadius:8, padding:10, titleColor:'#fff', bodyColor:'rgba(255,255,255,.8)',
            callbacks: {
              title: items => items[0].label,
              label: ctx => {
                const v = Math.round(ctx.parsed.x);
                const sign = v < 0 ? '−' : '';
                return ` ${ctx.dataset.label}: ${sign}€${Math.abs(v).toLocaleString('it-IT')}`;
              }
            }
          },
          g3Lbl: {
            afterDraw(chart) {
              const ctx2 = chart.ctx; ctx2.save();
              chart.data.datasets.forEach((ds, di) => {
                const meta = chart.getDatasetMeta(di);
                if (ds.hidden) return;
                meta.data.forEach((bar, i) => {
                  const val = ds.data[i];
                  if (!val) return;
                  const lbl = (val < 0 ? '−' : '') + '€' + (Math.abs(val) >= 1000 ? (Math.abs(val)/1000).toFixed(1)+'k' : Math.abs(val).toLocaleString('it-IT'));
                  ctx2.font = 'bold 9px Manrope,sans-serif';
                  ctx2.textAlign = val < 0 ? 'right' : 'left';
                  ctx2.textBaseline = 'middle';
                  const col = ds.backgroundColor[i] || '#555';
                  ctx2.fillStyle = typeof col === 'string' ? col.replace(/[0-9.]+\)$/, '1)') : '#555';
                  const xPos = val < 0 ? bar.x - 4 : bar.x + 4;
                  ctx2.fillText(lbl, xPos, bar.y);
                });
              });
              ctx2.restore();
            }
          },
        },
        scales: {
          x: {
            grid,
            beginAtZero: false,
            ticks: {
              color:'#6A6050', font:{size:9},
              callback: v => (v<0?'-':'') + '€' + (Math.abs(v)>=1000 ? (Math.abs(v)/1000).toFixed(0)+'k' : Math.abs(v))
            }
          },
          y: { grid: noGrid, ticks: { color:'#18160F', font:{size:11, weight:'600'} } },
        },
      }
    });
    Chart.register({id:'g3Lbl', afterDraw(ch){const p=ch.config.options?.plugins?.g3Lbl; if(p?.afterDraw) p.afterDraw(ch);}});
  }

  /* ─── G4. Spese reali per appartamento (barre orizzontali) ─── */
  if (d.totSpeseReali > 0 && document.getElementById('chartSpeseProp')) {
    const propEntries = Object.entries(d.speseByProp || {})
      .filter(([,v]) => v > 0)
      .sort(([,a],[,b]) => b - a);
    const spWrap = document.getElementById('gcSpesePropWrap');
    if (spWrap && propEntries.length) {
      spWrap.style.height = Math.max(200, propEntries.length * 52 + 60) + 'px';
    }
    const propLabels = propEntries.map(([id]) => {
      const p = PROPERTIES.find(p => p.id === id);
      return p ? p.icon + ' ' + p.name : id;
    });
    const propVals = propEntries.map(([,v]) => Math.round(v));
    const propCols = propEntries.map(([id]) => PROP_COLORS[id] || '#999');

    _charts.speseProp = new Chart(document.getElementById('chartSpeseProp'), {
      type: 'bar',
      data: {
        labels: propLabels,
        datasets: [{
          label: 'Spese reali',
          data:  propVals,
          backgroundColor: propCols.map(c => c + 'BB'),
          borderColor:     propCols,
          borderWidth: 1.5, borderRadius: 4,
        }],
      },
      options: {
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor:'#1A2E3E', borderColor:'rgba(255,255,255,.1)', borderWidth:1,
            cornerRadius:8, padding:10, titleColor:'#fff', bodyColor:'rgba(255,255,255,.8)',
            callbacks: { label: ctx => ` Spese: −€${Math.round(ctx.parsed.x).toLocaleString('it-IT')}` }
          },
          g4Lbl: {
            afterDraw(chart) {
              const ctx2 = chart.ctx; ctx2.save();
              const meta = chart.getDatasetMeta(0);
              chart.data.datasets[0].data.forEach((val, i) => {
                if (!val) return;
                const bar  = meta.data[i];
                const lbl  = '−€' + (val >= 1000 ? (val/1000).toFixed(1)+'k' : val.toLocaleString('it-IT'));
                ctx2.font = 'bold 9px Manrope,sans-serif';
                ctx2.textAlign = 'left'; ctx2.textBaseline = 'middle';
                ctx2.fillStyle = propCols[i] || '#555';
                ctx2.fillText(lbl, bar.x + 5, bar.y);
              });
              ctx2.restore();
            }
          },
        },
        scales: {
          x: {
            grid, beginAtZero: true,
            ticks: { color:'#6A6050', font:{size:9}, callback: v => '€'+(v>=1000?(v/1000).toFixed(0)+'k':v) }
          },
          y: { grid: noGrid, ticks: { color:'#18160F', font:{size:11, weight:'600'} } },
        },
      }
    });
    Chart.register({id:'g4Lbl', afterDraw(ch){const p=ch.config.options?.plugins?.g4Lbl; if(p?.afterDraw) p.afterDraw(ch);}});
  }

}
