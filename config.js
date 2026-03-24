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
  { id:'grafici',   name:'Grafici',   icon:'📈', graficiView:true,   defaultCals:[] },
  { id:'admin',     name:'Admin',     icon:'⚙️',  adminView:true,    defaultCals:[] },
];

/* ── Gruppi per la vista Confronto ── */
const MAMMA_IDS = ['stoccolma','frescura','montenero'];
const GP_IDS    = ['attico','villa','corso','anfiteatro','scaro'];

/* ── Proxy CORS fallback list ── */
const PROXIES = [
  u => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  u => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
  u => `https://thingproxy.freeboard.io/fetch/${encodeURIComponent(u)}`,
  u => `https://cors-anywhere.herokuapp.com/${u}`,
];

/* ── Data corrente (normalizzata a mezzanotte) ── */
const TODAY = (() => { const d = new Date(); d.setHours(0,0,0,0); return d; })();

/* ── Versione applicazione ── */
const APP_VERSION = '1.1';
