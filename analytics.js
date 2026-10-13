const TARGET_PROFIT_USD = 500;
const slope = s => { if (s.length < 2) return 0; const n = s.length, mx = (n-1)/2,
  my = s.reduce((a,b)=>a+b,0)/n; let num=0, den=0;
  for (let i=0;i<n;i++){ num += (i-mx)*(s[i]-my); den += (i-mx)**2; } return num/(den||1); };
const peak = (s,d=0.6) => { if (s.length<3) return s.at(-1)||0; const b = s.length>=5?s.at(-5):s[0];
  return s.at(-1)*(1+((s.at(-1)-b)/(b||1))*d); };
const health = s => { if (s.length<3) return "flat"; const v = slope(s.slice(-5));
  return v>0.001?"up":v<-0.001?"down":"flat"; };
const streak = s => { let n=0; for (let i=s.length-1;i>1;i--){ if (s[i]<s[i-1]) n++; else break; } return n; };
function decide(samples, entry, current) {
  const profit = current - entry, h = health(samples);
  const head = (peak(samples) - current) / (current || 1);
  if (h==="down" && streak(samples)>=3 && head<0.05) return [true, "chart dying, no recovery"];
  if (profit>=TARGET_PROFIT_USD && h==="up" && head>0.15) return [false, `up $${profit.toFixed(0)}, still climbing`];
  if (profit>=TARGET_PROFIT_USD && head<=0.15) return [true, `near peak at $${profit.toFixed(0)}`];
  if (profit>=TARGET_PROFIT_USD && h!=="up") return [true, `momentum faded at $${profit.toFixed(0)}`];
  return [false, `holding ($${profit.toFixed(0)}, ${h})`];
}
module.exports = { decide };
