// Verify every f32 intermediate in the 11-bit-split multiply stays <= 2^24
// (the f32 exact-integer ceiling) under adversarial + random inputs, AND
// that the renorm cadence G=3 holds the column accumulators in budget.
import { writeFileSync } from 'fs';
import { P, NUM_LIMBS, NH, NCOL11, G11, toLimbs22, PLIMB } from './native22_host.mjs';
const W11=2048.0, W11_INV=Math.fround(1/2048.0);
const fr=x=>Math.fround(x);
let MAX=0, where='';
const track=(v,t)=>{const a=Math.abs(v);if(a>MAX){MAX=a;where=t;}return v;};
function mul(aL,bL){
  const hx=new Array(NH),hy=new Array(NH);
  for(let m=0;m<NUM_LIMBS;m++){const af=aL[m];const aH=fr(Math.floor(fr(af*W11_INV)));const aLo=fr(af-fr(aH*W11));hx[2*m]=aLo;hx[2*m+1]=aH;const bf=bL[m];const bH=fr(Math.floor(fr(bf*W11_INV)));const bLo=fr(bf-fr(bH*W11));hy[2*m]=bLo;hy[2*m+1]=bH;}
  const d=new Array(NCOL11+1).fill(0.0);let since=0;
  for(let i=0;i<NH;i++){for(let j=0;j<NH;j++){const k=i+j;d[k]=track(fr(d[k]+fr(hx[i]*hy[j])),'col.acc');}
    if(++since>=G11){for(let k=0;k<NCOL11;k++){const hv=fr(Math.floor(fr(d[k]*W11_INV)));d[k]=track(fr(d[k]-fr(hv*W11)),'renorm.d');d[k+1]=track(fr(d[k+1]+hv),'renorm.up');}since=0;}}
  for(let k=0;k<NCOL11;k++){const hv=fr(Math.floor(fr(d[k]*W11_INV)));d[k]=track(fr(d[k]-fr(hv*W11)),'fr.d');d[k+1]=track(fr(d[k+1]+hv),'fr.up');}
  return d;
}
// half-limb max is 2^11-1=2047, half-product max 2047*2047 < 2^22. Over G=3
// rows, a column gets at most 3 new half-products before renorm; plus
// pre-renorm base <2^11 after barrier... but BETWEEN renorms a column can
// receive contributions from multiple i (a column k is hit by pairs (i, k-i)).
// Worst case: stress with all half-limbs = 2047.
const allmax22 = new Array(12).fill(4194303); // each 22-bit limb max
mul(allmax22, allmax22);
mul(toLimbs22(P-1n), toLimbs22(P-1n));
let s=555n;const rnd=()=>{let a=0n;for(let i=0;i<9;i++){s=(s*6364136223846793005n+1442695040888963407n)&((1n<<64n)-1n);a=(a<<30n)^(s>>17n);}return((a%P)+P)%P;};
for(let i=0;i<300000;i++)mul(toLimbs22(rnd()),toLimbs22(rnd()));
const out=[];
out.push(`11-split multiply: MAX |f32 intermediate| = ${MAX} at ${where}`);
out.push(`2^24 = 16777216 ; headroom = ${16777216-MAX} ; as multiple of 2^22 = ${(MAX/4194304).toFixed(3)}`);
out.push(`SAFE (<= 2^24): ${MAX<=16777216}  (G=${G11} renorm cadence)`);
writeFileSync('/tmp/range_native.txt',out.join('\n')+'\n');
console.log(out[0]); console.log(out[2]);
