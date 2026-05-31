import { writeFileSync } from 'fs';
import { P, NUM_LIMBS, toLimbs22, N0_F32, PLIMB } from './fp22_host2.mjs';
const W_F32=4194304.0, W_INV_F32=Math.fround(1/4194304.0);
const fr=x=>Math.fround(x), fma=(a,b,c)=>Math.fround(a*b+c);
let MAX=0, where='';
const track=(v,t)=>{const a=Math.abs(v); if(a>MAX){MAX=a;where=t;} return v;};
function mulhilo22(a,b){const p=fr(a*b);const e=fr(fma(a,b,-p));let hi=fr(Math.floor(fr(p*W_INV_F32)));let lo=fr(fr(fma(hi,-W_F32,p))+e);const neg=lo<0?1:0;lo=fr(lo+fr(neg*W_F32));hi=fr(hi-neg);return [hi,lo];}
function norm(v){const c=fr(Math.floor(fr(v*W_INV_F32)));const d=fr(fma(c,-W_F32,v));return [c,d];}
function montmul(a,b,n0,pl){const N=NUM_LIMBS;const col=new Array(N+1).fill(0.0);
  for(let i=0;i<N;i++){const ai=a[i];
    for(let j=0;j<N;j++){const [hi,lo]=mulhilo22(ai,b[j]);let s=track(fr(col[j]+lo),'A.add');let nr=norm(s);col[j]=nr[1];col[j+1]=track(fr(col[j+1]+fr(nr[0]+hi)),'A.up');}
    let tA;{const nr=norm(col[N]);col[N]=nr[1];tA=nr[0];}
    const m=mulhilo22(col[0],n0)[1];
    for(let j=0;j<N;j++){const [hi,lo]=mulhilo22(m,pl[j]);let s=track(fr(col[j]+lo),'C.add');let nr=norm(s);col[j]=nr[1];col[j+1]=track(fr(col[j+1]+fr(nr[0]+hi)),'C.up');}
    let tC;{const nr=norm(col[N]);col[N]=nr[1];tC=nr[0];}
    for(let j=0;j<N;j++)col[j]=col[j+1];col[N]=fr(tA+tC);}
  return col;}
const pl=PLIMB.map(Number),n0=N0_F32;
montmul(toLimbs22(P-1n).map(Number),toLimbs22(P-1n).map(Number),n0,pl);
const allmax=new Array(12).fill(4194303); montmul(allmax,allmax,n0,pl);
let s=555n;const rnd=()=>{let a=0n;for(let i=0;i<9;i++){s=(s*6364136223846793005n+1442695040888963407n)&((1n<<64n)-1n);a=(a<<30n)^(s>>17n);}return((a%P)+P)%P;};
for(let i=0;i<300000;i++)montmul(toLimbs22(rnd()).map(Number),toLimbs22(rnd()).map(Number),n0,pl);
const out=[];
out.push(`v2 MAX |intermediate| = ${MAX} at ${where}`);
out.push(`2^24=16777216  headroom=${16777216-MAX}  factor of 2^22 = ${(MAX/4194304).toFixed(3)}`);
out.push(`SAFE (<=2^24): ${MAX<=16777216}`);
writeFileSync('/tmp/fp22_range2.txt',out.join('\n')+'\n');
console.log('WROTE',out[0],'|',out[1]);
