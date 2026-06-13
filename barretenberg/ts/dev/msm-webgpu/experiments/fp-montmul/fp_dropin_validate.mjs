// Host validation of the FP B20-multiply + integer-Yuval-reduce drop-in
// montgomery_product_f8. Bit-exact mirror of the WGSL we emit in
// fp_dropin_montmul.wgsl. All FP ops use Math.fround (true IEEE-754 FP32) and
// an exact-double FMA, matching the Mali/WGSL fma() semantics.
//
// Convention (matches ba_stream_walker.S8.pk.wgsl): inputs/outputs are 8x u32
// little-endian 256-bit Montgomery-form field elements; result =
// x * y * R^-1 mod p with R = 2^260, output in [0, p).

const f = Math.fround;
const fma = (x, y, z) => f(x * y + z); // exact: x*y+z in double then round once

const P8 = [3632069959,1008765974,1752287885,2541841041,2172737629,3092268470,3778125865,811880050];
let P = 0n; for (let i = 7; i >= 0; i--) P = (P << 32n) | BigInt(P8[i] >>> 0);
const Rmod = (1n << 260n) % P;
const Rinv = modinv(1n << 260n, P);

// ---- helpers ----
function modinv(a, m) { let [g,x] = egcd(((a%m)+m)%m, m); if (g!==1n) throw 'no inv'; return ((x%m)+m)%m; }
function egcd(a,b){ if(b===0n) return [a,1n,0n]; const [g,x,y]=egcd(b,a%b); return [g,y,x-(a/b)*y]; }

function words8ToBig(w){ let v=0n; for(let i=7;i>=0;i--) v=(v<<32n)|BigInt(w[i]>>>0); return v; }
function bigToWords8(v){ const w=[]; for(let i=0;i<8;i++){ w.push(Number(v & 0xffffffffn)); v>>=32n; } return w; }

// ---- 20x13-bit limb unpack (mirror of unpack256_to_limbs) ----
function unpack256ToLimbs(w){
  const M=8191; const b=new Array(20);
  b[0]=(w[0]>>>0)&M;
  b[1]=(w[0]>>>13)&M;
  b[2]=(((w[0]>>>26)|(w[1]<<6))>>>0)&M;
  b[3]=(w[1]>>>7)&M;
  b[4]=(((w[1]>>>20)|(w[2]<<12))>>>0)&M;
  b[5]=(w[2]>>>1)&M;
  b[6]=(w[2]>>>14)&M;
  b[7]=(((w[2]>>>27)|(w[3]<<5))>>>0)&M;
  b[8]=(w[3]>>>8)&M;
  b[9]=(((w[3]>>>21)|(w[4]<<11))>>>0)&M;
  b[10]=(w[4]>>>2)&M;
  b[11]=(w[4]>>>15)&M;
  b[12]=(((w[4]>>>28)|(w[5]<<4))>>>0)&M;
  b[13]=(w[5]>>>9)&M;
  b[14]=(((w[5]>>>22)|(w[6]<<10))>>>0)&M;
  b[15]=(w[6]>>>3)&M;
  b[16]=(w[6]>>>16)&M;
  b[17]=(((w[6]>>>29)|(w[7]<<3))>>>0)&M;
  b[18]=(w[7]>>>10)&M;
  b[19]=(w[7]>>>23)&M;
  return b;
}
function packLimbsTo256(b){
  const M=8191; const w=new Array(8).fill(0);
  w[0]=((b[0]&M)|((b[1]&M)<<13)|((b[2]&M)<<26))>>>0;
  w[1]=(((b[2]&M)>>>6)|((b[3]&M)<<7)|((b[4]&M)<<20))>>>0;
  w[2]=(((b[4]&M)>>>12)|((b[5]&M)<<1)|((b[6]&M)<<14)|((b[7]&M)<<27))>>>0;
  w[3]=(((b[7]&M)>>>5)|((b[8]&M)<<8)|((b[9]&M)<<21))>>>0;
  w[4]=(((b[9]&M)>>>11)|((b[10]&M)<<2)|((b[11]&M)<<15)|((b[12]&M)<<28))>>>0;
  w[5]=(((b[12]&M)>>>4)|((b[13]&M)<<9)|((b[14]&M)<<22))>>>0;
  w[6]=(((b[14]&M)>>>10)|((b[15]&M)<<3)|((b[16]&M)<<16)|((b[17]&M)<<29))>>>0;
  w[7]=(((b[17]&M)>>>3)|((b[18]&M)<<10)|((b[19]&M)<<23))>>>0;
  return w;
}

// ---- FP B13 TwoProduct schoolbook columns ----
// We multiply in the SAME 13-bit radix the integer Karatsuba uses, so the
// column sums t0..t38 we feed the Yuval reduce are bit-identical (mod 2^32) to
// what the integer multiply produces. Each 13-bit limb product x_i*y_j < 2^26
// needs a TwoProduct EFT (>2^24). We split each product into (hi13,lo13) with
// the magic constant CHI13 = 2^(23+13), exact for 2*13 <= 23+13 (B<=23).
// Column k accumulates  sum_{i+j=k} lo_ij + sum_{i+j=k-1} hi_ij.  Each column
// holds <=20 lo terms (<2^13) and <=20 hi terms (<2^13) => < 40*2^13 = 2^18.3,
// FAR below 2^24, so every FP add is exact and NO deferred carry is needed.
const Bf = 13, NLf = 20;            // 20 limbs of 13 bits (the BigInt form)
const RINV13 = f(1/2**Bf), CHI13 = f(2**(23+Bf)); // 2^36, rounds at weight 2^13
// Produce the EXACT raw schoolbook columns t_k = sum_{i+j=k} x_i*y_j (each a
// non-negative integer < 2^31), the representation the integer Yuval reduce
// consumes bit-for-bit. Each 13-bit product is split via TwoProduct into a
// non-negative hi digit (multiple of 2^13, exact) and a SIGNED lo residual,
// hi*2^13 + lo == x_i*y_j exactly. We keep two FP accumulators per column:
//   hAcc[k] = sum_{i+j=k} (hi/2^13)  (each in [0,2^13), <=20 terms => <2^17.3)
//   lAcc[k] = sum_{i+j=k} lo         (signed, |lo|<2^12, <=20 terms => <2^17)
// both stay well under 2^24 so every FP add is exact. The schoolbook column
// is recombined in 32-bit integer (wrapping): t_k = (u32)hAcc*8192 + (u32)(i32)lAcc.
// The true value is non-negative < 2^31, so the two's-complement wrap is exact.
function fpColumns(xL13, yL13){
  const hAcc = new Array(39).fill(0);
  const lAcc = new Array(39).fill(0);
  for(let i=0;i<NLf;i++){
    for(let j=0;j<NLf;j++){
      const k=i+j;
      const t  = fma(xL13[i], yL13[j], CHI13);
      const hi = f(t - CHI13);                 // multiple of 2^13, exact
      const lo = fma(xL13[i], yL13[j], -hi);   // signed residual, exact
      hAcc[k] = f(hAcc[k] + f(hi * RINV13));    // hi/2^13, a non-neg integer <2^13
      lAcc[k] = f(lAcc[k] + lo);
    }
  }
  const out=new Array(39);
  for(let k=0;k<39;k++){
    if(!Number.isInteger(hAcc[k])||!Number.isInteger(lAcc[k])) throw 'nonint';
    // 32-bit wrapping recombine: hAcc*8192 + (i32->u32)lAcc
    const hi32 = (Math.imul(hAcc[k]>>>0, 8192))>>>0;
    const lo32 = (lAcc[k]|0)>>>0; // i32 two's complement -> u32
    out[k] = ((hi32 + lo32)>>>0);
  }
  return out;
}

// ---- integer Yuval reduce, faithful mirror of the WGSL (operates mod 2^32) ----
const MASK=8191, WS=13, N0=905;
const R_INV=[3803,4308,7801,6384,1700,2324,327,444,1220,6327,1154,765,825,4687,1647,6255,240,1621,5669,10];
const P_LIMB=[7495,999,1462,280,5058,1350,455,4653,362,3260,5655,770,7016,2082,1761,5125,305,5015,6419,96];
const u32=(x)=> (x>>>0);
const m32=(a,b)=> (Math.imul(a,b)>>>0); // 32-bit mul
function add32(a,b){ return (a+b)>>>0; } // may exceed 2^32 in double? a,b<2^32 sum<2^33; use BigInt-safe
// Accumulators can exceed 2^32 transiently in WGSL they wrap. To mirror exactly we keep
// each t as a u32 and every += wraps mod 2^32. Use >>>0 after each add of two terms.
function yuvalReduce(t){
  // t: array of 39 (we use up to index 38); WGSL uses t0..t39 but t39 stays carry only.
  const T=t.slice(); T.push(0); // ensure index 39
  // helper: T[i] = (T[i] + term) mod 2^32, term computed mod 2^32
  const addmul=(i,a,b)=>{ T[i]=((T[i]+ (Math.imul(a,b)>>>0))>>>0); };
  const addv=(i,v)=>{ T[i]=((T[i]+(v>>>0))>>>0); };
  // 19 Yuval calls i=0..18
  for(let i=0;i<19;i++){
    const t_mask=T[i]&MASK;
    const carry=T[i]>>>WS;
    // j=0 includes carry
    T[i+1]=((T[i+1] + (Math.imul(t_mask,R_INV[0])>>>0) + carry)>>>0);
    for(let j=1;j<20;j++){
      addmul(i+1+j, t_mask, R_INV[j]);
    }
  }
  // standard reduce i=19
  {
    const i=19;
    const t_mask=T[i]&MASK;
    const k_std=(Math.imul(t_mask,N0)>>>0)&MASK;
    addmul(i, k_std, P_LIMB[0]);            // t19 += k*P0
    // t20 += k*P1 + (t19>>13)
    T[i+1]=((T[i+1] + (Math.imul(k_std,P_LIMB[1])>>>0) + (T[i]>>>WS))>>>0);
    for(let j=2;j<20;j++){
      addmul(i+j, k_std, P_LIMB[j]);
    }
  }
  // final canonicalization carry pass over t20..t39
  let c=0;
  const out=new Array(20);
  for(let idx=0;idx<20;idx++){
    const ti=20+idx;
    const v=((T[ti]+c)>>>0);
    c=v>>>WS;
    out[idx]=v&MASK;
  }
  return out; // 20 limbs of 13 bits
}

// conditional_reduce: while s>=p subtract p, up to 4 times (mirror)
function condReduce(limbs){
  let v=0n; for(let i=19;i>=0;i--) v=(v<<13n)|BigInt(limbs[i]&8191);
  // subtract p up to 4 times
  for(let i=0;i<4;i++){ if(v>=P) v-=P; else break; }
  return v;
}

function montgomeryProductF8(xw, yw){
  // FP multiply path: 13-bit limbs -> f32, FP TwoProduct schoolbook columns,
  // integer Yuval reduce.
  const xb=unpack256ToLimbs(xw), yb=unpack256ToLimbs(yw);
  const xL=xb.map(v=>f(v)), yL=yb.map(v=>f(v));
  const t=fpColumns(xL,yL);
  const red=yuvalReduce(t);
  const val=condReduce(red);
  return bigToWords8(val);
}

// ---- reference: integer montgomery product via BigInt ----
function refMont(xw,yw){
  const x=words8ToBig(xw), y=words8ToBig(yw);
  return (x*y % P) * Rinv % P;
}

// ---- run trials ----
function randField(){
  // random in [0,p)
  let v;
  do { v=0n; for(let i=0;i<8;i++) v=(v<<32n)|BigInt(Math.floor(Math.random()*2**32)); } while(v>=P);
  return v;
}

const N = parseInt(process.argv[2]||'100000');
let fail=0, firstFail=null;
for(let i=0;i<N;i++){
  const x=randField(), y=randField();
  const xw=bigToWords8(x), yw=bigToWords8(y);
  const got=words8ToBig(montgomeryProductF8(xw,yw));
  const exp=refMont(xw,yw);
  if(got!==exp){ fail++; if(!firstFail) firstFail={x:x.toString(16),y:y.toString(16),got:got.toString(16),exp:exp.toString(16)}; }
}
// edge cases
const edges=[0n,1n,Rmod,P-1n];
for(const a of edges) for(const b of edges){
  const xw=bigToWords8(a), yw=bigToWords8(b);
  const got=words8ToBig(montgomeryProductF8(xw,yw));
  const exp=refMont(xw,yw);
  if(got!==exp){ fail++; if(!firstFail) firstFail={x:a.toString(16),y:b.toString(16),got:got.toString(16),exp:exp.toString(16),edge:true}; }
}
console.log(`trials=${N}(+${edges.length*edges.length} edges) fails=${fail} => ${fail===0?'BIT-EXACT':'MISMATCH'}`);
if(firstFail) console.log('firstFail',firstFail);
