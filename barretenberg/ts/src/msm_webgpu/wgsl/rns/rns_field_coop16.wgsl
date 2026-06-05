// rns_field_coop16.wgsl — 16-lane cooperative RNS modmul, t=16 / 16-bit odd moduli, double-
// Montgomery (R = 2^16). One residue per lane; an Apple subgroup (32) runs two modmuls, a Mali
// subgroup (16) runs one. Built for the THREAD-STARVED regime: it spends 16x the threads of a
// solo CIOS montmul to cut per-modmul latency, winning ~4x at M<=128 on M-series.
//
// Each base extension (the modular reduction = "twice a matrix multiply"):
// - SELECT-FREE butterfly all-gather: 15 subgroupShuffleXor leave lane r holding g[k]=digit(r^k)
//   in natural XOR order; the matvec/rank read XOR-permuted committed constants (CRNS_*_PERM),
//   so the gather needs zero reorder selects.
// - COOPERATIVE rank: the CRT rank k=Σ_j digit_j·W_j is one scalar shared by all lanes, so it is
//   a 4-deep subgroupShuffleXor butterfly-reduce of digit·W_self (1 mul/lane), not a redundant
//   16-mul dot product on every lane. The reduce overlaps the gather (both fan out from dig).
// - FOLD-P ext1: (P mod n) is folded into ext1's matrix/correction (CRNS_A_MN_P_PERM/CRNS_C_MN_P)
//   so it emits qp = qN·p directly, removing the qp = montred(qN·P_MOD_N_R) reduce from the spine.
// Fold/subtract counts in montred16/red_mn/red_nm/red17 are the EXACT analytical minima for this
// basis, proven sound (foldUB recurrence over the value range) by foldBoundsOk16 in rns_params.mjs.
// Mirrors the BigInt oracle there (RNS_T=16 RNS_W=16 RNS_RANK_F=27); validated byte-identical.

override CHAIN: u32 = 1u;

struct C16 { m: u32, n: u32 };

fn montred16(t: u32, m: u32, minv: u32) -> u32 {
  let tlo = t & 0xffffu;
  let q = (tlo * minv) & 0xffffu;
  let qm = q * m;
  var r = (t >> 16u) + (qm >> 16u) + u32(tlo != 0u);
  if (r >= m) { r -= m; }
  return r;
}

fn red_mn(x: u32, m: u32, z: u32) -> u32 {
  var t = (x & 0xffffu) + (x >> 16u) * z;
  t = (t & 0xffffu) + (t >> 16u) * z;
  if (t >= m) { t -= m; }
  return t;
}
fn red_nm(x: u32, m: u32, z: u32) -> u32 {
  var t = (x & 0xffffu) + (x >> 16u) * z;
  if (t >= m) { t -= m; }
  if (t >= m) { t -= m; }
  return t;
}
// t-step canonicalisation of qp + sN. Both addends are already canonical (< n), so the sum is
// < 2n and ONE conditional subtract suffices — no fold. The relevant bound is 2n (not 2^17):
// 2n - n = n - 2 < n. Proven minimal by foldBoundsOk16.
fn red17(x: u32, m: u32) -> u32 {
  if (x >= m) { return x - m; }
  return x;
}

fn coop16_ext_mn(dig: u32, r: u32, alpha: u32, dm: u32, dz: u32) -> u32 {
  let g0 = dig;
  let g1 = subgroupShuffleXor(g0, 1u);
  let g2 = subgroupShuffleXor(g0, 2u);
  let g3 = subgroupShuffleXor(g1, 2u);
  let g4 = subgroupShuffleXor(g0, 4u);
  let g5 = subgroupShuffleXor(g1, 4u);
  let g6 = subgroupShuffleXor(g2, 4u);
  let g7 = subgroupShuffleXor(g3, 4u);
  let g8 = subgroupShuffleXor(g0, 8u);
  let g9 = subgroupShuffleXor(g1, 8u);
  let g10 = subgroupShuffleXor(g2, 8u);
  let g11 = subgroupShuffleXor(g3, 8u);
  let g12 = subgroupShuffleXor(g4, 8u);
  let g13 = subgroupShuffleXor(g5, 8u);
  let g14 = subgroupShuffleXor(g6, 8u);
  let g15 = subgroupShuffleXor(g7, 8u);
  // rank: one scalar for the whole group, butterfly-reduced (overlaps the gather above)
  var rk = dig * RANK_W_M[r];
  rk += subgroupShuffleXor(rk, 1u);
  rk += subgroupShuffleXor(rk, 2u);
  rk += subgroupShuffleXor(rk, 4u);
  rk += subgroupShuffleXor(rk, 8u);
  let kc = ((alpha + rk) >> RNS_RANK_F) * CRNS_C_MN[r];
  let b = r * 16u;
  let p0 = g0 * CRNS_A_MN_PERM[b];
  let p1 = g1 * CRNS_A_MN_PERM[b + 1u];
  let p2 = g2 * CRNS_A_MN_PERM[b + 2u];
  let p3 = g3 * CRNS_A_MN_PERM[b + 3u];
  let p4 = g4 * CRNS_A_MN_PERM[b + 4u];
  let p5 = g5 * CRNS_A_MN_PERM[b + 5u];
  let p6 = g6 * CRNS_A_MN_PERM[b + 6u];
  let p7 = g7 * CRNS_A_MN_PERM[b + 7u];
  let p8 = g8 * CRNS_A_MN_PERM[b + 8u];
  let p9 = g9 * CRNS_A_MN_PERM[b + 9u];
  let p10 = g10 * CRNS_A_MN_PERM[b + 10u];
  let p11 = g11 * CRNS_A_MN_PERM[b + 11u];
  let p12 = g12 * CRNS_A_MN_PERM[b + 12u];
  let p13 = g13 * CRNS_A_MN_PERM[b + 13u];
  let p14 = g14 * CRNS_A_MN_PERM[b + 14u];
  let p15 = g15 * CRNS_A_MN_PERM[b + 15u];
  let alo = (p0 & 0xffffu) + (p1 & 0xffffu) + (p2 & 0xffffu) + (p3 & 0xffffu) + (p4 & 0xffffu) + (p5 & 0xffffu) + (p6 & 0xffffu) + (p7 & 0xffffu) + (p8 & 0xffffu) + (p9 & 0xffffu) + (p10 & 0xffffu) + (p11 & 0xffffu) + (p12 & 0xffffu) + (p13 & 0xffffu) + (p14 & 0xffffu) + (p15 & 0xffffu) + (kc & 0xffffu);
  let ahi = (p0 >> 16u) + (p1 >> 16u) + (p2 >> 16u) + (p3 >> 16u) + (p4 >> 16u) + (p5 >> 16u) + (p6 >> 16u) + (p7 >> 16u) + (p8 >> 16u) + (p9 >> 16u) + (p10 >> 16u) + (p11 >> 16u) + (p12 >> 16u) + (p13 >> 16u) + (p14 >> 16u) + (p15 >> 16u) + (kc >> 16u);
  return red_mn(alo + ahi * dz, dm, dz);
}

fn coop16_ext_nm(dig: u32, r: u32, alpha: u32, dm: u32, dz: u32) -> u32 {
  let g0 = dig;
  let g1 = subgroupShuffleXor(g0, 1u);
  let g2 = subgroupShuffleXor(g0, 2u);
  let g3 = subgroupShuffleXor(g1, 2u);
  let g4 = subgroupShuffleXor(g0, 4u);
  let g5 = subgroupShuffleXor(g1, 4u);
  let g6 = subgroupShuffleXor(g2, 4u);
  let g7 = subgroupShuffleXor(g3, 4u);
  let g8 = subgroupShuffleXor(g0, 8u);
  let g9 = subgroupShuffleXor(g1, 8u);
  let g10 = subgroupShuffleXor(g2, 8u);
  let g11 = subgroupShuffleXor(g3, 8u);
  let g12 = subgroupShuffleXor(g4, 8u);
  let g13 = subgroupShuffleXor(g5, 8u);
  let g14 = subgroupShuffleXor(g6, 8u);
  let g15 = subgroupShuffleXor(g7, 8u);
  var rk = dig * RANK_W_N[r];
  rk += subgroupShuffleXor(rk, 1u);
  rk += subgroupShuffleXor(rk, 2u);
  rk += subgroupShuffleXor(rk, 4u);
  rk += subgroupShuffleXor(rk, 8u);
  let kc = ((alpha + rk) >> RNS_RANK_F) * CRNS_C_NM[r];
  let b = r * 16u;
  let p0 = g0 * CRNS_A_NM_PERM[b];
  let p1 = g1 * CRNS_A_NM_PERM[b + 1u];
  let p2 = g2 * CRNS_A_NM_PERM[b + 2u];
  let p3 = g3 * CRNS_A_NM_PERM[b + 3u];
  let p4 = g4 * CRNS_A_NM_PERM[b + 4u];
  let p5 = g5 * CRNS_A_NM_PERM[b + 5u];
  let p6 = g6 * CRNS_A_NM_PERM[b + 6u];
  let p7 = g7 * CRNS_A_NM_PERM[b + 7u];
  let p8 = g8 * CRNS_A_NM_PERM[b + 8u];
  let p9 = g9 * CRNS_A_NM_PERM[b + 9u];
  let p10 = g10 * CRNS_A_NM_PERM[b + 10u];
  let p11 = g11 * CRNS_A_NM_PERM[b + 11u];
  let p12 = g12 * CRNS_A_NM_PERM[b + 12u];
  let p13 = g13 * CRNS_A_NM_PERM[b + 13u];
  let p14 = g14 * CRNS_A_NM_PERM[b + 14u];
  let p15 = g15 * CRNS_A_NM_PERM[b + 15u];
  let alo = (p0 & 0xffffu) + (p1 & 0xffffu) + (p2 & 0xffffu) + (p3 & 0xffffu) + (p4 & 0xffffu) + (p5 & 0xffffu) + (p6 & 0xffffu) + (p7 & 0xffffu) + (p8 & 0xffffu) + (p9 & 0xffffu) + (p10 & 0xffffu) + (p11 & 0xffffu) + (p12 & 0xffffu) + (p13 & 0xffffu) + (p14 & 0xffffu) + (p15 & 0xffffu) + (kc & 0xffffu);
  let ahi = (p0 >> 16u) + (p1 >> 16u) + (p2 >> 16u) + (p3 >> 16u) + (p4 >> 16u) + (p5 >> 16u) + (p6 >> 16u) + (p7 >> 16u) + (p8 >> 16u) + (p9 >> 16u) + (p10 >> 16u) + (p11 >> 16u) + (p12 >> 16u) + (p13 >> 16u) + (p14 >> 16u) + (p15 >> 16u) + (kc >> 16u);
  return red_nm(alo + ahi * dz, dm, dz);
}

fn coop16_ext_mn_qp(dig: u32, r: u32, dm: u32, dz: u32) -> u32 {
  let g0 = dig;
  let g1 = subgroupShuffleXor(g0, 1u);
  let g2 = subgroupShuffleXor(g0, 2u);
  let g3 = subgroupShuffleXor(g1, 2u);
  let g4 = subgroupShuffleXor(g0, 4u);
  let g5 = subgroupShuffleXor(g1, 4u);
  let g6 = subgroupShuffleXor(g2, 4u);
  let g7 = subgroupShuffleXor(g3, 4u);
  let g8 = subgroupShuffleXor(g0, 8u);
  let g9 = subgroupShuffleXor(g1, 8u);
  let g10 = subgroupShuffleXor(g2, 8u);
  let g11 = subgroupShuffleXor(g3, 8u);
  let g12 = subgroupShuffleXor(g4, 8u);
  let g13 = subgroupShuffleXor(g5, 8u);
  let g14 = subgroupShuffleXor(g6, 8u);
  let g15 = subgroupShuffleXor(g7, 8u);
  var rk = dig * RANK_W_M[r];
  rk += subgroupShuffleXor(rk, 1u);
  rk += subgroupShuffleXor(rk, 2u);
  rk += subgroupShuffleXor(rk, 4u);
  rk += subgroupShuffleXor(rk, 8u);
  let kc = (rk >> RNS_RANK_F) * CRNS_C_MN_P[r];
  let b = r * 16u;
  let p0 = g0 * CRNS_A_MN_P_PERM[b];
  let p1 = g1 * CRNS_A_MN_P_PERM[b + 1u];
  let p2 = g2 * CRNS_A_MN_P_PERM[b + 2u];
  let p3 = g3 * CRNS_A_MN_P_PERM[b + 3u];
  let p4 = g4 * CRNS_A_MN_P_PERM[b + 4u];
  let p5 = g5 * CRNS_A_MN_P_PERM[b + 5u];
  let p6 = g6 * CRNS_A_MN_P_PERM[b + 6u];
  let p7 = g7 * CRNS_A_MN_P_PERM[b + 7u];
  let p8 = g8 * CRNS_A_MN_P_PERM[b + 8u];
  let p9 = g9 * CRNS_A_MN_P_PERM[b + 9u];
  let p10 = g10 * CRNS_A_MN_P_PERM[b + 10u];
  let p11 = g11 * CRNS_A_MN_P_PERM[b + 11u];
  let p12 = g12 * CRNS_A_MN_P_PERM[b + 12u];
  let p13 = g13 * CRNS_A_MN_P_PERM[b + 13u];
  let p14 = g14 * CRNS_A_MN_P_PERM[b + 14u];
  let p15 = g15 * CRNS_A_MN_P_PERM[b + 15u];
  let alo = (p0 & 0xffffu) + (p1 & 0xffffu) + (p2 & 0xffffu) + (p3 & 0xffffu) + (p4 & 0xffffu) + (p5 & 0xffffu) + (p6 & 0xffffu) + (p7 & 0xffffu) + (p8 & 0xffffu) + (p9 & 0xffffu) + (p10 & 0xffffu) + (p11 & 0xffffu) + (p12 & 0xffffu) + (p13 & 0xffffu) + (p14 & 0xffffu) + (p15 & 0xffffu) + (kc & 0xffffu);
  let ahi = (p0 >> 16u) + (p1 >> 16u) + (p2 >> 16u) + (p3 >> 16u) + (p4 >> 16u) + (p5 >> 16u) + (p6 >> 16u) + (p7 >> 16u) + (p8 >> 16u) + (p9 >> 16u) + (p10 >> 16u) + (p11 >> 16u) + (p12 >> 16u) + (p13 >> 16u) + (p14 >> 16u) + (p15 >> 16u) + (kc >> 16u);
  return red_mn(alo + ahi * dz, dm, dz);
}

fn coop16_modmul(am: u32, an: u32, bm: u32, bn: u32, r: u32) -> C16 {
  let m = RNS_M_MOD[r];  let mi = MONT_MINV_M[r];
  let n = RNS_N_MOD[r];  let ni = MONT_MINV_N[r];  let nz = RNS_N_Z[r];
  let sM = montred16(am * bm, m, mi);
  let sN = montred16(an * bn, n, ni);
  let xi = montred16(sM * PRE_M[r], m, mi);
  let qp = coop16_ext_mn_qp(xi, r, n, nz);
  let t = red17(qp + sN, n);
  let eta = montred16(t * MND_N[r], n, ni);
  let rM = coop16_ext_nm(eta, r, RNS_RANK_ALPHA, m, RNS_M_Z[r]);
  let rN = montred16(t * M_INV_N_R[r], n, ni);
  return C16(rM, rN);
}

@group(0) @binding(0) var<storage, read> ins: array<u32>;
@group(0) @binding(1) var<storage, read_write> outs: array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(subgroup_invocation_id) sgid: u32) {
  let nmm = arrayLength(&outs) / 32u;
  let mm = gid.x / 16u;
  let r = sgid & 15u;
  let inb = min(mm, nmm - 1u) * 64u;
  let bm = ins[inb + 32u + r];
  let bn = ins[inb + 48u + r];
  var cm = ins[inb + r];
  var cn = ins[inb + 16u + r];
  for (var k = 0u; k < CHAIN; k++) {
    let res = coop16_modmul(cm, cn, bm, bn, r);
    cm = res.m;
    cn = res.n;
  }
  if (mm < nmm) {
    let ob = mm * 32u;
    outs[ob + r] = cm;
    outs[ob + 16u + r] = cn;
  }
}
