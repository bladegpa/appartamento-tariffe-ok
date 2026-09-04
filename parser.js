/* ═══════════════════════════════════════
   parser.js — Fetch iCal + Parsing + Estrazione
   Versione 1.5.0
═══════════════════════════════════════ */

/* ─── Compatibilità: AbortSignal.timeout ──────────────────────────────
   Safari < 16 (iPad e iPhone non aggiornati) non ha AbortSignal.timeout:
   ogni fetch lanciava TypeError e TUTTI i calendari risultavano falliti. */
if (typeof AbortSignal !== 'undefined' && !AbortSignal.timeout) {
  AbortSignal.timeout = function (ms) {
    const c = new AbortController();
    setTimeout(() => c.abort(new DOMException('TimeoutError', 'TimeoutError')), ms);
    return c.signal;
  };
}

/** Unisce un segnale di timeout a un segnale di annullamento esterno. */
function _linkedSignal(externalSignal, ms) {
  const c = new AbortController();
  const onAbort = () => c.abort();
  if (externalSignal) {
    if (externalSignal.aborted) c.abort();
    else externalSignal.addEventListener('abort', onAbort, { once: true });
  }
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

/* ─── URL Normalization ─────────────────────────────── */
function normalizeCalUrl(url) {
  url = url.replace(/^webcal:\/\//i, 'https://');
  // Google Calendar: forza output=ics se non già presente
  if (url.includes('calendar.google.com') && !url.includes('output=')) {
    url += (url.includes('?') ? '&' : '?') + 'output=ics';
  }
  return url;
}

/* ─── Coda Google Calendar (fix "CORS bloccato" v1.3) ────────────────
   Google limita le richieste in raffica sui feed .ics privati fatte
   dallo stesso IP (il worker Cloudflare). Con 4 calendari Google
   caricati nello stesso istante, gli ultimi della raffica ricevono
   429/risposta vuota e risultavano "CORS bloccato" (Vico Garibaldi,
   LaValletta). Soluzione: max 2 fetch Google simultanei, con partenze
   distanziate di 400 ms. Gli altri feed (Octorate) restano paralleli. */
const _GCAL_MAX_CONCURRENT = 2;
const _GCAL_SPACING_MS     = 400;
let _gcalActive = 0;
let _gcalQueue  = [];
let _gcalLastStart = 0;

function _gcalSlot() {
  return new Promise(resolve => {
    const tryStart = () => {
      if (_gcalActive >= _GCAL_MAX_CONCURRENT) { _gcalQueue.push(tryStart); return; }
      const wait = Math.max(0, _gcalLastStart + _GCAL_SPACING_MS - Date.now());
      _gcalActive++;
      _gcalLastStart = Date.now() + wait;
      setTimeout(resolve, wait);
    };
    tryStart();
  });
}
function _gcalRelease() {
  _gcalActive = Math.max(0, _gcalActive - 1);
  const next = _gcalQueue.shift();
  if (next) next();
}

/* ─── Fetch con proxy fallback ─────────────────────────────── */

/** Costruisce la lista dei proxy PUBBLICI di riserva.
 *  Partenze scaglionate per non saturare i rate-limit (codetabs ~5 req/s)
 *  quando si caricano 20+ calendari. kind:'json' = risposta allorigins
 *  /get da spacchettare. */
function _publicProxyAttempts(url) {
  const enc = encodeURIComponent(url);
  return [
    { url: `https://api.allorigins.win/raw?url=${enc}`,      kind: 'raw',  delay: 0 },
    { url: `https://corsproxy.io/?url=${enc}`,               kind: 'raw',  delay: 300 },
    { url: `https://api.codetabs.com/v1/proxy?quest=${enc}`, kind: 'raw',  delay: 600 + Math.floor(Math.random() * 500) },
    { url: `https://api.allorigins.win/get?url=${enc}`,      kind: 'json', delay: 1200 },
  ];
}

/** URL del proxy personale per `url`, o null se non configurato. */
function _personalProxyUrl(url) {
  if (typeof PERSONAL_PROXY !== 'string' || !PERSONAL_PROXY.trim()) return null;
  const enc = encodeURIComponent(url);
  const p   = PERSONAL_PROXY.trim();
  return p.includes('{url}') ? p.replace('{url}', enc) : p + enc;
}

/** Esegue un singolo tentativo proxy; risolve SOLO con un .ics valido.
 *  @param {AbortSignal} [signal] per annullare i tentativi perdenti. */
async function _tryProxy(att, signal) {
  if (att.delay) {
    await new Promise((res, rej) => {
      const t = setTimeout(res, att.delay);
      signal?.addEventListener('abort', () => { clearTimeout(t); rej(new Error('aborted')); }, { once: true });
    });
  }
  if (signal?.aborted) throw new Error('aborted');
  const r = await fetch(att.url, { signal: _linkedSignal(signal, 15000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  let t = await r.text();
  if (att.kind === 'json') {
    try { t = JSON.parse(t).contents || ''; } catch (_) { throw new Error('bad json'); }
  }
  if (!t.includes('BEGIN:VCALENDAR')) throw new Error('not ics');
  return t;
}

async function fetchIcal(url) {
  url = normalizeCalUrl(url);
  const isGoogle = url.includes('calendar.google.com');

  // Prova diretta solo per feed NON Google (Octorate invia header CORS,
  // Google mai: il tentativo diretto era solo tempo perso).
  if (!isGoogle) {
    try {
      const r = await fetch(url, { mode: 'cors', signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        const t = await r.text();
        if (t.includes('BEGIN:VCALENDAR')) return t;
      }
    } catch (_) {}
  }

  // I feed Google passano dalla coda (max 2 simultanei, partenze
  // distanziate) per non farsi rate-limitare da Google.
  if (isGoogle) await _gcalSlot();

  /* v1.5.0 — STRATEGIA RISCRITTA.
     Prima si lanciavano in parallelo 3 tentativi sul proxy personale + 4
     proxy pubblici dentro una Promise.any, e nessuno veniva annullato:
     anche quando il worker rispondeva in 200 ms partivano comunque ~6
     richieste inutili per calendario (oltre 100 a giro con 20 feed), che
     è esattamente ciò che provocava i rate-limit.
     Adesso: proxy personale in SEQUENZA (2 tentativi, è il canale
     affidabile), e solo se fallisce si passa ai pubblici in parallelo,
     con AbortController che annulla i perdenti appena uno vince.        */
  let firstErr = '';
  try {
    const purl = _personalProxyUrl(url);
    if (purl) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return await _tryProxy({ url: purl, kind: 'raw', delay: attempt ? 1200 : 0 });
        } catch (e) {
          if (!firstErr) firstErr = e.message || '';
        }
      }
    }

    // Riserva: proxy pubblici in parallelo, il primo .ics valido vince.
    const ctrl = new AbortController();
    try {
      const txt = await Promise.any(_publicProxyAttempts(url).map(a => _tryProxy(a, ctrl.signal)));
      return txt;
    } catch (err) {
      if (!firstErr) firstErr = err?.errors?.[0]?.message || '';
      throw new Error(firstErr && firstErr !== 'not ics' ? 'CORS (' + firstErr + ')' : 'CORS');
    } finally {
      ctrl.abort();   // annulla i tentativi ancora in volo (vincitore incluso)
    }
  } finally {
    if (isGoogle) _gcalRelease();
  }
}

/* ─── iCal Unfolding ─────────────────────────────── */
function unfold(t) {
  return t.replace(/\r?\n[ \t]/g, '');
}

/* ─── Data Parsing ─────────────────────────────── */
function parseIcalDate(raw) {
  let v = raw.includes(':') ? raw.split(':').pop() : raw;
  v = v.trim();
  let m;
  // DateTime UTC (con Z)
  m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
  // DateTime locale (senza Z)
  m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]);
  // Solo data
  m = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return new Date(+m[1], +m[2]-1, +m[3]);
  return null;
}

/* ─── Event Parsing ─────────────────────────────── */
function parseIcalEvents(text) {
  const evs = [];
  let cur = null;
  for (const raw of unfold(text).split(/\r?\n/)) {
    const ln = raw.trim();
    if (ln === 'BEGIN:VEVENT')  { cur = {}; continue; }
    if (ln === 'END:VEVENT')    { if (cur) evs.push(cur); cur = null; continue; }
    if (!cur || !ln.includes(':')) continue;
    const ci   = ln.indexOf(':');
    const prop = ln.slice(0, ci).split(';')[0].toUpperCase();
    const val  = ln.slice(ci + 1);
    if (prop === 'UID')         cur.uid  = val.trim();
    if (prop === 'SUMMARY')     cur.sum  = val.trim();
    if (prop === 'DESCRIPTION') cur.desc = val.replace(/\\n/g, '\n').replace(/\\,/g, ',').trim();
    if (prop === 'DTSTART')     cur.dts  = parseIcalDate(ln.slice(0, ci) + ':' + val);
    if (prop === 'DTEND')       cur.dte  = parseIcalDate(ln.slice(0, ci) + ':' + val);
  }
  return evs;
}

/* ─── Extraction Helpers ─────────────────────────────── */

/**
 * Converte una stringa numerica in numero gestendo i separatori italiani
 * e anglosassoni.  v1.5.0 — CORREZIONE IMPORTANTE: prima un importo come
 * "Total(1.250,00)" veniva letto come 1,25 € e "(1.250,00)" come 250 €,
 * perché la regex si fermava alle prime due decimali e parseFloat
 * troncava al primo punto. Il totale annuo risultava semplicemente più
 * basso, senza nessun segnale d'errore.
 *   1.250,00 → 1250.00   ·   1,250.00 → 1250.00   ·   1250,50 → 1250.50
 */
function parseAmount(s) {
  if (s == null) return null;
  let v = String(s).trim().replace(/\s/g, '');
  if (!v) return null;
  const lastComma = v.lastIndexOf(',');
  const lastDot   = v.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // Il separatore decimale è l'ULTIMO dei due
    if (lastComma > lastDot) v = v.replace(/\./g, '').replace(',', '.');
    else                     v = v.replace(/,/g, '');
  } else if (lastComma > -1) {
    // Virgola sola: decimale se seguita da 1-2 cifre, altrimenti migliaia
    v = /,\d{1,2}$/.test(v) ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
  } else if (lastDot > -1) {
    // Punto solo: migliaia se seguito da esattamente 3 cifre (1.250)
    if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');
  }
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

/**
 * Estrae il prezzo dalla summary/description.
 * Priorità: Total(xxx) → (xxx) → keyword → € fallback
 */
function extractPrice(sum, desc) {
  const full = (sum || '') + '\n' + (desc || '');
  const NUM  = '\\d[\\d.,]*';   // accetta separatori delle migliaia
  let m;
  m = full.match(new RegExp('[Tt]otal\\s*\\(\\s*(' + NUM + ')\\s*\\)'));
  if (m) return parseAmount(m[1]);
  // importo fra parentesi: 350.00 · 1.234,56 · 12,50 (mai "1.5")
  m = full.match(new RegExp('\\(\\s*(\\d{1,3}(?:[.,]\\d{3})+[.,]\\d{2}|\\d{2,}[.,]\\d{2})\\s*\\)(?!\\w)'));
  if (m) return parseAmount(m[1]);
  m = full.match(new RegExp('(?:prezzo|price|total[ie]?|importo|amount|payout|totale)\\s*[:\\-]?\\s*(' + NUM + ')', 'i'));
  if (m) return parseAmount(m[1]);
  m = full.match(new RegExp('[€$]\\s*(' + NUM + ')'));
  if (m) return parseAmount(m[1]);
  return null;
}

/**
 * Estrae il cognome ospite.
 * 1) "Client Name (Surname)" o "Client Name: John (Surname)"
 * 2) "Client Name: Surname [Nome]"
 * 3) Parola in maiuscolo nella summary / ultima parola
 */
function extractSurname(sum, desc) {
  const full = (desc || '') + '\n' + (sum || '');

  // PRIMARY: Client Name (Cognome)
  let m = full.match(/[Cc]lient\s+[Nn]ame\s*:?\s*[^(\n\r]*\(\s*([^)\n\r]+)\s*\)/);
  if (m) {
    const val = m[1].trim();
    return val.split(/\s+/)[0];
  }

  // SECONDARY: Client Name: Cognome [Nome]
  m = full.match(/[Cc]lient\s+[Nn]ame\s*:\s*([^\n\r(,;]+)/);
  if (m) {
    const part = m[1].trim().replace(/\s*[-–].*$/, '').trim();
    const cap  = part.match(/\b([A-ZÀÈÌÒÙÁÉÍÓÚ]{2,})\b/);
    if (cap) return cap[1];
    return part.split(/\s+/)[0] || '—';
  }

  // TERTIARY: pulizia summary
  let name = (sum || '')
    .replace(/^(Airbnb|Booking\.com|VRBO|HomeAway|Expedia)\s*[-–]\s*/i, '')
    .replace(/\s*[-–]?\s*[Tt]otal\s*\([^)]+\)/g, '')
    .replace(/\s*\([\d.,]{3,}\)\s*/g, '')
    .replace(/^(Reservation|Prenotazione|Booking)\s*[:\-]\s*/i, '')
    .trim();

  if (!name) return '—';
  const words = name.split(/\s+/).filter(Boolean);
  if (!words.length) return '—';
  const capW = words.find(w => /^[A-ZÀÈÌÒÙÁÉÍÓÚ]{2,}$/.test(w));
  if (capW) return capW;
  return words.length > 1 ? words[words.length - 1] : words[0];
}

/**
 * Rileva la sorgente OTA dalla summary/description.
 */
function detectSource(sum, desc) {
  const t = ((sum || '') + (desc || '')).toLowerCase();
  /* v1.5.0 — Il test "blocco" gira SOLO sulla summary e con i confini di
     parola. Prima cercava anche in description parole cortissime come
     'block' e 'owner': una descrizione Booking che contiene "owner"
     (frequente nei messaggi automatici) o un ospite di cognome "Blocker"
     azzerava il prezzo e faceva sparire la prenotazione dai conteggi. */
  const s = (sum || '').toLowerCase();
  if (/\b(non disponibile|blocked|unavailable|not available|maintenance|manutenzione|chiuso|closed)\b/.test(s)) return 'blocked';
  if (/airbnb|hmid|\/hm[a-z0-9]/i.test(sum || '')) return 'airbnb';
  if (/booking\.com|booking/i.test(t)) return 'booking';
  if (/^hm[a-z0-9]/i.test(sum || '')) return 'airbnb';
  if (/^bk/i.test(sum || ''))         return 'booking';
  return 'other';
}

/* ─── Parse & Extract ─────────────────────────────── */
function parseAndExtract(icalTxt, cid, cname, defaultTag = 'auto', typesRef = null) {
  // typesRef: quando fornito (es. refresh Confronto), usa questa mappa invece del globale bookTypes
  const tgt = typesRef !== null ? typesRef : bookTypes;
  const evs = parseIcalEvents(icalTxt);
  return evs.filter(e => e.dts).map(e => {
    const nights = e.dte ? Math.round((e.dte - e.dts) / 86400000) : null;
    const source = detectSource(e.sum, e.desc);
    const uid    = e.uid || (cid + '_' + (e.sum || '').replace(/\W/g, '') + (e.dts?.getTime() || ''));
    const b = {
      uid, source,
      nome:         source === 'blocked' ? 'Non disponibile' : extractSurname(e.sum, e.desc),
      checkin:      e.dts,
      checkout:     e.dte,
      checkin_str:  fmtDate(e.dts),
      checkout_str: fmtDate(e.dte),
      prezzo:       source === 'blocked' ? null : extractPrice(e.sum, e.desc),
      notti:        nights,
      warnings:     [],
      isPast:       false,
      _cid:         cid,
      _cname:       cname,
      _sum:         e.sum  || '',
      _desc:        e.desc || '',
    };
    // Assegna tipologia: il default del calendario prevale sull'auto-detect,
    // ma NON sovrascrive una scelta manuale già salvata
    if (!tgt[uid]) {
      if (defaultTag && defaultTag !== 'auto') {
        if (source !== 'blocked') tgt[uid] = defaultTag;
      } else {
        if (source === 'airbnb')  tgt[uid] = 'airbnb';
        if (source === 'booking') tgt[uid] = 'booking';
      }
    }
    return b;
  });
}

/* ─── Paste Fallback ─────────────────────────────── */
function parsePaste() {
  const txt  = document.getElementById('pasteA').value.trim();
  const name = document.getElementById('pasteNm').value.trim() || 'Incollato';
  if (!txt || !txt.includes('BEGIN:VCALENDAR')) { sbStatus('err', 'Contenuto .ics non valido.'); return; }
  const id  = 'paste_' + genId();
  const cal = { id, name, url:'(incollato)', cnt:0, err:null };
  calSources.push(cal);
  saveCals();
  const books = parseAndExtract(txt, id, name);
  liveBooks = liveBooks.filter(b => b._cid !== id);
  liveBooks.push(...books);
  cal.cnt = books.filter(b => b.source !== 'blocked').length;
  saveCals();
  moveToPastCache();
  renderSidebar();
  renderAll();
  sbStatus('ok', `${cal.cnt} prenotazioni caricate.`);
}
