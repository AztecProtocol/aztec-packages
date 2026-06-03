// Variable-window (split-c) Pippenger schedule decision.
//
// GPU-adapted port of choose_var_window_split / predict_schedule_cost /
// build_var_window_schedule (barretenberg C++ scalar_multiplication.cpp @
// pippenger-refactor-full-11-may, lines 668/721/831). The cost model and grid
// search are kept verbatim. The ONE deliberate divergence is the window-bits
// picker: the C++ optimal_window_bits_for() (CPU-calibrated choose_window_bits)
// is replaced by the GPU's pickC (passed in). pickC is occupancy-tuned per
// point-count and is what the uniform path already uses, so a split's lower
// region uses the same c as the unsplit path and the upper region uses
// pickC(n_large) — only the sparse high bits get a narrower window.
//
// This module is pure (no GPU/WebGPU dependency) so it can be unit-tested
// directly and reused as the reference oracle for the GPU `decide` kernel.

// BN254 scalar field bit length (C++ NUM_BITS). The decision is undefined above this.
const NUM_BITS_MAX = 254;

export const VAR_WINDOW_MAX_WINDOWS = 128;

// b_star candidate grid (C++ SPLIT_GRID): lower/upper region boundary bit
// positions to try; step 16 keeps the search to 14 candidates.
export const SPLIT_GRID = [16, 32, 48, 64, 80, 96, 112, 128, 144, 160, 176, 192, 208, 224];

// Comparative parallel width fed to the cost model. On the CPU this is
// num_cpus·oversub; on the GPU it only sets the scan-vs-bucket-vs-per-window
// balance in predictScheduleCost (split and unsplit both scale with it), so the
// absolute value is a Phase-3 calibration knob, not a correctness input. Phase 1
// validates the decision MACHINERY (forced split + byte-identical no-split);
// calibrating the natural decision to GPU wall is Phase 3.
export const VAR_WINDOW_COST_T = 64;

export interface SplitDecision {
  isSplit: boolean;
  bStar: number;
  cLo: number;
  cHi: number;
}

export type CPicker = (nPoints: number) => number;

// Port of predict_schedule_cost (:668). Models the per-region scan (one pass per
// (point, window)), the bucket-accumulate cost (with the trivial-stride 1.6×
// penalty when B ≤ 2T+1, where the strided bucket reduce loses cross-window
// inversion amortisation), and the per-window dispatch/barrier overhead.
export function predictScheduleCost(
  n: number,
  nLarge: number,
  wLo: number,
  wHi: number,
  cLo: number,
  cHi: number,
  T: number,
): number {
  const ALPHA_SCAN = 1;
  const ALPHA_BUCKET = 4;
  const ALPHA_PER_WINDOW = 256;
  const bucketCost = (W: number, c: number): number => {
    if (W === 0) return 0;
    const B = (1 << (c - 1)) + 1;
    const base = W * B;
    return B <= 2 * T + 1 ? Math.floor((base * 8) / 5) : base;
  };
  const scan = n * wLo + nLarge * wHi;
  const bucket = T * (bucketCost(wLo, cLo) + bucketCost(wHi, cHi));
  const perWindow = T * ALPHA_PER_WINDOW * (wLo + wHi);
  return ALPHA_SCAN * scan + ALPHA_BUCKET * bucket + perWindow;
}

// Port of choose_var_window_split (:721). `msbHist` is the 256-bin MSB histogram:
// bin 0 = #zero scalars, bin (k+1) = #{scalars with msb == k}. `numBits` is the
// effective bit length (highest non-empty bin). Returns isSplit=false unless a
// grid candidate beats the unsplit cost by ≥15% (the 85% gate).
export function chooseVarWindowSplit(
  msbHist: Uint32Array | number[],
  n: number,
  numBits: number,
  pickC: CPicker,
  T: number = VAR_WINDOW_COST_T,
): SplitDecision {
  const out: SplitDecision = { isSplit: false, bStar: 0, cLo: 0, cHi: 0 };
  if (n === 0 || numBits === 0 || numBits > NUM_BITS_MAX) return out;
  // #{scalars with msb >= b} = Σ bins [b+1, 256).
  const cdfGe = (b: number): number => {
    let s = 0;
    for (let i = Math.min(b + 1, 256); i < 256; i++) s += msbHist[i];
    return s;
  };
  // idx_large includes msb >= b-1: the boundary bit cancels the negative-signed
  // digit the lower region's last window emits (C++ comment at :740).
  const cdfGeBoundary = (b: number): number => cdfGe(b === 0 ? 0 : b - 1);
  const nActive = n - msbHist[0];
  const cUnsplit = pickC(n);
  const wUnsplit = Math.ceil((numBits + 2) / cUnsplit);
  const costUnsplit = predictScheduleCost(n, 0, wUnsplit, 0, cUnsplit, cUnsplit, T);

  let bestCost = costUnsplit;
  let bestB = 0;
  let bestCLo = 0;
  let bestCHi = 0;
  let found = false;
  for (const b of SPLIT_GRID) {
    if (b === 0 || b >= numBits) continue;
    const nLarge = cdfGeBoundary(b);
    if (nLarge >= nActive) continue;
    const nSmallActive = nActive - nLarge;
    if (nLarge === 0 || nSmallActive === 0) continue;
    // Upper region must be the minority; lower must hold ≥10% of n; upper needs
    // ≥64 absolute and ≥5% of n_active to amortise its per-window dispatch.
    if (nLarge * 2 > n) continue;
    if (nSmallActive * 10 < n) continue;
    if (nLarge < 64 || nLarge * 20 < nActive) continue;
    if (b + 32 > numBits) continue;
    // GPU window-bits: pickC(n) for the lower region (all n points), pickC(nLarge)
    // for the upper. Lower c == unsplit c, so the split only narrows the high bits.
    const cLo = pickC(n);
    const cHi = pickC(nLarge);
    if (cLo === 0 || cHi === 0 || cHi >= cLo) continue;
    const wLo = Math.ceil(b / cLo);
    const wHi = Math.ceil((numBits - b) / cHi);
    if (wLo + wHi > VAR_WINDOW_MAX_WINDOWS) continue;
    const cost = predictScheduleCost(n, nLarge, wLo, wHi, cLo, cHi, T);
    if (cost < bestCost) {
      bestCost = cost;
      bestB = b;
      bestCLo = cLo;
      bestCHi = cHi;
      found = true;
    }
  }
  // Require ≤85% of unsplit so marginal candidates inside cost-model noise don't fire.
  if (!found || bestCost * 100 > costUnsplit * 85) return out;
  return { isSplit: true, bStar: bestB, cLo: bestCLo, cHi: bestCHi };
}

// Port of build_var_window_schedule (:831), returning per-window widths. SPLIT
// tiles [0, bStar) with cLo then [bStar, effNumBits+2) with cHi (last window in
// each region gets the remainder). The +2 is the carry-less top bit of the
// Constantine recoder. NO_SPLIT is handled by the caller, which keeps today's
// data-independent ceil(NUMBITS/c) uniform fill for byte-identical output.
export function buildVarWindowSchedule(dec: SplitDecision, effNumBits: number): number[] {
  const out: number[] = [];
  const fillRegion = (bitsInRegion: number, c: number) => {
    let remaining = bitsInRegion;
    while (remaining > 0 && out.length < VAR_WINDOW_MAX_WINDOWS) {
      const cw = Math.min(c, remaining);
      out.push(cw);
      remaining -= cw;
    }
  };
  const totalBits = effNumBits + 2;
  const lowerBits = Math.min(dec.bStar, totalBits);
  fillRegion(lowerBits, dec.cLo);
  const upperBits = totalBits - lowerBits;
  if (upperBits > 0) fillRegion(upperBits, dec.cHi);
  return out;
}

// Host MSB histogram over normal-form scalars (`scalarWords` u32 words each,
// little-endian). Bin 0 = #zero scalars, bin (k+1) = #{msb == k}. This is the
// test oracle for the GPU histogram kernel; the production decision reads the
// GPU-built histogram.
export function computeMsbHistogram(
  scalars: Uint32Array,
  n: number,
  scalarWords: number = 8,
): Uint32Array {
  const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) {
    const base = i * scalarWords;
    let msb = -1;
    for (let w = scalarWords - 1; w >= 0; w--) {
      const v = scalars[base + w];
      if (v !== 0) {
        msb = w * 32 + (31 - Math.clz32(v));
        break;
      }
    }
    hist[msb + 1]++;
  }
  return hist;
}

// Effective bit length = highest non-empty MSB bin (C++ :2922), capped at NUM_BITS.
export function effectiveNumBits(msbHist: Uint32Array | number[]): number {
  for (let bin = 255; bin > 1; bin--) {
    if (msbHist[bin] !== 0) return Math.min(bin, NUM_BITS_MAX);
  }
  return NUM_BITS_MAX;
}

const WD_STRIDE = 8;
const PLANNER_TPB = 256;

export interface DecideSummary {
  isSplit: number;
  bStar: number;
  cLo: number;
  cHi: number;
  nLarge: number;
  wLo: number;
  wHi: number;
  numWindows: number;
  effNumBits: number;
}

// Reference for the ba_decide_window_split kernel: produces the exact WindowDesc
// rows + summary the GPU kernel should write, given the same histogram and envelope
// c. Used to unit-test the kernel by readback (split-c Phase 2 exit criterion). The
// fill must stay byte-identical to both the kernel and the host WindowDesc fill in
// msm_v2.ts (envelope reduce_off = w*stride_max; NO_SPLIT = uniform ceil(254/c)).
export function buildWindowDescReference(
  msbHist: Uint32Array | number[],
  n: number,
  cEnv: number,
  wdRows: number,
  pickC: CPicker,
): { windowDesc: Uint32Array; summary: DecideSummary } {
  const eff = effectiveNumBits(msbHist);
  const dec = chooseVarWindowSplit(msbHist, n, eff, pickC);
  const strideMax = 2 ** (cEnv - 1);
  const wd = new Uint32Array(wdRows * WD_STRIDE);
  let w = 0;
  let bitBase = 0;
  let workOff = 0;
  const emit = (cw: number) => {
    const strideW = 2 ** (cw - 1);
    const numCols = Math.ceil((strideW + 1) / PLANNER_TPB) * PLANNER_TPB;
    const o = w * WD_STRIDE;
    wd[o + 0] = cw;
    wd[o + 1] = bitBase;
    wd[o + 2] = strideW;
    wd[o + 3] = workOff;
    wd[o + 4] = w * strideMax;
    wd[o + 5] = numCols;
    bitBase += cw;
    workOff += numCols;
    w++;
  };
  const cUnsplit = pickC(n);
  let wLo = 0;
  let wHi = 0;
  let nLarge = 0;
  if (!dec.isSplit) {
    const nw = Math.ceil(NUM_BITS_MAX / cUnsplit);
    while (w < nw && w < VAR_WINDOW_MAX_WINDOWS) emit(cUnsplit);
    wLo = w;
  } else {
    const totalBits = eff + 2;
    const lowerBits = Math.min(dec.bStar, totalBits);
    let remaining = lowerBits;
    while (remaining > 0 && w < VAR_WINDOW_MAX_WINDOWS) {
      const cw = Math.min(dec.cLo, remaining);
      emit(cw);
      remaining -= cw;
    }
    wLo = w;
    remaining = totalBits - lowerBits;
    while (remaining > 0 && w < VAR_WINDOW_MAX_WINDOWS) {
      const cw = Math.min(dec.cHi, remaining);
      emit(cw);
      remaining -= cw;
    }
    wHi = w - wLo;
    for (let i = dec.bStar; i < 256; i++) nLarge += msbHist[i];
  }
  const numWindows = w;
  while (w < wdRows && w < VAR_WINDOW_MAX_WINDOWS) emit(cEnv);
  return {
    windowDesc: wd,
    summary: {
      isSplit: dec.isSplit ? 1 : 0,
      bStar: dec.bStar,
      cLo: dec.cLo,
      cHi: dec.cHi,
      nLarge,
      wLo,
      wHi,
      numWindows,
      effNumBits: eff,
    },
  };
}
