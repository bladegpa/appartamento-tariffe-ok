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

    const upstream = await fetch(t.toString(), {
      headers: { 'User-Agent': 'gestionale-ical-proxy/1.0' },
      cf: { cacheTtl: 120, cacheEverything: true },  // mini-cache 2 min
    });

    const body = await upstream.text();
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
