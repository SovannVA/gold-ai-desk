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
  feedMode:'ws', pollSec:30, fastTicks:true, mode:'leader', theme:'system',
  enClaude:true, enGemini:true, enDeepseek:true, discuss:true, aiAuto:true, aiSearch:true, liveSignals:true, notif:false, sound:true
};
const FIELDS = Object.keys(DEFAULTS);
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
