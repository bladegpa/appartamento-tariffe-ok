/* ═══════════════════════════════════════
   views.js — Viste Speciali: Admin, Confronto, Tutti
   Versione 1.1
═══════════════════════════════════════ */

/* ═══════════════════════════════════════
   ADMIN VIEW
═══════════════════════════════════════ */

/* ─── Sync Log renderer ─────────────────────────────── */
function renderSyncLogHtml() {
  const log = loadSyncLog();
  if (!log.length) return '<div style="font-size:11px;color:var(--ink2);padding:12px;text-align:center;opacity:.5">Nessuna sincronizzazione registrata.<br>Premi Aggiorna per popolare il log.</div>';

  const IT_DAYS = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
  function fmtTs(ts) {
    const d = new Date(ts);
    const dd = IT_DAYS[d.getDay()];
    const pad = n => String(n).padStart(2,'0');
    return dd + ' ' + pad(d.getDate()) + '/' + pad(d.getMonth()+1) + '/' + d.getFullYear()
         + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  // Raggruppa per sessione (eventi entro 60s = stessa sessione)
  const sessions = [];
  let cur = null;
  log.forEach(entry => {
    if (!cur || (cur.ts - entry.ts) > 60000) {
      cur = { ts: entry.ts, entries: [] };
      sessions.push(cur);
    }
    cur.entries.push(entry);
  });

  return sessions.map(sess => {
    const hasErr = sess.entries.some(e => e.allFailed || (e.calResults||[]).some(c => c.err));
    const statusColor = hasErr ? '#C03020' : '#2AAF6A';
    const statusIcon  = hasErr ? '⚠' : '✓';

    const rows = sess.entries.map(e => {
      const prop = PROPERTIES.find(p => p.id === e.propId);
      const icon = prop?.icon || '🏠';
      const calRows = (e.calResults || []).map(cr => {
        const errBadge = cr.err
          ? `<span style="color:#C03020;font-size:9px;margin-left:4px">[${cr.err}]</span>`
          : `<span style="color:#2AAF6A;font-size:9px;margin-left:4px">[${cr.cnt||0} prenotazioni]</span>`;
        return `<div style="font-size:9.5px;color:var(--ink2);padding-left:18px;line-height:1.8">${cr.name}${errBadge}</div>`;
      }).join('');

      const newBadge = (e.newCount > 0)
        ? `<span style="background:#E8FFF0;color:#145C38;font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px;margin-left:6px">+${e.newCount} nuove</span>`
        : '';
      const remBadge = (e.removedCount > 0)
        ? `<span style="background:#FFF0F0;color:#C03020;font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px;margin-left:4px">−${e.removedCount} rimosse</span>`
        : '';
      const failBadge = e.allFailed
        ? `<span style="background:#FFF0F0;color:#C03020;font-size:9px;font-weight:700;padding:1px 6px;border-radius:4px;margin-left:4px">TUTTI FALLITI</span>`
        : '';
      const sampleHtml = (e.newSample && e.newSample.length)
        ? `<div style="font-size:9px;color:#145C38;padding-left:18px;line-height:1.7">${e.newSample.map(s=>'+ '+s).join(' · ')}</div>`
        : '';

      return `<div style="padding:6px 10px;border-bottom:1px solid var(--bdr)">
        <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
          <span style="font-size:12px;font-weight:600;color:var(--ink)">${icon} ${e.propName}</span>
          <span style="font-size:10px;color:var(--ink2)">${e.nLive} live · ${e.nPast} passate</span>
          ${newBadge}${remBadge}${failBadge}
        </div>
        ${calRows}
        ${sampleHtml}
      </div>`;
    }).join('');

    return `<div style="border:1px solid var(--bdr);border-radius:8px;margin-bottom:10px;overflow:hidden">
      <div style="background:var(--bg2);padding:7px 12px;display:flex;align-items:center;gap:8px;border-bottom:1px solid var(--bdr)">
        <span style="font-size:13px;color:${statusColor};font-weight:700">${statusIcon}</span>
        <span style="font-size:11px;font-weight:700;color:var(--ink)">${fmtTs(sess.ts)}</span>
        <span style="font-size:10px;color:var(--ink2)">${sess.entries.length} appartamenti</span>
      </div>
      ${rows}
    </div>`;
  }).join('') || '<div style="font-size:11px;color:var(--ink2);padding:12px;text-align:center;opacity:.5">Nessun dato.</div>';
}

function renderAdminView() {
  document.getElementById('statsWrap').style.display = 'none';
  document.getElementById('resWrap').style.display   = 'none';
  document.getElementById('welcome').style.display   = 'none';
  { const ow = document.getElementById('occWidget'); if(ow) ow.style.display='none'; }
  const mainC = document.getElementById('mainC');
  const old   = document.getElementById('adminView');
  if (old) old.remove();

  mainC.insertAdjacentHTML('beforeend', `
    <div id="adminView">
      <div class="res-hdr" style="margin-bottom:18px">
        <div class="res-title">⚙️ Amministrazione</div>
      </div>

      <div class="admin-grid">

        <!-- PIN SICUREZZA -->
        <div class="admin-card">
          <h3>🔐 Sicurezza — PIN di accesso</h3>
          <p style="font-size:11px;color:var(--ink2);line-height:1.7;margin-bottom:14px">
            Modifica il PIN a 4 cifre richiesto all'avvio del gestionale.<br>
            Il PIN corrente è necessario per confermare la modifica.
          </p>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div style="display:flex;gap:8px;align-items:center">
              <input type="password" id="adminPinOld" maxlength="4" pattern="[0-9]*" inputmode="numeric"
                placeholder="PIN attuale" style="width:120px;padding:7px 10px;border:1px solid var(--bdr);border-radius:8px;font-size:13px;background:var(--bg);color:var(--ink);font-family:inherit">
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <input type="password" id="adminPinNew" maxlength="4" pattern="[0-9]*" inputmode="numeric"
                placeholder="Nuovo PIN" style="width:120px;padding:7px 10px;border:1px solid var(--bdr);border-radius:8px;font-size:13px;background:var(--bg);color:var(--ink);font-family:inherit">
              <input type="password" id="adminPinNew2" maxlength="4" pattern="[0-9]*" inputmode="numeric"
                placeholder="Conferma PIN" style="width:120px;padding:7px 10px;border:1px solid var(--bdr);border-radius:8px;font-size:13px;background:var(--bg);color:var(--ink);font-family:inherit">
            </div>
            <button class="btn btn-gh" onclick="adminChangePinUI()" style="align-self:flex-start;margin-top:4px">
              🔐 Aggiorna PIN
            </button>
            <div id="pinChangeMsg" style="font-size:11px;height:16px;margin-top:2px"></div>
          </div>
        </div>

        <!-- BACKUP & EXPORT -->
        <div class="admin-card">
          <h3>📥 Backup & Export</h3>
          <p style="font-size:11px;color:var(--ink2);line-height:1.7;margin-bottom:14px">
            Esporta tutte le prenotazioni di tutti gli appartamenti (anno corrente o archivio visualizzato)
            in formato Excel o CSV. I file includono: appartamento, date, ospite, prezzo, tipologia, notti.
          </p>
          <div style="display:flex;flex-direction:column;gap:9px">
            <button class="btn btn-gr" onclick="exportAllBookingsXLSX()" style="justify-content:flex-start;gap:8px">
              📊 Excel — Tutte le prenotazioni ${viewYear}
            </button>
            <button class="btn btn-gh" onclick="exportAllBookingsCSV()" style="justify-content:flex-start;gap:8px">
              📄 CSV — Tutte le prenotazioni ${viewYear}
            </button>
            <button class="btn btn-gh" onclick="exportSpeseCSV()" style="justify-content:flex-start;gap:8px">
              🔧 CSV — Spese operative ${viewYear}
            </button>
          </div>
          <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--bdr)">
            <div style="font-size:11px;font-weight:700;color:var(--ink);margin-bottom:8px">Export per anno archiviato</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
              <select id="adminExportYear" class="spese-form-input" style="width:100px;flex-shrink:0">
                ${[CURRENT_YEAR, ...getArchivedYears()].map(y =>
                  '<option value="'+y+'"'+(y===viewYear?' selected':'')+'>'+y+'</option>'
                ).join('')}
              </select>
              <button class="btn btn-gr btn-sm"
                onclick="exportAllBookingsXLSX(parseInt(document.getElementById('adminExportYear').value))">
                📊 Excel anno
              </button>
              <button class="btn btn-gh btn-sm"
                onclick="exportAllBookingsCSV(parseInt(document.getElementById('adminExportYear').value))">
                📄 CSV anno
              </button>
            </div>
          </div>
        </div>


        <!-- ARCHIVIO ANNO -->
        <div class="admin-card" style="min-width:240px;flex:0 0 auto">
          <h3>📦 Archivio Anno</h3>
          <p style="font-size:11px;color:var(--ink2);line-height:1.6;margin-bottom:12px">
            Al 1° gennaio l'archivio avviene automaticamente.
            Puoi archiviare manualmente un anno specifico o consultare gli anni archiviati.
          </p>
          <div style="font-size:11px;color:var(--ink2);margin-bottom:10px">
            Anno corrente: <strong style="color:var(--ink)">${CURRENT_YEAR}</strong><br>
            Anni archiviati: <strong style="color:var(--ink)">${getArchivedYears().join(', ') || 'nessuno'}</strong>
          </div>
          <button class="btn btn-archive btn-sm" onclick="adminForceArchive()">📦 Archivia anno manuale</button>
        </div>

        <!-- CLOUD SYNC -->
        <div class="admin-card" style="min-width:240px;flex:0 0 auto">
          <h3>☁ Cloud Sync</h3>
          <div style="background:#EEF6FF;border:1px solid #BFD7F7;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:11px;color:#1A4A7A;line-height:1.7">
            <strong>A cosa serve?</strong><br>
            Salva tutti i dati su <strong>Firebase Firestore</strong> (database cloud Google).
            Utile per:<br>
            · <strong>Accedere da più dispositivi</strong> (es. telefono + PC)<br>
            · <strong>Backup automatico</strong> in caso di cancellazione della cache del browser<br>
            · <strong>Ripristino rapido</strong> se installi la webapp su un nuovo dispositivo<br>
            <span style="opacity:.7;margin-top:4px;display:block">⚠ Richiede che Firebase sia configurato in <code style="font-family:'DM Mono',monospace;background:rgba(0,0,0,.07);padding:0 3px;border-radius:3px">db.js</code></span>
          </div>
          <div id="dbStatusAdmin" style="font-size:11px;color:var(--ink2);margin-bottom:10px;min-height:16px"></div>
          <div style="display:flex;flex-direction:column;gap:7px">
            <button class="btn btn-hdr btn-sm" onclick="DB.pushAll().then(()=>{const el=document.getElementById('dbStatusAdmin');if(el)el.textContent='✓ Upload completato'})">
              ☁↑ Carica tutto su cloud
            </button>
            <button class="btn btn-gh btn-sm" onclick="DB.pullAll().then(()=>{const el=document.getElementById('dbStatusAdmin');if(el)el.textContent='✓ Download completato — ricarica la pagina';})">
              ☁↓ Scarica dal cloud
            </button>
          </div>
        </div>

      </div>


        <!-- LOG SINCRONIZZAZIONE -->
        <div class="admin-card" style="margin-top:18px;width:100%;box-sizing:border-box">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
            <h3 style="margin:0">📡 Log Sincronizzazione Calendari</h3>
            <div style="display:flex;gap:8px;align-items:center">
              <span style="font-size:10px;color:var(--ink2)">Ultimi ${loadSyncLog().length} eventi</span>
              <button class="btn btn-gh btn-sm" onclick="renderAdminView()">↺ Aggiorna</button>
              <button class="btn btn-danger btn-sm" onclick="if(confirm('Cancellare il log?')){clearSyncLog();renderAdminView();}">🗑 Cancella log</button>
            </div>
          </div>
          <div id="syncLogContainer">
            ${renderSyncLogHtml()}
          </div>
        </div>

      <!-- IMPOSTAZIONI GLOBALI -->
      <div class="admin-card" style="margin-top:18px;width:100%;box-sizing:border-box" id="adminSettingsCard">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <h3 style="margin:0">⚙️ Impostazioni</h3>
          <div id="adminSaveStatus" style="font-size:11px;color:#145C38;font-weight:700;opacity:0;transition:opacity .4s"></div>
        </div>

        <!-- Spese operative stimate -->
        <div style="margin-bottom:20px">
          <div style="font-size:11px;font-weight:700;color:var(--ink);text-transform:uppercase;letter-spacing:.7px;margin-bottom:10px">💡 Spese operative stimate (globali)</div>
          <div style="display:flex;flex-wrap:wrap;gap:12px">
            ${['luce','welcomePack','pulizie','lavanderia','tassaSoggiorno'].map(k => {
              const sp = getSpese();
              const labels = {luce:'⚡ Luce (€/gg×notti)',welcomePack:'🎁 Welcome kit (€/check-in)',pulizie:'🧹 Pulizie (€/check-in)',lavanderia:'👕 Lavanderia (€/check-in)',tassaSoggiorno:'🏙 Tassa soggiorno (€/notte OTA)'};
              return `<div style="display:flex;flex-direction:column;gap:4px;min-width:140px">
                <label style="font-size:10px;color:var(--ink2)">${labels[k]}</label>
                <input id="adm_spese_${k}" type="number" min="0" step="0.5" value="${sp[k]}"
                  class="spese-form-input" style="width:90px">
              </div>`;
            }).join('')}
          </div>
        </div>

        <!-- Gestione / Affitto per appartamento -->
        <div style="margin-bottom:20px">
          <div style="font-size:11px;font-weight:700;color:var(--ink);text-transform:uppercase;letter-spacing:.7px;margin-bottom:10px">🏠 Affitto · Condominio · Varie — per appartamento (€/anno)</div>
          <div style="overflow-x:auto">
            <table style="border-collapse:collapse;font-size:11px;width:100%;min-width:500px">
              <thead>
                <tr style="background:var(--bg2)">
                  <th style="padding:5px 8px;text-align:left;color:var(--ink2);font-weight:700">Appartamento</th>
                  <th style="padding:5px 8px;text-align:right;color:var(--ink2);font-weight:700">Affitto</th>
                  <th style="padding:5px 8px;text-align:right;color:var(--ink2);font-weight:700">Condominio</th>
                  <th style="padding:5px 8px;text-align:right;color:var(--ink2);font-weight:700">Varie</th>
                  <th style="padding:5px 8px;text-align:right;color:var(--ink2);font-weight:700">Totale</th>
                </tr>
              </thead>
              <tbody>
                ${PROPERTIES.filter(p=>!p.adminView&&!p.confrontoView&&!p.cercaView&&!p.graficiView&&!p.speseView).map(p => {
                  const gd = getGestioneDetail(p.id);
                  const tot = gd.affitto + gd.condominio + gd.varie;
                  return `<tr style="border-bottom:1px solid var(--bdr)">
                    <td style="padding:5px 8px;font-weight:600">${p.icon} ${p.name}</td>
                    <td style="padding:5px 8px;text-align:right">
                      <input type="number" min="0" step="50" value="${gd.affitto}"
                        class="spese-form-input" style="width:70px;text-align:right"
                        oninput="saveGestioneField('${p.id}','affitto',this.value);renderConfrontoView()">
                    </td>
                    <td style="padding:5px 8px;text-align:right">
                      <input type="number" min="0" step="50" value="${gd.condominio}"
                        class="spese-form-input" style="width:70px;text-align:right"
                        oninput="saveGestioneField('${p.id}','condominio',this.value);renderConfrontoView()">
                    </td>
                    <td style="padding:5px 8px;text-align:right">
                      <input type="number" min="0" step="50" value="${gd.varie}"
                        class="spese-form-input" style="width:70px;text-align:right"
                        oninput="saveGestioneField('${p.id}','varie',this.value);renderConfrontoView()">
                    </td>
                    <td style="padding:5px 8px;text-align:right;font-weight:700;color:var(--ink)">€${tot.toFixed(0)}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Commissioni OTA + Regime fiscale per appartamento -->
        <div style="margin-bottom:20px">
          <div style="font-size:11px;font-weight:700;color:var(--ink);text-transform:uppercase;letter-spacing:.7px;margin-bottom:10px">📊 Commissioni OTA & Regime fiscale per appartamento</div>
          <div style="overflow-x:auto">
            <table style="border-collapse:collapse;min-width:580px;font-size:11px;width:100%">
              <thead>
                <tr style="background:var(--bg2)">
                  <th style="padding:7px 10px;text-align:left;font-weight:700;color:var(--ink2)">Appartamento</th>
                  <th style="padding:7px 10px;text-align:center;font-weight:700;color:var(--ink2)">Booking %</th>
                  <th style="padding:7px 10px;text-align:center;font-weight:700;color:var(--ink2)">Airbnb %</th>
                  <th style="padding:7px 10px;text-align:center;font-weight:700;color:var(--ink2)">Regime</th>
                  <th style="padding:7px 10px;text-align:center;font-weight:700;color:var(--ink2)">Diretta→ced.</th>
                </tr>
              </thead>
              <tbody>
                ${PROPERTIES.filter(p=>!p.adminView&&!p.confrontoView&&!p.cercaView&&!p.graficiView&&!p.speseView).map((p,i) => {
                  let f = {};
                  try { f = JSON.parse(localStorage.getItem(`octo_fiscal_${p.id}_v3`) || '{}'); } catch(e) {}
                  const bk  = f.bkComm  !== undefined ? f.bkComm  : '16';
                  const ab  = f.abComm  !== undefined ? f.abComm  : '15.5';
                  const reg = f.regime  || 'cedolare';
                  const dir = f.inclDir === true;
                  const bg  = i%2===0 ? 'var(--surf)' : 'var(--bg2)';
                  return `<tr style="background:${bg}">
                    <td style="padding:7px 10px;font-weight:600;color:var(--ink)">${p.icon} ${p.name}</td>
                    <td style="padding:7px 10px;text-align:center">
                      <input id="adm_bk_${p.id}" type="number" min="0" max="50" step="0.5" value="${bk}"
                        class="spese-form-input" style="width:60px;text-align:center">
                    </td>
                    <td style="padding:7px 10px;text-align:center">
                      <input id="adm_ab_${p.id}" type="number" min="0" max="50" step="0.5" value="${ab}"
                        class="spese-form-input" style="width:60px;text-align:center">
                    </td>
                    <td style="padding:7px 10px;text-align:center">
                      <select id="adm_reg_${p.id}" class="spese-form-input" style="width:100px;font-size:10px">
                        <option value="cedolare"    ${reg==='cedolare'   ?'selected':''}>Cedolare 21%</option>
                        <option value="forfettario" ${reg==='forfettario'?'selected':''}>Forfettario</option>
                      </select>
                    </td>
                    <td style="padding:7px 10px;text-align:center">
                      <input id="adm_dir_${p.id}" type="checkbox" ${dir?'checked':''} style="cursor:pointer;width:15px;height:15px">
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Bottone SALVA -->
        <div style="display:flex;justify-content:flex-end;padding-top:14px;border-top:1px solid var(--bdr)">
          <button class="btn btn-acc" onclick="adminSaveAll()" style="min-width:140px;font-size:13px;padding:10px 24px;font-weight:700">
            💾 Salva impostazioni
          </button>
        </div>
      </div>

    </div>
  `);
}


/* ═══════════════════════════════════════
   CONFRONTO VIEW  —  v1.2
═══════════════════════════════════════ */

/* ── WhatsApp Housekeeping Settimanale ─────────────────────────────────────────
   Struttura messaggio:
     1. CHECK-OUT della settimana (solo appartamento, niente nomi)
     2. CHECK-IN della settimana (appartamento, ospite, notti, data co)
     3. HOUSEKEEPING: giorno dopo checkout; se ci-in stesso giorno co-out → stesso giorno + URGENTE
──────────────────────────────────────────────────────────────────────────── */
/* ── WhatsApp Housekeeping ────────────────────────────────────────────────── */
function _buildHkData() {
  const PROP_NAMES = {
    'anfiteatro':'Anfiteatro','scaro':'Scaro','villa':'Villa 1 Piano',
    'corso':'Villa 3 Piano','montenero':'Lungomare','stoccolma':'Stoccolma Piccolo',
    'frescura':'Stoccolma Grande','attico':'Attico',
  };
  const realProps = PROPERTIES.filter(p => !p.adminView&&!p.confrontoView&&!p.cercaView&&!p.graficiView&&!p.speseView);

  const today = new Date(); today.setHours(0,0,0,0);
  const dow   = today.getDay();
  const daysToMon = (dow===0) ? 1 : (8-dow);
  const mon = new Date(today); mon.setDate(today.getDate()+daysToMon);
  const sun = new Date(mon);   sun.setDate(mon.getDate()+6);

  const IT_DAYS = ['Domenica','Lunedi','Martedi','Mercoledi','Giovedi','Venerdi','Sabato'];
  const IT_MON  = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];

  function fmt(d)     { return d.getDate()+'/'+(d.getMonth()+1); }
  function fmtFull(d) { return d.getDate()+' '+IT_MON[d.getMonth()]; }
  function dayName(d) { return IT_DAYS[d.getDay()]; }
  function sameDay(a,b){ return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
  function inWeek(d)  { const t=d.getTime(); return t>=mon.getTime()&&t<=sun.getTime(); }
  function addDay(d,n){ const r=new Date(d); r.setDate(r.getDate()+n); return r; }
  function isSunday(d){ return d.getDay()===0; }
  function isMonday(d){ return d.getDay()===1; }

  const allEntries = [];
  realProps.forEach(prop => {
    const seen = new Set();
    const live = (()=>{ try{ return JSON.parse(localStorage.getItem('octo_live_'+prop.id+'_v3')||'[]'); }catch(_){ return []; }})();
    live.forEach(raw => {
      const b = deserBook(raw);
      if (!b.checkin||!b.checkout||b.source==='blocked') return;
      const ci=new Date(b.checkin); ci.setHours(0,0,0,0);
      const co=new Date(b.checkout); co.setHours(0,0,0,0);
      seen.add(b.uid);
      allEntries.push({ propId:prop.id, propName:PROP_NAMES[prop.id]||prop.name, checkin:ci, checkout:co, nome:b.nome||'', notti:b.notti||0 });
    });
    loadManual(prop.id).forEach(m => {
      if (!m.checkin||!m.checkout||seen.has(m.uid)) return;
      const ci=new Date(m.checkin); ci.setHours(0,0,0,0);
      const co=new Date(m.checkout); co.setHours(0,0,0,0);
      allEntries.push({ propId:prop.id, propName:PROP_NAMES[prop.id]||prop.name, checkin:ci, checkout:co, nome:m.nome||'', notti:m.notti||0 });
    });
  });

  function isOccupied(propId, day) {
    const dt = day.getTime();
    return allEntries.some(e => e.propId===propId && e.checkin.getTime()<=dt && dt<e.checkout.getTime());
  }

  const checkouts = allEntries.filter(e=>inWeek(e.checkout)).sort((a,b)=>a.checkout-b.checkout);
  const checkins  = allEntries.filter(e=>inWeek(e.checkin)).sort((a,b)=>a.checkin-b.checkin);

  // Calcola housekeeping per ogni checkout
  const hkMap = {};
  checkouts.forEach(e => {
    const coDay = e.checkout;
    const ciSameDay = allEntries.find(ci => ci.propId===e.propId && sameDay(ci.checkin, coDay));

    let hkDay, urgent=false, urgentCiDay=null;

    if (ciSameDay) {
      // Checkin stesso giorno del checkout → URGENTE, HK nel giorno stesso
      hkDay = coDay;
      urgent = true;
      urgentCiDay = ciSameDay.checkin;
    } else {
      // HK standard: sempre il giorno dopo il checkout
      hkDay = addDay(coDay, 1);

      // Evita domenica → posticipa a lunedì
      if (isSunday(hkDay)) {
        hkDay = addDay(hkDay, 1); // lunedì
      }

      // Se nel giorno calcolato c'è un checkin nello stesso appartamento → URGENTE
      const ciOnHkDay = allEntries.find(ci => ci.propId===e.propId && sameDay(ci.checkin, hkDay));
      if (ciOnHkDay) {
        urgent = true;
        urgentCiDay = ciOnHkDay.checkin;
      }
    }

    const key = e.propId+'_'+hkDay.toDateString();
    if (!hkMap[key]) {
      hkMap[key] = { day:hkDay, urgent, urgentCiDay, propName:e.propName, propId:e.propId };
    } else if (urgent) {
      hkMap[key].urgent = true;
      hkMap[key].urgentCiDay = urgentCiDay;
    }
  });

  const hkEntries = Object.values(hkMap).sort((a,b)=>a.day-b.day);

  function groupByDay(entries, keyFn) {
    const map = {};
    entries.forEach(e => {
      const k = keyFn(e).toDateString();
      if (!map[k]) map[k] = { day:keyFn(e), items:[] };
      map[k].items.push(e);
    });
    return Object.values(map).sort((a,b)=>a.day-b.day);
  }
  // Gruppi da accorpare su una riga quando compaiono nello stesso giorno
  const PROP_GROUPS = [
    ['villa','corso'],                    // Villa 1 Piano - Villa 3 Piano
    ['stoccolma','frescura','attico'],    // Stoccolma Piccolo - Stoccolma Grande - Attico
  ];

  function groupedNumberedList(items, lineFn) {
    // Raggruppa items per gruppo definito, lascia gli altri singoli
    const used = new Set();
    const rows = [];

    // Prima passa: costruisci righe per i gruppi (se almeno 2 membri presenti)
    PROP_GROUPS.forEach(grpIds => {
      const grpItems = items.filter(it => grpIds.includes(it.propId));
      if (grpItems.length >= 2) {
        grpItems.forEach(it => used.add(it.propId + it.checkout?.toDateString() + it.checkin?.toDateString() + it.propName));
        // Merge: join le lineFn di ogni item con ' - '
        rows.push(grpItems.map(it => lineFn(it)).join(' - '));
      }
    });

    // Seconda passa: aggiungi items non ragguppati
    items.forEach(it => {
      const key = it.propId + it.checkout?.toDateString() + it.checkin?.toDateString() + it.propName;
      if (!used.has(key)) rows.push(lineFn(it));
    });

    return rows.map((r,i) => (i+1)+') '+r).join('\n');
  }

  function numberedList(items, lineFn) {
    return groupedNumberedList(items, lineFn);
  }

  return { mon, sun, checkouts, checkins, hkEntries, groupByDay, numberedList, fmt, fmtFull, dayName };
}

function buildPulizieMsg() {
  const { mon, sun, hkEntries, groupByDay, numberedList, fmt, fmtFull, dayName } = _buildHkData();
  const today = new Date();
  const gg = today.getDate()+'/'+(today.getMonth()+1)+'/'+today.getFullYear();
  let msg = 'Settimana '+fmtFull(mon)+' - '+fmtFull(sun)+'\n';
  msg += '\n--- PULIZIE ---\n';
  if (hkEntries.length===0) {
    msg += 'Nessuna pulizia questa settimana\n';
  } else {
    groupByDay(hkEntries, e=>e.day).forEach(({day,items}) => {
      msg += '# '+dayName(day)+' '+fmt(day)+'\n';
      msg += numberedList(items, e =>
        e.propName+(e.urgent ? ' URGENTE - Ingresso giorno '+fmt(e.urgentCiDay) : '')
      )+'\n\n';
    });
  }
  msg += '\nGenerato il '+gg;
  return msg;
}

function buildCheckinCheckoutMsg() {
  const { mon, sun, checkouts, checkins, groupByDay, numberedList, fmt, fmtFull, dayName } = _buildHkData();
  const today = new Date();
  const gg = today.getDate()+'/'+(today.getMonth()+1)+'/'+today.getFullYear();
  let msg = 'Settimana '+fmtFull(mon)+' - '+fmtFull(sun)+'\n';
  msg += '\n--- CHECK-OUT ---\n';
  if (checkouts.length===0) {
    msg += 'Nessun check-out questa settimana\n';
  } else {
    groupByDay(checkouts, e=>e.checkout).forEach(({day,items}) => {
      msg += '# '+dayName(day)+' '+fmt(day)+'\n';
      msg += numberedList(items, e=>e.propName)+'\n\n';
    });
  }
  msg += '\n--- CHECK-IN ---\n';
  if (checkins.length===0) {
    msg += 'Nessun check-in questa settimana\n';
  } else {
    groupByDay(checkins, e=>e.checkin).forEach(({day,items}) => {
      msg += '# '+dayName(day)+' '+fmt(day)+'\n';
      msg += numberedList(items, e => {
        const nottiStr = e.notti ? ' '+e.notti+'n' : '';
        return e.propName+' - '+(e.nome||'?')+nottiStr+' (co '+fmt(e.checkout)+')';
      })+'\n\n';
    });
  }
  msg += '\nGenerato il '+gg;
  return msg;
}

function sendWA(msg) {
  window.open('https://wa.me/393402436677?text='+encodeURIComponent(msg), '_blank');
}

function showWAModal(msg, title) {
  let modal = document.getElementById('waPreviewModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'waPreviewModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    modal.onclick = e => { if(e.target===modal) modal.remove(); };
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div style="background:var(--surf);border-radius:16px;max-width:440px;width:100%;max-height:82vh;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 8px 40px rgba(0,0,0,.4)">
      <div style="background:#075E54;color:#fff;padding:13px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0">
        <div style="font-size:15px;font-weight:700;flex:1">${title}</div>
        <button onclick="document.getElementById('waPreviewModal').remove()"
          style="background:rgba(255,255,255,.2);border:none;color:#fff;border-radius:7px;padding:3px 10px;cursor:pointer;font-size:13px">X</button>
      </div>
      <div style="overflow-y:auto;flex:1;padding:14px">
        <pre style="background:#ECE5DD;border-radius:10px;padding:13px;font-family:monospace;font-size:11.5px;line-height:1.75;white-space:pre-wrap;color:#111;margin:0">${msg.replace(/</g,'&lt;')}</pre>
      </div>
      <div style="padding:12px;display:flex;gap:10px;flex-shrink:0;border-top:1px solid var(--bdr)">
        <button onclick="sendWA(document.querySelector('#waPreviewModal pre').textContent)"
          style="flex:1;background:#25D366;color:#fff;border:none;border-radius:9px;padding:11px;font-size:14px;font-weight:700;cursor:pointer">
          Invia WA
        </button>
        <button onclick="navigator.clipboard.writeText(document.querySelector('#waPreviewModal pre').textContent).then(()=>{ this.textContent='Copiato!'; setTimeout(()=>this.textContent='Copia',1500)})"
          style="flex:1;background:var(--acc);color:#fff;border:none;border-radius:9px;padding:11px;font-size:14px;font-weight:700;cursor:pointer">
          Copia
        </button>
      </div>
    </div>`;
}

function previewPulizie()        { showWAModal(buildPulizieMsg(),           'Pulizie settimanali'); }
function previewCheckinCheckout(){ showWAModal(buildCheckinCheckoutMsg(),   'Check-in / Check-out'); }



function renderConfrontoView() {
  document.getElementById('statsWrap').style.display = 'none';
  document.getElementById('resWrap').style.display   = 'none';
  document.getElementById('welcome').style.display   = 'none';
  { const ow = document.getElementById('occWidget'); if(ow) ow.style.display='none'; }
  // Nascondi pannelli della scheda appartamento
  const mp = document.getElementById('manualPanelWrap');  if (mp) mp.style.display = 'none';
  const iw = document.getElementById('incassoWidgetWrap'); if (iw) iw.style.display = 'none';
  const scI = document.getElementById('scIncassoCard');    if (scI) scI.style.display = 'none';
  const scO2 = document.getElementById('scOccCard');       if (scO2) scO2.style.display = 'none';
  const occW = document.getElementById('occWidget');       if (occW) occW.style.display = 'none';
  const mainC = document.getElementById('mainC');
  const old   = document.getElementById('confrontoView');
  if (old) old.remove();

  const realProps = PROPERTIES.filter(p => !p.adminView && !p.confrontoView && !p.cercaView && !p.graficiView && !p.speseView);
  const YEAR_NOW  = viewYear;
  const YEAR_DAYS = ((YEAR_NOW % 4 === 0 && YEAR_NOW % 100 !== 0) || YEAR_NOW % 400 === 0) ? 366 : 365;
  const REF_TODAY = viewingArchive ? new Date(viewYear, 11, 31) : TODAY;

  /* ── Calcola KPI per una proprietà ── */
  function calcKpi(propId) {
    let books = [];
    const types  = JSON.parse(localStorage.getItem(skYearTypes(propId))  || '{}');
    const fiscal = JSON.parse(localStorage.getItem(skYearFiscal(propId)) || '{}');
    try {
      const live = JSON.parse(localStorage.getItem(skYearLive(propId)) || '[]');
      books.push(...live.map(raw => {
        const b = deserBook(raw);
        b._bookType = types[b.uid] || '';
        b.isPast = !!(b.checkout && b.checkout <= REF_TODAY);
        return b;
      }));
    } catch(e) {}
    try {
      const past = JSON.parse(localStorage.getItem(skYearPast(propId)) || '{}');
      Object.values(past).forEach(raw => {
        const b = deserBook(raw);
        b._bookType = types[b.uid] || '';
        b.isPast = true;
        if (!books.find(x => x.uid === b.uid)) books.push(b);
      });
    } catch(e) {}

    books = books.filter(b => b.source !== 'blocked' && b.checkin).sort((a, b) => a.checkin - b.checkin);

    // Merge manual bookings (year-aware)
    let manual = [];
    try { manual = JSON.parse(localStorage.getItem(skYearManual(propId)) || '[]'); } catch(e) {}
    manual.forEach(m => {
      if (books.find(x => x.uid === m.uid)) return;
      const checkin  = m.checkin  ? new Date(m.checkin)  : null;
      const checkout = m.checkout ? new Date(m.checkout) : null;
      if (!checkin) return;
      books.push({
        uid: m.uid, source: 'manual',
        nome: m.nome || '—', checkin, checkout,
        prezzo: m.prezzo != null ? m.prezzo : null,
        notti: m.notti || (checkin && checkout ? Math.round((checkout - checkin) / 86400000) : null),
        isPast: !!(checkout && checkout <= REF_TODAY),
        _bookType: m.bookType || 'diretta',
        isManual: true,
      });
    });
    books.sort((a, b) => a.checkin - b.checkin);

    const live      = books.filter(b => !b.isPast);
    const past      = books.filter(b => b.isPast);
    // For display: future notti/nBooks
    const notti     = live.reduce((s, b) => s + (b.notti || 0), 0);
    const nBooks    = live.filter(b => b.prezzo !== null).length;
    // For expense calc: ALL bookings (past + future) that have a price
    const nottiAll  = books.reduce((s, b) => s + (b.notti || 0), 0);
    const nBooksAll = books.filter(b => b.prezzo !== null).length;

    const bkComm  = parseFloat(fiscal.bkComm  ?? 16)   / 100;
    const abComm  = parseFloat(fiscal.abComm  ?? 15.5) / 100;
    const inclDir = fiscal.inclDir ?? false;
    const isForf  = (fiscal.regime ?? 'cedolare') === 'forfettario';
    const IVA=0.22, FEE_PAG=0.015, COEFF=0.40, IRPEF=0.05, INPS=0.2448;

    let taxBase=0, nettoLordo=0, lordoOTA=0, lordoDiretta=0;
    let nettoLordoOTA=0, nottiOTAAll=0, nBookOTA=0;

    books.filter(b => b.prezzo !== null).forEach(b => {
      const bt=b._bookType, p=b.prezzo;
      if (bt==='booking') {
        const c=p*bkComm, f=p*FEE_PAG, i=c*IVA, net=p-c-f-i;
        nettoLordo+=net; nettoLordoOTA+=net;
        taxBase+=p; lordoOTA+=p;
        nottiOTAAll+=(b.notti||0); nBookOTA++;
      } else if (bt==='airbnb') {
        const c=p*abComm, i=c*IVA, net=p-c-i;
        nettoLordo+=net; nettoLordoOTA+=net;
        taxBase+=p; lordoOTA+=p;
        nottiOTAAll+=(b.notti||0); nBookOTA++;
      } else if (bt==='diretta') {
        nettoLordo+=p; lordoDiretta+=p;
        if (inclDir) taxBase+=p;
      }
    });

    const lordo = lordoOTA + lordoDiretta;

    // Cedolare default 21% — verrà eventualmente sovrascritta dopo
    let cedAliquota = 0.21;
    let taxAmountCed, taxAmount;
    if (isForf) {
      const imp = taxBase * COEFF;
      taxAmount    = imp * (IRPEF + INPS);
      taxAmountCed = 0;
    } else {
      taxAmountCed = lordoOTA * cedAliquota;
      taxAmount    = taxAmountCed + (inclDir ? lordoDiretta * cedAliquota : 0);
    }

    const netto    = nettoLordo - taxAmount;
    const gestione = getGestione(propId);

    return {
      books, types, fiscal, lordo, notti, taxAmount, netto, nettoLordo,
      n: live.length, nAll: books.length, isForf, taxBase, lordoOTA, lordoDiretta,
      nBooks, nBooksAll, nottiAll, gestione, propId,
      nettoLordoOTA, nottiOTA: nottiOTAAll, nottiOTAAll, nBookOTA,
      cedAliquota, taxAmountCed,
      taxRecoveryThreshold: 0, taxIsRecovered: false,
      incassoTotale: 0,       // calcolato da finalizeKpiIncasso() dopo recomputeKpi()
      _pastBooks: past,       // solo prenotazioni passate (checkout <= REF_TODAY)
    };
  }

  /* ── Ricalcola tasse e netto dopo aver assegnato aliquota/threshold ── */
  function recomputeKpi(kpi) {
    if (kpi.isForf) {
      kpi.taxRecovered = 0;
      kpi.taxExcess    = 0;
      return;
    }
    const inclDir = kpi.fiscal.inclDir ?? false;
    const CED     = kpi.cedAliquota;
    kpi.taxAmountCed = kpi.lordoOTA * CED;
    kpi.taxAmount    = kpi.taxAmountCed + (inclDir ? kpi.lordoDiretta * CED : 0);
    kpi.taxBase      = kpi.lordoOTA + (inclDir ? kpi.lordoDiretta : 0);

    if (kpi.taxRecoveryThreshold > 0) {
      // Split: quota recuperata (già pagata come acconto) vs eccedenza ancora dovuta
      kpi.taxRecovered   = Math.min(kpi.taxAmount, kpi.taxRecoveryThreshold);
      kpi.taxExcess      = Math.max(0, kpi.taxAmount - kpi.taxRecoveryThreshold);
      kpi.taxIsRecovered = kpi.taxExcess === 0;
      // netto: recuperata è un guadagno (+), eccedenza è un costo (-)
      kpi.netto = kpi.nettoLordo + kpi.taxRecovered - kpi.taxExcess;
    } else {
      kpi.taxRecovered = 0;
      kpi.taxExcess    = 0;
      kpi.netto = kpi.nettoLordo - kpi.taxAmount;
    }
  }

  /* ── Calcola incassoTotale con aliquota/soglia corrette (chiamato dopo recomputeKpi) ── */
  function finalizeKpiIncasso(kpi, sp) {
    const past      = kpi._pastBooks || [];
    const fiscal    = kpi.fiscal     || {};
    const bkComm    = parseFloat(fiscal.bkComm  ?? 16)   / 100;
    const abComm    = parseFloat(fiscal.abComm  ?? 15.5) / 100;
    const inclDir   = fiscal.inclDir ?? false;
    const isForf    = kpi.isForf;
    const IVA = 0.22, FEE_PAG = 0.015, COEFF = 0.40, IRPEF = 0.05, INPS = 0.2448;
    const CED = kpi.cedAliquota;  // già aggiornato da recomputeKpi (21% o 26%)

    // Soglia cedolare per Villa e Corso (applicata sull'importo tasse, non sul lordo):
    // – fino alla soglia: la cedolare è già "coperta" dal regime concordato → guadagno (+)
    // – oltre la soglia: solo la parte eccedente è un costo effettivo (–)
    const threshold = kpi.taxRecoveryThreshold || 0;  // €1134 villa, €1285.2 corso, 0 altri

    let totLordo = 0, totComm = 0, totTasse = 0, nPast = 0, totLordoOTA = 0, totLordoDir = 0;

    past.filter(b => b.prezzo !== null).forEach(b => {
      const bt = b._bookType, p = b.prezzo, nn = b.notti || 0;

      let comm = 0, nettoComm = null;
      if (bt === 'booking') {
        comm = p * bkComm + p * FEE_PAG + p * bkComm * IVA;
        nettoComm = p - comm;
      } else if (bt === 'airbnb') {
        comm = p * abComm + p * abComm * IVA;
        nettoComm = p - comm;
      } else if (bt === 'diretta') {
        comm = 0;
        nettoComm = p;
      }
      if (nettoComm === null) return;

      let tax = 0;
      if (isForf) {
        tax = p * COEFF * (IRPEF + INPS);
      } else {
        const isOTA = bt === 'booking' || bt === 'airbnb';
        if (isOTA || (bt === 'diretta' && inclDir)) tax = p * CED;
      }

      totLordo += p;
      totComm  += comm;
      totTasse += tax;
      nPast++;
      if (bt === 'diretta') totLordoDir += p;
      else                  totLordoOTA += p;
    });

    // ── Aggiustamento soglia cedolare (Villa / Corso) ──────────────────────────────
    // totTasse = tasse lorde calcolate su tutte le prenotazioni passate
    // taxGain  = parte tasse coperta dal regime concordato (guadagno: non si paga davvero)
    // taxCost  = parte tasse effettivamente dovuta oltre la soglia (costo reale)
    let taxGain = 0, taxCost = 0;
    if (!isForf && threshold > 0) {
      taxGain = Math.min(totTasse, threshold);   // recupero (guadagno netto)
      taxCost = Math.max(0, totTasse - threshold); // eccedenza (costo reale)
    } else {
      taxCost = totTasse;  // no soglia: tutta la cedolare è un costo
    }

    // Netto = lordo – comm – taxCost  (spese operative stimate escluse da questa card)
    const totNetto = totLordo - totComm - taxCost;

    // Spese reali registrate per questo appartamento
    let speseRealiTot = 0;
    try {
      const sr = JSON.parse(localStorage.getItem('octo_spese_reali_v3') || '[]');
      speseRealiTot = sr.filter(e => e.propId === kpi.propId).reduce((s,e) => s + (parseFloat(e.importo)||0), 0);
    } catch(_) {}

    kpi.incassoTotale  = totNetto - speseRealiTot;
    kpi._incGestione   = 0;
    kpi._incSpeseReali = speseRealiTot;
    kpi._incLordo      = totLordo;
    kpi._incLordoOTA   = totLordoOTA;
    kpi._incLordoDir   = totLordoDir;
    kpi._incComm       = totComm;
    kpi._incTasse      = taxCost;    // mostra solo il costo reale (eccedenza)
    kpi._incTasseGain  = taxGain;    // guadagno recuperato (cedolare già assorbita)
    kpi._incTasseTot   = totTasse;   // totale lordo tasse (per informazione)
    kpi._incSpeseOp    = 0;  // escluso dal calcolo netto reale
    kpi._incNPast      = nPast;
    kpi._hasThreshold  = threshold > 0;
  }

  /* ── Spese operative totali per un kpi ── */
  function calcSpeseOp(kpi, sp) {
    // Use ALL bookings (past + future) for consistent expense calculation
    const nn   = kpi.nottiAll    !== undefined ? kpi.nottiAll    : kpi.notti;
    const nb   = kpi.nBooksAll   !== undefined ? kpi.nBooksAll   : kpi.nBooks;
    const nOTA = kpi.nottiOTAAll !== undefined ? kpi.nottiOTAAll : (kpi.nottiOTA || 0);
    const ts   = parseFloat(sp.tassaSoggiorno) || 0;
    return (parseFloat(sp.luce) || 0) * (nn || 0)
      + ((parseFloat(sp.welcomePack) || 0) + (parseFloat(sp.pulizie) || 0) + (parseFloat(sp.lavanderia) || 0)) * (nb || 0)
      + ts * (nOTA || 0);
  }

  /* ── Netto utile per un kpi ── */
  function calcNettoUtile(kpi, sp) {
    return (kpi.netto || 0) - calcSpeseOp(kpi, sp) - (parseFloat(kpi.gestione) || 0);
  }

  /* ════════════════════════════════════════
     ELABORAZIONE PRINCIPALE
  ════════════════════════════════════════ */
  const spese   = getSpese();
  const allKpis = realProps.map(prop => ({ prop, kpi: calcKpi(prop.id) }));
  const kpiMap  = {};
  allKpis.forEach(({prop, kpi}) => { kpiMap[prop.id] = kpi; });

  /* ── Assegna aliquote: Stoccolma vs Frescura ── */
  const stocKpi = kpiMap['stoccolma'];
  const fresKpi = kpiMap['frescura'];
  if (stocKpi && fresKpi && !stocKpi.isForf && !fresKpi.isForf) {
    if (stocKpi.lordoOTA >= fresKpi.lordoOTA) {
      stocKpi.cedAliquota = 0.21; fresKpi.cedAliquota = 0.26;
    } else {
      stocKpi.cedAliquota = 0.26; fresKpi.cedAliquota = 0.21;
    }
  }

  /* ── Assegna aliquote + soglia recupero: Villa vs Corso ── */
  const villaKpi = kpiMap['villa'];
  const corsoKpi = kpiMap['corso'];
  if (villaKpi) villaKpi.taxRecoveryThreshold = 1134;
  if (corsoKpi) corsoKpi.taxRecoveryThreshold = 1285.2;
  if (villaKpi && corsoKpi && !villaKpi.isForf && !corsoKpi.isForf) {
    if (villaKpi.lordoOTA >= corsoKpi.lordoOTA) {
      villaKpi.cedAliquota = 0.21; corsoKpi.cedAliquota = 0.26;
    } else {
      villaKpi.cedAliquota = 0.26; corsoKpi.cedAliquota = 0.21;
    }
  }

  /* ── Ricalcola tutti con le aliquote definitive ── */
  allKpis.forEach(({kpi}) => recomputeKpi(kpi));

  /* ── Finalizza incassoTotale con le aliquote corrette ── */
  allKpis.forEach(({kpi}) => finalizeKpiIncasso(kpi, spese));

  /* ── Classifica per netto utile (decrescente) ── */
  const withData = allKpis.filter(x => x.kpi.lordo > 0);
  withData.sort((a, b) => calcNettoUtile(b.kpi, spese) - calcNettoUtile(a.kpi, spese));

  /* ── Aggregazione gruppi ── */
  function sumGroup(propIds) {
    return allKpis.filter(x => propIds.includes(x.prop.id)).reduce((acc, {kpi}) => {
      acc.n            += kpi.n;           acc.nAll          += kpi.nAll;
      acc.notti        += kpi.notti;       acc.lordo         += kpi.lordo;
      acc.lordoOTA     += kpi.lordoOTA;    acc.lordoDiretta  += kpi.lordoDiretta;
      acc.taxAmount    += kpi.taxAmount;   acc.taxBase       += kpi.taxBase;
      acc.netto        += kpi.netto;       acc.nettoLordo    += kpi.nettoLordo;
      acc.nBooks       += kpi.nBooks;      acc.nBookOTA      += kpi.nBookOTA;
      acc.nottiOTA     += kpi.nottiOTA;    acc.gestione      += (kpi.gestione || 0);
      acc.nottiAll     += (kpi.nottiAll    || 0);
      acc.nBooksAll    += (kpi.nBooksAll   || 0);
      acc.nottiOTAAll  += (kpi.nottiOTAAll || 0);
      acc.incassoTotale+= (kpi.incassoTotale || 0);
      acc._incLordo    += (kpi._incLordo   || 0);
      acc._incComm     += (kpi._incComm    || 0);
      acc._incTasse    += (kpi._incTasse   || 0);
      acc._incSpeseOp  += (kpi._incSpeseOp || 0);
      acc._incNPast     += (kpi._incNPast     || 0);
      acc._incSpeseReali+= (kpi._incSpeseReali|| 0);
      acc._incLordoOTA  += (kpi._incLordoOTA  || 0);
      acc._incLordoDir  += (kpi._incLordoDir  || 0);
      acc.nProps = (acc.nProps||0) + 1;
      acc.books.push(...kpi.books);
      return acc;
    }, {
      n:0, nAll:0, notti:0, lordo:0, lordoOTA:0, lordoDiretta:0, nProps:0,
      taxAmount:0, taxBase:0, netto:0, nettoLordo:0, books:[], isForf:false,
      nBooks:0, nBookOTA:0, nottiOTA:0, nottiAll:0, nBooksAll:0, nottiOTAAll:0,
      gestione:0, incassoTotale:0,
      _incLordo:0, _incComm:0, _incTasse:0, _incSpeseOp:0, _incNPast:0, _incGestione:0, _incSpeseReali:0, _incLordoOTA:0, _incLordoDir:0,
      taxRecoveryThreshold:0, taxIsRecovered:false, cedAliquota:0.21,
      nettoLordoOTA:0,
    });
  }

  const totKpi = withData.reduce((acc, {kpi}) => {
    acc.n            += kpi.n;           acc.nAll          += kpi.nAll;
    acc.notti        += kpi.notti;       acc.lordo         += kpi.lordo;
    acc.lordoOTA     += kpi.lordoOTA;    acc.lordoDiretta  += kpi.lordoDiretta;
    acc.taxAmount    += kpi.taxAmount;   acc.taxBase       += kpi.taxBase;
    acc.netto        += kpi.netto;       acc.nettoLordo    += kpi.nettoLordo;
    acc.nBooks       += kpi.nBooks;      acc.nBookOTA      += kpi.nBookOTA;
    acc.nottiOTA     += kpi.nottiOTA;    acc.incassoTotale += (kpi.incassoTotale || 0);
    acc.nottiAll     += (kpi.nottiAll    || 0);
    acc.nBooksAll    += (kpi.nBooksAll   || 0);
    acc.nottiOTAAll  += (kpi.nottiOTAAll || 0);
    acc._incLordo    += (kpi._incLordo   || 0);
    acc._incComm     += (kpi._incComm    || 0);
    acc._incTasse    += (kpi._incTasse   || 0);
    acc._incSpeseOp  += (kpi._incSpeseOp || 0);
    acc._incNPast     += (kpi._incNPast     || 0);
    acc._incSpeseReali+= (kpi._incSpeseReali || 0);
    acc._incLordoOTA  += (kpi._incLordoOTA  || 0);
    acc._incLordoDir  += (kpi._incLordoDir  || 0);
    acc.gestione      += (kpi.gestione       || 0);
    acc.nProps = (acc.nProps||0) + 1;
    acc.books.push(...kpi.books);
    return acc;
  }, {
    n:0, nAll:0, notti:0, lordo:0, lordoOTA:0, lordoDiretta:0, nProps:0,
    taxAmount:0, taxBase:0, netto:0, nettoLordo:0, books:[], isForf:false,
    nBooks:0, nBookOTA:0, nottiOTA:0, nottiAll:0, nBooksAll:0, nottiOTAAll:0,
    gestione:0, incassoTotale:0,
    _incLordo:0, _incComm:0, _incTasse:0, _incSpeseOp:0, _incNPast:0, _incGestione:0, _incSpeseReali:0, _incLordoOTA:0, _incLordoDir:0,
    taxRecoveryThreshold:0, taxIsRecovered:false, cedAliquota:0.21,
  });

  const mammaKpi = sumGroup(MAMMA_IDS);
  const gpKpi    = sumGroup(GP_IDS);

  /* ── Netto Mamma: solo OTA dopo comm. + cedolare, + contanti ── */
  const mammaNettoOTA = MAMMA_IDS.reduce((s, id) => {
    const k = kpiMap[id];
    if (!k) return s;
    if (k.isForf) return s + k.netto;
    return s + (k.nettoLordoOTA - k.taxAmountCed);
  }, 0);

  const contanti = spese.contanti;

  /* ── Spese operative Mamma su tutte le notti/prenotazioni Mamma ── */
  const mammaSpeseOp = calcSpeseOp(mammaKpi, spese);

  /* ── Tasse sulle dirette Mamma (solo se inclDir=true per quell'app) ── */
  const mammaTaxDir = MAMMA_IDS.reduce((s, id) => {
    const k = kpiMap[id];
    if (!k || k.isForf) return s;
    const inclDir = k.fiscal?.inclDir ?? false;
    return inclDir ? s + k.lordoDiretta * k.cedAliquota : s;
  }, 0);

  /* ── Netti utili GP per i suoi 5 appartamenti ── */
  const gpNettoUtile = GP_IDS.reduce((s, id) => {
    const k = kpiMap[id]; return k ? s + calcNettoUtile(k, spese) : s;
  }, 0);

  /* ── Netto GP ──
     dirette Mamma (lordo)
     − tasse sulle dirette Mamma (se inclDir)
     − spese operative Mamma (luce×notti + pulizie+welcome+lavanderia×prenot + tassa soggiorno)
     − gestione Mamma
     − contanti consegnati a Mamma
     + Σ netti utili GP (netto tasse − spese op − gestione per ogni app GP)
  ── */
  const nettoGP    = mammaKpi.lordoDiretta - mammaTaxDir - mammaSpeseOp
                   - (mammaKpi.gestione || 0) - contanti + gpNettoUtile;
  const nettoMamma = mammaNettoOTA + contanti;

  /* ── Costruisce una riga della tabella confronto ── */
  function buildRow(prop, kpi, isTotale, rank, sp, isGroup, groupLabel) {
    const isForf  = kpi.isForf;
    const ced     = kpi.cedAliquota;
    const regime  = isForf ? 'Forfettario'
                  : ced === 0.26 ? 'Ced. 26%' : 'Ced. 21%';
    const taxLbl  = isForf ? 'Tasse' : 'Cedolare';

    const speseOp    = calcSpeseOp(kpi, sp);
    const gestione   = kpi.gestione || 0;
    const nettoUtile = kpi.netto - speseOp - gestione;

    // Spese Reali registrate per questo appartamento (da scheda Spese)
    let propSpeseReali = 0;
    if (!isTotale && !isGroup && kpi.propId) {
      try {
        const _sr = JSON.parse(localStorage.getItem('octo_spese_reali_v3') || '[]');
        propSpeseReali = _sr.filter(e => e.propId === kpi.propId).reduce((s,e) => s + (parseFloat(e.importo)||0), 0);
      } catch(_) {}
    } else if (isGroup || isTotale) {
      // For group/total rows, use _incSpeseReali (already summed in finalizeKpiIncasso/sumGroup)
      propSpeseReali = kpi._incSpeseReali || 0;
    }

    /* Badge aliquota cedolare differenziata (solo su righe proprietà singola) */
    let taxRateBadge = '';
    if (!isTotale && !isGroup && !isForf) {
      const isSpecialRate = (kpi.propId === 'stoccolma' || kpi.propId === 'frescura' ||
                             kpi.propId === 'villa'     || kpi.propId === 'corso');
      if (isSpecialRate && ced === 0.26) {
        taxRateBadge = `<span style="display:inline-block;margin-left:4px;padding:1px 5px;border-radius:3px;background:#FFF0E0;color:#B86010;font-size:9px;font-weight:700">26%</span>`;
      }
    }

    /* Badge recupero cedolare (Villa / Corso) */
    let recoveryBadge = '';
    if (!isTotale && !isGroup && !isForf && kpi.taxRecoveryThreshold > 0) {
      if (kpi.taxIsRecovered) {
        recoveryBadge = `<span style="display:inline-block;margin-top:2px;padding:1px 6px;border-radius:3px;background:#E8F5E9;color:#145C38;font-size:9px;font-weight:700">✓ ced. recuperata</span>`;
      } else {
        recoveryBadge = `<span style="display:inline-block;margin-top:2px;padding:1px 6px;border-radius:3px;background:#FFF0E0;color:#B86010;font-size:9px;font-weight:700">⚠ oltre soglia €${kpi.taxRecoveryThreshold}</span>`;
      }
    }

    const dates   = kpi.books.filter(b => !b.isPast && b.checkin).map(b => b.checkin).sort((a, b) => a - b);
    const periodo = dates.length >= 2
      ? `${fmtDate(dates[0])} → ${fmtDate(dates[dates.length-1])}`
      : dates.length === 1 ? fmtDate(dates[0]) : '—';

    const eurNotte = kpi.notti > 0 ? (kpi.lordo / kpi.notti).toFixed(0) : '—';
    // Occupazione: per singolo prop = notti/YEAR_DAYS; per gruppo = notti/(nProps*YEAR_DAYS)
    const _occDays = (isGroup || isTotale) ? ((kpi.nProps||1) * YEAR_DAYS) : YEAR_DAYS;
    const occPct   = kpi.notti > 0 ? ((kpi.notti / _occDays) * 100).toFixed(1) : '—';
    // RevPAR e NetRevPAR per riga confronto
    // single prop: lordo/YEAR_DAYS (ricavo per giorno disponibile)
    // gruppo/totale: lordo/YEAR_DAYS = totale; lordo/(nProps*YEAR_DAYS) = media
    const _cfRevPAR    = kpi.lordo > 0 ? (kpi.lordo / YEAR_DAYS) : null;
    const _cfNetRevPAR = kpi.lordo > 0 ? (nettoUtile / YEAR_DAYS) : null;
    const _fmtRev = v => v != null ? '€' + Math.round(v).toLocaleString('it-IT') : '—';

    const tc = {};
    kpi.books.filter(b => !b.isPast).forEach(b => { const t=b._bookType; if(t) tc[t]=(tc[t]||0)+1; });
    const tipoBadges = ['booking','airbnb','diretta'].filter(t => tc[t]).map(t =>
      `<span class="cf-tipo-badge cf-${t}">${tc[t]} ${t==='booking'?'Bk':t==='airbnb'?'Ab':'Dir'}</span>`
    ).join('');

    const hasOTA = kpi.lordoOTA > 0;
    const hasDir = kpi.lordoDiretta > 0;
    const lrdOTA = hasOTA ? `<div class="cf-lordo-line cf-lordo-ota"><span class="cf-lordo-ico">📘🌸</span>€${kpi.lordoOTA.toFixed(0)}</div>` : '';
    const lrdDir = hasDir ? `<div class="cf-lordo-line cf-lordo-dir"><span class="cf-lordo-ico">🟢</span>€${kpi.lordoDiretta.toFixed(0)}</div>` : '';

    const rankBadge = (!isTotale && !isGroup && rank != null)
      ? `<span class="cf-rank">${rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':'#'+rank}</span>`
      : '';

    /* Colore / formato importo tasse */
    let taxDisplayHtml;
    if (!isTotale && !isGroup && kpi.taxRecoveryThreshold > 0) {
      if (kpi.taxIsRecovered) {
        // Interamente recuperata: tutto guadagno
        taxDisplayHtml = `<div class="cf-k-val cf-green">+€${kpi.taxAmount.toFixed(0)}</div>`;
      } else if (kpi.taxRecovered > 0) {
        // Parziale: quota recuperata (verde +) + eccedenza (rosso −)
        taxDisplayHtml = `<div class="cf-k-val" style="line-height:1.3">
          <span style="color:#145C38;font-weight:700">+€${kpi.taxRecovered.toFixed(0)}</span><br>
          <span style="color:#C0392B;font-weight:700;font-size:13px">−€${kpi.taxExcess.toFixed(0)}</span>
        </div>`;
      } else {
        // Nessun recupero (threshold=0 o cedolare=0)
        taxDisplayHtml = `<div class="cf-k-val cf-orange">€${kpi.taxAmount.toFixed(0)}</div>`;
      }
    } else {
      taxDisplayHtml = `<div class="cf-k-val cf-orange">€${kpi.taxAmount.toFixed(0)}</div>`;
    }

    const propLabel = isGroup
      ? `<div style="display:flex;align-items:center;gap:6px"><span style="font-size:18px">${groupLabel.icon}</span><div><strong style="font-size:15px">${groupLabel.name}</strong><br><span style="font-size:9px;opacity:.7">${kpi.n} prenot. · ${kpi.notti} notti</span></div></div>`
      : isTotale
      ? `<span style="font-size:16px">∑</span> <strong>TOTALE</strong><br><span style="font-size:9px;opacity:.7;font-weight:400">${kpi.n} prenot. · ${kpi.notti} notti</span>`
      : `<div style="display:flex;align-items:flex-start;gap:5px">${rankBadge}<div>${prop.icon} <strong>${prop.name}</strong><span class="confronto-regime-badge" style="margin-top:3px;display:block">${regime}</span>${taxRateBadge}${recoveryBadge}</div></div>`;

    const rowCls = isGroup ? 'cf-row cf-row-group' : isTotale ? 'cf-row cf-row-totale' : 'cf-row';

    /* sp.op. breakdown tooltip */
    const speseBreakdown = sp.tassaSoggiorno > 0
      ? `sp.op.${gestione>0?' + gest.':''} <span style="opacity:.6;font-size:9px">(−€${(speseOp+gestione).toFixed(0)})</span><br><span style="opacity:.5;font-size:8px">tassa sogg.: €${(sp.tassaSoggiorno * kpi.nottiOTA).toFixed(0)}</span>`
      : `sp.op.${gestione>0?' + gest.':''} <span style="opacity:.6;font-size:9px">(−€${(speseOp+gestione).toFixed(0)})</span>`;

    return `<div class="${rowCls}">
      <div class="cf-prop">${propLabel}</div>
      <div class="cf-kpis">
        <div class="cf-k">
          <div class="cf-k-lbl">Prenotaz.</div>
          <div class="cf-k-val">${kpi.n}</div>
          <div class="cf-k-sub">${(isTotale||isGroup) ? kpi.nAll+' tot.' : periodo}</div>
        </div>
        <div class="cf-k">
          <div class="cf-k-lbl">Notti</div>
          <div class="cf-k-val">${kpi.notti}</div>
          <div class="cf-k-sub ${occPct!=='—'?'cf-occ':''}">
            ${occPct!=='—'?occPct+'% occ.':'future'}
            ${kpi.nottiOTA>0?`<br><span style="opacity:.5;font-size:8px">${kpi.nottiOTA} OTA</span>`:''}
          </div>
        </div>
        <div class="cf-k cf-k-lordo">
          <div class="cf-k-lbl">Lordo · €${eurNotte!=='—'?eurNotte+'/notte':'—'}</div>
          <div class="cf-k-val cf-green">€${kpi.lordo.toFixed(0)}</div>
          <div class="cf-lordo-split">${lrdOTA}${lrdDir}${(!hasOTA&&!hasDir)?'<span style="opacity:.4">—</span>':''}</div>
        </div>
        <div class="cf-k cf-k-spesereali">
          <div class="cf-k-lbl">Spese Reali</div>
          ${propSpeseReali > 0
            ? `<div class="cf-k-val" style="color:#C03020;font-size:15px">−€${propSpeseReali.toFixed(0)}</div>`
            : `<div class="cf-k-val" style="opacity:.35;font-size:13px">—</div>`
          }
          <div class="cf-k-sub" style="font-size:8.5px;opacity:.6">registrate</div>
        </div>
        <div class="cf-k">
          <div class="cf-k-lbl">${taxLbl}</div>
          ${taxDisplayHtml}
          <div class="cf-k-sub">base €${kpi.taxBase.toFixed(0)}</div>
        </div>
        <div class="cf-k cf-k-netto">
          <div class="cf-k-lbl">Netto finale</div>
          <div class="cf-netto-row">
            <span class="cf-netto-ico">📋</span>
            <div>
              <div class="cf-netto-lbl">dopo comm. + tasse</div>
              <div class="cf-netto-val cf-purple">€${kpi.netto.toFixed(0)}</div>
            </div>
          </div>
          <div class="cf-netto-divider"></div>
          <div class="cf-netto-row">
            <span class="cf-netto-ico">💰</span>
            <div>
              <div class="cf-netto-lbl">${speseBreakdown}</div>
              <div class="cf-netto-val ${nettoUtile>=0?'cf-green':'cf-red'}">€${nettoUtile.toFixed(0)}</div>
            </div>
          </div>
          ${kpi._incNPast > 0 ? `
          <div class="cf-netto-divider"></div>
          <div class="cf-netto-row">
            <span class="cf-netto-ico">💵</span>
            <div style="min-width:0">
              <div class="cf-netto-lbl">CASSA OGGI · ${kpi._incNPast} prenot. passate</div>
              <div class="cf-netto-val" style="color:#145C38;font-weight:700">€${kpi.incassoTotale.toFixed(0)}</div>
              <div style="font-size:9px;color:var(--ink2);line-height:1.7;margin-top:3px">
                🟢 Lordo: €${(kpi._incLordo||0).toFixed(0)}${((kpi._incLordoOTA||0)>0||(kpi._incLordoDir||0)>0) ? ` <span style="font-size:8.5px;opacity:.75">(OTA €${(kpi._incLordoOTA||0).toFixed(0)} · dir. €${(kpi._incLordoDir||0).toFixed(0)})</span>` : ''}<br>
                📘🌸 Comm.: <span style="color:#C0392B">−€${(kpi._incComm||0).toFixed(0)}</span><br>
                ${kpi._hasThreshold
                  ? `🏛 Tasse: <span style="color:#C0392B">−€${(kpi._incTasse||0).toFixed(0)}</span>` +
                    ((kpi._incTasseGain||0)>0 ? ` &nbsp;<span style="color:#145C38;font-size:8.5px">(+€${(kpi._incTasseGain||0).toFixed(0)} coperto da regime)</span>` : '')
                  : `🏛 Tasse: <span style="color:#C0392B">−€${(kpi._incTasse||0).toFixed(0)}</span>`
                }
                ${(kpi._incSpeseReali||0)>0 ? '<br>🔧 Spese reali: <span style="color:#C0392B">−€'+(kpi._incSpeseReali||0).toFixed(0)+'</span>' : ''}
              </div>
            </div>
          </div>` : ''}
        </div>
        <div class="cf-k">
          <div class="cf-k-lbl" style="color:var(--ink);font-weight:700">Occ. % · RevPAR</div>
          <div class="cf-k-val" style="font-size:16px;font-weight:700;color:var(--ink)">${occPct !== '—' ? occPct + '%' : '<span style="opacity:.35">—</span>'}</div>
          <div style="margin-top:4px;line-height:1.7">
            ${_cfRevPAR    != null ? `<div style="font-size:12px;font-weight:700;color:#7B5CF0">${_fmtRev(_cfRevPAR)}/gg lordo</div>`  : ''}
            ${_cfNetRevPAR != null ? `<div style="font-size:12px;font-weight:700;color:#2AAF6A">${_fmtRev(_cfNetRevPAR)}/gg netto</div>` : ''}
          </div>
        </div>

        <div class="cf-k cf-k-tipo">
          <div class="cf-k-lbl">Canali</div>
          <div class="cf-tipo-badges">${(isTotale||isGroup)?'<span style="opacity:.4">∑</span>':(tipoBadges||'<span style="opacity:.4">—</span>')}</div>
        </div>
      </div>
    </div>`;
  }

  /* ── Righe riepilogo ── */
  const mammaHtml  = mammaKpi.lordo > 0 ? buildRow(null, mammaKpi, false, null, spese, true, {icon:'👩', name:'Mamma'})  : '';
  const gpHtml     = gpKpi.lordo    > 0 ? buildRow(null, gpKpi,    false, null, spese, true, {icon:'👤', name:'GP'})     : '';
  const totaleHtml = withData.length > 1 ? buildRow(null, totKpi,  true,  null, spese, false, null) : '';

  const noData    = allKpis.filter(x => x.kpi.lordo === 0);
  const cardsHtml = [
    ...withData.map(({prop, kpi}, i) => buildRow(prop, kpi, false, i+1, spese, false, null)),
    ...noData.map(({prop}) => `<div class="cf-row cf-empty">
      <div class="cf-prop">${prop.icon} <strong>${prop.name}</strong></div>
      <div class="cf-no-data">⚠ Nessun dato — aggiorna la scheda appartamento</div>
    </div>`)
  ].join('');

  /* ── Totale Spese Reali per appartamento ── */
  let allSpeseReali = [];
  try { allSpeseReali = JSON.parse(localStorage.getItem('octo_spese_reali_v3') || '[]'); } catch(_) {}
  const speseRealiByProp = {};
  realProps.forEach(p => {
    speseRealiByProp[p.id] = allSpeseReali.filter(e => e.propId === p.id).reduce((s,e) => s + (parseFloat(e.importo)||0), 0);
  });
  const speseRealiTotGlobal = Object.values(speseRealiByProp).reduce((s,v) => s+v, 0);

  const speseRealiPanelRows = realProps
    .filter(p => (speseRealiByProp[p.id]||0) > 0)
    .sort((a,b) => speseRealiByProp[b.id] - speseRealiByProp[a.id])
    .map(p => {
      const v = speseRealiByProp[p.id];
      const pct = speseRealiTotGlobal > 0 ? (v/speseRealiTotGlobal*100).toFixed(0) : 0;
      const barW = speseRealiTotGlobal > 0 ? Math.max(4, v/speseRealiTotGlobal*100) : 0;
      return `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px solid var(--bg2)">
        <span style="font-size:12px;min-width:20px">${p.icon}</span>
        <span style="flex:1;font-size:11px;font-weight:600;color:var(--ink)">${p.name}</span>
        <div style="flex:2;background:var(--bg2);border-radius:3px;height:6px;overflow:hidden">
          <div style="height:6px;border-radius:3px;background:#E05C7A;width:${barW}%"></div>
        </div>
        <span style="font-size:11px;font-weight:700;color:#C03020;min-width:52px;text-align:right">−€${v.toFixed(0)}</span>
        <span style="font-size:9px;color:var(--ink2);min-width:28px;text-align:right">${pct}%</span>
      </div>`;
    }).join('');

  const speseRealiPanel = speseRealiTotGlobal > 0 ? `
    <div class="spese-reali-panel">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div class="spese-panel-title" style="margin-bottom:0">🔧 Spese Reali registrate</div>
        <div style="font-family:'Fraunces',serif;font-size:17px;font-weight:700;color:#C03020">
          −€${speseRealiTotGlobal.toFixed(0)}
        </div>
      </div>
      ${speseRealiPanelRows || '<div style="font-size:11px;color:var(--ink2);opacity:.6">Nessuna spesa registrata</div>'}
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--bdr);display:flex;justify-content:flex-end">
        <button class="btn btn-gh btn-sm" onclick="switchProp('spese')" style="font-size:10px">→ Gestisci spese</button>
      </div>
    </div>` : '';

  /* ── Dettaglio spese GP ── */
  const gpDettaglio = [
    `<span>🟢 Dir. Mamma: €${mammaKpi.lordoDiretta.toFixed(0)}</span>`,
    mammaTaxDir > 0 ? `<span style="margin-left:8px;color:#C0392B">−€${mammaTaxDir.toFixed(0)} tasse dir.</span>` : '',
    `<span style="margin-left:8px;color:#C0392B">−€${mammaSpeseOp.toFixed(0)} sp.op.</span>`,
    mammaKpi.gestione > 0 ? `<span style="margin-left:8px;color:#C0392B">−€${mammaKpi.gestione.toFixed(0)} gest.</span>` : '',
    contanti > 0 ? `<span style="margin-left:8px;color:#C0392B">−€${contanti.toFixed(0)} contanti</span>` : '',
    `<span style="margin-left:8px;color:#5A30A0">+€${gpNettoUtile.toFixed(0)} netti utili GP</span>`,
  ].filter(Boolean).join('');

  mainC.insertAdjacentHTML('beforeend', `
    <div id="confrontoView">

      <!-- Header -->
      <div class="res-hdr" style="margin-bottom:10px">
        <div class="res-title">📊 Confronto Appartamenti</div>
        <div style="display:flex;align-items:center;gap:10px">
          <div style="font-size:11px;color:var(--ink2);font-style:italic">
            Dati aggiornati · notti su ${YEAR_DAYS} giorni anno ${YEAR_NOW}
          </div>
          <button class="btn btn-acc btn-sm" onclick="switchProp('confronto')">↺ Aggiorna tutti</button>
          <button onclick="previewPulizie()"
            style="display:inline-flex;align-items:center;gap:6px;background:#25D366;color:#fff;border:none;border-radius:8px;padding:6px 13px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 2px 5px rgba(37,211,102,.3)">
            WA Pulizie
          </button>
          <button onclick="previewCheckinCheckout()"
            style="display:inline-flex;align-items:center;gap:6px;background:#128C7E;color:#fff;border:none;border-radius:8px;padding:6px 13px;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 2px 5px rgba(18,140,126,.3)">
            WA Check-in/out
          </button>
        </div>
      </div>

      <!-- ── TOP CARDS: Netto Previsto Mamma / GP / Netto Reale Oggi ── -->
      <div class="top-panels-row" style="margin-bottom:14px">

        <!-- Netto Previsto Mamma -->
        <div class="riepilogo-card riepilogo-mamma">
          <div class="riepilogo-title">👩 Netto Finale Previsto — Mamma</div>
          <div class="riepilogo-formula">Previsto: comm. + tasse + sp.op. − gestione</div>
          <div class="riepilogo-val ${nettoMamma>=0?'cf-green':'cf-red'}">€${nettoMamma.toFixed(0)}</div>
          <div class="riepilogo-detail">
            <span>OTA netto: €${mammaNettoOTA.toFixed(0)}</span>
            <span style="margin-left:8px">tasse: €${MAMMA_IDS.reduce((s,id)=>{const k=kpiMap[id];return k?s+k.taxAmountCed:s;},0).toFixed(0)}</span>
            ${contanti > 0 ? `<span style="margin-left:8px;color:#145C38">+€${contanti.toFixed(0)} contanti</span>` : ''}
          </div>
          ${mammaKpi.incassoTotale > 0 ? `
          <div style="margin-top:6px;padding:6px 10px;background:rgba(20,92,56,.07);border-radius:6px;font-size:11px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
              <span style="color:#145C38;font-weight:600">💵 CASSA OGGI (${mammaKpi._incNPast} past.)</span>
              <span style="color:#145C38;font-weight:700">€${mammaKpi.incassoTotale.toFixed(0)}</span>
            </div>
            <div style="font-size:9px;color:var(--ink2);line-height:1.7">
              🟢 Lordo: €${(mammaKpi._incLordo||0).toFixed(0)} &nbsp;·&nbsp;
              Comm.: <span style="color:#C0392B">−€${(mammaKpi._incComm||0).toFixed(0)}</span> &nbsp;·&nbsp;
              Tasse: <span style="color:#C0392B">−€${(mammaKpi._incTasse||0).toFixed(0)}</span>
              ${(mammaKpi._incSpeseReali||0)>0?`&nbsp;·&nbsp; Sp.reali: <span style="color:#C0392B">−€${(mammaKpi._incSpeseReali||0).toFixed(0)}</span>`:''}
            </div>
          </div>` : ''}
          <div class="riepilogo-contanti-row">
            <span class="riepilogo-contanti-lbl">💵 Contanti Mamma</span>
            <div style="display:flex;align-items:center;gap:4px">
              <span style="font-size:11px;color:#145C38;font-weight:700">+€</span>
              <input class="riepilogo-contanti-input" type="number" min="0" step="50"
                value="${contanti}" placeholder="0"
                onchange="saveSpese({contanti:parseFloat(this.value)||0});renderConfrontoView()"
                title="Contanti portati da Mamma">
            </div>
          </div>
        </div>

        <!-- Netto Previsto GP -->
        <div class="riepilogo-card riepilogo-gp">
          <div class="riepilogo-title">👤 Netto Finale Previsto — GP</div>
          <div class="riepilogo-formula">Dir.Mamma − tasse dir. − sp.op.Mamma − gest. − contanti + Σ netti utili GP</div>
          <div class="riepilogo-val ${nettoGP>=0?'cf-green':'cf-red'}">€${nettoGP.toFixed(0)}</div>
          <div class="riepilogo-detail" style="flex-wrap:wrap;gap:2px">
            ${gpDettaglio}
          </div>
          ${gpKpi.incassoTotale > 0 ? `
          <div style="margin-top:6px;padding:6px 10px;background:rgba(90,48,160,.07);border-radius:6px;font-size:11px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
              <span style="color:#5A30A0;font-weight:600">💵 CASSA OGGI (${gpKpi._incNPast} past.)</span>
              <span style="color:#5A30A0;font-weight:700">€${gpKpi.incassoTotale.toFixed(0)}</span>
            </div>
            <div style="font-size:9px;color:var(--ink2);line-height:1.7">
              🟢 Lordo: €${(gpKpi._incLordo||0).toFixed(0)} &nbsp;·&nbsp;
              Comm.: <span style="color:#C0392B">−€${(gpKpi._incComm||0).toFixed(0)}</span> &nbsp;·&nbsp;
              Tasse: <span style="color:#C0392B">−€${(gpKpi._incTasse||0).toFixed(0)}</span>
              ${(gpKpi._incSpeseReali||0)>0?`&nbsp;·&nbsp; Sp.reali: <span style="color:#C0392B">−€${(gpKpi._incSpeseReali||0).toFixed(0)}</span>`:''}
            </div>
            ${(() => {
              // Villa e Corso: mostra guadagno coperto da regime e costo eccedente
              const villaK = allKpis.find(x=>x.prop.id==='villa')?.kpi;
              const corsoK = allKpis.find(x=>x.prop.id==='corso')?.kpi;
              const rows = [villaK, corsoK].filter(k=>k&&(k._hasThreshold)&&(k._incNPast>0));
              if (!rows.length) return '';
              return '<div style="margin-top:4px;padding:4px 8px;background:rgba(90,48,160,.06);border-radius:5px;font-size:9px">' +
                rows.map(k=>{
                  const nome = k.propId==='villa'?'Villa':'Corso';
                  const gain = k._incTasseGain||0;
                  const cost = k._incTasse||0;
                  const tot  = k._incTasseTot||0;
                  return `<b>${nome}</b>: tasse lorde €${tot.toFixed(0)}` +
                    (gain>0?` → <span style="color:#145C38">+€${gain.toFixed(0)} coperto regime</span>`:'') +
                    (cost>0?` → <span style="color:#C0392B">−€${cost.toFixed(0)} eccedenza</span>`:'') +
                    (cost===0?` → <span style="color:#145C38">✓ tutto coperto</span>`:'');
                }).join('<br>') +
              '</div>';
            })()}
          </div>` : ''}
        </div>

        <!-- Netto Utile Reale Oggi (TOTALE) -->
        ${totKpi._incNPast > 0 || speseRealiTotGlobal > 0 ? (() => {
          const totIncasso  = totKpi.incassoTotale || 0;
          const totLordo    = totKpi._incLordo     || 0;
          const totComm     = totKpi._incComm      || 0;
          const totTasse    = totKpi._incTasse     || 0;
          const totSpeseR   = totKpi._incSpeseReali|| 0;
          const nPast       = totKpi._incNPast     || 0;
          return `<div class="riepilogo-card" style="border-color:var(--acc);background:var(--surf)">
            <div class="riepilogo-title" style="color:var(--acc)">💵 Netto Utile Reale — Oggi</div>
            <div class="riepilogo-formula" style="color:var(--ink2)">Prenotazioni passate: lordo − comm. − tasse − spese reali</div>
            <div class="riepilogo-val ${totIncasso>=0?'cf-green':'cf-red'}" style="font-size:26px">€${totIncasso.toFixed(0)}</div>
            <div style="margin-top:10px;background:var(--bg2);border-radius:8px;padding:10px 12px">
              <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--ink2);margin-bottom:7px">${nPast} prenotazioni passate</div>
              <div style="display:flex;flex-direction:column;gap:4px;font-size:11px">
                <div style="display:flex;justify-content:space-between">
                  <span>🟢 Lordo incassato</span>
                  <span style="font-weight:700">€${totLordo.toFixed(0)}</span>
                </div>
                <div style="display:flex;justify-content:space-between">
                  <span>📘🌸 Commissioni OTA</span>
                  <span style="color:#C0392B">−€${totComm.toFixed(0)}</span>
                </div>
                <div style="display:flex;justify-content:space-between">
                  <span>🏛 Tasse (ced./forf.)</span>
                  <span style="color:#C0392B">−€${totTasse.toFixed(0)}</span>
                </div>
                ${totSpeseR>0?`<div style="display:flex;justify-content:space-between">
                  <span>🔧 Spese reali registrate</span>
                  <span style="color:#C0392B">−€${totSpeseR.toFixed(0)}</span>
                </div>`:''}
                <div style="display:flex;justify-content:space-between;border-top:1px solid var(--bdr);padding-top:4px;margin-top:2px;font-weight:700;font-size:12px">
                  <span>= Netto utile reale</span>
                  <span style="color:${totIncasso>=0?'#145C38':'#C0392B'}">€${totIncasso.toFixed(0)}</span>
                </div>
              </div>
            </div>
            ${speseRealiTotGlobal>0?`<div style="margin-top:8px;font-size:10px;color:var(--ink2);text-align:center;opacity:.7">Spese reali totali anno: €${speseRealiTotGlobal.toFixed(0)}</div>`:''}
          </div>`;
        })() : ''}

      </div>

      <!-- ── TABELLA PROPRIETÀ ── -->
      <div class="cf-table">
        ${totaleHtml}
        ${mammaHtml || gpHtml ? `<div class="cf-group-section">
          <div class="cf-group-section-lbl">👥 Riepilogo per titolare</div>
          ${mammaHtml}
          ${gpHtml}
        </div>` : ''}
        <div class="cf-group-section-lbl" style="margin-top:12px;margin-bottom:6px">📋 Classifica per netto utile</div>
        ${cardsHtml}
      </div>

      <!-- ── SPESE OPERATIVE (configurazione) ── -->
      <div style="margin-top:18px">
        <div class="spese-panel">
          <div class="spese-panel-title">💡 Spese Operative stimate</div>
          <div class="spese-panel-row">
            <div class="fp-group">
              <div class="fp-label">⚡ Luce</div>
              <div class="fp-row">
                <input class="fp-input" type="number" min="0" step="0.1"
                  value="${spese.luce}"
                  onchange="saveSpese({luce:parseFloat(this.value)||0});renderConfrontoView()">
                <span class="fp-note">€/gg×notti</span>
              </div>
            </div>
            <div class="spese-divider"></div>
            <div class="fp-group">
              <div class="fp-label">🎁 Welcome</div>
              <div class="fp-row">
                <input class="fp-input" type="number" min="0" step="0.5"
                  value="${spese.welcomePack}"
                  onchange="saveSpese({welcomePack:parseFloat(this.value)||0});renderConfrontoView()">
                <span class="fp-note">€/check-in</span>
              </div>
            </div>
            <div class="spese-divider"></div>
            <div class="fp-group">
              <div class="fp-label">🧹 Pulizie</div>
              <div class="fp-row">
                <input class="fp-input" type="number" min="0" step="1"
                  value="${spese.pulizie}"
                  onchange="saveSpese({pulizie:parseFloat(this.value)||0});renderConfrontoView()">
                <span class="fp-note">€/check-in</span>
              </div>
            </div>
            <div class="spese-divider"></div>
            <div class="fp-group">
              <div class="fp-label">👕 Lavanderia</div>
              <div class="fp-row">
                <input class="fp-input" type="number" min="0" step="1"
                  value="${spese.lavanderia}"
                  onchange="saveSpese({lavanderia:parseFloat(this.value)||0});renderConfrontoView()">
                <span class="fp-note">€/check-in</span>
              </div>
            </div>
            <div class="spese-divider"></div>
            <div class="fp-group">
              <div class="fp-label">🏙 Tassa Soggiorno</div>
              <div class="fp-row">
                <input class="fp-input" type="number" min="0" step="0.5"
                  value="${spese.tassaSoggiorno}"
                  onchange="saveSpese({tassaSoggiorno:parseFloat(this.value)||0});renderConfrontoView()">
                <span class="fp-note">€/notte OTA</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ── SPESE REALI REGISTRATE ── -->
      ${speseRealiPanel}

    </div>
  `);
}




/* ════════════════════════════════════════
   VISTA CERCA DISPONIBILITÀ
════════════════════════════════════════ */

/* ─── Tariffe stagionali per appartamento ─────────────────────────────────────
   Struttura: { propId: { bassa, media, alta, altissima } }
   Stagioni: bassa=Gen-Mar+Nov-Dic · media=Apr-Giu · alta=Lug+Set · altissima=Ago
──────────────────────────────────────────────────────────────────────────── */
const SK_TARIFFE = 'octo_tariffe_stagionali_v3';

function loadTariffe() {
  try { return JSON.parse(localStorage.getItem(SK_TARIFFE) || '{}'); } catch(e) { return {}; }
}
function saveTariffe(propId, stagione, val) {
  const all = loadTariffe();
  if (!all[propId]) all[propId] = {};
  all[propId][stagione] = parseFloat(val) || 0;
  const v = JSON.stringify(all);
  localStorage.setItem(SK_TARIFFE, v);
  try { DB.save(SK_TARIFFE, v); } catch(_) {}
}
function getTariffa(propId, stagione) {
  return parseFloat(loadTariffe()[propId]?.[stagione] || 0);
}
function getStagione(date) {
  const m = date.getMonth() + 1; // 1-12
  if (m === 8) return 'altissima';
  if (m === 7 || m === 9) return 'alta';
  if (m >= 4 && m <= 6) return 'media';
  return 'bassa'; // 1-3, 10-12... ma 10 è media-bassa, usiamo bassa per nov-dic-gen-mar
}
/* Calcola preventivo per un periodo: suddivide per settimane nelle stagioni */
function calcolaPreventivo(propId, ciDate, coDate) {
  const tariffe = loadTariffe()[propId] || {};
  const notti = Math.round((coDate - ciDate) / 86400000);
  if (!notti || notti <= 0) return null;

  // Conta notti per stagione
  const nottiPerStagione = { bassa: 0, media: 0, alta: 0, altissima: 0 };
  for (let d = new Date(ciDate); d < coDate; d.setDate(d.getDate() + 1)) {
    nottiPerStagione[getStagione(new Date(d))]++;
  }

  // Calcola importo: tariffa è settimanale, quindi prezzo/notte = tariffa/7
  let totale = 0;
  const righe = [];
  ['altissima','alta','media','bassa'].forEach(s => {
    const nn = nottiPerStagione[s];
    if (!nn) return;
    const tarSett = parseFloat(tariffe[s] || 0);
    const tarNotte = tarSett / 7;
    const importo = Math.round(tarNotte * nn);
    totale += importo;
    if (tarSett > 0) {
      const label = { altissima:'Agosto', alta:'Lug/Set', media:'Apr-Giu', bassa:'Bassa stagione' }[s];
      righe.push({ stagione: s, label, nn, tarSett, tarNotte: Math.round(tarNotte), importo });
    }
  });

  return { notti, totale, righe, hasAnyTariff: Object.values(tariffe).some(v => parseFloat(v) > 0) };
}

function renderCercaView() {
  document.getElementById('statsWrap').style.display = 'none';
  document.getElementById('resWrap').style.display   = 'none';
  document.getElementById('welcome').style.display   = 'none';
  { const ow = document.getElementById('occWidget'); if(ow) ow.style.display='none'; }
  const mp  = document.getElementById('manualPanelWrap');   if (mp)  mp.style.display  = 'none';
  const iw  = document.getElementById('incassoWidgetWrap'); if (iw)  iw.style.display  = 'none';
  const scI = document.getElementById('scIncassoCard');     if (scI) scI.style.display = 'none';

  const mainC = document.getElementById('mainC');
  const old   = document.getElementById('cercaView');
  if (old) old.remove();

  // Default: oggi → +7 giorni
  const today = new Date(); today.setHours(0,0,0,0);
  const plus7 = new Date(today); plus7.setDate(today.getDate() + 7);
  function toInput(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  mainC.insertAdjacentHTML('beforeend', `
    <div id="cercaView">
      <div class="res-hdr" style="margin-bottom:16px">
        <div class="res-title">🔍 Cerca Disponibilità</div>
        <div style="font-size:11px;color:var(--ink2);font-style:italic">Verifica liberi/occupati per tutte le proprietà</div>
      </div>

      <!-- Form ricerca -->
      <div style="background:var(--bg);border:1px solid var(--bdr);border-radius:14px;padding:20px 22px;margin-bottom:18px">
        <div style="display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end">
          <div>
            <div style="font-size:10px;font-weight:700;letter-spacing:.04em;color:var(--ink2);text-transform:uppercase;margin-bottom:6px">Check-in</div>
            <input type="date" id="cercaCI" value="${toInput(today)}"
              style="border:1.5px solid var(--bdr);border-radius:8px;padding:8px 12px;font-size:13px;background:var(--bg);color:var(--ink);font-family:inherit;outline:none"
              oninput="updateCercaNights()">
          </div>
          <div style="padding-bottom:10px;font-size:18px;opacity:.25;user-select:none">→</div>
          <div>
            <div style="font-size:10px;font-weight:700;letter-spacing:.04em;color:var(--ink2);text-transform:uppercase;margin-bottom:6px">Check-out</div>
            <input type="date" id="cercaCO" value="${toInput(plus7)}"
              style="border:1.5px solid var(--bdr);border-radius:8px;padding:8px 12px;font-size:13px;background:var(--bg);color:var(--ink);font-family:inherit;outline:none"
              oninput="updateCercaNights()">
          </div>
          <div style="padding-bottom:8px">
            <div style="font-size:10px;font-weight:700;letter-spacing:.04em;color:var(--ink2);text-transform:uppercase;margin-bottom:6px">Notti</div>
            <div id="cercaNightsLbl" style="font-size:20px;font-weight:700;color:var(--acc);min-width:36px;line-height:1;padding:6px 0">7</div>
          </div>
          <div style="padding-bottom:6px;margin-left:4px">
            <button onclick="runCercaSearch()"
              style="background:var(--acc);color:#fff;border:none;border-radius:8px;padding:10px 22px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:.01em">
              🔍 Cerca
            </button>
          </div>
        </div>
      </div>

      <!-- Risultati -->
      <div id="cercaResults">
        <div style="font-size:12px;color:var(--ink2);opacity:.4;padding:10px 0">Premi "Cerca" per vedere le disponibilità.</div>
      </div>

      <!-- Tariffe stagionali -->
      <div style="margin-top:24px;background:var(--bg);border:1px solid var(--bdr);border-radius:14px;padding:20px 22px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
          <div style="font-size:14px;font-weight:700;color:var(--ink)">🏷 Tariffe stagionali settimanali</div>
          <div style="font-size:10px;color:var(--ink2)">€/settimana · usate per il preventivo</div>
        </div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;min-width:480px;font-size:11px">
            <thead>
              <tr style="background:var(--bg2)">
                <th style="padding:6px 10px;text-align:left;color:var(--ink2);font-weight:700">Appartamento</th>
                <th style="padding:6px 8px;text-align:right;color:#4E9AF1;font-weight:700" title="Gen-Mar · Nov-Dic">🔵 Bassa</th>
                <th style="padding:6px 8px;text-align:right;color:#56C28A;font-weight:700" title="Apr-Giu">🟢 Media</th>
                <th style="padding:6px 8px;text-align:right;color:#F2A93B;font-weight:700" title="Lug · Set">🟡 Alta</th>
                <th style="padding:6px 8px;text-align:right;color:#E05C7A;font-weight:700" title="Agosto">🔴 Altissima</th>
              </tr>
            </thead>
            <tbody id="tariffeTableBody">
              ${_buildTariffeRows()}
            </tbody>
          </table>
        </div>
        <div style="font-size:10px;color:var(--ink2);margin-top:8px;opacity:.6">
          Bassa: Gen-Mar · Nov-Dic &nbsp;·&nbsp; Media: Apr-Giu &nbsp;·&nbsp; Alta: Lug · Set &nbsp;·&nbsp; Altissima: Agosto
        </div>
      </div>
    </div>
  `);

  // Esegui subito la ricerca coi default
  runCercaSearch();
}

function _buildTariffeRows() {
  const realProps = PROPERTIES.filter(p => !p.adminView && !p.confrontoView && !p.cercaView && !p.graficiView && !p.speseView);
  return realProps.map(prop => {
    const t = loadTariffe()[prop.id] || {};
    return `<tr style="border-bottom:1px solid var(--bdr)">
      <td style="padding:6px 10px;font-weight:600;color:var(--ink)">${prop.icon} ${prop.name}</td>
      ${['bassa','media','alta','altissima'].map(s => `
      <td style="padding:5px 6px;text-align:right">
        <input type="number" min="0" step="50" value="${parseFloat(t[s]||0)||''}"
          placeholder="0"
          oninput="saveTariffe('${prop.id}','${s}',this.value);runCercaSearch()"
          style="width:72px;text-align:right;border:1px solid var(--bdr);border-radius:6px;padding:4px 6px;font-size:11px;background:var(--bg);color:var(--ink);font-family:inherit">
      </td>`).join('')}
    </tr>`;
  }).join('');
}

/* ─── Aggiorna contatore notti nel form ─────────────────────────────── */
function updateCercaNights() {
  const ci = document.getElementById('cercaCI')?.value;
  const co = document.getElementById('cercaCO')?.value;
  if (!ci || !co) return;
  const nights = Math.round((new Date(co) - new Date(ci)) / 86400000);
  const el = document.getElementById('cercaNightsLbl');
  if (el) el.textContent = nights > 0 ? nights : '—';
  if (el) el.style.color = nights > 0 ? 'var(--acc)' : '#C0392B';
}

/* ─── Legge tutte le prenotazioni di una proprietà da localStorage ─────── */
function cercaGetBooks(propId) {
  let live = [], past = {}, manual = [];
  try { live   = JSON.parse(localStorage.getItem(`octo_live_${propId}_v3`)   || '[]'); } catch(e) {}
  try { past   = JSON.parse(localStorage.getItem(`octo_past_${propId}_v3`)   || '{}'); } catch(e) {}
  try { manual = JSON.parse(localStorage.getItem(`octo_manual_${propId}_v3`) || '[]'); } catch(e) {}

  const hasCalData = live.length > 0 || Object.keys(past).length > 0;
  const books = [];
  const seen  = new Set();

  // Live books (dates stored as timestamps via serBook)
  live.forEach(b => {
    if (b.source === 'blocked' || !b.checkin || !b.checkout) return;
    seen.add(b.uid);
    books.push({
      uid:     b.uid,
      nome:    b.nome || '—',
      checkin:  new Date(b.checkin),
      checkout: new Date(b.checkout),
      checkin_str:  b.checkin_str  || '',
      checkout_str: b.checkout_str || '',
      source:  b.source || 'other',
    });
  });

  // Past cache (same serialization)
  Object.values(past).forEach(b => {
    if (seen.has(b.uid) || b.source === 'blocked' || !b.checkin || !b.checkout) return;
    seen.add(b.uid);
    books.push({
      uid:     b.uid,
      nome:    b.nome || '—',
      checkin:  new Date(b.checkin),
      checkout: new Date(b.checkout),
      checkin_str:  b.checkin_str  || '',
      checkout_str: b.checkout_str || '',
      source:  b.source || 'other',
    });
  });

  // Manual entries
  manual.forEach(m => {
    if (seen.has(m.uid) || !m.checkin || !m.checkout) return;
    seen.add(m.uid);
    const ci = new Date(m.checkin), co = new Date(m.checkout);
    books.push({
      uid:     m.uid,
      nome:    m.nome || '—',
      checkin:  ci,
      checkout: co,
      checkin_str:  fmtDate(ci),
      checkout_str: fmtDate(co),
      source:  'manual',
    });
  });

  return { books, hasCalData };
}

/* ─── Esegui la ricerca e mostra i risultati ─────────────────────────────── */
function runCercaSearch() {
  const ciVal = document.getElementById('cercaCI')?.value;
  const coVal = document.getElementById('cercaCO')?.value;
  const results = document.getElementById('cercaResults');
  if (!results) return;

  if (!ciVal || !coVal) {
    results.innerHTML = '<div style="font-size:12px;color:var(--ink2);opacity:.4;padding:10px 0">Inserisci le date per cercare.</div>';
    return;
  }

  const ciDate = new Date(ciVal); ciDate.setHours(0,0,0,0);
  const coDate = new Date(coVal); coDate.setHours(0,0,0,0);

  if (coDate <= ciDate) {
    results.innerHTML = '<div style="color:#C0392B;font-size:12px;padding:12px 0">⚠ Il check-out deve essere successivo al check-in.</div>';
    return;
  }

  updateCercaNights();

  const realProps = PROPERTIES.filter(p => !p.adminView && !p.confrontoView && !p.cercaView && !p.graficiView && !p.speseView);

  // Calcola disponibilità per ogni appartamento
  const propResults = realProps.map(prop => {
    const { books, hasCalData } = cercaGetBooks(prop.id);
    // Overlap: prenotazione inizia prima del nostro checkout E finisce dopo il nostro checkin
    // (back-to-back non è conflitto: checkout == nostro checkin → ok)
    const conflicts = books.filter(b => b.checkin < coDate && b.checkout > ciDate);
    return { prop, conflicts, hasCalData };
  });

  const freeCount    = propResults.filter(r => r.hasCalData && r.conflicts.length === 0).length;
  const occupiedCount= propResults.filter(r => r.hasCalData && r.conflicts.length > 0).length;
  const noDataCount  = propResults.filter(r => !r.hasCalData).length;

  // Sommario
  const summaryHtml = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:14px;font-size:12px">
      <span style="background:#E8F7EE;color:#145C38;border:1px solid #A8D5B5;border-radius:20px;padding:4px 12px;font-weight:700">
        ✓ ${freeCount} libero${freeCount !== 1 ? 'i' : ''}
      </span>
      ${occupiedCount > 0 ? `<span style="background:#FDEEEE;color:#C0392B;border:1px solid #F5B8B8;border-radius:20px;padding:4px 12px;font-weight:700">
        ✗ ${occupiedCount} occupato${occupiedCount !== 1 ? 'i' : ''}
      </span>` : ''}
      ${noDataCount > 0 ? `<span style="background:var(--bg2,#F5F5F2);color:var(--ink2);border:1px solid var(--bdr);border-radius:20px;padding:4px 12px;opacity:.6">
        ${noDataCount} senza dati
      </span>` : ''}
    </div>`;

  // Ordina: liberi → occupati → senza dati
  propResults.sort((a, b) => {
    const rank = r => !r.hasCalData ? 2 : r.conflicts.length === 0 ? 0 : 1;
    return rank(a) - rank(b);
  });

  // Cards
  const cardsHtml = propResults.map(({ prop, conflicts, hasCalData }) => {
    if (!hasCalData) {
      return `
        <div style="background:var(--bg);border:1.5px solid var(--bdr);border-radius:10px;padding:13px 16px;display:flex;align-items:center;gap:12px;opacity:.55">
          <div style="font-size:22px;min-width:28px;text-align:center">${prop.icon}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:700;color:var(--ink)">${prop.name}</div>
            <div style="font-size:11px;color:var(--ink2);margin-top:2px">Nessun calendario caricato</div>
          </div>
          <div style="font-size:11px;color:var(--ink2);white-space:nowrap">— n.d.</div>
        </div>`;
    }

    const isAvail = conflicts.length === 0;
    const borderColor = isAvail ? '#A8D5B5' : '#F5B8B8';
    const bgColor     = isAvail ? '#F5FBF7' : '#FDF5F5';

    let conflictDetail = '';
    if (!isAvail) {
      conflictDetail = conflicts.map(b => {
        const ci = b.checkin_str || fmtDate(b.checkin);
        const co = b.checkout_str || fmtDate(b.checkout);
        return `<div style="font-size:10px;color:#C0392B;margin-top:3px;opacity:.8">
          ${esc(b.nome)} &nbsp;·&nbsp; ${ci} → ${co}
        </div>`;
      }).join('');
    }

    // Preventivo per gli appartamenti liberi
    let preventivoHtml = '';
    if (isAvail) {
      const prev = calcolaPreventivo(prop.id, ciDate, coDate);
      if (prev && prev.hasAnyTariff && prev.totale > 0) {
        const righeHtml = prev.righe.map(r =>
          `<span style="font-size:10px;color:var(--ink2)">${r.label}: ${r.nn}n × €${r.tarNotte}/n = <b>€${r.importo}</b></span>`
        ).join(' &nbsp;·&nbsp; ');
        preventivoHtml = `
          <div style="margin-top:8px;padding:8px 10px;background:rgba(86,194,138,.1);border-radius:7px;border:1px solid rgba(86,194,138,.3)">
            <div style="font-size:13px;font-weight:700;color:#145C38">Preventivo: €${prev.totale.toLocaleString('it-IT')} <span style="font-size:10px;font-weight:400;color:var(--ink2)">(${prev.notti} notti)</span></div>
            <div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">${righeHtml}</div>
          </div>`;
      }
    }

    const badgeHtml = isAvail
      ? `<div style="background:#00C853;color:#fff;border-radius:8px;padding:5px 14px;font-size:12px;font-weight:700;white-space:nowrap;flex-shrink:0;box-shadow:0 2px 8px rgba(0,200,83,.4)">✓ LIBERO</div>`
      : `<div style="background:#FDEEEE;color:#C0392B;border:1px solid #F5B8B8;border-radius:8px;padding:5px 14px;font-size:12px;font-weight:700;white-space:nowrap;flex-shrink:0">✗ Occupato</div>`;

    return `
      <div style="background:${bgColor};border:1.5px solid ${borderColor};border-radius:10px;padding:13px 16px;display:flex;align-items:flex-start;gap:12px">
        <div style="font-size:22px;min-width:28px;text-align:center;padding-top:1px">${prop.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:var(--ink)">${prop.name}</div>
          ${isAvail
            ? `<div style="font-size:11px;color:#145C38;margin-top:2px">Disponibile per tutto il periodo</div>`
            : `<div style="font-size:11px;color:#C0392B;margin-top:2px">${conflicts.length} prenotazione${conflicts.length > 1 ? 'i' : ''} in conflitto</div>`
          }
          ${conflictDetail}
          ${preventivoHtml}
        </div>
        <div style="padding-top:1px">${badgeHtml}</div>
      </div>`;
  }).join('');

  results.innerHTML = summaryHtml
    + `<div style="display:flex;flex-direction:column;gap:7px">${cardsHtml}</div>`
    + _buildCercaCalendar(ciDate, coDate, propResults);
}

/* ── Mini-calendario cerca: ±7gg, tutti gli appartamenti ─────────────── */
function _buildCercaCalendar(ciDate, coDate, propResults) {
  const CAL_COLORS = {
    attico:'#F48FB1', montenero:'#FF9800', stoccolma:'#42A5F5',
    frescura:'#66BB6A', villa:'#AB47BC', corso:'#90A4AE',
    anfiteatro:'#EF5350', scaro:'#FFE57F',
  };
  // Ordine fisso appartamenti
  const PROP_ORDER = ['attico','montenero','stoccolma','frescura','villa','corso','anfiteatro','scaro'];

  // Finestra: SOLO ±7 giorni dal periodo cercato
  const winStart = new Date(ciDate); winStart.setDate(winStart.getDate() - 7);
  const winEnd   = new Date(coDate); winEnd.setDate(winEnd.getDate() + 7);
  const today    = new Date(); today.setHours(0,0,0,0);

  // Appartamenti con dati, in ordine fisso
  const validProps = PROP_ORDER
    .map(id => propResults.find(r => r.prop.id === id))
    .filter(r => r && r.hasCalData);
  const freeIds = new Set(propResults.filter(r => r.hasCalData && r.conflicts.length === 0).map(r => r.prop.id));

  // Prenotazioni per ogni prop
  const propBooks = {};
  validProps.forEach(({prop}) => {
    const { books } = cercaGetBooks(prop.id);
    propBooks[prop.id] = books;
  });

  const isOcc      = (pid, d) => (propBooks[pid]||[]).some(b => d >= b.checkin && d < b.checkout);
  const isInPeriod = d => d >= ciDate && d < coDate;

  const MONTHS_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  const DAYS_IT   = ['Lu','Ma','Me','Gi','Ve','Sa','Do'];

  // Mesi da coprire (solo quelli nel range ±7gg)
  const months = [];
  let cur = new Date(winStart.getFullYear(), winStart.getMonth(), 1);
  const endMonth = new Date(winEnd.getFullYear(), winEnd.getMonth(), 1);
  while (cur <= endMonth) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() });
    cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
  }

  // Legenda: stesso ordine fisso, liberi con ✓ verde
  const legendHTML = validProps.map(({prop}) => {
    const isFree = freeIds.has(prop.id);
    const col = CAL_COLORS[prop.id] || '#999';
    const ring = isFree ? `box-shadow:0 0 0 2px #00C853;` : '';
    const label = isFree
      ? `<b style="color:#00C853">✓</b> ${prop.icon} ${prop.name}`
      : `${prop.icon} ${prop.name}`;
    return `<div style="display:flex;align-items:center;gap:5px;white-space:nowrap">
      <span style="width:14px;height:10px;border-radius:2px;background:${col};${ring}display:inline-block;flex-shrink:0"></span>
      <span style="font-size:11px;color:var(--ink)">${label}</span>
    </div>`;
  }).join('');

  const monthBlocks = months.map(({year, month}) => {
    const daysInM  = new Date(year, month+1, 0).getDate();
    const startDow = (new Date(year, month, 1).getDay()+6)%7;
    const empties  = Array(startDow).fill('<div class="cal-cell cal-empty"></div>').join('');
    let cells = '';

    for (let d=1; d<=daysInM; d++) {
      const dt = new Date(year, month, d); dt.setHours(0,0,0,0);
      // Salta giorni fuori dalla finestra ±7gg
      if (dt < winStart || dt > winEnd) {
        cells += '<div class="cal-cell cal-empty" style="opacity:0;pointer-events:none"></div>';
        continue;
      }
      const inP  = isInPeriod(dt);
      const isCI = dt.getTime() === ciDate.getTime();
      const isCO = dt.getTime() === coDate.getTime();
      const isT  = dt.getTime() === today.getTime();
      const isW  = dt.getDay()===0||dt.getDay()===6;

      // Barre in ordine fisso
      const bars = validProps.map(({prop}) => {
        const occ = isOcc(prop.id, dt);
        const col = CAL_COLORS[prop.id] || '#999';

        if (occ) {
          // Occupato: colore pieno al 50%
          const opacity = inP ? '0.5' : '0.5';
          return `<div style="height:5px;background:${col};border-radius:0;margin:0 -3px 1px;opacity:${opacity}" title="${prop.name}: occupato"></div>`;
        } else if (inP && freeIds.has(prop.id)) {
          // Libero nel periodo cercato: colore con contorno verde
          return `<div style="height:5px;background:${col};border-radius:0;margin:0 -3px 1px;box-shadow:0 0 0 1.5px #00C853" title="${prop.name}: LIBERO ✓"></div>`;
        } else {
          // Libero: vuoto (nessun colore)
          return `<div style="height:5px;margin:0 -3px 1px" title="${prop.name}: libero"></div>`;
        }
      }).join('');

      const bg     = inP ? 'rgba(0,200,83,.06)' : '';
      const border = isCI ? 'border-left:2.5px solid #00C853;' : isCO ? 'border-left:2.5px solid #F2A93B;' : '';
      const dnCol  = isCI ? 'color:#00C853;' : isCO ? 'color:#F2A93B;' : isT ? 'color:var(--acc);' : '';
      const dnW    = (isCI||isCO||isT) ? 'font-weight:700;' : '';

      cells += `<div class="cal-cell${isT?' cal-today':''}${isW?' cal-weekend':''}"
        style="${bg?'background:'+bg+';':''}${border}">
        <div class="cal-day-num" style="${dnCol}${dnW}font-size:10px">${d}</div>
        <div class="cal-bars">${bars}</div>
      </div>`;
    }

    return `<div class="cal-month-block">
      <div class="cal-month-hdr">
        <span class="cal-month-name">${MONTHS_IT[month]} ${year}</span>
      </div>
      <div class="cal-grid">
        ${DAYS_IT.map(d=>`<div class="cal-dow">${d}</div>`).join('')}
        ${empties}${cells}
      </div>
    </div>`;
  }).join('');

  const cols = Math.min(months.length, 3);
  return `<div style="margin-top:20px">
    <div style="font-size:13px;font-weight:700;color:var(--ink);margin-bottom:10px">
      📅 Disponibilità
      <span style="font-size:10px;font-weight:400;color:var(--ink2);margin-left:6px">
        ${winStart.toLocaleDateString('it-IT',{day:'2-digit',month:'short'})} →
        ${winEnd.toLocaleDateString('it-IT',{day:'2-digit',month:'short'})}
      </span>
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;
      background:var(--surf);border:1px solid var(--bdr);border-radius:8px;padding:8px 14px">
      ${legendHTML}
      <div style="margin-left:auto;font-size:9px;color:var(--ink2);align-self:center">
        pieno = occupato · <span style="color:#00C853;font-weight:700">contorno verde</span> = libero nel periodo
      </div>
    </div>
    <div class="cal-year-grid" style="grid-template-columns:repeat(${cols},1fr)">${monthBlocks}</div>
  </div>`;
}


/* ════════════════════════════════════════════════════════════════════
   CALENDARIO OCCUPAZIONE — vista mensile multi-appartamento
════════════════════════════════════════════════════════════════════ */
function renderCalendarioView() {
  document.getElementById('statsWrap').style.display   = 'none';
  document.getElementById('resWrap').style.display     = 'none';
  document.getElementById('welcome').style.display     = 'none';
  ['adminView','confrontoView','cercaView','graficiView','speseView','calendarioView'].forEach(id =>
    document.getElementById(id)?.remove()
  );
  ['manualPanelWrap','incassoWidgetWrap','scIncassoCard','speseRealiWidgetWrap','nextYearPanelWrap'].forEach(id => {
    const el = document.getElementById(id); if(el) el.style.display='none';
  });

  const mainC     = document.getElementById('mainC');
  const realProps = PROPERTIES.filter(p =>
    !p.adminView && !p.confrontoView && !p.cercaView &&
    !p.graficiView && !p.speseView && !p.calendarioView
  );
  const year  = viewYear;
  const today = new Date(); today.setHours(0,0,0,0);

  const COLORS = {
    attico:'#F48FB1', montenero:'#FF9800', stoccolma:'#42A5F5',
    frescura:'#66BB6A', villa:'#AB47BC', corso:'#90A4AE',
    anfiteatro:'#EF5350', scaro:'#FFE57F',
  };

  // Load bookings using direct localStorage keys (year-aware)
  const propBooks = {};
  realProps.forEach(prop => {
    const books = []; const seen = new Set();
    const addB = b => {
      if (!b || seen.has(b.uid) || b.source==='blocked' || !b.checkin || !b.checkout) return;
      const ci = new Date(b.checkin); ci.setHours(0,0,0,0);
      const co = new Date(b.checkout); co.setHours(0,0,0,0);
      if (isNaN(ci)||isNaN(co)||co<=ci) return;
      if (co.getFullYear()>=year && ci.getFullYear()<=year) {
        seen.add(b.uid);
        books.push({ nome:b.nome||'—', checkin:ci, checkout:co });
      }
    };
    const lk = viewingArchive?`octo_arch_${year}_live_${prop.id}_v3`:`octo_live_${prop.id}_v3`;
    const pk = viewingArchive?`octo_arch_${year}_past_${prop.id}_v3`:`octo_past_${prop.id}_v3`;
    const mk = viewingArchive?`octo_arch_${year}_manual_${prop.id}_v3`:`octo_manual_${prop.id}_v3`;
    try { (JSON.parse(localStorage.getItem(lk)||'[]')).forEach(addB); } catch(e){}
    try { Object.values(JSON.parse(localStorage.getItem(pk)||'{}')).forEach(addB); } catch(e){}
    try { (JSON.parse(localStorage.getItem(mk)||'[]')).forEach(m => {
      if(seen.has(m.uid)||!m.checkin||!m.checkout) return;
      seen.add(m.uid);
      const ci=new Date(m.checkin);ci.setHours(0,0,0,0);
      const co=new Date(m.checkout);co.setHours(0,0,0,0);
      if(!isNaN(ci)&&!isNaN(co)&&co>ci&&co.getFullYear()>=year&&ci.getFullYear()<=year)
        books.push({nome:m.nome||'—',checkin:ci,checkout:co});
    }); } catch(e){}
    propBooks[prop.id] = books;
  });

  const isOcc  = (pid,d) => (propBooks[pid]||[]).some(b=>d>=b.checkin&&d<b.checkout);
  const getGuest=(pid,d)=>{ const b=(propBooks[pid]||[]).find(b=>d>=b.checkin&&d<b.checkout); return b?b.nome:''; };

  const MONTHS_IT=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  const DAYS_IT=['Lu','Ma','Me','Gi','Ve','Sa','Do'];

  const legendHTML = realProps.map(p=>
    `<div style="display:flex;align-items:center;gap:5px;white-space:nowrap">
      <span style="width:16px;height:10px;border-radius:2px;background:${COLORS[p.id]||'#999'};display:inline-block;flex-shrink:0"></span>
      <span style="font-size:11px;color:var(--ink)">${p.icon} ${p.name}</span>
    </div>`
  ).join('');

  const monthsHTML = MONTHS_IT.map((mName,mi) => {
    const daysInM  = new Date(year,mi+1,0).getDate();
    const startDow = (new Date(year,mi,1).getDay()+6)%7;
    let occN=0;
    const empties = Array(startDow).fill('<div class="cal-cell cal-empty"></div>').join('');
    let cells='';
    for(let d=1;d<=daysInM;d++){
      const dt=new Date(year,mi,d); dt.setHours(0,0,0,0);
      const isT=dt.getTime()===today.getTime();
      const isW=dt.getDay()===0||dt.getDay()===6;
      const bars=realProps.map(p=>{
        const occ=isOcc(p.id,dt);
        if(occ) occN++;
        const col=COLORS[p.id]||'#999';
        const tip=occ?`${p.name}: ${getGuest(p.id,dt)}`:`${p.name} libero`;
        return `<div class="cal-bar${occ?' cal-bar-occ':''}" style="${occ?'background:'+col+';':''}" title="${tip}"></div>`;
      }).join('');
      const nF=realProps.filter(p=>!isOcc(p.id,dt)).length;
      const fc=nF===0?'#E05C7A':nF===realProps.length?'#2AAF6A':'#F2A93B';
      cells+=`<div class="cal-cell${isT?' cal-today':''}${isW?' cal-weekend':''}">
        <div class="cal-day-num"${isT?' style="color:var(--acc);font-weight:700"':''}>${d}</div>
        <div class="cal-free-lbl" style="color:${fc}">${nF>0?nF+'l':'●'}</div>
        <div class="cal-bars">${bars}</div>
      </div>`;
    }
    const pct=Math.round(occN/(daysInM*realProps.length)*100);
    const pc=pct>=80?'#E05C7A':pct>=50?'#F2A93B':'#2AAF6A';
    return `<div class="cal-month-block">
      <div class="cal-month-hdr">
        <span class="cal-month-name">${mName} ${year}</span>
        <span style="font-size:10px;font-weight:700;color:${pc}">${pct}% occ.</span>
      </div>
      <div class="cal-grid">${DAYS_IT.map(d=>`<div class="cal-dow">${d}</div>`).join('')}${empties}${cells}</div>
    </div>`;
  }).join('');

  mainC.insertAdjacentHTML('beforeend',`
    <div id="calendarioView">
      <div class="res-hdr" style="margin-bottom:14px">
        <div class="res-title">📅 Calendario ${year}</div>
        <button class="btn btn-gh btn-sm" onclick="renderCalendarioView()">↺ Aggiorna</button>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px;background:var(--surf);border:1px solid var(--bdr);border-radius:10px;padding:10px 16px">${legendHTML}</div>
      <div class="cal-year-grid">${monthsHTML}</div>
    </div>`);
}
