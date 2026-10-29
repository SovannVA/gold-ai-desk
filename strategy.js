// ===== London Breakout: the strategy that held up when tested on real gold data =====
// Range = first 30 minutes of the London session (08:00–08:30 London time, moves with summer time).
// Then two pending orders: Buy stop at the range high, Sell stop at the range low (first one hit cancels the other).
// Stop loss = the other side of the range. Orders are valid until 15:00 London.
// Short-term: take profit at 1.5 x the risk, close everything at 16:00 UTC (23:00 Cambodia).
// Long line: no fixed take profit, trailing stop 6 x ATR(15 min), hold up to 24 hours, close before the weekend.
// Auto (case by case): each order is held Long line when it goes WITH the 15 min EMA 200 trend, Short-term when it goes against it.
// Tested 2017, 2018 and Sep–Oct 2026 (15 min candles, costs included). See README for the numbers.
const LBX = {rangeStart:8*60, rangeLen:30, lastEntry:15*60, tpR:1.5, exitUTC:16, trail:6, maxBars:96};
const LB_STATS = {short:{label:'Short-term', pf:'1.02–1.29', win:'46–54%', avgR:'+0.01 to +0.16R', trades:'about 5 a week', streak:7, note:'Small edge: high spreads can erase it.'},
                  long:{label:'Long line', pf:'1.17–1.88', win:'24–33%', avgR:'+0.17 to +0.64R', trades:'about 4 a week', streak:20, note:'Strongest in tests, but most trades are small losses and a few big wins pay for them. Deepest losing runs.'},
                  auto:{label:'Auto (case by case)', pf:'1.08–1.60', win:'36–44%', avgR:'+0.06 to +0.40R', trades:'about 4–5 a week', streak:14, note:'In between: more profit than Short-term and smaller losing runs than Long line. Trades with the trend are held long, trades against it take the quick profit.'}};
const LB = {res:null, ready:false, seen:new Set(LS.get('goldAiDesk.lbSeen', [])), long:null, longAt:0};
const lbMode = holdMode;
const LDN_FMT = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/London', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23'});
function ldn(sec){ const p={}; LDN_FMT.formatToParts(new Date(sec*1000)).forEach(x=>p[x.type]=x.value); return {key:`${p.year}-${p.month}-${p.day}`, min:(+p.hour%24)*60+(+p.minute)}; }
const utcHour = sec => Math.floor(sec/3600)%24;

// Same rules as the research code: conservative fills, one trade at a time.
function lbAnalyze(raw, mode=lbMode()){
  const b=(raw||[]).filter(x=>goldOpen(new Date(x.t*1000)) && x.h-x.l>1e-6), n=b.length; if(n<40) return null;
  const A=atr(b), E=ema(b.map(x=>x.c), HOLD_EMA), L=b.map(x=>ldn(x.t)), now=Date.now()/1000, sec=900, closed=i=>b[i].t+sec<=now+5;
  const days=[]; let cur=null;
  for(let i=0;i<n;i++){ if(!cur || cur.key!==L[i].key){ cur={key:L[i].key, rng:[], win:[], first:i}; days.push(cur); }
    const m=L[i].min; if(m>=LBX.rangeStart && m<LBX.rangeStart+LBX.rangeLen) cur.rng.push(i); else if(m>=LBX.rangeStart+LBX.rangeLen && m<LBX.lastEntry) cur.win.push(i); }
  const trades=[]; let busy=-1;
  for(const d of days){
    if(d.rng.length<LBX.rangeLen/15){ d.state = d.rng.length ? 'building' : 'norange'; if(d.rng.length){ d.hi=Math.max(...d.rng.map(i=>b[i].h)); d.lo=Math.min(...d.rng.map(i=>b[i].l)); } continue; }
    d.hi=Math.max(...d.rng.map(i=>b[i].h)); d.lo=Math.min(...d.rng.map(i=>b[i].l)); d.risk=d.hi-d.lo; d.sig=d.rng.at(-1);
    d.e=E[d.sig]; d.hold={buy:holdPick(mode, 1, b[d.sig].c, d.e), sell:holdPick(mode, -1, b[d.sig].c, d.e)};
    if(!closed(d.sig)){ d.state='building'; continue; }
    if(d.sig<=busy){ d.state='busy'; continue; }
    let j0=null, side=0;
    for(const j of d.win){ const hb=b[j].h>=d.hi, hs=b[j].l<=d.lo; if(hb && hs){ j0=j; side=0; break; } if(hb){ j0=j; side=1; break; } if(hs){ j0=j; side=-1; break; } }
    if(j0==null){ d.state = d.win.length && !closed(d.win.at(-1)) ? 'pending' : (d.win.length ? 'nofill' : 'pending'); continue; }
    if(side===0){ const t={day:d.key, i:j0, exitI:j0, side:'both', dir:0, entry:d.hi, sl:d.lo, tp:null, risk:d.risk, exit:d.lo, why:'Both sides hit in one candle', r:-1, pnl:-d.risk}; trades.push(t); d.trade=t; d.state='done'; busy=j0; continue; }
    const entry = side>0 ? Math.max(d.hi, b[j0].o) : Math.min(d.lo, b[j0].o), sl = side>0 ? d.lo : d.hi, risk=Math.abs(entry-sl);
    const hm = side>0 ? d.hold.buy : d.hold.sell, tp = hm==='short' ? (side>0?d.hi:d.lo)+side*LBX.tpR*d.risk : null;
    const tr={day:d.key, i:j0, side:side>0?'buy':'sell', dir:side, entry, sl0:sl, sl, tp, risk, trail:[], hold:hm, withTrend: d.e!=null && Math.sign(b[d.sig].c-d.e)===side};
    let j=j0, exit=null, why='';
    for(; j<n; j++){ const x=b[j];
      if(side>0 ? x.l<=tr.sl : x.h>=tr.sl){ exit=tr.sl; why = tr.sl!==sl ? 'Trailing stop' : 'Stop loss'; break; }
      if(tp!=null && (side>0 ? x.h>=tp : x.l<=tp)){ exit=tp; why='Take profit'; break; }
      if(!closed(j)) break;                                         // live candle: trade still open
      if(hm==='long'){ const ns = side>0 ? Math.max(tr.sl, x.c-LBX.trail*A[j]) : Math.min(tr.sl, x.c+LBX.trail*A[j]); if(ns!==tr.sl){ tr.sl=ns; tr.trail.push([j,ns]); } }
      const endClock = hm==='short' && utcHour(x.t+sec)===LBX.exitUTC, endBars = hm==='long' && j-j0+1>=LBX.maxBars;
      const endWeek = j+1<n ? b[j+1].t-x.t>6*3600 : !goldOpen(new Date((x.t+sec+60)*1000));
      if(endClock || endBars || endWeek){ exit=x.c; why = endWeek ? 'Closed before market close' : endClock ? `Closed at ${khTime((x.t+sec)*1000)} (end of day)` : 'Closed after 24 hours'; break; }
    }
    if(exit!=null){ tr.exit=exit; tr.exitI=j; tr.why=why; tr.pnl=(exit-entry)*side; tr.r=(tr.pnl-0.45)/risk; busy=j; d.state='done'; }
    else { tr.open=true; tr.exitI=n-1; busy=n; d.state='open'; }
    d.trade=tr; trades.push(tr); }
  return {b, A, days, trades, mode, today:days.at(-1)}; }

function lbStats(r){ const done=(r?.trades||[]).filter(t=>!t.open); if(!done.length) return {n:0}; const rs=done.map(t=>t.r), w=rs.filter(x=>x>0.02).length;
  const gw=rs.filter(x=>x>0).reduce((s,x)=>s+x,0), gl=-rs.filter(x=>x<0).reduce((s,x)=>s+x,0);
  return {n:done.length, w, rate:w/done.length*100, totR:rs.reduce((s,x)=>s+x,0), pf:gl?gw/gl:99, net$:done.reduce((s,t)=>s+usd(t.pnl),0)}; }

// lot that keeps the loss at your risk limit (1.00 lot = 100 oz)
function lbLot(risk){ const maxUsd=cfg.balance*cfg.riskPct/100, lot=Math.floor(maxUsd/(risk*100)/0.01)*0.01; return lot; }

// ----- what to do now -----
const LB_SHORT_CLOSE = () => `${khTime(Date.UTC(1970,0,1,LBX.exitUTC))} Cambodia time`;
function lbCloseBy(hold, entrySec){ return hold==='long' ? `${khStamp((entrySec+LBX.maxBars*900)*1000)} (24 h) or the stop` : LB_SHORT_CLOSE(); }
// the two pending orders as trade cards (same lot for both: the risk is the range)
function lbPendCards(d, partial){ const t0=Date.now()/1000, hb=d.hold?.buy||holdMode(), hs=d.hold?.sell||holdMode(), risk=d.hi-d.lo;
  const mk=(dir,h)=>({side:dir>0?'buy':'sell', pending:true, entry:dir>0?d.hi:d.lo, sl:dir>0?d.lo:d.hi, tp:h==='short'?(dir>0?d.hi:d.lo)+dir*LBX.tpR*risk:null, hold:h, closeBy:lbCloseBy(h, t0)});
  const why=h=>holdMode()==='auto' ? (h==='long'?' · with the trend':' · against the trend') : '';
  return [[`BUY STOP${partial?' (if the range ended now)':''}${why(hb)}`, mk(1,hb)], [`SELL STOP${partial?' (if the range ended now)':''}${why(hs)}`, mk(-1,hs)]]; }
function lbInfo(r){
  const mode=lbMode(), S1=LB_STATS[mode];
  if(!r) return {word:'WAIT', kind:'idle', msg: S.candles['15min'] ? 'Loading candles…' : 'Press Start live to load prices.'};
  const d=r.today, now=Date.now()/1000, p=ldn(now), price=S.price||r.b.at(-1).c, f=v=>f2(v);
  const rangeKH = () => { const start=now-((p.min-LBX.rangeStart)*60); return `${khTime(start*1000)}–${khTime((start+LBX.rangeLen*60)*1000)}`; };
  const lotTxt = risk => { const lot=lbLot(risk); return lot>=0.01 ? `Lot for your ${cfg.riskPct}% risk: ${lot.toFixed(2)}` : `⚠ Even 0.01 lot risks $${f(usd(risk)/cfg.lot*0.01)}, more than your ${cfg.riskPct}% limit: skip or raise the limit`; };
  if(!goldOpen()) return {word:'MARKET CLOSED', kind:'idle', msg:'Gold is closed. The next range is the first 30 minutes of the London session on the next trading day.'};
  const op=r.trades.find(t=>t.open);
  if(op){ const pnl=(price-op.entry)*op.dir, nm=op.side.toUpperCase();
    return {word:`${nm} OPEN ${(pnl>=0?'+$':'−$')+f(Math.abs(usd(pnl)))}`, kind:op.side, lv:{entry:op.entry, sl:op.sl, sl0:op.sl0, tp:op.tp, side:op.side, hold:op.hold, trailing:op.trail.length>0, closeBy:lbCloseBy(op.hold, r.b[op.i].t)},
      hold:op.hold, msg: (mode==='auto' ? `Auto picked ${HOLD_NAMES[op.hold]} for this trade (${op.withTrend?'it goes with':'it goes against'} the EMA 200 trend). ` : '') + (op.hold==='short' ? `Hold. Stop loss ${f(op.sl)}, take profit ${f(op.tp)}. If neither is hit, close at ${khTime(Date.UTC(1970,0,1,LBX.exitUTC))} Cambodia time. Do not move the stop to entry (tests show it lowers results).`
        : `Hold and let it run. Trailing stop now ${f(op.sl)} (moves only in your favour: move your MT5 stop to it). Close if hit, after 24 hours, or before the weekend.`)}; }
  if(d && d.key===p.key){
    if(d.state==='building' || (p.min>=LBX.rangeStart && p.min<LBX.rangeStart+LBX.rangeLen)) return {word:'RANGE BUILDING', kind:'wait', cards: d.hi!=null && d.hi>d.lo ? lbPendCards(d, true) : null, msg:`Marking the range now (${rangeKH()} Cambodia time).${d.hi?` So far: high ${f(d.hi)}, low ${f(d.lo)}.`:''} Orders come when it ends: the cards show the plan if the range ended now (levels can still change).`};
    if(d.state==='pending' && p.min<LBX.lastEntry){ const tp1=d.hi+LBX.tpR*d.risk, tp2=d.lo-LBX.tpR*d.risk, hb=d.hold.buy, hs=d.hold.sell;
      const tpTxt=(h,tp)=>h==='short'?`, TP ${f(tp)}`:', no TP: trail the stop', why=h=>mode==='auto'?` [${h==='long'?'with the trend: hold long':'against the trend: quick profit'}]`:'';
      return {word:'ORDERS READY', kind:'plan', cards:lbPendCards(d), pend:{hi:d.hi, lo:d.lo, risk:d.risk, tp1:hb==='short'?tp1:null, tp2:hs==='short'?tp2:null, hb, hs},
        msg:`Place 2 pending orders in MT5: BUY STOP ${f(d.hi)} (SL ${f(d.lo)}${tpTxt(hb,tp1)})${why(hb)} and SELL STOP ${f(d.lo)} (SL ${f(d.hi)}${tpTxt(hs,tp2)})${why(hs)}. When one fills, delete the other. Delete both at ${khTime(Date.now()+(LBX.lastEntry-p.min)*60e3)} Cambodia time if nothing fills. ${lotTxt(d.risk)}.`}; }
    if(d.state==='done' && d.trade){ const t=d.trade; return {done:t, word: t.r>0.02?`DONE TODAY +$${f(usd(t.pnl))}`:t.dir===0?'DONE TODAY (whipsaw)':`DONE TODAY ${(t.pnl>=0?'+$':'−$')+f(Math.abs(usd(t.pnl)))}`, kind:'idle', msg: t.dir===0 ? 'Price hit both orders in one candle (whipsaw). One trade per day: nothing more to do today.' : t.why==='Stop loss' ? `Stop loss: a false breakout. Price broke ${t.dir>0?'above':'below'} the range, then turned back. This is normal for this strategy: in tests the first break failed on about half the days (Short-term) and on 6 of 10 days (Long line). The few big winners pay for these losses. Do not re-enter or reverse: tests show reversing lowers results. One trade per day: wait for tomorrow.` : `${t.why}. One trade per day: nothing more to do today.`}; }
    if(d.state==='nofill' || p.min>=LBX.lastEntry) return {word:'NO TRADE TODAY', kind:'idle', msg:'Price did not break the range before 15:00 London. Delete any pending orders. Next range: tomorrow.'}; }
  if(p.min<LBX.rangeStart){ const mins=LBX.rangeStart-p.min; return {word:'WAIT FOR RANGE', kind:'idle', msg:`The range starts in ${Math.floor(mins/60)} h ${mins%60} min, at ${khTime(Date.now()+mins*60e3)} Cambodia time (London 08:00). Nothing to do before then.`}; }
  return {word:'NO TRADE TODAY', kind:'idle', msg:'Today\'s chance has passed. Next range: tomorrow, London 08:00.'}; }

function renderLbSig(){ const r=LB.res, I=lbInfo(r), mode=lbMode();
  ['lbSig','dLbSig'].forEach(id=>{ const box=$(id); if(!box) return; clear(box); box.className='sigbar '+(I.kind==='plan'?'plan':I.kind);
    box.append(el('span','sigword',I.word), el('span','sigmsg',I.msg));
    const cards=el('div','tradecards');
    if(I.lv) cards.appendChild(tradeCard(`${I.lv.side.toUpperCase()} OPEN · do this in MT5`, I.lv));
    else if(I.cards) I.cards.forEach(([t,o])=>cards.appendChild(tradeCard(t, o, (o.side==='buy'?'buy':'sell')+' plan')));
    else if(I.done?.dir){ const t=I.done; cards.appendChild(tradeCard(`Today: ${t.side.toUpperCase()} closed at ${f2(t.exit)} (${t.why}, ${t.pnl>=0?'+':'−'}$${f2(Math.abs(usd(t.pnl)))})`, {side:t.side, entry:t.entry, sl:t.sl0, sl0:t.sl0, tp:t.tp, hold:t.hold})); }
    if(cards.children.length) box.appendChild(cards); });
  const st=$('lbStats'); if(st){ const s=lbStats(r), R=LB_STATS[mode]; clear(st);
    st.appendChild(el('div','small', `${R.label} mode, tested on real gold data (2017, 2018, Sep–Oct 2026, spread and slippage included): profit factor ${R.pf}, win rate ${R.win}, average ${R.avgR} per trade, ${R.trades}. ${R.note} Expect losing runs: up to ${R.streak} losses in a row happened in the tests. Size your lot so you can survive that.`));
    if(s.n) st.appendChild(el('div','small muted', `On the candles loaded now: ${s.n} trades, ${s.w} won (${s.rate.toFixed(0)}%), total ${s.totR>=0?'+':''}${s.totR.toFixed(1)}R, profit factor ${s.pf>=99?'–':s.pf.toFixed(2)}${LB.long?' (about 7 weeks of history)':''}.`)); }
  renderLbBadge(I); }

// ----- alerts on each step -----
function lbAlerts(){ const r=LB.res; if(!r || !S.live || cfg.lbAlerts===false) return; const d=r.today, p=ldn(Date.now()/1000); if(!d || d.key!==p.key) return;
  const once=(k,msg)=>{ if(LB.seen.has(k)) return; LB.seen.add(k); LS.set('goldAiDesk.lbSeen',[...LB.seen].slice(-60)); notify(msg); };
  if(d.state==='pending' && p.min<LBX.lastEntry) once(d.key+'|pend', `LONDON BREAKOUT: place BUY STOP ${f2(d.hi)} (${d.hold.buy==='short'?`TP ${f2(d.hi+LBX.tpR*d.risk)}`:'no TP, trail'}) and SELL STOP ${f2(d.lo)} (${d.hold.sell==='short'?`TP ${f2(d.lo-LBX.tpR*d.risk)}`:'no TP, trail'}). SL = the other side of the range.`);
  const t=d.trade; if(t && t.dir){ once(d.key+'|fill', `LONDON BREAKOUT: ${t.side.toUpperCase()} filled at about ${f2(t.entry)}. Delete the other order. SL ${f2(t.sl0)}${t.tp!=null?`, TP ${f2(t.tp)}`:''}.`);
    if(!t.open) once(d.key+'|exit', `LONDON BREAKOUT: trade closed. ${t.why}, ${t.pnl>=0?'+$':'−$'}${f2(Math.abs(usd(t.pnl)))}.`); } }

// ----- chart -----
function lbInit(){ if(LB.ready || !window.LightweightCharts) return LB.ready; const node=$('lbChart'); if(!node) return false;
  LB.ch=mkChart(node); LB.cs=LB.ch.addCandlestickSeries(candleStyle()); LB.pad=LB.ch.addLineSeries({color:'rgba(0,0,0,0)', lineWidth:1, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false});
  LB.ch.timeScale().subscribeVisibleLogicalRangeChange(()=>requestAnimationFrame(lbOverlay)); new ResizeObserver(()=>requestAnimationFrame(lbOverlay)).observe(node); LB.plines=[];
  LB.ready=true; return true; }
function lbDraw(fit){ const r=LB.res; if(!lbInit() || !r) return; const b=r.b;
  if(LB.fitKey!==(LB.long?'L':'S')){ fit=true; LB.fitKey=LB.long?'L':'S'; } const snap = fit ? null : viewSnap(LB.ch, LB.prevB); LB.prevB=b;
  LB.cs.setData(b.map(x=>({time:x.t+OFF, open:x.o, high:x.h, low:x.l, close:x.c})));
  LB.pad.setData(Array.from({length:24},(_,k)=>({time:b.at(-1).t+OFF+900*(k+1)})));
  LB.cs.setMarkers(r.trades.filter(t=>t.dir).map(t=>({time:b[t.i].t+OFF, position:t.dir>0?'belowBar':'aboveBar', color:t.dir>0?C.up():C.down(), shape:t.dir>0?'arrowUp':'arrowDown'})));
  if(fit) LB.ch.timeScale().setVisibleLogicalRange({from:Math.max(0,b.length-140), to:b.length+18}); else viewRestore(LB.ch, snap, b);
  renderLbBadge(lbInfo(r)); lbOverlay(); }
function lbOverlay(){ const Lr=$('lbLayer'); if(!Lr || !LB.ready || !LB.res || $('lbWrap').hidden) return; Lr.innerHTML='';
  const r=LB.res, b=r.b, n=b.length, ts=LB.ch.timeScale(), W=ts.width(), H=$('lbChart').clientHeight-26;
  const X=i=>ts.logicalToCoordinate(i), Y=p=>LB.cs.priceToCoordinate(p);
  const box=(i1,i2,p1,p2,cls,label)=>{ let x1=X(i1), x2=X(i2), y1=Y(Math.max(p1,p2)), y2=Y(Math.min(p1,p2)); if([x1,x2,y1,y2].some(v=>v==null) || x2<0 || x1>W) return; x1=Math.max(x1,0); x2=Math.min(x2,W);
    const q=el('div','sbox '+cls); Object.assign(q.style,{left:x1+'px', top:y1+'px', width:Math.max(2,x2-x1)+'px', height:Math.max(2,y2-y1)+'px'}); if(label) q.appendChild(el('span','slab',label)); Lr.appendChild(q); };
  const hline=(i1,i2,p,cls,label)=>{ let x1=X(i1), x2=X(i2), y=Y(p); if([x1,x2,y].some(v=>v==null) || x2<0 || x1>W) return; x1=Math.max(x1,0); x2=Math.min(x2,W);
    const q=el('div','sline '+cls); Object.assign(q.style,{left:x1+'px', top:y+'px', width:Math.max(2,x2-x1)+'px'}); if(label) q.appendChild(el('span','stxt',label)); Lr.appendChild(q); };
  const tag=(i,p,txt,cls,up)=>{ const x=X(i), y=Y(p); if(x==null||y==null||x<0||x>W) return; const q=el('div','stag '+cls+(up?' up':' dn'),txt); Lr.appendChild(q); const w=q.offsetWidth, h=q.offsetHeight;
    q.style.left=Math.min(Math.max(x-w/2,2),W-w-2)+'px'; q.style.top=Math.min(Math.max(up?y-h-8:y+8,2),H-h)+'px'; };
  r.days.forEach(d=>{ if(d.hi==null) return; const i1=d.rng[0], i2=d.rng.at(-1)+1; box(i1, i2, d.hi, d.lo, 'lbrange', 'Range');
    const end = d.trade ? d.trade.i : (d.win.length ? d.win.at(-1)+1 : n-1+12);
    if(d.state!=='building'){ hline(i2, end, d.hi, 'lbbuy', d.trade?'':'Buy stop'); hline(i2, end, d.lo, 'lbsell', d.trade?'':'Sell stop'); } });
  r.trades.forEach(t=>{ if(!t.dir) { tag(t.i, t.entry, 'Both sides hit', 'close', true); return; }
    const end = t.open ? n-1+12 : t.exitI; if(t.tp!=null) box(t.i, end, t.entry, t.tp, 'tbox win', t.open?`TP ${f2(t.tp)}`:''); box(t.i, end, t.entry, t.sl0, 'tbox loss', t.open?`SL ${f2(t.sl0)}`:'');
    if(t.trail.length) t.trail.forEach(([j,v],k)=>{ const nx=t.trail[k+1]?.[0] ?? (t.open?n-1:t.exitI); hline(j, nx, v, 'lbtrail', k===t.trail.length-1&&t.open?'Trail':''); });
    if(t.hold==='long' && t.open){ const R=t.risk; [[1.5,'Target 1'],[3,'Target 2']].forEach(([k,lb])=>hline(t.i, end, t.entry+t.dir*k*R, 'lbtrail guide', `${lb} ${f2(t.entry+t.dir*k*R)} (guide)`)); }
    tag(t.i, t.dir>0?Math.min(t.sl0,b[t.i].l):Math.max(t.sl0,b[t.i].h), t.open ? `${t.side.toUpperCase()} ${f2(t.entry)} · SL ${f2(t.sl0)} · ${t.tp!=null?`TP ${f2(t.tp)}`:'trail'}` : `${t.side.toUpperCase()} ${f2(t.entry)}`, t.side, t.dir<0);
    if(!t.open){ const k=t.why==='Take profit'?'tp':t.pnl<0?'sl':'close'; tag(t.exitI, t.exit, `${t.why==='Take profit'?'TP':t.why==='Stop loss'?'SL':t.why==='Trailing stop'?'Trail':'Close'} ${t.pnl>=0?'+':'−'}$${f2(Math.abs(usd(t.pnl)))}`, k, t.dir>0 ? t.pnl>=0 : t.pnl<0); } });
  // plan for today's two orders (ORDERS READY, or a preview while the range is building)
  const I=lbInfo(r); if(I.cards){ const i0=n-1, i1=n-1+16, pv=I.word==='RANGE BUILDING';
    I.cards.forEach(([title,o])=>{ const dir=o.side==='buy'?1:-1, R=Math.abs(o.entry-o.sl), goal=o.tp ?? o.entry+dir*1.5*R;
      box(i0, i1, o.entry, goal, 'tbox win plan'+(o.tp==null?' guide':''), o.tp!=null?`${o.side==='buy'?'Buy':'Sell'} TP ${f2(o.tp)}`:`${o.side==='buy'?'Buy':'Sell'}: no TP, trail (guide ${f2(goal)})`);
      tag(i0+8, o.entry, `${pv?'IF ':''}${o.side==='buy'?'BUY STOP':'SELL STOP'} ${f2(o.entry)} · SL ${f2(o.sl)} · ${o.tp!=null?`TP ${f2(o.tp)}`:'trail'}`, 'plan', dir>0); });
    box(i0, i1, I.cards[0][1].entry, I.cards[1][1].entry, 'tbox loss plan', 'SL zone (the range)'); } }
function renderLbBadge(I){ const bd=$('lbBadge'); if(!bd) return; clear(bd); bd.className='chartbadge smcbadge '+(I.kind==='plan'?'plan':I.kind); bd.appendChild(el('div','cbword',I.word));
  const lotLine=R=>{ const l=lotFor(R); return `Lot ${Math.max(l,0.01).toFixed(2)}${l<0.01?' ⚠':''} · risk −$${f2(R*Math.max(l,0.01)*100)}`; };
  if(I.lv){ const v=I.lv, dir=v.side==='buy'?1:-1, R=Math.abs(v.entry-v.sl0);
    bd.appendChild(el('div','cbnums',`Entry ${f2(v.entry)} · ${v.trailing?'Trail':'SL'} ${f2(v.sl)} · ${v.tp!=null?`TP ${f2(v.tp)}`:`no TP · T1 ${f2(v.entry+dir*1.5*R)} · T2 ${f2(v.entry+dir*3*R)} (guides)`}`));
    bd.appendChild(el('div','cbnums',`${lotLine(R)} · ${HOLD_NAMES[v.hold||'short']} · close by ${v.closeBy}`)); }
  else if(I.pend){ const P=I.pend; bd.appendChild(el('div','cbnums',`BUY STOP ${f2(P.hi)} · SL ${f2(P.lo)} · ${P.tp1!=null?`TP ${f2(P.tp1)}`:'no TP, trail'}`));
    bd.appendChild(el('div','cbnums',`SELL STOP ${f2(P.lo)} · SL ${f2(P.hi)} · ${P.tp2!=null?`TP ${f2(P.tp2)}`:'no TP, trail'}`)); bd.appendChild(el('div','cbnums',lotLine(P.risk))); }
  else bd.appendChild(el('div','cbnums', I.msg.length>90 ? I.msg.slice(0,88)+'…' : I.msg));
  if(!LB.cs) return; (LB.plines||[]).forEach(l=>LB.cs.removePriceLine(l)); LB.plines=[];
  const pl=(price,color,title)=>LB.plines.push(LB.cs.createPriceLine({price, color, lineWidth:1, lineStyle:2, lineVisible:false, axisLabelVisible:true, title}));
  if(I.lv){ const v=I.lv, dir=v.side==='buy'?1:-1, R=Math.abs(v.entry-v.sl0); pl(v.entry, dir>0?C.up():C.down(), v.side.toUpperCase()); pl(v.sl, C.down(), v.trailing?'Trail':'SL');
    if(v.tp!=null) pl(v.tp, C.up(), 'TP'); else { pl(v.entry+dir*1.5*R, '#8e9bb3', 'T1 guide'); pl(v.entry+dir*3*R, '#8e9bb3', 'T2 guide'); } }
  else if(I.pend){ pl(I.pend.hi, C.up(), 'Buy stop'); pl(I.pend.lo, C.down(), 'Sell stop'); if(I.pend.tp1!=null) pl(I.pend.tp1, C.up(), 'Buy TP'); if(I.pend.tp2!=null) pl(I.pend.tp2, C.down(), 'Sell TP'); } }
function lbEmpty(){ chartEmpty('lbWrap', !lbBars()?.length, 'London Breakout chart'); }

// ----- refresh -----
function lbBars(){ const live=S.candles['15min']; if(!LB.long) return live; if(!live?.length) return LB.long;
  const t0=live[0].t; return LB.long.filter(x=>x.t<t0).concat(live); }
function lbRefresh(fit){ const b=lbBars(); LB.res = b?.length ? lbAnalyze(b) : null; renderLbSig(); lbAlerts(); lbEmpty(); if(!$('holdBar')?.hidden) renderHoldBar(); if(!$('lbWrap')?.hidden) lbDraw(fit); }
function lbTick(){ if(LB.tickQ) return; LB.tickQ=requestAnimationFrame(()=>{ LB.tickQ=0; if(Date.now()-(LB.lastRun||0)>1000){ LB.lastRun=Date.now(); lbRefresh(false); } else if(LB.ready && !$('lbWrap').hidden){ const x=lbBars()?.at(-1); if(x) try{ LB.cs.update({time:x.t+OFF, open:x.o, high:x.h, low:x.l, close:x.c}); }catch(e){} } }); }
async function lbLoadHistory(){ const btn=$('lbHist'); if(btn) btn.disabled=true;
  try{ LB.long=await series('15min',5000); LB.longAt=Date.now(); toast(`Loaded ${LB.long.length} candles (about 7 weeks) for the test.`); lbRefresh(true); }
  catch(e){ toast('Could not load history: '+e.message); } finally{ if(btn) btn.disabled=false; } }
function lbSetMode(m){ const changed=cfg.lbMode!==m; cfg.lbMode=m; LS.set(CFG_KEY, cfg); $$('[data-lbmode]').forEach(x=>x.setAttribute('aria-selected', x.dataset.lbmode===m?'true':'false')); const sel=$('lbMode'); if(sel) sel.value=m;
  lbRefresh(false); renderHoldBar(); if(typeof renderOldWarn==='function') renderOldWarn(); if(changed){ if(typeof smcRefresh==='function') smcRefresh(false); if(typeof tagRefreshHold==='function') tagRefreshHold(); } }
// ----- holding style bar (shared by London Breakout, Analysis chart + Tags and SMC) -----
const HOLD_HELP = {short:'Fixed take profit and close the same day. Good when the market only moves a little and changes direction often.',
  long:'No fixed take profit: the stop loss follows the price (trailing stop) and the trade can stay open up to 24 h. Good when a strong trend keeps going.',
  auto:'The desk decides for each trade: WITH the trend (15 min EMA 200) = hold Long line; AGAINST the trend = take the Short-term profit.'};
function renderHoldBar(){ const box=$('holdInfo'); if(!box) return; const m=holdMode(), t=holdTrend(lbBars()||S.candles['15min']); clear(box);
  box.appendChild(el('div','small', `${HOLD_NAMES[m]}: ${HOLD_HELP[m]}`));
  if(t){ const up=t.dir>0, row=el('div','small holdtrend '+(up?'up':'down'));
    row.append(el('b',null,`Trend check now: ${up?'UP':'DOWN'}`), document.createTextNode(` · price ${f2(t.p)} is ${up?'above':'below'} the 15 min EMA 200 (${f2(t.e)}). ${up?'BUY':'SELL'} trades go with the trend: these are the ones worth holding long. ${up?'SELL':'BUY'} trades go against it: take the quick profit.${t.warm?'':' (Few candles loaded: trend is a rough guess.)'}`));
    box.appendChild(row); } }
DATA_HOOKS.push(()=>lbRefresh(false));
TICK_HOOKS.push(lbTick);
THEME_HOOKS.push(()=>{ if(LB.cs){ LB.cs.applyOptions(candleStyle()); lbOverlay(); } });
setInterval(()=>{ if(!S.live) lbRefresh(false); }, 30e3);   // keep the clock-based status right even without new prices
