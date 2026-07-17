/* ═══════════════════════════════════════
   app.js — Bootstrap, Navigazione, Calendari
   Versione 1.1
═══════════════════════════════════════ */

/* ─── Property Bar ─────────────────────────────── */
function renderPropBar() {
  const bar = document.getElementById('propBar');
  bar.innerHTML = PROPERTIES.map((p, i) => {
    const active       = p.id === currentPropId ? ' active' : '';
    const isAdmin      = p.adminView ? ' style="margin-left:8px;opacity:.7"' : '';
    const isSpecialLeft= '';
    const sep = (!p.allView && !p.confrontoView && !p.adminView && !p.cercaView && !p.graficiView && !p.speseView && i > 0)
      ? '<div class="prop-bar-sep"></div>' : '';
    return `${isSpecialLeft}${sep}<button class="prop-tab${active}"${isAdmin} onclick="switchProp('${p.id}')">
      <span class="prop-icon">${p.icon}</span>${p.name}
    </button>`;
  }).join('');
  // Aggiorna frecce e porta la scheda attiva in vista
  _updatePropBarArrows();
  _scrollActiveTabIntoView();
}

/* ─── Scroll orizzontale barra schede (frecce ‹ ›) ─────────────── */
function _scrollPropBar(dir) {
  const bar = document.getElementById('propBar');
  if (!bar) return;
  // Scorre di ~70% della larghezza visibile
  bar.scrollBy({ left: dir * bar.clientWidth * 0.7, behavior: 'smooth' });
}

function _updatePropBarArrows() {
  const bar = document.getElementById('propBar');
  const aL  = document.getElementById('propBarArrowL');
  const aR  = document.getElementById('propBarArrowR');
  if (!bar || !aL || !aR) return;
  const overflow = bar.scrollWidth - bar.clientWidth;
  if (overflow <= 4) {                 // nessun overflow: niente frecce
    aL.classList.remove('on');
    aR.classList.remove('on');
    return;
  }
  const x = bar.scrollLeft;
  aL.classList.toggle('on', x > 4);
  aR.classList.toggle('on', x < overflow - 4);
}

function _scrollActiveTabIntoView() {
  const bar = document.getElementById('propBar');
  const act = bar?.querySelector('.prop-tab.active');
  if (!bar || !act) return;
  // Centra la scheda attiva se è fuori (o quasi) dalla vista
  const bl = bar.scrollLeft, br = bl + bar.clientWidth;
  const tl = act.offsetLeft, tr = tl + act.offsetWidth;
  if (tl < bl + 24 || tr > br - 24) {
    bar.scrollTo({ left: tl - bar.clientWidth / 2 + act.offsetWidth / 2, behavior: 'smooth' });
  }
}

/* Aggancia gli aggiornatori una sola volta */
(function _initPropBarScrollListeners() {
  function attach() {
    const bar = document.getElementById('propBar');
    if (!bar) return;
    bar.addEventListener('scroll', _updatePropBarArrows, { passive: true });
    // Rotellina verticale → scroll orizzontale (desktop)
    bar.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        bar.scrollLeft += e.deltaY;
        e.preventDefault();
      }
    }, { passive: false });
    window.addEventListener('resize', _updatePropBarArrows);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attach);
  } else {
    attach();
  }
})();

/* ─── Riconciliazione calendari default (v1.3) ────────────────────────
   Garantisce che gli URL definiti in config.js siano sempre presenti e
   aggiornati anche quando in localStorage/Firestore è rimasta salvata
   una versione vecchia (causa tipica di feed che "non si sincronizzano
   più"). I calendari aggiunti a mano dall'utente vengono preservati. */
function reconcileDefaultCals(prop, cals) {
  const defs = prop?.defaultCals || [];
  if (!defs.length) return { cals, changed: false };
  let changed = false;
  defs.forEach((def, i) => {
    const byUrl = cals.find(c => c.url === def.url);
    if (byUrl) {
      if (byUrl.name !== def.name) { byUrl.name = def.name; changed = true; }
      if ((byUrl.defaultTag || 'auto') !== (def.defaultTag || 'auto')) {
        byUrl.defaultTag = def.defaultTag || 'auto'; changed = true;
      }
      return;
    }
    const byId = cals.find(c => c.id === 'default' + (i || ''));
    if (byId) {
      // Slot default esistente ma con URL diverso da config.js → aggiorna
      byId.url  = def.url;
      byId.name = def.name;
      byId.defaultTag = def.defaultTag || 'auto';
      byId.err  = null;
      changed = true;
      return;
    }
    cals.push({ id: 'default' + (i || ''), name: def.name, url: def.url,
                cnt: 0, err: null, defaultTag: def.defaultTag || 'auto' });
    changed = true;
  });
  return { cals, changed };
}

/* ─── Switch Property ─────────────────────────────── */
/* ─── Split books by year (current vs next year) ─────────────────── */
function _splitBooksByYear(allBooks) {
  const NY_START = new Date(CURRENT_YEAR + 1, 0, 1); // 1 Jan next year
  const CY_START = new Date(CURRENT_YEAR,     0, 1); // 1 Jan current year
  const curr = [], next = [];
  allBooks.forEach(b => {
    if (!b.checkin) { curr.push(b); return; }
    // Book belongs to next year if checkin >= 1 Jan next year
    if (b.checkin >= NY_START) {
      next.push(b);
    } else {
      curr.push(b);
    }
  });
  return { curr, next };
}

function switchProp(id) {
  if (id === currentPropId) return;

  // Salva stato della proprietà corrente (solo per proprietà reali)
  const _specialIds = new Set(['admin','confronto','cerca','spese','grafici','calendario']);
  if (!_specialIds.has(currentPropId)) {
    saveCals(); saveTypes(); savePast();
  }

  currentPropId = id;
  editModeActive = false;
  localStorage.setItem('octo_current_prop', id);
  calSources = []; bookTypes = {}; pastCache = {}; liveBooks = []; nextYearBooks = [];
  sortSt = { col:'checkin', dir:'asc' };

  // Rimuovi viste speciali e nascondi elementi normali
  ['adminView','confrontoView','cercaView','graficiView','speseView','calendarioView'].forEach(vid => {
    const el = document.getElementById(vid); if (el) el.remove();
  });
  document.getElementById('statsWrap').style.display = 'none';
  document.getElementById('resWrap').style.display   = 'none';
  document.getElementById('welcome').style.display   = 'none';
  const _srw = document.getElementById('speseRealiWidgetWrap'); if (_srw) _srw.style.display = 'none';
  const _nyp = document.getElementById('nextYearPanelWrap'); if (_nyp) _nyp.style.display = 'none';

  // Mostra/nascondi sidebar
  const sidebar   = document.querySelector('.sidebar');
  const shell     = document.querySelector('.shell');
  const isSpecial = id === 'admin' || id === 'confronto' || id === 'cerca' || id === 'grafici' || id === 'spese' || id === 'calendario';
  if (isSpecial) {
    sidebar.style.display = 'none';
    shell.classList.add('no-sidebar');
  } else {
    sidebar.style.display = '';
    shell.classList.remove('no-sidebar');
  }

  renderPropBar();
  const prop = PROPERTIES.find(p => p.id === id);
  document.getElementById('propLabel').textContent = `· ${prop?.name || id}`;

  if (id === 'admin')     { renderAdminView();                return; }
  if (id === 'confronto') { refreshAllPropsForConfronto();   return; }
  if (id === 'cerca')     { renderCercaView();               return; }
  if (id === 'spese')     { renderSpeseView();               return; }
  if (id === 'grafici')   { renderGraficiView();             return; }
  if (id === 'calendario') { renderCalendarioView();           return; }
  initProperty();
}

/* ─── Init ─────────────────────────────── */
/* ─── Admin: Salva tutte le impostazioni ─────────────────────────────── */
function adminSaveAll() {
  const realProps = realProperties();

  // 1. Spese operative globali
  const speseKeys = ['luce','welcomePack','pulizie','lavanderia','tassaSoggiorno'];
  const speseObj = {};
  speseKeys.forEach(k => {
    const el = document.getElementById(`adm_spese_${k}`);
    if (el) speseObj[k] = parseFloat(el.value) || 0;
  });
  if (Object.keys(speseObj).length) saveSpese(speseObj);

  // 2. Gestione / Affitto per appartamento
  realProps.forEach(p => {
    const el = document.getElementById(`adm_gest_${p.id}`);
    if (el) saveGestione(p.id, parseFloat(el.value) || 0);
  });

  // 3. Commissioni OTA + Regime fiscale per appartamento
  realProps.forEach(p => {
    const bk  = document.getElementById(`adm_bk_${p.id}`)?.value;
    const ab  = document.getElementById(`adm_ab_${p.id}`)?.value;
    const reg = document.getElementById(`adm_reg_${p.id}`)?.value;
    const dir = document.getElementById(`adm_dir_${p.id}`)?.checked;
    if (bk == null) return;
    const d = { regime: reg || 'cedolare', bkComm: bk, abComm: ab, inclDir: !!dir };
    const v = JSON.stringify(d);
    localStorage.setItem(`octo_fiscal_${p.id}_v3`, v);
    DB.save(`octo_fiscal_${p.id}_v3`, v);
  });

  // Feedback visivo
  const status = document.getElementById('adminSaveStatus');
  if (status) {
    status.textContent = '✓ Impostazioni salvate';
    status.style.opacity = '1';
    setTimeout(() => { status.style.opacity = '0'; }, 2800);
  }

  sbStatus('ok', 'Impostazioni salvate.');
}

async function init() {
  // Avvia sempre sulla vista Confronto
  currentPropId = 'confronto';
  localStorage.setItem('octo_current_prop', currentPropId);

  const sidebar = document.querySelector('.sidebar');
  sidebar.style.display = 'none';
  document.querySelector('.shell').classList.add('no-sidebar');

  renderPropBar();
  document.getElementById('propLabel').textContent = '· Confronto';
  document.getElementById('versionBadge').textContent = `v${APP_VERSION}`;

  // Inizializza Firebase e scarica i dati cloud prima del primo render
  DB.init();
  await DB.pullAll();

  // Controlla cambio anno: archivia automaticamente se siamo al 1° gennaio
  const rollover = checkYearRollover();
  renderYearSwitcher();
  if (rollover.rolledOver) showRolloverNotification(rollover.archived);

  refreshAllPropsForConfronto();

  // Flush saves pendenti quando l'utente chiude la tab/app
  // Garantisce che tag/prezzi modificati arrivino sempre su Firebase
  window.addEventListener('beforeunload', () => { DB.flush(); });

  // Pull dal cloud quando la tab/PWA torna in primo piano (throttle 60s):
  // una PWA lasciata aperta su un dispositivo riceve così i tag/prezzi
  // modificati dall'altro dispositivo senza dover ricaricare la pagina.
  let _lastFocusPull = Date.now();
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - _lastFocusPull < 60000) return;
    _lastFocusPull = Date.now();
    try {
      const updated = await DB.pullAll();
      if (!updated) return;
      const special = new Set(['admin','confronto','cerca','spese','grafici','calendario']);
      if (!special.has(currentPropId)) {
        // Ricarica i tag della proprietà corrente e ridisegna (nessun refetch feed)
        try { bookTypes = JSON.parse(localStorage.getItem(skTypes()) || '{}'); } catch(_) {}
        try { applyTypeOverrides(currentPropId, bookTypes); } catch(_) {}
        try { renderAll(); } catch(_) {}
      }
    } catch(_) {}
  });
}

/* ─── Init Property ─────────────────────────────── */
function initProperty() {
  try { calSources = JSON.parse(localStorage.getItem(skCals())  || '[]');  } catch(e) { calSources = []; }
  try { bookTypes  = JSON.parse(localStorage.getItem(skTypes()) || '{}'); } catch(e) { bookTypes  = {}; }
  try { applyTypeOverrides(currentPropId, bookTypes); } catch(_) {}
  try { pastCache  = JSON.parse(localStorage.getItem(skPast())  || '{}');  } catch(e) { pastCache  = {}; }

  // Seed + riconciliazione calendari di default (config.js è la fonte
  // di verità: URL vecchi salvati in storage vengono aggiornati)
  {
    const prop = PROPERTIES.find(p => p.id === currentPropId);
    const rec  = reconcileDefaultCals(prop, calSources);
    calSources = rec.cals;
    if (rec.changed) saveCals();
  }

  // Pulisci viste speciali rimaste nel DOM
  ['adminView','confrontoView','cercaView','graficiView','speseView','calendarioView'].forEach(id => {
    const el = document.getElementById(id); if (el) el.remove();
  });
  ['tBody','tFoot'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = '';
  });
  document.getElementById('statsWrap').style.display = 'none';
  document.getElementById('resWrap').style.display   = 'none';
  document.getElementById('welcome').style.display   = '';

  nextYearBooks = loadNextYear();
  loadFiscal();
  renderSidebar();
  if (calSources.length > 0) refreshAll();
  else renderAll();
}

/* ─── Refresh All Properties → poi mostra Confronto ─────────── */
async function refreshAllPropsForConfronto() {
  // Mostra subito uno schermata di caricamento nel contenuto principale
  const mainC = document.getElementById('mainC');
  const old   = document.getElementById('confrontoView');
  if (old) old.remove();
  document.getElementById('statsWrap').style.display = 'none';
  document.getElementById('resWrap').style.display   = 'none';
  document.getElementById('welcome').style.display   = 'none';

  // Spinner di attesa
  mainC.insertAdjacentHTML('beforeend', `
    <div id="confrontoLoadingSpinner" style="
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      padding:60px 20px; gap:16px;
    ">
      <div style="width:36px;height:36px;border:3px solid var(--bdr);border-top-color:var(--acc);
        border-radius:50%;animation:rot .7s linear infinite"></div>
      <div style="font-size:13px;font-weight:700;color:var(--ink2)" id="cfLoadMsg">
        Aggiornamento calendari in corso…
      </div>
      <div style="font-size:11px;color:var(--ink2);opacity:.6" id="cfLoadSub">
        Caricamento di tutti gli appartamenti
      </div>
    </div>
  `);

  const realProps = realProperties();

  let done = 0;
  const total = realProps.reduce((s, p) => s + (p.defaultCals?.length || 0), 0) || realProps.length;

  // In modalita' archivio non carichiamo i calendari iCal (dati storici gia' in storage)
  if (viewingArchive) {
    const spinner2 = document.getElementById('confrontoLoadingSpinner');
    if (spinner2) spinner2.remove();
    renderConfrontoView();
    return;
  }

  // Per ogni proprietà: carica i suoi calendari in parallelo
  await Promise.allSettled(realProps.map(async prop => {
    // Leggi calSources da localStorage (o seed dai default)
    let cals = [];
    try { cals = JSON.parse(localStorage.getItem(`octo_cals_${prop.id}_v3`) || '[]'); } catch(e) {}

    // Riconcilia SEMPRE con i default di config.js: URL vecchi salvati in
    // storage non possono più bloccare la sincronizzazione (v1.3)
    const rec = reconcileDefaultCals(prop, cals);
    cals = rec.cals;
    if (rec.changed) localStorage.setItem(`octo_cals_${prop.id}_v3`, JSON.stringify(cals));
    if (!cals.length) return;

    // Carica tutti i calendari di questa proprietà in parallelo
    const propBooks = [];
    let   propTypes = {};
    try { propTypes = JSON.parse(localStorage.getItem(skYearTypes(prop.id)) || '{}'); } catch(e) {}

    // Carica i nomi modificati manualmente prima del refresh (come fa refreshAll)
    const propManualNomi = new Map();
    try {
      const oldLiveRaw = JSON.parse(localStorage.getItem(skYearLive(prop.id)) || '[]');
      oldLiveRaw.forEach(raw => {
        if (!raw.uid) return;
        const autoNome = extractSurname(raw._sum || '', raw._desc || '');
        // Salva il nome solo se è stato modificato rispetto all'auto-estratto
        if (raw.nome && raw.nome !== '—' && raw.nome !== autoNome) {
          propManualNomi.set(raw.uid, raw.nome);
        }
      });
      // Controlla anche past cache per prenotazioni passate con nome modificato
      const oldPastRaw = JSON.parse(localStorage.getItem(skYearPast(prop.id)) || '{}');
      Object.values(oldPastRaw).forEach(raw => {
        if (!raw.uid || propManualNomi.has(raw.uid)) return;
        const autoNome = extractSurname(raw._sum || '', raw._desc || '');
        if (raw.nome && raw.nome !== '—' && raw.nome !== autoNome) {
          propManualNomi.set(raw.uid, raw.nome);
        }
      });
    } catch(_) {}

    await Promise.allSettled(cals.map(async cal => {
      try {
        const txt   = await fetchIcal(cal.url);
        // Passa propTypes come typesRef: preserva i tag salvati per questa proprietà
        // senza contaminare il bookTypes globale (che appartiene ad un'altra proprietà)
        const books = parseAndExtract(txt, cal.id, cal.name, cal.defaultTag || 'auto', propTypes);
        propBooks.push(...books);
        cal.cnt = books.filter(b => b.source !== 'blocked').length;
        cal.err = null;
      } catch(e) {
        cal.err = e.message === 'CORS' ? 'CORS bloccato' : e.message.slice(0, 55);
      }
      done++;
      const sub = document.getElementById('cfLoadSub');
      if (sub) sub.textContent = `${done} / ${total} calendari caricati`;
    }));

    // Applica price overrides prima di salvare (i prezzi modificati manualmente persistono)
    const propPriceOverrides = loadPriceOverrides(prop.id);
    propBooks.forEach(b => {
      if (propPriceOverrides[b.uid] !== undefined) b.prezzo = propPriceOverrides[b.uid];
    });

    // Ripristina i nomi modificati manualmente (sopravvivono al refresh iCal)
    if (propManualNomi.size > 0) {
      propBooks.forEach(b => {
        if (propManualNomi.has(b.uid)) b.nome = propManualNomi.get(b.uid);
      });
    }

    // Deduplica propBooks per uid (stesso booking può apparire in più feed Octorate)
    const _seenUids = new Set();
    const propBooksDedup = propBooks.filter(b => {
      if (_seenUids.has(b.uid)) return false;
      _seenUids.add(b.uid); return true;
    });

    // Separa prenotazioni anno corrente da anno prossimo
    const NY_START_CF = new Date(CURRENT_YEAR + 1, 0, 1);
    const currBooks = propBooksDedup.filter(b => !b.checkin || b.checkin < NY_START_CF);
    const nextBooks = propBooksDedup.filter(b => b.checkin && b.checkin >= NY_START_CF);

    // ── SALVA PAST CACHE ──────────────────────────────────────────────────────
    // STEP 1: carica pastCache esistente
    let pastC = {};
    try { pastC = JSON.parse(localStorage.getItem(skYearPast(prop.id)) || '{}'); } catch(e) {}

    // STEP 2: CRITICO — salva i vecchi liveBooks con checkout passato prima che vengano
    // sovrascritti. Se un booking era live e ora il feed iCal non lo include più (perché
    // Octorate lo rimuove dal feed dopo il checkout), sarebbe perso senza questa operazione.
    try {
      const oldLiveRaw = JSON.parse(localStorage.getItem(skYearLive(prop.id)) || '[]');
      oldLiveRaw.forEach(raw => {
        const b = deserBook(raw);
        if (b.uid && b.checkout && b.checkout <= TODAY && b.source !== 'blocked' && !pastC[b.uid]) {
          // Applica override prezzo anche sul salvataggio in past cache
          if (propPriceOverrides[b.uid] !== undefined) b.prezzo = propPriceOverrides[b.uid];
          pastC[b.uid] = serBook(b);
        }
      });
    } catch(_) {}

    // STEP 3: aggiungi anche i nuovi currBooks con checkout passato
    currBooks.forEach(b => {
      if (b.checkout && b.checkout <= TODAY && b.source !== 'blocked' && !pastC[b.uid]) {
        pastC[b.uid] = serBook(b);
      }
    });

    // STEP 4: salva pastC aggiornata
    const pastCJson = JSON.stringify(pastC);
    localStorage.setItem(skYearPast(prop.id), pastCJson);
    try { DB.save(skYearPast(prop.id), pastCJson); } catch(_) {}

    // ── SALVA TYPES (propTypes aggiornato dal parse) ──────────────────────────
    // Persiste i nuovi uid auto-rilevati durante il parse del feed fresco.
    // Gli override manuali vengono ri-applicati prima del salvataggio, così
    // il push su cloud non può mai cancellare un tag scelto a mano.
    try { applyTypeOverrides(prop.id, propTypes); } catch(_) {}
    const typesJson = JSON.stringify(propTypes);
    localStorage.setItem(skYearTypes(prop.id), typesJson);
    try { DB.save(skYearTypes(prop.id), typesJson); } catch(_) {}

    // ── SALVA LIVE E NEXT YEAR ────────────────────────────────────────────────
    const liveJson = JSON.stringify(currBooks.map(serBook));
    const nyk      = skNextYearP(prop.id);
    const nykJson  = JSON.stringify(nextBooks.map(serBook));
    const calsJson = JSON.stringify(cals);

    localStorage.setItem(`octo_cals_${prop.id}_v3`, calsJson);
    localStorage.setItem(skYearLive(prop.id), liveJson);
    localStorage.setItem(nyk, nykJson);
    // DB.save aggiorna anche _setLocalTs — garantisce che le modifiche recenti
    // non vengano sovrascritte da cloud più vecchio al prossimo avvio
    try { DB.save(skYearLive(prop.id), liveJson); } catch(_) {}
    try { DB.save(nyk, nykJson); } catch(_) {}
    try { DB.save(`octo_cals_${prop.id}_v3`, calsJson); } catch(_) {}

    // ── SYNC LOG: registra l'evento di sincronizzazione ──
    try {
      const prevLiveRaw = (() => { try { return JSON.parse(localStorage.getItem(skYearLive(prop.id)) || '[]').map(b=>b.uid); } catch(_) { return []; } })();
      const prevUids  = new Set(prevLiveRaw);
      const currUids  = new Set(currBooks.map(b => b.uid));
      const newUids   = currBooks.filter(b => !prevUids.has(b.uid) && b.source !== 'blocked').map(b => b.nome + ' ' + b.checkin_str);
      const remUids   = [...prevUids].filter(u => !currUids.has(u)).length;
      appendSyncLogEntry({
        propId:    prop.id,
        propName:  prop.name || prop.id,
        nLive:     currBooks.filter(b => b.source !== 'blocked').length,
        nPast:     Object.keys(pastC).length,
        calResults: cals.map(c => ({ name: c.name, cnt: c.cnt, err: c.err })),
        allFailed:  cals.every(c => c.err !== null),
        newCount:   newUids.length,
        newSample:  newUids.slice(0, 5),
        removedCount: remUids,
      });
    } catch(_) {}
  }));

  // Rimuovi lo spinner e mostra la vista confronto
  const spinner = document.getElementById('confrontoLoadingSpinner');
  if (spinner) spinner.remove();

  renderConfrontoView();
}

/* ─── Refresh All Calendars ─────────────────────────────── */
async function refreshAll() {
  if (!calSources.length) { sbStatus('err', 'Nessun calendario configurato.'); return; }

  const btn = document.getElementById('btnRef');
  const ico = document.getElementById('refIco');
  btn.disabled = true;
  ico.style.animation = 'rot .6s linear infinite';
  sbStatus('info', `Aggiornamento ${calSources.length} calendario/i…`, true);
  document.getElementById('corsTip').classList.remove('on');

  // Preserva le modifiche manuali di nome/prezzo prima del refresh
  const manualEdits = new Map();
  const savedLive   = JSON.parse(localStorage.getItem(skLive()) || '[]');
  savedLive.forEach(b => {
    if (b.uid) manualEdits.set(b.uid, { nome: b.nome, prezzo: b.prezzo });
  });
  Object.entries(pastCache).forEach(([uid, b]) => {
    if (!manualEdits.has(uid)) manualEdits.set(uid, { nome: b.nome, prezzo: b.prezzo });
  });

  // RESCUE: prima di azzerare liveBooks, salva in pastCache le prenotazioni passate
  // che potrebbero non essere più nel feed iCal (il feed le rimuove dopo il checkout)
  liveBooks.forEach(b => {
    if (b.checkout && b.checkout <= TODAY && b.source !== 'blocked' && !pastCache[b.uid]) {
      pastCache[b.uid] = serBook(b);
    }
  });
  savePast();

  liveBooks = [];
  await Promise.allSettled(calSources.map(c => loadOneCal(c, false)));

  // Ripristina il nome se modificato manualmente (diverso dall'estratto automatico)
  liveBooks.forEach(b => {
    const saved = manualEdits.get(b.uid);
    if (!saved) return;
    if (saved.nome && saved.nome !== '—' && saved.nome !== extractSurname(b._sum, b._desc)) {
      b.nome = saved.nome;
    }
  });

  // Applica price overrides: i prezzi modificati manualmente sopravvivono al refresh
  const priceOverrides = loadPriceOverrides(currentPropId);
  liveBooks.forEach(b => {
    if (priceOverrides[b.uid] !== undefined) b.prezzo = priceOverrides[b.uid];
  });

  const corsBlocked = calSources.some(c => c.err && c.err.includes('CORS'));
  if (corsBlocked) document.getElementById('corsTip').classList.add('on');

  // Deduplica liveBooks per uid (stesso booking può apparire in più feed Octorate)
  { const _s = new Set();
    liveBooks = liveBooks.filter(b => { if(_s.has(b.uid)) return false; _s.add(b.uid); return true; }); }

  moveToPastCache();
  // Ripristino difensivo: ricostruisce bookTypes da _bookType embedded
  [...liveBooks, ...Object.values(pastCache).map(deserBook)].forEach(b => {
    if (b.uid && b._bookType && !bookTypes[b.uid]) {
      bookTypes[b.uid] = b._bookType;
    }
  });
  // I tag scelti manualmente vincono SEMPRE su default/auto-detect/embed
  try { applyTypeOverrides(currentPropId, bookTypes); } catch(_) {}
  saveLive();
  saveTypes();
  renderSidebar();
  renderAll();

  const real  = liveBooks.filter(b => b.source !== 'blocked').length;
  const pastN = Object.keys(pastCache).length;
  sbStatus('ok', `Completato — ${real} prenotazioni live.`);

  // Sync log per singola proprietà
  try {
    const prop = PROPERTIES.find(p => p.id === currentPropId);
    appendSyncLogEntry({
      propId:    currentPropId,
      propName:  prop?.name || currentPropId,
      nLive:     real,
      nPast:     pastN,
      calResults: calSources.map(c => ({ name: c.name, cnt: c.cnt, err: c.err })),
      allFailed:  calSources.every(c => c.err !== null),
      newCount:   null,
      newSample:  [],
      removedCount: null,
    });
  } catch(_) {}

  btn.disabled = false;
  ico.style.animation = '';
}

/* ─── Load One Calendar ─────────────────────────────── */
async function loadOneCal(cal, andRender) {
  setDot(cal.id, 'loading');
  try {
    const txt  = await fetchIcal(cal.url);
    const allBooks = parseAndExtract(txt, cal.id, cal.name, cal.defaultTag || 'auto');
    // Embed _bookType nel booking così il tipo sopravvive a ser/deser
    allBooks.forEach(b => {
      if (bookTypes[b.uid]) b._bookType = bookTypes[b.uid];
      else if (b._bookType && !bookTypes[b.uid]) bookTypes[b.uid] = b._bookType;
    });
    const { curr, next } = _splitBooksByYear(allBooks);
    liveBooks      = liveBooks.filter(b => b._cid !== cal.id);
    liveBooks.push(...curr);
    nextYearBooks  = nextYearBooks.filter(b => b._cid !== cal.id);
    nextYearBooks.push(...next);
    cal.cnt = curr.filter(b => b.source !== 'blocked').length;
    cal.err = null;
    setDot(cal.id, 'ok');
  } catch(e) {
    cal.err = e.message === 'CORS' ? 'CORS bloccato' : e.message.slice(0, 55);
    setDot(cal.id, 'err');
  }
  saveCals(); saveNextYear();
  if (andRender) { renderSidebar(); moveToPastCache(); renderAll(); }
}

/* ─── Calendar Management ─────────────────────────────── */
let _pendingCalTag = 'auto';

function openAddCalModal() {
  const url = document.getElementById('nUrl').value.trim();
  if (!url) { sbStatus('err', 'Inserisci prima un URL iCal.'); return; }
  _pendingCalTag = 'auto';
  document.querySelectorAll('.modal-pill').forEach(p => p.classList.remove('sel'));
  document.querySelector('.mp-auto').classList.add('sel');
  document.getElementById('tagModal').classList.add('on');
}

function selectModalTag(tag, btn) {
  _pendingCalTag = tag;
  document.querySelectorAll('.modal-pill').forEach(p => p.classList.remove('sel'));
  btn.classList.add('sel');
}

function closeModal() {
  document.getElementById('tagModal').classList.remove('on');
}

function confirmAddCal() {
  closeModal();
  addCal(_pendingCalTag);
}

function addCal(defaultTag = 'auto') {
  const name = document.getElementById('nName').value.trim();
  const url  = document.getElementById('nUrl').value.trim();
  if (!url) { sbStatus('err', 'Inserisci un URL iCal.'); return; }
  const cal = { id:genId(), name:name||'Calendario', url, cnt:0, err:null, defaultTag };
  calSources.push(cal);
  saveCals();
  document.getElementById('nName').value = '';
  document.getElementById('nUrl').value  = '';
  renderSidebar();
  loadOneCal(cal, true);
}

function removeCal(id) {
  calSources = calSources.filter(c => c.id !== id);
  saveCals();
  liveBooks = liveBooks.filter(b => b._cid !== id);
  renderSidebar();
  renderAll();
}
