/* ═══════════════════════════════════════════════════════════════════════
   fiscal.js — Costanti e formule fiscali (UNICA FONTE DI VERITÀ)
   Versione 1.0  ·  introdotto in v1.5.0

   Prima della v1.5.0 queste costanti erano ripetute in 11 punti fra
   render.js, views.js e grafici.js: cambiare un'aliquota significava
   trovarle tutte, e la prima dimenticata produceva numeri diversi in
   viste diverse senza che nulla lo segnalasse.
   Adesso ogni file destruttura da FISCAL: si modifica solo qui.

   ATTENZIONE: questo file va caricato PRIMA di render.js/views.js/
   grafici.js (vedi ordine degli <script> in index.html).
═══════════════════════════════════════════════════════════════════════ */

const FISCAL = {
  IVA:     0.22,    // IVA sulle commissioni OTA
  FEE_PAG: 0.015,   // fee pagamento Booking.com (1,5% sul lordo)
  CED_1:   0.21,    // cedolare secca — immobile agevolato (1° della "coppia")
  CED_2:   0.26,    // cedolare secca — dal 2° immobile in locazione breve
  COEFF:   0.40,    // forfettario: coefficiente di redditività
  IRPEF:   0.05,    // forfettario: imposta sostitutiva
  INPS:    0.2448,  // forfettario: contributi gestione separata
};

/* Percentuale complessiva di tasse nel regime forfettario (sul lordo) */
function fiscalForfPct() {
  return FISCAL.COEFF * (FISCAL.IRPEF + FISCAL.INPS);
}

/**
 * Commissioni + fee + IVA per una singola prenotazione.
 * @param {number} p       lordo
 * @param {string} tipo    'booking' | 'airbnb' | 'diretta' | altro
 * @param {number} bkComm  commissione Booking in frazione (es. 0.16)
 * @param {number} abComm  commissione AirBnB  in frazione (es. 0.155)
 * @returns {{comm:number, fee:number, iva:number, totale:number}}
 */
function fiscalCommissioni(p, tipo, bkComm, abComm) {
  if (tipo === 'booking') {
    const comm = p * bkComm, fee = p * FISCAL.FEE_PAG, iva = comm * FISCAL.IVA;
    return { comm, fee, iva, totale: comm + fee + iva };
  }
  if (tipo === 'airbnb') {
    const comm = p * abComm, iva = comm * FISCAL.IVA;
    return { comm, fee: 0, iva, totale: comm + iva };
  }
  return { comm: 0, fee: 0, iva: 0, totale: 0 };   // diretta / senza tag
}

/**
 * Imposta dovuta su un imponibile.
 * @param {number} base      imponibile lordo
 * @param {boolean} isForf   true = forfettario, false = cedolare secca
 * @param {number} cedAli    aliquota cedolare (default FISCAL.CED_1)
 */
function fiscalImposta(base, isForf, cedAli) {
  if (!base) return 0;
  return isForf ? base * fiscalForfPct() : base * (cedAli ?? FISCAL.CED_1);
}

/**
 * Calcolo completo per una prenotazione.
 * Helper di comodo per il codice nuovo: le viste esistenti usano ancora
 * i calcoli inline (identici), che destrutturano da FISCAL.
 * @returns {{lordo, commissioni, imponibile, tasse, netto}}
 */
function nettoBooking(p, tipo, opt = {}) {
  const { bkComm = 0.16, abComm = 0.155, isForf = false,
          cedAli = FISCAL.CED_1, tassabile = true } = opt;
  const c    = fiscalCommissioni(p, tipo, bkComm, abComm);
  const imp  = tassabile ? p : 0;
  const tax  = fiscalImposta(imp, isForf, cedAli);
  return {
    lordo:       p,
    commissioni: c.totale,
    imponibile:  imp,
    tasse:       tax,
    netto:       p - c.totale - tax,
  };
}

/**
 * Assegna l'aliquota cedolare (21% / 26%) ai gruppi definiti in
 * config.js → CED_GROUPS. Dal 2024 la cedolare al 21% spetta a UN solo
 * immobile per locatore: all'interno di ogni gruppo l'aliquota ridotta
 * va all'immobile con il lordo OTA più alto (scelta più conveniente),
 * gli altri vanno al 26%.
 *
 * Sostituisce le assegnazioni cablate a mano su coppie fisse di
 * appartamenti che c'erano fino alla v1.4.3.
 *
 * @param {Object} kpiMap  mappa propId → kpi (ogni kpi ha .lordoOTA,
 *                         .isForf, .cedAliquota)
 */
function assignCedolareRates(kpiMap) {
  if (typeof CED_GROUPS === 'undefined') return;
  CED_GROUPS.forEach(group => {
    const membri = (group.props || [])
      .map(id => kpiMap[id])
      .filter(k => k && !k.isForf);
    if (membri.length < 2) return;           // un solo immobile → resta al 21%
    membri.sort((a, b) => (b.lordoOTA || 0) - (a.lordoOTA || 0));
    membri.forEach((k, i) => { k.cedAliquota = i === 0 ? FISCAL.CED_1 : FISCAL.CED_2; });
  });
}

/** Soglia di recupero cedolare definita in config.js (campo cedRecovery) */
function cedRecoveryThreshold(propId) {
  const p = (typeof PROPERTIES !== 'undefined')
    ? PROPERTIES.find(x => x.id === propId) : null;
  return parseFloat(p?.cedRecovery) || 0;
}
