/* ═══════════════════════════════════════════════════════════════
   cloudflare-worker-proxy.js — Proxy CORS personale per i feed iCal
   Da incollare in un Cloudflare Worker (piano gratuito).
   Vedi ISTRUZIONI_PROXY.md per il setup passo-passo.
═══════════════════════════════════════════════════════════════ */

// Solo questi host possono essere proxati (sicurezza: il worker
// non può essere abusato per raggiungere altri siti).
const ALLOWED_HOSTS = [
  'calendar.google.com',
  'admin.octorate.com',
];

export default {
  async fetch(request) {
    const reqUrl = new URL(request.url);
    const target = reqUrl.searchParams.get('url');

    if (!target) {
      return new Response('Parametro ?url= mancante', { status: 400 });
    }

    let t;
    try { t = new URL(target); }
    catch (_) { return new Response('URL non valido', { status: 400 }); }

    if (t.protocol !== 'https:') {
      return new Response('Solo HTTPS', { status: 400 });
    }
    if (!ALLOWED_HOSTS.includes(t.hostname)) {
      return new Response('Host non consentito', { status: 403 });
    }

    // Fino a 3 tentativi verso Google: sui feed .ics privati Google
    // rate-limita le raffiche (429) — un retry con backoff risolve.
    // La cache edge di 5 minuti evita del tutto le richieste ripetute.
    let upstream, body = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 700 * attempt));
      upstream = await fetch(t.toString(), {
        headers: { 'User-Agent': 'gestionale-ical-proxy/1.3' },
        cf: { cacheTtl: 300, cacheEverything: true },  // cache edge 5 min
      });
      body = await upstream.text();
      const retriable = upstream.status === 429 || upstream.status >= 500;
      const looksIcs  = body.includes('BEGIN:VCALENDAR');
      if (looksIcs || !retriable) break;
    }

    return new Response(body, {
      status: upstream.status,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    });
  },
};
