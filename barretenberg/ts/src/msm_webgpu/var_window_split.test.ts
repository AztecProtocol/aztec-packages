// Standalone unit test for the variable-window split decision (split-c Phase 1).
// Run: node --loader ts-node/esm src/msm_webgpu/var_window_split.test.ts
import {
  chooseVarWindowSplit,
  buildVarWindowSchedule,
  computeMsbHistogram,
  effectiveNumBits,
  VAR_WINDOW_MAX_WINDOWS,
  type CPicker,
} from './var_window_split.js';

// Replica of msm_v2.ts pickC (kept in sync by hand; the test asserts the logic,
// not the table — a divergence would only change which inputs split).
const pickC: CPicker = (n: number): number => {
  const logN = Math.round(Math.log2(n));
  const table: Record<number, number> = {
    7: 4, 8: 4, 9: 5, 10: 8, 11: 8, 12: 8, 13: 8, 14: 8,
    15: 10, 16: 13, 17: 13, 18: 15, 19: 15, 20: 15,
  };
  return table[logN] ?? 13;
};

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    console.log(`  FAIL ${name}  ${detail}`);
    failures++;
  }
}

// ── Profile A: uniform-random 254-bit scalars → NO split (high bits not sparse).
{
  const n = 1 << 17;
  const scalars = new Uint32Array(n * 8);
  // Deterministic LCG so the test is reproducible. Mask the top word to ~254 bits.
  let s = 0x12345 >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0);
  for (let i = 0; i < n; i++) {
    for (let w = 0; w < 8; w++) scalars[i * 8 + w] = rnd();
    scalars[i * 8 + 7] &= 0x3fffffff; // 254-bit: top word holds bits 224..253
  }
  const hist = computeMsbHistogram(scalars, n);
  const enb = effectiveNumBits(hist);
  const dec = chooseVarWindowSplit(hist, n, enb, pickC);
  check('profileA: histogram sums to n', hist.reduce((a, b) => a + b, 0) === n);
  check('profileA: effNumBits ≈ 254', enb >= 252 && enb <= 254, `enb=${enb}`);
  check('profileA: NO split', dec.isSplit === false, JSON.stringify(dec));
}

// ── Bimodal (profile-D-like): 90% small (msb≈30), 10% large (msb≈250) → split.
{
  const n = 1 << 17;
  const hist = new Uint32Array(256);
  const nLargeTrue = Math.floor(n * 0.1);
  hist[31] = n - nLargeTrue; // msb == 30
  hist[251] = nLargeTrue;    // msb == 250
  const enb = effectiveNumBits(hist);
  const dec = chooseVarWindowSplit(hist, n, enb, pickC);
  check('bimodal: effNumBits == 251', enb === 251, `enb=${enb}`);
  check('bimodal: IS split', dec.isSplit === true, JSON.stringify(dec));
  check('bimodal: cHi < cLo', dec.cHi < dec.cLo, JSON.stringify(dec));
  check('bimodal: cLo == pickC(n)', dec.cLo === pickC(n), JSON.stringify(dec));
  // Schedule must tile exactly effNumBits+2 bits across ≤128 windows.
  const widths = buildVarWindowSchedule(dec, enb);
  const sum = widths.reduce((a, b) => a + b, 0);
  check('bimodal: schedule tiles effNumBits+2', sum === enb + 2, `sum=${sum} enb+2=${enb + 2}`);
  check('bimodal: ≤128 windows', widths.length <= VAR_WINDOW_MAX_WINDOWS, `nw=${widths.length}`);
  const wLo = Math.ceil(dec.bStar / dec.cLo);
  check('bimodal: lower windows use cLo', widths.slice(0, wLo - 1).every(w => w === dec.cLo), JSON.stringify(widths));
  console.log(`       bimodal decision: ${JSON.stringify(dec)} → ${widths.length} windows [${widths.join(',')}]`);
}

// ── Profile E: all scalars in [0,16) (msb 0..3) → NO split (no sparse high region).
{
  const n = 1 << 17;
  const hist = new Uint32Array(256);
  hist[1] = n >> 2; hist[2] = n >> 2; hist[3] = n >> 2; hist[4] = n - 3 * (n >> 2);
  const enb = effectiveNumBits(hist);
  const dec = chooseVarWindowSplit(hist, n, enb, pickC);
  check('profileE: effNumBits == 4', enb === 4, `enb=${enb}`);
  check('profileE: NO split (numBits tiny)', dec.isSplit === false, JSON.stringify(dec));
}

// ── Edge: n==0 and all-zero histogram → NO split, no throw.
{
  const hist = new Uint32Array(256);
  hist[0] = 100; // all zero scalars
  const dec = chooseVarWindowSplit(hist, 100, effectiveNumBits(hist), pickC);
  check('all-zero: NO split', dec.isSplit === false);
  check('n==0: NO split', chooseVarWindowSplit(new Uint32Array(256), 0, 254, pickC).isSplit === false);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
