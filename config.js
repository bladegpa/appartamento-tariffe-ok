/* ═══════════════════════════════════════
   config.js — Proprietà & Costanti
   Versione 1.1
═══════════════════════════════════════ */


/* ── Definizione appartamenti ── */
const PROPERTIES = [
  { id:'confronto', name:'Confronto', icon:'📊', confrontoView:true, defaultCals:[] },
  { id:'cerca',     name:'Cerca',     icon:'🔍', cercaView:true,     defaultCals:[] },
  { id:'calendario', name:'Cal',        icon:'📅', calendarioView:true, defaultCals:[] },
  { id:'spese',     name:'Spese',     icon:'🔧', speseView:true,     defaultCals:[] },
  { id:'attico', name:'Attico', icon:'🌅',
    defaultCals:[
      { name:'Attico · AirBnB',    url:'https://admin.octorate.com/cron/ICS/reservation/googlecal/463860_707483', defaultTag:'airbnb'  },
      { name:'Attico · Booking 1', url:'https://admin.octorate.com/cron/ICS/reservation/googlecal/463860_707192', defaultTag:'booking' },
      { name:'Attico · Booking 2', url:'https://admin.octorate.com/cron/ICS/reservation/googlecal/463860_707486', defaultTag:'booking' },
      { name:'Attico · Booking 3', url:'https://admin.octorate.com/cron/ICS/reservation/googlecal/463860_707722', defaultTag:'booking' },
    ]
  },
  { id:'montenero', name:'Casa Montenero', icon:'🏡',
    defaultCals:[
      { name:'Montenero · Booking 1', url:'https://admin.octorate.com/cron/ICS/reservation/googlecal/716128_541897', defaultTag:'booking' },
      { name:'Montenero · Booking 2', url:'https://admin.octorate.com/cron/ICS/reservation/googlecal/716128_703919', defaultTag:'booking' },
    ]
  },
  { id:'stoccolma', name:'Casa Stoccolma', icon:'🏠',
    defaultCals:[
      { name:'Stoccolma · Booking 1', url:'https://admin.octorate.com/cron/ICS/reservation/googlecal/46782_541901', defaultTag:'booking' },
      { name:'Stoccolma · Booking 2', url:'https://admin.octorate.com/cron/ICS/reservation/googlecal/46782_541900', defaultTag:'booking' },
      { name:'Stoccolma · Booking 3', url:'https://admin.octorate.com/cron/ICS/reservation/googlecal/46782_650237', defaultTag:'booking' },
      { name:'Stoccolma · AirBnB',    url:'https://admin.octorate.com/cron/ICS/reservation/googlecal/46782_650623', defaultTag:'airbnb'  },
    ]
  },
  { id:'frescura', name:'Casa Frescura', icon:'🌿',
    defaultCals:[
      { name:'Frescura · Booking 1', url:'https://admin.octorate.com/cron/ICS/reservation/googlecal/439799_541895', defaultTag:'booking' },
      { name:'Frescura · Booking 2', url:'https://admin.octorate.com/cron/ICS/reservation/googlecal/439799_601018', defaultTag:'booking' },
      { name:'Frescura · AirBnB',    url:'https://admin.octorate.com/cron/ICS/reservation/googlecal/439799_652271', defaultTag:'airbnb'  },
    ]
  },
  { id:'villa', name:'Casa della Villa', icon:'🏛',
    defaultCals:[
      { name:'Villa · Booking 1', url:'https://admin.octorate.com/cron/ICS/reservation/googlecal/690122_707235', defaultTag:'booking' },
      { name:'Villa · AirBnB',    url:'https://admin.octorate.com/cron/ICS/reservation/googlecal/690122_707237', defaultTag:'airbnb'  },
      { name:'Villa · Booking 2', url:'https://admin.octorate.com/cron/ICS/reservation/googlecal/690122_707236', defaultTag:'booking' },
    ]
  },
  { id:'corso', name:'Casa del Corso', icon:'🛖',
    defaultCals:[
      { name:'Corso · Booking 1', url:'https://admin.octorate.com/cron/ICS/reservation/googlecal/554002_820702', defaultTag:'booking' },
      { name:'Corso · Booking 2', url:'https://admin.octorate.com/cron/ICS/reservation/googlecal/554002_820845', defaultTag:'booking' },
      { name:'Corso · AirBnB',    url:'https://admin.octorate.com/cron/ICS/reservation/googlecal/554002_820889', defaultTag:'airbnb'  },
    ]
  },
  { id:'anfiteatro', name:'Casa Anfiteatro', icon:'🏺',
    editMode: true,
    defaultCals:[
      { name:'Anfiteatro · Google Cal', url:'https://calendar.google.com/calendar/ical/2b9bbc5e6995fe60944340db6c098af574d960443d48adf5061a411f20452f2f%40group.calendar.google.com/private-621b47ef5a1cd753f09fed5dc165870a/basic.ics', defaultTag:'diretta' },
    ]
  },
  { id:'scaro', name:'Casa Scaro', icon:'⛵',
    editMode: true,
    defaultCals:[
      { name:'Scaro · Google Cal', url:'https://calendar.google.com/calendar/ical/d46338cda54f87d6957b8f33e59b456adc787026ada207d9e4590793e6d4bd76%40group.calendar.google.com/private-9cbde3c1a38569c330702bddb823505c/basic.ics', defaultTag:'diretta' },
    ]
  },
  { id:'vicogaribaldi', name:'Vico Garibaldi', icon:'🏘',
    editMode: true,
    defaultCals:[
      { name:'Vico Garibaldi · Google Cal', url:'https://calendar.google.com/calendar/ical/e9a2ff18bcba0b184ba9397729e12a131c039f21e8ab392100d9a355dd958bc2%40group.calendar.google.com/private-947532ad53a64819d39ce59f1db4ca1f/basic.ics', defaultTag:'diretta' },
    ]
  },
  { id:'lavalletta', name:'LaValletta', icon:'🌊',
    editMode: true,
    defaultCals:[
      { name:'LaValletta · Google Cal', url:'https://calendar.google.com/calendar/ical/0263bb3caa77bf5b8d34a07b953433f67832f2dc0b566d3df6b918770ce18695%40group.calendar.google.com/private-5884f16c882caaf04da644aa27ae6b05/basic.ics', defaultTag:'diretta' },
    ]
  },
  { id:'grafici',   name:'Grafici',   icon:'📈', graficiView:true,   defaultCals:[] },
  { id:'admin',     name:'Admin',     icon:'⚙️',  adminView:true,    defaultCals:[] },
];

/* ── Gruppi per la vista Confronto ── */
const MAMMA_IDS = ['stoccolma','frescura','montenero'];
const GP_IDS    = ['attico','villa','corso','anfiteatro','scaro','vicogaribaldi','lavalletta'];

/* ── Helper: proprietà reali (esclude TUTTE le viste speciali) ──
   Usare SEMPRE questo al posto dei filtri manuali sparsi nel codice:
   evita che pseudo-schede come 'calendario' o 'spese' finiscano
   nei conteggi/ripartizioni. */
function isRealProp(p) {
  return !p.adminView && !p.confrontoView && !p.cercaView &&
         !p.graficiView && !p.speseView && !p.calendarioView;
}
function realProperties() { return PROPERTIES.filter(isRealProp); }

/* ── Proxy CORS ────────────────────────────────────────────────
   I calendari Google (calendar.google.com) non inviano header CORS,
   quindi il fetch dal browser deve passare da un proxy.

   PERSONAL_PROXY (consigliato): URL del tuo proxy privato, es. un
   Cloudflare Worker gratuito (vedi cloudflare-worker-proxy.js e
   ISTRUZIONI_PROXY.md). Formato: l'URL del calendario codificato
   viene accodato, oppure usa il segnaposto {url}.
   Esempi:
     'https://ical-proxy.TUONOME.workers.dev/?url='
     'https://miodominio.it/proxy?target={url}'
   Se vuoto, si usano solo i proxy pubblici (meno affidabili).      */
const PERSONAL_PROXY = 'https://hidden-base-b79f.bladegpa.workers.dev/?url=';

/* Proxy pubblici di fallback (v1.2.1 — lista aggiornata):
   · corsproxy.io richiede ora il formato ?url= e senza API key
     funziona solo da domini di sviluppo → può rispondere 403
   · thingproxy e cors-anywhere sono stati rimossi (non più operativi)
   La lista effettiva è costruita in parser.js (_proxyAttempts).     */

/* ── Data corrente (normalizzata a mezzanotte) ── */
const TODAY = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();

/* ── Versione applicazione ── */
const APP_VERSION = '1.4.3';
