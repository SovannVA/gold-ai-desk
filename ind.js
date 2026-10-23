// ===== Indicators (pure functions on candle arrays {t,o,h,l,c}, oldest first) =====
function sma(a, n){ const o=Array(a.length).fill(null);
  for(let i=n-1;i<a.length;i++){ let s=0, ok=true; for(let j=i-n+1;j<=i;j++){ if(a[j]==null){ ok=false; break; } s+=a[j]; } if(ok) o[i]=s/n; } return o; }
function ema(a, n){ const k=2/(n+1), o=[]; let prev=null;
  for(let i=0;i<a.length;i++){ const v=a[i]; if(v==null){ o.push(prev); continue; } prev = prev==null ? v : v*k + prev*(1-k); o.push(prev); } return o; }
function rsi(c, n=14){ const o=Array(c.length).fill(null); if(c.length<=n) return o; let g=0, l=0;
  for(let i=1;i<=n;i++){ const d=c[i]-c[i-1]; if(d>0) g+=d; else l-=d; } g/=n; l/=n; o[n]= l===0?100:100-100/(1+g/l);
  for(let i=n+1;i<c.length;i++){ const d=c[i]-c[i-1]; g=(g*(n-1)+Math.max(d,0))/n; l=(l*(n-1)+Math.max(-d,0))/n; o[i]= l===0?100:100-100/(1+g/l); } return o; }
function trueRange(b){ return b.map((x,i)=> i ? Math.max(x.h-x.l, Math.abs(x.h-b[i-1].c), Math.abs(x.l-b[i-1].c)) : x.h-x.l); }
function atr(b, n=14){ const tr=trueRange(b), o=Array(b.length).fill(null); if(b.length<n) return o;
  let a=tr.slice(0,n).reduce((s,v)=>s+v,0)/n; o[n-1]=a; for(let i=n;i<b.length;i++){ a=(a*(n-1)+tr[i])/n; o[i]=a; } return o; }
function macd(c, f=12, s=26, sig=9){ const ef=ema(c,f), es=ema(c,s), line=c.map((_,i)=> i>=s-1 ? ef[i]-es[i] : null);
  const signal=ema(line, sig).map((v,i)=> i>=s+sig-2 ? v : null); return {line, signal, hist: line.map((v,i)=> v!=null && signal[i]!=null ? v-signal[i] : null)}; }
function bollinger(c, n=20, k=2){ const mid=sma(c,n), up=[], lo=[];
  for(let i=0;i<c.length;i++){ if(mid[i]==null){ up.push(null); lo.push(null); continue; } let v=0; for(let j=i-n+1;j<=i;j++) v+=(c[j]-mid[i])**2; const sd=Math.sqrt(v/n); up.push(mid[i]+k*sd); lo.push(mid[i]-k*sd); }
  return {mid, up, lo}; }
function stoch(b, n=14, sk=3, sd=3){ const raw=b.map((x,i)=>{ if(i<n-1) return null; let hh=-Infinity, ll=Infinity; for(let j=i-n+1;j<=i;j++){ hh=Math.max(hh,b[j].h); ll=Math.min(ll,b[j].l); } return hh===ll?50:(x.c-ll)/(hh-ll)*100; });
  const k=sma(raw, sk), d=sma(k, sd); return {k, d}; }
function adx(b, n=14){ const len=b.length, out=Array(len).fill(null), pdi=Array(len).fill(null), ndi=Array(len).fill(null); if(len<2*n+2) return {adx:out, pdi, ndi};
  const TR=[], P=[], N=[];
  for(let i=1;i<len;i++){ const up=b[i].h-b[i-1].h, dn=b[i-1].l-b[i].l; P.push(up>dn&&up>0?up:0); N.push(dn>up&&dn>0?dn:0); TR.push(Math.max(b[i].h-b[i].l, Math.abs(b[i].h-b[i-1].c), Math.abs(b[i].l-b[i-1].c))); }
  let sT=0, sP=0, sN=0; for(let j=0;j<n;j++){ sT+=TR[j]; sP+=P[j]; sN+=N[j]; }
  const dx=[];
  for(let j=n-1;j<TR.length;j++){ if(j>n-1){ sT=sT-sT/n+TR[j]; sP=sP-sP/n+P[j]; sN=sN-sN/n+N[j]; }
    const bi=j+1, p=sT?100*sP/sT:0, m=sT?100*sN/sT:0; pdi[bi]=p; ndi[bi]=m; dx.push({bi, d: (p+m)? Math.abs(p-m)/(p+m)*100 : 0}); }
  if(dx.length<n) return {adx:out, pdi, ndi};
  let a=dx.slice(0,n).reduce((s,x)=>s+x.d,0)/n; out[dx[n-1].bi]=a;
  for(let k=n;k<dx.length;k++){ a=(a*(n-1)+dx[k].d)/n; out[dx[k].bi]=a; }
  return {adx:out, pdi, ndi}; }
function aggregate(b, sec){ const out=[]; for(const x of b){ const t=Math.floor(x.t/sec)*sec, last=out.at(-1);
  if(last && last.t===t){ last.h=Math.max(last.h,x.h); last.l=Math.min(last.l,x.l); last.c=x.c; } else out.push({t, o:x.o, h:x.h, l:x.l, c:x.c}); } return out; }
function pivots(prev){ if(!prev) return null; const {h,l,c}=prev, p=(h+l+c)/3;
  return {P:p, R1:2*p-l, S1:2*p-h, R2:p+(h-l), S2:p-(h-l), R3:h+2*(p-l), S3:l-2*(h-p)}; }
function swings(b, k=3){ const hi=[], lo=[]; for(let i=k;i<b.length-k;i++){ let isH=true, isL=true;
  for(let j=i-k;j<=i+k;j++){ if(j===i) continue; if(b[j].h>=b[i].h) isH=false; if(b[j].l<=b[i].l) isL=false; }
  if(isH) hi.push({i, t:b[i].t, p:b[i].h}); if(isL) lo.push({i, t:b[i].t, p:b[i].l}); } return {hi, lo}; }
function srLevels(b, price, tol){ if(!b || b.length<20 || !price) return {above:[], below:[]};
  const s=swings(b,3), pts=[...s.hi.map(x=>({...x,kind:'R'})), ...s.lo.map(x=>({...x,kind:'S'}))].sort((a,c)=>a.p-c.p), cl=[];
  for(const p of pts){ const last=cl.at(-1); if(last && p.p-last.max<=tol){ last.pts.push(p); last.max=p.p; } else cl.push({pts:[p], max:p.p}); }
  const lv=cl.map(c=>({p:c.pts.reduce((s,x)=>s+x.p,0)/c.pts.length, touches:c.pts.length, last:Math.max(...c.pts.map(x=>x.t))}));
  return {above: lv.filter(x=>x.p>price).sort((a,c)=>a.p-c.p).slice(0,3), below: lv.filter(x=>x.p<price).sort((a,c)=>c.p-a.p).slice(0,3)}; }
function fibLevels(b, look=100){ if(!b || b.length<20) return null; const w=b.slice(-look); let hi=0, lo=0;
  w.forEach((x,i)=>{ if(x.h>w[hi].h) hi=i; if(x.l<w[lo].l) lo=i; }); const H=w[hi].h, L=w[lo].l, up=hi>lo;
  return {dir: up?'up':'down', hi:H, lo:L, hiT:w[hi].t, loT:w[lo].t, levels:[0.236,0.382,0.5,0.618,0.786].map(r=>({r, p: up ? H-(H-L)*r : L+(H-L)*r}))}; }
function tfSummary(b){ if(!b || b.length<30) return null; const c=b.map(x=>x.c), i=b.length-1;
  const e20=ema(c,20)[i], e50=ema(c,50)[i], e200=b.length>=200?ema(c,200)[i]:null, r=rsi(c)[i], m=macd(c), mh=m.hist[i], mhp=m.hist[i-1], a=atr(b)[i], ad=adx(b), x=c[i];
  const trend = (x>e50 && e20>e50) ? 'up' : (x<e50 && e20<e50) ? 'down' : 'range';
  let score = trend==='up'?1:trend==='down'?-1:0; if(mh!=null) score += mh>0?0.5:-0.5; if(r!=null) score += r>55?0.5:r<45?-0.5:0;
  return {close:x, e20, e50, e200, rsi:r, macdHist:mh, macdRising: mh!=null&&mhp!=null ? mh>mhp : null, atr:a, adx:ad.adx[i], pdi:ad.pdi[i], ndi:ad.ndi[i], trend, score}; }
if(typeof module!=='undefined') module.exports={sma,ema,rsi,atr,macd,bollinger,stoch,adx,aggregate,pivots,swings,srLevels,fibLevels,tfSummary,trueRange};
