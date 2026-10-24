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
// New Console keys use "Authorization: Bearer"; older keys also accept "x-api-key". Try Bearer first, then fall back.
let CLAUDE_AUTH = LS.get('goldAiDesk.claudeAuth', 'bearer');
async function claudeFetch(body){
  const key=String(cfg.kClaude||'').trim();
  const send = mode => fetch('https://api.anthropic.com/v1/messages', {method:'POST', headers:{'content-type':'application/json', ...(mode==='bearer'?{'authorization':'Bearer '+key}:{'x-api-key':key}), 'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'}, body:JSON.stringify(body)});
  let r, j, mode=CLAUDE_AUTH;
  try{ r=await send(mode); j=await r.json(); }catch(e){ r=null; }
  if(!r || r.status===401){ const other = mode==='bearer'?'xkey':'bearer';
    try{ const r2=await send(other), j2=await r2.json(); if(r2.ok || r2.status!==401 || !r){ r=r2; j=j2; if(r2.ok){ CLAUDE_AUTH=other; LS.set('goldAiDesk.claudeAuth', other); } } }catch(e){ if(!r) throw e; } }
  if(!r.ok){ if(r.status===401) throw new Error('Claude did not accept the API key (401). Create a new key in Claude Console, copy it with the Copy button, and paste it into Settings → Claude.'); throw new Error(j?.error?.message||('HTTP '+r.status)); } return j; }
async function callClaude(prompt, useImg=true, maxTok=1600){
  const content=[]; if(useImg) S.images.forEach(im=>content.push({type:'image', source:{type:'base64', media_type:im.mime, data:im.b64}})); content.push({type:'text', text:prompt});
  const j=await claudeFetch({model:cfg.mClaude, max_tokens:maxTok, system:SYSTEM, messages:[{role:'user', content}]}); return (j.content||[]).filter(c=>c.type==='text').map(c=>c.text).join(''); }
async function callGemini(prompt, useImg=true){
  // Google sometimes answers "high demand" (503/429): wait and try again, up to 3 times
  for(let k=0;;k++){ try{ return await callGeminiOnce(prompt, useImg); }catch(e){ if(k>=2 || !e.busy) throw e; await new Promise(z=>setTimeout(z, 4000*(k+1))); } } }
async function callGeminiOnce(prompt, useImg=true){
  const parts=[]; if(useImg) S.images.forEach(im=>parts.push({inline_data:{mime_type:im.mime, data:im.b64}})); parts.push({text:prompt});
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.mGemini)}:generateContent`, {method:'POST', headers:{'content-type':'application/json','x-goog-api-key':cfg.kGemini},
    body:JSON.stringify({systemInstruction:{parts:[{text:SYSTEM}]}, contents:[{role:'user', parts}], generationConfig:{temperature:0.2, responseMimeType:'application/json'}})});
  const j=await r.json(); if(!r.ok){ const e=new Error(j.error?.message||('HTTP '+r.status)); e.busy=[429,500,503].includes(r.status) || /demand|overloaded|unavailable/i.test(e.message); throw e; } return (j.candidates?.[0]?.content?.parts||[]).filter(p=>p.text && !p.thought).map(p=>p.text).join(''); }
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
  const useC=!!(cfg.enClaude && cfg.kClaude), useG=!!(cfg.enGemini && cfg.kGemini); if(!useC && !useG){ toast('Turn on Claude or Gemini (with a key) in Settings.'); return null; }
  let res, by;
  if(useC){ try{ res=await claudeSearch(briefPrompt()); by='Claude'; }catch(e){ if(!useG) throw e; toast('Claude search failed ('+errMsg(e)+'). Trying Gemini.'); } }
  if(!res){ res=await geminiSearch(briefPrompt()); by='Gemini'; }
  const o=parseJSON(res.text), seen=new Set();
  S.brief={...o, events:Array.isArray(o.events)?o.events:[], drivers:Array.isArray(o.drivers)?o.drivers:[], at:Date.now(), by, sources:res.sources.filter(s=>!seen.has(s.url) && seen.add(s.url)).slice(0,8)};
  LS.set('goldAiDesk.brief', S.brief); return S.brief; }

// ----- AI team check of one chart point (Claude leads, Gemini and DeepSeek review) -----
S.aiChecks = LS.get('goldAiDesk.aiChecks', {}); S.aiSel = null;
const AIC_HOOKS = [];
const aicSave = () => { const e=Object.entries(S.aiChecks).filter(([,v])=>v.status==='done').sort((a,b)=>b[1].at-a[1].at).slice(0,40); LS.set('goldAiDesk.aiChecks', Object.fromEntries(e)); };
const aicUpdate = () => AIC_HOOKS.forEach(h=>h());
function aiTeam(){ return [['Claude',cfg.enClaude,cfg.kClaude],['Gemini',cfg.enGemini,cfg.kGemini],['DeepSeek',cfg.enDeepseek,cfg.kDeepseek]].filter(([,en,k])=>en&&k).map(([n])=>n); }
// data the AIs see: for past points only candles up to that moment (no peeking at the result)
function pointData(pt){
  if(pt.scope!=='past') return dataBlock();
  const upto = b => (b||[]).filter(x=>x.t<=pt.t), b15=upto(S.candles['15min']), b1=upto(S.candles['1h']);
  return `Market: XAU/USD, short-term trade. This is a PAST point; you only see data up to the entry candle (${khStamp(pt.t*1000)} Cambodia time).
Account: $${cfg.balance}, lot ${cfg.lot} (1.00 price move = $${(cfg.lot*100).toFixed(2)}). Max stop-loss distance ${maxDist().toFixed(2)}.
${tfLine('15 min',b15)}
${tfLine('1 hour',b1)}
Candles (Cambodia time, open,high,low,close):
[1h]
${csv(b1,48)}
[15min]
${csv(b15,64)}`; }
function pointText(pt){ const L=`entry ${f2(pt.entry)}, stop loss ${f2(pt.sl)}, take profit ${f2(pt.tp)}, move stop loss to entry at ${f2(pt.be)}`;
  return `POINT TO CHECK: ${pt.side.toUpperCase()} ${pt.label}. Levels (calculated by the app's code, treat as exact): ${L}. Close all trades by ${cfg.closeTime}.${pt.extra?' '+pt.extra:''}`; }
const CHECK_SCHEMA = `{"verdict":"confirm|adjust|reject","confidence":0-100,"levels_quoted":{"entry":number,"stop_loss":number,"take_profit":number},"suggested_stop_loss":number|null,"suggested_take_profit":number|null,"risks":"max 40 words","reasoning":"max 60 words"}`;
const r1Prompt = (pt,name) => `${pointData(pt)}\n\n${pointText(pt)}\n\nYou are ${name}, one analyst on a team led by Claude. Check this point on your own. Is the ${pt.side} direction supported by the trend, momentum, support and resistance${pt.scope==='past'?'':', other markets and news'}? Are the stop loss and take profit in sensible places (TP before the next strong level, SL beyond structure, SL distance <= ${maxDist().toFixed(2)})? "confirm" = good as is, "adjust" = good idea but change SL or TP (give prices), "reject" = do not take or hold it.\nCopy the entry, stop loss and take profit exactly into levels_quoted so the app can verify you read the data correctly.\nReturn exactly this JSON:\n${CHECK_SCHEMA}`;
const r2Prompt = (pt,name,views) => `${pointData(pt)}\n\n${pointText(pt)}\n\nRound 1 answers from the team:\n${views}\n\nYou are ${name}. Discuss: read the other answers, say where they are right or wrong, and whether you change your view. Be specific, use prices.\nReturn exactly this JSON:\n{"stance":"agree|partly|disagree","verdict":"confirm|adjust|reject","comment":"max 50 words"}`;
const r3Prompt = (pt,views,disc) => `${pointData(pt)}\n\n${pointText(pt)}${pt.outcome?`\nWhat happened afterwards (for the lesson only): ${pt.outcome}.`:''}\n\nRound 1 answers:\n${views}\n\nRound 2 discussion:\n${disc||'none'}\n\nYou are Claude, the team leader. Make the final decision for this point. Weigh evidence, not votes. If the evidence is mixed or any member found a real risk you cannot rule out, choose "reject" or "adjust". ${pt.scope==='past'?'This is a past point: judge whether it was a good decision with the data at that time, and give one lesson.':'Give the trader a clear action for now: hold, enter, wait, move SL, or close early.'}\nReturn exactly this JSON:\n{"verdict":"confirm|adjust|reject","confidence":0-100,"levels_quoted":{"entry":number,"stop_loss":number,"take_profit":number},"stop_loss":number|null,"take_profit":number|null,"action":"max 50 words","close_early_if":"max 30 words","lesson":"max 30 words or empty","decision_notes":"max 60 words","agreed_with":["names"],"overruled":["names"]}`;
const V = v => { v=String(v||'').toLowerCase(); return ['confirm','adjust','reject'].includes(v)?v:'reject'; };
function quoteOK(pt,q){ if(!q) return false; const tol=Math.max(0.5, Math.abs(pt.entry)*0.0002); return [['entry',pt.entry],['stop_loss',pt.sl],['take_profit',pt.tp]].every(([k,v])=>Math.abs(Number(q[k])-v)<=tol); }
function sideOK(pt,sl,tp){ const d=pt.side==='buy'?1:-1; return (sl==null || ((pt.entry-sl)*d>0 && Math.abs(pt.entry-sl)<=maxDist()+1e-9)) && (tp==null || (tp-pt.entry)*d>0); }
async function runPointCheck(pt){
  const team=aiTeam(); if(!team.length){ toast('Add at least one AI key in Settings for the AI team check.'); return; }
  const R={id:pt.id, pt, status:'loading', step:'Round 1: each AI checks on its own…', members:{}, at:Date.now()}; S.aiChecks[pt.id]=R; aicUpdate();
  try{
    await Promise.allSettled(team.map(n=>ask(n, r1Prompt(pt,n), false).then(o=>{ const a={verdict:V(o.verdict), confidence:num(o.confidence)||0, risks:String(o.risks||''), reasoning:String(o.reasoning||''), sl:num(o.suggested_stop_loss), tp:num(o.suggested_take_profit), dataOK:quoteOK(pt,o.levels_quoted)};
      if(!sideOK(pt,a.sl,a.tp)){ a.sl=null; a.tp=null; a.badLevels=true; } R.members[n]={r1:a}; }).catch(e=>{ R.members[n]={err:errMsg(e)}; }).finally(aicUpdate)));
    const ok=team.filter(n=>R.members[n]?.r1);
    if(!ok.length) throw new Error('No AI answered. Check your keys.');
    const views=ok.map(n=>{ const a=R.members[n].r1; return `${n}: ${a.verdict.toUpperCase()} (${a.confidence}%)${a.dataOK?'':' [quoted wrong levels]'}${a.sl||a.tp?`, suggests SL ${a.sl??'-'} TP ${a.tp??'-'}`:''}. Risks: ${a.risks}. Reason: ${a.reasoning}`; }).join('\n');
    let disc='';
    const reviewers=ok.filter(n=>n!=='Claude');
    if(cfg.discuss && ok.length>1 && reviewers.length){ R.step='Round 2: the team discusses…'; aicUpdate(); const lines=[];
      await Promise.allSettled(reviewers.map(n=>ask(n, r2Prompt(pt,n,views), false).then(o=>{ const d={stance:String(o.stance||''), verdict:V(o.verdict), comment:String(o.comment||'')}; R.members[n].r2=d; lines.push(`${n}: ${d.stance.toUpperCase()}, now ${d.verdict.toUpperCase()}. ${d.comment}`); }).catch(e=>{ R.members[n].r2err=errMsg(e); }).finally(aicUpdate)));
      disc=lines.join('\n'); }
    const latest=n=>R.members[n].r2?.verdict || R.members[n].r1.verdict;
    let F;
    if(team.includes('Claude')){ R.step='Round 3: Claude makes the final decision…'; aicUpdate();
      try{ const o=await ask('Claude', r3Prompt(pt,views,disc), false);
        F={by:'Claude', verdict:V(o.verdict), confidence:num(o.confidence)||0, sl:num(o.stop_loss), tp:num(o.take_profit), action:String(o.action||''), closeIf:String(o.close_early_if||''), lesson:String(o.lesson||''), notes:String(o.decision_notes||''), dataOK:quoteOK(pt,o.levels_quoted)};
        if(F.sl!=null && Math.abs(F.sl-pt.sl)<0.01) F.sl=null; if(F.tp!=null && Math.abs(F.tp-pt.tp)<0.01) F.tp=null;
        if(!sideOK(pt,F.sl,F.tp)){ F.sl=null; F.tp=null; F.badLevels=true; } }
      catch(e){ R.leaderErr=errMsg(e); } }
    if(!F){ const vs=ok.map(latest), all=vs.every(v=>v==='confirm'); F={by:'Team vote', verdict: all?'confirm': vs.includes('reject')?'reject':'adjust', confidence:Math.round(ok.reduce((s,n)=>s+R.members[n].r1.confidence,0)/ok.length), action: all?'All members agree.':'Members do not all agree, so be careful or wait.', notes:'', dataOK:true}; }
    // trust only answers that read the data correctly
    const valid=ok.filter(n=>R.members[n].r1.dataOK), bad=ok.filter(n=>!R.members[n].r1.dataOK).concat(F.dataOK?[]:['Claude (final)']);
    F.agree=valid.filter(n=>latest(n)===F.verdict).length; F.of=ok.length; F.bad=[...new Set(bad)];
    if(F.verdict==='confirm' && (F.agree<valid.length || bad.length)) F.mixed=true;
    R.final=F; R.status='done'; R.at=Date.now(); aicSave();
  }catch(e){ R.status='error'; R.error=errMsg(e); }
  finally{ aicUpdate(); } }
function aiMark(id){ const R=S.aiChecks[id]; if(!R) return ''; if(R.status==='loading') return '· AI…'; if(R.status==='error') return '· AI ✗ error'; const F=R.final;
  return F.verdict==='confirm' ? (F.mixed?`⚠ AI ${F.agree}/${F.of}`:`✓ AI ${F.agree}/${F.of}`) : F.verdict==='adjust' ? `~ AI adjust` : `✗ AI reject`; }
