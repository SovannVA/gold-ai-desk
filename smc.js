// ===== Smart Money Concepts (SMC) chart: structure, order blocks, FVG, liquidity, setups =====
// Everything is computed from closed candles only (no peeking at the future), the same way for past and live bars.
const SMC = {ready:false, tf:'15min', res:null, seen:new Set(), lastDraw:0,
  ov:{structure:true, ob:true, fvg:true, liq:true, pd:true, boxes:true, past:true, alerts:true, ...LS.get('goldAiDesk.smcOv',{})}};
const SMC_OPTS=[['structure','BOS / CHoCH'],['ob','Order blocks'],['fvg','Fair value gaps'],['liq','Liquidity and sweeps'],['pd','Premium / discount'],['boxes','Trade boxes'],['past','Past setups'],['alerts','Alerts']];
const SMC_K = 3;          // swing strength: a swing high needs 3 lower highs on each side
const SMC_MIN_RR = 1.5;   // only take setups where the liquidity target is at least 1.5x the risk

function smcBars(){ return SMC.tf==='1h' ? S.candles['1h'] : S.candles['15min']; }
function smcSec(){ return SMC.tf==='1h' ? 3600 : 900; }

function smcAnalyze(b){
  const n=b?.length||0; if(n<60) return null;
  const A=atr(b), sec=smcSec(), now=Date.now()/1000, closed=i=>b[i].t+sec<=now+5;
  const sw=swings(b, SMC_K), ev=[...sw.hi.map(s=>({...s,type:'H'})), ...sw.lo.map(s=>({...s,type:'L'}))].sort((x,y)=>x.i-y.i);
  const breaks=[], obs=[], fvgs=[], sweeps=[], setups=[], H=[], L=[];
  let trend=0, lastH=null, lastL=null, e=0, legStart=0, pos=null;
  for(let i=0;i<n;i++){
    while(e<ev.length && ev[e].i+SMC_K<=i){ const s={...ev[e++], broken:false, swept:false}; if(s.type==='H'){ lastH=s; H.push(s); } else { lastL=s; L.push(s); } }
    const x=b[i], a=A[i] || A.find(v=>v) || 1, isClosed=closed(i);
    // --- structure breaks (on candle close) and the order block that caused them ---
    if(isClosed && lastH && !lastH.broken && x.c>lastH.p){ lastH.broken=true; const kind=trend<0?'CHoCH':'BOS';
      let lo=lastH.i; for(let j=lastH.i;j<=i;j++) if(b[j].l<b[lo].l) lo=j;
      let ob=lo; for(let j=lo;j>=Math.max(0,lo-6);j--) if(b[j].c<b[j].o){ ob=j; break; }
      breaks.push({dir:1, kind, from:lastH.i, to:i, p:lastH.p});
      obs.push({dir:1, i:ob, top:b[ob].h, bot:b[ob].l, made:i, end:null, used:false, kind}); trend=1; legStart=lo; }
    if(isClosed && lastL && !lastL.broken && x.c<lastL.p){ lastL.broken=true; const kind=trend>0?'CHoCH':'BOS';
      let hi=lastL.i; for(let j=lastL.i;j<=i;j++) if(b[j].h>b[hi].h) hi=j;
      let ob=hi; for(let j=hi;j>=Math.max(0,hi-6);j--) if(b[j].c>b[j].o){ ob=j; break; }
      breaks.push({dir:-1, kind, from:lastL.i, to:i, p:lastL.p});
      obs.push({dir:-1, i:ob, top:b[ob].h, bot:b[ob].l, made:i, end:null, used:false, kind}); trend=-1; legStart=hi; }
    // --- fair value gaps (3-candle imbalance) ---
    if(i>=2 && isClosed){ if(x.l>b[i-2].h && x.l-b[i-2].h>=0.15*a) fvgs.push({dir:1, i:i-1, top:x.l, bot:b[i-2].h, end:null});
      if(x.h<b[i-2].l && b[i-2].l-x.h>=0.15*a) fvgs.push({dir:-1, i:i-1, top:b[i-2].l, bot:x.h, end:null}); }
    // --- mitigation: an order block is gone when price closes through it; a gap is gone when filled ---
    for(const o of obs){ if(o.end!=null || o.made>=i) continue; if(o.dir>0 ? x.c<o.bot : x.c>o.top) o.end=i; }
    for(const g of fvgs){ if(g.end!=null || g.i+1>=i) continue; if(g.dir>0 ? x.l<=g.bot : x.h>=g.top) g.end=i; }
    // --- liquidity sweeps: wick through a recent swing, close back inside ---
    for(const s of H.slice(-6)){ if(s.swept || s.broken || s.i+SMC_K>i || s.i>=i) continue; if(x.h>s.p && x.c<s.p && isClosed){ s.swept=true; sweeps.push({dir:-1, i, p:s.p, from:s.i}); } }
    for(const s of L.slice(-6)){ if(s.swept || s.broken || s.i+SMC_K>i || s.i>=i) continue; if(x.l<s.p && x.c>s.p && isClosed){ s.swept=true; sweeps.push({dir:1, i, p:s.p, from:s.i}); } }
    // --- manage the open simulated trade ---
    if(pos){ const d=pos.dir; let exit=null, why='';
      if(d>0 ? x.l<=pos.sl : x.h>=pos.sl){ exit=pos.sl; why=pos.be?'Breakeven':'Stop loss'; }
      else if(d>0 ? x.h>=pos.tp : x.l<=pos.tp){ exit=pos.tp; why='Take profit'; }
      else if(!pos.be && (d>0 ? x.h>=pos.entry+pos.risk : x.l<=pos.entry-pos.risk)){ pos.be=true; pos.beI=i; pos.sl=pos.entry+d*0.3; }
      if(exit==null && !goldOpen(new Date((x.t+sec)*1000)) && ['Fri','Sat','Sun'].includes(localParts('America/New_York',new Date((x.t+sec)*1000)).wd)){ exit=x.c; why='Market closed'; }
      if(exit!=null){ pos.exit=exit; pos.exitI=i; pos.why=why; pos.pnl=(exit-pos.entry)*d-0.3; pos.r=pos.pnl/pos.risk; pos=null; }
      continue; }
    // --- setup: trend + retrace into an order block in premium/discount + confirmation candle ---
    if(!isClosed || !trend || i<20) continue;
    if(!goldOpen(new Date((x.t+sec)*1000)) || !goldOpen(new Date((x.t+sec+3600)*1000))) continue;
    const d=trend, leg=b.slice(legStart, i+1), rHi=Math.max(...leg.map(q=>q.h)), rLo=Math.min(...leg.map(q=>q.l)), eq=(rHi+rLo)/2;
    const o=obs.filter(q=>q.dir===d && q.end==null && !q.used && q.made<i).sort((p,q)=>q.made-p.made)[0]; if(!o) continue;
    const inZone = d<0 ? (x.h>=o.bot && x.h<=o.top+0.5*a) : (x.l<=o.top && x.l>=o.bot-0.5*a);
    const confirm = d<0 ? (x.c<x.o && x.c<(o.top+o.bot)/2) : (x.c>x.o && x.c>(o.top+o.bot)/2);
    const zoneOK = d<0 ? x.h>=eq : x.l<=eq;
    if(!(inZone && confirm && zoneOK)) continue;
    const entry=x.c, sl = d<0 ? Math.max(o.top, ...b.slice(i-2,i+1).map(q=>q.h))+0.1*a : Math.min(o.bot, ...b.slice(i-2,i+1).map(q=>q.l))-0.1*a;
    const tp = d<0 ? rLo : rHi, risk=Math.abs(entry-sl), rr=Math.abs(tp-entry)/risk;
    if(rr<SMC_MIN_RR || risk<=0) continue;
    const swept = sweeps.some(s=>s.dir===d && i-s.i<=12);
    o.used=true;
    const st={dir:d, side:d>0?'buy':'sell', i, t:x.t, entry, sl, sl0:sl, tp, risk, rr, swept, grade:swept?'A':'B', ob:o, tooRisky:risk>maxDist()+1e-9, be:false};
    setups.push(st); pos=st; }
  // liquidity pools: the latest unbroken swing highs and lows, with equal highs and lows marked
  const a=A.at(-1)||1, tol=0.15*a, pools=[], pNow=S.price||b[n-1].c;
  const untaken=(s,dir)=>{ for(let j=s.i+1;j<n;j++){ if(dir>0 ? b[j].h>s.p : b[j].l<s.p) return false; } return true; };
  const pick=(arr,dir)=>{ const list=arr.filter(s=>(dir>0?s.p>pNow:s.p<pNow) && untaken(s,dir)).sort((x,y)=>dir>0?x.p-y.p:y.p-x.p).slice(0,2);
    list.forEach(s=>pools.push({dir, p:s.p, from:s.i, eq:arr.some(q=>q!==s && Math.abs(q.p-s.p)<=tol && untaken(q,dir))})); };
  pick(H,1); pick(L,-1);
  // current state for the status bar
  const last=n-1, i=b.slice(0, n).findLastIndex((q,k)=>closed(k)), x=b[i], d=trend;
  const leg=b.slice(legStart, i+1), rHi=Math.max(...leg.map(q=>q.h)), rLo=Math.min(...leg.map(q=>q.l)), eq=(rHi+rLo)/2;
  const freshSet=setups.find(q=>q.i===i);
  const poi=freshSet?.ob || obs.filter(q=>q.dir===d && q.end==null && !q.used).sort((p,q)=>q.made-p.made)[0] || null;
  const price=S.price || b[last].c;
  const open=setups.find(s=>s.exit==null) || null;
  const lastBreak=breaks.at(-1) || null;
  const checks=[
    [`Structure ${d>0?'up':d<0?'down':'unclear'}${lastBreak?` (last ${lastBreak.kind} ${lastBreak.dir>0?'up':'down'})`:''}`, !!d],
    [d<0?'Price in premium (upper half of the leg)':d>0?'Price in discount (lower half of the leg)':'Premium or discount', d<0?price>=eq:d>0?price<=eq:false],
    [poi?`At ${d<0?'bearish':'bullish'} order block ${f2(poi.bot)}–${f2(poi.top)}`:'No fresh order block in the trend direction', !!poi && (!!freshSet || (price>=poi.bot-0.5*a && price<=poi.top+0.5*a))],
    ['Liquidity sweep in the last 12 candles (bonus)', sweeps.some(s=>s.dir===d && i-s.i<=12)],
    ['Confirmation candle closed from the zone', !!setups.find(s=>s.i===i)]];
  const rangeFrom=legStart;
  let plan=null;
  if(!open && d && poi){ const entry = d<0 ? poi.bot : poi.top, sl = d<0 ? poi.top+0.1*a : poi.bot-0.1*a, tp = d<0 ? rLo : rHi, risk=Math.abs(entry-sl), rr=risk>0?Math.abs(tp-entry)/risk:0;
    if((d<0 ? tp<entry : tp>entry) && rr>=1) plan={dir:d, side:d>0?'buy':'sell', entry, sl, tp, risk, rr, tooRisky:risk>maxDist()+1e-9, atZone:checks[2][1]}; }
  return {b, breaks, obs, fvgs, sweeps, pools, setups, trend, range:{hi:rHi, lo:rLo, eq, from:rangeFrom}, poi, open, plan, checks, i, a, price}; }

function smcStats(r){ const done=r.setups.filter(s=>s.exit!=null); const w=done.filter(s=>s.pnl>0.01).length;
  return {n:done.length, w, rate:done.length?w/done.length*100:0, netR:done.reduce((s,x)=>s+x.r,0), net$:done.reduce((s,x)=>s+usd(x.pnl),0)}; }

// ----- status bar -----
function smcInfo(r){
  if(!r) return {word:'WAIT', kind:'idle', msg: S.candles['15min'] ? 'Loading more candles…' : 'Press Start live to load prices.'};
  const op=r.open, nm=s=>s==='buy'?'BUY':'SELL';
  if(op){ const now=r.price, pnl=(now-op.entry)*op.dir;
    if(op.tooRisky) return {word:`SMC ${nm(op.side)} · OVER RISK`, kind:'wait', msg:`Stop loss is ${f2(op.risk)} away, more than your ${f2(maxDist())} limit. Skip, or use a smaller lot.`, op};
    const fresh = r.i-op.i<=1;
    return {word: fresh?`SMC ${nm(op.side)} NOW`:`SMC ${nm(op.side)} OPEN ${(pnl>=0?'+$':'−$')+f2(Math.abs(usd(pnl)))}`, kind:op.side, op,
      msg: fresh ? `Grade ${op.grade}${op.swept?' (liquidity swept first)':''}. Enter near ${f2(op.entry)}, SL ${f2(op.sl)}, TP ${f2(op.tp)} at the liquidity target. R:R 1:${op.rr.toFixed(1)}. Check the candle, set SL and TP in MT5.`
        : op.be ? `SL already at entry, so no risk now. Hold for TP ${f2(op.tp)}. Close by ${cfg.closeTime} if still open.` : `Hold. At ${f2(op.entry+op.dir*op.risk)} move SL to entry. Close at TP ${f2(op.tp)} or SL ${f2(op.sl)}, or by ${cfg.closeTime}.`}; }
  const c=r.checks, d=r.trend;
  const P=r.plan;
  if(P && P.atZone) return {word:`${nm(P.side)} ZONE · WAIT`, kind:'wait', plan:P, msg:`Price is at the ${d<0?'bearish':'bullish'} order block. Wait for a ${d<0?'red':'green'} candle to close back ${d<0?'down':'up'} from it, then ${nm(P.side)}. Planned SL ${f2(P.sl)}, TP ${f2(P.tp)} (R:R 1:${P.rr.toFixed(1)}).${P.tooRisky?' ⚠ SL is wider than your risk limit.':''}`};
  if(P) return {word:`PLAN: ${nm(P.side)}`, kind:'idle', plan:P, msg:`Structure is ${d<0?'down':'up'}: look for ${d<0?'SELLS':'BUYS'} only. Wait for price to come back to the ${d<0?'bearish':'bullish'} order block ${f2(r.poi.bot)}–${f2(r.poi.top)} and a confirmation candle. Planned entry ${f2(P.entry)}, SL ${f2(P.sl)}, TP ${f2(P.tp)} (R:R 1:${P.rr.toFixed(1)}).${P.tooRisky?' ⚠ SL is wider than your risk limit.':''} Not an order yet.`};
  if(d && r.poi) return {word:'WAIT', kind:'idle', msg:`Structure is ${d<0?'down: look for SELLS':'up: look for BUYS'}. Next zone: ${d<0?'bearish':'bullish'} order block ${f2(r.poi.bot)}–${f2(r.poi.top)}, but there is not enough room to the target yet.`};
  return {word:'WAIT', kind:'idle', msg: d ? `Structure is ${d<0?'down':'up'}, but there is no fresh order block to trade from. Wait for the next BOS.` : 'Structure is not clear yet. Wait for a BOS or CHoCH.'}; }
function renderSmcSig(){ const box=$('smcSig'); if(!box) return; const r=SMC.res, I=smcInfo(r); clear(box); box.className='sigbar '+I.kind;
  box.append(el('span','sigword',I.word), el('span','sigmsg',I.msg));
  const lv=I.op||I.plan; if(lv){ const n=el('div','signums'); [[I.plan?'Plan entry':'Entry',lv.entry],['Stop loss',lv.sl],['Take profit',lv.tp],['R:R','1:'+lv.rr.toFixed(1)]].forEach(([k,v])=>{ const q=el('div'); q.append(el('span','small muted',k), el('b',null,typeof v==='number'?f2(v):v)); n.appendChild(q); }); box.appendChild(n); }
  renderSmcBadge(I);
  const ck=$('smcChecks'); if(ck){ clear(ck); (r?.checks||[]).forEach(([t,ok])=>{ const c=el('div','check '+(ok?'ok':'no')); c.append(el('span','ic',ok?'✓':''), el('span',null,t)); ck.appendChild(c); });
    if(r){ const s=smcStats(r); ck.appendChild(el('div','small muted mt', `SMC setups in the loaded data (${SMC.tf==='1h'?'1 hour':'15 min'}, about ${Math.round(r.b.length*smcSec()/86400)} days): ${s.n} finished, ${s.w} won (${s.rate.toFixed(0)}%), total ${s.netR>=0?'+':''}${s.netR.toFixed(1)}R (${s.net$>=0?'+$':'−$'}${f2(Math.abs(s.net$))} at your lot). Small sample: test more before trusting it.`)); } } }

// ----- status box on the chart -----
function renderSmcBadge(I){ const bd=$('smcBadge'); if(!bd) return; clear(bd); const lv=I.op||I.plan;
  bd.className='chartbadge smcbadge '+(I.kind==='idle' && I.plan ? 'plan' : I.kind); bd.appendChild(el('div','cbword', I.word));
  if(lv){ bd.appendChild(el('div','cbnums', `${I.plan?'Plan entry':'Entry'} ${f2(lv.entry)} · SL ${f2(lv.sl)} · TP ${f2(lv.tp)} · R:R 1:${lv.rr.toFixed(1)}`));
    bd.appendChild(el('div','cbnums', I.op ? (I.op.be?'SL moved to entry: no risk':`Move SL to entry at ${f2(I.op.entry+I.op.dir*I.op.risk)}`) : 'Wait for the confirmation candle')); }
  else bd.appendChild(el('div','cbnums', I.msg.length>90 ? I.msg.slice(0,88)+'…' : I.msg));
  smcPriceLines(lv, !!I.plan); }
function smcPriceLines(lv, plan){ if(!SMC.cs) return; (SMC.plines||[]).forEach(l=>SMC.cs.removePriceLine(l)); SMC.plines=[]; if(!lv) return;
  const pl=(price,color,title)=>SMC.plines.push(SMC.cs.createPriceLine({price, color, lineWidth:1, lineStyle:2, lineVisible:false, axisLabelVisible:true, title}));
  const nm=lv.side==='buy'?'BUY':'SELL'; pl(lv.entry, lv.side==='buy'?C.up():C.down(), (plan?'Plan ':'')+nm); pl(lv.sl, C.down(), 'SL'); pl(lv.tp, C.up(), 'TP'); }

// ----- chart -----
function smcInit(){ if(SMC.ready || !window.LightweightCharts) return SMC.ready; const node=$('smcChart'); if(!node) return false;
  SMC.ch=mkChart(node); SMC.cs=SMC.ch.addCandlestickSeries(candleStyle()); SMC.pad=SMC.ch.addLineSeries({color:'rgba(0,0,0,0)', lineWidth:1, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false});
  SMC.ch.timeScale().subscribeVisibleLogicalRangeChange(()=>requestAnimationFrame(smcOverlay)); new ResizeObserver(()=>requestAnimationFrame(smcOverlay)).observe(node);
  SMC.ready=true; return true; }
function smcDraw(fit){ const r=SMC.res; if(!smcInit() || !r) return; const b=r.b, sec=smcSec();
  if(SMC.fitKey!==SMC.tf){ fit=true; SMC.fitKey=SMC.tf; } const snap = fit ? null : viewSnap(SMC.ch, SMC.prevB); SMC.prevB=b;
  SMC.cs.setData(b.map(x=>({time:x.t+OFF, open:x.o, high:x.h, low:x.l, close:x.c})));
  SMC.pad.setData(Array.from({length:24},(_,k)=>({time:b.at(-1).t+OFF+sec*(k+1)})));   // room on the right for boxes ahead
  const mk=[]; if(SMC.ov.past || SMC.ov.boxes) r.setups.forEach(s=>{ if(!SMC.ov.past && s!==r.open) return; mk.push({time:b[s.i].t+OFF, position:s.dir>0?'belowBar':'aboveBar', color:s.dir>0?C.up():C.down(), shape:s.dir>0?'arrowUp':'arrowDown'}); });
  SMC.cs.setMarkers(mk);
  if(fit) SMC.ch.timeScale().setVisibleLogicalRange({from:Math.max(0,b.length-170), to:b.length+18}); else viewRestore(SMC.ch, snap, b);
  renderSmcBadge(smcInfo(r)); smcOverlay(); }
function smcOverlay(){ const L=$('smcLayer'); if(!L || !SMC.ready || !SMC.res || $('smcWrap').hidden) return; L.innerHTML='';
  const r=SMC.res, b=r.b, n=b.length, ts=SMC.ch.timeScale(), W=ts.width(), H=$('smcChart').clientHeight-26, ov=SMC.ov;
  const X=i=>ts.logicalToCoordinate(i), Y=p=>SMC.cs.priceToCoordinate(p);
  const box=(i1,i2,p1,p2,cls,label)=>{ let x1=X(i1), x2=X(i2), y1=Y(Math.max(p1,p2)), y2=Y(Math.min(p1,p2)); if([x1,x2,y1,y2].some(v=>v==null)) return; if(x2<0||x1>W) return; x1=Math.max(x1,0); x2=Math.min(x2,W);
    const d=el('div','sbox '+cls); Object.assign(d.style,{left:x1+'px', top:y1+'px', width:Math.max(2,x2-x1)+'px', height:Math.max(2,y2-y1)+'px'}); if(label) d.appendChild(el('span','slab',label)); L.appendChild(d); return d; };
  const hline=(i1,i2,p,cls,label,below)=>{ let x1=X(i1), x2=X(i2), y=Y(p); if([x1,x2,y].some(v=>v==null) || x2<0 || x1>W) return; x1=Math.max(x1,0); x2=Math.min(x2,W);
    const d=el('div','sline '+cls); Object.assign(d.style,{left:x1+'px', top:y+'px', width:Math.max(2,x2-x1)+'px'}); if(label){ const t=el('span','stxt'+(below?' below':''),label); d.appendChild(t); } L.appendChild(d); };
  const tagAt=(i,p,txt,cls,up)=>{ const x=X(i), y=Y(p); if(x==null||y==null||x<0||x>W) return; const d=el('div','stag '+cls+(up?' up':' dn'),txt); L.appendChild(d); const w=d.offsetWidth, h=d.offsetHeight;
    d.style.left=Math.min(Math.max(x-w/2,2),W-w-2)+'px'; d.style.top=Math.min(Math.max(up?Y(p)-h-8:Y(p)+8,2),H-h)+'px'; };
  const right=n-1+16;
  if(ov.pd && r.trend){ const g=r.range; box(g.from, right, g.hi, g.eq, 'pd prem', 'Premium'); box(g.from, right, g.eq, g.lo, 'pd disc', 'Discount'); hline(g.from, right, g.eq, 'eq', 'EQ 50%'); }
  const lastN=(arr,k,f)=>[1,-1].flatMap(d=>arr.filter(x=>x.dir===d && f(x)).slice(-k));
  if(ov.fvg) lastN(r.fvgs,2,g=>g.end==null).forEach(g=>box(g.i, right, g.top, g.bot, 'fvg '+(g.dir>0?'bull':'bear'), 'FVG'));
  if(ov.ob) lastN(r.obs,2,o=>o.end==null).forEach(o=>box(o.i, o.end ?? right, o.top, o.bot, 'ob '+(o.dir>0?'bull':'bear')+(o.end!=null?' gone':''), (o.dir>0?'Bull OB':'Bear OB')+(o.end!=null?' (broken)':'')));
  if(ov.structure) r.breaks.slice(-10).forEach(k=>hline(k.from, k.to, k.p, 'brk '+(k.dir>0?'bull':'bear')+(k.kind==='CHoCH'?' choch':''), k.kind, k.dir<0));
  if(ov.liq){ r.pools.forEach(q=>hline(q.from, right, q.p, 'liq '+(q.dir>0?'bsl':'ssl'), (q.eq?(q.dir>0?'EQH ':'EQL '):'')+'$$$ '+(q.dir>0?'buy stops':'sell stops'), q.dir<0));
    r.sweeps.slice(-4).forEach(s=>{ hline(s.from, s.i, s.p, 'swp', ''); tagAt(s.i, s.p, 'SWEEP', 'swp', s.dir<0); }); }
  if(ov.boxes && r.plan && !r.open){ const P=r.plan, i0=n-1, i1=right;
    box(i0, i1, P.entry, P.tp, 'tbox win plan', `TP ${f2(P.tp)}`); box(i0, i1, P.entry, P.sl, 'tbox loss plan', `SL ${f2(P.sl)}`);
    tagAt(i0+3, P.dir<0?P.sl:P.sl, `PLAN ${P.side==='buy'?'BUY':'SELL'} @ ${f2(P.entry)}${P.tooRisky?' ⚠':''}`, P.atZone?'plan zone':'plan', P.dir<0); }
  if(ov.boxes){ const list=r.setups.filter(s=>ov.past || s===r.open).slice(-6);
    list.forEach(s=>{ const end=s.exitI ?? right, nm=s.dir>0?'BUY':'SELL';
      box(s.i, end, s.entry, s.tp, 'tbox win', s===r.open||s===list.at(-1) ? `TP ${f2(s.tp)}` : '');
      box(s.i, end, s.entry, s.sl, 'tbox loss', s===r.open||s===list.at(-1) ? `SL ${f2(s.sl)}` : '');
      tagAt(s.i, s.dir>0?Math.min(s.sl,b[s.i].l):Math.max(s.sl,b[s.i].h), `SMC ${nm}${s.tooRisky?' ⚠':''} ${s.grade}`, s.side, s.dir<0);
      if(s.exitI!=null){ const k=s.why==='Take profit'?'tp':s.why==='Stop loss'?'sl':'close', t=s.why==='Take profit'?`TP ${s.pnl>=0?'+':'−'}$${f2(Math.abs(usd(s.pnl)))}`:s.why==='Stop loss'?`SL −$${f2(Math.abs(usd(s.pnl)))}`:s.why==='Breakeven'?'Exit at entry':`Closed ${s.pnl>=0?'+':'−'}$${f2(Math.abs(usd(s.pnl)))}`;
        tagAt(s.exitI, s.exit, t, k, s.dir>0 ? k==='tp' : k!=='tp'); } }); }
  $('smcLegend').hidden=false; }

// ----- options and refresh -----
function renderSmcChips(){ const box=$('smcChips'); if(!box) return; box.innerHTML=''; box.appendChild(el('span','small muted','Show:'));
  SMC_OPTS.forEach(([k,label])=>{ const c=el('button','chip',label); c.type='button'; c.setAttribute('aria-pressed', SMC.ov[k]?'true':'false');
    c.onclick=()=>{ SMC.ov[k]=!SMC.ov[k]; LS.set('goldAiDesk.smcOv', SMC.ov); c.setAttribute('aria-pressed', SMC.ov[k]?'true':'false'); smcDraw(false); }; box.appendChild(c); }); }
function smcRefresh(force){ const b=smcBars(); if(!b?.length) { renderSmcSig(); return; }
  SMC.res=smcAnalyze(b); renderSmcSig();
  const r=SMC.res, op=r?.open;
  if(op && S.live && SMC.ov.alerts && r.i-op.i<=1 && !op.tooRisky && !SMC.seen.has(op.t+op.side)){ SMC.seen.add(op.t+op.side);
    notify(`SMC ${op.side.toUpperCase()} setup (grade ${op.grade}): entry about ${f2(op.entry)}, SL ${f2(op.sl)}, TP ${f2(op.tp)}, R:R 1:${op.rr.toFixed(1)}. Check the chart first.`); }
  if(!$('smcWrap').hidden) smcDraw(force); }
function smcTick(){ if($('smcWrap').hidden || !SMC.ready || !SMC.res) return; const b=smcBars(), x=b?.at(-1); if(!x) return;
  try{ SMC.cs.update({time:x.t+OFF, open:x.o, high:x.h, low:x.l, close:x.c}); }catch(e){}
  if(Date.now()-SMC.lastDraw>1000){ SMC.lastDraw=Date.now(); smcRefresh(false); } }
DATA_HOOKS.push(()=>smcRefresh(false));
TICK_HOOKS.push(smcTick);
THEME_HOOKS.push(()=>{ if(SMC.cs){ SMC.cs.applyOptions(candleStyle()); smcOverlay(); } });
