// ===== Charts: analysis chart with indicator panes, sparkline, small charts, TradingView widgets =====
const CHARTS = [];
const OFF = 7*3600;            // show chart times in Cambodia time
const C = { up:()=>cssVar('--up'), down:()=>cssVar('--down'), gold:()=>cssVar('--gold'), muted:()=>cssVar('--muted'), line:()=>cssVar('--line'), info:()=>cssVar('--info') };
function rgba(hex, a){ const h=hex.replace('#',''); const n=parseInt(h.length===3?h.split('').map(c=>c+c).join(''):h.slice(0,6),16); return `rgba(${n>>16&255},${n>>8&255},${n&255},${a})`; }
function chartOpts(extra={}){
  const base={autoSize:true, localization:{locale:'en-US'},
    layout:{background:{type:'solid', color:'transparent'}, textColor:C.muted(), fontFamily:"'IBM Plex Sans', system-ui, sans-serif", fontSize:12},
    grid:{vertLines:{color:C.line()}, horzLines:{color:C.line()}}, rightPriceScale:{borderColor:C.line(), minimumWidth:72},
    timeScale:{borderColor:C.line(), timeVisible:true, secondsVisible:false}, crosshair:{mode:0}};
  const out={...base, ...extra};
  ['layout','grid','rightPriceScale','timeScale','crosshair'].forEach(k=>{ if(extra[k]) out[k]={...base[k], ...extra[k]}; });
  if(extra.grid) out.grid={vertLines:{...base.grid.vertLines, ...(extra.grid.vertLines||{})}, horzLines:{...base.grid.horzLines, ...(extra.grid.horzLines||{})}};
  return out; }
function mkChart(node, extra){ if(!window.LightweightCharts || !node) return null; const ch=LightweightCharts.createChart(node, chartOpts(extra)); CHARTS.push({ch, extra}); return ch; }
function candleStyle(){ return {upColor:C.up(), downColor:C.down(), borderVisible:false, wickUpColor:C.up(), wickDownColor:C.down()}; }
const pts = (b, arr) => b.map((x,i)=> arr[i]==null ? {time:x.t+OFF} : {time:x.t+OFF, value:arr[i]});
THEME_HOOKS.push(()=>{ CHARTS.forEach(({ch,extra})=>{ try{ ch.applyOptions(chartOpts(extra)); }catch(e){} });
  [ANA.candles, DX.candles].forEach(s=>s?.applyOptions(candleStyle())); if(ANA.ready) anaDraw(false); drawSpark(); });

// ----- analysis chart -----
const OVERLAYS=[['ema20','EMA 20'],['ema50','EMA 50'],['ema200','EMA 200'],['bb','Bollinger'],['pivots','Pivots'],['sr','Support and resistance'],['fib','Fibonacci'],['plan','My plan'],['markers','Signal markers'],['rsi','RSI pane'],['macd','MACD pane']];
const ANA = {ready:false, tf:'15min', ov:{ema20:true, ema50:true, ema200:false, bb:false, pivots:true, sr:true, fib:false, plan:true, markers:true, tags:true, past:true, now:true, future:true, tagFull:false, rsi:true, macd:true, ...LS.get('goldAiDesk.ov',{})}, plines:[], arr:{}};
function anaInit(){
  if(ANA.ready || !window.LightweightCharts) return false;
  const m=ANA.main=mkChart($('mainChart'));
  ANA.candles=m.addCandlestickSeries(candleStyle());
  const ln=(color,w=1.5,style=0)=>m.addLineSeries({color, lineWidth:w, lineStyle:style, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false});
  ANA.e20=ln('#6aa5f7'); ANA.e50=ln('#f0883e'); ANA.e200=ln('#b58cf5');
  ANA.tsr=[];
  ANA.bbU=ln('#8e9bb3',1,2); ANA.bbM=ln('#8e9bb3',1,1); ANA.bbL=ln('#8e9bb3',1,2);
  const sub={handleScroll:false, handleScale:false, timeScale:{visible:false, borderColor:C.line()}, layout:{attributionLogo:false}};
  ANA.rsiC=mkChart($('rsiChart'), sub); ANA.rsiS=ANA.rsiC.addLineSeries({color:'#b58cf5', lineWidth:1.5, priceLineVisible:false});
  [70,30].forEach(v=>ANA.rsiS.createPriceLine({price:v, color:'#8e9bb3', lineWidth:1, lineStyle:2, axisLabelVisible:true, title:''}));
  ANA.macdC=mkChart($('macdChart'), sub);
  ANA.mH=ANA.macdC.addHistogramSeries({priceLineVisible:false, lastValueVisible:false}); ANA.mL=ANA.macdC.addLineSeries({color:'#6aa5f7', lineWidth:1.5, priceLineVisible:false, lastValueVisible:false}); ANA.mS=ANA.macdC.addLineSeries({color:'#f0883e', lineWidth:1.5, priceLineVisible:false, lastValueVisible:false});
  m.timeScale().subscribeVisibleLogicalRangeChange(r=>{ if(!r) return; [ANA.rsiC, ANA.macdC].forEach(c=>c.timeScale().setVisibleLogicalRange(r)); });
  m.subscribeCrosshairMove(p=>{ ohlcReadout(p.time ? p.time : null); const h=p.time??null; if(h!==ANA.hoverT){ ANA.hoverT=h; requestAnimationFrame(placeTags); } });
  m.timeScale().subscribeVisibleLogicalRangeChange(()=>requestAnimationFrame(placeTags)); new ResizeObserver(()=>requestAnimationFrame(placeTags)).observe($('mainChart'));
  ANA.ready=true; return true; }
function anaBars(){ return ANA.tf==='4h' ? (S.candles['1h'] ? aggregate(S.candles['1h'],14400) : null) : S.candles[ANA.tf]; }
function anaDraw(fit){
  if(!ANA.ready && !anaInit()) return; const b=anaBars(); if(!b?.length) return; const o=ANA.ov, c=b.map(x=>x.c);
  ANA.candles.setData(b.map(x=>({time:x.t+OFF, open:x.o, high:x.h, low:x.l, close:x.c})));
  const e20=ema(c,20), e50=ema(c,50), e200=ema(c,200).map((v,i)=>i<199?null:v), bb=bollinger(c), r=rsi(c), m=macd(c);
  ANA.arr={b, e20, e50, r, mh:m.hist}; ANA.idx=new Map(b.map((x,i)=>[x.t+OFF,i]));
  ANA.e20.setData(o.ema20?pts(b,e20):[]); ANA.e50.setData(o.ema50?pts(b,e50):[]); ANA.e200.setData(o.ema200?pts(b,e200):[]);
  ANA.bbU.setData(o.bb?pts(b,bb.up):[]); ANA.bbM.setData(o.bb?pts(b,bb.mid):[]); ANA.bbL.setData(o.bb?pts(b,bb.lo):[]);
  ANA.rsiS.setData(pts(b,r)); ANA.mL.setData(pts(b,m.line)); ANA.mS.setData(pts(b,m.signal));
  ANA.mH.setData(b.map((x,i)=> m.hist[i]==null ? {time:x.t+OFF} : {time:x.t+OFF, value:m.hist[i], color: m.hist[i]>=0 ? C.up() : C.down()}));
  $('rsiChart').hidden=$('rsiLabel').hidden=!o.rsi; $('macdChart').hidden=$('macdLabel').hidden=!o.macd;
  ANA.plines.forEach(l=>ANA.candles.removePriceLine(l)); ANA.plines=[];
  const pl=(price,color,title,style=2,line=true)=>{ if(price!=null && !isNaN(price)) ANA.plines.push(ANA.candles.createPriceLine({price, color, lineWidth:1, lineStyle:style, lineVisible:line, axisLabelVisible:true, title})); };
  const kl=keyLevels();
  if(o.pivots && kl?.pivots){ const p=kl.pivots; pl(p.P,'#8e9bb3','Pivot'); pl(p.R1,C.down(),'R1'); pl(p.R2,C.down(),'R2'); pl(p.S1,C.up(),'S1'); pl(p.S2,C.up(),'S2'); }
  if(o.sr && kl?.sr){ kl.sr.above.forEach(x=>pl(x.p,C.down(),'Resistance',0)); kl.sr.below.forEach(x=>pl(x.p,C.up(),'Support',0)); }
  if(o.fib && kl?.fib) kl.fib.levels.forEach(l=>pl(l.p,'#b58cf5','Fib '+(l.r*100).toFixed(1)+'%',1));
  if(o.plan && S.plan){ const p=S.plan; pl(p.entry_low,C.gold(),'Entry'); pl(p.entry_high,C.gold(),'Entry'); pl(p.stop_loss,C.down(),'SL',0); pl(p.take_profit,C.up(),'TP',0); pl(p.breakeven_at,'#f0883e','Move SL'); if(S.mon.entry) pl(S.mon.entry,'#8e9bb3','My entry',0); }
  const tagMode = typeof chartMode!=='undefined' && chartMode==='tag';
  if(tagMode) drawTrades(b, o, pl);
  else { ANA.tsr.forEach(x=>ANA.main.removeSeries(x)); ANA.tsr=[]; ANA.tags=[]; ANA.vl=[]; placeTags();
    ANA.candles.setMarkers(o.markers && ANA.tf==='15min' ? signalMarkers(b, S.candles['1h']).map(s=>({time:s.t+OFF, position:s.side==='buy'?'belowBar':'aboveBar', color:s.side==='buy'?C.up():C.down(), shape:s.side==='buy'?'arrowUp':'arrowDown', text:''})) : []); }
  if(fit) ANA.main.timeScale().setVisibleLogicalRange({from:Math.max(0,b.length-160), to:b.length+(tagMode?44:6)});
  ohlcReadout(null); }
let CT={key:'', r:null};
function chartTrades(){ const b=S.candles['15min']; if(!b || b.length<60) return null; const x=b.at(-1), key=b.length+'|'+x.t+'|'+x.c+'|'+x.h+'|'+x.l+'|'+(S.candles['1h']?.length||0);
  if(CT.key!==key){ CT={key, r:backtest(b, S.candles['1h']||[], {spread:0.3, be:true, window:false, skip:false, closedOnly:true, mkt:true})}; } return CT.r; }
const usdTxt=v=>(v>=0?'+$':'−$')+f2(Math.abs(usd(v)));
function pastPoint(tr){ return {id:`${tr.side}-${tr.t}`, scope:'past', side:tr.side, entry:tr.entry, sl:tr.sl0, tp:tr.tp, be:tr.beAt, t:tr.t-900, label:`entered ${khStamp((tr.t)*1000)} (past trade)`, outcome:`${tr.why}, result ${usdTxt(tr.pnl)}`}; }
function nowPoint(){ const bt=chartTrades(), op=bt?.open, sg=S.signal;
  if(op){ const now=S.price||S.candles['15min']?.at(-1)?.c, pnl=(now-op.entry)*op.dir;
    return {id:`${op.side}-${op.t}`, scope:'now', side:op.side, entry:op.entry, sl:op.sl0, tp:op.tp, be:op.beAt, t:op.t-900, open:true, label:`open trade since ${khTime(op.t*1000)} Cambodia time`, extra:`Current price ${f2(now)}, open result ${usdTxt(pnl)}.${op.be?' The stop loss has already been moved to entry.':''}`}; }
  if(sg && sg.state==='signal') return {id:`sig-${sg.side}-${sg.bar}`, scope:'now', side:sg.side, entry:sg.entry, sl:sg.sl, tp:sg.tp, be:sg.be, t:sg.bar, label:'new signal on the last closed 15 min candle (not entered yet)'};
  if(sg && sg.state==='forming') return {id:`form-${sg.side}-${sg.bar}`, scope:'now', side:sg.side, entry:sg.entry, sl:sg.sl, tp:sg.tp, be:sg.be, t:sg.bar, forming:true, label:`setup forming, 4 of 5 checks (missing: ${sg.checks.filter(c=>!c[1]).map(c=>c[0]).join(', ')})`};
  if(sg && sg.entry!=null) return {id:`mkt-${sg.side}-${sg.bar}`, scope:'now', market:true, side:sg.side, entry:sg.entry, sl:sg.sl, tp:sg.tp, be:sg.be, t:sg.bar, label:`no setup yet (${sg.n} of 5 checks for a ${sg.side}). Question: should the trader wait, or prepare a ${sg.side} at these levels`};
  return null; }
// ----- trades on the chart: past (entry, SL moved, exit), now (open trade), plan ahead (dashed) -----
function drawTrades(b, o, pl){
  const segs=[], mk=[], tags=[], vl=[], on=ANA.tf==='15min' && o.tags!==false, sg=S.signal, P=o.past, N=o.now, F=o.future;
  const usd$=v=>(v>=0?'+$':'−$')+f2(Math.abs(usd(v)));
  const STY={tE:['#8e9bb3',1,0], tS:[C.down(),2,0], tT:[C.up(),2,0], fE:['#e9a23b',2,3], fS:[C.down(),2,3], fT:[C.up(),2,3], fB:['#e9a23b',1,1]};
  const seg=(k,t1,t2,v)=>{ if(t2>t1) segs.push({k:k.replace(/\d$/,''), d:[{time:t1,value:v},{time:t2,value:v}]}); };
  const fseg=(k,tl,f,v)=>segs.push({k, d:[tl,...f].map(time=>({time,value:v}))});
  const tag=(time,price,text,kind,up,short,pid,mark)=>{ const x=b.find(q=>q.t+OFF===time); tags.push({time, price: x ? (up?x.h:x.l) : price, text, short:short||text, kind, up, pid, mark}); };
  ANA.points={};
  const step=900, last=b.at(-1).t, fut=n=>Array.from({length:n},(_,i)=>last+step*(i+1));
  if(on){
    const bt=chartTrades()||{trades:[], open:null};
    const col=s=>s==='buy'?C.up():C.down(), arr=s=>s==='buy'?'arrowUp':'arrowDown', pos=s=>s==='buy'?'belowBar':'aboveBar', nm=s=>s==='buy'?'BUY':'SELL';
    const bar=t=>b.find(x=>x.t===t);
    const entry=(tr,pre='',pt)=>{ const t=tr.t-step, x=bar(t); mk.push({time:t+OFF, position:pos(tr.side), color:col(tr.side), shape:arr(tr.side)});
      if(pt) ANA.points[pt.id]=pt; const rk=tr.tooRisky; tag(t+OFF, tr.entry, `${pre}${nm(tr.side)} ${f2(tr.entry)}${rk?` · SL ${f2(Math.abs(tr.entry-tr.sl0))} away, over your ${f2(maxDist())} limit: skip or smaller lot`:''}`, tr.side, tr.side!=='buy', pre+nm(tr.side)+(rk?' ⚠':''), pt?.id, 'full'); };
    const be=tr=>{ if(!tr.beT) return; const t=tr.beT-step; mk.push({time:t+OFF, position:'inBar', color:'#e9a23b', shape:'circle'}); tag(t+OFF, tr.beAt, 'Move SL → entry', 'be', tr.side==='buy', 'BE'); };
    if(P) bt.trades.forEach((tr,j)=>{ const t1=tr.t-step+OFF, t2=tr.exitT-step+OFF, q=j%2; entry(tr,'',pastPoint(tr)); be(tr);
      seg('tE'+q,t1,t2,tr.entry); seg('tS'+q,t1,t2,tr.sl0); seg('tT'+q,t1,t2,tr.tp);
      const k = tr.why==='Take profit' ? ['tp','TP hit '+usd$(tr.pnl),'TP '+usd$(tr.pnl)] : tr.why==='Stop loss' ? ['sl','SL hit '+usd$(tr.pnl),'SL '+usd$(tr.pnl)] : tr.why==='Breakeven' ? ['close','Closed at entry $0','$0'] : tr.why==='Market closed' ? ['close','Closed before market close '+usd$(tr.pnl),'Close '+usd$(tr.pnl)] : ['close','Closed '+usd$(tr.pnl),usd$(tr.pnl)];
      mk.push({time:t2, position:'inBar', color:k[0]==='tp'?C.up():k[0]==='sl'?C.down():'#8e9bb3', shape:k[0]==='tp'?'circle':'square'});
      tag(t2, tr.exit, k[1], k[0], tr.side==='buy' ? k[0]==='tp' : k[0]!=='tp', k[2]); });
    const op=bt.open, tl=last+OFF, f=fut(40).map(t=>t+OFF);
    const closeT=f.find(t=>khTime((t-OFF)*1000)===cfg.closeTime);
    const NP=nowPoint(); if(NP) ANA.points[NP.id]=NP;
    if(op){ const t1=op.t-step+OFF, now=S.price||b.at(-1).c, pnl=(now-op.entry)*op.dir;
      if(N){ entry(op,'▶ ',NP); be(op); const q=bt.trades.length%2; seg('tE'+q,t1,tl,op.entry); seg('tS'+q,t1,tl,op.sl0); seg('tT'+q,t1,tl,op.tp);
        mk.push({time:tl, position:'inBar', color:pnl>=0?C.up():C.down(), shape:'circle'});
        tag(tl, now, `NOW: ${nm(op.side)} open ${usd$(pnl)}`, pnl>=0?'tp':'sl', true, `NOW ${usd$(pnl)}`, NP?.id);
        pl(op.entry,col(op.side),'Entry',0,false); pl(op.sl,C.down(),op.be?'SL (at entry)':'SL',0,false); pl(op.tp,C.up(),'TP',0,false); if(!op.be) pl(op.beAt,'#e9a23b','Move SL',2,false); }
      if(F){ fseg('fE',tl,f,op.entry); fseg('fS',tl,f,op.sl); fseg('fT',tl,f,op.tp); if(!op.be) fseg('fB',tl,f,op.beAt);
        const tf=f[14];
        tag(tf, op.tp, `Close here: TP ${f2(op.tp)} (+$${f2(usd(Math.abs(op.tp-op.entry)))})`, 'tp', op.side==='sell', 'TP', NP?.id, 'sym');
        tag(tf, op.sl, `Close here: SL ${f2(op.sl)}${op.be?' ($0)':' (−$'+f2(usd(Math.abs(op.sl-op.entry)))+')'}`, 'sl', op.side==='buy', 'SL', NP?.id, 'sym');
        if(!op.be) tag(f[26], op.beAt, `Price ${f2(op.beAt)} → move SL to entry`, 'be', op.side==='sell', 'Move SL', NP?.id, 'sym');
        if(closeT) vl.push({time:closeT, text:`Close by ${cfg.closeTime}`}); }
    } else if(sg && sg.state!=='none'){ const c=sg.state==='signal'?col(sg.side):'#e9a23b', x=bar(sg.bar);
      if(N){ mk.push({time:sg.bar+OFF, position:pos(sg.side), color:c, shape:sg.state==='signal'?arr(sg.side):'circle'});
        tag(sg.bar+OFF, sg.side==='buy'?(x?.l??sg.entry):(x?.h??sg.entry), sg.state==='signal'?`NOW: ${nm(sg.side)} ${f2(sg.entry)}`:`NOW: ${nm(sg.side)} forming 4/5 – wait`, sg.state==='signal'?sg.side:'be', sg.side!=='buy', sg.state==='signal'?'NOW '+nm(sg.side):'4/5 wait', NP?.id, 'full');
        pl(sg.entry,c,(sg.state==='signal'?'':'If ')+nm(sg.side),2,false); pl(sg.sl,C.down(),'SL',2,false); pl(sg.tp,C.up(),'TP',2,false); }
      if(F){ fseg('fE',tl,f,sg.entry); fseg('fS',tl,f,sg.sl); fseg('fT',tl,f,sg.tp); fseg('fB',tl,f,sg.be);
        const pre=sg.state==='signal'?'':'If triggered: ';
        tag(f[14], sg.tp, `${pre}TP ${f2(sg.tp)}`, 'tp', sg.side==='sell', 'TP', NP?.id, 'sym'); tag(f[14], sg.sl, `${pre}SL ${f2(sg.sl)}`, 'sl', sg.side==='buy', 'SL', NP?.id, 'sym'); tag(f[26], sg.be, `Move SL → entry at ${f2(sg.be)}`, 'be', sg.side==='sell', 'Move SL', NP?.id, 'sym');
        if(closeT) vl.push({time:closeT, text:`Close by ${cfg.closeTime}`}); }
    } else if(N){ tag(tl, b.at(-1).c, 'NOW: no setup – wait', 'close', true, 'wait', NP?.id, 'full'); }
  }
  ANA.tsr.forEach(x=>ANA.main.removeSeries(x)); ANA.tsr=segs.map(g=>{ const [color,w,st]=STY[g.k]; const x=ANA.main.addLineSeries({color, lineWidth:w, lineStyle:st, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false}); x.setData(g.d); return x; });
  if(!ANA.tsr.length && F && on){ /* keep space for the future even with no lines */ }
  mk.sort((a,b)=>a.time-b.time); ANA.candles.setMarkers(mk); ANA.tags=tags; ANA.vl=vl; $('tradeLegend').hidden=!on; placeTags(); }
// HTML alert tags that follow the chart when you scroll or zoom
function placeTags(){ const L=$('tagLayer'); if(!L || !ANA.ready) return; L.innerHTML=''; if(L.hidden) return; const ts=ANA.main.timeScale(), W=ts.width(), H=$('mainChart').clientHeight-28, placed=[];
  (ANA.vl||[]).forEach(v=>{ const x=ts.timeToCoordinate(v.time); if(x==null||x<0||x>W) return; const d=el('div','vline'); d.style.left=x+'px'; d.appendChild(el('span','vlab',v.text)); L.appendChild(d); });
  (ANA.tags||[]).forEach(t=>{ const x=ts.timeToCoordinate(t.time), y0=ANA.candles.priceToCoordinate(t.price); if(x==null||y0==null||x<0||x>W) return;
    const full=ANA.ov.tagFull || (ANA.hoverT!=null && Math.abs(ANA.hoverT-t.time)<=900), mk=t.pid&&t.mark ? aiMark(t.pid) : '', mt = !mk ? '' : t.mark==='full' ? ' '+mk : ' '+mk.split(' ')[0]+(mk.startsWith('·')?' AI…':' AI');
    const d=el('div','ctag '+t.kind+(t.up?' up':' dn')+(full?' full':'')+(t.pid?' click':'')+(t.pid&&t.pid===S.aiSel?' sel':''), (full?t.text:t.short)+mt);
    if(t.pid){ d.title='Tap to see or ask the AI team check'; d.onclick=()=>{ S.aiSel=t.pid; aicUpdate(); }; } L.appendChild(d); const w=d.offsetWidth, h=d.offsetHeight;
    let left=Math.min(Math.max(x-w/2,2),W-w-2), y=t.up ? y0-h-12 : y0+12;
    for(let k=0;k<6;k++){ const hit=placed.find(r=>left<r.x+r.w+4 && left+w+4>r.x && y<r.y+r.h+3 && y+h+3>r.y); if(!hit) break; y = t.up ? hit.y-h-3 : hit.y+hit.h+3; }
    y=Math.min(Math.max(y,2),H-h); d.style.left=left+'px'; d.style.top=y+'px'; d.style.setProperty('--sx',(x-left)+'px'); placed.push({x:left,y,w,h}); }); }
function anaTick(){ if(!ANA.ready || $('anaWrap').hidden) return; const b=anaBars(); const x=b?.at(-1); if(!x) return;
  try{ ANA.candles.update({time:x.t+OFF, open:x.o, high:x.h, low:x.l, close:x.c}); }catch(e){ anaDraw(false); } ohlcReadout(null); }
function ohlcReadout(time){ const A=ANA.arr; if(!A.b) return; let i = time!=null ? ANA.idx.get(time) : A.b.length-1; if(i==null) i=A.b.length-1; const x=A.b[i], p=A.b[i-1];
  const box=$('ohlc'); box.innerHTML=''; const add=(k,v,cls)=>{ const s=el('span',null,k+' '); const b=el('b',cls,v); s.appendChild(b); box.appendChild(s); };
  const d=new Date((x.t+OFF)*1000), ds=new Intl.DateTimeFormat('en-GB',{timeZone:'UTC', weekday:'short', day:'2-digit', month:'short', year:'numeric'}).format(d)+' '+d.toISOString().slice(11,16);
  add('', ds); add('O', f2(x.o)); add('H', f2(x.h)); add('L', f2(x.l)); add('C', f2(x.c), x.c>=x.o?'up':'down');
  if(p) add('Change', sgn(x.c-p.c)+' ('+pct((x.c-p.c)/p.c*100)+')', x.c>=p.c?'up':'down'); add('Range', '$'+f2(x.h-x.l));
  if(A.r[i]!=null) add('RSI', A.r[i].toFixed(1)); if(A.e20[i]!=null) add('EMA 20', f2(A.e20[i])); }
const TAGSETS=[['past','Past'],['now','Now'],['future','Future']];
function renderTagChips(){ const box=$('tagChips'); if(!box) return; box.innerHTML=''; const o=ANA.ov, all=o.tags!==false;
  const chip=(label,on,cls,fn,title)=>{ const b=el('button','chip tagchip '+cls, label); b.type='button'; b.title=title||''; b.setAttribute('aria-pressed', on?'true':'false'); b.onclick=()=>{ fn(); LS.set('goldAiDesk.ov', o); renderTagChips(); anaDraw(false); }; box.appendChild(b); };
  box.appendChild(el('span','small muted','Show on chart:'));
  chip(all?'👁 Tags on':'🚫 Tags off', all, 'master', ()=>{ o.tags=!all; }, 'Show or hide every tag, line and point');
  TAGSETS.forEach(([k,label])=>chip((o[k]&&all?'👁 ':'◌ ')+label, o[k]&&all, k, ()=>{ if(!all){ o.tags=true; o[k]=true; } else o[k]=!o[k]; }));
  chip(o.tagFull?'Labels: full':'Labels: small', !!o.tagFull, 'size', ()=>{ o.tagFull=!o.tagFull; }, 'Small labels keep the candles clear. Move over a candle to read the full label.'); }
function renderOverlayChips(){ renderTagChips(); const box=$('ovChips'); box.innerHTML='';
  const tagMode = typeof chartMode!=='undefined' && chartMode==='tag';
  OVERLAYS.filter(([k])=>!(tagMode && k==='markers')).forEach(([k,label])=>{ const b=el('button','chip',label); b.type='button'; b.setAttribute('aria-pressed', ANA.ov[k]?'true':'false');
    b.onclick=()=>{ ANA.ov[k]=!ANA.ov[k]; LS.set('goldAiDesk.ov', ANA.ov); b.setAttribute('aria-pressed', ANA.ov[k]?'true':'false'); anaDraw(false); }; box.appendChild(b); }); }

// ----- hero sparkline -----
let SPARK=null;
function drawSpark(){ const b=S.candles['15min']; if(!b?.length || !window.LightweightCharts) return;
  if(!SPARK){ const ch=mkChart($('hSpark'), {layout:{attributionLogo:false}, handleScroll:false, handleScale:false, rightPriceScale:{visible:false}, leftPriceScale:{visible:false}, timeScale:{visible:false}, grid:{vertLines:{visible:false}, horzLines:{visible:false}}, crosshair:{vertLine:{visible:false}, horzLine:{visible:false}}});
    SPARK={ch, s:ch.addAreaSeries({lineWidth:2, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false})}; }
  const w=b.slice(-96), upDay=w.at(-1).c>=w[0].c, col=upDay?C.up():C.down();
  SPARK.s.applyOptions({lineColor:col, topColor:rgba(col,.25), bottomColor:rgba(col,0)});
  SPARK.s.setData(w.map(x=>({time:x.t+OFF, value:x.c}))); SPARK.ch.timeScale().fitContent(); }

// ----- small charts -----
const DX={};
function candleChart(node, b){ if(!window.LightweightCharts) return; node.hidden=false; if(!DX.ch){ DX.ch=mkChart(node, {layout:{attributionLogo:false}}); DX.candles=DX.ch.addCandlestickSeries(candleStyle()); }
  DX.candles.setData(b.map(x=>({time:x.t+OFF, open:x.o, high:x.h, low:x.l, close:x.c}))); DX.ch.timeScale().fitContent(); return DX; }
const EQ={};
function equityChart(key, node, curve){ if(!window.LightweightCharts || !curve.length){ node.hidden=true; return; } node.hidden=false;
  if(!EQ[key]){ const ch=mkChart(node, {layout:{attributionLogo:false}}); EQ[key]={ch, s:ch.addBaselineSeries({baseValue:{type:'price', price:0}, topLineColor:C.up(), bottomLineColor:C.down(), topFillColor1:rgba(C.up(),.2), topFillColor2:rgba(C.up(),.02), bottomFillColor1:rgba(C.down(),.02), bottomFillColor2:rgba(C.down(),.2), lineWidth:2})}; }
  let last=0; const data=[]; curve.forEach(p=>{ let t=p.t+OFF; if(t<=last) t=last+1; last=t; data.push({time:t, value:p.v}); });
  EQ[key].s.setData(data); EQ[key].ch.timeScale().fitContent(); }

// ----- TradingView widgets (display only) -----
const TV_STATE = {};
const tvSym = () => cfg.tvSymbol || 'PEPPERSTONE:XAUUSD';
const TV = {
  tvTicker:['embed-widget-ticker-tape.js', ()=>({showSymbolLogo:true, displayMode:'adaptive', symbols:[{proName:tvSym(),title:'Gold'},{proName:'PEPPERSTONE:XAGUSD',title:'Silver'},{proName:'TVC:DXY',title:'US dollar'},{proName:'TVC:US10Y',title:'US 10Y'},{proName:'FOREXCOM:SPXUSD',title:'S&P 500'},{proName:'TVC:USOIL',title:'Oil'},{proName:'FX:EURUSD',title:'EUR/USD'},{proName:'FX:USDJPY',title:'USD/JPY'},{proName:'BITSTAMP:BTCUSD',title:'Bitcoin'}]})],
  tvAdv:['embed-widget-advanced-chart.js', ()=>({autosize:true, symbol:tvSym(), interval:'15', timezone:'Asia/Phnom_Penh', style:'1', allow_symbol_change:true, details:true, hide_side_toolbar:false, calendar:false, withdateranges:true, studies:['MAExp@tv-basicstudies','RSI@tv-basicstudies','MACD@tv-basicstudies'], support_host:'https://www.tradingview.com'})],
  tvGauge:['embed-widget-technical-analysis.js', ()=>({interval:'15m', width:'100%', height:420, symbol:tvSym(), showIntervalTabs:true, displayMode:'multiple'})],
  tvGlobal:['embed-widget-market-overview.js', ()=>({dateRange:'1D', showChart:true, width:'100%', height:560, showSymbolLogo:true, tabs:[
    {title:'Metals and energy', symbols:[{s:tvSym(),d:'Gold'},{s:'PEPPERSTONE:XAGUSD',d:'Silver'},{s:'TVC:USOIL',d:'WTI oil'}]},
    {title:'USD and yields', symbols:[{s:'TVC:DXY',d:'US dollar index'},{s:'TVC:US10Y',d:'US 10-year yield'},{s:'TVC:US02Y',d:'US 2-year yield'}]},
    {title:'Forex', symbols:[{s:'FX:EURUSD',d:'EUR/USD'},{s:'FX:USDJPY',d:'USD/JPY'},{s:'FX:GBPUSD',d:'GBP/USD'},{s:'FX:AUDUSD',d:'AUD/USD'}]},
    {title:'Stock indices', symbols:[{s:'FOREXCOM:SPXUSD',d:'S&P 500'},{s:'FOREXCOM:NSXUSD',d:'Nasdaq 100'},{s:'INDEX:NKY',d:'Nikkei 225'},{s:'XETR:DAX',d:'DAX'},{s:'TVC:HSI',d:'Hang Seng'}]},
    {title:'Crypto', symbols:[{s:'BITSTAMP:BTCUSD',d:'Bitcoin'}]}]})],
  tvHeat:['embed-widget-forex-heat-map.js', ()=>({width:'100%', height:560, currencies:['EUR','USD','JPY','GBP','CHF','AUD','CAD','CNY']})],
  tvCal:['embed-widget-events.js', ()=>({width:'100%', height:600, importanceFilter:'0,1', countryFilter:'us,eu,gb,jp,cn,au,ca,ch'})],
  tvNews:['embed-widget-timeline.js', ()=>({feedMode:'symbol', symbol:tvSym(), displayMode:'regular', width:'100%', height:600})] };
function tvEnsure(id, force){
  const host=$(id); if(!host) return; if(!force && TV_STATE[id]===S.theme) return; TV_STATE[id]=S.theme;
  const [script, conf]=TV[id]; host.innerHTML=''; host.classList.remove('muted');
  const wrap=el('div','tradingview-widget-container'); wrap.appendChild(el('div','tradingview-widget-container__widget'));
  const sc=document.createElement('script'); sc.src='https://s3.tradingview.com/external-embedding/'+script; sc.async=true;
  sc.textContent=JSON.stringify({colorTheme:S.theme, theme:S.theme, isTransparent:true, locale:'en', ...conf()});
  sc.onerror=()=>{ host.innerHTML=''; host.appendChild(el('p','muted small','TradingView could not load here. Check your connection or ad blocker. The rest of the app still works.')); host.style.padding='14px 18px'; };
  wrap.appendChild(sc); host.appendChild(wrap); }
THEME_HOOKS.push(()=>{ Object.keys(TV_STATE).forEach(id=>{ const host=$(id); if(host && host.offsetParent!==null) tvEnsure(id, true); else delete TV_STATE[id]; }); });
