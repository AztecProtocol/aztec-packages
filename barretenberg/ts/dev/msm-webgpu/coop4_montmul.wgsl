// =============================================================================
// W=4 thread-cooperative Montgomery multiply — BN254 base field, 20 x 13-bit.
// A subgroup QUAD (4 consecutive lanes) computes one montmul; role = sgid & 3,
// 5 limbs/lane (lane r owns s[5r..5r+4]). FULLY UNROLLED.
//
// REDUCTION — Yuval's method for iterations 0..18: x/2^13 = (x-x0)/2^13 + x0*r_inv
// with r_inv = 2^-13 mod q. So the reduction multiplier is the low limb x0 = t&MASK
// DIRECTLY (no N0 quotient mul), the low-limb carry is a shift t>>13 (no qi*N[0]
// mul), and the constant is rl[m] = r_inv[5*role+m]. Yuval grows the value ~1 limb,
// so the LAST iteration uses the regular quotient reduce to cap it (result < 4q).
// The top lane folds r_inv[19] into rl[3] so s19 stays UNIFORMLY ZERO (like f8_native).
//
// NORMALISE — split-carry SKEW: each lane's leftover carry co = sl4>>13 rides ONE
// parallel shuffleUp and is split lo(13b)->next lane sl0, hi->next lane sl1, with no
// re-cascade (replacing 3 sequential cross-lane rounds). Leaves a 1-bit-redundant
// result (every limb <= 2^14, value in [0,2p), NOT canonical) — a valid montmul input
// (validated byte-exact incl. both-operand squaring chain in coopmul.ts).
// =============================================================================

enable subgroups;

override CHAIN_K: u32 = 1u;

@group(0) @binding(0) var<storage, read>        inp:  array<u32>;  // per group: x[20], b[20]
@group(0) @binding(1) var<storage, read_write>  outp: array<u32>;  // per group: 20 result limbs

const MASK: u32 = 8191u;   // 2^13 - 1
const N0:   u32 = 905u;    // -p^-1 mod 2^13

struct SAcc4 { sl0: u32, sl1: u32, sl2: u32, sl3: u32, sl4: u32, }

fn quad_bcast(v: u32, src: u32, role: u32) -> u32 {
  var x = v;
  let t1 = subgroupShuffleXor(x, 1u); x = select(x, t1, (role & 1u) != (src & 1u));
  let t2 = subgroupShuffleXor(x, 2u); x = select(x, t2, (role & 2u) != (src & 2u));
  return x;
}

fn coop_iter4(i: u32, role: u32,
              nl: ptr<function, array<u32,6>>,
              bl: ptr<function, array<u32,6>>,
              xl: ptr<function, array<u32,5>>,
              a:  ptr<function, SAcc4>) {
  let wx  = quad_bcast((*xl)[i % 5u], i / 5u, role);
  let t   = (*a).sl0 + wx * (*bl)[0];
  let qil = (N0 * (t & MASK)) & MASK;
  let c   = select(0u, (t + qil * (*nl)[0]) >> 13u, role == 0u);
  let qi  = quad_bcast(qil, 0u, role);
  let nbr = subgroupShuffleDown((*a).sl0, 1u);

  (*a).sl0 = (*a).sl1 + wx * (*bl)[1] + qi * (*nl)[1] + c;
  (*a).sl1 = (*a).sl2 + wx * (*bl)[2] + qi * (*nl)[2];
  (*a).sl2 = (*a).sl3 + wx * (*bl)[3] + qi * (*nl)[3];
  (*a).sl3 = (*a).sl4 + wx * (*bl)[4] + qi * (*nl)[4];
  (*a).sl4 = select(nbr, 0u, role == 3u) + wx * (*bl)[5] + qi * (*nl)[5];
}

// Yuval reduction step: divide-by-2^13 via the precomputed r_inv = 2^-13 mod q,
// instead of the Montgomery quotient. x/2^13 = (x - x0)/2^13 + x0*r_inv, so the
// reduction multiplier is the low limb x0 = (t & MASK) DIRECTLY (no N0 quotient
// mul), the low-limb carry is just t>>13 (no qi*N[0] mul), and the reduction
// constant is rl[m] = r_inv[5*role+m] (indexed at the limb, not shifted like nl).
// Caveat: x0*r_inv is not shifted down the way qi*N is, so this grows the value
// by ~one limb. The growth is absorbed into s18 (the top lane folds r_inv[19] into
// rl[3], so s19 stays uniformly 0 — see the rl baking); the caller caps the value
// with ONE regular coop_iter4 on the last iteration, bounding the result <4q.
fn coop_iter4_yuval(i: u32, role: u32,
              rl: ptr<function, array<u32,5>>,
              bl: ptr<function, array<u32,6>>,
              xl: ptr<function, array<u32,5>>,
              a:  ptr<function, SAcc4>) {
  let wx  = quad_bcast((*xl)[i % 5u], i / 5u, role);
  let t   = (*a).sl0 + wx * (*bl)[0];
  let x0  = quad_bcast(t & MASK, 0u, role);      // global low limb, broadcast (no N0 mul before it)
  let clo = select(0u, t >> 13u, role == 0u);    // relaxed low-limb carry — a shift, not a mul
  let nbr = subgroupShuffleDown((*a).sl0, 1u);

  (*a).sl0 = (*a).sl1 + wx * (*bl)[1] + x0 * (*rl)[0] + clo;
  (*a).sl1 = (*a).sl2 + wx * (*bl)[2] + x0 * (*rl)[1];
  (*a).sl2 = (*a).sl3 + wx * (*bl)[3] + x0 * (*rl)[2];
  (*a).sl3 = (*a).sl4 + wx * (*bl)[4] + x0 * (*rl)[3];
  (*a).sl4 = select(nbr, 0u, role == 3u) + wx * (*bl)[5] + x0 * (*rl)[4];
}

@compute @workgroup_size(64)
fn coop4_main(@builtin(global_invocation_id) gid: vec3<u32>,
                  @builtin(subgroup_invocation_id) sgid: u32) {
  let role  = sgid & 3u;
  let grp   = gid.x >> 2u;
  let base  = grp * 40u;
  let hi    = role >= 2u;

  var nl: array<u32,6>;
  nl[0] = select(select(7495u, 1350u, role == 1u), select(5655u, 5125u, role == 3u), hi);
  nl[1] = select(select( 999u,  455u, role == 1u), select( 770u,  305u, role == 3u), hi);
  nl[2] = select(select(1462u, 4653u, role == 1u), select(7016u, 5015u, role == 3u), hi);
  nl[3] = select(select( 280u,  362u, role == 1u), select(2082u, 6419u, role == 3u), hi);
  nl[4] = select(select(5058u, 3260u, role == 1u), select(1761u,   96u, role == 3u), hi);
  nl[5] = select(select(1350u, 5655u, role == 1u), select(5125u,    0u, role == 3u), hi);

  // r_inv = 2^-13 mod q, sliced per lane: rl[m] = r_inv[5*role + m].
  var rl: array<u32,5>;
  rl[0] = select(select(3803u, 2324u, role == 1u), select(1154u, 6255u, role == 3u), hi);
  rl[1] = select(select(4308u,  327u, role == 1u), select( 765u,  240u, role == 3u), hi);
  rl[2] = select(select(7801u,  444u, role == 1u), select( 825u, 1621u, role == 3u), hi);
  // Top lane folds r_inv[19] into s18: rl[3] = r_inv[18] + r_inv[19]*2^13 = 87589,
  // rl[4] = 0. So s19 (lane 3 sl4) stays UNIFORMLY ZERO in the loop — like f8_native,
  // limb 19 is the carry out of s18 at normalise, never an accumulator.
  rl[3] = select(select(6384u, 1220u, role == 1u), select(4687u, 87589u, role == 3u), hi);
  rl[4] = select(select(1700u, 6327u, role == 1u), select(1647u,     0u, role == 3u), hi);

  var bl: array<u32,6>;
  for (var m = 0u; m < 6u; m = m + 1u) { let bi = 5u * role + m; bl[m] = select(0u, inp[base + 20u + bi], bi < 20u); }
  var xl: array<u32,5>;
  for (var m = 0u; m < 5u; m = m + 1u) { xl[m] = inp[base + 5u * role + m]; }

  var a: SAcc4;
  for (var rep = 0u; rep < CHAIN_K; rep = rep + 1u) {
    a.sl0=0u; a.sl1=0u; a.sl2=0u; a.sl3=0u; a.sl4=0u;

    // Iterations 0..18 use Yuval reduction (no quotient mul, no role-0 carry mul).
    coop_iter4_yuval(0u,  role, &rl, &bl, &xl, &a); coop_iter4_yuval(1u,  role, &rl, &bl, &xl, &a);
    coop_iter4_yuval(2u,  role, &rl, &bl, &xl, &a); coop_iter4_yuval(3u,  role, &rl, &bl, &xl, &a);
    coop_iter4_yuval(4u,  role, &rl, &bl, &xl, &a); coop_iter4_yuval(5u,  role, &rl, &bl, &xl, &a);
    coop_iter4_yuval(6u,  role, &rl, &bl, &xl, &a); coop_iter4_yuval(7u,  role, &rl, &bl, &xl, &a);
    coop_iter4_yuval(8u,  role, &rl, &bl, &xl, &a); coop_iter4_yuval(9u,  role, &rl, &bl, &xl, &a);
    coop_iter4_yuval(10u, role, &rl, &bl, &xl, &a); coop_iter4_yuval(11u, role, &rl, &bl, &xl, &a);
    coop_iter4_yuval(12u, role, &rl, &bl, &xl, &a); coop_iter4_yuval(13u, role, &rl, &bl, &xl, &a);
    coop_iter4_yuval(14u, role, &rl, &bl, &xl, &a); coop_iter4_yuval(15u, role, &rl, &bl, &xl, &a);
    coop_iter4_yuval(16u, role, &rl, &bl, &xl, &a); coop_iter4_yuval(17u, role, &rl, &bl, &xl, &a);
    coop_iter4_yuval(18u, role, &rl, &bl, &xl, &a);
    // Last iteration: regular quotient reduce — caps Yuval's growth (resets s19=0, result <4q).
    coop_iter4(19u, role, &nl, &bl, &xl, &a);

    // Local pass: canonicalise sl0..sl3; sl4 holds its top limb + the carry to push.
    a.sl1+=a.sl0>>13u; a.sl0&=MASK; a.sl2+=a.sl1>>13u; a.sl1&=MASK;
    a.sl3+=a.sl2>>13u; a.sl2&=MASK; a.sl4+=a.sl3>>13u; a.sl3&=MASK;

    // ONE parallel cross-lane SKEW round. Lanes 0,1,2 push their carry co=sl4>>13
    // up to the next lane on ONE packed shuffleUp (co = hi<<13 | lo, < 2^17 total);
    // the receiver splits it into lo (13b -> sl0) + hi (-> sl1). One permute, not
    // two. shuffleUp(.,1) delivers lane (k-1)->k for all k at once; role 0 reads OOB
    // and is masked off.
    //
    // Top limb needs NO special case: lane 3's carry (s19>>13) is always 0 (value
    // kept < 2p < R), so the uniform mask below is a no-op for it, and its co=0
    // shuffled to the dead lane-4 slot is discarded by the role!=0 guard on sl0/sl1.
    let co    = a.sl4 >> 13u;
    let co_up = subgroupShuffleUp(co, 1u);
    a.sl4 = a.sl4 & MASK;
    a.sl0 = a.sl0 + select(0u, co_up & MASK, role != 0u);
    a.sl1 = a.sl1 + select(0u, co_up >> 13u, role != 0u);
    // NO re-cascade. Every limb in [0, 2^14); the value encoded is in [0, 2p) —
    // NOT canonically reduced (no conditional subtract of p). Multiply-safe as-is.

    xl[0]=a.sl0; xl[1]=a.sl1; xl[2]=a.sl2; xl[3]=a.sl3; xl[4]=a.sl4;
  }

  let obase = grp * 20u;
  outp[obase + 5u * role + 0u] = a.sl0;
  outp[obase + 5u * role + 1u] = a.sl1;
  outp[obase + 5u * role + 2u] = a.sl2;
  outp[obase + 5u * role + 3u] = a.sl3;
  outp[obase + 5u * role + 4u] = a.sl4;
}
