// Find the true worst-case peak by adversarial search + theoretical bound.
import { writeFileSync } from 'fs';
import { P, NUM_LIMBS, toLimbs22, N0_F32, PLIMB } from './fp22_host.mjs';
const W_F32=4194304.0, W_INV_F32=Math.fround(1/4194304.0);
const fr=x=>Math.fround(x), fma=(a,b,c)=>Math.fround(a*b+c);
let MAX=0, where='', maxC=0, maxhi=0, maxc1=0;
const track=(v,t)=>{const a=Math.abs(v); if(a>MAX){MAX=a;where=t;} return v;};
function mulhilo22(a,b){const p=fr(a*b);const e=fr(fma(a,b,-p));let hi=fr(Math.floor(fr(p*W_INV_F32)));let lo=fr(fr(fma(hi,-W_F32,p))+e);const neg=lo<0?1:0;lo=fr(lo+fr(neg*W_F32));hi=fr(hi-neg);if(hi>maxhi)maxhi=hi;return [hi,lo];}
function carrysplit(v){const carry=fr(Math.floor(fr(v*W_INV_F32)));const digit=fr(fma(carry,-W_F32,v));if(carry>maxc1)maxc1=carry;return [carry,digit];}
function montmul(a,b,n0,pl){const N=NUM_LIMBS;const t=new Array(N+1).fill(0.0);
  for(let i=0;i<N;i++){const ai=a[i];let C=0.0;
    for(let j=0;j<N;j++){const [hi,lo]=mulhilo22(ai,b[j]);const s=track(fr(fr(t[j]+lo)+C),'A.s');const [c1,dig]=carrysplit(s);t[j]=dig;C=fr(hi+c1);if(C>maxC)maxC=C;}
    t[N]=track(fr(t[N]+C),'A.tN');const m=mulhilo22(t[0],n0)[1];let C2=0.0;
    for(let j=0;j<N;j++){const [hi,lo]=mulhilo22(m,pl[j]);const s=track(fr(fr(t[j]+lo)+C2),'C.s');const [c1,dig]=carrysplit(s);t[j]=dig;C2=fr(hi+c1);if(C2>maxC)maxC=C2;}
    t[N]=track(fr(t[N]+C2),'C.tN');for(let j=0;j<N;j++)t[j]=t[j+1];t[N]=0.0;}
  return t;}
const pl=PLIMB.map(Number),n0=N0_F32;
// adversarial: max residue both operands
montmul(toLimbs22(P-1n).map(Number),toLimbs22(P-1n).map(Number),n0,pl);
// all-2^22-1 limbs (not a valid residue but stresses arithmetic upper bound)
const allmax=new Array(12).fill(4194303);
montmul(allmax,allmax,n0,pl);
// random residues
let s=555n;const rnd=()=>{let a=0n;for(let i=0;i<9;i++){s=(s*6364136223846793005n+1442695040888963407n)&((1n<<64n)-1n);a=(a<<30n)^(s>>17n);}return((a%P)+P)%P;};
for(let i=0;i<300000;i++)montmul(toLimbs22(rnd()).map(Number),toLimbs22(rnd()).map(Number),n0,pl);
const out=[];
out.push(`MAX |intermediate| = ${MAX} at ${where}`);
out.push(`max carry C = ${maxC}, max hi = ${maxhi}, max carrysplit carry = ${maxc1}`);
out.push(`2^24 = 16777216 ; first non-representable odd int = 2^24+1 = 16777217`);
out.push(`MAX <= 2^24 ? ${MAX <= 16777216}`);
out.push(`theoretical A.s bound: t[j]<2^22 + lo<2^22 + C(<=hi_max + c1_max=${maxhi}+${maxc1}) => <= ${4194303+4194303+maxhi+maxc1}`);
writeFileSync('/tmp/fp22_worst.txt',out.join('\n')+'\n');
console.log('WROTE');
