// ===== AI: news brief (web search), team analysis, picture analysis =====
const SYSTEM = 'You are a disciplined short-term XAU/USD (gold) trading analyst helping a beginner on a small account. You never promise profit. You prefer waiting over forcing a trade. You answer with one JSON object only, no markdown.';
const PLAN_SCHEMA = `{"bias":"buy|sell|wait","confidence":0-100,"entry_low":number|null,"entry_high":number|null,"entry_trigger":"what to see on 15min before entering","stop_loss":number|null,"take_profit":number|null,"breakeven_at":number|null,"close_by":"HH:MM","invalidation":"when the idea is wrong","support":[numbers],"resistance":[numbers],"reasoning":"max 60 words"}`;
const errMsg = e => e.message==='Failed to fetch' ? 'Request blocked by the browser or network (CORS). See README.' : e.message;

// ----- pictures: resize to keep requests small and fast -----
async function addImages(files){
  const list=[...files].filter(f=>f.type.startsWith('image/'));
  for(const f of list){ if(S.images.length>=4){ toast('Up to 4 pictures. Remove one to add another.'); break; }
    try{ S.images.push(await shrink(f)); }catch(e){ toast('Could not read '+(f.name||'picture')); } }
  IMG_HOOKS.forEach(h=>h()); }
const IMG_HOOKS=[];
function shrink(file, max=1568){ return new Promise((res, rej)=>{ const url=URL.createObjectURL(file), img=new Image();
  img.onload=()=>{ const k=Math.min(1, max/Math.max(img.width, img.height)), w=Math.round(img.width*k), h=Math.round(img.height*k);
    const cv=document.createElement('canvas'); cv.width=w; cv.height=h; cv.getContext('2d').drawImage(img,0,0,w,h); URL.revokeObjectURL(url);
    const dataUrl=cv.toDataURL('image/jpeg', .86); res({name:file.name||'Pasted picture', dataUrl, mime:'image/jpeg', b64:dataUrl.split(',')[1], w, h}); };
  img.onerror=()=>{ URL.revokeObjectURL(url); rej(new Error('bad image')); }; img.src=url; }); }

// ----- context the AIs read -----
function csv(b,n){ return (b||[]).slice(-n).map(x=>khStamp(x.t*1000).slice(5)+','+x.o.toFixed(2)+','+x.h.toFixed(2)+','+x.l.toFixed(2)+','+x.c.toFixed(2)).join('\n'); }
function tfLine(name, b){ const s=tfSummary(b); return s ? `${name}: close ${s.close.toFixed(2)}, trend ${s.trend}, EMA20 ${s.e20.toFixed(2)}, EMA50 ${s.e50.toFixed(2)}${s.e200?', EMA200 '+s.e200.toFixed(2):''}, RSI ${s.rsi?.toFixed(1)}, MACD hist ${s.macdHist?.toFixed(2)}, ADX ${s.adx?.toFixed(0)}, ATR ${s.atr?.toFixed(2)}` : `${name}: not loaded`; }
function contextBlock(){
  const cond=conditions(), out=[];
  out.push(`Market conditions: ${cond.verdict}. `+cond.tiles.map(x=>`${x.k}: ${x.v} (${x.d})`).join('; '));
  const ds=dayStats(); if(ds) out.push(`Today: open ${f2(ds.open)}, high ${f2(ds.high)}, low ${f2(ds.low)}, previous close ${f2(ds.prevClose)}, previous day high ${f2(ds.prevHigh)} low ${f2(ds.prevLow)}, daily ATR ${f2(ds.atr)}.`);
  const kl=keyLevels(); if(kl) out.push('Key levels above: '+kl.above.slice(0,6).map(x=>`${x.name} ${f2(x.p)}`).join(', ')+'. Below: '+kl.below.slice(0,6).map(x=>`${x.name} ${f2(x.p)}`).join(', ')+'.');
  if(cond.im) out.push('Other markets today: '+cond.im.rows.map(r=>`${r.r?.name||r.s} ${r.q.err?'n/a':pct(r.q.pct)}`).join(', ')+`. Intermarket gold bias: ${cond.im.bias} (score ${cond.im.score}).`);
  const b=S.brief; if(b){ const ev=eventsSorted().filter(e=>e.t>Date.now()-6*3600e3).slice(0,10).map(e=>`${khDay(e.t)} ${e.currency||''} ${e.event} [${e.impact||''}]${e.actual?' actual '+e.actual:''}${e.forecast?' forecast '+e.forecast:''}`).join('; ');
    out.push(`News brief (${b.by}, ${Math.round((Date.now()-b.at)/60e3)} min old): fundamental bias ${b.gold_bias}. USD: ${b.usd||'-'}. Yields: ${b.yields||'-'}. Risk mood: ${b.risk_sentiment||'-'}. Drivers: ${(b.drivers||[]).join('; ')}. Events (Cambodia time): ${ev||'none listed'}.`); }
  else out.push('News brief: not loaded, so economic events are unknown.');
  const s=S.signal; if(s) out.push(`Rule-based live signal: ${s.state==='none'?'none':s.side.toUpperCase()+' '+s.state} (${s.n}/5: ${s.checks.map(([k,ok])=>(ok?'yes ':'no ')+k).join(', ')}).`);
  return out.join('\n'); }
function dataBlock(){
  const maxUsd=cfg.balance*cfg.riskPct/100, h4=S.candles['1h']?aggregate(S.candles['1h'],14400):null;
  return `Market: XAU/USD, short-term trade (minutes to a few hours).
Current Cambodia time (UTC+7): ${nowKH()}. Trading window ${cfg.winStart}-${cfg.closeTime}; all trades closed by ${cfg.closeTime}.
Account: $${cfg.balance}, lot ${cfg.lot} (1.00 price move = $${(cfg.lot*100).toFixed(2)}). Max risk per trade $${maxUsd.toFixed(2)}, so stop-loss distance must be <= ${maxDist().toFixed(2)}.
Latest price: ${S.price?S.price.toFixed(2):'unknown'}.
${tfLine('15 min',S.candles['15min'])}
${tfLine('1 hour',S.candles['1h'])}
${tfLine('4 hours',h4)}
${tfLine('1 day',S.candles['1day'])}
${contextBlock()}
Trader notes: ${$('notes').value.trim()||'none'}
Candles (Cambodia time, open,high,low,close):
[1day]
${csv(S.candles['1day'],30)}
[4h]
${csv(h4,30)}
[1h]
${csv(S.candles['1h'],48)}
[15min]
${csv(S.candles['15min'],64)}
${S.images.length ? `The trader attached ${S.images.length} chart picture(s). Read them carefully (timeframe, trend, levels, patterns).` : ''}`; }
const RULES = () => `Rules: trade with higher-timeframe structure, enter on pullbacks to support/resistance, not in the middle of a range. Take profit at least 1.5x the stop distance and before the next major level. Weigh the news brief and other markets. If market conditions are AVOID, or a high-impact event is within ${cfg.newsBuffer} minutes, return "wait". If there is no clean setup, return bias "wait" with null prices.`;
const buildPrompt = () => `${dataBlock()}\n\nYou are one analyst on a team. Give your own independent analysis.\n${RULES()}\nReturn exactly this JSON:\n${PLAN_SCHEMA}`;
function teamViews(){ return Object.entries(S.results).filter(([,s])=>s.plan).map(([n,s])=>{ const p=s.plan; return `${n}: ${p.bias.toUpperCase()} (${p.confidence}%), entry ${p.entry_low??'-'}-${p.entry_high??'-'}, SL ${p.stop_loss??'-'}, TP ${p.take_profit??'-'}. Reason: ${p.reasoning}`; }).join('\n'); }
const critiquePrompt = name => `${dataBlock()}\n\nRound 1 analyses from the team:\n${teamViews()}\n\nYou are ${name}, an expert reviewer. Claude is the team lead and will make the final decision. Check each plan against the price data, levels, other markets and the news brief: is the direction supported, are entry, SL and TP sensible, is the risk within the limit, is there event risk? Be specific and honest.\nReturn exactly this JSON:\n{"stance":"agree|partly|disagree","preferred_bias":"buy|sell|wait","concerns":"max 50 words","suggested_changes":"max 40 words, with prices"}`;
const leaderPrompt = critiques => `${dataBlock()}\n\nRound 1 analyses from the team:\n${teamViews()}\n\nExpert reviews:\n${critiques||'none'}\n\nYou are Claude, the team lead and final decision maker. Weigh the evidence, not the number of votes. You may overrule anyone, including your own round 1 view. Hard limits: stop-loss distance <= ${maxDist().toFixed(2)}, all trades closed by ${cfg.closeTime}. When the evidence is mixed, choose "wait".\n${RULES()}\nReturn exactly this JSON (the plan schema plus three extra fields):\n${PLAN_SCHEMA.slice(0,-1)},"decision_notes":"max 80 words: why this decision","agreed_with":["names"],"overruled":["names"]}`;
const PIC_SCHEMA = `{"charts":[{"picture":1,"symbol":"what the chart shows","timeframe":"e.g. 15m","trend":"up|down|range","levels":[numbers],"patterns":["short"],"indicators":"what you can read","notes":"max 30 words"}],"agrees_with_live_data":"yes|no|partly|no live data","summary":"max 60 words",${PLAN_SCHEMA.slice(1)}`;
const picPrompt = () => `${S.candles['15min'] ? dataBlock() : `Account: $${cfg.balance}, lot ${cfg.lot}. Max stop-loss distance ${maxDist().toFixed(2)}. Cambodia time ${nowKH()}.`}\n\nThe trader sent ${S.images.length} chart picture(s). Read each picture: symbol, timeframe, trend, support and resistance prices you can see, chart patterns and indicators. Then compare with the live data above (if any) and give a short-term plan for gold.\n${RULES()}\nReturn exactly this JSON:\n${PIC_SCHEMA}`;

// ----- provider calls -----
async function claudeFetch(body){
  const r=await fetch('https://api.anthropic.com/v1/messages', {method:'POST', headers:{'content-type':'application/json','x-api-key':cfg.kClaude,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'}, body:JSON.stringify(body)});
  const j=await r.json(); if(!r.ok) throw new Error(j.error?.message||('HTTP '+r.status)); return j; }
async function callClaude(prompt, useImg=true, maxTok=1600){
  const content=[]; if(useImg) S.images.forEach(im=>content.push({type:'image', source:{type:'base64', media_type:im.mime, data:im.b64}})); content.push({type:'text', text:prompt});
  const j=await claudeFetch({model:cfg.mClaude, max_tokens:maxTok, system:SYSTEM, messages:[{role:'user', content}]}); return (j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join(''); }
async function callGemini(prompt, useImg=true){
  const parts=[]; if(useImg) S.images.forEach(im=>parts.push({inline_data:{mime_type:im.mime, data:im.b64}})); parts.push({text:prompt});
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.mGemini)}:generateContent`, {method:'POST', headers:{'content-type':'application/json','x-goog-api-key':cfg.kGemini},
    body:JSON.stringify({systemInstruction:{parts:[{text:SYSTEM}]}, contents:[{role:'user', parts}], generationConfig:{temperature:0.2, responseMimeType:'application/json'}})});
  const j=await r.json(); if(!r.ok) throw new Error(j.error?.message||('HTTP '+r.status)); return (j.candidates?.[0]?.content?.parts||[]).filter(p=>p.text && !p.thought).map(p=>p.text).join(''); }
async function callDeepseek(prompt){
  const r=await fetch('https://api.deepseek.com/chat/completions', {method:'POST', headers:{'content-type':'application/json','authorization':'Bearer '+cfg.kDeepseek},
    body:JSON.stringify({model:cfg.mDeepseek, temperature:0.2, response_format:{type:'json_object'}, messages:[{role:'system',content:SYSTEM},{role:'user',content:prompt}]})});
  const j=await r.json(); if(!r.ok) throw new Error(j.error?.message||('HTTP '+r.status)); return j.choices?.[0]?.message?.content||''; }
const CALLS = {Claude:callClaude, Gemini:callGemini, DeepSeek:callDeepseek};
function parseJSON(t){ t=String(t||''); const e=t.lastIndexOf('}'); let s=t.indexOf('{'); if(s<0||e<s) throw new Error('No JSON in answer');
  while(s>=0 && s<e){ try{ return JSON.parse(t.slice(s,e+1)); }catch(_){ s=t.indexOf('{',s+1); } } throw new Error('Could not read the AI answer'); }
const ask = async (name, prompt, useImg) => parseJSON(await CALLS[name](prompt, useImg && name!=='DeepSeek'));

// ----- plans -----
const num = v => { const n=Number(v); return v==null||v===''||isNaN(n) ? null : n; };
function normalize(o){
  const p={bias:String(o.bias||'wait').toLowerCase(), confidence:num(o.confidence)||0, entry_low:num(o.entry_low), entry_high:num(o.entry_high), stop_loss:num(o.stop_loss), take_profit:num(o.take_profit), breakeven_at:num(o.breakeven_at),
    close_by:o.close_by||cfg.closeTime, entry_trigger:o.entry_trigger||'', invalidation:o.invalidation||'', reasoning:o.reasoning||'', support:o.support||[], resistance:o.resistance||[]};
  if(!['buy','sell','wait'].includes(p.bias)) p.bias='wait';
  if(p.entry_low!=null && p.entry_high!=null && p.entry_low>p.entry_high) [p.entry_low,p.entry_high]=[p.entry_high,p.entry_low];
  if(p.bias!=='wait'){ const mid=(p.entry_low+p.entry_high)/2, ok = p.bias==='buy' ? (p.stop_loss<p.entry_low && p.take_profit>p.entry_high) : (p.stop_loss>p.entry_high && p.take_profit<p.entry_low);
    if(!ok || [p.entry_low,p.entry_high,p.stop_loss,p.take_profit].some(v=>v==null)){ p.note='Levels were inconsistent, treated as wait'; p.bias='wait'; }
    else if(p.breakeven_at==null) p.breakeven_at = mid + (p.bias==='buy'?1:-1)*Math.abs(mid-p.stop_loss); }
  return p; }
const median = a => { const s=a.filter(v=>v!=null).sort((x,y)=>x-y); if(!s.length) return null; const m=Math.floor(s.length/2); return s.length%2? s[m] : (s[m-1]+s[m])/2; };
function addRisk(c){ if(!c.close_by || c.close_by > cfg.closeTime) c.close_by=cfg.closeTime;
  const mid=(c.entry_low+c.entry_high)/2; c.riskDist=Math.abs(mid-c.stop_loss); c.rewardDist=Math.abs(c.take_profit-mid);
  c.riskUsd=usd(c.riskDist); c.rewardUsd=usd(c.rewardDist); c.riskPct=c.riskUsd/cfg.balance*100; c.tooRisky=c.riskPct>cfg.riskPct+0.01; return c; }
function votesOf(list){ const v={buy:0,sell:0,wait:0}; list.filter(x=>x.plan).forEach(x=>v[x.plan.bias]++); return v; }
function consensus(list){ const ok=list.filter(x=>x.plan), v=votesOf(list); let bias='wait', why='';
  if(ok.length<2) why='Need at least 2 AI answers to agree.'; else if(v.buy>=2 && !v.sell) bias='buy'; else if(v.sell>=2 && !v.buy) bias='sell'; else why = v.buy&&v.sell ? 'The AIs disagree on direction.' : 'Not enough AIs see a clean setup.';
  const c={bias, votes:v, why};
  if(bias!=='wait'){ const g=ok.filter(x=>x.plan.bias===bias).map(x=>x.plan); ['entry_low','entry_high','stop_loss','take_profit','breakeven_at'].forEach(k=>c[k]=median(g.map(p=>p[k])));
    c.confidence=Math.round(g.reduce((s,p)=>s+p.confidence,0)/g.length); c.close_by=g.map(p=>p.close_by).sort()[0]; c.entry_trigger=g[0].entry_trigger; addRisk(c); }
  return c; }
function leaderPlan(o){ const p=normalize(o); const c={...p, votes:votesOf(Object.values(S.results)), leader:true, decision_notes:String(o.decision_notes||''), agreed_with:[].concat(o.agreed_with||[]), overruled:[].concat(o.overruled||[])};
  if(c.bias==='wait') c.why=c.decision_notes||c.reasoning||p.note||'No clean setup.'; else addRisk(c); return c; }

// ----- team analysis -----
const AI_HOOKS = {cards:()=>{}, say:()=>{}, final:()=>{}, status:()=>{}, pics:()=>{}};
async function runTeam(){
  if(!S.candles['15min'] && !S.images.length){ toast('Start live, refresh data or add a chart picture first.'); return; }
  S.results={}; const team=[['Claude',cfg.enClaude,cfg.kClaude],['Gemini',cfg.enGemini,cfg.kGemini],['DeepSeek',cfg.enDeepseek,cfg.kDeepseek]];
  team.forEach(([n,en,k])=>{ if(en) S.results[n] = k ? {loading:true} : {error:'No API key in Settings'}; });
  const active=team.filter(([n,en,k])=>en&&k).map(([n])=>n); AI_HOOKS.cards(); AI_HOOKS.final(null);
  if(!active.length){ toast('Add at least one AI key in Settings.'); return; }
  if(!S.brief) toast('Tip: get the news brief first so the team knows about economic events.');
  AI_HOOKS.status('Round 1: each AI analyzes on its own…', true);
  try{
    const prompt=buildPrompt();
    await Promise.allSettled(active.map(n=>ask(n,prompt,true).then(o=>{ S.results[n]={plan:normalize(o), noImage:n==='DeepSeek' && S.images.length>0}; const p=S.results[n].plan; AI_HOOKS.say(n,'Round 1',`${p.bias.toUpperCase()} (${p.confidence}%). ${p.reasoning}`); })
      .catch(e=>{ S.results[n]={error:errMsg(e)}; }).finally(()=>AI_HOOKS.cards())));
    if(cfg.mode!=='leader' || !S.results.Claude?.plan){ if(cfg.mode==='leader') toast('Claude is unavailable, so the team vote decides.'); AI_HOOKS.final(consensus(Object.values(S.results))); return; }
    let critiques=''; const experts=active.filter(n=>n!=='Claude' && S.results[n]?.plan);
    if(cfg.discuss && experts.length){ AI_HOOKS.status('Round 2: experts review the plans…', true); const lines=[];
      await Promise.allSettled(experts.map(n=>ask(n,critiquePrompt(n),false).then(o=>{ const t=`${String(o.stance||'').toUpperCase()}, prefers ${String(o.preferred_bias||'').toUpperCase()}. Concerns: ${o.concerns||'none'}. Changes: ${o.suggested_changes||'none'}`; lines.push(`${n}: ${t}`); AI_HOOKS.say(n,'Review',t); }).catch(e=>AI_HOOKS.say(n,'Review failed',errMsg(e)))));
      critiques=lines.join('\n'); }
    AI_HOOKS.status('Round 3: Claude makes the final decision…', true);
    try{ const c=leaderPlan(await ask('Claude',leaderPrompt(critiques),true)); AI_HOOKS.say('Claude','Final decision',`${c.bias.toUpperCase()}. ${c.decision_notes||c.reasoning}`); AI_HOOKS.final(c); }
    catch(e){ toast('Claude final decision failed: '+errMsg(e)); AI_HOOKS.final(consensus(Object.values(S.results))); }
  } finally { AI_HOOKS.status('Done at '+nowKH(), false); } }

// ----- picture analysis -----
async function runPictures(){
  if(!S.images.length){ toast('Add at least one chart picture first.'); return; }
  const who=[['Claude',cfg.enClaude&&cfg.kClaude],['Gemini',cfg.enGemini&&cfg.kGemini]].filter(x=>x[1]).map(x=>x[0]);
  if(!who.length){ toast('Picture analysis needs a Claude or Gemini key.'); return; }
  const res={}; who.forEach(n=>res[n]={loading:true}); AI_HOOKS.pics(res); AI_HOOKS.status('Reading your chart pictures…', true);
  const prompt=picPrompt();
  await Promise.allSettled(who.map(n=>(n==='Claude' ? callClaude(prompt,true,2200) : callGemini(prompt,true)).then(t=>{ const o=parseJSON(t); res[n]={raw:o, plan:normalize(o)}; }).catch(e=>{ res[n]={error:errMsg(e)}; }).finally(()=>AI_HOOKS.pics(res))));
  AI_HOOKS.status('Pictures read at '+nowKH(), false); }

// ----- news and economic brief -----
const BRIEF_SYSTEM = 'You are a macro and news analyst for a short-term gold (XAU/USD) trader. Use web search to find current facts. Never invent events or numbers. Your final answer is one JSON object only, no markdown.';
const BRIEF_SCHEMA = `{"gold_bias":"bullish|bearish|neutral","confidence":0-100,"usd":"short note","yields":"short note","risk_sentiment":"risk-on|risk-off|mixed","drivers":["up to 6 short points"],"events":[{"time_utc":"ISO 8601 UTC, e.g. 2026-10-23T12:30:00Z","currency":"USD","event":"name","impact":"high|medium","forecast":"","previous":"","actual":""}],"summary":"max 80 words"}`;
const briefPrompt = () => `Now: ${new Date().toISOString().slice(0,16)} UTC (Cambodia time ${nowKH()}).
Search the web and report:
1. Economic calendar: today's and the next 48 hours' high- and medium-impact events (US first, then Euro area, UK, Japan, China), with exact release times converted to UTC. Include actual results for events already released today.
2. The latest news moving gold: Fed and other central banks, US dollar, Treasury yields, inflation, geopolitics, central-bank gold buying, ETF flows.
3. Global risk mood: stocks, oil, bonds.
Then judge the fundamental bias for gold over the next few hours. Use only facts you found; leave a field empty when unsure.
Return exactly this JSON:
${BRIEF_SCHEMA}`;
async function claudeSearch(prompt){ const messages=[{role:'user', content:prompt}], sources=[];
  for(let k=0;k<4;k++){ const j=await claudeFetch({model:cfg.mClaude, max_tokens:4000, system:BRIEF_SYSTEM, tools:[{type:'web_search_20250305', name:'web_search', max_uses:6}], messages});
    (j.content||[]).forEach(c=>{ if(c.type==='text') (c.citations||[]).forEach(x=>x.url && sources.push({url:x.url, title:x.title||x.url})); });
    if(j.stop_reason==='pause_turn'){ messages.push({role:'assistant', content:j.content}); continue; }
    return {text:(j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join(''), sources}; }
  throw new Error('Search took too long, try again'); }
async function geminiSearch(prompt){
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.mGemini)}:generateContent`, {method:'POST', headers:{'content-type':'application/json','x-goog-api-key':cfg.kGemini},
    body:JSON.stringify({systemInstruction:{parts:[{text:BRIEF_SYSTEM}]}, contents:[{role:'user', parts:[{text:prompt}]}], tools:[{google_search:{}}], generationConfig:{temperature:0.2}})});
  const j=await r.json(); if(!r.ok) throw new Error(j.error?.message||('HTTP '+r.status)); const cand=j.candidates?.[0]||{};
  return {text:(cand.content?.parts||[]).filter(p=>p.text && !p.thought).map(p=>p.text).join(''), sources:(cand.groundingMetadata?.groundingChunks||[]).map(g=>g.web).filter(w=>w?.uri).map(w=>({url:w.uri, title:w.title||w.uri}))}; }
async function runBrief(){
  if(!cfg.aiSearch){ toast('Turn on AI web search in Settings.'); return null; }
  const useC=!!cfg.kClaude, useG=!!cfg.kGemini; if(!useC && !useG){ toast('Add a Claude or Gemini key in Settings.'); return null; }
  let res, by;
  if(useC){ try{ res=await claudeSearch(briefPrompt()); by='Claude'; }catch(e){ if(!useG) throw e; toast('Claude search failed ('+errMsg(e)+'). Trying Gemini.'); } }
  if(!res){ res=await geminiSearch(briefPrompt()); by='Gemini'; }
  const o=parseJSON(res.text), seen=new Set();
  S.brief={...o, events:Array.isArray(o.events)?o.events:[], drivers:Array.isArray(o.drivers)?o.drivers:[], at:Date.now(), by, sources:res.sources.filter(s=>!seen.has(s.url) && seen.add(s.url)).slice(0,8)};
  LS.set('goldAiDesk.brief', S.brief); return S.brief; }
