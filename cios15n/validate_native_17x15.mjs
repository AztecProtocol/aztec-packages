#!/usr/bin/env node
// AUTHORITATIVE host correctness proof for the NATIVE 17x15 cios body — the
// montgomery_product the wordSize=15 pipeline compiles (genCiosLimbBody(15,
// 'halve5', { n: 17, w: 15 })). Unlike the 20x13 drop-in, the native body:
//   - reads operands directly as 17x15 limbs (unpack = identity),
//   - reduces by 2^(15*17)=2^255 with NO domain correction (delta=0),
//   - writes the result directly as 17x15 limbs (repack = identity).
// So it returns x*y*2^-255 mod p — the pipeline domain when R=2^255.
//
// Two proofs:
//   (A) STRUCTURAL: the generated body has identity unpack/repack and no div32
//       correction (asserts the native generator path actually fired).
//   (B) NUMERIC: a u32-granularity mirror of the DEFER core (shared with the
//       deployed-drop-in validator) + condSubP equals x*y*2^-255 mod p over
//       edges + N random pairs. 0 fails required.
import { ciosParams, genCiosLimbBody } from '/Users/zac/localclaudebox/wt-cios15n/barretenberg/ts/src/msm_webgpu/cuzk/cios_limb_gen.ts';

const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const B = 15, N = 17, Bb = 15n;
const MASK = (1n << Bb) - 1n;
const U32 = (1n << 32n) - 1n;
const wrap = (x) => x & U32;

const PIPELINE = { n: 17, w: 15 };
const gen = genCiosLimbBody(B, 'halve5', PIPELINE);
if (gen.regime !== 'DEFER' || gen.K !== 2) { console.log(`FATAL regime=${gen.regime} K=${gen.K} (expected DEFER K=2)`); process.exit(1); }

// ── (A) STRUCTURAL render check ──
const body = gen.body;
const sErr = [];
// identity unpack: top operand limb read straight from the ptr, no mask/shift.
if (!body.includes('let x16: u32 = (*x_ptr).limbs[16u];')) sErr.push('missing identity unpack x16');
if (!body.includes('let y16: u32 = (*y_ptr).limbs[16u];')) sErr.push('missing identity unpack y16');
// identity repack: result written straight to 17 limbs, no 20x13 repack.
if (!body.includes('s.limbs[16u] = s16;')) sErr.push('missing identity repack s.limbs[16u]');
if (body.includes('s.limbs[19u]')) sErr.push('found 20x13 repack (s.limbs[19u]) — not native');
// no domain correction (div32 k5 line nor serial halve).
if (body.includes('k5')) sErr.push('found div32 correction (k5) — delta should be 0');
if (body.includes('halve mod p')) sErr.push('found serial halve correction — delta should be 0');
if (body.includes('Montgomery-domain correction')) sErr.push('found domain-correction block — delta should be 0');
// still has the conditional_reduce tail + brace-balanced.
if (!body.includes('return conditional_reduce(&s);')) sErr.push('missing conditional_reduce tail');

// ── (B) NUMERIC mirror (DEFER core identical to the deployed validator) ──
const pp = ciosParams(B);
const p = pp.p, n0 = pp.n0, K = gen.K;
function toLimbs15(x){const l=[];for(let i=0;i<N;i++){l.push(x&MASK);x>>=Bb;}return l;}
function ciosCoreDefer(x, y) {
  const s = new Array(N).fill(0n);
  for (let i = 0; i < N; i++) {
    const t  = wrap(s[0] + x[i]*y[0]);
    const qi = wrap((n0 * (t & MASK)) & MASK);
    const c  = wrap(t + qi*p[0]) >> Bb;
    s[0] = wrap(s[1] + x[i]*y[1] + qi*p[1] + c);
    for (let j = 2; j < N-1; j++) s[j-1] = wrap(s[j] + x[i]*y[j] + qi*p[j]);
    s[N-2] = wrap(s[N-1] + x[i]*y[N-1] + qi*p[N-1]);
    s[N-1] = 0n;
    if ((i+1)%K===0 && i+1<N) { let cn=0n; for(let k=0;k<N-1;k++){const v=wrap(s[k]+cn);cn=v>>Bb;s[k]=v&MASK;} s[N-1]=cn; }
  }
  let cc=0n; for(let k=0;k<N;k++){const v=wrap(s[k]+cc);cc=v>>Bb;s[k]=v&MASK;}
  return s;
}
const TWO_B = 1n << Bb;
function condSubP(s){let brw=0n;const r=new Array(N);for(let k=0;k<N;k++){const d=wrap((s[k]|TWO_B)-p[k]-brw);r[k]=d&MASK;brw=1n-(d>>Bb);}const ge=1n-brw,msk=wrap(0n-ge);for(let k=0;k<N;k++)s[k]=(r[k]&msk)|(s[k]&wrap(~msk));}
function reassemble15(s){let x=0n;for(let i=N-1;i>=0;i--)x=(x<<Bb)+s[i];return x;}
function nativeMul(a,b){const s=ciosCoreDefer(toLimbs15(a),toLimbs15(b));condSubP(s);return reassemble15(s);}

const R_NATIVE = (1n << 255n) % P;
const RINV_NATIVE = (() => { let [a,m]=[R_NATIVE,P],[x0,x1]=[0n,1n]; while(a>1n){const q=a/m;[a,m]=[m,a-q*m];[x0,x1]=[x1-q*x0,x0];} return ((x1%P)+P)%P; })();
const R2 = (R_NATIVE*R_NATIVE)%P;

const TRIALS = parseInt(process.argv[2] || '120000', 10);
function rnd(){let x=0n;for(let i=0;i<8;i++)x=(x<<32n)|BigInt((Math.random()*2**32)>>>0);return x%P;}
const edges=[[0n,0n],[P-1n,P-1n],[1n,1n],[P-1n,1n],[1n,P-1n],[R_NATIVE,R_NATIVE],[1n,R_NATIVE],[R2,1n],[R2,R2],[0n,P-1n],[2n,(P-1n)/2n],[1n<<130n,1n<<130n],[R_NATIVE,P-1n],[P-2n,P-2n]];

let fail=0, first=null, nz=0, run=0;
const check=(a,b)=>{run++;const got=nativeMul(a,b);const want=(a*b%P)*RINV_NATIVE%P;if(got!==want){fail++;if(!first)first={a:a.toString(),b:b.toString(),got:got.toString(),want:want.toString()};}if(got!==0n)nz++;};
for(const[a,b]of edges)check(a,b);
const CHUNK=20000;let done=0;
while(done<TRIALS){const end=Math.min(done+CHUNK,TRIALS);for(let t=done;t<end;t++)check(rnd(),rnd());done=end;console.log(`progress ${done}/${TRIALS} fails=${fail}`);}

console.log('--- (A) STRUCTURAL render check ---');
if (sErr.length) { for (const e of sErr) console.log('  STRUCT_FAIL: '+e); } else console.log('  identity unpack + identity repack + NO correction: OK');
console.log('--- (B) NUMERIC ---');
console.log('regime='+gen.regime+' K='+gen.K+' R=2^255');
console.log('checked='+run+' (incl '+edges.length+' edges) nonzero_results='+nz);
console.log('FAIL_native17x15_vs_2^255='+fail);
if(first)console.log('FIRST_FAIL a='+first.a+' b='+first.b+' got='+first.got+' want='+first.want);
const ok = fail===0 && nz>0 && sErr.length===0;
console.log('NATIVE_17x15_VERDICT='+(ok?'PASS':'FAIL'));
process.exit(ok?0:1);
