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
  vicogaribaldi: '#8BC34A',
  lavalletta:    '#26A69A',
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
  const realProps = realProperties();
  const spese     = _gSpese(isArchive, year);
  const { IVA, FEE_PAG, COEFF, IRPEF, INPS } = FISCAL;

  /* ── v1.4: tassazione dirette flaggate (bonifico attribuito) ── */
  let _dirTaxMapG = {};
  try {
    const dtk = isArchive ? `octo_arch_${year}_dirtax_v3` : 'octo_dirtax_v3';
    _dirTaxMapG = JSON.parse(localStorage.getItem(dtk) || '{}');
  } catch(_) {}
  const _dirTaxFlags = [];   // { taxProp, p } raccolti da tutti gli appartamenti

  /* ── Per ogni proprietà: calcola KPI e breakdown mensile ── */
  const propData = realProps.map(prop => {
    const types  = _gGet(isArchive, year, 'types',  prop.id, '{}');
    if (!isArchive) { try { applyTypeOverrides(prop.id, types); } catch(_) {} }
    const fiscal = _gGet(isArchive, year, 'fiscal', prop.id, '{}');
    const bkComm  = parseFloat(fiscal.bkComm  ?? 16)   / 100;
    const abComm  = parseFloat(fiscal.abComm  ?? 15.5) / 100;
    const inclDir = fiscal.inclDir ?? false;
    const isForf  = (fiscal.regime ?? 'cedolare') === 'forfettario';
        const { IVA, FEE_PAG, COEFF, IRPEF, INPS } = FISCAL;
    let cedAliquota = FISCAL.CED_1;

    // Unisci live + past + manual — IDENTICO a calcKpi (vista Confronto, v1.3):
    // stessa regola di inclusione (tutto ciò che è negli archivi dell'anno,
    // senza filtro sull'anno solare del check-in) e stessa deduplicazione
    // nome+checkin. Così "Lordo totale" qui coincide sempre con il lordo
    // della scheda Confronto.
    let books = [];
    const seen = new Set();

    const addBook = (raw, isPast) => {
      const b = _deserBook(raw);
      if (!b.checkin || seen.has(b.uid) || b.source === 'blocked') return;
      seen.add(b.uid);
      b._bookType = types[b.uid] || '';
      b.isPast = isPast;
      books.push(b);
    };

    try { (_gGet(isArchive, year, 'live', prop.id, '[]') || []).forEach(r => addBook(r, false)); } catch(e){}
    try { Object.values(_gGet(isArchive, year, 'past', prop.id, '{}') || {}).forEach(r => addBook(r, true)); } catch(e){}

    // Dedup nome+checkin (stessa prenotazione su due feed con uid diversi)
    {
      const seenKey = new Set();
      books = books.filter(b => {
        if (!b.nome || b.nome === '—') return true;
        const ci = b.checkin;
        const k = b.nome.trim().toLowerCase() + '_' + ci.getFullYear() + '-' + ci.getMonth() + '-' + ci.getDate();
        if (seenKey.has(k)) return false;
        seenKey.add(k);
        return true;
      });
    }

    try { (_gGet(isArchive, year, 'manual', prop.id, '[]') || []).forEach(m => {
      if (books.find(x => x.uid === m.uid)) return;
      const ci = m.checkin ? new Date(m.checkin) : null;
      const co = m.checkout ? new Date(m.checkout) : null;
      if (!ci) return;
      books.push({ uid:m.uid, source:'manual', nome:m.nome||'—', checkin:ci, checkout:co,
        prezzo:m.prezzo??null, notti:m.notti||(ci&&co?Math.round((co-ci)/86400000):null),
        _bookType:m.bookType||'diretta', isPast:true });
    }); } catch(e){}

    // Bucket mensile: se il check-in cade fuori dall'anno visualizzato
    // (caso raro di soggiorni a cavallo d'anno rimasti in archivio) la
    // prenotazione viene comunque contata, agganciata a Gen o Dic.
    const monthOf = b => {
      const cy = b.checkin.getFullYear();
      if (cy < year) return 0;
      if (cy > year) return 11;
      return b.checkin.getMonth();
    };

    // Breakdown mensile
    const monthly = Array.from({length:12}, () => ({
      lordo:0, comm:0, tasse:0, tasseOTA:0, speseOp:0, utile:0, notti:0, nPrenotazioni:0, lordoOTA:0, lordoDir:0,
    }));

    let _totLordoOTA=0, _totLordoDir=0, _totNettoLordo=0, _totTaxBase=0, _totNotti=0, _totNBooks=0, _totNottiOTA=0;
    let _dirTaxExcl=0;   // v1.4: base dirette flaggate (tassate altrove)
    books.filter(b => b.prezzo !== null).forEach(b => {
      const m   = monthOf(b);
      const p   = b.prezzo;
      const nn  = b.notti || 0;
      // Usa b._bookType esattamente come confronto ('' = skip, identico a calcKpi)
      const bt = b._bookType;
      // Lordo = somma di TUTTE le prenotazioni con prezzo (tagged + untagged)
      // identico a S1 renderStats che usa withP.reduce((s,b)=>s+b.prezzo,0)
      monthly[m].lordo += p;

      // Commissioni, tasse e spese operative solo per booking taggati
      if (bt !== 'booking' && bt !== 'airbnb' && bt !== 'diretta') return;
      const isOTA = bt === 'booking' || bt === 'airbnb';
      // v1.4: diretta flaggata = tassata sull'appartamento del bonifico
      const _dtx     = bt === 'diretta' ? _dirTaxMapG[b.uid] : null;
      const _flagged = !!(_dtx && _dtx.taxProp);

      let comm = 0;
      if (bt === 'booking') {
        const _c=p*bkComm,_f=p*FEE_PAG,_i=_c*IVA; comm=_c+_f+_i;
        _totLordoOTA+=p; _totTaxBase+=p; _totNottiOTA+=nn;
      } else if (bt === 'airbnb') {
        const _c=p*abComm,_i=_c*IVA; comm=_c+_i;
        _totLordoOTA+=p; _totTaxBase+=p; _totNottiOTA+=nn;
      } else {
        _totLordoDir+=p;
        if (_flagged) { _dirTaxExcl+=p; _dirTaxFlags.push({ taxProp:_dtx.taxProp, p }); }
        else if (inclDir) _totTaxBase+=p;
      }
      _totNettoLordo += p - comm;
      _totNBooks++;

      let tax = 0;
      if (isForf) { if (!_flagged) tax = p * COEFF * (IRPEF + INPS); }
      else if (isOTA || (bt==='diretta' && !_flagged && inclDir)) tax = p * cedAliquota;

      const speseOp = (spese.luce||0)*nn
        + ((spese.welcomePack||0)+(spese.pulizie||0)+(spese.lavanderia||0))
        + (isOTA ? (spese.tassaSoggiorno||0)*nn : 0);

      // (lordo already added above)
      monthly[m].lordoOTA += isOTA ? p : 0;
      monthly[m].lordoDir += (!isOTA && bt === 'diretta') ? p : 0;
      monthly[m].comm     += comm;
      monthly[m].tasse    += tax;
      monthly[m].tasseOTA += isOTA ? tax : 0;
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
    const _taxAmt    = isForf ? _totTaxBase*COEFF*(IRPEF+INPS)
                              : _totLordoOTA*cedAliquota+(inclDir?(_totLordoDir-_dirTaxExcl)*cedAliquota:0);
    const _netto     = _totNettoLordo - _taxAmt - _speseOpTot - gestione;

    return {
      prop, monthly, books,
      totLordo, totComm,
      totTasse: _taxAmt, totSpeseOp: _speseOpTot,
      totUtile: _netto,
      totNotti, gestione,
      _lordoOTA: _totLordoOTA, _lordoDir: _totLordoDir,
      _nettoLordo: _totNettoLordo, isForf, inclDir, cedAliquota,
      dirTaxExcl: _dirTaxExcl, dirTaxIn: 0,
      color: PROP_COLORS[prop.id] || '#999',
    };
  }).filter(d => d.totLordo > 0);

  /* ── v1.4: distribuzione base dirette flaggate agli appartamenti dei bonifici ── */
  {
    const _in = {};
    _dirTaxFlags.forEach(f => { _in[f.taxProp] = (_in[f.taxProp]||0) + f.p; });
    propData.forEach(d => { d.dirTaxIn = _in[d.prop.id] || 0; });
    // Forfettario (non passa dal post-processing cedolare): applica subito
    propData.forEach(d => {
      if (!d.isForf || !d.dirTaxIn) return;
      const extraTax = d.dirTaxIn * COEFF * (IRPEF + INPS);
      d.totTasse += extraTax;
      d.totUtile -= extraTax;
    });
  }

  /* ── Post-processing aliquote cedolari e soglie (identico a views.js) ── */
  // v1.5.0: aliquote e soglie non più cablate su coppie fisse di
  // appartamenti — gruppi in config.js, assegnazione in fiscal.js.
  const _km = {}; propData.forEach(d => _km[d.prop.id] = d);
  // assignCedolareRates legge .lordoOTA: qui il campo si chiama _lordoOTA
  Object.values(_km).forEach(d => { d.lordoOTA = d._lordoOTA; });
  assignCedolareRates(_km);
  propData.forEach(d => { d._threshold = cedRecoveryThreshold(d.prop.id); });
  propData.forEach(d => {
    if(d.isForf) return;
    const thr = d._threshold||0;
    const newTax = d._lordoOTA*d.cedAliquota
      + (d.inclDir ? (d._lordoDir - (d.dirTaxExcl||0)) * d.cedAliquota : 0)
      + (d.dirTaxIn||0) * d.cedAliquota;
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
    // Gestione ripartita in 12 quote mensili uguali (gestione_prop / 12)
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
  try {
    const srKey = isArchive
      ? (localStorage.getItem(`octo_arch_${year}_spese_reali_v3`) !== null
          ? `octo_arch_${year}_spese_reali_v3` : `octo_arch_${year}_octo_spese_reali_v3`)
      : 'octo_spese_reali_v3';
    speseRealiRaw = JSON.parse(localStorage.getItem(srKey) || '[]');
  } catch(_) {}

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
  // v1.3: chiave archivio standard, con fallback sulla vecchia (doppio prefisso)
  const key = isArchive
    ? (localStorage.getItem(`octo_arch_${year}_spese_v3`) !== null
        ? `octo_arch_${year}_spese_v3` : `octo_arch_${year}_octo_spese_v3`)
    : 'octo_spese_v3';
  try { const d = JSON.parse(localStorage.getItem(key)||'{}');
    return { luce:+(d.luce??3), welcomePack:+(d.welcomePack??15),
      pulizie:+(d.pulizie??50), lavanderia:+(d.lavanderia??20),
      tassaSoggiorno:+(d.tassaSoggiorno??0) }; } catch(e) { return {luce:3,welcomePack:15,pulizie:50,lavanderia:20,tassaSoggiorno:0}; }
}
function _gGestione(isArchive, year, propId) {
  // v1.3: chiave archivio standard, con fallback sulla vecchia (doppio prefisso)
  const key = isArchive
    ? (localStorage.getItem(`octo_arch_${year}_gestione_v3`) !== null
        ? `octo_arch_${year}_gestione_v3` : `octo_arch_${year}_octo_gestione_v3`)
    : 'octo_gestione_v3';
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
    const realProps = realProperties();
    let lordo=0, utile=0, notti=0;
    realProps.forEach(prop => {
      const types  = _gGet(isArch, y, 'types',  prop.id, '{}');
      if (!isArch) { try { applyTypeOverrides(prop.id, types); } catch(_) {} }
      const fiscal = _gGet(isArch, y, 'fiscal', prop.id, '{}');
      const bkComm = parseFloat(fiscal.bkComm??16)/100;
      const abComm = parseFloat(fiscal.abComm??15.5)/100;
      const isForf = (fiscal.regime??'cedolare')==='forfettario';
      const CED = FISCAL.CED_1;
      const { IVA, FEE_PAG, COEFF, IRPEF, INPS } = FISCAL;
      const sp = _gSpese(isArch, y);
      let _dtY = {};
      try { _dtY = JSON.parse(localStorage.getItem(isArch ? `octo_arch_${y}_dirtax_v3` : 'octo_dirtax_v3') || '{}'); } catch(_) {}

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
        const _flg = bt==='diretta' && !!(_dtY[b.uid] && _dtY[b.uid].taxProp);
        if (isForf) tax=p*COEFF*(IRPEF+INPS);
        else if (isOTA||fiscal.inclDir||_flg) tax=p*CED;
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
          <span style="display:inline-block;background:var(--acc);color:#fff;font-size:9px;font-weight:700;padding:1px 7px;border-radius:10px;margin-right:6px">G1</span><span class="gc-card-title">📊 Lordo incasso · Utile netto — andamento mensile</span>\n          <div style=\"font-size:9px;color:var(--ink2);margin-top:2px;margin-left:2px\">Utile netto = lordo − commissioni OTA − tasse − spese operative − affitti/gestione</div>
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

    <!-- G5: linee netto per appartamento -->
    <div class="gc-row-full">
      <div class="gc-card">
        <div class="gc-card-hdr">
          <span style="display:inline-block;background:var(--acc);color:#fff;font-size:9px;font-weight:700;padding:1px 7px;border-radius:10px;margin-right:6px">G5</span><span class="gc-card-title">📈 Utile netto per appartamento — andamento mensile</span>
          <span class="gc-card-sub">Lordo − commissioni OTA − tasse</span>
          <div class="gc-legend-row" id="legendG5" style="flex-wrap:wrap;gap:6px;margin-left:auto"></div>
        </div>
        <div class="gc-canvas-wrap" style="min-height:300px">
          <canvas id="chartNettoApp"></canvas>
        </div>
      </div>
    </div>

    <!-- G6: istogrammi + tabella netto -->
    <div class="gc-row-full">
      <div class="gc-card">
        <div class="gc-card-hdr">
          <span style="display:inline-block;background:var(--acc);color:#fff;font-size:9px;font-weight:700;padding:1px 7px;border-radius:10px;margin-right:6px">G6</span><span class="gc-card-title">📊 Incasso netto per appartamento — mese per mese</span>
          <span class="gc-card-sub">Lordo − commissioni OTA − tasse</span>
        </div>
        <div class="gc-canvas-wrap" style="min-height:300px">
          <canvas id="chartNettoBar"></canvas>
        </div>
        <div style="overflow-x:auto;margin-top:16px">
          <table id="tableNettoApp" style="width:100%;border-collapse:collapse;font-size:10px;min-width:700px"></table>
        </div>
        <div style="margin-top:10px;padding:10px 12px;background:var(--bg2);border:1px solid var(--bdr);border-radius:8px;font-size:10px;color:var(--ink2);line-height:1.6">
          <b style="color:var(--ink)">ℹ Cosa rappresenta questa tabella</b> — Per ogni appartamento e per ogni mese
          (in base alla data di <b>check-in</b>) viene mostrato l'<b>incasso netto</b>:
          <b>lordo − commissioni OTA (incluse fee pagamento e IVA) − tasse (cedolare o forfettario)</b>.
          Le righe "di cui OTA" e "di cui Dirette" scompongono lo stesso valore per canale.
          <b>Non</b> sono sottratte le spese operative (pulizie, luce, welcome pack, lavanderia)
          né affitto/condominio/gestione: quindi <u>non è l'utile netto finale</u> (quello dei KPI
          in alto e del grafico G1), ma il netto incassato dopo commissioni e tasse.
          Le prenotazioni senza tag Booking/Airbnb/Diretta sono incluse nel lordo a valore pieno
          (commissioni e tasse non calcolabili senza tag).
        </div>
      </div>
    </div>

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
    const _g1L = d.aggMonthly.map(m => Math.round(m.lordo));
    const _g1N = d.aggMonthly.map(m => Math.round(m.utileNetto));
    const _g1C = d.aggMonthly.map(m => Math.round(m.comm||0));
    const _g1T = d.aggMonthly.map(m => Math.round(m.tasse||0));
    const _g1S = d.aggMonthly.map(m => Math.round((m.speseOp||0)+(m.gestione||0)));
    const _g1F = v => (v<0?'\u2212':'') + '\u20ac' + (Math.abs(v)>=1000 ? (Math.abs(v)/1000).toFixed(1)+'k' : Math.abs(Math.round(v)).toLocaleString('it-IT'));

    // Calcola step size Y dinamicamente per scala dettagliata
    const _g1MaxVal = Math.max(..._g1L.filter(v=>v>0), 1);
    const _g1StepRaw = _g1MaxVal / 10;
    const _g1Mag = Math.pow(10, Math.floor(Math.log10(_g1StepRaw)));
    const _g1Step = Math.ceil(_g1StepRaw / _g1Mag) * _g1Mag;

    _charts.lordoSpeseNetto = new Chart(document.getElementById('chartLordoSpeseNetto'), {
      type: 'bar',
      data: {
        labels: d.MONTHS,
        datasets: [
          {
            label: 'Lordo incasso',
            data: _g1L,
            backgroundColor: 'rgba(78,154,241,0.42)',
            borderColor: '#4E9AF1',
            borderWidth: 1.5,
            borderRadius: 5,
            order: 2,
          },
          {
            label: 'Utile netto',
            data: _g1N,
            type: 'line',
            borderColor: '#56C28A',
            backgroundColor: 'rgba(86,194,138,0.10)',
            borderWidth: 2.5,
            pointRadius: 5,
            pointHoverRadius: 7,
            pointBackgroundColor: _g1N.map(v => v < 0 ? '#E05C7A' : '#56C28A'),
            pointBorderColor: _g1N.map(v => v < 0 ? '#E05C7A' : '#56C28A'),
            fill: true,
            tension: 0.35,
            order: 1,
            segment: {
              borderColor: ctx => ctx.p1.parsed.y < 0 ? '#E05C7A' : '#56C28A',
              backgroundColor: ctx => ctx.p1.parsed.y < 0 ? 'rgba(224,92,122,0.10)' : 'rgba(86,194,138,0.10)',
            },
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1A2231', borderColor: 'rgba(255,255,255,.12)', borderWidth: 1,
            cornerRadius: 10, padding: 12, titleColor: '#fff', bodyColor: 'rgba(255,255,255,.8)',
            callbacks: {
              title: items => d.MONTHS[items[0].dataIndex],
              label: ctx => {
                const i = ctx.dataIndex, m = d.aggMonthly[i];
                if (ctx.dataset.label === 'Lordo incasso') {
                  return [
                    ' \u{1F4B0} Lordo: \u20ac' + _g1L[i].toLocaleString('it-IT'),
                    '   \u{1F4D8}\u{1F338} Comm.: \u2212\u20ac' + _g1C[i].toLocaleString('it-IT'),
                    '   \u{1F3DB} Tasse: \u2212\u20ac' + _g1T[i].toLocaleString('it-IT'),
                    '   \u26A1 Sp.op.+Gest.: \u2212\u20ac' + _g1S[i].toLocaleString('it-IT'),
                  ];
                }
                const v = _g1N[i];
                return ' \u{1F4C8} Utile netto: ' + (v<0?'\u2212':'') + '\u20ac' + Math.abs(v).toLocaleString('it-IT');
              },
              afterBody: items => {
                const i = items[0].dataIndex;
                const pct = _g1L[i] > 0 ? (_g1N[i] / _g1L[i] * 100).toFixed(1) : '\u2014';
                return ['', ' \u2192 Margine: ' + pct + '%'];
              },
            }
          },
          g1Lbl: {
            afterDraw(ch) {
              const ctx2 = ch.ctx; ctx2.save();
              const meta = ch.getDatasetMeta(1);
              meta.data.forEach((pt, i) => {
                const val = _g1N[i]; if (!val) return;
                ctx2.font = 'bold 9.5px Manrope,sans-serif';
                ctx2.textAlign = 'center';
                ctx2.textBaseline = val >= 0 ? 'bottom' : 'top';
                ctx2.fillStyle = val < 0 ? '#E05C7A' : '#2AAF6A';
                ctx2.fillText(_g1F(val), pt.x, val >= 0 ? pt.y - 6 : pt.y + 6);
              });
              ctx2.restore();
            }
          },
        },
        scales: {
          x: { grid, ticks: { color: '#6A6050', font: { size: 10 } } },
          y: {
            grid: {
              color: ctx => ctx.tick.value === 0 ? 'rgba(15,31,46,0.20)' : 'rgba(15,31,46,0.06)',
              lineWidth: ctx => ctx.tick.value === 0 ? 1.5 : 1,
              drawBorder: false,
            },
            beginAtZero: true,
            ticks: {
              color: '#6A6050', font: { size: 10 },
              stepSize: _g1Step,
              callback: v => {
                if (Math.abs(v) >= 1000) return (v < 0 ? '\u2212' : '') + '\u20ac' + (Math.abs(v)/1000).toFixed(v%1000===0?0:1) + 'k';
                return (v < 0 ? '\u2212' : '') + '\u20ac' + Math.abs(v).toLocaleString('it-IT');
              },
            },
          },
        },
      }
    });
    Chart.register({ id: 'g1Lbl', afterDraw(ch) { const p = ch.config.options?.plugins?.g1Lbl; if (p?.afterDraw) p.afterDraw(ch); } });
    const _lLSN = document.getElementById('legendLSN');
    if (_lLSN) _lLSN.innerHTML = [
      { c: '#4E9AF1', l: 'Lordo incasso' },
      { c: '#56C28A', l: 'Utile netto (lordo − comm − tasse − sp.op. − gest.)' },
    ].map(x => '<span class="gc-leg-dot" style="background:' + x.c + '"></span><span style="font-size:10px;color:var(--ink2)">' + x.l + '</span>').join('');
  }

  /* ─── 2. Torta ripartizione ─────────────────────────────────────────

     Breakdown del lordo totale in 6 fette:
     Commissioni OTA · Tasse · Sp.operative · Affitti/Gestione ·
     Utile netto Mamma · Utile netto GP
     L'utile negativo viene assorbito dal totale "Utile" per non avere fette negative.
  ─────────────────────────────────────────────────────────────────── */
  const totaleLordo = d.totLordo || 1;

  // Calcola netti Mamma e GP dai propData (già calcolati in _buildGraficiData)
  const _tNettoMamma = Math.max(0, d.nettoMamma);
  const _tNettoGP    = Math.max(0, d.nettoGP);
  // Se entrambi negativi, mostra 0
  const _tUtileResiduoCheck = Math.max(0, d.totUtile);

  const tortaPieces = [
    { lbl: 'Commissioni OTA',          val: d.totComm,             color: '#F2A93B' },
    { lbl: 'Tasse (ced. / forf.)',      val: d.totTasse,            color: '#E05C7A' },
    { lbl: 'Spese operative',           val: d.totSpeseOp,          color: '#A67CF7' },
    { lbl: 'Affitti / Gestione',        val: d.totGest,             color: '#B84228' },
    { lbl: '\uD83D\uDCC8 Utile netto GP',    val: _tNettoGP,              color: '#4E9AF1' },
    { lbl: '\uD83D\uDC69 Utile netto Mamma', val: _tNettoMamma,           color: '#56C28A' },
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
        <div style="border-top:1px solid var(--bdr);margin-top:6px;padding-top:6px;font-size:9px;color:var(--ink2);line-height:1.9">
          <div>👩 Mamma: <b style="color:#56C28A">€${Math.round(d.nettoMamma).toLocaleString('it-IT')}</b> <span style="opacity:.65">(${d.totLordo>0?(d.nettoMamma/d.totLordo*100).toFixed(1):'0'}% del lordo)</span></div>
          <div>👤 GP: <b style="color:#4E9AF1">€${Math.round(d.nettoGP).toLocaleString('it-IT')}</b> <span style="opacity:.65">(${d.totLordo>0?(d.nettoGP/d.totLordo*100).toFixed(1):'0'}% del lordo)</span></div>
          <div style="margin-top:2px;opacity:.7">Utile netto totale: <b>€${Math.round(d.totUtile).toLocaleString('it-IT')}</b></div>
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

  /* ─── G5+G6 ─── */
  const G56_ORDER = ['attico','montenero','stoccolma','frescura','villa','corso','anfiteatro','scaro','vicogaribaldi','lavalletta'];
  const g56Props  = G56_ORDER.map(id => d.propData.find(pd => pd.prop.id === id)).filter(Boolean);

  // Netto totale = lordo - comm - tasse
  const g56Netto   = g56Props.map(pd => pd.monthly.map(m => Math.round(m.lordo - m.comm - m.tasse)));
  // Netto OTA = lordoOTA - comm (solo su OTA) - tasseOTA
  const g56NettoOTA = g56Props.map(pd => pd.monthly.map(m => Math.round(m.lordoOTA - m.comm - m.tasseOTA)));
  // Netto Dirette = lordoDir - (tasse - tasseOTA)
  const g56NettoDir = g56Props.map(pd => pd.monthly.map(m => Math.round(m.lordoDir - (m.tasse - m.tasseOTA))));

  /* G5: linee */
  if (document.getElementById('chartNettoApp')) {
    _charts.nettoApp = new Chart(document.getElementById('chartNettoApp'), {
      type: 'line',
      data: { labels: d.MONTHS, datasets: g56Props.map((pd,pi) => ({
        label: pd.prop.icon+' '+pd.prop.name,
        data: g56Netto[pi],
        borderColor: pd.color, backgroundColor: pd.color+'30',
        borderWidth:2, tension:0.3, fill:false, pointRadius:4, pointHoverRadius:6,
      })) },
      options: {
        responsive:true, maintainAspectRatio:false,
        interaction:{mode:'index',intersect:false},
        plugins: {
          legend:{display:false},
          tooltip:{
            backgroundColor:'#1A2231',borderColor:'rgba(255,255,255,.12)',borderWidth:1,
            cornerRadius:10,padding:12,titleColor:'#fff',bodyColor:'rgba(255,255,255,.8)',
            callbacks:{
              title:items=>d.MONTHS[items[0].dataIndex],
              label:ctx=>{const v=ctx.parsed.y;if(!v&&v!==0)return null;return ` ${ctx.dataset.label}: ${v<0?'−':''}€${Math.abs(v).toLocaleString('it-IT')}`;},
              filter:ctx=>ctx.raw!==0,
            }
          },
        },
        scales:{
          x:{grid,ticks:{color:'#6A6050',font:{size:10}}},
          y:{grid,ticks:{color:'#6A6050',font:{size:10},callback:v=>(v<0?'-':'')+'€'+(Math.abs(v)>=1000?(Math.abs(v)/1000).toFixed(0)+'k':Math.abs(v))}},
        },
      }
    });
    const legG5=document.getElementById('legendG5');
    if(legG5) legG5.innerHTML=g56Props.map(pd=>`<span class="gc-leg-dot" style="background:${pd.color}"></span><span style="font-size:10px;color:var(--ink2)">${pd.prop.icon} ${pd.prop.name}</span>`).join('');
  }

  /* G6: istogrammi */
  if (document.getElementById('chartNettoBar')) {
    _charts.nettoBar = new Chart(document.getElementById('chartNettoBar'), {
      type:'bar',
      data:{ labels:d.MONTHS, datasets:g56Props.map((pd,pi)=>({
        label:pd.prop.icon+' '+pd.prop.name,
        data:g56Netto[pi],
        backgroundColor:g56Netto[pi].map(v=>v<0?'rgba(224,92,122,0.7)':pd.color+'CC'),
        borderColor:g56Netto[pi].map(v=>v<0?'#E05C7A':pd.color),
        borderWidth:1.5, borderRadius:3,
      })) },
      options:{
        responsive:true,maintainAspectRatio:false,
        interaction:{mode:'index',intersect:false},
        plugins:{
          legend:{display:true,position:'bottom',labels:{color:'#6A6050',font:{size:10},boxWidth:10,padding:8}},
          tooltip:{
            backgroundColor:'#1A2231',borderColor:'rgba(255,255,255,.12)',borderWidth:1,
            cornerRadius:10,padding:12,titleColor:'#fff',bodyColor:'rgba(255,255,255,.8)',
            callbacks:{
              title:items=>d.MONTHS[items[0].dataIndex],
              label:ctx=>{const v=ctx.parsed.y;if(!v)return null;return ` ${ctx.dataset.label}: ${v<0?'−':''}€${Math.abs(v).toLocaleString('it-IT')}`;},
              filter:ctx=>ctx.raw!==0,
              afterBody:items=>{
                const i=items[0].dataIndex;
                const tot=g56Props.reduce((s,_,pi)=>s+(g56Netto[pi][i]||0),0);
                return ['─────',` Totale: ${tot<0?'−':''}€${Math.abs(tot).toLocaleString('it-IT')}`];
              }
            }
          },
        },
        scales:{
          x:{grid,ticks:{color:'#6A6050',font:{size:10}}},
          y:{grid,ticks:{color:'#6A6050',font:{size:10},callback:v=>(v<0?'-':'')+'€'+(Math.abs(v)>=1000?(Math.abs(v)/1000).toFixed(0)+'k':Math.abs(v))}},
        },
      }
    });

    /* Tabella */
    const tbl=document.getElementById('tableNettoApp');
    if(tbl){
      const fmt=v=>{
        if(!v)return '<span style="color:var(--ink2);opacity:.3">—</span>';
        const neg=v<0,s=(neg?'−':'')+'€'+Math.abs(v).toLocaleString('it-IT');
        return `<span style="color:${neg?'#E05C7A':'#145C38'};font-weight:600">${s}</span>`;
      };
      const thS='padding:5px 8px;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap;border-bottom:2px solid var(--bdr);background:var(--bg2);text-align:right';
      const tdS='padding:5px 8px;text-align:right;border-bottom:1px solid var(--bdr);font-size:10px';
      const tdL='padding:5px 8px;text-align:left;border-bottom:1px solid var(--bdr);white-space:nowrap;border-right:1px solid var(--bdr)';
      const sepL='border-left:2px solid var(--bdr)';

      const head=`<thead><tr>
        <th style="${thS};text-align:left;min-width:150px">Appartamento</th>
        ${d.MONTHS.map(m=>`<th style="${thS}">${m}</th>`).join('')}
        <th style="${thS};${sepL}">Totale</th>
      </tr></thead>`;

      const makeRow=(pd,pi,extraStyle='')=>{
        const yr=g56Netto[pi].reduce((s,v)=>s+v,0);
        return `<tr>
          <td style="${tdL};font-size:10px">
            <span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${pd.color};margin-right:5px;vertical-align:middle"></span>
            ${pd.prop.icon} ${pd.prop.name}
          </td>
          ${g56Netto[pi].map(v=>`<td style="${tdS}${extraStyle}">${fmt(v)}</td>`).join('')}
          <td style="${tdS};${sepL};font-weight:700">${fmt(yr)}</td>
        </tr>`;
      };

      const makeSubRow=(label,dataArr)=>{
        const mTots=d.MONTHS.map((_,mi)=>dataArr.reduce((s,row)=>s+(row[mi]||0),0));
        const yr=mTots.reduce((s,v)=>s+v,0);
        return `<tr style="background:rgba(0,0,0,.02)">
          <td style="${tdL};font-size:9px;color:var(--ink2);padding-left:20px">${label}</td>
          ${mTots.map(v=>`<td style="${tdS};font-size:9px">${fmt(v)}</td>`).join('')}
          <td style="${tdS};${sepL};font-size:9px">${fmt(yr)}</td>
        </tr>`;
      };

      const makeTotRow=(label,dataArr,bold=true)=>{
        const mTots=d.MONTHS.map((_,mi)=>dataArr.reduce((s,row)=>s+(row[mi]||0),0));
        const yr=mTots.reduce((s,v)=>s+v,0);
        const fw=bold?'font-weight:700':'';
        return `<tr style="background:var(--bg2)">
          <td style="${tdL};font-size:10px;${fw};color:var(--ink)">${label}</td>
          ${mTots.map(v=>`<td style="${tdS};${fw}">${fmt(v)}</td>`).join('')}
          <td style="${tdS};${sepL};${fw}">${fmt(yr)}</td>
        </tr>`;
      };

      const makeSectionHdr=(label,col='var(--acc)')=>
        `<tr><td colspan="${d.MONTHS.length+2}" style="padding:7px 10px;font-weight:700;font-size:10px;color:${col};background:var(--bg2);border-bottom:1px solid var(--bdr)">${label}</td></tr>`;

      const gpPairs  = g56Props.map((pd,pi)=>({pd,pi})).filter(({pd})=>GP_IDS.includes(pd.prop.id));
      const mmPairs  = g56Props.map((pd,pi)=>({pd,pi})).filter(({pd})=>MAMMA_IDS.includes(pd.prop.id));
      const allPairs = g56Props.map((pd,pi)=>({pd,pi}));

      const buildSection=(pairs)=>{
        let html='';
        pairs.forEach(({pd,pi})=>{ html+=makeRow(pd,pi); });
        html+=makeSubRow('— di cui OTA (lordo − comm − tasse)', pairs.map(({pi})=>g56NettoOTA[pi]));
        html+=makeSubRow('— di cui Dirette (lordo − tasse)',    pairs.map(({pi})=>g56NettoDir[pi]));
        html+=makeTotRow('Totale', pairs.map(({pi})=>g56Netto[pi]));
        return html;
      };

      let tbody='';
      tbody+=makeSectionHdr('👤 GP','#4E9AF1');
      tbody+=buildSection(gpPairs);
      tbody+=makeSectionHdr('👩 Mamma','#E05C7A');
      tbody+=buildSection(mmPairs);
      tbody+=makeSectionHdr('Totale complessivo','var(--ink)');
      tbody+=buildSection(allPairs);

      tbl.innerHTML=head+`<tbody>${tbody}</tbody>`;
    }
  }


}
