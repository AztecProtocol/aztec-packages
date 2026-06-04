// =============================================================================
// W=2 thread-cooperative Montgomery multiply — BN254 base field, 20 x 13-bit.
// A subgroup lane-PAIR computes one montmul; role = sgid & 1. 10/9 limb split
// (role 0 owns s0..s9, role 1 owns s10..s18; s19 is derived). FULLY UNROLLED.
//
// REDUCTION — Yuval's method for iterations 0..18: x/2^13 = (x-x0)/2^13 + x0*r_inv
// with r_inv = 2^-13 mod q. So the reduction multiplier is the low limb x0 = t&MASK
// DIRECTLY (no N0 quotient mul), the low-limb carry is a shift t>>13 (no qi*N[0]
// mul), and the constant is rl[k] = r_inv[role*10+k]. Yuval grows the value ~1 limb,
// so the LAST iteration uses the regular quotient reduce to cap it (result < 4q).
// The top lane folds r_inv[19] into rl[8] so s19 stays UNIFORMLY ZERO (like f8_native).
//
// NORMALISE — split-carry SKEW: the single cross-lane carry (role 0's s9 -> role 1)
// rides ONE packed shuffle and is split lo(13b)->s10, hi->s11, with no re-cascade.
// Leaves a 1-bit-redundant result (every limb <= 2^14, value in [0,2p), NOT canonical)
// — a valid montmul input (validated byte-exact incl. chains in coopmul.ts).
// =============================================================================

enable subgroups;

override CHAIN_K: u32 = 1u;

@group(0) @binding(0) var<storage, read>        inp:  array<u32>;  // per group: x[20], b[20]
@group(0) @binding(1) var<storage, read_write>  outp: array<u32>;  // per group: 20 result limbs

const MASK: u32 = 8191u;   // 2^13 - 1
const N0:   u32 = 905u;    // -p^-1 mod 2^13

struct SAcc {
  sl0: u32, sl1: u32, sl2: u32, sl3: u32, sl4: u32,
  sl5: u32, sl6: u32, sl7: u32, sl8: u32, sl9: u32,
}

fn coop_iter(i: u32, role: u32,
             nl: ptr<function, array<u32,11>>,
             bl: ptr<function, array<u32,11>>,
             xl: ptr<function, array<u32,10>>,
             a:  ptr<function, SAcc>) {
  let li    = select(i, i - 10u, i >= 10u);
  let owner = select(0u, 1u, i >= 10u);
  let r1    = role == 1u;
  let pkt = subgroupShuffleXor(vec2<u32>((*xl)[li], (*a).sl0), 1u);
  let wx  = select((*xl)[li], pkt.x, role != owner);
  let t   = (*a).sl0 + wx * (*bl)[0];
  let qil = (N0 * (t & MASK)) & MASK;
  let c   = select((t + qil * (*nl)[0]) >> 13u, 0u, r1);
  let qi  = select(qil, subgroupShuffleXor(qil, 1u), r1);

  (*a).sl0 = (*a).sl1 + wx * (*bl)[1] + qi * (*nl)[1] + c;
  (*a).sl1 = (*a).sl2 + wx * (*bl)[2] + qi * (*nl)[2];
  (*a).sl2 = (*a).sl3 + wx * (*bl)[3] + qi * (*nl)[3];
  (*a).sl3 = (*a).sl4 + wx * (*bl)[4] + qi * (*nl)[4];
  (*a).sl4 = (*a).sl5 + wx * (*bl)[5] + qi * (*nl)[5];
  (*a).sl5 = (*a).sl6 + wx * (*bl)[6] + qi * (*nl)[6];
  (*a).sl6 = (*a).sl7 + wx * (*bl)[7] + qi * (*nl)[7];
  (*a).sl7 = (*a).sl8 + wx * (*bl)[8] + qi * (*nl)[8];
  // Both roles take sl9 (role 1's sl9 = s19, grown by the preceding Yuval steps);
  // role 1's new sl9 resets to 0 — this is the cap that folds s19 back into s18.
  (*a).sl8 = (*a).sl9 + wx * (*bl)[9]  + qi * (*nl)[9];
  (*a).sl9 = select(pkt.y, 0u, r1) + wx * (*bl)[10] + qi * (*nl)[10];
}

// Yuval reduction step for W=2 (see coop4_montmul.wgsl for the identity). Reduction
// multiplier is the low limb x0 = t & MASK directly (no N0 quotient mul); the
// low-limb carry is t>>13 (no qi*N[0] mul); reduction constant is rl[k] =
// r_inv[role*10 + k]. The top lane folds r_inv[19] into rl[8] so role 1's s19
// (sl9) stays uniformly 0; the regular coop_iter on the last iteration caps the
// ~one-limb growth (which lands in s18).
fn coop_iter_yuval(i: u32, role: u32,
             rl: ptr<function, array<u32,10>>,
             bl: ptr<function, array<u32,11>>,
             xl: ptr<function, array<u32,10>>,
             a:  ptr<function, SAcc>) {
  let li    = select(i, i - 10u, i >= 10u);
  let owner = select(0u, 1u, i >= 10u);
  let r1    = role == 1u;
  let pkt = subgroupShuffleXor(vec2<u32>((*xl)[li], (*a).sl0), 1u);
  let wx  = select((*xl)[li], pkt.x, role != owner);
  let t   = (*a).sl0 + wx * (*bl)[0];
  let clo = select(t >> 13u, 0u, r1);                                // role 0's low-limb carry (a shift)
  let x0  = select(t & MASK, subgroupShuffleXor(t & MASK, 1u), r1);  // global low limb, broadcast from role 0

  (*a).sl0 = (*a).sl1 + wx * (*bl)[1] + x0 * (*rl)[0] + clo;
  (*a).sl1 = (*a).sl2 + wx * (*bl)[2] + x0 * (*rl)[1];
  (*a).sl2 = (*a).sl3 + wx * (*bl)[3] + x0 * (*rl)[2];
  (*a).sl3 = (*a).sl4 + wx * (*bl)[4] + x0 * (*rl)[3];
  (*a).sl4 = (*a).sl5 + wx * (*bl)[5] + x0 * (*rl)[4];
  (*a).sl5 = (*a).sl6 + wx * (*bl)[6] + x0 * (*rl)[5];
  (*a).sl6 = (*a).sl7 + wx * (*bl)[7] + x0 * (*rl)[6];
  (*a).sl7 = (*a).sl8 + wx * (*bl)[8] + x0 * (*rl)[7];
  (*a).sl8 = (*a).sl9 + wx * (*bl)[9]  + x0 * (*rl)[8];
  (*a).sl9 = select(pkt.y, 0u, r1) + wx * (*bl)[10] + x0 * (*rl)[9];
}

@compute @workgroup_size(64)
fn coop2_main(@builtin(global_invocation_id) gid: vec3<u32>,
                  @builtin(subgroup_invocation_id) sgid: u32) {
  let role = sgid & 1u;
  let r1   = role == 1u;
  let grp  = gid.x >> 1u;
  let base = grp * 40u;

  var nl: array<u32,11>;
  nl[0]  = select(7495u, 5655u, r1);  nl[1]  = select( 999u,  770u, r1);
  nl[2]  = select(1462u, 7016u, r1);  nl[3]  = select( 280u, 2082u, r1);
  nl[4]  = select(5058u, 1761u, r1);  nl[5]  = select(1350u, 5125u, r1);
  nl[6]  = select( 455u,  305u, r1);  nl[7]  = select(4653u, 5015u, r1);
  nl[8]  = select( 362u, 6419u, r1);  nl[9]  = select(3260u,   96u, r1);
  nl[10] = select(5655u,    0u, r1);

  // r_inv = 2^-13 mod q, sliced per lane: rl[k] = r_inv[role*10 + k].
  var rl: array<u32,10>;
  rl[0] = select(3803u, 1154u, r1);  rl[1] = select(4308u,  765u, r1);
  rl[2] = select(7801u,  825u, r1);  rl[3] = select(6384u, 4687u, r1);
  rl[4] = select(1700u, 1647u, r1);  rl[5] = select(2324u, 6255u, r1);
  rl[6] = select( 327u,  240u, r1);  rl[7] = select( 444u, 1621u, r1);
  // Top lane (role 1) folds r_inv[19] into s18: rl[8] = r_inv[18]+r_inv[19]*2^13 = 87589,
  // rl[9] = 0 — so role 1's s19 (sl9) stays UNIFORMLY ZERO, like f8_native.
  rl[8] = select(1220u, 87589u, r1);  rl[9] = select(6327u, 0u, r1);

  var bl: array<u32,11>;
  for (var m = 0u; m < 11u; m = m + 1u) {
    let bi = role * 10u + m;
    bl[m] = select(0u, inp[base + 20u + bi], bi < 20u);
  }
  var xl: array<u32,10>;
  for (var m = 0u; m < 10u; m = m + 1u) { xl[m] = inp[base + role * 10u + m]; }

  var a: SAcc;
  for (var rep = 0u; rep < CHAIN_K; rep = rep + 1u) {
    a.sl0=0u; a.sl1=0u; a.sl2=0u; a.sl3=0u; a.sl4=0u; a.sl5=0u; a.sl6=0u; a.sl7=0u; a.sl8=0u; a.sl9=0u;

    // Iterations 0..18 use Yuval reduction (no quotient mul, no role-0 carry mul).
    coop_iter_yuval(0u,  role, &rl, &bl, &xl, &a); coop_iter_yuval(1u,  role, &rl, &bl, &xl, &a);
    coop_iter_yuval(2u,  role, &rl, &bl, &xl, &a); coop_iter_yuval(3u,  role, &rl, &bl, &xl, &a);
    coop_iter_yuval(4u,  role, &rl, &bl, &xl, &a); coop_iter_yuval(5u,  role, &rl, &bl, &xl, &a);
    coop_iter_yuval(6u,  role, &rl, &bl, &xl, &a); coop_iter_yuval(7u,  role, &rl, &bl, &xl, &a);
    coop_iter_yuval(8u,  role, &rl, &bl, &xl, &a); coop_iter_yuval(9u,  role, &rl, &bl, &xl, &a);
    coop_iter_yuval(10u, role, &rl, &bl, &xl, &a); coop_iter_yuval(11u, role, &rl, &bl, &xl, &a);
    coop_iter_yuval(12u, role, &rl, &bl, &xl, &a); coop_iter_yuval(13u, role, &rl, &bl, &xl, &a);
    coop_iter_yuval(14u, role, &rl, &bl, &xl, &a); coop_iter_yuval(15u, role, &rl, &bl, &xl, &a);
    coop_iter_yuval(16u, role, &rl, &bl, &xl, &a); coop_iter_yuval(17u, role, &rl, &bl, &xl, &a);
    coop_iter_yuval(18u, role, &rl, &bl, &xl, &a);
    // Last iteration: regular quotient reduce — caps Yuval's growth (folds s19 into s18, result <4q).
    coop_iter(19u, role, &nl, &bl, &xl, &a);

    // Local pass (uniform sl0..sl7; sl8/sl9 differ by role).
    a.sl1=a.sl1+(a.sl0>>13u); a.sl0&=MASK;  a.sl2=a.sl2+(a.sl1>>13u); a.sl1&=MASK;
    a.sl3=a.sl3+(a.sl2>>13u); a.sl2&=MASK;  a.sl4=a.sl4+(a.sl3>>13u); a.sl3&=MASK;
    a.sl5=a.sl5+(a.sl4>>13u); a.sl4&=MASK;  a.sl6=a.sl6+(a.sl5>>13u); a.sl5&=MASK;
    a.sl7=a.sl7+(a.sl6>>13u); a.sl6&=MASK;  a.sl8=a.sl8+(a.sl7>>13u); a.sl7&=MASK;
    a.sl9 = a.sl9 + select(0u, a.sl8 >> 13u, role == 0u);  // role 0: s8 -> s9
    a.sl8 = select(a.sl8, a.sl8 & MASK, role == 0u);       // role 1: s18 keeps high bits (top)

    // Cross-lane SKEW (single round, no re-cascade): role 0's s9 carry co rides
    // ONE packed shuffle (co = hi<<13 | lo, both < 2^17 total); the receiver splits
    // it into lo (13b) -> role 1's s10 (sl0) and hi -> role 1's s11 (sl1). One
    // permute, not two — no extra port pressure, and the 8-step re-cascade is gone.
    let co    = select(0u, a.sl9 >> 13u, role == 0u);
    let co_up = subgroupShuffleXor(co, 1u);          // role 1 receives role 0's carry
    a.sl9 = select(a.sl9, a.sl9 & MASK, role == 0u); // role 0 keeps s9 = low 13 bits
    a.sl0 = a.sl0 + select(0u, co_up & MASK, r1);
    a.sl1 = a.sl1 + select(0u, co_up >> 13u, r1);
    // role 1: s10 in [0,2^14), s11 in [0,2^13+2^5), rest <2^13. NO re-cascade.

    xl[0]=a.sl0; xl[1]=a.sl1; xl[2]=a.sl2; xl[3]=a.sl3; xl[4]=a.sl4;
    xl[5]=a.sl5; xl[6]=a.sl6; xl[7]=a.sl7;
    xl[8]=select(a.sl8, a.sl8 & MASK, r1);   // role 0: s8 ; role 1: x[18] = s18 low
    xl[9]=select(a.sl9, a.sl8 >> 13u, r1);   // role 0: s9 ; role 1: x[19] = s18 high (top, carry 0)
  }

  let obase = grp * 20u;
  for (var m = 0u; m < 10u; m = m + 1u) { outp[obase + role * 10u + m] = xl[m]; }
}
