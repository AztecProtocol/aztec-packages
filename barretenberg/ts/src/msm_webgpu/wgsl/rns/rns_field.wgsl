// rns_field.wgsl — hand-written RNS F_q modular multiplication for BN254 (per-thread).
// DOUBLE-MONTGOMERY: per-residue Montgomery reduction (rns_montred) for every elementwise
// multiply — ~6 ops to a canonical residue — and plain pseudo-Mersenne reduction
// (rns_plain) for the two base-extension matvecs. Residues are in per-residue Montgomery
// form [R], R=2^13. Constants come from the committed, test-proven rns_constants.wgsl;
// mirrors the BigInt oracle in rns_params.mjs (byte-identical on-device).

struct Rns2 {
  m: array<u32, RNS_T>,
  n: array<u32, RNS_T>,
};

// Per-residue Montgomery reduce: t < m*R (≈2^26) -> canonical [0, m). minv = -m^{-1} mod R.
// q makes (t + q*m) divisible by R; the quotient is t*R^{-1} mod m, < 2m, then one or two
// conditional subtractions canonicalise. This is the cheap reduction for the multiplies.
// Inputs are always < m*R (a,b < m -> a*b < m^2 < m*R since m < 2^13=R), so the Montgomery
// quotient is < 2m and ONE conditional subtract canonicalises. No second (dead) subtract.
fn rns_montred(t: u32, m: u32, minv: u32) -> u32 {
  let q = ((t & 0x1fffu) * minv) & 0x1fffu;
  var r = (t + q * m) >> 13u;
  if (r >= m) { r -= m; }
  return r;
}
fn rns_mulmont(a: u32, b: u32, m: u32, minv: u32) -> u32 { return rns_montred(a * b, m, minv); }

// Fold/subtract counts are the EXACT minimum from the per-output accumulator bound
// (rns_params.test.mjs asserts them analytically, never by sampling):
//   M->N matvec: acc_max = 2^29.49 -> 3 folds reach < 3m -> 2 subtracts.
//   N->M matvec: acc_max = 2^29.65 -> 3 folds reach < 2m -> 1 subtract (rns_plain_nm).
//   t-step (qp+sN < 2n)            -> 1 fold reaches < 2m -> 1 subtract.
fn rns_plain(x: u32, m: u32, z: u32) -> u32 {
  var t = (x & 0x1fffu) + (x >> 13u) * z;
  t = (t & 0x1fffu) + (t >> 13u) * z;
  t = (t & 0x1fffu) + (t >> 13u) * z;
  if (t >= m) { t -= m; }
  if (t >= m) { t -= m; }
  return t;
}
fn rns_plain_nm(x: u32, m: u32, z: u32) -> u32 {
  var t = (x & 0x1fffu) + (x >> 13u) * z;
  t = (t & 0x1fffu) + (t >> 13u) * z;
  t = (t & 0x1fffu) + (t >> 13u) * z;
  if (t >= m) { t -= m; }
  return t;
}
fn rns_plain_small(x: u32, m: u32, z: u32) -> u32 {
  var t = (x & 0x1fffu) + (x >> 13u) * z;
  if (t >= m) { t -= m; }
  return t;
}

// a*b*M^{-1} mod p. Inputs/outputs in per-residue [R] Montgomery form, both bases.
fn rns_modmul(a: Rns2, b: Rns2) -> Rns2 {
  var sM: array<u32, RNS_T>;
  var sN: array<u32, RNS_T>;
  for (var i = 0u; i < RNS_T; i++) { sM[i] = rns_mulmont(a.m[i], b.m[i], RNS_M_MOD[i], MONT_MINV_M[i]); }
  for (var j = 0u; j < RNS_T; j++) { sN[j] = rns_mulmont(a.n[j], b.n[j], RNS_N_MOD[j], MONT_MINV_N[j]); }

  // xi = q's CRT digit, NORMAL form (PRE_M un-scaled, so the montgomery R^{-1} cancels sM's R).
  var xi: array<u32, RNS_T>;
  var rank: u32 = 0u;
  for (var i = 0u; i < RNS_T; i++) {
    xi[i] = rns_mulmont(sM[i], PRE_M[i], RNS_M_MOD[i], MONT_MINV_M[i]);
    rank += xi[i] * RANK_W_M[i];
  }
  let kM = rank >> RNS_RANK_F;

  // Base extension M->N (plain reduce; A/C scaled by R -> qN lands in [R] form).
  var qN: array<u32, RNS_T>;
  for (var j = 0u; j < RNS_T; j++) {
    var acc = kM * CRNS_C_MN[j];
    for (var i = 0u; i < RNS_T; i++) { acc += xi[i] * CRNS_A_MN[i * RNS_T + j]; }
    qN[j] = rns_plain(acc, RNS_N_MOD[j], RNS_N_Z[j]);
  }

  // r = (s + q*p) * M^{-1} in base N; rN output [R], eta is the second NORMAL CRT digit.
  var rN: array<u32, RNS_T>;
  var eta: array<u32, RNS_T>;
  var rank2: u32 = RNS_RANK_ALPHA;
  for (var j = 0u; j < RNS_T; j++) {
    let qp = rns_mulmont(qN[j], P_MOD_N_R[j], RNS_N_MOD[j], MONT_MINV_N[j]);
    let t = rns_plain_small(qp + sN[j], RNS_N_MOD[j], RNS_N_Z[j]);
    rN[j] = rns_mulmont(t, M_INV_N_R[j], RNS_N_MOD[j], MONT_MINV_N[j]);
    eta[j] = rns_mulmont(rN[j], NDI_N[j], RNS_N_MOD[j], MONT_MINV_N[j]);
    rank2 += eta[j] * RANK_W_N[j];
  }
  let kN = rank2 >> RNS_RANK_F;

  // Base extension N->M (plain reduce; A/C scaled by R -> rM lands in [R] form). Output.
  var out: Rns2;
  for (var i = 0u; i < RNS_T; i++) {
    var acc = kN * CRNS_C_NM[i];
    for (var j = 0u; j < RNS_T; j++) { acc += eta[j] * CRNS_A_NM[j * RNS_T + i]; }
    out.m[i] = rns_plain_nm(acc, RNS_M_MOD[i], RNS_M_Z[i]);
  }
  out.n = rN;
  return out;
}
