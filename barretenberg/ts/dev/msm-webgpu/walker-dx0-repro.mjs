// Dependency-free CPU reproduction of the stream-walker MSM bucket pipeline,
// built to ROOT-CAUSE the `dx == 0` exception that ba_walker_combine hits on
// a small number of buckets at logn=8..16 (off-curve result).
//
// It ports the EXACT integer logic of the WGSL/TS kernels:
//   - decompose_scalars_booth  (buildInitCounts, msm_v2.ts:187)  -> (digit,sign)
//   - global bucket id = window*BW + digit                       (msm_v2.ts:1396)
//   - ba_planner_cumsum        -> cumulative_adds = exclusive prefix of (count-1)
//   - ba_planner_partition_thread/_task -> thread/task adds-axis cuts
//   - ba_stream_walker         -> per-task partial / bucket_sum emission
//   - ba_walker_partials_index + ba_walker_combine -> per-bucket partial list
// plus inline BN254 G1 affine/projective arithmetic for the curve checks.
//
// For each dense bucket it verifies the emitted pieces partition [0,count)
// exactly (overlap/gap = a double-count bug) and replays the combine's
// sequential affine sum to find where dx==0 occurs, then classifies the
// colliding pieces (same value = duplicate, negated value = sign collision).
//
//   node dev/msm-webgpu/walker-dx0-repro.mjs [logn] [seed]

// ---------------------------------------------------------------------------
// BN254 G1: y^2 = x^3 + 3 over Fp.
const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const R = 21888242871839275222246405745257275088548364400416034343698204186575808495617n; // Fr order
const Gx = 1n, Gy = 2n;

const mod = (a) => ((a % P) + P) % P;
const fadd = (a, b) => mod(a + b);
const fsub = (a, b) => mod(a - b);
const fmul = (a, b) => mod(a * b);
function finv(a) {
  // extended euclid; finv(0) returns 0 (matches the kernels' modInv(0)).
  let [old_r, r] = [mod(a), P];
  let [old_s, s] = [1n, 0n];
  while (r !== 0n) { const q = old_r / r; [old_r, r] = [r, old_r - q * r]; [old_s, s] = [s, old_s - q * s]; }
  return mod(old_s);
}
const ZERO = { x: 0n, y: 0n, inf: true };
function onCurve(pt) { if (pt.inf) return true; return fsub(fmul(pt.y, pt.y), fadd(fmul(fmul(pt.x, pt.x), pt.x), 3n)) === 0n; }

// Complete affine addition (correct doubling + infinity handling). The
// reference for bucket sums and partial values.
function addComplete(a, b) {
  if (a.inf) return b; if (b.inf) return a;
  let lam;
  if (a.x === b.x) {
    if (fadd(a.y, b.y) === 0n) return ZERO;            // P + (-P) = O
    lam = fmul(fmul(3n, fmul(a.x, a.x)), finv(fmul(2n, a.y))); // doubling
  } else {
    lam = fmul(fsub(b.y, a.y), finv(fsub(b.x, a.x)));
  }
  const rx = fsub(fsub(fmul(lam, lam), a.x), b.x);
  const ry = fsub(fmul(lam, fsub(a.x, rx)), a.y);
  return { x: rx, y: ry, inf: false };
}
function affSum(pts) { let acc = ZERO; for (const pt of pts) acc = addComplete(acc, pt); return acc; }

// Incomplete affine add EXACTLY as the combine/walker do (this is what hits dx==0).
// Returns {pt, dxZero}. When dx==0, finv(0)=0 -> garbage (matches GPU).
function affineAddRaw(a, b) {
  const dx = fsub(b.x, a.x);
  const dxZero = dx === 0n;
  const lam = fmul(fsub(b.y, a.y), finv(dx));
  const rx = fsub(fsub(fmul(lam, lam), a.x), b.x);
  const ry = fsub(fmul(lam, fsub(a.x, rx)), a.y);
  return { pt: { x: rx, y: ry, inf: false }, dxZero };
}

function negate(pt) { return pt.inf ? pt : { x: pt.x, y: fsub(0n, pt.y), inf: false }; }
function ptEq(a, b) { if (a.inf || b.inf) return a.inf && b.inf; return a.x === b.x && a.y === b.y; }

// ---------------------------------------------------------------------------
// Deterministic input generation.
// mulberry32 — good full-word distribution (an LCG's low bits are NOT random,
// which silently biases the booth digits and can mask bucket-distribution bugs).
function makeRng(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return (t ^ (t >>> 14)) >>> 0; }; }
function randFr(rng) { let v = 0n; for (let i = 0; i < 8; i++) v = (v << 32n) | BigInt(rng() >>> 0); v &= (1n << 254n) - 1n; return v % R; }
function scalarMulG(k) { // double-and-add on G to get a valid random-ish point
  let acc = ZERO; let base = { x: Gx, y: Gy, inf: false };
  while (k > 0n) { if (k & 1n) acc = addComplete(acc, base); base = addComplete(base, base); k >>= 1n; }
  return acc;
}

// ---------------------------------------------------------------------------
// Booth decompose: returns {digit, neg} for window w of a scalar's LE bytes.
// Exact port of buildInitCounts (msm_v2.ts:187-216).
function scalarToLE(s) { const b = new Uint8Array(32); let x = s; for (let i = 0; i < 32; i++) { b[i] = Number(x & 0xffn); x >>= 8n; } return b; }
function boothWindows(le, c, numWindows) {
  const cMask = (1 << c) - 1; const out = [];
  let lookback = 0;
  for (let w = 0; w < numWindows; w++) {
    const lo = w * c; const inOff = lo >>> 3; const bitShift = lo & 7;
    const b0 = le[inOff] ?? 0; const b1 = inOff + 1 < 32 ? le[inOff + 1] : 0;
    const b2 = inOff + 2 < 32 ? le[inOff + 2] : 0; const b3 = inOff + 3 < 32 ? le[inOff + 3] : 0;
    const v = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24)) >>> 0;
    const winBits = (v >>> bitShift) & cMask;
    const raw = ((winBits << 1) | lookback) >>> 0;
    const neg = (raw >>> c) & 1;
    const negMask = neg ? 0xffffffff : 0;
    const encode = (raw + 1) >>> 1;
    const digit = ((((encode - neg) >>> 0) ^ negMask) & cMask) >>> 0;
    out.push({ digit, neg });
    lookback = (v >>> (bitShift + c - 1)) & 1;
  }
  return out;
}

// ---------------------------------------------------------------------------
function pickC(logN) { const t = { 7: 4, 8: 4, 9: 5, 10: 8, 11: 8, 12: 8, 13: 8, 14: 8, 15: 10, 16: 13 }; return t[logN] ?? 13; }
const PLANNER_TPB = 256, STREAM_S = 8, MIN_ITERS_PER_WG = 8, MAX_STREAM_WORKGROUPS = 64, THREAD_TPB = 256, NUMBITS = 254;

function run(logN, seed, fast) {
  const n = 1 << logN;
  const c = pickC(logN);
  const numWindows = Math.ceil(NUMBITS / c);
  const BW = Math.ceil((2 ** (c - 1) + 1) / PLANNER_TPB) * PLANNER_TPB;
  const S = STREAM_S;
  if (!fast) console.log(`logN=${logN} n=${n} c=${c} numWindows=${numWindows} BW=${BW} S=${S} seed=${seed}`);

  // 1) inputs. In fast (structural) mode we skip curve-point generation and
  // use the point index (+sign) as identity — enough to detect duplicates,
  // sign-collisions, range overlaps and gaps (none of which need curve math).
  const rng = makeRng(seed);
  const points = fast ? null : new Array(n); const scalarsLE = new Array(n);
  for (let i = 0; i < n; i++) { if (!fast) points[i] = scalarMulG((randFr(rng) % (R - 1n)) + 1n); scalarsLE[i] = scalarToLE(randFr(rng)); }

  // 2) build per-bucket point lists (l0_index equivalent): (pointIdx, neg)
  const buckets = new Map(); // bucketId -> [{pt, neg}...]
  for (let i = 0; i < n; i++) {
    const wins = boothWindows(scalarsLE[i], c, numWindows);
    for (let w = 0; w < numWindows; w++) {
      const { digit, neg } = wins[w];
      if (digit === 0) continue; // zero digit skipped
      const b = w * BW + digit;
      if (!buckets.has(b)) buckets.set(b, []);
      buckets.get(b).push({ pt: i, neg });
    }
  }

  // CONTENTS-LEVEL check (case a/b at the input level), structural so it needs
  // no curve math: does any bucket hold the SAME point index twice (case a,
  // duplicate), or the same index once with +sign and once with -sign (case b,
  // an exact P and -P collision)?
  let contentsDup = 0, contentsNegPair = 0;
  for (const [b, list] of buckets) {
    const seen = new Map(); // pointIdx -> set of signs
    for (const e of list) {
      if (!seen.has(e.pt)) seen.set(e.pt, new Set());
      const s = seen.get(e.pt);
      if (s.has(e.neg)) contentsDup++;        // same index, same sign, twice
      else if (s.size > 0) contentsNegPair++; // same index, both signs => P and -P
      s.add(e.neg);
    }
  }

  // 3) dense buckets (count>=2), sorted by DESCENDING count (radix faithful).
  const dense = [];
  for (const [b, list] of buckets) if (list.length >= 2) dense.push(b);
  dense.sort((a, bb) => buckets.get(bb).length - buckets.get(a).length || a - bb);
  const numDense = dense.length;
  const counts = dense.map((b) => buckets.get(b).length);

  // 4) cumulative_adds (exclusive prefix of count-1), total_adds.
  const cum = new Array(numDense); let acc = 0;
  for (let i = 0; i < numDense; i++) { cum[i] = acc; acc += counts[i] - 1; }
  const totalAdds = acc;

  // 5) nwg / num_active_threads (ba_planner_cumsum + partition_thread).
  const targetWork = THREAD_TPB * S * MIN_ITERS_PER_WG;
  let nwg = 1; if (totalAdds > targetWork) nwg = Math.floor(totalAdds / targetWork);
  nwg = Math.min(nwg, MAX_STREAM_WORKGROUPS); nwg = Math.max(nwg, 1);
  const numActive = nwg * THREAD_TPB;

  // resolve_cut (shared by partition_thread/_task). Returns [bucket, offset].
  function resolveCut(cutTarget, loB, hiB) {
    let lo = loB, hi = hiB;
    while (lo < hi) { const mid = (lo + hi) >> 1; const cumEnd = cum[mid] + counts[mid] - 1; if (cumEnd < cutTarget) lo = mid + 1; else hi = mid; }
    const cb = Math.min(lo, numDense - 1);
    let co = 0; if (cutTarget > cum[cb]) co = cutTarget - cum[cb];
    return [cb, co];
  }

  // thread cuts: flat thread f in [0,numActive) -> START cut_target.
  function threadCutTarget(f) {
    const wg = Math.floor(f / THREAD_TPB), t = f % THREAD_TPB;
    const wgStart = Math.floor((wg * totalAdds) / nwg);
    const wgEnd = Math.floor(((wg + 1) * totalAdds) / nwg);
    const wgTotal = wgEnd - wgStart;
    return wgStart + Math.floor((t * wgTotal) / THREAD_TPB);
  }

  // 6) per-task cuts and 7) walker emission.
  // Record per bucket: pieces = [{range:[lo,hi] inclusive point idx, kind}], where
  // kind in {'sum','partial'}; 'sum' => store_bucket_sum, 'partial' => combine input.
  const pieces = new Map(); // bucketId -> [{lo,hi,kind,task}]
  function addPiece(bId, lo, hi, kind, task) { if (!pieces.has(bId)) pieces.set(bId, []); pieces.get(bId).push({ lo, hi, kind, task }); }

  for (let f = 0; f < numActive; f++) {
    const firstTarget = threadCutTarget(f);
    const [fb, fo] = resolveCut(firstTarget, 0, numDense);
    let lastBucket, lastOff;
    if (f + 1 >= numActive) { lastBucket = numDense - 1; lastOff = totalAdds - cum[numDense - 1]; }
    else { const nt = threadCutTarget(f + 1); const rc = resolveCut(nt, 0, numDense); lastBucket = rc[0]; lastOff = rc[1]; }
    const startAdds = cum[fb] + fo; const endAdds = cum[lastBucket] + lastOff; const threadTotal = endAdds - startAdds;
    if (threadTotal <= 0) continue;
    const hiB = Math.min(lastBucket + 1, numDense);
    const taskCuts = [];
    for (let k = 0; k <= S; k++) { const ct = startAdds + Math.floor((k * threadTotal) / S); taskCuts.push(resolveCut(ct, fb, hiB)); }

    // Walker per slot k = task [taskCuts[k], taskCuts[k+1]).
    for (let k = 0; k < S; k++) {
      const [sb, so] = taskCuts[k]; const [eb, eo] = taskCuts[k + 1];
      walkTask(f, k, sb, so, eb, eo);
    }
  }

  // Faithful port of ba_stream_walker init + loop, emitting point-index ranges.
  function walkTask(f, k, sb, so, eb, eo) {
    const sbCount = counts[sb];
    // --- init: start cursor (point index WITHIN bucket) + split_start ---
    let effSorted = sb, effCount = sbCount, startPt, splitStart;
    if (so === 0) { startPt = 0; splitStart = 0; }
    else if (so + 1 < sbCount) { startPt = so + 1; splitStart = 1; }
    else { effSorted = sb + 1; effCount = effSorted < numDense ? counts[effSorted] : 0; startPt = 0; splitStart = 0; }

    // task end (region-aware)
    let teSort, teCur; // teCur = point index (within bucket teSort) one past the last consumed
    if (eo > 0) { teSort = eb; teCur = eo + 1; }
    else if (eb > 0) { teSort = eb - 1; teCur = counts[teSort]; }
    else { teSort = 0; teCur = 0; }

    let curSorted = effSorted, bucketEnd = effCount, cursor = startPt, isFirst = 1, slotDone = 0;

    // empty task
    if (effSorted > teSort || (effSorted === teSort && startPt >= teCur)) return;

    // single-point leading segment
    let segEnd = bucketEnd; if (effSorted === teSort) segEnd = teCur;
    if (splitStart === 1 && segEnd - startPt === 1) {
      if (effSorted === teSort) { addPiece(dense[effSorted], startPt, startPt, 'partial', { f, k, slot: 1 }); return; }
      addPiece(dense[effSorted], startPt, startPt, 'partial', { f, k, slot: 0 });
      const nxt = effSorted + 1; curSorted = nxt; bucketEnd = counts[nxt]; cursor = 0; splitStart = 0; isFirst = 1;
      if (nxt > teSort) return;
    }

    // main loop
    let pieceLo = cursor; // first not-yet-retired point of the current piece
    for (;;) {
      // consume one affine step
      if (isFirst === 1) { cursor += 2; isFirst = 0; } else { cursor += 1; }
      const taskDone = (curSorted === teSort) && (cursor >= teCur);
      const bucketDone = cursor >= bucketEnd;
      if (taskDone) {
        const isPartial = (splitStart === 1) || (cursor < bucketEnd);
        const hi = Math.min(cursor, bucketEnd) - 1;
        addPiece(dense[curSorted], pieceLo, hi, isPartial ? 'partial' : 'sum', { f, k, slot: 1 });
        return;
      } else if (bucketDone) {
        addPiece(dense[curSorted], pieceLo, bucketEnd - 1, splitStart === 1 ? 'partial' : 'sum', { f, k, slot: 0 });
        const nxt = curSorted + 1; curSorted = nxt; bucketEnd = counts[nxt]; cursor = 0; isFirst = 1; splitStart = 0; pieceLo = 0;
      }
      // else: continue accumulating same piece
    }
  }

  // 8) Per-bucket combine analysis.
  let bucketsWithDxZero = 0, offCurveBuckets = 0, overlapBuckets = 0, gapBuckets = 0, mixedSumPartial = 0;
  const reports = [];
  for (const b of dense) {
    const list = buckets.get(b); const count = list.length;
    const ps = pieces.get(b) || [];
    const partials = ps.filter((p) => p.kind === 'partial');
    const sums = ps.filter((p) => p.kind === 'sum');

    // range coverage check
    const cover = new Array(count).fill(0);
    let overlap = false, gap = false;
    for (const p of ps) for (let i = p.lo; i <= p.hi; i++) { if (i >= 0 && i < count) cover[i]++; }
    for (let i = 0; i < count; i++) { if (cover[i] === 0) gap = true; if (cover[i] > 1) overlap = true; }
    if (overlap) overlapBuckets++;
    if (gap) gapBuckets++;
    if (sums.length > 0 && partials.length > 0) mixedSumPartial++;

    // The combine only runs over partials (a fully-consumed bucket has a 'sum'
    // and the combine early-returns). Analyze the partial set the combine sees.
    if (partials.length === 0) continue;
    if (fast) {
      if (overlap || gap || (sums.length && partials.length)) {
        reports.push({ b, count, nPartials: partials.length, overlap, gap, sums: sums.length, ranges: partials.map((p) => [p.lo, p.hi, p.task]) });
      }
      continue;
    }
    const pieceVal = (p) => { let accPt = ZERO; for (let i = p.lo; i <= p.hi; i++) { const e = list[i]; const v = e.neg ? negate(points[e.pt]) : points[e.pt]; accPt = addComplete(accPt, v); } return accPt; };
    const vals = partials.map(pieceVal);

    // replay combine sequential affine add (linked-list order ~= emission order;
    // dx==0 is order-sensitive, but a structural duplicate/neg shows in any order).
    let dxZeroHere = false; let collide = null;
    let accPt = vals[0];
    for (let i = 1; i < vals.length; i++) {
      if (accPt.x === vals[i].x) { dxZeroHere = true; collide = { i, accIsNeg: ptEq(accPt, negate(vals[i])), accEq: ptEq(accPt, vals[i]) }; }
      const r = affineAddRaw(accPt, vals[i]); accPt = r.pt;
    }
    // also check ALL unordered pairs for structural equality / negation
    let pairDup = 0, pairNeg = 0;
    for (let i = 0; i < vals.length; i++) for (let j = i + 1; j < vals.length; j++) {
      if (ptEq(vals[i], vals[j])) pairDup++; else if (vals[i].x === vals[j].x) pairNeg++;
    }

    const refAff = affSum(list.map((e) => (e.neg ? negate(points[e.pt]) : points[e.pt])));
    const combineOk = ptEq(accPt, refAff);
    if (dxZeroHere) bucketsWithDxZero++;
    if (!combineOk || !onCurve(accPt)) offCurveBuckets++;
    if (dxZeroHere || overlap || gap || pairDup || pairNeg || (sums.length && partials.length)) {
      reports.push({ b, count, nPartials: partials.length, overlap, gap, pairDup, pairNeg, sums: sums.length, dxZeroHere, collide, combineOk, ranges: partials.map((p) => [p.lo, p.hi, p.task]) });
    }
  }

  // GPU slot-space model: ba_walker_partials_index scans ALL
  // 2*streamNumThreads*S partial slots, but the walker is indirect-dispatched
  // over only numActive (= nwg*256) threads. clearBuffer zero-fills
  // walkerPartialDest, yet NO_BUCKET = 0xffffffff — so every slot owned by a
  // NON-dispatched thread reads as bucket_id 0 and is linked into bucket 0's
  // combine list with partials_buf = (0,0) (off-curve, from the same zero
  // clear). Count those, and the node-counter pressure vs max_nodes.
  const STREAM_NUM_THREADS = 8192;
  const totalSlots = 2 * STREAM_NUM_THREADS * S;          // = max_nodes
  const dispatchedSlots = 2 * Math.min(numActive, STREAM_NUM_THREADS) * S;
  const staleSlots = totalSlots - dispatchedSlots;        // -> all linked to bucket 0 as (0,0)
  let realPartialSlots = 0; for (const ps of pieces.values()) realPartialSlots += ps.filter((p) => p.kind === 'partial').length;
  const nodeOverflow = realPartialSlots + staleSlots > totalSlots; // node_counter vs max_nodes
  const bucket0Dense = (buckets.get(0)?.length ?? 0) >= 2;
  console.log(`  GPU-slots: totalSlots(max_nodes)=${totalSlots} dispatched=${dispatchedSlots} stale->bucket0=${staleSlots} realPartialSlots=${realPartialSlots} nodeCounter=${realPartialSlots + staleSlots} overflow=${nodeOverflow} bucket0Dense=${bucket0Dense}`);
  if (staleSlots > 0) console.log(`  => bucket 0 combine list gets ${staleSlots} off-curve (0,0) nodes -> dx==0 + off-curve bucket value (clearBuffer 0 != NO_BUCKET 0xffffffff)`);
  console.log(`  contents: dupPairs=${contentsDup} negPairs=${contentsNegPair}  numDense=${numDense} totalAdds=${totalAdds} nwg=${nwg} numActive=${numActive}`);
  console.log(`  combine: dxZeroBuckets=${bucketsWithDxZero} offCurveBuckets=${offCurveBuckets} overlapBuckets=${overlapBuckets} gapBuckets=${gapBuckets} mixedSumPartial=${mixedSumPartial}`);
  for (const r of reports.slice(0, 12)) {
    console.log(`   bucket ${r.b} count=${r.count} nPartials=${r.nPartials} overlap=${r.overlap} gap=${r.gap} pairDup=${r.pairDup} pairNeg=${r.pairNeg} sums=${r.sums} dxZero=${r.dxZeroHere} combineOk=${r.combineOk}`);
    console.log(`     partial ranges: ${JSON.stringify(r.ranges)}`);
    if (r.collide) console.log(`     collide: ${JSON.stringify(r.collide)}`);
  }
  return { bucketsWithDxZero, offCurveBuckets, overlapBuckets, gapBuckets, mixedSumPartial, contentsDup, contentsNegPair, reports };
}

if (process.argv[2] === 'sweep') {
  // Fast structural sweep across logn 8..16 and many seeds. Flags any bucket
  // with a range overlap (double-count), gap, mixed sum+partial, or a
  // contents-level duplicate / sign-collision — the structural root causes.
  let totalFlag = 0;
  for (let logN = 8; logN <= 16; logN++) {
    for (let seed = 1; seed <= 25; seed++) {
      const r = run(logN, seed, true);
      const flags = r.overlapBuckets + r.gapBuckets + r.mixedSumPartial + r.contentsDup + r.contentsNegPair;
      totalFlag += flags;
      if (flags > 0) {
        console.log(`FLAG logN=${logN} seed=${seed} overlap=${r.overlapBuckets} gap=${r.gapBuckets} mixed=${r.mixedSumPartial} cDup=${r.contentsDup} cNeg=${r.contentsNegPair}`);
        for (const rep of r.reports.slice(0, 4)) console.log(`   bucket ${rep.b} count=${rep.count} ranges=${JSON.stringify(rep.ranges)} overlap=${rep.overlap} gap=${rep.gap} sums=${rep.sums}`);
      }
    }
    console.log(`logN=${logN}: swept 25 seeds, cumulative structural flags=${totalFlag}`);
  }
  console.log(totalFlag === 0 ? 'SWEEP CLEAN: no structural double-count / sign-collision in the walker+combine LOGIC.' : `SWEEP FOUND ${totalFlag} structural flags.`);
} else {
  const logN = parseInt(process.argv[2] ?? '8', 10);
  const seed = parseInt(process.argv[3] ?? '1', 10);
  run(logN, seed, false);
}
