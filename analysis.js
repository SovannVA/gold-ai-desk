// ===== Analysis: sessions, conditions, intermarket, signal, levels, multi-timeframe, backtest, best hours =====
function localParts(tz, d=new Date()){ const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:tz, weekday:'short', hour:'2-digit', minute:'2-digit', hour12:false}).formatToParts(d).map(x=>[x.type,x.value]));
  return {wd:p.weekday, h:(+p.hour)%24, m:+p.minute}; }
const SESSIONS=[['Sydney','Australia/Sydney',7,16],['Tokyo','Asia/Tokyo',9,18],['London','Europe/London',8,17],['New York','America/New_York',8,17]];
function sessionInfo(d=new Date()){ return SESSIONS.map(([n,tz,o,c])=>{ const p=localParts(tz,d), hh=p.h+p.m/60, wk=!['Sat','Sun'].includes(p.wd);
  const open = wk && hh>=o && hh<c; const mins = open ? Math.round((c-hh)*60) : Math.round(((hh<o ? o-hh : 24-hh+o))*60);
  const off = (localParts(tz,d).h - localParts('Asia/Phnom_Penh',d).h + 24) % 24; // tz hours ahead of Cambodia
  const khOpen = (o - off + 24) % 24, khClose = (c - off + 24) % 24;
  return {n, open, mins, khOpen, khClose}; }); }
const sessionsOpen = (d=new Date()) => sessionInfo(d).filter(s=>s.open).map(s=>s.n);
function goldOpen(d=new Date()){ const p=localParts('America/New_York',d), hh=p.h+p.m/60;
  if(p.wd==='Sat') return false; if(p.wd==='Sun') return hh>=18; if(p.wd==='Fri') return hh<17; return !(hh>=17 && hh<18); }
const hm2n = s => { const [h,m]=String(s||'0:0').split(':').map(Number); return h*60+(m||0); };
function inWindow(ms){ const t=hm2n(khTime(ms)), a=hm2n(cfg.winStart), b=hm2n(cfg.closeTime); return a<=b ? (t>=a && t<b) : (t>=a || t<b); }

// ----- news brief helpers -----
function eventsSorted(){ return (S.brief?.events||[]).map(e=>({...e, t:Date.parse(e.time_utc)})).filter(e=>!isNaN(e.t)).sort((a,b)=>a.t-b.t); }
function newsRisk(){
  if(!S.brief) return {v:'Unknown', st:'mid', d:'Get the AI news brief'};
  const now=Date.now(), hi=eventsSorted().filter(e=>/high/i.test(e.impact||''));
  const near=hi.find(e=>e.t>now-15*60e3 && e.t-now<=cfg.newsBuffer*60e3);
  if(near) return {v:'High', st:'bad', d:`${near.event} at ${khTime(near.t)}`, ev:near};
  if(now-S.brief.at>8*3600e3) return {v:'Stale', st:'mid', d:'Brief is older than 8 hours'};
  const next=hi.find(e=>e.t>now); return {v:'Low now', st:'good', d: next?`Next: ${next.event}, ${khDay(next.t)}`:'No high-impact event listed'}; }

// ----- other markets -----
const IM = {
  'UUP':{name:'US dollar (UUP)', f:p=>p>0.15?-1:p<-0.15?1:0, why:'A stronger dollar usually pushes gold down'},
  'EUR/USD':{name:'EUR/USD', f:p=>p>0.15?1:p<-0.15?-1:0, why:'EUR/USD up means a weaker dollar, good for gold'},
  'USD/JPY':{name:'USD/JPY', f:p=>p>0.2?-1:p<-0.2?1:0, why:'USD/JPY up usually means a stronger dollar and higher yields'},
  'TLT':{name:'US bonds (TLT)', f:p=>p>0.2?1:p<-0.2?-1:0, why:'Bonds up means yields down, good for gold'},
  'SPY':{name:'S&P 500 (SPY)', f:p=>p<-0.5?1:0, why:'A sharp stock sell-off can send money into gold'},
  'XAG/USD':{name:'Silver', f:p=>p>0.3?1:p<-0.3?-1:0, why:'Silver usually moves with gold'},
  'BTC/USD':{name:'Bitcoin', f:()=>0, why:'Risk mood reference'},
  'WTI/USD':{name:'Oil (WTI)', f:()=>0, why:'Inflation reference'} };
function intermarket(){ let score=0, n=0; const rows=[];
  Object.entries(S.quotes).forEach(([s,q])=>{ const r=IM[s], eff=(r && !q.err && !isNaN(q.pct)) ? r.f(q.pct) : 0; if(r && !q.err){ score+=eff; n++; } rows.push({s,q,r,eff}); });
  return {score, n, rows, bias: score>=2?'bullish':score<=-2?'bearish':'mixed'}; }

// ----- day statistics -----
function dayStats(){ const d=S.candles['1day']; if(!d || d.length<2) return null; const t=d.at(-1), y=d.at(-2), a=atr(d).at(-2);
  const price=S.price||t.c, chg=price-y.c; return {open:t.o, high:Math.max(t.h,price), low:Math.min(t.l,price), prevClose:y.c, prevHigh:y.h, prevLow:y.l, chg, chgPct:chg/y.c*100, atr:a, range:Math.max(t.h,price)-Math.min(t.l,price)}; }

// ----- multi-timeframe -----
function mtf(){ const tf={'15 min':S.candles['15min'], '1 hour':S.candles['1h'], '4 hours':S.candles['1h']?aggregate(S.candles['1h'],14400):null, '1 day':S.candles['1day']};
  const rows=Object.entries(tf).map(([k,b])=>({k, s:tfSummary(b)})).filter(r=>r.s); if(!rows.length) return null;
  const total=rows.reduce((a,r)=>a+r.s.score,0), max=rows.length*2;
  return {rows, total, bias: total>=max*0.35?'bullish':total<=-max*0.35?'bearish':'mixed'}; }

// ----- key levels -----
function keyLevels(){ const price=S.price, d=S.candles['1day'], h=S.candles['1h']; if(!price || !d || d.length<3) return null;
  const out=[]; const add=(name,p,kind)=>{ if(p!=null && !isNaN(p)) out.push({name,p,kind}); };
  const ds=dayStats(), pv=pivots(d.at(-2));
  add('Previous day high',ds.prevHigh,'day'); add('Previous day low',ds.prevLow,'day'); add('Today high',ds.high,'day'); add('Today low',ds.low,'day');
  if(pv){ add('Pivot',pv.P,'pivot'); add('R1',pv.R1,'pivot'); add('R2',pv.R2,'pivot'); add('S1',pv.S1,'pivot'); add('S2',pv.S2,'pivot'); }
  if(h && h.length>50){ const a=atr(h).at(-1)||1, sr=srLevels(h.slice(-200), price, a*0.35);
    sr.above.forEach(x=>add(`Resistance (${x.touches} ${x.touches===1?'touch':'touches'})`, x.p, 'sr')); sr.below.forEach(x=>add(`Support (${x.touches} ${x.touches===1?'touch':'touches'})`, x.p, 'sr'));
    const fb=fibLevels(h,100); if(fb) fb.levels.forEach(l=>add(`Fib ${(l.r*100).toFixed(1)}%`, l.p, 'fib')); }
  const above=out.filter(x=>x.p>price).sort((a,b)=>a.p-b.p), below=out.filter(x=>x.p<=price).sort((a,b)=>b.p-a.p);
  return {above, below, pivots:pv, fib: h?fibLevels(h,100):null, sr: h&&h.length>50 ? srLevels(h.slice(-200), price, (atr(h).at(-1)||1)*0.35) : null}; }

// ----- conditions -----
function conditions(){
  const t=[], add=(k,v,st,d)=>t.push({k,v,st,d}), now=new Date();
  const open=goldOpen(now); add('Gold market', open?'Open':'Closed', open?'good':'bad', open?'Trades 24 h Mon–Fri':'Weekend or daily break');
  const ss=sessionsOpen(now), ov=ss.includes('London')&&ss.includes('New York');
  add('Sessions', ss.join(' + ')||'None', ov?'good':ss.length?'mid':'bad', ov?'London–New York overlap':'Lower liquidity');
  const inW=inWindow(Date.now()); add('Your window', `${cfg.winStart}–${cfg.closeTime}`, inW?'good':'mid', inW?'Inside your window':'Outside your window');
  const p=localParts('Asia/Phnom_Penh',now), dom=+new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Phnom_Penh', day:'numeric'}).format(now);
  let dst='good', dd='Tue–Thu are usually best'; if(p.wd==='Mon'){ dst='mid'; dd='Monday: often slower'; } if(p.wd==='Fri'){ dst='mid'; dd= dom<=7?'First Friday: US jobs report':'Friday: weekend risk'; } if(['Sat','Sun'].includes(p.wd)){ dst='bad'; dd='Weekend'; }
  add('Day', p.wd, dst, dd);
  const b=S.candles['15min']; if(b && b.length>=60){ const a=atr(b).filter(v=>v!=null), cur=a.at(-1), last=a.slice(-50), avg=last.reduce((s,v)=>s+v,0)/last.length, r=cur/avg;
    add('Volatility', '$'+f2(cur)+' per 15 min', r>1.8?'bad':r<0.7?'mid':'good', r>1.8?'Very high: wild moves':r<0.7?'Low: small moves':'Normal'); }
  const m=mtf(); if(m){ const t15=m.rows.find(r=>r.k==='15 min')?.s.trend, t1=m.rows.find(r=>r.k==='1 hour')?.s.trend; if(t15&&t1){ const al=t15===t1 && t15!=='range'; add('Trend 15 min / 1 h', `${t15} / ${t1}`, al?'good':'mid', al?'Aligned':'Mixed: be careful'); } }
  const s15=tfSummary(b); if(s15?.rsi!=null){ const r=s15.rsi; add('RSI 15 min', r.toFixed(0), (r>75||r<25)?'mid':'good', r>70?'Overbought':r<30?'Oversold':'Neutral'); }
  const nr=newsRisk(); add('News risk', nr.v, nr.st, nr.d);
  const im=Object.keys(S.quotes).length?intermarket():null; if(im) add('Other markets', im.bias, im.bias==='mixed'?'mid':'good', `Score ${im.score>0?'+':''}${im.score} from ${im.n}`);
  if(S.brief){ const bb=String(S.brief.gold_bias||'neutral').toLowerCase(); add('News bias', bb, bb==='neutral'?'mid':'good', `AI brief, ${Math.round((Date.now()-S.brief.at)/60e3)} min ago`); }
  const bad=t.filter(x=>x.st==='bad'), mid=t.filter(x=>x.st==='mid');
  return {tiles:t, verdict: bad.length?'AVOID':mid.length>=3?'CAUTION':'GOOD', why: bad.length? bad.map(x=>x.k+': '+x.d).join('; ') : mid.length>=3 ? mid.map(x=>x.k).join(', ')+' need care' : 'Conditions support trading', im, news:nr, mtf:m}; }

// ----- live signal (also used by the backtest) -----
function signalCore(b, i, A, up){
  const x=b[i], e=A.e20[i], r=A.r, a=A.a[i]; let sb=0; for(let k=i-10;k<i;k++) sb+=Math.abs(b[k].c-b[k].o);
  const avgBody=sb/10, rng=x.h-x.l, body=Math.abs(x.c-x.o), lo3=Math.min(b[i].l,b[i-1].l,b[i-2].l), hi3=Math.max(b[i].h,b[i-1].h,b[i-2].h), tol=0.3*a;
  const buy=[['1 h trend is up',up],['Pulled back to EMA 20',lo3<=e+tol],['Closed back above EMA 20',x.c>e],['RSI 40–60 and rising',r[i]>=40&&r[i]<=60&&r[i]>r[i-1]],['Strong green candle',x.c>x.o&&body>=1.2*avgBody&&rng>0&&(x.h-x.c)<=0.3*rng]];
  const sell=[['1 h trend is down',!up],['Pulled back to EMA 20',hi3>=e-tol],['Closed back below EMA 20',x.c<e],['RSI 40–60 and falling',r[i]>=40&&r[i]<=60&&r[i]<r[i-1]],['Strong red candle',x.c<x.o&&body>=1.2*avgBody&&rng>0&&(x.c-x.l)<=0.3*rng]];
  const nb=buy.filter(z=>z[1]).length, ns=sell.filter(z=>z[1]).length, side=nb>=ns?'buy':'sell', checks=side==='buy'?buy:sell, n=Math.max(nb,ns), dir=side==='buy'?1:-1, entry=x.c;
  let sl = side==='buy' ? lo3-0.2*a : hi3+0.2*a, risk=Math.abs(entry-sl); if(risk<0.5*a){ risk=0.5*a; sl=entry-dir*risk; }
  return {side, checks, n, state:n===5?'signal':n===4?'forming':'none', entry, sl, tp:entry+dir*2*risk, be:entry+dir*risk, risk, riskUsd:usd(risk), riskPct:usd(risk)/cfg.balance*100, tooRisky:risk>maxDist()+1e-9, bar:x.t, atr:a}; }
function closedBars(b, sec){ const now=Date.now()/1000; return (b||[]).filter(x=>x.t+sec<=now+5); }
function liveSignal(){ const b=closedBars(S.candles['15min'],900); if(b.length<60) return null;
  const c=b.map(x=>x.c), A={e20:ema(c,20), r:rsi(c), a:atr(b)}, h=closedBars(S.candles['1h'],3600);
  let up; if(h.length>=50){ const hc=h.map(x=>x.c); up=ema(hc,20).at(-1)>ema(hc,50).at(-1); } else up=A.e20.at(-1)>ema(c,50).at(-1);
  return signalCore(b, b.length-1, A, up); }
function signalMarkers(b, h){ const out=[]; if(!b || b.length<60) return out; const c=b.map(x=>x.c), A={e20:ema(c,20), r:rsi(c), a:atr(b)}, e50=ema(c,50);
  const hc=(h||[]).map(x=>x.c), he20=ema(hc,20), he50=ema(hc,50); let hj=0;
  for(let i=30;i<b.length;i++){ const tEnd=b[i].t+900; if(tEnd>Date.now()/1000+5) break; let up=A.e20[i]>e50[i];
    if(h && h.length){ while(hj+1<h.length && h[hj+1].t+3600<=tEnd) hj++; if(h[hj].t+3600<=tEnd) up=he20[hj]>he50[hj]; }
    const s=signalCore(b,i,A,up); if(s.n===5) out.push({t:b[i].t, side:s.side}); }
  return out; }
function grade(sig, cond){ if(!sig || sig.state!=='signal') return null; if(cond.verdict==='AVOID') return 'Skip';
  const want=sig.side==='buy'?'bullish':'bearish', against=sig.side==='buy'?'bearish':'bullish', ims=cond.im?.bias, nb=String(S.brief?.gold_bias||'').toLowerCase(), mb=cond.mtf?.bias;
  const plus=(ims===want)+(nb===want)+(mb===want), minus=(ims===against)+(nb===against)+(mb===against);
  if(minus>=2) return 'C'; if(plus>=2 && cond.verdict==='GOOD' && !minus) return 'A'; if(minus) return 'C'; return 'B'; }

// ----- best hours heatmap -----
function bestHours(b){ const grid={}; const days=['Mon','Tue','Wed','Thu','Fri'];
  const byHour={}; for(const x of b){ const ms=x.t*1000, key=khStamp(ms).slice(0,13); (byHour[key] ||= {h:-Infinity, l:Infinity, ms}); byHour[key].h=Math.max(byHour[key].h,x.h); byHour[key].l=Math.min(byHour[key].l,x.l); }
  Object.values(byHour).forEach(v=>{ const wd=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Phnom_Penh', weekday:'short'}).format(new Date(v.ms)); if(!days.includes(wd)) return;
    const hr=+khTime(v.ms).slice(0,2), k=wd+'|'+hr; (grid[k] ||= []).push(v.h-v.l); });
  const cell={}; let max=0; Object.entries(grid).forEach(([k,a])=>{ const m=a.reduce((s,v)=>s+v,0)/a.length; cell[k]=m; max=Math.max(max,m); });
  return {days, cell, max}; }

// ----- backtest of the live signal -----
function backtest(b, h1, o){
  const c=b.map(x=>x.c), A={e20:ema(c,20), r:rsi(c), a:atr(b)}, e50=ema(c,50), hc=h1.map(x=>x.c), he20=ema(hc,20), he50=ema(hc,50);
  const trades=[]; let pos=null, hj=0;
  for(let i=60;i<b.length;i++){ const x=b[i], tEnd=x.t+900;
    if(pos){ const d=pos.dir; let exit=null, why='';
      if(d>0 ? x.l<=pos.sl : x.h>=pos.sl){ exit=pos.sl; why=pos.be?'Breakeven':'Stop loss'; }
      else if(d>0 ? x.h>=pos.tp : x.l<=pos.tp){ exit=pos.tp; why='Take profit'; }
      else { if(o.be && !pos.be && (d>0 ? x.h>=pos.beAt : x.l<=pos.beAt)){ pos.be=true; pos.beT=tEnd; pos.sl=pos.entry+d*o.spread; }
        if(o.window && !inWindow(tEnd*1000)){ exit=x.c; why='Close time'; } }
      if(exit!=null){ const pnl=(exit-pos.entry)*d-o.spread; trades.push({...pos, exit, exitT:tEnd, why, pnl, r:pnl/pos.risk, usd:usd(pnl)}); pos=null; }
      continue; }
    while(hj+1<h1.length && h1[hj+1].t+3600<=tEnd) hj++;
    const up = (h1.length && h1[hj].t+3600<=tEnd) ? he20[hj]>he50[hj] : A.e20[i]>e50[i];
    if(o.closedOnly && tEnd>Date.now()/1000+5) continue;
    const s=signalCore(b,i,A,up); if(s.n!==5) continue;
    if(o.window && !inWindow(tEnd*1000)) continue; if(o.skip && s.tooRisky) continue;
    pos={dir:s.side==='buy'?1:-1, side:s.side, entry:s.entry, sl:s.sl, sl0:s.sl, tp:s.tp, beAt:s.be, risk:s.risk, t:tEnd, be:false}; }
  let eq=0, peak=0, dd=0, gw=0, gl=0; const curve=[];
  trades.forEach(tr=>{ eq+=tr.usd; peak=Math.max(peak,eq); dd=Math.min(dd,eq-peak); if(tr.usd>0) gw+=tr.usd; else gl+=tr.usd; curve.push({t:tr.exitT, v:eq}); });
  const wins=trades.filter(x=>x.usd>0).length;
  return {trades, n:trades.length, wins, winRate: trades.length? wins/trades.length*100 : 0, net:eq, avgR: trades.length? trades.reduce((s,x)=>s+x.r,0)/trades.length : 0,
    pf: gl? gw/Math.abs(gl) : (gw? Infinity : 0), maxDD:dd, curve, from:b[0]?.t, to:b.at(-1)?.t, open:pos}; }
