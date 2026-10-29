// ===== Views: rendering for every page =====
function clear(n){ n.innerHTML=''; n.classList.remove('muted'); return n; }
function empty(n, text){ n.innerHTML=''; n.classList.add('muted'); n.textContent=text; }
const sideKind = s => s==='buy'?'buy':s==='sell'?'sell':'wait';
const biasKind = b => b==='bullish'?'buy':b==='bearish'?'sell':'wait';

// ---------- hero ----------
let lastHeroPrice=null;
function renderHero(){
  const p=S.price; if(p==null) return; const ds=dayStats(), hp=$('hPrice');
  hp.textContent=f2(p); $('topPrice').textContent=f2(p);
  if(lastHeroPrice!=null && p!==lastHeroPrice){ hp.classList.remove('tick-up','tick-down'); void hp.offsetWidth; hp.classList.add(p>lastHeroPrice?'tick-up':'tick-down'); }
  lastHeroPrice=p; $('hUpdated').textContent = S.lastTick ? '· updated '+khTime(S.lastTick)+' Cambodia time' : '';
  if(!ds) return; const cls=ds.chg>=0?'up':'down', txt=`${sgn(ds.chg)} (${pct(ds.chgPct)}) today`;
  $('hChg').textContent=txt; $('hChg').className='hero-chg '+cls; $('topChg').textContent=pct(ds.chgPct); $('topChg').className='tc '+cls;
  const st=clear($('hStats')); [['Open',ds.open],['High',ds.high],['Low',ds.low],['Prev close',ds.prevClose]].forEach(([k,v])=>{ const d=el('div',null,k); d.appendChild(el('b',null,f2(v))); st.appendChild(d); });
  const lo=Math.min(ds.low, ds.prevLow), hi=Math.max(ds.high, ds.prevHigh), span=hi-lo||1, pos=v=>clamp((v-lo)/span*100,0,100);
  const fill=$('hFill'); fill.style.left=pos(ds.low)+'%'; fill.style.width=(pos(ds.high)-pos(ds.low))+'%'; $('hMark').style.left=pos(p)+'%';
  $$('#hBar .rtick').forEach(x=>x.remove()); [ds.prevHigh, ds.prevLow].forEach(v=>{ const t=el('span','rtick'); t.style.left=pos(v)+'%'; t.title='Previous day '+(v===ds.prevHigh?'high ':'low ')+f2(v); $('hBar').appendChild(t); });
  $('hLow').textContent='Low '+f2(ds.low); $('hHigh').textContent='High '+f2(ds.high);
  $('hAtr').textContent = ds.atr ? `Range $${f2(ds.range)} of usual $${f2(ds.atr)} (${Math.round(ds.range/ds.atr*100)}%)` : ''; }
function renderVerdict(c){
  const ring=$('vRing'), map={GOOD:[1,'--up'], CAUTION:[.62,'--warn'], AVOID:[.3,'--down']}, [f,col]=map[c.verdict];
  ring.style.strokeDashoffset=314*(1-f); ring.style.stroke=`var(${col})`; $('vWord').textContent=c.verdict==='GOOD'?'Good':c.verdict==='CAUTION'?'Caution':'Avoid'; $('vWord').style.color=`var(${col})`; $('vWhy').textContent=c.why; }

// ---------- dashboard panels ----------
function renderTiles(node, c){ clear(node); c.tiles.forEach(x=>{ const d=el('div','tile '+x.st); d.append(el('div','k',x.k), el('div','v',x.v), el('div','d',x.d)); node.appendChild(d); }); }
function sigPillText(sig, g){ return !sig ? ['–',''] : sig.state==='signal' ? [`${sig.side==='buy'?'Buy':'Sell'} signal · grade ${g}`, g==='Skip'?'wait':sideKind(sig.side)] : sig.state==='forming' ? [`${sig.side==='buy'?'Buy':'Sell'} forming 4/5`,'wait'] : ['No signal','']; }
function chartSigInfo(sig, cond, op){
  if(op){ const nm=op.side==='buy'?'BUY':'SELL', now=S.price||S.candles['15min']?.at(-1)?.c, pnl=now!=null?(now-op.entry)*op.dir:0, $p=(pnl>=0?'+$':'−$')+f2(Math.abs(usd(pnl)));
    if(op.hold==='long') return {word:`${nm} OPEN ${$p}`, kind:op.side, msg:`${holdMode()==='auto'?`Auto picked Long line (${op.withTrend?'with':'against'} the trend). `:''}Long line: no fixed TP. Trailing stop now ${f2(op.sl)}: move your MT5 stop to it. Close if it is hit, after 24 hours, or before the weekend.`, nums:[['Entry',op.entry],[op.trailing?'Trailing stop':'Stop loss',op.sl],['Target (guide)',op.target]]};
    const plan = op.be ? `Stop loss is already at entry, so no risk now. Hold for TP ${f2(op.tp)}.` : `Hold. When price reaches ${f2(op.beAt)}, move SL to entry ${f2(op.entry)}. Close at TP ${f2(op.tp)} or SL ${f2(op.sl)}.`;
    if(op.tooRisky) return {word:`${nm} · OVER RISK`, kind:'wait', msg:`The desk's ${nm} signal has a stop loss ${f2(Math.abs(op.entry-op.sl0))} away, more than your limit of ${f2(maxDist())}. Skip it, or use a smaller lot. Levels shown for learning only.`, nums:[['Entry',op.entry],['Stop loss',op.sl],['Take profit',op.tp]]};
    return {word:`${nm} OPEN ${$p}`, kind:op.side, msg:`${plan} Close by ${cfg.closeTime} if it is still open.`, nums:[['Entry',op.entry],[op.be?'SL (at entry)':'Stop loss',op.sl],['Move SL at',op.be?null:op.beAt],['Take profit',op.tp]]}; }
  const g=grade(sig,cond), v=cond?.verdict||'', side=sig?(sig.side==='buy'?'BUY':'SELL'):'';
  if(!sig) return {word:'WAIT', kind:'idle', msg: S.candles['15min']?.length ? 'Loading more 15 min candles.' : 'Press Start live to get the signal.'};
  if(sig.state==='signal'){
    if(g==='Skip') return {word:side+' · NO TRADE', kind:'wait', msg:`${side} signal, but conditions say Avoid: ${cond.why}.`};
    if(g==='C') return {word:side+' · WEAK', kind:'wait', msg:`${side} signal, grade C. Other markets or timeframes disagree. Better to skip.`};
    const lg=typeof sigHold==='function' && sigHold(sig)==='long';
    return {word:side, kind:sig.side, msg:`${side} signal, grade ${g}. Conditions ${v.toLowerCase()}. Check the candle, then enter with ${lg?'SL set in MT5 and no TP (Long line: trail the stop)':'SL and TP set in MT5'}.`, nums: lg?[['Entry',sig.entry],['Stop loss',sig.sl]]:null}; }
  if(sig.state==='forming') return {word:side+' FORMING', kind:'wait', msg:`4 of 5 checks met. Waiting for: ${sig.checks.filter(c=>!c[1]).map(c=>c[0].toLowerCase()).join(', ')}. Don't enter yet.`};
  return {word:'WAIT', kind:'idle', msg:`No setup now (${sig.n} of 5 checks for a ${sig.side==='buy'?'buy':'sell'}). Wait.`}; }
// trade card for the 5-check chart: the open trade, or the new / forming signal
function tagCardObj(sig, op){
  if(op){ const lg=op.hold==='long', t0=op.t-900;
    return {title: op.tooRisky ? `${op.side.toUpperCase()} OPEN · stop is over your risk limit: learning only` : `${op.side.toUpperCase()} OPEN · do this in MT5`, side:op.side, entry:op.entry, sl:op.sl, sl0:op.sl0, tp:lg?null:op.tp, hold:op.hold, trailing:op.trailing, be:op.be,
      targets: lg ? [['Target 2R', op.target]] : null, extra: (!lg && !op.be) ? [['Move SL to entry at', f2(op.beAt), 'warnc']] : null,
      closeBy: lg ? `${khStamp((t0+24*3600)*1000)} (24 h) or the stop` : `${cfg.closeTime} Cambodia time`}; }
  if(!sig || sig.state==='none' || sig.entry==null) return null;
  const h=typeof sigHold==='function' ? sigHold(sig) : 'short', lg=h==='long';
  return {title: sig.state==='signal' ? `NEW ${sig.side.toUpperCase()} SIGNAL · enter at the next candle` : `${sig.side.toUpperCase()} FORMING 4/5 · not yet: plan only`, planned: sig.state!=='signal',
    side:sig.side, entry:sig.entry, sl:sig.sl, tp:lg?null:sig.tp, hold:h, targets: lg ? [['Target 2R', sig.tp]] : null,
    extra: lg ? null : [['Move SL to entry at', f2(sig.be), 'warnc']], closeBy: lg ? '24 h after entry, or the stop' : `${cfg.closeTime} Cambodia time`}; }
function renderChartBadge(id, sig, info){ const bd=$(id); if(!bd) return; clear(bd); bd.className='chartbadge '+info.kind;
  bd.appendChild(el('div','cbword',info.word));
  const co=tagCardObj(sig, typeof chartTrades==='function' ? chartTrades()?.open : null);
  if(co){ const R=Math.abs(co.entry-(co.sl0??co.sl)), l=lotFor(R), L=Math.max(l,0.01), lg=co.hold==='long';
    bd.appendChild(el('div','cbnums', `Entry ${f2(co.entry)} · ${co.trailing?'Trail':'SL'} ${f2(co.sl)} · ${lg?`no TP · target ${f2(co.targets[0][1])} (guide)`:`TP ${f2(co.tp)}`}`));
    bd.appendChild(el('div','cbnums', `Lot ${L.toFixed(2)}${l<0.01?' ⚠':''} · risk −$${f2(R*L*100)}${lg?'':` · TP +$${f2(Math.abs(co.tp-co.entry)*L*100)}`} · ${HOLD_NAMES[co.hold]}`)); return; }
  if(info.nums) bd.appendChild(el('div','cbnums', info.nums.filter(x=>x[1]!=null).map(([k,v])=>`${k.replace('Stop loss','SL').replace('Take profit','TP')} ${f2(v)}`).join(' · ')));
  else if(sig && sig.state!=='none') bd.appendChild(el('div','cbnums',`Entry ${f2(sig.entry)} · SL ${f2(sig.sl)} · TP ${f2(sig.tp)}`));
  else bd.appendChild(el('div','cbnums', sig ? `${sig.n} of 5 checks` : 'Not live')); }
function renderChartSig(sig, cond){ const box=$('chartSig'); if(!box) return; clear(box);
  const info=chartSigInfo(sig, cond, (typeof chartTrades==='function' ? chartTrades()?.open : null)), v=cond?.verdict||'';
  box.className='sigbar '+info.kind; box.append(el('span','sigword',info.word), el('span','sigmsg',info.msg));
  const op=(typeof chartTrades==='function' ? chartTrades()?.open : null), co=tagCardObj(sig, op);
  if(co){ const cards=el('div','tradecards'); cards.appendChild(tradeCard(co.title, co, co.side+(co.planned?' plan':''))); box.appendChild(cards); }
  if(v){ box.appendChild(el('span','pill '+(v==='GOOD'?'good':v==='CAUTION'?'mid':'bad'),'Conditions '+(v==='GOOD'?'Good':v==='CAUTION'?'Caution':'Avoid'))); }
  renderChartBadge('tvBadge', sig, info); renderChartBadge('anaBadge', sig, info); }
// ----- AI team check panel (Analysis chart + Tags) -----
function renderAiPanel(){ const box=$('aiCheck'); if(!box || box.hidden) return; clear(box);
  const pts=ANA.points||{}, now=typeof nowPoint==='function'?nowPoint():null; if(S.aiSel && !pts[S.aiSel] && !S.aiChecks[S.aiSel]) S.aiSel=null;
  const id=S.aiSel || now?.id, pt=pts[id] || S.aiChecks[id]?.pt || (now?.id===id?now:null), R=S.aiChecks[id], team=aiTeam();
  const head=el('div','panel-head'); const h=el('h2',null, pt ? (pt.market ? `AI team check · market now (no setup yet)` : `AI team check · ${pt.side==='buy'?'BUY':'SELL'} ${f2(pt.entry)} · ${pt.scope==='past'?'past trade':pt.open?'open trade':pt.forming?'forming':'new signal'}`) : 'AI team check'); head.appendChild(h);
  const right=el('div','row');
  if(R?.status==='done'){ const F=R.final, k=F.verdict==='confirm'&&!F.mixed?'good':F.verdict==='reject'?'bad':'mid'; right.appendChild(el('span','pill '+k, `${F.by==='Claude'?'Claude':'Team'}: ${F.verdict.toUpperCase()} · ${F.agree} of ${F.of} agree · ${F.confidence}%`)); }
  if(S.aiSel && now && S.aiSel!==now.id){ const b=el('button','btn btn-ghost','Back to now'); b.onclick=()=>{ S.aiSel=null; aicUpdate(); }; right.appendChild(b); }
  if(pt && R?.status!=='loading'){ const b=el('button','btn '+(R?'':'btn-primary'), R?'Check again':(pt.market?'Ask AI team about now':'Ask AI team')); b.disabled=!team.length; b.onclick=()=>runPointCheck(pt); right.appendChild(b); }
  head.appendChild(right); box.appendChild(head);
  // team status: who is ready
  const st=el('div','aiteamrow'); [['Claude','enClaude','kClaude','leader'],['Gemini','enGemini','kGemini','member'],['DeepSeek','enDeepseek','kDeepseek','member']].forEach(([n,en,k,role])=>{
    const m=R?.members?.[n], ready=cfg[en]&&cfg[k]; let txt, kind;
    if(!cfg[en]){ txt='off in Settings'; kind=''; } else if(!cfg[k]){ txt='no API key'; kind='bad'; }
    else if(R?.status==='loading' && !m) { txt='thinking…'; kind='mid'; }
    else if(m?.err){ txt='error'; kind='bad'; }
    else if(n==='Claude' && R?.final?.by==='Claude'){ txt='final: '+R.final.verdict; kind=R.final.verdict==='confirm'?'good':R.final.verdict==='reject'?'bad':'mid'; }
    else if(m?.r1){ const v=m.r2?.verdict||m.r1.verdict; txt=v+(m.r1.dataOK?'':' · data ✗'); kind=v==='confirm'?'good':v==='reject'?'bad':'mid'; }
    else { txt='ready'; kind='good'; }
    const c=el('span','pill '+kind, `${n} (${role}): ${txt}`); st.appendChild(c); });
  box.appendChild(st);
  if(!pt){ box.appendChild(el('div','muted small','Start live to load prices. Then tap a tag on the chart (BUY, SELL or NOW) to check it. New signals and open trades are checked automatically when that is on in Settings.')); return; }
  if(!team.length){ box.appendChild(el('div','muted small','Add Claude, Gemini or DeepSeek keys in Settings to use the AI team.')); return; }
  if(!R){ box.appendChild(el('div','muted small', `${pt.label}. Tap "Ask AI team": ${team.join(', ')} check it, discuss, and ${team.includes('Claude')?'Claude decides':'the team votes'} (about ${team.length*2+(team.includes('Claude')?1:0)} AI answers).`)); return; }
  if(R.status==='loading') box.appendChild(el('div','small aistep', R.step));
  if(R.status==='error') box.appendChild(el('div','err', 'AI team check failed: '+R.error));
  const grid=el('div','aigrid'), vk=v=>v==='confirm'?'good':v==='reject'?'bad':'mid';
  ['Gemini','DeepSeek','Claude'].filter(n=>R.members[n] || (R.status==='loading' && team.includes(n))).forEach(n=>{ const m=R.members[n]||{}, c=el('div','aim'); const t=el('div','ain'); t.append(el('span',null,n==='Claude'?'Claude (round 1)':n));
    if(m.r1) t.appendChild(el('span','pill '+vk(m.r1.verdict), m.r1.verdict.toUpperCase()+' '+m.r1.confidence+'%')); else if(!m.err) t.appendChild(el('span','pill','thinking…')); c.appendChild(t);
    if(m.err) c.appendChild(el('div','err small', m.err));
    if(m.r1){ c.appendChild(el('div','small muted', m.r1.reasoning)); if(m.r1.risks) c.appendChild(el('div','small','Risks: '+m.r1.risks));
      if(m.r1.sl!=null || m.r1.tp!=null) c.appendChild(el('div','small',`Suggests SL ${m.r1.sl!=null?f2(m.r1.sl):'same'}, TP ${m.r1.tp!=null?f2(m.r1.tp):'same'}`));
      c.appendChild(el('span','pill '+(m.r1.dataOK?'good':'bad'), m.r1.dataOK?'Data check ✓':'Data check ✗ read wrong levels, vote not counted')); }
    if(m.r2) c.appendChild(el('div','small', `Discussion: ${m.r2.stance.toUpperCase()}, now ${m.r2.verdict.toUpperCase()}. ${m.r2.comment}`));
    grid.appendChild(c); });
  if(R.final){ const F=R.final, c=el('div','aim lead'), t=el('div','ain'); t.append(el('span',null,F.by==='Claude'?'Claude (leader) · final':'Team vote · final'), el('span','pill '+vk(F.verdict), F.verdict.toUpperCase())); c.appendChild(t);
    if(F.action) c.appendChild(el('div','small', F.action));
    if(F.sl!=null || F.tp!=null) c.appendChild(el('div','small', `<b>Adjusted levels:</b> SL ${F.sl!=null?f2(F.sl):f2(pt.sl)}, TP ${F.tp!=null?f2(F.tp):f2(pt.tp)}`.replace(/<\/?b>/g,'')));
    if(F.closeIf) c.appendChild(el('div','small','Close early if: '+F.closeIf));
    if(F.lesson) c.appendChild(el('div','small','Lesson: '+F.lesson));
    if(F.notes) c.appendChild(el('div','small muted', F.notes));
    const pills=el('div','row'); pills.appendChild(el('span','pill '+(F.bad.length?'bad':'good'), F.bad.length?'Data check ⚠ '+F.bad.join(', ')+' read wrong levels':'Data check ✓ all levels match the code'));
    if(F.mixed) pills.appendChild(el('span','pill mid','Not everyone agrees: be careful'));
    if(F.badLevels) pills.appendChild(el('span','pill mid','Suggested levels broke the risk rules and were ignored'));
    if(R.leaderErr) pills.appendChild(el('span','pill mid','Claude unavailable: team vote used')); c.appendChild(pills); grid.appendChild(c); }
  box.appendChild(grid);
  box.appendChild(el('div','small muted mt', `${R.status==='done'?'Checked at '+khTime(R.at):'Working…'} · Numbers come from the app's code; the AIs only judge them. Agreement lowers mistakes but cannot remove market risk. Your stop loss is your protection.`)); }
function renderDashSignal(sig, cond){
  const box=$('dSignal'), [t,k]=sigPillText(sig, grade(sig,cond)); pill($('dSigPill'), t, k);
  if(!sig){ empty(box,'Needs at least 60 closed 15 min candles.'); return; } clear(box);
  const meter=el('div','meter'); const fillEl=el('span'); fillEl.style.width=(sig.n/5*100)+'%'; meter.appendChild(fillEl); box.append(el('div','small muted',`${sig.n} of 5 checks for a ${sig.side} setup`), meter);
  sig.checks.forEach(([k,ok])=>{ const c=el('div','check '+(ok?'ok':'no')); c.append(el('span','ic',ok?'✓':''), el('span',null,k)); box.appendChild(c); });
  if(sig.state!=='none'){ const kv=el('div','kv'); kvRow(kv,'Entry',f2(sig.entry)); kvRow(kv,'Stop loss',`${f2(sig.sl)} (−$${f2(sig.riskUsd)})`); kvRow(kv,'Take profit',`${f2(sig.tp)} (+$${f2(usd(sig.risk*2))})`); box.appendChild(kv); }
  const a=el('a','small','Open signal details'); a.href='#signals'; a.style.display='inline-block'; a.style.marginTop='10px'; box.appendChild(a); }
function renderMtf(m){ const box=$('dMtf'); if(!m){ pill($('dMtfPill'),'–'); empty(box,'No data yet.'); return; } clear(box);
  pill($('dMtfPill'), 'Overall '+m.bias, biasKind(m.bias));
  const t=el('table','mtf'), hr=el('tr'); ['Timeframe','Trend','RSI','MACD','ADX','vs EMA 200'].forEach(h=>hr.appendChild(el('th',null,h))); t.appendChild(hr);
  m.rows.forEach(({k,s})=>{ const tr=el('tr'); tr.appendChild(el('td',null,k));
    const tc=el('td'); tc.appendChild(el('span','pill '+(s.trend==='up'?'buy':s.trend==='down'?'sell':''), s.trend==='up'?'Up':s.trend==='down'?'Down':'Range')); tr.appendChild(tc);
    tr.appendChild(el('td', s.rsi>70?'down':s.rsi<30?'up':'', s.rsi!=null?s.rsi.toFixed(0):'–'));
    tr.appendChild(el('td', s.macdHist>0?'up':'down', s.macdHist==null?'–':(s.macdHist>0?'Positive':'Negative')+(s.macdRising==null?'':s.macdRising?', rising':', falling')));
    tr.appendChild(el('td', null, s.adx==null?'–':`${s.adx.toFixed(0)} ${s.adx>=25?'strong':s.adx<20?'weak':'normal'}`));
    tr.appendChild(el('td', s.e200==null?'muted':s.close>s.e200?'up':'down', s.e200==null?'–':s.close>s.e200?'Above':'Below')); t.appendChild(tr); });
  const w=el('div','tblwrap'); w.appendChild(t); box.appendChild(w); }
function renderLevels(){ const box=$('dLevels'), kl=keyLevels(); if(!kl){ empty(box,'No data yet.'); return; } clear(box);
  const g=el('div','lvl'); const row=x=>{ g.append(el('span','t',x.name), el('span','small '+(x.p>S.price?'down':'up'), (x.p>S.price?'+':'−')+'$'+f2(Math.abs(x.p-S.price))), el('span','p',f2(x.p))); };
  kl.above.slice(0,4).reverse().forEach(row); g.appendChild(el('div','now','Now '+f2(S.price))); kl.below.slice(0,4).forEach(row); box.appendChild(g); }
function renderImMini(){ const box=$('dIm'); if(!Object.keys(S.quotes).length){ empty(box,'No data yet.'); return; } clear(box); const im=intermarket();
  box.appendChild(el('span','pill '+biasKind(im.bias), 'Gold bias: '+im.bias)); const l=el('div','list mt');
  im.rows.forEach(({s,q,r,eff})=>{ const li=el('div','li'); li.append(el('span','grow',r?.name||s), el('span', q.err?'muted':q.pct>=0?'up':'down', q.err?'n/a':pct(q.pct)), el('span', eff>0?'up':eff<0?'down':'muted', eff>0?'Helps gold':eff<0?'Weighs on gold':'Neutral')); l.appendChild(li); });
  box.appendChild(l); }
function renderEventsMini(){ const box=$('dEvents'), ev=eventsSorted().filter(e=>e.t>Date.now()-30*60e3).slice(0,5); if(!S.brief){ empty(box,'Get the AI news brief to see events.'); return; }
  if(!ev.length){ empty(box,'No upcoming events in the brief.'); return; } clear(box); const l=el('div','list');
  ev.forEach(e=>{ const li=el('div','li'), mins=Math.round((e.t-Date.now())/60e3); li.append(el('span','small muted',khDay(e.t)), el('span','grow',`${e.currency||''} ${e.event}`), el('span','pill '+(/high/i.test(e.impact)?'bad':'mid'), mins>0&&mins<600?`in ${mins<60?mins+' min':Math.floor(mins/60)+' h'}`:(e.impact||''))); l.appendChild(li); });
  box.appendChild(l); }
function renderSessions(node){ clear(node); const info=sessionInfo(), now=new Date(), khH=+khTime(Date.now()).slice(0,2)+(+khTime(Date.now()).slice(3))/60;
  const wrap=el('div','sess');
  info.forEach(s=>{ const r=el('div','sessrow'), bar=el('div','sessbar'); const a=s.khOpen, b=s.khClose;
    const seg=(from,to)=>{ const i=el('i', s.open?'on':''); i.style.left=(from/24*100)+'%'; i.style.width=((to-from)/24*100)+'%'; bar.appendChild(i); };
    if(a<b) seg(a,b); else { seg(a,24); seg(0,b); } const m=el('b'); m.style.left=(khH/24*100)+'%'; bar.appendChild(m);
    const left=s.open?`closes in ${Math.floor(s.mins/60)}h ${s.mins%60}m`:`opens in ${Math.floor(s.mins/60)}h ${s.mins%60}m`;
    r.append(el('span',null,s.n), bar, el('span','small '+(s.open?'up':'muted'), s.open?'Open':'Closed')); r.title=`${s.n}: ${String(a).padStart(2,'0')}:00–${String(b).padStart(2,'0')}:00 Cambodia time, ${left}`; wrap.appendChild(r); });
  node.appendChild(wrap); node.appendChild(el('div','small muted mt', goldOpen(now)?'Gold is trading. Bars show each session in Cambodia time; the line is now.':'Gold market is closed now.')); }
function renderPlanMini(){ const box=$('dPlan'), p=S.plan; if(!p){ empty(box,'No plan set. Use a live signal or the AI desk to set one.'); return; } clear(box);
  const row=el('div','statgrid'); row.append(stat('Side', p.bias==='buy'?'Buy':'Sell', null, p.bias==='buy'?'up':'down'), stat('Entry zone', `${f2(p.entry_low)} – ${f2(p.entry_high)}`), stat('Stop loss', f2(S.mon.sl ?? p.stop_loss), `−$${f2(p.riskUsd)}`), stat('Take profit', f2(p.take_profit), `+$${f2(p.rewardUsd)}`), stat('Status', {waiting:'Waiting for entry', in:'In the trade', done:'Finished', idle:'Not started'}[S.mon.phase]||'–', p.source||''));
  box.appendChild(row); }

// ---------- signals page ----------
function renderSignalPage(sig, cond){
  const box=$('sigDetail'), g=grade(sig,cond), [t,k]=sigPillText(sig,g); pill($('sigPill'), t, k);
  if(!sig){ empty(box,'Start live or refresh data to calculate the signal.'); return; } clear(box);
  box.appendChild(el('div','small muted',`Last closed candle ${khTime(sig.bar*1000)}–${khTime(sig.bar*1000+900e3)} Cambodia time. ${sig.n} of 5 checks for a ${sig.side} setup.`));
  sig.checks.forEach(([k,ok])=>{ const c=el('div','check '+(ok?'ok':'no')); c.append(el('span','ic',ok?'✓':''), el('span',null,k)); box.appendChild(c); });
  if(sig.state==='none'){ box.appendChild(el('p','muted','No trade. Waiting for a pullback setup in the trend direction.')); return; }
  const kv=el('div','kv'); kvRow(kv,'Entry (last close)',f2(sig.entry)); kvRow(kv,'Stop loss',`${f2(sig.sl)} (−$${f2(sig.riskUsd)}, ${sig.riskPct.toFixed(1)}% of balance)`); kvRow(kv,'Take profit (2R)',`${f2(sig.tp)} (+$${f2(usd(sig.risk*2))})`); kvRow(kv,'Move SL to entry at',f2(sig.be)); box.appendChild(kv);
  if(sig.state==='signal') box.appendChild(el('p','small muted', g==='A'?'Grade A: conditions are good and the timeframes, other markets or news agree.':g==='B'?'Grade B: the chart setup is there, with little extra confirmation.':g==='C'?'Grade C: timeframes, other markets or news point the other way. Be careful.':'Skip: market conditions say avoid.'));
  if(sig.tooRisky) box.appendChild(el('div','warnbox',`The stop is wider than your ${cfg.riskPct}% limit. Skip this one.`));
  const row=el('div','row mt'), use=el('button','btn btn-primary','Use as alert plan'); use.disabled = sig.state!=='signal' || sig.tooRisky || g==='Skip';
  use.onclick=()=>{ const w=0.15*sig.atr; setPlan(addRisk({bias:sig.side, entry_low:sig.entry-w, entry_high:sig.entry+w, stop_loss:sig.sl, take_profit:sig.tp, breakeven_at:sig.be, close_by:cfg.closeTime, entry_trigger:'Signal candle closed. Enter if price is still in the zone.', votes:{buy:0,sell:0,wait:0}, confidence:0, source:'Live signal', grade:g})); };
  const askB=el('button','btn','Ask the AI team'); askB.onclick=()=>{ location.hash='ai'; runTeamUI(); }; row.append(use, askB); box.appendChild(row); }

// ---------- trade plan and alerts ----------
function setPlan(c){ S.plan=c; S.mon={phase:'waiting', entry:null, sl:c.stop_loss, beDone:false, fired:{}}; $('exitRow').hidden=true;
  $('phase').textContent=`Waiting for the ${c.bias} zone ${f2(c.entry_low)}–${f2(c.entry_high)}.`; pill($('planPill'), c.bias==='buy'?'Buy plan':'Sell plan', c.bias);
  if(ANA.ready) anaDraw(false); renderPlanMini(); toast(S.live ? 'Plan set. Alerts are on.' : 'Plan set. Start live to get alerts.'); }
function finishTrade(exitHint){ $('exitRow').hidden=false; $('exitPx').value = exitHint!=null ? exitHint.toFixed(2) : ''; }
function watchPlan(price){
  const p=S.plan, m=S.mon; if(!p) return; const dir=p.bias==='buy'?1:-1, side=p.bias==='buy'?'Buy':'Sell', t=nowKH(), late=!inWindow(Date.now()) && hm2n(t)>=hm2n(p.close_by);
  if(m.phase==='waiting'){
    if(price>=p.entry_low && price<=p.entry_high) alertUser('zone',`${side} zone reached at ${f2(price)}. Check the 15 min chart for a ${dir>0?'strong green':'strong red'} candle, then enter and tap "I entered the trade".`);
    if(dir>0 ? price<=p.stop_loss : price>=p.stop_loss){ alertUser('invalid',`Setup cancelled: price passed the stop level ${f2(p.stop_loss)} before entry. Do not enter.`); m.phase='done'; }
    else if(late){ alertUser('late',`It is ${t}. Trading window is over, so this plan is cancelled.`); m.phase='done'; }
    $('phase').textContent = m.phase==='waiting' ? `Waiting for the ${p.bias} zone ${f2(p.entry_low)}–${f2(p.entry_high)}. Now ${f2(price)}.` : 'Plan finished without a trade.';
  } else if(m.phase==='in'){
    const pnl=usd((price-m.entry)*dir);
    if(!m.beDone && (dir>0 ? price>=p.breakeven_at : price<=p.breakeven_at)){ m.beDone=true; m.sl=m.entry+dir*1; alertUser('be',`MODIFY: move your stop loss to ${f2(m.sl)} (entry + spread). Risk removed.`); }
    if(dir>0 ? price>=p.take_profit : price<=p.take_profit){ alertUser('tp',`Take profit ${f2(p.take_profit)} reached (about +$${f2(usd(Math.abs(p.take_profit-m.entry)))}). Check that MT5 closed the trade.`); m.phase='done'; finishTrade(p.take_profit); }
    else if(dir>0 ? price<=m.sl : price>=m.sl){ alertUser('sl', m.beDone?'Price came back to your entry: the trade closed at breakeven.':`Stop loss ${f2(m.sl)} hit (about −$${f2(usd(Math.abs(m.entry-m.sl)))}). Stop and review. No revenge trade.`); m.phase='done'; finishTrade(m.sl); }
    else if(late){ alertUser('close',`It is ${t}. Close your ${p.bias} trade now (P/L about ${pnl>=0?'+':'−'}$${f2(Math.abs(pnl))}).`); m.phase='done'; finishTrade(price); }
    $('phase').textContent = m.phase==='in' ? `In a ${p.bias} trade from ${f2(m.entry)}. Stop ${f2(m.sl)}. P/L about ${pnl>=0?'+':'−'}$${f2(Math.abs(pnl))}.` : 'Trade finished. Record the exit in your journal.';
  } }
function entered(){ if(!S.plan){ toast('Set a plan first.'); return; } const px=Number($('entryPx').value)||S.price; if(!px){ toast('Enter your entry price.'); return; }
  S.mon.phase='in'; S.mon.entry=px; S.mon.sl=S.plan.stop_loss; S.mon.beDone=false; S.mon.at=Date.now(); if(ANA.ready) anaDraw(false);
  alertUser(null,`Trade logged: ${S.plan.bias} at ${f2(px)}. Make sure SL ${f2(S.plan.stop_loss)} and TP ${f2(S.plan.take_profit)} are set in MT5.`); if(S.price) watchPlan(S.price); }
function recordExit(){ const p=S.plan, ex=Number($('exitPx').value); if(!p || !S.mon.entry || !ex){ toast('Enter the exit price.'); return; }
  addJournal({at:S.mon.at||Date.now(), side:p.bias, entry:S.mon.entry, sl:p.stop_loss, tp:p.take_profit, exit:ex, lot:cfg.lot, src:p.source||(p.leader?'AI team':'AI team'), note:p.grade?'Grade '+p.grade:''});
  toast('Trade saved to your journal.'); resetPlan(); }
function resetPlan(){ S.plan=null; S.mon={phase:'idle', entry:null, sl:null, beDone:false, fired:{}}; $('exitRow').hidden=true; $('phase').textContent='No plan set.'; pill($('planPill'),'No plan'); if(ANA.ready) anaDraw(false); renderPlanMini(); }

// ---------- price alerts ----------
function renderPA(){ const box=clear($('paList')); if(!S.priceAlerts.length){ empty(box,'No price alerts yet.'); return; }
  S.priceAlerts.slice().sort((a,b)=>a.done-b.done||b.price-a.price).forEach(a=>{ const li=el('div','li'); li.append(el('span', a.dir==='above'?'up':'down', a.dir==='above'?'Above':'Below'), el('b',null,f2(a.price)), el('span','grow muted small', (a.note||'')+(a.done?` Triggered ${khTime(a.hitAt)}`:'')));
    const x=el('button','btn btn-ghost btn-sm','Remove'); x.onclick=()=>{ S.priceAlerts=S.priceAlerts.filter(y=>y!==a); LS.set('goldAiDesk.alerts',S.priceAlerts); renderPA(); }; li.appendChild(x); if(a.done) li.style.opacity='.6'; box.appendChild(li); }); }
function checkPriceAlerts(price){ let hit=false; S.priceAlerts.forEach(a=>{ if(a.done) return; if((a.dir==='above' && price>=a.price) || (a.dir==='below' && price<=a.price)){ a.done=true; a.hitAt=Date.now(); hit=true;
  notify(`PRICE ALERT: gold ${a.dir==='above'?'rose above':'fell below'} ${f2(a.price)}. Now ${f2(price)}.${a.note?' '+a.note:''}`); } }); if(hit){ LS.set('goldAiDesk.alerts',S.priceAlerts); renderPA(); } }

// ---------- markets ----------
function renderIntermarket(){ const box=$('imBody'); if(!Object.keys(S.quotes).length){ pill($('imPill'),'–'); empty(box,'No data yet. Start live or refresh.'); return; } clear(box);
  const im=intermarket(); pill($('imPill'), `Gold bias ${im.bias} (score ${im.score>0?'+':''}${im.score})`, biasKind(im.bias));
  const t=el('table','tbl'), hr=el('tr'); ['Market','Today','Effect on gold','Why it matters'].forEach(x=>hr.appendChild(el('th',null,x))); t.appendChild(hr);
  im.rows.forEach(({s,q,r,eff})=>{ const tr=el('tr'); tr.appendChild(el('td',null,r?.name||s)); tr.appendChild(el('td', q.err?'muted':q.pct>=0?'up':'down', q.err?q.err:pct(q.pct)+(q.open===false?' (closed)':'')));
    tr.appendChild(el('td', eff>0?'up':eff<0?'down':'muted', eff>0?'Supports gold':eff<0?'Pressures gold':'Neutral')); tr.appendChild(el('td','wrap muted',r?.why||'')); t.appendChild(tr); });
  const w=el('div','tblwrap'); w.appendChild(t); box.appendChild(w); box.appendChild(el('p','small muted mt',`Updated ${khTime(S.last.quotes)}. ETFs (UUP, TLT, SPY) move only during US market hours.`)); }

// ---------- economy ----------
function renderBrief(){ const box=$('briefBody'), b=S.brief; if(!b) return; clear(box);
  const h=el('div','row'), bias=String(b.gold_bias||'neutral').toLowerCase(); h.append(el('span','pill '+biasKind(bias==='neutral'?'':bias),`Fundamental bias: ${bias}${b.confidence?' ('+b.confidence+'%)':''}`), el('span','small muted',`by ${b.by}, ${Math.round((Date.now()-b.at)/60e3)} min ago`)); box.appendChild(h);
  if(b.summary) box.appendChild(el('p',null,b.summary));
  const kv=el('div','kv'); [['US dollar',b.usd],['Yields',b.yields],['Risk mood',b.risk_sentiment]].forEach(([k,v])=>v&&kvRow(kv,k,String(v))); box.appendChild(kv);
  if(b.drivers?.length){ box.appendChild(el('h3',null,'What is moving gold')); const ul=el('ul'); b.drivers.forEach(d=>ul.appendChild(el('li',null,String(d)))); box.appendChild(ul); }
  const ev=eventsSorted(); box.appendChild(el('h3',null,'Economic events (Cambodia time)'));
  if(!ev.length) box.appendChild(el('p','muted','No events with times were found.'));
  else{ const t=el('table','tbl'), hr=el('tr'); ['Time','Currency','Event','Impact','Forecast','Previous','Actual'].forEach(x=>hr.appendChild(el('th',null,x))); t.appendChild(hr); const now=Date.now();
    ev.forEach(e=>{ const tr=el('tr', e.t>now && e.t-now<=3*3600e3 ? 'soon' : ''); [khDay(e.t), e.currency||'', e.event||'', e.impact||'', e.forecast||'', e.previous||'', e.actual||''].forEach((v,i)=>{ const c=el('td', i===3 && /high/i.test(v)?'down':i===2?'wrap':'', String(v)); if(e.t<now) c.style.opacity='.55'; tr.appendChild(c); }); t.appendChild(tr); });
    const w=el('div','tblwrap'); w.appendChild(t); box.appendChild(w); box.appendChild(el('p','small muted','Highlighted rows are within 3 hours. Cross-check times with the calendar below.')); }
  if(b.sources?.length){ box.appendChild(el('h3',null,'Sources')); const ul=el('ul'); b.sources.forEach(s=>{ const li=el('li'); li.appendChild(safeLink(s.url, s.title)); ul.appendChild(li); }); box.appendChild(ul); } }

// ---------- AI desk ----------
function renderThumbs(){ const box=clear($('thumbs')); S.images.forEach((im,i)=>{ const d=el('div','thumb'), img=el('img'); img.src=im.dataUrl; img.alt=im.name; const x=el('button'); x.type='button'; x.setAttribute('aria-label','Remove '+im.name); x.innerHTML='<svg><use href="#i-x"/></svg>';
  x.onclick=()=>{ S.images.splice(i,1); renderThumbs(); }; d.append(img, x, el('span',null,im.name)); box.appendChild(d); }); }
function aiCard(name, state){ const d=el('div','panel'), h=el('div','panel-head'); h.appendChild(el('h2',null,name)); d.appendChild(h);
  if(state.loading){ d.appendChild(el('div','muted','Analyzing…')); return d; } if(state.error){ d.appendChild(el('div','err',state.error)); return d; }
  const p=state.plan; h.appendChild(el('span','pill '+sideKind(p.bias), `${p.bias==='wait'?'Wait':p.bias==='buy'?'Buy':'Sell'} · ${p.confidence}%`));
  const kv=el('div','kv'); if(p.bias!=='wait'){ kvRow(kv,'Entry zone',`${f2(p.entry_low)} – ${f2(p.entry_high)}`); kvRow(kv,'Stop loss',f2(p.stop_loss)); kvRow(kv,'Take profit',f2(p.take_profit)); }
  kvRow(kv,'Trigger',p.entry_trigger||'–'); kvRow(kv,'Invalid if',p.invalidation||'–'); kvRow(kv,'Why',p.reasoning||'–'); if(p.note) kvRow(kv,'Note',p.note); d.appendChild(kv);
  if(state.noImage) d.appendChild(el('p','small muted','DeepSeek read the price data only (no pictures).')); return d; }
function renderCards(){ const box=clear($('aiCards')); Object.entries(S.results).forEach(([n,s])=>box.appendChild(aiCard(n,s))); }
function renderFinal(c){ const box=clear($('consensus')); if(!c) return; const d=el('div','panel'+(c.leader?' lead':''));
  const h=el('div','panel-head'), t=el('div'); t.append(el('div','small muted', c.leader?"Claude's final decision":'Team vote'), el('div','big', c.bias==='wait'?'Wait':c.bias==='buy'?'Buy':'Sell'));
  h.append(t, el('span','pill', `Round 1: buy ${c.votes.buy}, sell ${c.votes.sell}, wait ${c.votes.wait}`)); d.appendChild(h);
  if(c.leader){ const kv=el('div','kv'); kvRow(kv,'Why',c.decision_notes||c.reasoning||'–'); if(c.agreed_with.length) kvRow(kv,'Agreed with',c.agreed_with.join(', ')); if(c.overruled.length) kvRow(kv,'Overruled',c.overruled.join(', ')); d.appendChild(kv); }
  if(c.bias==='wait'){ d.appendChild(el('p',null,(c.leader?'':(c.why||'')+' ')+'No trade is a valid decision. Run the analysis again later.')); box.appendChild(d); return; }
  const sg=el('div','statgrid mt'); sg.append(stat('Entry zone',`${f2(c.entry_low)} – ${f2(c.entry_high)}`), stat('Stop loss',f2(c.stop_loss),`−$${f2(c.riskUsd)} (${c.riskPct.toFixed(1)}%)`,'down'), stat('Take profit',f2(c.take_profit),`+$${f2(c.rewardUsd)}`,'up'), stat('Move SL to entry',f2(c.breakeven_at)), stat('Close by',c.close_by), stat('Confidence',c.confidence+'%')); d.appendChild(sg);
  if(c.entry_trigger) d.appendChild(el('p','small muted','Entry trigger: '+c.entry_trigger));
  if(c.tooRisky) d.appendChild(el('div','warnbox',`Risk is above your ${cfg.riskPct}% limit at lot ${cfg.lot}. Alerts are blocked for this plan.`));
  const cond=conditions(), avoid=cond.verdict==='AVOID'; if(avoid) d.appendChild(el('div','warnbox',`Market conditions say avoid (${cond.why}). Alerts are blocked. Run the analysis again later.`));
  const btn=el('button','btn btn-primary mt','Use this plan for alerts'); btn.disabled=!!c.tooRisky||avoid; btn.onclick=()=>setPlan({...c, source:'AI team'}); d.appendChild(btn); box.appendChild(d); }
function say(who, title, text){ const t=el('div','turn'); t.append(el('b',null,`${who} · ${title}`), el('span',null,text)); $('discussion').appendChild(t); $('discBox').hidden=false; }
function renderPics(res){ const box=clear($('imgResult')); const wrap=el('div','grid3');
  Object.entries(res).forEach(([n,st])=>{ const d=el('div','panel'), h=el('div','panel-head'); h.appendChild(el('h2',null,`${n} read your pictures`)); d.appendChild(h);
    if(st.loading){ d.appendChild(el('div','muted','Reading…')); wrap.appendChild(d); return; } if(st.error){ d.appendChild(el('div','err',st.error)); wrap.appendChild(d); return; }
    const o=st.raw, p=st.plan; h.appendChild(el('span','pill '+sideKind(p.bias), `${p.bias==='wait'?'Wait':p.bias==='buy'?'Buy':'Sell'} · ${p.confidence}%`));
    (o.charts||[]).forEach(ch=>{ const kv=el('div','kv'); kvRow(kv,'Picture '+(ch.picture||''), `${ch.symbol||''} ${ch.timeframe||''}`.trim()||'–'); kvRow(kv,'Trend',String(ch.trend||'–')); if(ch.levels?.length) kvRow(kv,'Levels',ch.levels.map(f2).join(', ')); if(ch.patterns?.length) kvRow(kv,'Patterns',ch.patterns.join(', ')); if(ch.notes) kvRow(kv,'Notes',ch.notes); d.appendChild(kv); });
    if(o.summary) d.appendChild(el('p',null,o.summary)); if(o.agrees_with_live_data) d.appendChild(el('p','small muted','Matches live data: '+o.agrees_with_live_data));
    if(p.bias!=='wait'){ const plan=addRisk({...p}); const sg=el('div','statgrid'); sg.append(stat('Entry',`${f2(p.entry_low)} – ${f2(p.entry_high)}`), stat('Stop loss',f2(p.stop_loss),null,'down'), stat('Take profit',f2(p.take_profit),null,'up')); d.appendChild(sg);
      const b=el('button','btn mt','Use this plan for alerts'); b.disabled=plan.tooRisky || conditions().verdict==='AVOID'; b.onclick=()=>setPlan({...plan, votes:{buy:0,sell:0,wait:0}, source:'AI pictures'}); d.appendChild(b);
      if(plan.tooRisky) d.appendChild(el('div','warnbox','Stop is wider than your risk limit.')); }
    wrap.appendChild(d); });
  box.appendChild(wrap); }
async function runTeamUI(){ if($('analyzeBtn').disabled) return; $('discussion').innerHTML=''; $('discBox').hidden=true; await runTeam(); }

// ---------- data explorer ----------
const DXS={rows:[], view:[], shown:200, sort:{k:'t', dir:-1}, meta:null};
const toLocalInput = ms => new Date(ms+KH).toISOString().slice(0,16);
const fromLocalInput = v => Date.parse(v+':00+07:00');
function quickRange(q){ const now=Date.now(), today0=fromLocalInput(khDate(now)+'T00:00'); let from, to=now, iv;
  if(q==='today'){ from=today0; iv='15min'; } else if(q==='yesterday'){ from=today0-864e5; to=today0-60e3; iv='15min'; }
  else if(q==='week'){ const wd=(new Date(now+KH).getUTCDay()+6)%7; from=today0-wd*864e5; iv='1h'; } else if(q==='month'){ from=now-30*864e5; iv='4h'; } else { from=now-365*864e5; iv='1day'; }
  $('dxFrom').value=toLocalInput(from); $('dxTo').value=toLocalInput(to); $('dxIv').value=iv; }
async function dxLoad(){
  const iv=$('dxIv').value, f=$('dxFrom').value, t=$('dxTo').value; if(!f||!t){ toast('Choose a From and To time.'); return; }
  const btn=$('dxForm').querySelector('button'); btn.disabled=true; btn.textContent='Loading…';
  try{ const rows=await series(iv, 5000, {timezone:'Asia/Phnom_Penh', start_date:f.replace('T',' ')+':00', end_date:t.replace('T',' ')+':00'});
    if(!rows.length){ toast('No candles in that range. Gold is closed at weekends.'); return; }
    DXS.rows=rows; DXS.meta={iv, f, t}; DXS.shown=200; dxStats(); dxApply(); candleChart($('dxChart'), rows); $('dxCsv').disabled=false; }
  catch(e){ toast('Data error: '+e.message); } finally{ btn.disabled=false; btn.textContent='Load data'; } }
function dxStats(){ const r=DXS.rows, box=clear($('dxStats')); let hi=r[0], lo=r[0], big=r[0], ups=0, sumR=0;
  r.forEach(x=>{ if(x.h>hi.h) hi=x; if(x.l<lo.l) lo=x; if(x.h-x.l>big.h-big.l) big=x; if(x.c>=x.o) ups++; sumR+=x.h-x.l; });
  const first=r[0], last=r.at(-1), chg=last.c-first.o; DXS.hiT=hi.t; DXS.loT=lo.t;
  box.append(stat('Highest', f2(hi.h), khStamp(hi.t*1000), 'up'), stat('Lowest', f2(lo.l), khStamp(lo.t*1000), 'down'), stat('Open', f2(first.o), khStamp(first.t*1000)), stat('Close', f2(last.c), khStamp(last.t*1000)),
    stat('Change', sgn(chg), pct(chg/first.o*100), chg>=0?'up':'down'), stat('High to low', '$'+f2(hi.h-lo.l)), stat('Average candle', '$'+f2(sumR/r.length)), stat('Biggest candle', '$'+f2(big.h-big.l), khStamp(big.t*1000)), stat('Green candles', Math.round(ups/r.length*100)+'%', `${r.length} candles`)); }
function dxApply(){ const q=$('dxSearch').value.trim(), ft=$('dxFType').value, fv=Number($('dxFVal').value);
  let v=DXS.rows.map((x,i)=>({...x, ds:khStamp(x.t*1000), chg: i? x.c-DXS.rows[i-1].c : x.c-x.o, rng:x.h-x.l}));
  if(q) v=v.filter(x=>x.ds.includes(q)); if(ft==='hge' && !isNaN(fv)) v=v.filter(x=>x.h>=fv); if(ft==='lle' && !isNaN(fv)) v=v.filter(x=>x.l<=fv); if(ft==='rge' && !isNaN(fv)) v=v.filter(x=>x.rng>=fv); if(ft==='up') v=v.filter(x=>x.c>=x.o); if(ft==='down') v=v.filter(x=>x.c<x.o);
  const {k,dir}=DXS.sort; v.sort((a,b)=>(a[k]-b[k])*dir); DXS.view=v; dxTable(); }
function dxTable(){ const t=clear($('dxTable')), cols=[['t','Date and time (Cambodia)'],['o','Open'],['h','High'],['l','Low'],['c','Close'],['chg','Change'],['rng','Range']];
  const hr=el('tr'); cols.forEach(([k,n])=>{ const th=el('th', k==='t'?'':'num', n+(DXS.sort.k===k?(DXS.sort.dir>0?' ▲':' ▼'):'')); th.dataset.sort=k; th.onclick=()=>{ DXS.sort={k, dir: DXS.sort.k===k ? -DXS.sort.dir : -1}; dxApply(); }; hr.appendChild(th); }); t.appendChild(hr);
  DXS.view.slice(0,DXS.shown).forEach(x=>{ const tr=el('tr', x.t===DXS.hiT||x.t===DXS.loT?'hl':''); tr.appendChild(el('td',null,x.ds)); ['o','h','l','c'].forEach(k=>tr.appendChild(el('td','num',f2(x[k])))); tr.appendChild(el('td','num '+(x.chg>=0?'up':'down'),sgn(x.chg))); tr.appendChild(el('td','num',f2(x.rng))); t.appendChild(tr); });
  $('dxCount').textContent=`${Math.min(DXS.shown,DXS.view.length)} of ${DXS.view.length} candles shown`; $('dxMore').hidden=DXS.view.length<=DXS.shown; }
function dxCsv(){ const lines=['datetime_cambodia,open,high,low,close'].concat(DXS.view.map(x=>`${x.ds},${x.o},${x.h},${x.l},${x.c}`));
  const a=el('a'); a.href=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/csv'})); a.download=`xauusd_${DXS.meta.iv}_${DXS.meta.f.slice(0,10)}_${DXS.meta.t.slice(0,10)}.csv`; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000); }
async function heatLoad(){ const btn=$('heatBtn'); btn.disabled=true; btn.textContent='Calculating…';
  try{ const b=S.heatBars || (S.heatBars=await series('15min',5000)); renderHeat(bestHours(b), b); } catch(e){ toast('Data error: '+e.message); } finally{ btn.disabled=false; btn.textContent='Recalculate'; } }
function renderHeat(H, b){ const box=clear($('heat')), t=el('table','heat'), hr=el('tr'); hr.appendChild(el('th',null,'Hour')); H.days.forEach(d=>hr.appendChild(el('th',null,d))); t.appendChild(hr);
  const gold=cssVar('--gold'); const top=[];
  for(let h=0;h<24;h++){ const tr=el('tr'); tr.appendChild(el('th',null,String(h).padStart(2,'0')+':00'));
    H.days.forEach(d=>{ const v=H.cell[d+'|'+h], td=el('td', null, v?(v<10?v.toFixed(1):f0(v)):''); if(v){ const k=v/H.max; td.style.background=rgba(gold, .08+k*.8); td.style.color=k>.55?cssVar('--gold-ink'):''; td.title=`${d} ${String(h).padStart(2,'0')}:00 Cambodia time: average range $${f2(v)}`; top.push({d,h,v}); }
      const ms=fromLocalInput(khDate(Date.now())+'T'+String(h).padStart(2,'0')+':30'); if(inWindow(ms)) td.classList.add('win'); tr.appendChild(td); }); t.appendChild(tr); }
  box.appendChild(t); top.sort((a,c)=>c.v-a.v); box.appendChild(el('p','small muted mt',`Busiest hours: ${top.slice(0,3).map(x=>`${x.d} ${String(x.h).padStart(2,'0')}:00 ($${f2(x.v)})`).join(', ')}. Based on ${b.length} candles from ${khDate(b[0].t*1000)} to ${khDate(b.at(-1).t*1000)}.`)); }

// ---------- backtest ----------
async function btRun(){ const btn=$('btRun'); btn.disabled=true; btn.textContent='Running…';
  try{ const n=+$('btBars').value, b=closedBars(await series('15min',n),900), h=closedBars(await series('1h',Math.ceil(n/4)+60),3600);
    const r=backtest(b, h, {spread:+$('btSpread').value||0, window:$('btWindow').checked, be:$('btBe').checked, skip:$('btSkip').checked}); renderBt(r); }
  catch(e){ toast('Backtest error: '+e.message); } finally{ btn.disabled=false; btn.textContent='Run backtest'; } }
function renderBt(r){ const box=clear($('btStats'));
  box.append(stat('Trades', String(r.n), `${khDate(r.from*1000)} to ${khDate(r.to*1000)}`), stat('Win rate', r.winRate.toFixed(0)+'%', `${r.wins} wins`), stat('Net result', (r.net>=0?'+$':'−$')+f2(Math.abs(r.net)), `at lot ${cfg.lot}`, r.net>=0?'up':'down'),
    stat('Average per trade', (r.avgR>=0?'+':'')+r.avgR.toFixed(2)+' R'), stat('Profit factor', isFinite(r.pf)?r.pf.toFixed(2):'∞', 'above 1.3 is good'), stat('Worst drawdown', '−$'+f2(Math.abs(r.maxDD)), null, 'down'));
  equityChart('bt', $('btChart'), r.curve);
  const t=clear($('btTrades')), hr=el('tr'); ['Entry time','Side','Entry','Stop','Target','Exit','Result','R','$'].forEach((h,i)=>hr.appendChild(el('th',i>1?'num':'',h))); t.appendChild(hr);
  r.trades.slice().reverse().slice(0,300).forEach(x=>{ const tr=el('tr'); tr.append(el('td',null,khStamp(x.t*1000)), el('td',x.side==='buy'?'up':'down',x.side==='buy'?'Buy':'Sell'));
    [x.entry,x.sl,x.tp,x.exit].forEach(v=>tr.appendChild(el('td','num',f2(v)))); tr.append(el('td','num',x.why), el('td','num '+(x.r>=0?'up':'down'),x.r.toFixed(2)), el('td','num '+(x.usd>=0?'up':'down'),sgn(x.usd))); t.appendChild(tr); });
  $('btCount').textContent=r.n?`${r.n} trades, newest first`:'No trades. Try more history or turn off the trading window filter.'; }

// ---------- journal ----------
function addJournal(e){ const pnl=(e.exit-e.entry)*(e.side==='buy'?1:-1), risk=e.sl?Math.abs(e.entry-e.sl):null;
  S.journal.push({id:Date.now()+Math.random(), ...e, usd:pnl*e.lot*100, r: risk? pnl/risk : null}); LS.set('goldAiDesk.journal', S.journal); renderJournal(); }
function renderJournal(){ const J=S.journal.slice().sort((a,b)=>a.at-b.at), box=clear($('jStats'));
  if(!J.length){ box.appendChild(el('p','muted','No trades yet. Finished alert trades and trades you add below appear here.')); $('jChart').hidden=true; } else {
    const w=J.filter(x=>x.usd>0), net=J.reduce((s,x)=>s+x.usd,0), rs=J.filter(x=>x.r!=null), gw=w.reduce((s,x)=>s+x.usd,0), gl=J.filter(x=>x.usd<=0).reduce((s,x)=>s+x.usd,0);
    box.append(stat('Trades',String(J.length)), stat('Win rate',Math.round(w.length/J.length*100)+'%',`${w.length} wins`), stat('Net result',(net>=0?'+$':'−$')+f2(Math.abs(net)),null,net>=0?'up':'down'),
      stat('Average R', rs.length?(rs.reduce((s,x)=>s+x.r,0)/rs.length).toFixed(2):'–'), stat('Profit factor', gl? (gw/Math.abs(gl)).toFixed(2) : (gw?'∞':'–')), stat('Best trade','+$'+f2(Math.max(0,...J.map(x=>x.usd)))));
    let eq=0; equityChart('j', $('jChart'), J.map(x=>({t:Math.floor(x.at/1000), v:(eq+=x.usd)}))); }
  const t=clear($('jTable')), hr=el('tr'); ['Date (Cambodia)','Side','Entry','Stop','Exit','Lot','R','$','Source','Notes',''].forEach((h,i)=>hr.appendChild(el('th',[2,3,4,5,6,7].includes(i)?'num':'',h))); t.appendChild(hr);
  J.slice().reverse().forEach(x=>{ const tr=el('tr'); tr.append(el('td',null,khStamp(x.at)), el('td',x.side==='buy'?'up':'down',x.side==='buy'?'Buy':'Sell'), el('td','num',f2(x.entry)), el('td','num',f2(x.sl)), el('td','num',f2(x.exit)), el('td','num',String(x.lot)),
    el('td','num',x.r==null?'–':x.r.toFixed(2)), el('td','num '+(x.usd>=0?'up':'down'),sgn(x.usd)), el('td',null,x.src||''), el('td','wrap muted',x.note||''));
    const d=el('td'), b=el('button','btn btn-ghost btn-sm','Delete'); b.onclick=()=>{ if(!confirm('Delete this trade from the journal?')) return; S.journal=S.journal.filter(y=>y.id!==x.id); LS.set('goldAiDesk.journal',S.journal); renderJournal(); }; d.appendChild(b); tr.appendChild(d); t.appendChild(tr); }); }
function journalCsv(){ const rows=['date_cambodia,side,entry,stop,take_profit,exit,lot,r,usd,source,notes'].concat(S.journal.map(x=>[khStamp(x.at),x.side,x.entry,x.sl??'',x.tp??'',x.exit,x.lot,x.r==null?'':x.r.toFixed(2),x.usd.toFixed(2),x.src||'',`"${String(x.note||'').replace(/"/g,'""')}"`].join(',')));
  const a=el('a'); a.href=URL.createObjectURL(new Blob([rows.join('\n')],{type:'text/csv'})); a.download='gold_journal.csv'; a.click(); }

// ---------- tools ----------
function calcPS(){ const bal=+$('psBal').value, r=+$('psRisk').value, e=+$('psEntry').value, sl=+$('psSl').value, tp=+$('psTp').value, box=clear($('psOut'));
  if(!bal||!r||!e||!sl){ box.appendChild(el('p','muted small','Fill balance, risk, entry and stop loss.')); return; }
  const dist=Math.abs(e-sl), riskUsd=bal*r/100, lots=Math.floor(riskUsd/(dist*100)*100)/100, real=dist*100*Math.max(lots,0.01);
  box.append(stat('Lot size', lots>=0.01?lots.toFixed(2):'0.01', lots<0.01?'Minimum lot is still too big':'rounded down'), stat('Money at risk','$'+f2(real), (real/bal*100).toFixed(1)+'% of balance', 'down'), stat('Stop distance','$'+f2(dist)));
  if(tp){ const rw=Math.abs(tp-e); box.append(stat('Reward','$'+f2(rw*100*Math.max(lots,0.01)),null,'up'), stat('Reward to risk',(rw/dist).toFixed(2))); }
  if(lots<0.01) box.appendChild(el('div','warnbox','Even 0.01 lot risks more than your limit here. Use a closer stop or skip the trade.')); }
function calcPL(){ const s=+$('plSide').value, lot=+$('plLot').value, o=+$('plOpen').value, c=+$('plClose').value, box=clear($('plOut')); if(!lot||!o||!c){ box.appendChild(el('p','muted small','Fill lot, open and close price.')); return; }
  const v=(c-o)*s*lot*100; box.append(stat('Profit or loss',(v>=0?'+$':'−$')+f2(Math.abs(v)),null,v>=0?'up':'down'), stat('Price move','$'+f2(Math.abs(c-o))), stat('Per $1 move','$'+f2(lot*100))); }
function renderToolSessions(){ const box=clear($('tSessions')); sessionInfo().forEach(s=>{ const p=el('div','stat'); p.append(el('div','k',s.n), el('div','v '+(s.open?'up':'muted'), s.open?'Open':'Closed'),
  el('div','d',`${String(s.khOpen).padStart(2,'0')}:00–${String(s.khClose).padStart(2,'0')}:00 Cambodia time. ${s.open?'Closes':'Opens'} in ${Math.floor(s.mins/60)}h ${s.mins%60}m.`)); box.appendChild(p); });
  $('tClock').textContent='Cambodia time '+nowKH(); $('dClock').textContent=nowKH(); }
