// Bit-exact mirror of the GENERATED WGSL (gen_fp_largelimb.mjs), including the
// exact final single-correction carry chain, to prove the shipped kernel is exact.
const f = Math.fround;
const fma = (x,y,z) => f(x*y + z);
function maxG(B){return Math.max(1,Math.floor((2**24 - 2**(B-1))/2**(B+1)));}

function mulWGSL(aL, bL, B, G) {
  const NL = aL.length, NCOL = 2*NL;
  const R = 2**B, RINV = f(1/R);
  const CHI = f(2**(23+B)), CN = f(3*2**(22+B));
  const c = new Array(NCOL+2).fill(0);
  for (let i=0;i<NL;i++){
    for (let j=0;j<NL;j++){
      const k=i+j;
      const t = fma(aL[i],bL[j],CHI);
      const hi = f(t - CHI);
      const lo = fma(aL[i],bL[j],-hi);
      c[k]   = f(c[k] + lo);
      c[k+1] = f(c[k+1] + f(hi*RINV));
    }
    if ((i+1)%G===0 && i!==NL-1){
      for (let k=0;k<NCOL+1;k++){
        const t=f(c[k]+CN), hv=f(t-CN);
        c[k]=f(c[k]-hv); c[k+1]=f(c[k+1]+f(hv*RINV));
      }
    }
  }
  for (let k=0;k<NCOL+1;k++){
    const t=f(c[k]+CN), hv=f(t-CN);
    c[k]=f(c[k]-hv); c[k+1]=f(c[k+1]+f(hv*RINV));
  }
  // final carry, exact WGSL logic (single correction)
  const lowLimbs = Math.ceil(256/B);
  let carry = 0; const out = new Array(lowLimbs).fill(0);
  for (let k=0;k<lowLimbs;k++){
    let v = f(c[k] + carry);
    let q = f(Math.floor(f(v*RINV)));
    let d = f(v - f(q*R));
    if (d < 0) { q = f(q-1); d = f(d+R); }
    carry = q;
    out[k] = d >>> 0; // u32(d)
  }
  return { out, lowLimbs };
}

function check(B, trials) {
  const NL = Math.ceil(256/B), G = maxG(B);
  let bad = 0;
  for (let t=0;t<trials;t++){
    const a=[],b=[]; let A=0n,Bb=0n;
    for (let k=0;k<NL;k++){
      const av=Math.floor(Math.random()*2**B), bv=Math.floor(Math.random()*2**B);
      a.push(av); b.push(bv);
      A+=BigInt(av)<<BigInt(B*k); Bb+=BigInt(bv)<<BigInt(B*k);
    }
    const { out, lowLimbs } = mulWGSL(a,b,B,G);
    // reconstruct low (256-bit) part; full product is 512 bits but WGSL packs low 256.
    let lowVal = 0n;
    for (let k=0;k<lowLimbs;k++) lowVal += BigInt(out[k]) << BigInt(B*k);
    const trueLow = (A*Bb) & ((1n<<BigInt(B*lowLimbs))-1n);
    if (lowVal !== trueLow) bad++;
  }
  return bad;
}

console.log('=== GENERATED-WGSL mirror, low-256-bit exactness (100k) ===');
for (const B of [16,18,20,22]) {
  const bad = check(B, 100000);
  console.log(`B=${B}: ${bad===0?'EXACT':bad+' FAIL'}`);
}
