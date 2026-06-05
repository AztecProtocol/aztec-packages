// rns_field_coop45.wgsl — 4-threads-per-montmul cooperative RNS (the operator's design).
// Each of 4 threads owns 5 of the 20 residues (4*5=20); a 32-wide subgroup runs 8 montmuls
// with ZERO idle lanes (4 | 16,32,64). Keeps w=13 (u32 matvec, no 64-bit) and the
// double-Montgomery reduction. The base-extension matvec gathers the 15 foreign digits once
// per thread (subgroupShuffle) and REUSES them across that thread's 5 outputs — ~6x less
// cross-lane traffic than 1-residue-per-lane. Constants from the committed rns_constants.wgsl;
// mirrors the BigInt oracle (byte-identical on-device).

struct R5 { m: array<u32, 5>, n: array<u32, 5> };
override CHAIN: u32 = 1u;

fn rns_montred(t: u32, m: u32, minv: u32) -> u32 {
  let q = ((t & 0x1fffu) * minv) & 0x1fffu;
  var r = (t + q * m) >> 13u;
  if (r >= m) { r -= m; }
  if (r >= m) { r -= m; }
  return r;
}
fn rns_plain(x: u32, m: u32, z: u32) -> u32 {
  var t = (x & 0x1fffu) + (x >> 13u) * z;
  t = (t & 0x1fffu) + (t >> 13u) * z;
  t = (t & 0x1fffu) + (t >> 13u) * z;
  if (t >= m) { t -= m; }
  if (t >= m) { t -= m; }
  return t;
}

// One cooperative montmul. This thread (tid in 0..3, group base lane `gb`) owns residue
// indices r0..r0+4. Returns this thread's 5 output residues in both bases.
fn coop45_modmul(am: array<u32, 5>, an: array<u32, 5>, bm: array<u32, 5>, bn: array<u32, 5>,
                 tid: u32, gb: u32, r0: u32) -> R5 {
  var sM: array<u32, 5>; var sN: array<u32, 5>; var xi: array<u32, 5>;
  var rp: u32 = 0u;
  for (var kk = 0u; kk < 5u; kk++) {
    let i = r0 + kk;
    sM[kk] = rns_montred(am[kk] * bm[kk], RNS_M_MOD[i], MONT_MINV_M[i]);
    sN[kk] = rns_montred(an[kk] * bn[kk], RNS_N_MOD[i], MONT_MINV_N[i]);
    xi[kk] = rns_montred(sM[kk] * PRE_M[i], RNS_M_MOD[i], MONT_MINV_M[i]);
    rp += xi[kk] * RANK_W_M[i];
  }
  // rank: 4-way butterfly sum (masks 1,2 stay inside the 4-aligned group)
  rp += subgroupShuffleXor(rp, 1u);
  rp += subgroupShuffleXor(rp, 2u);
  let kM = rp >> RNS_RANK_F;

  // matvec M->N: 5 outputs, gather all 20 xi (15 foreign), reuse across the 5 outputs.
  var acc: array<u32, 5>;
  for (var jj = 0u; jj < 5u; jj++) { acc[jj] = kM * CRNS_C_MN[r0 + jj]; }
  for (var tp = 0u; tp < 4u; tp++) {
    for (var kk = 0u; kk < 5u; kk++) {
      let xi_i = subgroupShuffle(xi[kk], gb + tp); // foreign (or own) digit at index tp*5+kk
      let i = tp * 5u + kk;
      for (var jj = 0u; jj < 5u; jj++) { acc[jj] += xi_i * CRNS_A_MN[i * RNS_T + (r0 + jj)]; }
    }
  }
  var qN: array<u32, 5>;
  for (var jj = 0u; jj < 5u; jj++) { qN[jj] = rns_plain(acc[jj], RNS_N_MOD[r0 + jj], RNS_N_Z[r0 + jj]); }

  // r = (s + q*p)*M^{-1} in base N; rN output, eta second digit.
  var rN: array<u32, 5>; var eta: array<u32, 5>;
  var rp2: u32 = 0u;
  for (var jj = 0u; jj < 5u; jj++) {
    let j = r0 + jj;
    let qp = rns_montred(qN[jj] * P_MOD_N_R[j], RNS_N_MOD[j], MONT_MINV_N[j]);
    let t = rns_plain(qp + sN[jj], RNS_N_MOD[j], RNS_N_Z[j]);
    rN[jj] = rns_montred(t * M_INV_N_R[j], RNS_N_MOD[j], MONT_MINV_N[j]);
    eta[jj] = rns_montred(rN[jj] * NDI_N[j], RNS_N_MOD[j], MONT_MINV_N[j]);
    rp2 += eta[jj] * RANK_W_N[j];
  }
  rp2 += subgroupShuffleXor(rp2, 1u);
  rp2 += subgroupShuffleXor(rp2, 2u);
  let kN = (rp2 + RNS_RANK_ALPHA) >> RNS_RANK_F;

  // matvec N->M: 5 outputs.
  var acc2: array<u32, 5>;
  for (var ii = 0u; ii < 5u; ii++) { acc2[ii] = kN * CRNS_C_NM[r0 + ii]; }
  for (var tp = 0u; tp < 4u; tp++) {
    for (var kk = 0u; kk < 5u; kk++) {
      let eta_j = subgroupShuffle(eta[kk], gb + tp);
      let j = tp * 5u + kk;
      for (var ii = 0u; ii < 5u; ii++) { acc2[ii] += eta_j * CRNS_A_NM[j * RNS_T + (r0 + ii)]; }
    }
  }
  var out: R5;
  for (var ii = 0u; ii < 5u; ii++) { out.m[ii] = rns_plain(acc2[ii], RNS_M_MOD[r0 + ii], RNS_M_Z[r0 + ii]); }
  out.n = rN;
  return out;
}

@group(0) @binding(0) var<storage, read> ins: array<u32>;
@group(0) @binding(1) var<storage, read_write> outs: array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(subgroup_invocation_id) sgid: u32) {
  let n = arrayLength(&outs) / 40u; // 40 u32 out per montmul (rM[20] ++ rN[20])
  let mm = gid.x / 4u;
  let tid = sgid & 3u;
  let gb = sgid & 4294967292u; // ~3u : 4-lane group base
  let r0 = tid * 5u;
  let inb = min(mm, n - 1u) * 80u; // 80 u32 in per montmul
  var am: array<u32, 5>; var an: array<u32, 5>; var bm: array<u32, 5>; var bn: array<u32, 5>;
  for (var kk = 0u; kk < 5u; kk++) {
    am[kk] = ins[inb + r0 + kk];
    an[kk] = ins[inb + 20u + r0 + kk];
    bm[kk] = ins[inb + 40u + r0 + kk];
    bn[kk] = ins[inb + 60u + r0 + kk];
  }
  var cm = am; var cn = an;
  for (var k = 0u; k < CHAIN; k++) {
    let res = coop45_modmul(cm, cn, bm, bn, tid, gb, r0);
    cm = res.m; cn = res.n;
  }
  if (mm < n) {
    let ob = mm * 40u;
    for (var kk = 0u; kk < 5u; kk++) { outs[ob + r0 + kk] = cm[kk]; outs[ob + 20u + r0 + kk] = cn[kk]; }
  }
}
