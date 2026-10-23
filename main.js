// ===== Main: wiring, refresh loop, settings, sign-in =====
let lastRefresh=0;
function refreshAll(){
  lastRefresh=Date.now(); const cond=conditions();
  renderVerdict(cond); renderTiles($('dCond'), cond);
  const sig=liveSignal(); S.signal=sig; renderDashSignal(sig, cond); renderSignalPage(sig, cond);
  renderMtf(cond.mtf); renderLevels(); renderImMini(); renderIntermarket(); renderEventsMini(); renderSessions($('dSessions')); renderPlanMini(); renderHero(); drawSpark();
  if(ANA.ready && !$('anaWrap').hidden) anaDraw(false);
  if(S.live && cfg.liveSignals && sig?.state==='signal' && Date.now()/1000-sig.bar<1800){ const g=grade(sig,cond);
    if(g!=='Skip' && !S.sigSeen.has(sig.bar+sig.side)){ S.sigHist.unshift({t:sig.bar, side:sig.side, g}); alertOnce(S.sigSeen, sig.bar+sig.side, `LIVE SIGNAL: ${sig.side==='buy'?'Buy':'Sell'} gold, grade ${g}. Entry about ${f2(sig.entry)}, SL ${f2(sig.sl)}, TP ${f2(sig.tp)}. Check the chart first.`); } }
  if(S.live && cond.news.ev){ const e=cond.news.ev, mins=Math.max(0,Math.round((e.t-Date.now())/60e3));
    alertOnce(S.newsSeen, e.t+e.event, S.mon.phase==='in' ? `NEWS in ${mins} min: ${e.event}. Consider closing or moving your stop to entry.` : `NEWS in ${mins} min: ${e.event}. No new entries until it passes.`); } }
DATA_HOOKS.push(refreshAll);
TICK_HOOKS.push(renderHero, anaTick, p=>watchPlan(p), p=>checkPriceAlerts(p), ()=>{ if(Date.now()-lastRefresh>10e3) refreshAll(); });
LIVE_HOOKS.push(on=>{ const b=$('liveBtn'); b.classList.toggle('btn-primary', !on); b.classList.toggle('is-live', on); b.innerHTML=`<svg><use href="#i-${on?'stop':'play'}"/></svg><span>${on?'Stop live':'Start live'}</span>`; });
IMG_HOOKS.push(renderThumbs);
Object.assign(AI_HOOKS, {cards:renderCards, say, final:renderFinal, pics:renderPics,
  status:(t,busy)=>{ $('anStatus').textContent=t; $('analyzeBtn').disabled=busy; $('imgOnlyBtn').disabled=busy; }});

// ----- settings -----
function loadForm(){ FIELDS.forEach(k=>{ const e=$(k); if(!e) return; if(e.type==='checkbox') e.checked=!!cfg[k]; else e.value=cfg[k]; }); showCredits(); }
function readForm(){ FIELDS.forEach(k=>{ const e=$(k); if(!e) return; cfg[k] = e.type==='checkbox' ? e.checked : (e.type==='number' || k==='pollSec') ? Number(e.value) : e.value.trim(); }); }
function saveSettings(){ const before={feedMode:cfg.feedMode, pollSec:cfg.pollSec, symbol:cfg.symbol, tv:cfg.tvSymbol}; readForm(); LS.set(CFG_KEY, cfg); applyTheme(); showCredits(); toast('Settings saved.');
  if(before.tv!==cfg.tvSymbol) Object.keys(TV_STATE).forEach(id=>delete TV_STATE[id]);
  if(S.live && (before.feedMode!==cfg.feedMode || before.pollSec!==cfg.pollSec || before.symbol!==cfg.symbol)){ if(before.symbol!==cfg.symbol){ S.candles={}; } stopLive(); startLive(); } else refreshAll(); }

// ----- chart page -----
let chartMode=LS.get('goldAiDesk.chartMode','tv');
function setChartMode(m){ chartMode=m; LS.set('goldAiDesk.chartMode', m);
  $$('[data-chartmode]').forEach(b=>b.setAttribute('aria-selected', b.dataset.chartmode===m?'true':'false'));
  $('tvAdvWrap').hidden=m!=='tv'; $('anaWrap').hidden=m!=='ana'; $('anaTools').hidden=m!=='ana';
  if(m==='tv') tvEnsure('tvAdv'); else { anaInit(); if(anaBars()?.length) anaDraw(true); else { $('ohlc').textContent='Start live to load the analysis chart.'; } } }

// ----- wiring -----
function wire(){
  $('liveBtn').onclick=()=> S.live ? stopLive() : startLive();
  $('themeBtn').onclick=toggleTheme; $('topChip').onclick=()=>{ location.hash='dash'; };
  $('moreBtn').onclick=()=>{ const s=$('moreSheet'); s.hidden=!s.hidden; $('moreBtn').setAttribute('aria-expanded', String(!s.hidden)); };
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') $('moreSheet').hidden=true; });
  $('saveBtn').onclick=saveSettings; $('clearKeys').onclick=()=>{ ['kClaude','kGemini','kDeepseek','kTwelve'].forEach(k=>$(k).value=''); saveSettings(); };
  $('resetData').onclick=()=>{ if(!confirm('Delete all journal trades and price alerts on this device?')) return; S.journal=[]; S.priceAlerts=[]; LS.del('goldAiDesk.journal'); LS.del('goldAiDesk.alerts'); renderJournal(); renderPA(); toast('Journal and alerts cleared.'); };
  ['feedMode','pollSec','marketSyms'].forEach(id=>$(id).addEventListener('change', ()=>{ readForm(); showCredits(); }));
  $$('[data-chartmode]').forEach(b=>b.onclick=()=>setChartMode(b.dataset.chartmode));
  $('anaTf').value=ANA.tf; $('anaTf').onchange=e=>{ ANA.tf=e.target.value; anaDraw(true); }; renderOverlayChips();
  $('enteredBtn').onclick=entered; $('closedBtn').onclick=resetPlan; $('exitBtn').onclick=recordExit; $('clearLog').onclick=()=>{ $('log').innerHTML='<div class="muted">Alerts will appear here.</div>'; };
  $('paForm').onsubmit=e=>{ e.preventDefault(); const p=Number($('paPrice').value); if(!p) return; S.priceAlerts.push({id:Date.now(), dir:$('paDir').value, price:p, note:$('paNote').value.trim(), done:false});
    LS.set('goldAiDesk.alerts', S.priceAlerts); $('paPrice').value=''; $('paNote').value=''; renderPA(); toast(S.live?'Price alert added.':'Price alert added. It works while live is on.'); };
  $('briefBtn').onclick=async()=>{ const b=$('briefBtn'); b.disabled=true; $('briefStatus').textContent='Searching the web…';
    try{ if(await runBrief()){ renderBrief(); refreshAll(); $('briefStatus').textContent=`Done by ${S.brief.by} at ${nowKH()}`; } else $('briefStatus').textContent=''; }
    catch(e){ $('briefStatus').textContent='Brief failed: '+errMsg(e); } finally{ b.disabled=false; } };
  $('analyzeBtn').onclick=runTeamUI; $('imgOnlyBtn').onclick=runPictures;
  const drop=$('drop'); ['dragenter','dragover'].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev, e=>{ e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e=>addImages(e.dataTransfer.files)); $('imgInput').onchange=e=>{ addImages(e.target.files); e.target.value=''; };
  document.addEventListener('paste', e=>{ const files=[...(e.clipboardData?.items||[])].filter(i=>i.kind==='file' && i.type.startsWith('image/')).map(i=>i.getAsFile()); if(!files.length) return;
    e.preventDefault(); addImages(files).then(()=>{ toast(files.length>1?'Pictures added to the AI desk.':'Picture added to the AI desk.'); if(S.view!=='ai') location.hash='ai'; }); });
  $('dxForm').onsubmit=e=>{ e.preventDefault(); dxLoad(); }; $$('#dxQuick [data-q]').forEach(b=>b.onclick=()=>{ quickRange(b.dataset.q); dxLoad(); });
  ['dxSearch','dxFVal'].forEach(id=>$(id).addEventListener('input', ()=>{ if(DXS.rows.length){ DXS.shown=200; dxApply(); } })); $('dxFType').onchange=()=>{ if(DXS.rows.length) dxApply(); };
  $('dxMore').onclick=()=>{ DXS.shown+=300; dxTable(); }; $('dxCsv').onclick=dxCsv; $('heatBtn').onclick=heatLoad;
  $('btForm').onsubmit=e=>{ e.preventDefault(); btRun(); };
  $('jForm').onsubmit=e=>{ e.preventDefault(); addJournal({at:fromLocalInput($('jDate').value), side:$('jSide').value, entry:+$('jEntry').value, sl:+$('jSl').value||null, tp:+$('jTp').value||null, exit:+$('jExit').value, lot:+$('jLot').value||0.01, src:$('jSrc').value, note:$('jNote').value.trim()});
    e.target.reset(); $('jLot').value=cfg.lot; $('jDate').value=toLocalInput(Date.now()); toast('Trade saved.'); };
  $('jCsv').onclick=journalCsv;
  $$('#psForm input').forEach(i=>i.addEventListener('input', calcPS)); $$('#plForm input, #plForm select').forEach(i=>i.addEventListener('input', calcPL));
}
Object.assign(VIEW_HOOKS, {
  chart:()=>setChartMode(chartMode),
  signals:()=>{ tvEnsure('tvGauge'); renderPA(); },
  markets:()=>{ renderIntermarket(); tvEnsure('tvGlobal'); tvEnsure('tvHeat'); },
  economy:()=>{ renderBrief(); tvEnsure('tvCal'); tvEnsure('tvNews'); },
  data:()=>{ if(!$('dxFrom').value) quickRange('today'); },
  journal:()=>{ if(!$('jDate').value) $('jDate').value=toLocalInput(Date.now()); renderJournal(); },
  tools:()=>{ if(!$('psBal').value){ $('psBal').value=cfg.balance; $('psRisk').value=cfg.riskPct; } if(S.price && !$('psEntry').value){ $('psEntry').value=S.price.toFixed(2); $('plOpen').value=S.price.toFixed(2); } calcPS(); calcPL(); renderToolSessions(); },
  settings:()=>{ loadForm(); } });

// ----- Google sign-in -----
const AUTHC = window.AUTH || {clientId:'', allowedEmails:[]};
const SESSION_KEY='goldAiDesk.session', SESSION_HOURS=12;
const authReady = () => AUTHC.clientId && !AUTHC.clientId.startsWith('YOUR_');
async function sha256(text){ const b=await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
async function allowed(email){ const e=String(email||'').trim().toLowerCase(); if(!e) return false;
  if((AUTHC.allowedEmails||[]).map(x=>String(x).trim().toLowerCase()).includes(e)) return true;
  const hashes=(AUTHC.allowedEmailHashes||[]).map(x=>String(x).trim().toLowerCase()); if(!hashes.length) return false;
  try{ return hashes.includes(await sha256(e)); }catch(_){ return false; } }
function decodeJwt(t){ let p=t.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'); p+='='.repeat((4-p.length%4)%4); return JSON.parse(decodeURIComponent(atob(p).split('').map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join(''))); }
async function checkToken(p){ if(p.aud!==AUTHC.clientId) return 'This sign-in was not made for this site.'; if(!['accounts.google.com','https://accounts.google.com'].includes(p.iss)) return 'Unknown sign-in issuer.';
  if(!p.exp || p.exp*1000<Date.now()) return 'Sign-in expired. Try again.'; if(!p.email_verified) return 'Your Google email is not verified.'; if(!(await allowed(p.email))) return `${p.email} is not allowed to use this desk.`; return ''; }
async function onCredential(resp){ let p; try{ p=decodeJwt(resp.credential); }catch(e){ $('gateMsg').textContent='Could not read the Google sign-in.'; return; }
  const err=await checkToken(p); if(err){ $('gateMsg').textContent=err; return; } LS.set(SESSION_KEY, {email:p.email, until:Date.now()+SESSION_HOURS*3600e3}); showApp(p.email); }
function showGate(){ $('app').hidden=true; $('gate').hidden=false;
  const render=()=>{ window.google.accounts.id.initialize({client_id:AUTHC.clientId, callback:onCredential, auto_select:false}); window.google.accounts.id.renderButton($('gbtn'), {theme:S.theme==='dark'?'filled_black':'outline', size:'large', text:'signin_with', shape:'pill'}); };
  if(window.google?.accounts?.id) render(); else window.onGoogleLibraryLoad=render; }
let booted=false;
function showApp(email){ $('gate').hidden=true; $('app').hidden=false;
  if(email){ $('logoutBtn').hidden=false; $('userEmailSide').textContent=email; } else $('authWarn').hidden=false;
  if(!booted){ booted=true; tvEnsure('tvTicker'); showView(location.hash.slice(1)||'dash'); refreshAll(); renderPA(); renderJournal(); renderThumbs(); if(S.brief) renderBrief();
    setInterval(()=>{ renderSessions($('dSessions')); if(S.view==='tools') renderToolSessions(); $('dClock').textContent=nowKH(); }, 30e3);
    if(!cfg.kTwelve) toast('Welcome. Add your API keys in Settings, then press Start live.'); } }
function signOut(){ stopLive(); LS.del(SESSION_KEY); if(window.google?.accounts?.id) window.google.accounts.id.disableAutoSelect(); $('gateMsg').textContent=''; showGate(); }

// ----- start -----
applyTheme(); tdLoadCount(); loadForm(); wire(); $('logoutBtn').onclick=signOut; $('logoutBtn2').onclick=signOut; $('dClock').textContent=nowKH();
if(!authReady()) showApp(null);
else { const s=LS.get(SESSION_KEY, null); (s && s.until>Date.now() ? allowed(s.email) : Promise.resolve(false)).then(ok=> ok ? showApp(s.email) : showGate()); }
