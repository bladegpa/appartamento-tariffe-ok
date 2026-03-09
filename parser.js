/* ═══════════════════════════════════════
   parser.js — Fetch iCal + Parsing + Estrazione
   Versione 1.1
═══════════════════════════════════════ */

/* ─── URL Normalization ─────────────────────────────── */
function normalizeCalUrl(url) {
  url = url.replace(/^webcal:\/\//i, 'https://');
  // Google Calendar: forza output=ics se non già presente
  if (url.includes('calendar.google.com') && !url.includes('output=')) {
    url += (url.includes('?') ? '&' : '?') + 'output=ics';
  }
  return url;
}

/* ─── Fetch con proxy fallback ─────────────────────────────── */
async function fetchIcal(url) {
  url = normalizeCalUrl(url);
  // Prova diretta prima
  try {
    const r = await fetch(url, { mode:'cors', signal:AbortSignal.timeout(6000) });
    if (r.ok) {
      const t = await r.text();
      if (t.includes('BEGIN:VCALENDAR')) return t;
    }
  } catch(_) {}
  // Fallback su ogni proxy disponibile
  for (const pf of PROXIES) {
    try {
      const r = await fetch(pf(url), { signal:AbortSignal.timeout(10000) });
      if (r.ok) {
        const t = await r.text();
        if (t.includes('BEGIN:VCALENDAR')) return t;
      }
    } catch(_) {}
  }
  throw new Error('CORS');
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
 * Estrae il prezzo dalla summary/description.
 * Priorità: Total(xxx) → (xxx) → keyword → € fallback
 */
function extractPrice(sum, desc) {
  const full = (sum || '') + '\n' + (desc || '');
  let m;
  m = full.match(/[Tt]otal\s*\(\s*([\d]+(?:[.,]\d{1,2})?)\s*\)/);
  if (m) return parseFloat(m[1].replace(',', '.'));
  m = full.match(/\(\s*([\d]{2,}[.,]\d{2})\s*\)(?!\w)/);
  if (m) return parseFloat(m[1].replace(',', '.'));
  m = full.match(/(?:prezzo|price|total[ie]?|importo|amount|payout|totale)\s*[:\-]?\s*([\d]+(?:[.,]\d{1,2})?)/i);
  if (m) return parseFloat(m[1].replace(',', '.'));
  m = full.match(/[€$]\s*([\d]+[.,]\d{2})/);
  if (m) return parseFloat(m[1].replace(',', '.'));
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
  if (/non disponibile|blocked|block|unavailable|chiuso|maintenance|owner|not available/.test(t)) return 'blocked';
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
