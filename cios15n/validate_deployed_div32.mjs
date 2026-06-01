#!/usr/bin/env node
// AUTHORITATIVE host correctness proof for the DEPLOYED cios15native body.
//
// The deployed generator (cios_limb_gen.ts) renders B=15 as REGIME-DEFER K=2
// (verified: genCiosLimbBody(15) -> regime DEFER, K=2), NOT COLCARRY. This
// simulator mirrors the EXACT DEFER dataflow (genDefer) + the div32 correction
// (emitDomainCorrection div32 branch) + condSubP + repack 17x15->20x13, at u32
// granularity, using the p-limbs/n0 imported from the DEPLOYED generator.
//
// Proves directly: deployed(x,y) == x*y*2^-260 mod p (the pipeline domain),
// over edges + N random pairs. 0 fails required.
import { ciosParams, genCiosLimbBody } from '/Users/zac/localclaudebox/wt-cios15n/barretenberg/ts/src/msm_webgpu/cuzk/cios_limb_gen.ts';

const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const B = 15, N = 17, Bb = 15n;
const MASK = (1n << Bb) - 1n;
const U32 = (1n << 32n) - 1n;
const wrap = (x) => x & U32;

const gen = genCiosLimbBody(B, 'div32');
if (gen.regime !== 'DEFER' || gen.K !== 2) { console.log(`FATAL regime=${gen.regime} K=${gen.K} (expected DEFER K=2)`); process.exit(1); }
const pp = ciosParams(B);
const p = pp.p, n0 = pp.n0, K = gen.K;

const R_PIPE = (1n << 260n) % P;
const RINV_PIPE = (() => { let [a,m]=[R_PIPE,P],[x0,x1]=[0n,1n]; while(a>1n){const q=a/m;[a,m]=[m,a-q*m];[x0,x1]=[x1-q*x0,x0];} return ((x1%P)+P)%P; })();
const R2_PIPE = (R_PIPE * R_PIPE) % P;

function toLimbs13(x){const l=[];for(let i=0;i<20;i++){l.push(x&8191n);x>>=13n;}return l;}
function repack(src,sw,dw,dn){let v=0n;for(let i=src.length-1;i>=0;i--)v=(v<<BigInt(sw))+BigInt(src[i]);const o=[],m=(1n<<BigInt(dw))-1n;for(let k=0;k<dn;k++){o.push(v&m);v>>=BigInt(dw);}return o;}

// ── REGIME-DEFER core (mirrors genDefer exactly) ──
function ciosCoreDefer(x13, y13) {
  const x = repack(x13,13,B,N), y = repack(y13,13,B,N);
  const s = new Array(N).fill(0n);
  for (let i = 0; i < N; i++) {
    const t  = wrap(s[0] + x[i]*y[0]);
    const qi = wrap((n0 * (t & MASK)) & MASK);
    const c  = wrap(t + qi*p[0]) >> Bb;
    s[0] = wrap(s[1] + x[i]*y[1] + qi*p[1] + c);
    for (let j = 2; j < N-1; j++) s[j-1] = wrap(s[j] + x[i]*y[j] + qi*p[j]);
    s[N-2] = wrap(s[N-1] + x[i]*y[N-1] + qi*p[N-1]);
    s[N-1] = 0n;
    if ((i+1)%K===0 && i+1<N) { // periodic carry normalize
      let cn=0n; for(let k=0;k<N-1;k++){const v=wrap(s[k]+cn);cn=v>>Bb;s[k]=v&MASK;} s[N-1]=cn;
    }
  }
  let cc=0n; for(let k=0;k<N;k++){const v=wrap(s[k]+cc);cc=v>>Bb;s[k]=v&MASK;} // final normalize
  return s;
}
const TWO_B = 1n << Bb;
function condSubP(s){let brw=0n;const r=new Array(N);for(let k=0;k<N;k++){const d=wrap((s[k]|TWO_B)-p[k]-brw);r[k]=d&MASK;brw=1n-(d>>Bb);}const ge=1n-brw,msk=wrap(0n-ge);for(let k=0;k<N;k++)s[k]=(r[k]&msk)|(s[k]&wrap(~msk));}
const NEGPINV5=(()=>{const Rk=32n;const p0=P&(Rk-1n);let inv=1n;for(let i=0;i<5;i++)inv=(inv*(2n-p0*inv))&(Rk-1n);return(Rk-inv)&(Rk-1n);})();
function corrDiv32(s){const k5=wrap((s[0]*NEGPINV5)&31n);let c5=0n;const lo=new Array(N);for(let k=0;k<N;k++){const q=wrap(s[k]+k5*p[k]+c5);lo[k]=q&MASK;c5=q>>Bb;}const qn=c5;for(let k=0;k<N;k++){const hi=(k===N-1)?qn:lo[k+1];s[k]=(lo[k]>>5n)|((hi<<(Bb-5n))&MASK);}}
function repackTo13(s17){const l13=repack(s17.map(BigInt),15,13,20);let x=0n;for(let i=19;i>=0;i--)x=(x<<13n)+l13[i];return x;}

function deployed(a,b){const s=ciosCoreDefer(toLimbs13(a),toLimbs13(b));condSubP(s);corrDiv32(s);condSubP(s);return repackTo13(s);}

if (NEGPINV5 !== 9n) { console.log('FATAL negpinv5='+NEGPINV5); process.exit(1); }
const TRIALS = parseInt(process.argv[2] || '120000', 10);
function rnd(){let x=0n;for(let i=0;i<8;i++)x=(x<<32n)|BigInt((Math.random()*2**32)>>>0);return x%P;}
const edges=[[0n,0n],[P-1n,P-1n],[1n,1n],[P-1n,1n],[1n,P-1n],[R_PIPE,R_PIPE],[1n,R_PIPE],[R2_PIPE,1n],[R2_PIPE,R2_PIPE],[0n,P-1n],[2n,(P-1n)/2n],[1n<<130n,1n<<130n],[R_PIPE,P-1n],[P-2n,P-2n]];

let fail=0, first=null, nz=0, run=0;
const check=(a,b)=>{run++;const got=deployed(a,b);const want=(a*b%P)*RINV_PIPE%P;if(got!==want){fail++;if(!first)first={a:a.toString(),b:b.toString(),got:got.toString(),want:want.toString()};}if(got!==0n)nz++;};
for(const[a,b]of edges)check(a,b);
const CHUNK=20000;let done=0;
while(done<TRIALS){const end=Math.min(done+CHUNK,TRIALS);for(let t=done;t<end;t++)check(rnd(),rnd());done=end;console.log(`progress ${done}/${TRIALS} fails=${fail}`);}
console.log('regime='+gen.regime+' K='+gen.K+' NEGPINV5='+NEGPINV5);
console.log('checked='+run+' (incl '+edges.length+' edges) nonzero_results='+nz);
console.log('FAIL_direct_deployedDEFER_div32_vs_2^260='+fail);
if(first)console.log('FIRST_FAIL a='+first.a+' b='+first.b+' got='+first.got+' want='+first.want);
const ok = fail===0 && nz>0;
console.log('DEPLOYED_VERDICT='+(ok?'PASS':'FAIL'));
process.exit(ok?0:1);
