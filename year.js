/* ═══════════════════════════════════════════════════════════════════════
   year.js — Archivio Annuale & Selettore Anno
   Versione 1.0
   ─────────────────────────────────────────────────────────────────────

   LOGICA ARCHIVIO
   ───────────────
   Le chiavi "correnti" (es. octo_live_attico_v3) appartengono SEMPRE
   all'anno in corso. Al 1° gennaio del nuovo anno l'app rileva
   automaticamente il cambio d'anno e copia tutti i dati dell'anno
   appena concluso in chiavi di archivio nominate:
       octo_arch_2025_live_attico_v3
       octo_arch_2025_past_attico_v3  ... etc.
   Poi svuota le chiavi correnti (live/past/manual/incasso/priceov)
   cosi' l'anno nuovo riparte da zero, ma calendari e impostazioni
   fiscali rimangono intatti: non serve riconfigurare nulla.

   CHIAVI ANNO-SPECIFICHE (archiviate al rollover, poi svuotate):
       octo_live_{prop}_v3      prenotazioni live (dai calendari iCal)
       octo_past_{prop}_v3      cache prenotazioni passate
       octo_manual_{prop}_v3    prenotazioni manuali inserite a mano
       octo_incasso_{prop}_v3   override incasso netto
       octo_priceov_{prop}_v3   override prezzi

   CHIAVI PERSISTENTI (non archiviate, sopravvivono al rollover):
       octo_cals_{prop}_v3      URL calendari iCal
       octo_fiscal_{prop}_v3    impostazioni fiscali (regime, %)
       octo_gestione_v3         canoni affitto/gestione per prop
       octo_spese_v3            spese operative globali
       octo_admin_global_v3     impostazioni admin
═══════════════════════════════════════════════════════════════════════ */

/* ─── Stato anno ─────────────────────────────────────────────────── */
const CURRENT_YEAR   = new Date().getFullYear();
let   viewYear       = CURRENT_YEAR;
let   viewingArchive = false;

/* ─── Chiavi storage di controllo ────────────────────────────────── */
const SK_LAST_YEAR_SEEN = 'octo_last_year_v3';
const SK_ARCHIVED_YEARS = 'octo_archived_years_v3';

/* ════════════════════════════════════════════════════════════════════
   HELPER CHIAVI ANNO-AWARE
   Usati da views.js e app.js in sostituzione delle chiavi fisse.
════════════════════════════════════════════════════════════════════ */
function skYearLive(propId) {
  return viewingArchive ? `octo_arch_${viewYear}_live_${propId}_v3`    : `octo_live_${propId}_v3`;
}
function skYearPast(propId) {
  return viewingArchive ? `octo_arch_${viewYear}_past_${propId}_v3`    : `octo_past_${propId}_v3`;
}
function skYearManual(propId) {
  return viewingArchive ? `octo_arch_${viewYear}_manual_${propId}_v3`  : `octo_manual_${propId}_v3`;
}
function skYearTypes(propId) {
  return viewingArchive ? `octo_arch_${viewYear}_types_${propId}_v3`   : `octo_types_${propId}_v3`;
}
function skYearFiscal(propId) {
  return viewingArchive ? `octo_arch_${viewYear}_fiscal_${propId}_v3`  : `octo_fiscal_${propId}_v3`;
}
function skNextYearP(propId) { return `octo_nextyear_${propId}_v3`; }

function skYearGestione() {
  return viewingArchive ? `octo_arch_${viewYear}_gestione_v3`          : `octo_gestione_v3`;
}
function skYearSpese() {
  return viewingArchive ? `octo_arch_${viewYear}_spese_v3`             : `octo_spese_v3`;
}

/* ════════════════════════════════════════════════════════════════════
   ANNI ARCHIVIATI
════════════════════════════════════════════════════════════════════ */
function getArchivedYears() {
  try { return JSON.parse(localStorage.getItem(SK_ARCHIVED_YEARS) || '[]'); } catch(e) { return []; }
}
function _registerArchivedYear(year) {
  const arr = getArchivedYears();
  const y   = parseInt(year, 10);
  if (!arr.includes(y)) { arr.push(y); arr.sort((a, b) => b - a); }
  localStorage.setItem(SK_ARCHIVED_YEARS, JSON.stringify(arr));
}

/* ════════════════════════════════════════════════════════════════════
   ROLLOVER AUTOMATICO
   Chiamare in init() dopo DB.pullAll(), prima del primo render.
════════════════════════════════════════════════════════════════════ */
function checkYearRollover() {
  const lastStr  = localStorage.getItem(SK_LAST_YEAR_SEEN);
  const lastYear = lastStr ? parseInt(lastStr, 10) : null;

  localStorage.setItem(SK_LAST_YEAR_SEEN, String(CURRENT_YEAR));

  if (!lastYear) return { rolledOver: false, archived: [] };
  if (lastYear >= CURRENT_YEAR) return { rolledOver: false, archived: [] };

  // Archivia ogni anno tra lastYear e CURRENT_YEAR-1
  const archived = [];
  for (let y = lastYear; y < CURRENT_YEAR; y++) {
    _doArchiveYear(y);
    archived.push(y);
  }
  return { rolledOver: true, archived };
}

/* ════════════════════════════════════════════════════════════════════
   ARCHIVIAZIONE DI UN ANNO
════════════════════════════════════════════════════════════════════ */
function _doArchiveYear(year) {
  console.info(`[year] Archiviazione anno ${year}...`);
  const pfx = `octo_arch_${year}_`;

  const realProps = PROPERTIES.filter(
    p => !p.adminView && !p.confrontoView && !p.cercaView && !p.graficiView && !p.speseView
  );

  const suffixes = ['live', 'past', 'manual', 'types', 'incasso', 'priceov', 'fiscal', 'nextyear', 'ratings'];

  realProps.forEach(({ id }) => {
    suffixes.forEach(sfx => {
      const src = `octo_${sfx}_${id}_v3`;
      const val = localStorage.getItem(src);
      if (val !== null) {
        const dst = `${pfx}${sfx}_${id}_v3`;
        localStorage.setItem(dst, val);
        try { DB.save(dst, val); } catch(_) {}
      }
    });
  });

  // Snapshot impostazioni globali
  ['octo_gestione_v3', 'octo_spese_v3', 'octo_spese_reali_v3'].forEach(k => {
    const val = localStorage.getItem(k);
    if (val) {
      const dst = pfx + k;
      localStorage.setItem(dst, val);
      try { DB.save(dst, val); } catch(_) {}
    }
  });

  // Svuota solo le chiavi anno-specifiche; cals, fiscal, gestione, spese rimangono
  realProps.forEach(({ id }) => {
    localStorage.removeItem(`octo_live_${id}_v3`);
    localStorage.removeItem(`octo_past_${id}_v3`);
    localStorage.removeItem(`octo_manual_${id}_v3`);
    localStorage.removeItem(`octo_incasso_${id}_v3`);
    localStorage.removeItem(`octo_priceov_${id}_v3`);
  });

  _registerArchivedYear(year);

  // Promuovi le prenotazioni 'anno prossimo' a 'live' per il nuovo anno
  const realProps2 = PROPERTIES.filter(
    p => !p.adminView && !p.confrontoView && !p.cercaView && !p.graficiView && !p.speseView
  );
  realProps2.forEach(({ id }) => {
    const nyk  = `octo_nextyear_${id}_v3`;
    const lk   = `octo_live_${id}_v3`;
    const next = localStorage.getItem(nyk);
    if (next && next !== '[]') {
      localStorage.setItem(lk, next);
      try { DB.save(lk, next); } catch(_) {}
    }
    localStorage.removeItem(nyk);
    try { DB.save(nyk, '[]'); } catch(_) {}
  });

  console.info(`[year] Anno ${year} archiviato. OK`);
}

/* ════════════════════════════════════════════════════════════════════
   CAMBIO ANNO VISUALIZZATO (chiamato dal selettore)
════════════════════════════════════════════════════════════════════ */
function setViewYear(year) {
  viewYear       = parseInt(year, 10);
  viewingArchive = (viewYear !== CURRENT_YEAR);

  calSources = []; bookTypes = {}; pastCache = {}; liveBooks = [];
  editModeActive = false;

  document.getElementById('yrDropdown')?.classList.remove('open');
  renderYearSwitcher();
  renderPropBar();

  const sidebar = document.querySelector('.sidebar');
  const shell   = document.querySelector('.shell');

  if (viewingArchive) {
    sidebar.style.display = 'none';
    shell.classList.add('no-sidebar');
    ['adminView','confrontoView','cercaView'].forEach(id => {
      document.getElementById(id)?.remove();
    });
    document.getElementById('statsWrap').style.display = 'none';
    document.getElementById('resWrap').style.display   = 'none';
    document.getElementById('welcome').style.display   = 'none';
    document.getElementById('propLabel').textContent   = `· Confronto ${viewYear}`;
    currentPropId = 'confronto';
    localStorage.setItem('octo_current_prop', 'confronto');
    _renderArchivePage();
  } else {
    document.getElementById('archiveBanner')?.remove();
    switchProp('confronto');
  }
}

function _renderArchivePage() {
  document.getElementById('archiveBanner')?.remove();
  const mainC  = document.getElementById('mainC');
  const banner = document.createElement('div');
  banner.id        = 'archiveBanner';
  banner.className = 'archive-banner';
  banner.innerHTML =
    `<span class="archive-banner-ico">📦</span>
     <div class="archive-banner-txt">
       <strong>Archivio ${viewYear}</strong>
       <span class="archive-banner-sub"> &middot; Sola lettura &middot; Tutti i dati dell'anno sono preservati</span>
     </div>
     <button class="btn" style="background:rgba(255,255,255,.2);color:#fff;border:none;font-size:11px;padding:5px 12px;flex-shrink:0;white-space:nowrap"
       onclick="setViewYear(${CURRENT_YEAR})">
       &larr; Anno corrente ${CURRENT_YEAR}
     </button>`;
  mainC.insertAdjacentElement('afterbegin', banner);
  refreshAllPropsForConfronto();
}

/* ════════════════════════════════════════════════════════════════════
   YEAR SWITCHER (topbar)
════════════════════════════════════════════════════════════════════ */
function renderYearSwitcher() {
  const el = document.getElementById('yearSwitcher');
  if (!el) return;

  const archived = getArchivedYears();
  const allYears = [CURRENT_YEAR, ...archived];

  if (allYears.length <= 1) {
    el.innerHTML = `<div class="yr-pill yr-pill-live" title="Anno corrente">${CURRENT_YEAR}</div>`;
    return;
  }

  const opts = allYears.map(y => {
    const isSel = (y === viewYear);
    const isCur = (y === CURRENT_YEAR);
    return `<button class="yr-opt${isSel ? ' yr-opt-sel' : ''}"
        onclick="setViewYear(${y});event.stopPropagation()">
      <span>${isCur ? '🟢' : '📦'}&thinsp;${y}</span>
      ${isSel ? '<span style="margin-left:auto;color:var(--acc)">&#10003;</span>' : ''}
    </button>`;
  }).join('');

  el.innerHTML =
    `<div id="yrSwitcherRoot" style="position:relative">
       <button class="yr-pill ${viewingArchive ? 'yr-pill-arch' : 'yr-pill-live'}"
         onclick="document.getElementById('yrDropdown').classList.toggle('open');event.stopPropagation()"
         title="Cambia anno">
         ${viewingArchive ? '📦' : '🟢'}&thinsp;${viewYear}<span class="yr-caret">&#9660;</span>
       </button>
       <div class="yr-dropdown" id="yrDropdown">${opts}</div>
     </div>`;

  setTimeout(() => {
    function _close(e) {
      const root = document.getElementById('yrSwitcherRoot');
      if (!root?.contains(e.target)) {
        document.getElementById('yrDropdown')?.classList.remove('open');
        document.removeEventListener('click', _close);
      }
    }
    document.addEventListener('click', _close);
  }, 0);
}

/* ════════════════════════════════════════════════════════════════════
   TOAST ROLLOVER
════════════════════════════════════════════════════════════════════ */
function showRolloverNotification(archived) {
  setTimeout(() => {
    document.getElementById('rolloverNotice')?.remove();
    const notice = document.createElement('div');
    notice.id = 'rolloverNotice';
    notice.className = 'rollover-notice';
    notice.innerHTML =
      `<span style="font-size:20px">&#127881;</span>
       <div>
         <strong>Buon Anno ${CURRENT_YEAR}!</strong><br>
         <span style="opacity:.75;font-size:11px">
           Dati ${archived.join(', ')} archiviati automaticamente.
           I calendari sono pronti per il nuovo anno.
         </span>
       </div>
       <button onclick="this.closest('.rollover-notice').remove()"
         style="background:none;border:none;color:#fff;opacity:.5;font-size:18px;cursor:pointer;flex-shrink:0;line-height:1">&#215;</button>`;
    document.getElementById('mainC')?.insertAdjacentElement('afterbegin', notice);
    setTimeout(() => notice.remove(), 14000);
  }, 2000);
}

/* ════════════════════════════════════════════════════════════════════
   ARCHIVIO MANUALE (dal pannello Admin)
════════════════════════════════════════════════════════════════════ */
function adminForceArchive() {
  const archived = getArchivedYears();
  const input = prompt(
    `Archivia manualmente un anno.\n` +
    `Anni gia' archiviati: ${archived.length ? archived.join(', ') : 'nessuno'}\n\n` +
    `Anno da archiviare (deve essere < ${CURRENT_YEAR}):`,
    String(CURRENT_YEAR - 1)
  );
  if (!input) return;
  const yr = parseInt(input, 10);
  if (isNaN(yr) || yr >= CURRENT_YEAR) {
    alert(`Anno non valido. Inserisci un anno < ${CURRENT_YEAR}.`); return;
  }
  const msg = archived.includes(yr)
    ? `L'anno ${yr} e' gia' archiviato.\nSovrascrivere?`
    : `Archiviare l'anno ${yr}?\n\nI dati live/past/manual/incasso/priceov verranno\ncopiati nell'archivio e rimossi dalle chiavi correnti.`;
  if (!confirm(msg)) return;
  _doArchiveYear(yr);
  renderYearSwitcher();
  alert(`Anno ${yr} archiviato con successo.`);
}
