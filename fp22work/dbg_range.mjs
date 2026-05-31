// Track the maximum magnitude of every f32 intermediate in the montmul,
// to prove all values stay < 2^24 (f32 exact-integer ceiling). If any
// exceeds 2^24, the WGSL would round and diverge from the host model.
import { writeFileSync } from 'fs';
import { P, R, NUM_LIMBS, toLimbs22, N0_F32, PLIMB } from './fp22_host.mjs';

const W_F32 = 4194304.0;
const W_INV_F32 = Math.fround(1.0 / 4194304.0);
function fr(x){return Math.fround(x);}
function fma(a,b,c){return Math.fround(a*b+c);}

let MAXabs = 0; let where='';
function track(v,tag){ const a=Math.abs(v); if(a>MAXabs){MAXabs=a; where=tag;} return v; }

function mulhilo22(a,b){
  const p=track(fr(a*b),'mh.p');
  const e=track(fr(fma(a,b,-p)),'mh.e');
  let hi=fr(Math.floor(fr(p*W_INV_F32)));
  let lo=track(fr(fr(fma(hi,-W_F32,p))+e),'mh.lo.raw');
  const neg=lo<0.0?1.0:0.0;
  lo=track(fr(lo+fr(neg*W_F32)),'mh.lo');
  hi=track(fr(hi-neg),'mh.hi');
  return [hi,lo];
}
function carrysplit(v){
  const carry=track(fr(Math.floor(fr(v*W_INV_F32))),'cs.carry');
  const digit=track(fr(fma(carry,-W_F32,v)),'cs.digit');
  return [carry,digit];
}
function montmul(a,b,n0,pl){
  const N=NUM_LIMBS; const t=new Array(N+1).fill(0.0);
  for(let i=0;i<N;i++){
    const ai=a[i]; let C=0.0;
    for(let j=0;j<N;j++){
      const [hi,lo]=mulhilo22(ai,b[j]);
      const s=track(fr(fr(t[j]+lo)+C),'A.s');
      const [c1,dig]=carrysplit(s); t[j]=dig; C=track(fr(hi+c1),'A.C');
    }
    t[N]=track(fr(t[N]+C),'A.tN');
    const m=mulhilo22(t[0],n0)[1];
    let C2=0.0;
    for(let j=0;j<N;j++){
      const [hi,lo]=mulhilo22(m,pl[j]);
      const s=track(fr(fr(t[j]+lo)+C2),'C.s');
      const [c1,dig]=carrysplit(s); t[j]=dig; C2=track(fr(hi+c1),'C.C');
    }
    t[N]=track(fr(t[N]+C2),'C.tN');
    for(let j=0;j<N;j++) t[j]=t[j+1]; t[N]=0.0;
  }
  return t;
}

let s=123n;
function rnd(){let a=0n;for(let i=0;i<9;i++){s=(s*6364136223846793005n+1442695040888963407n)&((1n<<64n)-1n);a=(a<<30n)^(s>>17n);}return((a%P)+P)%P;}
const pl=PLIMB.map(Number); const n0=N0_F32;
// include worst case: all-limbs-max operands
function maxres(){ return P-1n; }
montmul(toLimbs22(P-1n).map(Number), toLimbs22(P-1n).map(Number), n0, pl);
for(let i=0;i<50000;i++){ montmul(toLimbs22(rnd()).map(Number), toLimbs22(rnd()).map(Number), n0, pl); }

const out=[];
out.push(`MAX |f32 intermediate| = ${MAXabs}  at ${where}`);
out.push(`2^24 = ${1<<24} ; 2^23 = ${1<<23}`);
out.push(`headroom below 2^24: ${(1<<24) - MAXabs}`);
out.push(`SAFE (< 2^24): ${MAXabs < (1<<24)}`);
writeFileSync('/tmp/fp22_range.txt', out.join('\n')+'\n');
console.log('WROTE');
