/* ═══════════════════════════════════════════════════════════════
   cloudflare-worker-proxy.js — Proxy CORS personale per i feed iCal
   Versione 1.5.0
   Da incollare in un Cloudflare Worker (piano gratuito).
   Vedi ISTRUZIONI_PROXY.md per il setup passo-passo.

   Novità v1.5.0:
   · Cache-Control: max-age=120 invece di no-store. Prima il browser non
     riusava mai nulla e ogni refresh ripartiva da zero, appoggiandosi
     solo alla cache edge di Cloudflare.
   · Origin consentite configurabili: compilando ALLOWED_ORIGINS il
     worker smette di essere utilizzabile da chiunque.
   · Errori upstream con status coerente (502) e messaggio leggibile,
     invece del corpo grezzo della risposta di Google.
═══════════════════════════════════════════════════════════════ */

// Solo questi host possono essere proxati (sicurezza: il worker
// non può essere abusato per raggiungere altri siti).
const ALLOWED_HOSTS = [
  'calendar.google.com',
  'admin.octorate.com',
];

// Domini autorizzati a chiamare il worker.
// Array VUOTO = consenti tutti (comportamento pre-1.5.0).
// Consigliato: inserisci il dominio del tuo sito Firebase, es.
//   'https://appartamento-tariffe-ok.web.app',
//   'https://appartamento-tariffe-ok.firebaseapp.com',
//   'http://localhost:5000',
const ALLOWED_ORIGINS = [];

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  let allow = '*';
  if (ALLOWED_ORIGINS.length) {
    if (!ALLOWED_ORIGINS.includes(origin)) return null;   // origin non ammessa
    allow = origin;
  }
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request) {
    const cors = corsHeaders(request);
    if (!cors) return new Response('Origin non consentita', { status: 403 });

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const reqUrl = new URL(request.url);
    const target = reqUrl.searchParams.get('url');

    if (!target) {
      return new Response('Parametro ?url= mancante', { status: 400, headers: cors });
    }

    let t;
    try { t = new URL(target); }
    catch (_) { return new Response('URL non valido', { status: 400, headers: cors }); }

    if (t.protocol !== 'https:') {
      return new Response('Solo HTTPS', { status: 400, headers: cors });
    }
    if (!ALLOWED_HOSTS.includes(t.hostname)) {
      return new Response('Host non consentito', { status: 403, headers: cors });
    }

    // Fino a 3 tentativi verso Google: sui feed .ics privati Google
    // rate-limita le raffiche (429) — un retry con backoff risolve.
    // La cache edge di 5 minuti evita del tutto le richieste ripetute.
    let upstream = null, body = '', lastErr = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 700 * attempt));
      try {
        upstream = await fetch(t.toString(), {
          headers: { 'User-Agent': 'gestionale-ical-proxy/1.5' },
          cf: { cacheTtl: 300, cacheEverything: true },  // cache edge 5 min
        });
        body = await upstream.text();
      } catch (e) {
        lastErr = e.message || 'fetch fallita';
        continue;
      }
      const retriable = upstream.status === 429 || upstream.status >= 500;
      const looksIcs  = body.includes('BEGIN:VCALENDAR');
      if (looksIcs || !retriable) break;
      lastErr = 'HTTP ' + upstream.status;
    }

    if (!upstream) {
      return new Response('Upstream irraggiungibile: ' + lastErr,
        { status: 502, headers: cors });
    }

    // Se dopo i retry non è un .ics valido, errore esplicito: il client
    // distingue così "feed vuoto" da "rate-limit di Google".
    if (!body.includes('BEGIN:VCALENDAR')) {
      return new Response('Feed non valido (' + (lastErr || upstream.status) + ')',
        { status: upstream.status === 200 ? 502 : upstream.status, headers: cors });
    }

    return new Response(body, {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'text/calendar; charset=utf-8',
        // v1.5.0: il browser può riusare la risposta per 2 minuti.
        'Cache-Control': 'public, max-age=120',
      },
    });
  },
};
