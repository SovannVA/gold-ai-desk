// ===== Core: state, settings, helpers, theme, routing =====
const $ = id => document.getElementById(id);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const LS = {
  get(k, d){ try{ const v=localStorage.getItem(k); return v==null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};
const CFG_KEY = 'goldAiDesk.v1';
const DEFAULTS = {
  kClaude:'', kGemini:'', kDeepseek:'', kTwelve:'',
  mClaude:'claude-sonnet-5-5', mGemini:'gemini-3.8-flash', mDeepseek:'deepseek-v4-flash',
  symbol:'XAU/USD', tvSymbol:'PEPPERSTONE:XAUUSD', marketSyms:'XAG/USD,EUR/USD,USD/JPY,UUP,TLT,SPY',
  balance:200, lot:0.01, riskPct:4, winStart:'20:00', closeTime:'23:00', newsBuffer:30,
  feedMode:'ws', pollSec:30, fastTicks:true, lbMode:'short', lbAlerts:true, mode:'leader', theme:'system',
  enClaude:true, enGemini:true, enDeepseek:true, discuss:true, aiAuto:true, aiSearch:true, liveSignals:true, notif:false, sound:true
};
const FIELDS = Object.keys(DEFAULTS);
// ----- holding style shared by every strategy chart: Short-term or Long line -----
// short: fixed take profit, stop to entry at 1R (SMC and 5-check only), close the same day.
// long: no fixed take profit, the stop trails the price (trail x ATR of the chart timeframe), close after 24 h or before the weekend.
const HOLDX = {short:{be:true}, long:{trail:6, hours:24}};
const holdMode = () => ['long','auto'].includes(cfg.lbMode) ? cfg.lbMode : 'short';
const HOLD_EMA = 200;   // Auto: a trade in the direction of the 15 min EMA 200 is held Long line, a trade against it is Short-term
const holdPick = (mode, dir, price, e) => mode!=='auto' ? mode : (e!=null && Math.sign(price-e)===dir ? 'long' : 'short');
const HOLD_NAMES = {short:'Short-term', long:'Long line', auto:'Auto (case by case)'};
// ----- trade card: every level a trader needs for one BUY or SELL, in any strategy and holding style -----
function chartEmpty(wrapId, none, name){ const w=$(wrapId), host=w?.querySelector('.chart-host'); if(!host) return; let e=host.querySelector('.chartempty');
  if(none && !e) host.appendChild(el('div','chartempty',`No price data yet. Press Start live (top right) to load the candles and draw the ${name} with entry, SL and TP.`)); if(!none && e) e.remove(); }
function lotFor(dist){ return dist>0 ? Math.floor(cfg.balance*cfg.riskPct/100/(dist*100)/0.01+1e-9)*0.01 : 0; }
// o = {side, entry, sl, sl0, tp, hold, targets:[[label,price]], closeBy, pending, trailing, be}
function tradeRows(o){ const dir=o.side==='buy'?1:-1, R=Math.abs(o.entry-(o.sl0??o.sl)), lot0=lotFor(R), lot=Math.max(lot0,0.01), m=d=>'$'+f2(Math.abs(d)*lot*100), rows=[];
  const add=(k,v,c)=>rows.push([k,v,c]);
  add(o.pending ? (dir>0?'Buy stop':'Sell stop') : 'Entry', f2(o.entry), dir>0?'up':'down');
  const lockd=(o.sl-o.entry)*dir;   // > 0: the stop is already on the profit side of the entry
  add(o.trailing ? 'Trailing stop' : o.be ? 'Stop loss (moved to entry)' : 'Stop loss', f2(o.sl)+(lockd>0 ? ` (${dir>0?'above':'below'} entry: locks +${m(lockd)})` : ''), lockd>0?'up':'down');
  if((o.be || o.trailing) && o.sl0!=null) add('First stop loss', f2(o.sl0), 'muted');
  if(o.hold==='long'){ (o.targets||[['Target 1',o.entry+dir*1.5*R],['Target 2',o.entry+dir*3*R]]).forEach(([k,p])=>add(k+' (guide)', `${f2(p)} (+${m(p-o.entry)})`, 'muted'));
    add('Take profit', 'None: trail the stop', 'warnc'); }
  else if(o.tp!=null){ add('Take profit', `${f2(o.tp)} (+${m(o.tp-o.entry)})`, 'up'); add('R:R', '1:'+(Math.abs(o.tp-o.entry)/R).toFixed(1)); }
  add('Lot', lot.toFixed(2)+(lot0<0.01?' ⚠ over your risk':''), lot0<0.01?'warnc':'');
  const moved=o.sl0!=null && Math.abs(o.sl-o.sl0)>1e-6, now=(o.sl-o.entry)*dir;
  if(moved) add('If the stop is hit now', (now>=0?'+':'−')+m(now), now>=0?'up':'down'); else add('Risk if SL hit', '−'+m(R), 'down');
  (o.extra||[]).forEach(([k,v,c])=>add(k,v,c));
  add('Hold', HOLD_NAMES[o.hold||'short']);
  if(o.closeBy) add('Close by', o.closeBy);
  return rows; }
function tradeCard(title, o, cls){ const box=el('div','tradecard '+(cls||(o.side==='buy'?'buy':'sell'))); if(title) box.appendChild(el('div','tchead',title));
  const g=el('div','tcgrid'); tradeRows(o).forEach(([k,v,c])=>{ const q=el('div'); q.append(el('span','small muted',k), el('b',c||null,v)); g.appendChild(q); }); box.appendChild(g); return box; }
// trend check used by Auto and by the hold advisor: closes of the 15 min chart vs their EMA 200
function holdTrend(b){ b=(b||[]).filter(x=>x && x.c!=null); if(b.length<50) return null; const e=ema(b.map(x=>x.c), HOLD_EMA).at(-1), p=S.price||b.at(-1).c;
  return {dir:Math.sign(p-e)||1, e, p, gap:p-e, warm:b.length>=HOLD_EMA}; }
// one candle of trade management; returns [exitPrice, reason] or null. Trail moves on the candle close (no peeking).
function holdStep(pos, x, a, mode, sec, beOff, i, isClosed=true){ const d=pos.dir;
  if(d>0 ? x.l<=pos.sl : x.h>=pos.sl) return [pos.sl, pos.trailing ? 'Trailing stop' : pos.be ? 'Breakeven' : 'Stop loss'];
  if(mode!=='long'){ if(pos.tp!=null && (d>0 ? x.h>=pos.tp : x.l<=pos.tp)) return [pos.tp, 'Take profit'];
    if(HOLDX.short.be && !pos.be && (d>0 ? x.h>=pos.entry+pos.risk : x.l<=pos.entry-pos.risk)){ pos.be=true; pos.sl=pos.entry+d*beOff; }
    return null; }
  if(!isClosed) return null;                                  // live candle: only the stop can be hit
  pos.bars=(pos.bars||0)+1; const ns=x.c-d*HOLDX.long.trail*a;
  if(d>0 ? ns>pos.sl : ns<pos.sl){ pos.sl=ns; pos.trailing=true; (pos.trail ||= []).push([i, ns]); }
  if(pos.bars*sec>=HOLDX.long.hours*3600) return [x.c, 'Closed after 24 hours'];
  return null; }
let cfg = {...DEFAULTS, ...LS.get(CFG_KEY, {})};

const S = {
  candles:{}, quotes:{}, brief:LS.get('goldAiDesk.brief', null), images:[], results:{},
  plan:null, mon:{phase:'idle', entry:null, sl:null, beDone:false, fired:{}},
  price:null, prevPrice:null, lastTick:0, live:false, busy:false, feed:'off', ws:null, wsTries:0,
  last:{'15min':0,'1h':0,'1day':0, quotes:0}, signal:null, sigSeen:new Set(), newsSeen:new Set(), sigHist:[],
  priceAlerts:LS.get('goldAiDesk.alerts', []), journal:LS.get('goldAiDesk.journal', []),
  timers:{}, wake:null, view:'dash', theme:'dark'
};
if(S.brief && Date.now()-S.brief.at > 24*3600e3) S.brief = null;

// ----- formatting -----
const f2 = x => (x==null || isNaN(x)) ? '–' : Number(x).toLocaleString('en-US',{minimumFractionDigits:2, maximumFractionDigits:2});
const f0 = x => (x==null || isNaN(x)) ? '–' : Number(x).toLocaleString('en-US',{maximumFractionDigits:0});
const pct = x => (x==null || isNaN(x)) ? '–' : (x>0?'+':x<0?'−':'')+Math.abs(Number(x)).toFixed(2)+'%';
const sgn = x => (x>0?'+':x<0?'−':'')+f2(Math.abs(x));
const usd = dist => dist * cfg.lot * 100;               // gold: 1 lot = 100 oz
const maxDist = () => cfg.balance*cfg.riskPct/100/(cfg.lot*100);
const KH = 7*3600e3;                                      // Cambodia is UTC+7, no daylight saving
const khTime = ms => new Date(ms+KH).toISOString().slice(11,16);
const khDate = ms => new Date(ms+KH).toISOString().slice(0,10);
const khStamp = ms => new Date(ms+KH).toISOString().slice(0,16).replace('T',' ');
const khDay = ms => new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Phnom_Penh', weekday:'short'}).format(new Date(ms))+' '+khTime(ms);
const nowKH = () => khTime(Date.now());
const sleep = ms => new Promise(r=>setTimeout(r, ms));
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));

function el(tag, cls, text){ const e=document.createElement(tag); if(cls) e.className=cls; if(text!=null) e.textContent=text; return e; }
function kvRow(kv, k, v){ kv.append(el('b',null,k), el('span',null,v)); }
function stat(k, v, d, cls){ const s=el('div','stat'); s.append(el('div','k',k), el('div','v'+(cls?' '+cls:''), v)); if(d) s.append(el('div','d',d)); return s; }
function safeLink(url, text){ const a=el('a',null,text||url); if(/^https:\/\//i.test(url||'')){ a.href=url; a.target='_blank'; a.rel='noopener noreferrer'; } return a; }
function pill(node, text, kind){ node.textContent=text; node.className='pill'+(kind?' '+kind:''); }

// ----- toasts, sounds, notifications, alerts -----
function toast(msg){ const box=$('toasts'), t=el('div','toast',msg); box.appendChild(t); while(box.children.length>3) box.firstChild.remove(); setTimeout(()=>t.remove(), 8000); }
function beep(){ if(!cfg.sound) return; try{ const a=new (window.AudioContext||window.webkitAudioContext)(); [0,.22,.44].forEach(d=>{ const o=a.createOscillator(), g=a.createGain(); o.frequency.value=880; o.connect(g); g.connect(a.destination); g.gain.setValueAtTime(.13,a.currentTime+d); o.start(a.currentTime+d); o.stop(a.currentTime+d+.14); }); }catch(e){} }
function logLine(msg){ const box=$('log'); if(box.firstChild && box.firstChild.classList?.contains('muted')) box.innerHTML='';
  const d=el('div'); d.append(el('time',null,nowKH()), document.createTextNode(msg)); box.prepend(d); }
function notify(msg){ logLine(msg); toast(msg); beep();
  if(cfg.notif && 'Notification' in window && Notification.permission==='granted'){ try{ new Notification('Gold AI Desk', {body:msg}); }catch(e){} } }
function alertUser(key, msg){ if(key && S.mon.fired[key]) return; if(key) S.mon.fired[key]=true; notify(msg); }
function alertOnce(set, key, msg){ if(set.has(key)) return; set.add(key); notify(msg); }

// ----- theme -----
const THEME_HOOKS = [];
function resolvedTheme(){ return cfg.theme==='system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : cfg.theme; }
function applyTheme(){
  const t = resolvedTheme(); if(document.documentElement.dataset.theme===t && S.theme===t) return;
  S.theme=t; document.documentElement.dataset.theme=t;
  document.querySelector('meta[name="theme-color"]').content = t==='dark' ? '#0d1526' : '#eef2f7';
  const b=$('themeBtn'); if(b){ b.innerHTML=`<svg><use href="#i-${t==='dark'?'sun':'moon'}"/></svg>`; b.setAttribute('aria-label', t==='dark'?'Switch to light mode':'Switch to dark mode'); }
  THEME_HOOKS.forEach(f=>{ try{ f(t); }catch(e){} });
}
function toggleTheme(){ cfg.theme = S.theme==='dark' ? 'light' : 'dark'; LS.set(CFG_KEY, cfg); const sel=$('theme'); if(sel) sel.value=cfg.theme; applyTheme(); }
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ()=>{ if(cfg.theme==='system') applyTheme(); });
function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

// ----- routing -----
const VIEW_HOOKS = {};
const VIEWS = ['dash','chart','signals','markets','economy','ai','data','backtest','journal','tools','settings'];
function showView(name){
  if(!VIEWS.includes(name)) name='dash'; S.view=name;
  $$('.view').forEach(v=>v.hidden = v.dataset.view!==name);
  $$('[data-nav]').forEach(a=>{ if(a.dataset.nav===name) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  $('moreSheet').hidden=true; $('moreBtn').setAttribute('aria-expanded','false');
  try{ VIEW_HOOKS[name]?.(); }catch(e){ console.error(e); }
  window.scrollTo({top:0});
}
window.addEventListener('hashchange', ()=>showView(location.hash.slice(1)));
