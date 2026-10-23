// ===== Market data: Twelve Data REST with rate limit, WebSocket stream, polling, refresh loop =====
const TD = {log:[], day:'', used:0, chain:Promise.resolve(), PER_MIN:8, PER_DAY:800};
function tdLoadCount(){ const j=LS.get('goldAiDesk.credits', {}), d=new Date().toISOString().slice(0,10); TD.day=d; TD.used = j.day===d ? j.used : 0; showCredits(); }
function showCredits(){ const t=`Price data today: ${TD.used} of ${TD.PER_DAY} credits`; const a=$('creditsSide'); if(a) a.textContent=t; const b=$('budgetNote'); if(b) b.textContent=t+'. '+budgetText(); }
function budgetText(){ const poll = cfg.feedMode==='poll' ? 3600/Math.max(15,+cfg.pollSec) : 0, house = 4+1+marketList().length*4;
  const perH = Math.round(poll+house); return `Live mode uses about ${perH} credits per hour${cfg.feedMode==='ws'?' while streaming (more if it falls back to price checks)':''}, so about ${Math.floor(800/perH)} hours a day on the free plan.`; }
function tdCount(c){ const d=new Date().toISOString().slice(0,10); if(TD.day!==d){ TD.day=d; TD.used=0; } TD.used+=c; LS.set('goldAiDesk.credits', {day:TD.day, used:TD.used}); showCredits(); }
function tdBudget(cost){
  const run = async ()=>{
    if(TD.used+cost > TD.PER_DAY) throw new Error('Daily price-data limit reached (800). It resets at 07:00 Cambodia time.');
    for(;;){ const now=Date.now(); TD.log=TD.log.filter(x=>now-x.t<61000); const used=TD.log.reduce((s,x)=>s+x.c,0);
      if(used+cost<=TD.PER_MIN || !TD.log.length) break;
      setFeed('wait'); await sleep(Math.max(500, 61000-(now-TD.log[0].t))); setFeed(S.live ? S.feed : 'off'); }
    TD.log.push({t:Date.now(), c:cost}); tdCount(cost); };
  const p = TD.chain.then(run); TD.chain = p.catch(()=>{}); return p; }
async function td(path, params, cost=1){
  if(!cfg.kTwelve) throw new Error('Add your Twelve Data key in Settings');
  await tdBudget(cost);
  const u=new URL('https://api.twelvedata.com/'+path); Object.entries({...params, apikey:cfg.kTwelve}).forEach(([k,v])=>u.searchParams.set(k,v));
  const r=await fetch(u); const j=await r.json(); if(j.status==='error' || (j.code && !j.symbol)) throw new Error(j.message||'Twelve Data error'); return j; }
function parseUTC(s){ return Date.parse(s.length===10 ? s+'T00:00:00Z' : s.replace(' ','T')+'Z')/1000; }
function parseKH(s){ return Date.parse(s.length===10 ? s+'T00:00:00+07:00' : s.replace(' ','T')+'+07:00')/1000; }
async function series(interval, size, extra={}){
  const kh = extra.timezone==='Asia/Phnom_Penh';
  const j=await td('time_series', {symbol:cfg.symbol, interval, outputsize:size, timezone:kh?'Asia/Phnom_Penh':'UTC', ...extra});
  return (j.values||[]).slice().reverse().map(v=>({t:(kh?parseKH:parseUTC)(v.datetime), o:+v.open, h:+v.high, l:+v.low, c:+v.close})); }
function marketList(){ return String(cfg.marketSyms||'').split(',').map(s=>s.trim()).filter(Boolean).slice(0,8); }
async function loadQuotes(){
  const syms=marketList(); if(!syms.length) return;
  const j=await td('quote', {symbol:syms.join(',')}, syms.length), map = syms.length===1 ? {[syms[0]]:j} : j; S.quotes={};
  syms.forEach(s=>{ const q=map[s]; S.quotes[s] = (q && q.close!=null && !q.code) ? {pct:+q.percent_change, close:+q.close, open:q.is_market_open} : {err:q?.message||'No data'}; });
  S.last.quotes=Date.now(); }
async function loadAll(){
  S.candles['15min']=await series('15min',400); S.last['15min']=Date.now();
  S.candles['1h']=await series('1h',400); S.last['1h']=Date.now();
  S.candles['1day']=await series('1day',300); S.last['1day']=Date.now();
  if(!S.price) S.price=S.candles['15min'].at(-1).c;
  DATA_HOOKS.forEach(f=>f());
  try{ await loadQuotes(); }catch(e){ toast('Other markets: '+e.message); }
  DATA_HOOKS.forEach(f=>f()); }

// ----- live price handling -----
const TICK_HOOKS = [], DATA_HOOKS = [];
function applyToSeries(k, p, ms){ const b=S.candles[k]; if(!b?.length) return; const sec = k==='15min'?900 : k==='1h'?3600 : 86400;
  const t=Math.floor(ms/1000/sec)*sec, last=b.at(-1);
  if(last.t===t){ last.c=p; last.h=Math.max(last.h,p); last.l=Math.min(last.l,p); } else if(t>last.t){ b.push({t, o:p, h:p, l:p, c:p}); } }
function onTick(price, ms=Date.now()){
  if(!(price>0)) return; S.prevPrice=S.price; S.price=price; S.lastTick=ms;
  ['15min','1h','1day'].forEach(k=>applyToSeries(k, price, ms));
  TICK_HOOKS.forEach(f=>{ try{ f(price); }catch(e){ console.error(e); } }); }

// ----- feed status -----
function setFeed(state, msg){
  const f=$('feed'), l=$('feedLabel'); if(!f) return; f.className='feed'; f.title=msg||'';
  const map={off:'Live off', connecting:'Connecting…', ws:'Live · streaming', poll:`Live · every ${cfg.pollSec} s`, wait:'Waiting for data limit', error:'Data error', stale:'No new price'};
  if(['ws','poll'].includes(state)) f.classList.add('on'); if(['connecting','wait','error','stale'].includes(state)) f.classList.add('warn');
  l.textContent = map[state] || state; }

// ----- WebSocket stream (Twelve Data). Basic plans may not stream every symbol: then we fall back to polling. -----
function wsClose(){ const ws=S.ws; S.ws=null; clearInterval(S.timers.hb); try{ ws?.close(); }catch(e){} }
function wsConnect(){
  wsClose(); stopPolling(); setFeed('connecting'); let ws, ok=false;
  try{ ws=new WebSocket('wss://ws.twelvedata.com/v1/quotes/price?apikey='+encodeURIComponent(cfg.kTwelve)); }catch(e){ startPolling(); return; }
  S.ws=ws; S.feed='ws';
  const fail=(why)=>{ if(S.ws!==ws) return; toast(why+' Using regular price checks instead.'); wsClose(); startPolling(); };
  const failTimer=setTimeout(()=>{ if(!ok) fail('Streaming did not start.'); }, 12000);
  ws.onopen=()=>{ ws.send(JSON.stringify({action:'subscribe', params:{symbols:cfg.symbol}}));
    S.timers.hb=setInterval(()=>{ if(ws.readyState===1) ws.send(JSON.stringify({action:'heartbeat'})); }, 10000); };
  ws.onmessage=e=>{ let m; try{ m=JSON.parse(e.data); }catch(_){ return; }
    if(m.event==='subscribe-status'){ clearTimeout(failTimer); ok=true;
      if(m.status!=='ok' || (m.fails||[]).length) fail(`Your Twelve Data plan does not stream ${cfg.symbol}.`); else { S.wsTries=0; setFeed('ws'); } }
    else if(m.event==='price'){ if(!ok){ ok=true; clearTimeout(failTimer); setFeed('ws'); } onTick(Number(m.price), m.timestamp ? m.timestamp*1000 : Date.now()); } };
  ws.onclose=()=>{ clearInterval(S.timers.hb); clearTimeout(failTimer); if(S.ws!==ws) return; S.ws=null;
    if(!S.live) return; if(++S.wsTries<=3){ setFeed('connecting'); setTimeout(()=>{ if(S.live && !S.ws && S.feed==='ws') wsConnect(); }, 2000*S.wsTries); }
    else { toast('Streaming disconnected. Using regular price checks.'); startPolling(); } };
}
// ----- polling -----
function stopPolling(){ clearInterval(S.timers.poll); S.timers.poll=null; }
function startPolling(){
  stopPolling(); S.feed='poll'; setFeed('poll');
  const run=async()=>{ if(!S.live) return; try{ const j=await td('price', {symbol:cfg.symbol}); onTick(Number(j.price)); setFeed('poll'); }catch(e){ setFeed('error', e.message); } };
  run(); S.timers.poll=setInterval(run, Math.max(15, +cfg.pollSec)*1000); }

// ----- background refresh: new candles at their boundaries, other markets every 15 min -----
async function housekeeping(){
  if(S.busy || !S.live) return; S.busy=true;
  try{ const now=Date.now(), q15=Math.floor(now/900e3)*900e3, qh=Math.floor(now/3600e3)*3600e3; let fresh=false;
    if(S.last['15min'] < q15+20e3 && now >= q15+20e3){ S.candles['15min']=await series('15min',400); S.last['15min']=now; fresh=true; }
    if(S.last['1h'] < qh+30e3 && now >= qh+30e3){ S.candles['1h']=await series('1h',400); S.last['1h']=now; fresh=true; }
    if(now-S.last['1day'] >= 6*3600e3){ S.candles['1day']=await series('1day',300); S.last['1day']=now; fresh=true; }
    if(now-S.last.quotes >= 15*60e3){ try{ await loadQuotes(); fresh=true; }catch(e){} }
    if(S.price && S.lastTick){ ['15min','1h','1day'].forEach(k=>applyToSeries(k, S.price, Date.now())); }
    if(S.feed==='ws' && S.lastTick && now-S.lastTick>180e3 && goldOpen()) setFeed('stale','No streamed price for 3 minutes');
    DATA_HOOKS.forEach(f=>f(fresh));
  }catch(e){ setFeed('error', e.message); toast('Data error: '+e.message); }
  finally{ S.busy=false; } }
async function keepAwake(){ try{ if(S.live && 'wakeLock' in navigator && document.visibilityState==='visible') S.wake=await navigator.wakeLock.request('screen'); }catch(e){} }
document.addEventListener('visibilitychange', keepAwake);
async function startLive(){
  if(!cfg.kTwelve){ toast('Add your Twelve Data key in Settings first.'); location.hash='settings'; return; }
  if(cfg.notif && 'Notification' in window && Notification.permission==='default') Notification.requestPermission();
  S.live=true; S.wsTries=0; LIVE_HOOKS.forEach(f=>f(true)); setFeed('connecting'); keepAwake();
  try{ if(!S.candles['15min']) await loadAll(); }catch(e){ toast('Data error: '+e.message); setFeed('error', e.message); }
  if(!S.live) return;
  if(cfg.feedMode==='ws') wsConnect(); else startPolling();
  clearInterval(S.timers.house); S.timers.house=setInterval(housekeeping, 30000);
  toast('Live on. Keep this page open for alerts.'); }
const LIVE_HOOKS = [];
function stopLive(){ S.live=false; stopPolling(); wsClose(); clearInterval(S.timers.house); setFeed('off'); try{ S.wake?.release(); }catch(e){} S.wake=null; LIVE_HOOKS.forEach(f=>f(false)); }
