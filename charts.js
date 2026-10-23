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
const ANA = {ready:false, tf:'15min', ov:{ema20:true, ema50:true, ema200:false, bb:false, pivots:true, sr:true, fib:false, plan:true, markers:true, rsi:true, macd:true, ...LS.get('goldAiDesk.ov',{})}, plines:[], arr:{}};
function anaInit(){
  if(ANA.ready || !window.LightweightCharts) return false;
  const m=ANA.main=mkChart($('mainChart'));
  ANA.candles=m.addCandlestickSeries(candleStyle());
  const ln=(color,w=1.5,style=0)=>m.addLineSeries({color, lineWidth:w, lineStyle:style, priceLineVisible:false, lastValueVisible:false, crosshairMarkerVisible:false});
  ANA.e20=ln('#6aa5f7'); ANA.e50=ln('#f0883e'); ANA.e200=ln('#b58cf5');
  ANA.bbU=ln('#8e9bb3',1,2); ANA.bbM=ln('#8e9bb3',1,1); ANA.bbL=ln('#8e9bb3',1,2);
  const sub={handleScroll:false, handleScale:false, timeScale:{visible:false, borderColor:C.line()}, layout:{attributionLogo:false}};
  ANA.rsiC=mkChart($('rsiChart'), sub); ANA.rsiS=ANA.rsiC.addLineSeries({color:'#b58cf5', lineWidth:1.5, priceLineVisible:false});
  [70,30].forEach(v=>ANA.rsiS.createPriceLine({price:v, color:'#8e9bb3', lineWidth:1, lineStyle:2, axisLabelVisible:true, title:''}));
  ANA.macdC=mkChart($('macdChart'), sub);
  ANA.mH=ANA.macdC.addHistogramSeries({priceLineVisible:false, lastValueVisible:false}); ANA.mL=ANA.macdC.addLineSeries({color:'#6aa5f7', lineWidth:1.5, priceLineVisible:false, lastValueVisible:false}); ANA.mS=ANA.macdC.addLineSeries({color:'#f0883e', lineWidth:1.5, priceLineVisible:false, lastValueVisible:false});
  m.timeScale().subscribeVisibleLogicalRangeChange(r=>{ if(!r) return; [ANA.rsiC, ANA.macdC].forEach(c=>c.timeScale().setVisibleLogicalRange(r)); });
  m.subscribeCrosshairMove(p=>ohlcReadout(p.time ? p.time : null));
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
  const pl=(price,color,title,style=2)=>{ if(price!=null && !isNaN(price)) ANA.plines.push(ANA.candles.createPriceLine({price, color, lineWidth:1, lineStyle:style, axisLabelVisible:true, title})); };
  const kl=keyLevels();
  if(o.pivots && kl?.pivots){ const p=kl.pivots; pl(p.P,'#8e9bb3','Pivot'); pl(p.R1,C.down(),'R1'); pl(p.R2,C.down(),'R2'); pl(p.S1,C.up(),'S1'); pl(p.S2,C.up(),'S2'); }
  if(o.sr && kl?.sr){ kl.sr.above.forEach(x=>pl(x.p,C.down(),'Resistance',0)); kl.sr.below.forEach(x=>pl(x.p,C.up(),'Support',0)); }
  if(o.fib && kl?.fib) kl.fib.levels.forEach(l=>pl(l.p,'#b58cf5','Fib '+(l.r*100).toFixed(1)+'%',1));
  if(o.plan && S.plan){ const p=S.plan; pl(p.entry_low,C.gold(),'Entry'); pl(p.entry_high,C.gold(),'Entry'); pl(p.stop_loss,C.down(),'SL',0); pl(p.take_profit,C.up(),'TP',0); pl(p.breakeven_at,'#f0883e','Move SL'); if(S.mon.entry) pl(S.mon.entry,'#8e9bb3','My entry',0); }
  ANA.candles.setMarkers(o.markers && ANA.tf==='15min' ? signalMarkers(b, S.candles['1h']).map(s=>({time:s.t+OFF, position:s.side==='buy'?'belowBar':'aboveBar', color:s.side==='buy'?C.up():C.down(), shape:s.side==='buy'?'arrowUp':'arrowDown', text:''})) : []);
  if(fit) ANA.main.timeScale().setVisibleLogicalRange({from:Math.max(0,b.length-160), to:b.length+6});
  ohlcReadout(null); }
function anaTick(){ if(!ANA.ready || $('anaWrap').hidden) return; const b=anaBars(); const x=b?.at(-1); if(!x) return;
  try{ ANA.candles.update({time:x.t+OFF, open:x.o, high:x.h, low:x.l, close:x.c}); }catch(e){ anaDraw(false); } ohlcReadout(null); }
function ohlcReadout(time){ const A=ANA.arr; if(!A.b) return; let i = time!=null ? ANA.idx.get(time) : A.b.length-1; if(i==null) i=A.b.length-1; const x=A.b[i], p=A.b[i-1];
  const box=$('ohlc'); box.innerHTML=''; const add=(k,v,cls)=>{ const s=el('span',null,k+' '); const b=el('b',cls,v); s.appendChild(b); box.appendChild(s); };
  const d=new Date((x.t+OFF)*1000), ds=new Intl.DateTimeFormat('en-GB',{timeZone:'UTC', weekday:'short', day:'2-digit', month:'short', year:'numeric'}).format(d)+' '+d.toISOString().slice(11,16);
  add('', ds); add('O', f2(x.o)); add('H', f2(x.h)); add('L', f2(x.l)); add('C', f2(x.c), x.c>=x.o?'up':'down');
  if(p) add('Change', sgn(x.c-p.c)+' ('+pct((x.c-p.c)/p.c*100)+')', x.c>=p.c?'up':'down'); add('Range', '$'+f2(x.h-x.l));
  if(A.r[i]!=null) add('RSI', A.r[i].toFixed(1)); if(A.e20[i]!=null) add('EMA 20', f2(A.e20[i])); }
function renderOverlayChips(){ const box=$('ovChips'); box.innerHTML='';
  OVERLAYS.forEach(([k,label])=>{ const b=el('button','chip',label); b.type='button'; b.setAttribute('aria-pressed', ANA.ov[k]?'true':'false');
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
