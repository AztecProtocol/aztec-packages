// rns_field_coop.wgsl — COOPERATIVE RNS F_q modmul. 16 lanes cooperate on one
// modular multiplication; each lane owns ONE residue index r in both bases. This is
// the SIMT-native RNS mapping: the inherently-parallel residues run on parallel lanes
// (not serialized in one thread), so register pressure per lane is ~O(1) and the
// O(t^2) base-extension matvec becomes a cross-lane gather + a per-lane O(t) dot
// product. Constants come from the committed rns_constants_16x16.wgsl (prepended);
// `enable subgroups;` is prepended by the loader. Mirrors the T=16/W=16 BigInt oracle.
//
// Lane mapping: r = subgroup_invocation_id & 15 (residue index); base = id & ~15
// (start of this lane's 16-group within the subgroup). On Apple (subgroup 32) two
// modmuls share a subgroup; on Mali (16) one does.

struct CoopRes { rm: u32, rn: u32 };

override CHAIN: u32 = 1u;

// Reduce x < 2^32 modulo m = 2^16 - z, using 2^16 == z (mod m). Three folds bring x
// below ~2^16; two conditional subtractions finish. Validated on-device byte-identical.
fn rns_reduce16(x: u32, m: u32, z: u32) -> u32 {
  var t = (x & 0xffffu) + (x >> 16u) * z;
  t = (t & 0xffffu) + (t >> 16u) * z;
  t = (t & 0xffffu) + (t >> 16u) * z;
  if (t >= m) { t -= m; }
  if (t >= m) { t -= m; }
  return t;
}
fn rns_mulmod16(a: u32, b: u32, m: u32, z: u32) -> u32 {
  return rns_reduce16(a * b, m, z); // a,b < 2^16 -> a*b < 2^32 (fits u32)
}

// One cooperative base extension. `xi` is this lane's CRT digit.
// Rank k = floor((alpha + sum_i xi_i*W_i) / 2^F) is a SINGLE value shared by all lanes,
// so it is computed once via a 4-stage subgroupShuffleXor butterfly reduction (masks
// 1,2,4,8 stay inside the 16-aligned group) — not recomputed per lane. The matvec gathers
// all t digits and accumulates this lane's output residue (col r of A) in a 64-bit
// accumulator (16 products of <2^32 sum to <2^36).
fn coop_extend(xi: u32, r: u32, base: u32, alpha: u32,
               is_mn: bool, dstm: u32, dstz: u32) -> u32 {
  // rank: butterfly all-reduce of this lane's term xi*W[r]
  var wr: u32; if (is_mn) { wr = RANK_W_M[r]; } else { wr = RANK_W_N[r]; }
  var s = xi * wr;
  s += subgroupShuffleXor(s, 1u);
  s += subgroupShuffleXor(s, 2u);
  s += subgroupShuffleXor(s, 4u);
  s += subgroupShuffleXor(s, 8u);
  let k = (s + alpha) >> RNS_RANK_F;
  // matvec: gather all xi, accumulate this lane's column
  var acc_lo: u32 = 0u;
  var acc_hi: u32 = 0u;
  for (var i = 0u; i < 16u; i++) {
    let xi_i = subgroupShuffle(xi, base + i);
    var aij: u32;
    if (is_mn) { aij = CRNS_A_MN[i * 16u + r]; } else { aij = CRNS_A_NM[i * 16u + r]; }
    let prod = xi_i * aij;
    let nl = acc_lo + prod;
    acc_hi += u32(nl < acc_lo);
    acc_lo = nl;
  }
  var cj: u32; if (is_mn) { cj = CRNS_C_MN[r]; } else { cj = CRNS_C_NM[r]; }
  let kc = k * cj;
  let nl2 = acc_lo + kc;
  acc_hi += u32(nl2 < acc_lo);
  acc_lo = nl2;
  // collapse 64-bit accumulator: x = hi36*2^16 + lo16, x == hi36*z + lo16 (mod m)
  let hi36 = (acc_hi << 16u) | (acc_lo >> 16u);
  return rns_reduce16((acc_lo & 0xffffu) + hi36 * dstz, dstm, dstz);
}

fn coop_modmul(am: u32, an: u32, bm: u32, bn: u32, r: u32, base: u32) -> CoopRes {
  let m = RNS_M_MOD[r];  let mz = RNS_M_Z[r];
  let nn = RNS_N_MOD[r]; let nz = RNS_N_Z[r];
  let sM = rns_mulmod16(am, bm, m, mz);
  let sN = rns_mulmod16(an, bn, nn, nz);
  let xi = rns_mulmod16(sM, PRE_M[r], m, mz);                     // CRT digit in one mul
  let qN = coop_extend(xi, r, base, 0u, true, nn, nz);            // M -> N, alpha 0
  let t = rns_reduce16(qN * P_MOD_N[r] + sN, nn, nz);
  let rN = rns_mulmod16(t, M_INV_N[r], nn, nz);
  let eta = rns_mulmod16(rN, NDI_N[r], nn, nz);
  let rM = coop_extend(eta, r, base, RNS_RANK_ALPHA, false, m, mz); // N -> M, biased
  return CoopRes(rM, rN);
}

@group(0) @binding(0) var<storage, read> ins: array<u32>;
@group(0) @binding(1) var<storage, read_write> outs: array<u32>;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(subgroup_invocation_id) sgid: u32) {
  let n = arrayLength(&outs) / 32u; // 32 u32 out per modmul: rM[16] ++ rN[16]
  let mm = gid.x / 16u;
  let r = sgid & 15u;
  let base = sgid & 4294967280u; // ~15u
  // No early return: subgroupShuffle requires subgroup-uniform control flow, so every
  // lane runs the full modmul. Clamp the read (avoid OOB on padding threads) and guard
  // only the final write, which is after all shuffles.
  let inb = min(mm, n - 1u) * 64u; // 64 u32 in per modmul: aM[16] aN[16] bM[16] bN[16]
  let bm = ins[inb + 32u + r];
  let bn = ins[inb + 48u + r];
  var cm = ins[inb + r];
  var cn = ins[inb + 16u + r];
  for (var k = 0u; k < CHAIN; k++) {
    let res = coop_modmul(cm, cn, bm, bn, r, base);
    cm = res.rm;
    cn = res.rn;
  }
  if (mm < n) {
    let ob = mm * 32u;
    outs[ob + r] = cm;
    outs[ob + 16u + r] = cn;
  }
}
