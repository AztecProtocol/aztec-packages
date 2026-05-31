// Exact-integer CIOS with the SAME control structure as the f32 model,
// to isolate algorithm bugs from float bugs. Uses BigInt limbs.
import { writeFileSync } from 'fs';
const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const NUM_LIMBS = 12;
const WB = 22n;
const W = 1n << WB;
const R = 1n << (BigInt(NUM_LIMBS) * WB);
function modinv(a,m){let[or,r]=[((a%m)+m)%m,m];let[os,s]=[1n,0n];while(r){const q=or/r;[or,r]=[r,or-q*r];[os,s]=[s,os-q*s];}return((os%m)+m)%m;}
const N0 = ((1n<<WB) - modinv(P, 1n<<WB)) % (1n<<WB);
function toLimbs(v){const o=[];let x=((v%P)+P)%P;for(let i=0;i<NUM_LIMBS;i++){o.push(x&(W-1n));x>>=WB;}return o;}
function fromLimbs(l){let v=0n;for(let i=NUM_LIMBS-1;i>=0;i--)v=(v<<WB)|l[i];return v;}

function mulhilo(a,b){const p=a*b;return [p>>WB, p&(W-1n)];}

function montmul(a,b){
  const N=NUM_LIMBS;
  const t=new Array(N+1).fill(0n);
  for(let i=0;i<N;i++){
    const ai=a[i];
    let C=0n;
    for(let j=0;j<N;j++){
      const [hi,lo]=mulhilo(ai,b[j]);
      const s=t[j]+lo+C;
      t[j]=s&(W-1n);
      C=hi+(s>>WB);
    }
    t[N]=t[N]+C;
    const m=(t[0]*N0)&(W-1n);
    let C2=0n;
    for(let j=0;j<N;j++){
      const [hi,lo]=mulhilo(m,P_LIMB[j]);
      const s=t[j]+lo+C2;
      t[j]=s&(W-1n);
      C2=hi+(s>>WB);
    }
    t[N]=t[N]+C2;
    // shift down
    for(let j=0;j<N;j++) t[j]=t[j+1];
    t[N]=0n;
  }
  // t may be >= p; conditional subtract
  let v=fromLimbs(t.slice(0,N));
  if(v>=P) v-=P;
  return v;
}
const P_LIMB=toLimbs(P);
function montIn(a){return (a*(R%P))%P;}
function montref(am,bm){return (am*bm*modinv(R,P))%P;}

const out=[];
function run(label,am,bm){
  const got=montmul(toLimbs(am),toLimbs(bm));
  const want=montref(am,bm);
  out.push(`${label}: match=${got===want}`);
  if(got!==want) out.push(`   got=${got} want=${want} t[N]issue?`);
}
run('0x0',montIn(0n),montIn(0n));
run('1x1',montIn(1n),montIn(1n));
run('2x3',montIn(2n),montIn(3n));
run('Pm1xPm1',montIn(P-1n),montIn(P-1n));
// random
let s=99n; function rnd(){let a=0n;for(let i=0;i<9;i++){s=(s*6364136223846793005n+1n)&((1n<<64n)-1n);a=(a<<30n)^(s>>17n);}return((a%P)+P)%P;}
let fails=0;
for(let i=0;i<5000;i++){const am=rnd(),bm=rnd();if(montmul(toLimbs(am),toLimbs(bm))!==montref(am,bm))fails++;}
out.push(`random 5000: fails=${fails}`);
writeFileSync('/tmp/fp22_dbgint.txt',out.join('\n')+'\n');
console.log('WROTE');
