// Standalone reference test for the Jacobian (S, W) bucket-reduction tree.
//
// Verifies in bigint that the recursive (S, W) merge formula computes
// L_w = Σ k · B_w[k] for k = 1..N, exactly matching a naive scalar-multiply
// reference. No WebGPU dependency.
//
// Run: node src/msm_webgpu/jbr_reference.test.mjs

import { bn254 } from '@noble/curves/bn254';

const FP = bn254.G1.CURVE.Fp.ORDER;
const Fr = bn254.G1.CURVE.Fp; // bn254 base-field (where coordinates live)
const G = bn254.G1.ProjectivePoint.BASE; // a known generator

const fmul = (a, b) => Fr.mul(a, b);
const fsub = (a, b) => Fr.sub(a, b);
const fadd = (a, b) => Fr.add(a, b);

// Jacobian doubling, a = 0 (EFD dbl-2009-l).
function jacDouble(P) {
  const { x, y, z } = P;
  const A = fmul(x, x);
  const B = fmul(y, y);
  const Bsq = fmul(B, B);
  const xB = fadd(x, B);
  const s = fsub(fmul(xB, xB), fadd(A, Bsq));
  const D = fadd(s, s);
  const E = fadd(fadd(A, A), A);
  const X3 = fsub(fmul(E, E), fadd(D, D));
  const Bsq8 = fadd(fadd(fadd(Bsq, Bsq), fadd(Bsq, Bsq)), fadd(fadd(Bsq, Bsq), fadd(Bsq, Bsq)));
  const Y3 = fsub(fmul(E, fsub(D, X3)), Bsq8);
  const yz = fmul(y, z);
  const Z3 = fadd(yz, yz);
  return { x: X3, y: Y3, z: Z3 };
}

// Jacobian + Jacobian add, a = 0 (EFD add-2007-bl).
function jacAdd(P, Q) {
  if (P.z === 0n) return Q;
  if (Q.z === 0n) return P;
  const Z1Z1 = fmul(P.z, P.z);
  const Z2Z2 = fmul(Q.z, Q.z);
  const U1 = fmul(P.x, Z2Z2);
  const U2 = fmul(Q.x, Z1Z1);
  const S1 = fmul(fmul(P.y, Q.z), Z2Z2);
  const S2 = fmul(fmul(Q.y, P.z), Z1Z1);
  const H = fsub(U2, U1);
  const twoH = fadd(H, H);
  const I = fmul(twoH, twoH);
  const J = fmul(H, I);
  const r = fadd(fsub(S2, S1), fsub(S2, S1));
  const V = fmul(U1, I);
  const X3 = fsub(fsub(fmul(r, r), J), fadd(V, V));
  const Y3 = fsub(fmul(r, fsub(V, X3)), fadd(fmul(S1, J), fmul(S1, J)));
  const zSum = fadd(P.z, Q.z);
  const Z3 = fmul(fsub(fsub(fmul(zSum, zSum), Z1Z1), Z2Z2), H);
  return { x: X3, y: Y3, z: Z3 };
}

// AA -> J via mmadd-2007-bl (both Z = 1).
function aaToJac(P, Q) {
  const H = fsub(Q.x, P.x);
  const HH = fmul(H, H);
  const I = fadd(fadd(HH, HH), fadd(HH, HH));
  const J = fmul(H, I);
  const r = fadd(fsub(Q.y, P.y), fsub(Q.y, P.y));
  const V = fmul(P.x, I);
  const X3 = fsub(fsub(fmul(r, r), J), fadd(V, V));
  const Y3 = fsub(fmul(r, fsub(V, X3)), fadd(fmul(P.y, J), fmul(P.y, J)));
  const Z3 = fadd(H, H);
  return { x: X3, y: Y3, z: Z3 };
}

// JA -> J (Jacobian + affine, madd-2007-bl).
function jaToJac(P, Q) {
  const Z1Z1 = fmul(P.z, P.z);
  const U2 = fmul(Q.x, Z1Z1);
  const S2 = fmul(fmul(Q.y, P.z), Z1Z1);
  const H = fsub(U2, P.x);
  const HH = fmul(H, H);
  const I = fadd(fadd(HH, HH), fadd(HH, HH));
  const J = fmul(H, I);
  const r = fadd(fsub(S2, P.y), fsub(S2, P.y));
  const V = fmul(P.x, I);
  const X3 = fsub(fsub(fmul(r, r), J), fadd(V, V));
  const Y3 = fsub(fmul(r, fsub(V, X3)), fadd(fmul(P.y, J), fmul(P.y, J)));
  const zPlusH = fadd(P.z, H);
  const Z3 = fsub(fsub(fmul(zPlusH, zPlusH), Z1Z1), HH);
  return { x: X3, y: Y3, z: Z3 };
}

function jacToAff(P) {
  if (P.z === 0n) return null;
  const zInv = Fr.inv(P.z);
  const zInv2 = fmul(zInv, zInv);
  return { x: fmul(P.x, zInv2), y: fmul(P.y, fmul(zInv2, zInv)) };
}

function jacEq(P, Q) {
  const a = jacToAff(P);
  const b = jacToAff(Q);
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.x === b.x && a.y === b.y;
}

// Reference: L_w = Σ k * B[k] for k = 1..N, computed via noble's group ops.
// Empty buckets ({x:0,y:0}) contribute nothing — they're not valid curve
// points, so the reference skips them and the tree algorithm must too.
function refScalarMul(buckets) {
  let acc = bn254.G1.ProjectivePoint.ZERO;
  for (let k = 1; k <= buckets.length; k++) {
    const B = buckets[k - 1];
    if (B.x === 0n && B.y === 0n) continue;
    const p = bn254.G1.ProjectivePoint.fromAffine(B);
    acc = acc.add(p.multiply(BigInt(k)));
  }
  return acc.equals(bn254.G1.ProjectivePoint.ZERO) ? null : acc.toAffine();
}

const INF = { x: 0n, y: 0n, z: 0n };
const isInf = P => P.z === 0n;
function jacAddSafe(P, Q) {
  if (isInf(P)) return Q;
  if (isInf(Q)) return P;
  return jacAdd(P, Q);
}
function jacDoubleSafe(P) {
  return isInf(P) ? P : jacDouble(P);
}

const ONE = 1n; // affine Z = 1
function affEq(P, Q) {
  return P === null && Q === null ? true : P !== null && Q !== null && P.x === Q.x && P.y === Q.y;
}
function isAffEmpty(B) {
  return B.x === 0n && B.y === 0n;
}

// Algorithm under test: (S, W) tree reduction with empty-bucket handling.
//  - Round 0 (leaf): pair (B[2p+1], B[2p+2]) into (S, W) Jacobian, with
//    case-split for emptiness (both empty -> inf, one empty -> lift, both
//    full -> mmadd + madd).
//  - Round r >= 1: merge with case-split on is_present.
function refRangeW(buckets, lo, hi) {
  // Reference W for absolute bucket range [lo, hi] (1-based), with local
  // positions 1..(hi-lo+1). Returns affine or null (empty).
  let acc = bn254.G1.ProjectivePoint.ZERO;
  for (let k = lo; k <= hi; k++) {
    const B = buckets[k - 1];
    if (B.x === 0n && B.y === 0n) continue;
    const pos = BigInt(k - lo + 1);
    acc = acc.add(bn254.G1.ProjectivePoint.fromAffine(B).multiply(pos));
  }
  return acc.equals(bn254.G1.ProjectivePoint.ZERO) ? null : acc.toAffine();
}
function refRangeS(buckets, lo, hi) {
  let acc = bn254.G1.ProjectivePoint.ZERO;
  for (let k = lo; k <= hi; k++) {
    const B = buckets[k - 1];
    if (B.x === 0n && B.y === 0n) continue;
    acc = acc.add(bn254.G1.ProjectivePoint.fromAffine(B));
  }
  return acc.equals(bn254.G1.ProjectivePoint.ZERO) ? null : acc.toAffine();
}

function treeReduceWindow(buckets, debug = false) {
  const N = buckets.length;
  if ((N & (N - 1)) !== 0) throw new Error(`N must be a power of two, got ${N}`);

  // Round 0: AA -> J pairs of (S, W).
  // unitp = 0 means "not a unit subtree" (>= 2 buckets, or empty); a positive
  // value means "exactly one bucket at relative position unitp in this node's
  // range." Case 10 leaves a unit at p=1; case 01 leaves a unit at p=2 (Q is
  // the right element of the pair).
  let nodes = [];
  for (let p = 0; p < N / 2; p++) {
    const P = buckets[2 * p];
    const Q = buckets[2 * p + 1];
    const pe = !isAffEmpty(P);
    const qe = !isAffEmpty(Q);
    if (!pe && !qe) {
      nodes.push({ S: INF, W: INF, present: false, unitp: 0 });
    } else if (pe && !qe) {
      const liftP = { x: P.x, y: P.y, z: ONE };
      nodes.push({ S: liftP, W: liftP, present: true, unitp: 1 });
    } else if (!pe && qe) {
      const liftQ = { x: Q.x, y: Q.y, z: ONE };
      nodes.push({ S: liftQ, W: jacDouble(liftQ), present: true, unitp: 2 });
    } else {
      const S = aaToJac(P, Q);
      const W = jaToJac(S, Q);
      nodes.push({ S, W, present: true, unitp: 0 });
    }
  }

  if (debug) {
    const h0 = 2;
    for (let i = 0; i < nodes.length; i++) {
      const lo = i * h0 + 1;
      const hi = lo + h0 - 1;
      const got = nodes[i].present ? jacToAff(nodes[i].W) : null;
      const want = refRangeW(buckets, lo, hi);
      const ok = affEq(got, want);
      if (!ok) console.log(`  round0 node ${i} (range [${lo},${hi}]) W MISMATCH`);
    }
  }
  // Rounds r >= 1: JJ -> J with presence.
  let r = 1;
  while (nodes.length > 1) {
    const next = [];
    const h = 1 << r;
    for (let i = 0; i < nodes.length; i += 2) {
      const L = nodes[i];
      const R = nodes[i + 1];
      if (!L.present && !R.present) {
        next.push({ S: INF, W: INF, present: false, unitp: 0 });
      } else if (L.present && !R.present) {
        next.push({ S: L.S, W: L.W, present: true, unitp: L.unitp });
      } else if (!L.present && R.present) {
        // Case (0, 1). The pathological sub-case is "R is a single-bucket
        // subtree with that bucket at R-local position h (= 2^r)" — then
        // h * R.S and R.W are both the Jacobian form of the SAME 2^r · B[k]
        // and the standard jacAdd hits the doubling case. Detect via unitp
        // and use jacDouble(R.W) for the shortcut; otherwise the usual
        // formula is safe (either R is multi-bucket so the two operands
        // mix different generators, or R is unit with h != p_R so the two
        // scalar multiples are distinct group elements).
        let W;
        if (R.unitp !== 0 && R.unitp === h) {
          W = jacDouble(R.W);
        } else {
          let hSr = R.S;
          for (let k = 0; k < r; k++) hSr = jacDouble(hSr);
          W = jacAddSafe(hSr, R.W);
        }
        const unitp = R.unitp !== 0 ? h + R.unitp : 0;
        next.push({ S: R.S, W, present: true, unitp });
      } else {
        const S = jacAdd(L.S, R.S);
        let hSr = R.S;
        for (let k = 0; k < r; k++) hSr = jacDouble(hSr);
        const Wtmp = jacAdd(L.W, hSr);
        const W = jacAdd(Wtmp, R.W);
        next.push({ S, W, present: true, unitp: 0 });
      }
    }
    nodes = next;
    if (debug) {
      const hi_size = 1 << (r + 1); // each new node covers 2^(r+1) buckets
      for (let i = 0; i < nodes.length; i++) {
        const lo = i * hi_size + 1;
        const hi = lo + hi_size - 1;
        const gotW = nodes[i].present ? jacToAff(nodes[i].W) : null;
        const wantW = refRangeW(buckets, lo, hi);
        const gotS = nodes[i].present ? jacToAff(nodes[i].S) : null;
        const wantS = refRangeS(buckets, lo, hi);
        const okW = affEq(gotW, wantW);
        const okS = affEq(gotS, wantS);
        if (!okW || !okS) console.log(`  round${r} node ${i} (range [${lo},${hi}]) W=${okW?'ok':'BAD'} S=${okS?'ok':'BAD'}`);
      }
    }
    r++;
  }

  return nodes[0];
}

function makeRandomBuckets(N) {
  // Use distinct multiples of G so coordinates are randomly independent.
  const buckets = [];
  for (let k = 1; k <= N; k++) {
    // Scalar derived from k so result is reproducible.
    const s = BigInt(0x9e3779b97f4a7c15n + BigInt(k) * 1009n);
    const P = G.multiply(s).toAffine();
    buckets.push({ x: P.x, y: P.y });
  }
  return buckets;
}

// Returns a copy with the listed (1-based) bucket indices zeroed out.
function withEmpties(buckets, emptyKs) {
  const out = buckets.map(b => ({ x: b.x, y: b.y }));
  for (const k of emptyKs) out[k - 1] = { x: 0n, y: 0n };
  return out;
}

function runOne(c, label, emptyKs = []) {
  const N = 1 << (c - 1);
  const buckets = withEmpties(makeRandomBuckets(N), emptyKs);
  const ref = refScalarMul(buckets);
  const tree = treeReduceWindow(buckets, /* debug */ true);
  const treeAff = tree.present ? jacToAff(tree.W) : null;
  const ok = affEq(ref, treeAff);
  console.log(`c=${c} ${label}: ${ok ? 'OK' : 'FAIL'}`);
  if (!ok) {
    console.log('  expected:', ref);
    console.log('  got:', treeAff);
    // Probe the simpler check: sum of S (un-weighted) should match Σ B[k].
    let refS = bn254.G1.ProjectivePoint.ZERO;
    for (const B of buckets) {
      if (B.x === 0n && B.y === 0n) continue;
      refS = refS.add(bn254.G1.ProjectivePoint.fromAffine(B));
    }
    const refSAff = refS.equals(bn254.G1.ProjectivePoint.ZERO) ? null : refS.toAffine();
    const treeS = tree.present ? jacToAff(tree.S) : null;
    console.log('  S-check refS:', refSAff);
    console.log('  S-check treeS:', treeS);
  }
  return ok;
}

let allOk = true;
for (const c of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  if (!runOne(c, 'all-present')) allOk = false;
}
// Empty-bucket edge cases — must match the reference (skipping empties).
const N8 = 1 << 7;
if (!runOne(8, 'top-empty', [N8])) allOk = false;                                         // last bucket only
if (!runOne(8, 'first-empty', [1])) allOk = false;                                        // first bucket only
if (!runOne(8, 'sparse-top', [N8, N8 - 1, N8 - 2, N8 - 3])) allOk = false;                // top quartet empty
if (!runOne(8, 'sparse-mid', [60, 61, 62, 63, 64, 65, 66, 67])) allOk = false;            // mid-range
if (!runOne(8, 'alternating', Array.from({ length: 64 }, (_, i) => 2 * i + 1))) allOk = false; // all odd k
if (!runOne(8, 'all-empty', Array.from({ length: N8 }, (_, i) => i + 1))) allOk = false;  // every bucket empty
process.exit(allOk ? 0 : 1);
