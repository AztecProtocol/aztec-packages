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
function refScalarMul(buckets) {
  let acc = bn254.G1.ProjectivePoint.ZERO;
  for (let k = 1; k <= buckets.length; k++) {
    const B = buckets[k - 1];
    const p = bn254.G1.ProjectivePoint.fromAffine(B);
    acc = acc.add(p.multiply(BigInt(k)));
  }
  return acc.toAffine();
}

// Algorithm under test: (S, W) tree reduction.
//  - Round 0 (leaf): pair (B[2p+1], B[2p+2]) -> (S, W) Jacobian.
//  - Round r >= 1: merge two adjacent (S_L, W_L), (S_R, W_R) Jacobian pairs.
//    S = S_L + S_R; hS_R = double S_R r times; W = W_L + hS_R + W_R.
// Root's W = L_w.
function treeReduceWindow(buckets) {
  const N = buckets.length;
  if ((N & (N - 1)) !== 0) throw new Error(`N must be a power of two, got ${N}`);

  // Round 0: AA -> J pairs of (S, W).
  let nodes = [];
  for (let p = 0; p < N / 2; p++) {
    const P = buckets[2 * p];     // 0-indexed = original bucket B[2p+1]
    const Q = buckets[2 * p + 1]; // = B[2p+2]
    const S = aaToJac(P, Q);
    const W = jaToJac(S, Q);      // W = 1*P + 2*Q = S + Q (Jacobian + affine)
    nodes.push({ S, W });
  }

  // Rounds r >= 1: JJ -> J.
  let r = 1;
  while (nodes.length > 1) {
    const next = [];
    for (let i = 0; i < nodes.length; i += 2) {
      const L = nodes[i];
      const R = nodes[i + 1];
      const S = jacAdd(L.S, R.S);
      let hSr = R.S;
      for (let k = 0; k < r; k++) hSr = jacDouble(hSr);
      const Wtmp = jacAdd(L.W, hSr);
      const W = jacAdd(Wtmp, R.W);
      next.push({ S, W });
    }
    nodes = next;
    r++;
  }

  return nodes[0].W;
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

function runOne(c) {
  const N = 1 << (c - 1);
  const buckets = makeRandomBuckets(N);
  const ref = refScalarMul(buckets);
  const treeJac = treeReduceWindow(buckets);
  const treeAff = jacToAff(treeJac);
  const ok = treeAff !== null && ref.x === treeAff.x && ref.y === treeAff.y;
  console.log(`c=${c} N=${N}: ${ok ? 'OK' : 'FAIL'}`);
  if (!ok) {
    console.log('  expected:', ref);
    console.log('  got:', treeAff);
  }
  return ok;
}

let allOk = true;
for (const c of [2, 3, 4, 5, 6, 7, 8, 9, 10]) {
  if (!runOne(c)) allOk = false;
}
process.exit(allOk ? 0 : 1);
