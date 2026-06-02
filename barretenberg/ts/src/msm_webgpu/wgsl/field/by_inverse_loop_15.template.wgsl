// AUTO-UNROLLED runtime form. The inner loops (axby `for w<9`, divstep `for
// i<15`, the packed-limb helpers) are fully unrolled so the compiler can scalar-
// replace the Pk9 state into registers (SROA) — this eliminates the 836-byte
// stack spill that otherwise left stream_walker memory-latency-bound at 50%
// occupancy (walker spill 960 -> 260 B; ~8% phone MSM win). The OUTER safegcd
// loop stays rolled, so it remains a single dispatch (profile-E safe — no
// per-batch dispatch explosion). Regenerate from the readable looped source:
//   node cios15n/unroll_wgsl.mjs cios15n/by_inverse_loop_15.looped.wgsl <out>
// (The 13-bit inverse is deliberately NOT unrolled: its heavier 2-word apply
//  doubles the code and only partially clears spill — a net regression.)
// ============================================================================
// 15-bit Bernstein-Yang safegcd field inverse — fr_inv_by_loop_pk15 (PACKED).
//
// SINGLE-LANE jumpy safegcd (Pornin K-step, K=15), state PACKED 2x15-bit limbs
// per u32 word => 9 words (Pk9) for f,g,u,v. Three design choices, all for the
// register-bound phone:
//   * single-lane: matrix row-sum <=2^K times a 15-bit limb => each column is
//     2 products of <=2^30 in ONE i32 lane (no 2-word macc, ~3 ops/limb).
//   * K=15 (the single-lane max, 2^30<2^31): fewest outer iters => least apply
//     work, since apply cost = NUM_OUTER*O(words). K=15 => 49 outer vs K=12 => 62.
//   * packed 9 words (not unpacked 18): HALVES per-thread private memory, the
//     dominant occupancy lever on Mali. 9 words even beats 13-bit pk's 10.
// 18 limbs (not 17): axby_modp_halve_k's pre-normalize value is in [-3p,3p].
// All host-validated bit-exact (cios15n/by15_jumpy_packed.mjs). BN254 Fq;
// p-limbs / p^-1 mod 2^15 baked. Relies on montgomery_product + get_r_cubed.
// NOTE: never write Mustache tags in these comments.
// ============================================================================

// K=15 is the MAX for a single-lane i32 apply: a product column is bounded by
// 2^(15+K) (matrix row-sum <=2^K times a 15-bit limb), so K=15 => 2^30 < 2^31.
// NUM_OUTER is ALGEBRAIC, not tuned: Bernstein-Yang (2019) prove the divstep
// recurrence drives g->0 within floor((49d+57)/17) divsteps for EVERY d-bit
// input. BN254 Fq is d=254 => 735 (the same bound the audited 13-bit pk uses).
// NUM_OUTER = ceil(735/K). K=15 => 49 (exactly 735 divsteps). Failure prob = 0.
// The single 15-bit low limb yields 15 EXACT divstep decisions (carries in g+-f
// propagate upward, so bit i depends only on bits 0..i; K bits => K exact steps).
const PK15_K: u32 = 15u;
const PK15_MAX_OUTER: u32 = 49u;           // ceil(735/15) — B-Y worst case, deterministic
const PK15_MASK: u32 = 32767u;             // 2^15 - 1
const PK15_KMASK: u32 = 32767u;            // 2^K - 1 (K=15) == MASK
const PK15_BOT: u32 = 0u;                  // WORD_SIZE - K = 15 - 15
const PK15_PINV: u32 = 7287u;              // p^-1 mod 2^15

struct Pk9 { w: array<u32, 9> }            // 9 words = 18 x 15-bit limbs (2/word)

fn pk15_p(i: u32) -> u32 {
    switch i {
        case 0u:  { return 32071u; } case 1u:  { return 12537u; } case 2u:  { return 12379u; }
        case 3u:  { return 24836u; } case 4u:  { return 10451u; } case 5u:  { return 3641u; }
        case 6u:  { return 9306u; }  case 7u:  { return 16565u; } case 8u:  { return 23959u; }
        case 9u:  { return 688u; }   case 10u: { return 23046u; } case 11u: { return 557u; }
        case 12u: { return 7045u; }  case 13u: { return 13317u; } case 14u: { return 14412u; }
        case 15u: { return 10041u; } case 16u: { return 12388u; } default:  { return 0u; }
    }
}
fn pk15_pw(w: u32) -> u32 { return pk15_p(2u * w) | (pk15_p(2u * w + 1u) << 15u); }  // packed p word
fn pk15_sext(limb: u32) -> i32 { return (i32(limb) << 17u) >> 17u; }

fn pk15_is_zero(x: ptr<function, Pk9>) -> bool { var a: u32 = 0u; { a = a | (*x).w[0u]; }
{ a = a | (*x).w[1u]; }
{ a = a | (*x).w[2u]; }
{ a = a | (*x).w[3u]; }
{ a = a | (*x).w[4u]; }
{ a = a | (*x).w[5u]; }
{ a = a | (*x).w[6u]; }
{ a = a | (*x).w[7u]; }
{ a = a | (*x).w[8u]; }
 return a == 0u; }
fn pk15_is_neg(x: ptr<function, Pk9>) -> bool { return (((*x).w[8] >> 29u) & 1u) == 1u; }  // bit 14 of limb 17

fn pk15_add_p(x: ptr<function, Pk9>) {
    var c: i32 = 0;
    {
        let pw = pk15_pw(0u);
        let e = i32((*x).w[0u] & PK15_MASK) + i32(pw & PK15_MASK) + c; let le = bitcast<u32>(e) & PK15_MASK; c = e >> 15u;
        let o = i32(((*x).w[0u] >> 15u) & PK15_MASK) + i32((pw >> 15u) & PK15_MASK) + c; let lo = bitcast<u32>(o) & PK15_MASK;
        if (0u != 8u) { c = o >> 15u; }
        (*x).w[0u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(1u);
        let e = i32((*x).w[1u] & PK15_MASK) + i32(pw & PK15_MASK) + c; let le = bitcast<u32>(e) & PK15_MASK; c = e >> 15u;
        let o = i32(((*x).w[1u] >> 15u) & PK15_MASK) + i32((pw >> 15u) & PK15_MASK) + c; let lo = bitcast<u32>(o) & PK15_MASK;
        if (1u != 8u) { c = o >> 15u; }
        (*x).w[1u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(2u);
        let e = i32((*x).w[2u] & PK15_MASK) + i32(pw & PK15_MASK) + c; let le = bitcast<u32>(e) & PK15_MASK; c = e >> 15u;
        let o = i32(((*x).w[2u] >> 15u) & PK15_MASK) + i32((pw >> 15u) & PK15_MASK) + c; let lo = bitcast<u32>(o) & PK15_MASK;
        if (2u != 8u) { c = o >> 15u; }
        (*x).w[2u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(3u);
        let e = i32((*x).w[3u] & PK15_MASK) + i32(pw & PK15_MASK) + c; let le = bitcast<u32>(e) & PK15_MASK; c = e >> 15u;
        let o = i32(((*x).w[3u] >> 15u) & PK15_MASK) + i32((pw >> 15u) & PK15_MASK) + c; let lo = bitcast<u32>(o) & PK15_MASK;
        if (3u != 8u) { c = o >> 15u; }
        (*x).w[3u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(4u);
        let e = i32((*x).w[4u] & PK15_MASK) + i32(pw & PK15_MASK) + c; let le = bitcast<u32>(e) & PK15_MASK; c = e >> 15u;
        let o = i32(((*x).w[4u] >> 15u) & PK15_MASK) + i32((pw >> 15u) & PK15_MASK) + c; let lo = bitcast<u32>(o) & PK15_MASK;
        if (4u != 8u) { c = o >> 15u; }
        (*x).w[4u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(5u);
        let e = i32((*x).w[5u] & PK15_MASK) + i32(pw & PK15_MASK) + c; let le = bitcast<u32>(e) & PK15_MASK; c = e >> 15u;
        let o = i32(((*x).w[5u] >> 15u) & PK15_MASK) + i32((pw >> 15u) & PK15_MASK) + c; let lo = bitcast<u32>(o) & PK15_MASK;
        if (5u != 8u) { c = o >> 15u; }
        (*x).w[5u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(6u);
        let e = i32((*x).w[6u] & PK15_MASK) + i32(pw & PK15_MASK) + c; let le = bitcast<u32>(e) & PK15_MASK; c = e >> 15u;
        let o = i32(((*x).w[6u] >> 15u) & PK15_MASK) + i32((pw >> 15u) & PK15_MASK) + c; let lo = bitcast<u32>(o) & PK15_MASK;
        if (6u != 8u) { c = o >> 15u; }
        (*x).w[6u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(7u);
        let e = i32((*x).w[7u] & PK15_MASK) + i32(pw & PK15_MASK) + c; let le = bitcast<u32>(e) & PK15_MASK; c = e >> 15u;
        let o = i32(((*x).w[7u] >> 15u) & PK15_MASK) + i32((pw >> 15u) & PK15_MASK) + c; let lo = bitcast<u32>(o) & PK15_MASK;
        if (7u != 8u) { c = o >> 15u; }
        (*x).w[7u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(8u);
        let e = i32((*x).w[8u] & PK15_MASK) + i32(pw & PK15_MASK) + c; let le = bitcast<u32>(e) & PK15_MASK; c = e >> 15u;
        let o = i32(((*x).w[8u] >> 15u) & PK15_MASK) + i32((pw >> 15u) & PK15_MASK) + c; let lo = bitcast<u32>(o) & PK15_MASK;
        if (8u != 8u) { c = o >> 15u; }
        (*x).w[8u] = le | (lo << 15u);
    }

}
fn pk15_sub_p(x: ptr<function, Pk9>) {
    var c: i32 = 0;
    {
        let pw = pk15_pw(0u);
        let e = i32((*x).w[0u] & PK15_MASK) - i32(pw & PK15_MASK) + c; let le = bitcast<u32>(e) & PK15_MASK; c = e >> 15u;
        let o = i32(((*x).w[0u] >> 15u) & PK15_MASK) - i32((pw >> 15u) & PK15_MASK) + c; let lo = bitcast<u32>(o) & PK15_MASK;
        if (0u != 8u) { c = o >> 15u; }
        (*x).w[0u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(1u);
        let e = i32((*x).w[1u] & PK15_MASK) - i32(pw & PK15_MASK) + c; let le = bitcast<u32>(e) & PK15_MASK; c = e >> 15u;
        let o = i32(((*x).w[1u] >> 15u) & PK15_MASK) - i32((pw >> 15u) & PK15_MASK) + c; let lo = bitcast<u32>(o) & PK15_MASK;
        if (1u != 8u) { c = o >> 15u; }
        (*x).w[1u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(2u);
        let e = i32((*x).w[2u] & PK15_MASK) - i32(pw & PK15_MASK) + c; let le = bitcast<u32>(e) & PK15_MASK; c = e >> 15u;
        let o = i32(((*x).w[2u] >> 15u) & PK15_MASK) - i32((pw >> 15u) & PK15_MASK) + c; let lo = bitcast<u32>(o) & PK15_MASK;
        if (2u != 8u) { c = o >> 15u; }
        (*x).w[2u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(3u);
        let e = i32((*x).w[3u] & PK15_MASK) - i32(pw & PK15_MASK) + c; let le = bitcast<u32>(e) & PK15_MASK; c = e >> 15u;
        let o = i32(((*x).w[3u] >> 15u) & PK15_MASK) - i32((pw >> 15u) & PK15_MASK) + c; let lo = bitcast<u32>(o) & PK15_MASK;
        if (3u != 8u) { c = o >> 15u; }
        (*x).w[3u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(4u);
        let e = i32((*x).w[4u] & PK15_MASK) - i32(pw & PK15_MASK) + c; let le = bitcast<u32>(e) & PK15_MASK; c = e >> 15u;
        let o = i32(((*x).w[4u] >> 15u) & PK15_MASK) - i32((pw >> 15u) & PK15_MASK) + c; let lo = bitcast<u32>(o) & PK15_MASK;
        if (4u != 8u) { c = o >> 15u; }
        (*x).w[4u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(5u);
        let e = i32((*x).w[5u] & PK15_MASK) - i32(pw & PK15_MASK) + c; let le = bitcast<u32>(e) & PK15_MASK; c = e >> 15u;
        let o = i32(((*x).w[5u] >> 15u) & PK15_MASK) - i32((pw >> 15u) & PK15_MASK) + c; let lo = bitcast<u32>(o) & PK15_MASK;
        if (5u != 8u) { c = o >> 15u; }
        (*x).w[5u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(6u);
        let e = i32((*x).w[6u] & PK15_MASK) - i32(pw & PK15_MASK) + c; let le = bitcast<u32>(e) & PK15_MASK; c = e >> 15u;
        let o = i32(((*x).w[6u] >> 15u) & PK15_MASK) - i32((pw >> 15u) & PK15_MASK) + c; let lo = bitcast<u32>(o) & PK15_MASK;
        if (6u != 8u) { c = o >> 15u; }
        (*x).w[6u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(7u);
        let e = i32((*x).w[7u] & PK15_MASK) - i32(pw & PK15_MASK) + c; let le = bitcast<u32>(e) & PK15_MASK; c = e >> 15u;
        let o = i32(((*x).w[7u] >> 15u) & PK15_MASK) - i32((pw >> 15u) & PK15_MASK) + c; let lo = bitcast<u32>(o) & PK15_MASK;
        if (7u != 8u) { c = o >> 15u; }
        (*x).w[7u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(8u);
        let e = i32((*x).w[8u] & PK15_MASK) - i32(pw & PK15_MASK) + c; let le = bitcast<u32>(e) & PK15_MASK; c = e >> 15u;
        let o = i32(((*x).w[8u] >> 15u) & PK15_MASK) - i32((pw >> 15u) & PK15_MASK) + c; let lo = bitcast<u32>(o) & PK15_MASK;
        if (8u != 8u) { c = o >> 15u; }
        (*x).w[8u] = le | (lo << 15u);
    }

}
fn pk15_gte(x: ptr<function, Pk9>) -> bool {
    {
        let i = 17u; let xi = ((*x).w[i >> 1u] >> ((i & 1u) * 15u)) & PK15_MASK; let pi = pk15_p(i);
        if (xi > pi) { return true; } if (xi < pi) { return false; }
    }
{
        let i = 16u; let xi = ((*x).w[i >> 1u] >> ((i & 1u) * 15u)) & PK15_MASK; let pi = pk15_p(i);
        if (xi > pi) { return true; } if (xi < pi) { return false; }
    }
{
        let i = 15u; let xi = ((*x).w[i >> 1u] >> ((i & 1u) * 15u)) & PK15_MASK; let pi = pk15_p(i);
        if (xi > pi) { return true; } if (xi < pi) { return false; }
    }
{
        let i = 14u; let xi = ((*x).w[i >> 1u] >> ((i & 1u) * 15u)) & PK15_MASK; let pi = pk15_p(i);
        if (xi > pi) { return true; } if (xi < pi) { return false; }
    }
{
        let i = 13u; let xi = ((*x).w[i >> 1u] >> ((i & 1u) * 15u)) & PK15_MASK; let pi = pk15_p(i);
        if (xi > pi) { return true; } if (xi < pi) { return false; }
    }
{
        let i = 12u; let xi = ((*x).w[i >> 1u] >> ((i & 1u) * 15u)) & PK15_MASK; let pi = pk15_p(i);
        if (xi > pi) { return true; } if (xi < pi) { return false; }
    }
{
        let i = 11u; let xi = ((*x).w[i >> 1u] >> ((i & 1u) * 15u)) & PK15_MASK; let pi = pk15_p(i);
        if (xi > pi) { return true; } if (xi < pi) { return false; }
    }
{
        let i = 10u; let xi = ((*x).w[i >> 1u] >> ((i & 1u) * 15u)) & PK15_MASK; let pi = pk15_p(i);
        if (xi > pi) { return true; } if (xi < pi) { return false; }
    }
{
        let i = 9u; let xi = ((*x).w[i >> 1u] >> ((i & 1u) * 15u)) & PK15_MASK; let pi = pk15_p(i);
        if (xi > pi) { return true; } if (xi < pi) { return false; }
    }
{
        let i = 8u; let xi = ((*x).w[i >> 1u] >> ((i & 1u) * 15u)) & PK15_MASK; let pi = pk15_p(i);
        if (xi > pi) { return true; } if (xi < pi) { return false; }
    }
{
        let i = 7u; let xi = ((*x).w[i >> 1u] >> ((i & 1u) * 15u)) & PK15_MASK; let pi = pk15_p(i);
        if (xi > pi) { return true; } if (xi < pi) { return false; }
    }
{
        let i = 6u; let xi = ((*x).w[i >> 1u] >> ((i & 1u) * 15u)) & PK15_MASK; let pi = pk15_p(i);
        if (xi > pi) { return true; } if (xi < pi) { return false; }
    }
{
        let i = 5u; let xi = ((*x).w[i >> 1u] >> ((i & 1u) * 15u)) & PK15_MASK; let pi = pk15_p(i);
        if (xi > pi) { return true; } if (xi < pi) { return false; }
    }
{
        let i = 4u; let xi = ((*x).w[i >> 1u] >> ((i & 1u) * 15u)) & PK15_MASK; let pi = pk15_p(i);
        if (xi > pi) { return true; } if (xi < pi) { return false; }
    }
{
        let i = 3u; let xi = ((*x).w[i >> 1u] >> ((i & 1u) * 15u)) & PK15_MASK; let pi = pk15_p(i);
        if (xi > pi) { return true; } if (xi < pi) { return false; }
    }
{
        let i = 2u; let xi = ((*x).w[i >> 1u] >> ((i & 1u) * 15u)) & PK15_MASK; let pi = pk15_p(i);
        if (xi > pi) { return true; } if (xi < pi) { return false; }
    }
{
        let i = 1u; let xi = ((*x).w[i >> 1u] >> ((i & 1u) * 15u)) & PK15_MASK; let pi = pk15_p(i);
        if (xi > pi) { return true; } if (xi < pi) { return false; }
    }
{
        let i = 0u; let xi = ((*x).w[i >> 1u] >> ((i & 1u) * 15u)) & PK15_MASK; let pi = pk15_p(i);
        if (xi > pi) { return true; } if (xi < pi) { return false; }
    }

    return true;
}
fn pk15_norm_modp(x: ptr<function, Pk9>) {
    { if (pk15_is_neg(x)) { pk15_add_p(x); } else {  } }
{ if (pk15_is_neg(x)) { pk15_add_p(x); } else {  } }
{ if (pk15_is_neg(x)) { pk15_add_p(x); } else {  } }
{ if (pk15_is_neg(x)) { pk15_add_p(x); } else {  } }

    { if (pk15_gte(x)) { pk15_sub_p(x); } else {  } }
{ if (pk15_gte(x)) { pk15_sub_p(x); } else {  } }
{ if (pk15_gte(x)) { pk15_sub_p(x); } else {  } }
{ if (pk15_gte(x)) { pk15_sub_p(x); } else {  } }

}
fn pk15_neg_modp(x: ptr<function, Pk9>) {
    var borrow: i32 = 0;
    {
        let pw = pk15_pw(0u);
        let e = i32(pw & PK15_MASK) - i32((*x).w[0u] & PK15_MASK) - borrow; let le = bitcast<u32>(e) & PK15_MASK; borrow = select(0, 1, e < 0);
        let o = i32((pw >> 15u) & PK15_MASK) - i32(((*x).w[0u] >> 15u) & PK15_MASK) - borrow; let lo = bitcast<u32>(o) & PK15_MASK; borrow = select(0, 1, o < 0);
        (*x).w[0u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(1u);
        let e = i32(pw & PK15_MASK) - i32((*x).w[1u] & PK15_MASK) - borrow; let le = bitcast<u32>(e) & PK15_MASK; borrow = select(0, 1, e < 0);
        let o = i32((pw >> 15u) & PK15_MASK) - i32(((*x).w[1u] >> 15u) & PK15_MASK) - borrow; let lo = bitcast<u32>(o) & PK15_MASK; borrow = select(0, 1, o < 0);
        (*x).w[1u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(2u);
        let e = i32(pw & PK15_MASK) - i32((*x).w[2u] & PK15_MASK) - borrow; let le = bitcast<u32>(e) & PK15_MASK; borrow = select(0, 1, e < 0);
        let o = i32((pw >> 15u) & PK15_MASK) - i32(((*x).w[2u] >> 15u) & PK15_MASK) - borrow; let lo = bitcast<u32>(o) & PK15_MASK; borrow = select(0, 1, o < 0);
        (*x).w[2u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(3u);
        let e = i32(pw & PK15_MASK) - i32((*x).w[3u] & PK15_MASK) - borrow; let le = bitcast<u32>(e) & PK15_MASK; borrow = select(0, 1, e < 0);
        let o = i32((pw >> 15u) & PK15_MASK) - i32(((*x).w[3u] >> 15u) & PK15_MASK) - borrow; let lo = bitcast<u32>(o) & PK15_MASK; borrow = select(0, 1, o < 0);
        (*x).w[3u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(4u);
        let e = i32(pw & PK15_MASK) - i32((*x).w[4u] & PK15_MASK) - borrow; let le = bitcast<u32>(e) & PK15_MASK; borrow = select(0, 1, e < 0);
        let o = i32((pw >> 15u) & PK15_MASK) - i32(((*x).w[4u] >> 15u) & PK15_MASK) - borrow; let lo = bitcast<u32>(o) & PK15_MASK; borrow = select(0, 1, o < 0);
        (*x).w[4u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(5u);
        let e = i32(pw & PK15_MASK) - i32((*x).w[5u] & PK15_MASK) - borrow; let le = bitcast<u32>(e) & PK15_MASK; borrow = select(0, 1, e < 0);
        let o = i32((pw >> 15u) & PK15_MASK) - i32(((*x).w[5u] >> 15u) & PK15_MASK) - borrow; let lo = bitcast<u32>(o) & PK15_MASK; borrow = select(0, 1, o < 0);
        (*x).w[5u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(6u);
        let e = i32(pw & PK15_MASK) - i32((*x).w[6u] & PK15_MASK) - borrow; let le = bitcast<u32>(e) & PK15_MASK; borrow = select(0, 1, e < 0);
        let o = i32((pw >> 15u) & PK15_MASK) - i32(((*x).w[6u] >> 15u) & PK15_MASK) - borrow; let lo = bitcast<u32>(o) & PK15_MASK; borrow = select(0, 1, o < 0);
        (*x).w[6u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(7u);
        let e = i32(pw & PK15_MASK) - i32((*x).w[7u] & PK15_MASK) - borrow; let le = bitcast<u32>(e) & PK15_MASK; borrow = select(0, 1, e < 0);
        let o = i32((pw >> 15u) & PK15_MASK) - i32(((*x).w[7u] >> 15u) & PK15_MASK) - borrow; let lo = bitcast<u32>(o) & PK15_MASK; borrow = select(0, 1, o < 0);
        (*x).w[7u] = le | (lo << 15u);
    }
{
        let pw = pk15_pw(8u);
        let e = i32(pw & PK15_MASK) - i32((*x).w[8u] & PK15_MASK) - borrow; let le = bitcast<u32>(e) & PK15_MASK; borrow = select(0, 1, e < 0);
        let o = i32((pw >> 15u) & PK15_MASK) - i32(((*x).w[8u] >> 15u) & PK15_MASK) - borrow; let lo = bitcast<u32>(o) & PK15_MASK; borrow = select(0, 1, o < 0);
        (*x).w[8u] = le | (lo << 15u);
    }

}

// (f,g) <- (x*a + y*b) >> K. Single-lane product limbs, packed; then >>K recombine.
fn pk15_axby_shr_k(a: ptr<function, Pk9>, x: i32, b: ptr<function, Pk9>, y: i32, out: ptr<function, Pk9>) {
    var acc: array<u32, 9>;
    var carry: i32 = 0;
    {
        let pe = i32((*a).w[0u] & PK15_MASK) * x + i32((*b).w[0u] & PK15_MASK) * y + carry;
        let le = bitcast<u32>(pe) & PK15_MASK; carry = pe >> 15u;
        var fo: i32; var go: i32;
        if (0u == 8u) { fo = pk15_sext((*a).w[0u] >> 15u); go = pk15_sext((*b).w[0u] >> 15u); }
        else { fo = i32(((*a).w[0u] >> 15u) & PK15_MASK); go = i32(((*b).w[0u] >> 15u) & PK15_MASK); }
        let po = fo * x + go * y + carry;
        acc[0u] = le | ((bitcast<u32>(po) & PK15_MASK) << 15u); carry = po >> 15u;
    }
{
        let pe = i32((*a).w[1u] & PK15_MASK) * x + i32((*b).w[1u] & PK15_MASK) * y + carry;
        let le = bitcast<u32>(pe) & PK15_MASK; carry = pe >> 15u;
        var fo: i32; var go: i32;
        if (1u == 8u) { fo = pk15_sext((*a).w[1u] >> 15u); go = pk15_sext((*b).w[1u] >> 15u); }
        else { fo = i32(((*a).w[1u] >> 15u) & PK15_MASK); go = i32(((*b).w[1u] >> 15u) & PK15_MASK); }
        let po = fo * x + go * y + carry;
        acc[1u] = le | ((bitcast<u32>(po) & PK15_MASK) << 15u); carry = po >> 15u;
    }
{
        let pe = i32((*a).w[2u] & PK15_MASK) * x + i32((*b).w[2u] & PK15_MASK) * y + carry;
        let le = bitcast<u32>(pe) & PK15_MASK; carry = pe >> 15u;
        var fo: i32; var go: i32;
        if (2u == 8u) { fo = pk15_sext((*a).w[2u] >> 15u); go = pk15_sext((*b).w[2u] >> 15u); }
        else { fo = i32(((*a).w[2u] >> 15u) & PK15_MASK); go = i32(((*b).w[2u] >> 15u) & PK15_MASK); }
        let po = fo * x + go * y + carry;
        acc[2u] = le | ((bitcast<u32>(po) & PK15_MASK) << 15u); carry = po >> 15u;
    }
{
        let pe = i32((*a).w[3u] & PK15_MASK) * x + i32((*b).w[3u] & PK15_MASK) * y + carry;
        let le = bitcast<u32>(pe) & PK15_MASK; carry = pe >> 15u;
        var fo: i32; var go: i32;
        if (3u == 8u) { fo = pk15_sext((*a).w[3u] >> 15u); go = pk15_sext((*b).w[3u] >> 15u); }
        else { fo = i32(((*a).w[3u] >> 15u) & PK15_MASK); go = i32(((*b).w[3u] >> 15u) & PK15_MASK); }
        let po = fo * x + go * y + carry;
        acc[3u] = le | ((bitcast<u32>(po) & PK15_MASK) << 15u); carry = po >> 15u;
    }
{
        let pe = i32((*a).w[4u] & PK15_MASK) * x + i32((*b).w[4u] & PK15_MASK) * y + carry;
        let le = bitcast<u32>(pe) & PK15_MASK; carry = pe >> 15u;
        var fo: i32; var go: i32;
        if (4u == 8u) { fo = pk15_sext((*a).w[4u] >> 15u); go = pk15_sext((*b).w[4u] >> 15u); }
        else { fo = i32(((*a).w[4u] >> 15u) & PK15_MASK); go = i32(((*b).w[4u] >> 15u) & PK15_MASK); }
        let po = fo * x + go * y + carry;
        acc[4u] = le | ((bitcast<u32>(po) & PK15_MASK) << 15u); carry = po >> 15u;
    }
{
        let pe = i32((*a).w[5u] & PK15_MASK) * x + i32((*b).w[5u] & PK15_MASK) * y + carry;
        let le = bitcast<u32>(pe) & PK15_MASK; carry = pe >> 15u;
        var fo: i32; var go: i32;
        if (5u == 8u) { fo = pk15_sext((*a).w[5u] >> 15u); go = pk15_sext((*b).w[5u] >> 15u); }
        else { fo = i32(((*a).w[5u] >> 15u) & PK15_MASK); go = i32(((*b).w[5u] >> 15u) & PK15_MASK); }
        let po = fo * x + go * y + carry;
        acc[5u] = le | ((bitcast<u32>(po) & PK15_MASK) << 15u); carry = po >> 15u;
    }
{
        let pe = i32((*a).w[6u] & PK15_MASK) * x + i32((*b).w[6u] & PK15_MASK) * y + carry;
        let le = bitcast<u32>(pe) & PK15_MASK; carry = pe >> 15u;
        var fo: i32; var go: i32;
        if (6u == 8u) { fo = pk15_sext((*a).w[6u] >> 15u); go = pk15_sext((*b).w[6u] >> 15u); }
        else { fo = i32(((*a).w[6u] >> 15u) & PK15_MASK); go = i32(((*b).w[6u] >> 15u) & PK15_MASK); }
        let po = fo * x + go * y + carry;
        acc[6u] = le | ((bitcast<u32>(po) & PK15_MASK) << 15u); carry = po >> 15u;
    }
{
        let pe = i32((*a).w[7u] & PK15_MASK) * x + i32((*b).w[7u] & PK15_MASK) * y + carry;
        let le = bitcast<u32>(pe) & PK15_MASK; carry = pe >> 15u;
        var fo: i32; var go: i32;
        if (7u == 8u) { fo = pk15_sext((*a).w[7u] >> 15u); go = pk15_sext((*b).w[7u] >> 15u); }
        else { fo = i32(((*a).w[7u] >> 15u) & PK15_MASK); go = i32(((*b).w[7u] >> 15u) & PK15_MASK); }
        let po = fo * x + go * y + carry;
        acc[7u] = le | ((bitcast<u32>(po) & PK15_MASK) << 15u); carry = po >> 15u;
    }
{
        let pe = i32((*a).w[8u] & PK15_MASK) * x + i32((*b).w[8u] & PK15_MASK) * y + carry;
        let le = bitcast<u32>(pe) & PK15_MASK; carry = pe >> 15u;
        var fo: i32; var go: i32;
        if (8u == 8u) { fo = pk15_sext((*a).w[8u] >> 15u); go = pk15_sext((*b).w[8u] >> 15u); }
        else { fo = i32(((*a).w[8u] >> 15u) & PK15_MASK); go = i32(((*b).w[8u] >> 15u) & PK15_MASK); }
        let po = fo * x + go * y + carry;
        acc[8u] = le | ((bitcast<u32>(po) & PK15_MASK) << 15u); carry = po >> 15u;
    }

    {
        let ae = acc[0u] & PK15_MASK; let ao = (acc[0u] >> 15u) & PK15_MASK;
        var nextE: u32; if (0u == 8u) { nextE = bitcast<u32>(carry) & PK15_MASK; } else { nextE = acc[1u] & PK15_MASK; }
        let oe = (ae >> PK15_K) | ((ao & PK15_KMASK) << PK15_BOT);
        let oo = (ao >> PK15_K) | ((nextE & PK15_KMASK) << PK15_BOT);
        (*out).w[0u] = (oe & PK15_MASK) | ((oo & PK15_MASK) << 15u);
    }
{
        let ae = acc[1u] & PK15_MASK; let ao = (acc[1u] >> 15u) & PK15_MASK;
        var nextE: u32; if (1u == 8u) { nextE = bitcast<u32>(carry) & PK15_MASK; } else { nextE = acc[2u] & PK15_MASK; }
        let oe = (ae >> PK15_K) | ((ao & PK15_KMASK) << PK15_BOT);
        let oo = (ao >> PK15_K) | ((nextE & PK15_KMASK) << PK15_BOT);
        (*out).w[1u] = (oe & PK15_MASK) | ((oo & PK15_MASK) << 15u);
    }
{
        let ae = acc[2u] & PK15_MASK; let ao = (acc[2u] >> 15u) & PK15_MASK;
        var nextE: u32; if (2u == 8u) { nextE = bitcast<u32>(carry) & PK15_MASK; } else { nextE = acc[3u] & PK15_MASK; }
        let oe = (ae >> PK15_K) | ((ao & PK15_KMASK) << PK15_BOT);
        let oo = (ao >> PK15_K) | ((nextE & PK15_KMASK) << PK15_BOT);
        (*out).w[2u] = (oe & PK15_MASK) | ((oo & PK15_MASK) << 15u);
    }
{
        let ae = acc[3u] & PK15_MASK; let ao = (acc[3u] >> 15u) & PK15_MASK;
        var nextE: u32; if (3u == 8u) { nextE = bitcast<u32>(carry) & PK15_MASK; } else { nextE = acc[4u] & PK15_MASK; }
        let oe = (ae >> PK15_K) | ((ao & PK15_KMASK) << PK15_BOT);
        let oo = (ao >> PK15_K) | ((nextE & PK15_KMASK) << PK15_BOT);
        (*out).w[3u] = (oe & PK15_MASK) | ((oo & PK15_MASK) << 15u);
    }
{
        let ae = acc[4u] & PK15_MASK; let ao = (acc[4u] >> 15u) & PK15_MASK;
        var nextE: u32; if (4u == 8u) { nextE = bitcast<u32>(carry) & PK15_MASK; } else { nextE = acc[5u] & PK15_MASK; }
        let oe = (ae >> PK15_K) | ((ao & PK15_KMASK) << PK15_BOT);
        let oo = (ao >> PK15_K) | ((nextE & PK15_KMASK) << PK15_BOT);
        (*out).w[4u] = (oe & PK15_MASK) | ((oo & PK15_MASK) << 15u);
    }
{
        let ae = acc[5u] & PK15_MASK; let ao = (acc[5u] >> 15u) & PK15_MASK;
        var nextE: u32; if (5u == 8u) { nextE = bitcast<u32>(carry) & PK15_MASK; } else { nextE = acc[6u] & PK15_MASK; }
        let oe = (ae >> PK15_K) | ((ao & PK15_KMASK) << PK15_BOT);
        let oo = (ao >> PK15_K) | ((nextE & PK15_KMASK) << PK15_BOT);
        (*out).w[5u] = (oe & PK15_MASK) | ((oo & PK15_MASK) << 15u);
    }
{
        let ae = acc[6u] & PK15_MASK; let ao = (acc[6u] >> 15u) & PK15_MASK;
        var nextE: u32; if (6u == 8u) { nextE = bitcast<u32>(carry) & PK15_MASK; } else { nextE = acc[7u] & PK15_MASK; }
        let oe = (ae >> PK15_K) | ((ao & PK15_KMASK) << PK15_BOT);
        let oo = (ao >> PK15_K) | ((nextE & PK15_KMASK) << PK15_BOT);
        (*out).w[6u] = (oe & PK15_MASK) | ((oo & PK15_MASK) << 15u);
    }
{
        let ae = acc[7u] & PK15_MASK; let ao = (acc[7u] >> 15u) & PK15_MASK;
        var nextE: u32; if (7u == 8u) { nextE = bitcast<u32>(carry) & PK15_MASK; } else { nextE = acc[8u] & PK15_MASK; }
        let oe = (ae >> PK15_K) | ((ao & PK15_KMASK) << PK15_BOT);
        let oo = (ao >> PK15_K) | ((nextE & PK15_KMASK) << PK15_BOT);
        (*out).w[7u] = (oe & PK15_MASK) | ((oo & PK15_MASK) << 15u);
    }
{
        let ae = acc[8u] & PK15_MASK; let ao = (acc[8u] >> 15u) & PK15_MASK;
        var nextE: u32; if (8u == 8u) { nextE = bitcast<u32>(carry) & PK15_MASK; } else { nextE = acc[8u] & PK15_MASK; }
        let oe = (ae >> PK15_K) | ((ao & PK15_KMASK) << PK15_BOT);
        let oo = (ao >> PK15_K) | ((nextE & PK15_KMASK) << PK15_BOT);
        (*out).w[8u] = (oe & PK15_MASK) | ((oo & PK15_MASK) << 15u);
    }

}

// (u,v) <- halve_mod_p((x*a + y*b), K) = (x*a + y*b)*2^-K mod p, in [0,p).
fn pk15_axby_modp_halve_k(a: ptr<function, Pk9>, x: i32, b: ptr<function, Pk9>, y: i32, out: ptr<function, Pk9>) {
    var acc: array<u32, 9>;
    var carry: i32 = 0;
    {
        let pe = i32((*a).w[0u] & PK15_MASK) * x + i32((*b).w[0u] & PK15_MASK) * y + carry;
        let le = bitcast<u32>(pe) & PK15_MASK; carry = pe >> 15u;
        var fo: i32; var go: i32;
        if (0u == 8u) { fo = pk15_sext((*a).w[0u] >> 15u); go = pk15_sext((*b).w[0u] >> 15u); }
        else { fo = i32(((*a).w[0u] >> 15u) & PK15_MASK); go = i32(((*b).w[0u] >> 15u) & PK15_MASK); }
        let po = fo * x + go * y + carry;
        acc[0u] = le | ((bitcast<u32>(po) & PK15_MASK) << 15u); carry = po >> 15u;
    }
{
        let pe = i32((*a).w[1u] & PK15_MASK) * x + i32((*b).w[1u] & PK15_MASK) * y + carry;
        let le = bitcast<u32>(pe) & PK15_MASK; carry = pe >> 15u;
        var fo: i32; var go: i32;
        if (1u == 8u) { fo = pk15_sext((*a).w[1u] >> 15u); go = pk15_sext((*b).w[1u] >> 15u); }
        else { fo = i32(((*a).w[1u] >> 15u) & PK15_MASK); go = i32(((*b).w[1u] >> 15u) & PK15_MASK); }
        let po = fo * x + go * y + carry;
        acc[1u] = le | ((bitcast<u32>(po) & PK15_MASK) << 15u); carry = po >> 15u;
    }
{
        let pe = i32((*a).w[2u] & PK15_MASK) * x + i32((*b).w[2u] & PK15_MASK) * y + carry;
        let le = bitcast<u32>(pe) & PK15_MASK; carry = pe >> 15u;
        var fo: i32; var go: i32;
        if (2u == 8u) { fo = pk15_sext((*a).w[2u] >> 15u); go = pk15_sext((*b).w[2u] >> 15u); }
        else { fo = i32(((*a).w[2u] >> 15u) & PK15_MASK); go = i32(((*b).w[2u] >> 15u) & PK15_MASK); }
        let po = fo * x + go * y + carry;
        acc[2u] = le | ((bitcast<u32>(po) & PK15_MASK) << 15u); carry = po >> 15u;
    }
{
        let pe = i32((*a).w[3u] & PK15_MASK) * x + i32((*b).w[3u] & PK15_MASK) * y + carry;
        let le = bitcast<u32>(pe) & PK15_MASK; carry = pe >> 15u;
        var fo: i32; var go: i32;
        if (3u == 8u) { fo = pk15_sext((*a).w[3u] >> 15u); go = pk15_sext((*b).w[3u] >> 15u); }
        else { fo = i32(((*a).w[3u] >> 15u) & PK15_MASK); go = i32(((*b).w[3u] >> 15u) & PK15_MASK); }
        let po = fo * x + go * y + carry;
        acc[3u] = le | ((bitcast<u32>(po) & PK15_MASK) << 15u); carry = po >> 15u;
    }
{
        let pe = i32((*a).w[4u] & PK15_MASK) * x + i32((*b).w[4u] & PK15_MASK) * y + carry;
        let le = bitcast<u32>(pe) & PK15_MASK; carry = pe >> 15u;
        var fo: i32; var go: i32;
        if (4u == 8u) { fo = pk15_sext((*a).w[4u] >> 15u); go = pk15_sext((*b).w[4u] >> 15u); }
        else { fo = i32(((*a).w[4u] >> 15u) & PK15_MASK); go = i32(((*b).w[4u] >> 15u) & PK15_MASK); }
        let po = fo * x + go * y + carry;
        acc[4u] = le | ((bitcast<u32>(po) & PK15_MASK) << 15u); carry = po >> 15u;
    }
{
        let pe = i32((*a).w[5u] & PK15_MASK) * x + i32((*b).w[5u] & PK15_MASK) * y + carry;
        let le = bitcast<u32>(pe) & PK15_MASK; carry = pe >> 15u;
        var fo: i32; var go: i32;
        if (5u == 8u) { fo = pk15_sext((*a).w[5u] >> 15u); go = pk15_sext((*b).w[5u] >> 15u); }
        else { fo = i32(((*a).w[5u] >> 15u) & PK15_MASK); go = i32(((*b).w[5u] >> 15u) & PK15_MASK); }
        let po = fo * x + go * y + carry;
        acc[5u] = le | ((bitcast<u32>(po) & PK15_MASK) << 15u); carry = po >> 15u;
    }
{
        let pe = i32((*a).w[6u] & PK15_MASK) * x + i32((*b).w[6u] & PK15_MASK) * y + carry;
        let le = bitcast<u32>(pe) & PK15_MASK; carry = pe >> 15u;
        var fo: i32; var go: i32;
        if (6u == 8u) { fo = pk15_sext((*a).w[6u] >> 15u); go = pk15_sext((*b).w[6u] >> 15u); }
        else { fo = i32(((*a).w[6u] >> 15u) & PK15_MASK); go = i32(((*b).w[6u] >> 15u) & PK15_MASK); }
        let po = fo * x + go * y + carry;
        acc[6u] = le | ((bitcast<u32>(po) & PK15_MASK) << 15u); carry = po >> 15u;
    }
{
        let pe = i32((*a).w[7u] & PK15_MASK) * x + i32((*b).w[7u] & PK15_MASK) * y + carry;
        let le = bitcast<u32>(pe) & PK15_MASK; carry = pe >> 15u;
        var fo: i32; var go: i32;
        if (7u == 8u) { fo = pk15_sext((*a).w[7u] >> 15u); go = pk15_sext((*b).w[7u] >> 15u); }
        else { fo = i32(((*a).w[7u] >> 15u) & PK15_MASK); go = i32(((*b).w[7u] >> 15u) & PK15_MASK); }
        let po = fo * x + go * y + carry;
        acc[7u] = le | ((bitcast<u32>(po) & PK15_MASK) << 15u); carry = po >> 15u;
    }
{
        let pe = i32((*a).w[8u] & PK15_MASK) * x + i32((*b).w[8u] & PK15_MASK) * y + carry;
        let le = bitcast<u32>(pe) & PK15_MASK; carry = pe >> 15u;
        var fo: i32; var go: i32;
        if (8u == 8u) { fo = pk15_sext((*a).w[8u] >> 15u); go = pk15_sext((*b).w[8u] >> 15u); }
        else { fo = i32(((*a).w[8u] >> 15u) & PK15_MASK); go = i32(((*b).w[8u] >> 15u) & PK15_MASK); }
        let po = fo * x + go * y + carry;
        acc[8u] = le | ((bitcast<u32>(po) & PK15_MASK) << 15u); carry = po >> 15u;
    }

    let lo_k = acc[0] & PK15_KMASK;
    let m = ((((PK15_KMASK + 1u) - lo_k) & PK15_KMASK) * PK15_PINV) & PK15_KMASK;
    var mp: u32 = 0u;
    {
        let e = (acc[0u] & PK15_MASK) + pk15_p(0u) * m + mp; let le = e & PK15_MASK; mp = e >> 15u;
        let o = ((acc[0u] >> 15u) & PK15_MASK) + pk15_p(1u) * m + mp; let lo = o & PK15_MASK; mp = o >> 15u;
        acc[0u] = le | (lo << 15u);
    }
{
        let e = (acc[1u] & PK15_MASK) + pk15_p(2u) * m + mp; let le = e & PK15_MASK; mp = e >> 15u;
        let o = ((acc[1u] >> 15u) & PK15_MASK) + pk15_p(3u) * m + mp; let lo = o & PK15_MASK; mp = o >> 15u;
        acc[1u] = le | (lo << 15u);
    }
{
        let e = (acc[2u] & PK15_MASK) + pk15_p(4u) * m + mp; let le = e & PK15_MASK; mp = e >> 15u;
        let o = ((acc[2u] >> 15u) & PK15_MASK) + pk15_p(5u) * m + mp; let lo = o & PK15_MASK; mp = o >> 15u;
        acc[2u] = le | (lo << 15u);
    }
{
        let e = (acc[3u] & PK15_MASK) + pk15_p(6u) * m + mp; let le = e & PK15_MASK; mp = e >> 15u;
        let o = ((acc[3u] >> 15u) & PK15_MASK) + pk15_p(7u) * m + mp; let lo = o & PK15_MASK; mp = o >> 15u;
        acc[3u] = le | (lo << 15u);
    }
{
        let e = (acc[4u] & PK15_MASK) + pk15_p(8u) * m + mp; let le = e & PK15_MASK; mp = e >> 15u;
        let o = ((acc[4u] >> 15u) & PK15_MASK) + pk15_p(9u) * m + mp; let lo = o & PK15_MASK; mp = o >> 15u;
        acc[4u] = le | (lo << 15u);
    }
{
        let e = (acc[5u] & PK15_MASK) + pk15_p(10u) * m + mp; let le = e & PK15_MASK; mp = e >> 15u;
        let o = ((acc[5u] >> 15u) & PK15_MASK) + pk15_p(11u) * m + mp; let lo = o & PK15_MASK; mp = o >> 15u;
        acc[5u] = le | (lo << 15u);
    }
{
        let e = (acc[6u] & PK15_MASK) + pk15_p(12u) * m + mp; let le = e & PK15_MASK; mp = e >> 15u;
        let o = ((acc[6u] >> 15u) & PK15_MASK) + pk15_p(13u) * m + mp; let lo = o & PK15_MASK; mp = o >> 15u;
        acc[6u] = le | (lo << 15u);
    }
{
        let e = (acc[7u] & PK15_MASK) + pk15_p(14u) * m + mp; let le = e & PK15_MASK; mp = e >> 15u;
        let o = ((acc[7u] >> 15u) & PK15_MASK) + pk15_p(15u) * m + mp; let lo = o & PK15_MASK; mp = o >> 15u;
        acc[7u] = le | (lo << 15u);
    }
{
        let e = (acc[8u] & PK15_MASK) + pk15_p(16u) * m + mp; let le = e & PK15_MASK; mp = e >> 15u;
        let o = ((acc[8u] >> 15u) & PK15_MASK) + pk15_p(17u) * m + mp; let lo = o & PK15_MASK; mp = o >> 15u;
        acc[8u] = le | (lo << 15u);
    }

    let new_carry = carry + i32(mp);
    {
        let ae = acc[0u] & PK15_MASK; let ao = (acc[0u] >> 15u) & PK15_MASK;
        var nextE: u32; if (0u == 8u) { nextE = bitcast<u32>(new_carry) & PK15_MASK; } else { nextE = acc[1u] & PK15_MASK; }
        let oe = (ae >> PK15_K) | ((ao & PK15_KMASK) << PK15_BOT);
        let oo = (ao >> PK15_K) | ((nextE & PK15_KMASK) << PK15_BOT);
        (*out).w[0u] = (oe & PK15_MASK) | ((oo & PK15_MASK) << 15u);
    }
{
        let ae = acc[1u] & PK15_MASK; let ao = (acc[1u] >> 15u) & PK15_MASK;
        var nextE: u32; if (1u == 8u) { nextE = bitcast<u32>(new_carry) & PK15_MASK; } else { nextE = acc[2u] & PK15_MASK; }
        let oe = (ae >> PK15_K) | ((ao & PK15_KMASK) << PK15_BOT);
        let oo = (ao >> PK15_K) | ((nextE & PK15_KMASK) << PK15_BOT);
        (*out).w[1u] = (oe & PK15_MASK) | ((oo & PK15_MASK) << 15u);
    }
{
        let ae = acc[2u] & PK15_MASK; let ao = (acc[2u] >> 15u) & PK15_MASK;
        var nextE: u32; if (2u == 8u) { nextE = bitcast<u32>(new_carry) & PK15_MASK; } else { nextE = acc[3u] & PK15_MASK; }
        let oe = (ae >> PK15_K) | ((ao & PK15_KMASK) << PK15_BOT);
        let oo = (ao >> PK15_K) | ((nextE & PK15_KMASK) << PK15_BOT);
        (*out).w[2u] = (oe & PK15_MASK) | ((oo & PK15_MASK) << 15u);
    }
{
        let ae = acc[3u] & PK15_MASK; let ao = (acc[3u] >> 15u) & PK15_MASK;
        var nextE: u32; if (3u == 8u) { nextE = bitcast<u32>(new_carry) & PK15_MASK; } else { nextE = acc[4u] & PK15_MASK; }
        let oe = (ae >> PK15_K) | ((ao & PK15_KMASK) << PK15_BOT);
        let oo = (ao >> PK15_K) | ((nextE & PK15_KMASK) << PK15_BOT);
        (*out).w[3u] = (oe & PK15_MASK) | ((oo & PK15_MASK) << 15u);
    }
{
        let ae = acc[4u] & PK15_MASK; let ao = (acc[4u] >> 15u) & PK15_MASK;
        var nextE: u32; if (4u == 8u) { nextE = bitcast<u32>(new_carry) & PK15_MASK; } else { nextE = acc[5u] & PK15_MASK; }
        let oe = (ae >> PK15_K) | ((ao & PK15_KMASK) << PK15_BOT);
        let oo = (ao >> PK15_K) | ((nextE & PK15_KMASK) << PK15_BOT);
        (*out).w[4u] = (oe & PK15_MASK) | ((oo & PK15_MASK) << 15u);
    }
{
        let ae = acc[5u] & PK15_MASK; let ao = (acc[5u] >> 15u) & PK15_MASK;
        var nextE: u32; if (5u == 8u) { nextE = bitcast<u32>(new_carry) & PK15_MASK; } else { nextE = acc[6u] & PK15_MASK; }
        let oe = (ae >> PK15_K) | ((ao & PK15_KMASK) << PK15_BOT);
        let oo = (ao >> PK15_K) | ((nextE & PK15_KMASK) << PK15_BOT);
        (*out).w[5u] = (oe & PK15_MASK) | ((oo & PK15_MASK) << 15u);
    }
{
        let ae = acc[6u] & PK15_MASK; let ao = (acc[6u] >> 15u) & PK15_MASK;
        var nextE: u32; if (6u == 8u) { nextE = bitcast<u32>(new_carry) & PK15_MASK; } else { nextE = acc[7u] & PK15_MASK; }
        let oe = (ae >> PK15_K) | ((ao & PK15_KMASK) << PK15_BOT);
        let oo = (ao >> PK15_K) | ((nextE & PK15_KMASK) << PK15_BOT);
        (*out).w[6u] = (oe & PK15_MASK) | ((oo & PK15_MASK) << 15u);
    }
{
        let ae = acc[7u] & PK15_MASK; let ao = (acc[7u] >> 15u) & PK15_MASK;
        var nextE: u32; if (7u == 8u) { nextE = bitcast<u32>(new_carry) & PK15_MASK; } else { nextE = acc[8u] & PK15_MASK; }
        let oe = (ae >> PK15_K) | ((ao & PK15_KMASK) << PK15_BOT);
        let oo = (ao >> PK15_K) | ((nextE & PK15_KMASK) << PK15_BOT);
        (*out).w[7u] = (oe & PK15_MASK) | ((oo & PK15_MASK) << 15u);
    }
{
        let ae = acc[8u] & PK15_MASK; let ao = (acc[8u] >> 15u) & PK15_MASK;
        var nextE: u32; if (8u == 8u) { nextE = bitcast<u32>(new_carry) & PK15_MASK; } else { nextE = acc[8u] & PK15_MASK; }
        let oe = (ae >> PK15_K) | ((ao & PK15_KMASK) << PK15_BOT);
        let oo = (ao >> PK15_K) | ((nextE & PK15_KMASK) << PK15_BOT);
        (*out).w[8u] = (oe & PK15_MASK) | ((oo & PK15_MASK) << 15u);
    }

    pk15_norm_modp(out);
}

fn fr_inv_by_loop_pk15(a: BigInt) -> BigInt {
    var f: Pk9; var g: Pk9; var u: Pk9; var v: Pk9;
    { f.w[0u] = pk15_pw(0u); g.w[0u] = 0u; u.w[0u] = 0u; v.w[0u] = 0u; }
{ f.w[1u] = pk15_pw(1u); g.w[1u] = 0u; u.w[1u] = 0u; v.w[1u] = 0u; }
{ f.w[2u] = pk15_pw(2u); g.w[2u] = 0u; u.w[2u] = 0u; v.w[2u] = 0u; }
{ f.w[3u] = pk15_pw(3u); g.w[3u] = 0u; u.w[3u] = 0u; v.w[3u] = 0u; }
{ f.w[4u] = pk15_pw(4u); g.w[4u] = 0u; u.w[4u] = 0u; v.w[4u] = 0u; }
{ f.w[5u] = pk15_pw(5u); g.w[5u] = 0u; u.w[5u] = 0u; v.w[5u] = 0u; }
{ f.w[6u] = pk15_pw(6u); g.w[6u] = 0u; u.w[6u] = 0u; v.w[6u] = 0u; }
{ f.w[7u] = pk15_pw(7u); g.w[7u] = 0u; u.w[7u] = 0u; v.w[7u] = 0u; }
{ f.w[8u] = pk15_pw(8u); g.w[8u] = 0u; u.w[8u] = 0u; v.w[8u] = 0u; }

    { g.w[0u] = g.w[0u] | (a.limbs[0u] << ((0u) * 15u)); }
{ g.w[0u] = g.w[0u] | (a.limbs[1u] << ((1u) * 15u)); }
{ g.w[1u] = g.w[1u] | (a.limbs[2u] << ((0u) * 15u)); }
{ g.w[1u] = g.w[1u] | (a.limbs[3u] << ((1u) * 15u)); }
{ g.w[2u] = g.w[2u] | (a.limbs[4u] << ((0u) * 15u)); }
{ g.w[2u] = g.w[2u] | (a.limbs[5u] << ((1u) * 15u)); }
{ g.w[3u] = g.w[3u] | (a.limbs[6u] << ((0u) * 15u)); }
{ g.w[3u] = g.w[3u] | (a.limbs[7u] << ((1u) * 15u)); }
{ g.w[4u] = g.w[4u] | (a.limbs[8u] << ((0u) * 15u)); }
{ g.w[4u] = g.w[4u] | (a.limbs[9u] << ((1u) * 15u)); }
{ g.w[5u] = g.w[5u] | (a.limbs[10u] << ((0u) * 15u)); }
{ g.w[5u] = g.w[5u] | (a.limbs[11u] << ((1u) * 15u)); }
{ g.w[6u] = g.w[6u] | (a.limbs[12u] << ((0u) * 15u)); }
{ g.w[6u] = g.w[6u] | (a.limbs[13u] << ((1u) * 15u)); }
{ g.w[7u] = g.w[7u] | (a.limbs[14u] << ((0u) * 15u)); }
{ g.w[7u] = g.w[7u] | (a.limbs[15u] << ((1u) * 15u)); }
{ g.w[8u] = g.w[8u] | (a.limbs[16u] << ((0u) * 15u)); }

    v.w[0] = 1u;
    var delta: i32 = 1;
    var found = false;
    for (var outer: u32 = 0u; outer < PK15_MAX_OUTER; outer = outer + 1u) {
        if (pk15_is_zero(&g)) { found = true; break; }
        var u00: i32 = 1; var u01: i32 = 0; var u10: i32 = 0; var u11: i32 = 1;
        var fi: i32 = i32(f.w[0] & PK15_MASK); var gi: i32 = i32(g.w[0] & PK15_MASK); var d: i32 = delta;
        {
            let g_low: i32 = gi & 1i;
            if ((d > 0i) && (g_low == 1i)) {
                let n00 = u10 * 2i; let n01 = u11 * 2i; let n10 = u10 - u00; let n11 = u11 - u01;
                let nf = gi; gi = gi - fi; fi = nf; u00 = n00; u01 = n01; u10 = n10; u11 = n11; d = 1i - d;
            } else if (g_low == 1i) {
                u10 = u00 + u10; u11 = u01 + u11; u00 = u00 * 2i; u01 = u01 * 2i; gi = gi + fi; d = d + 1i;
            } else {
                u00 = u00 * 2i; u01 = u01 * 2i; d = d + 1i;
            }
            gi = gi >> 1u;
        }
{
            let g_low: i32 = gi & 1i;
            if ((d > 0i) && (g_low == 1i)) {
                let n00 = u10 * 2i; let n01 = u11 * 2i; let n10 = u10 - u00; let n11 = u11 - u01;
                let nf = gi; gi = gi - fi; fi = nf; u00 = n00; u01 = n01; u10 = n10; u11 = n11; d = 1i - d;
            } else if (g_low == 1i) {
                u10 = u00 + u10; u11 = u01 + u11; u00 = u00 * 2i; u01 = u01 * 2i; gi = gi + fi; d = d + 1i;
            } else {
                u00 = u00 * 2i; u01 = u01 * 2i; d = d + 1i;
            }
            gi = gi >> 1u;
        }
{
            let g_low: i32 = gi & 1i;
            if ((d > 0i) && (g_low == 1i)) {
                let n00 = u10 * 2i; let n01 = u11 * 2i; let n10 = u10 - u00; let n11 = u11 - u01;
                let nf = gi; gi = gi - fi; fi = nf; u00 = n00; u01 = n01; u10 = n10; u11 = n11; d = 1i - d;
            } else if (g_low == 1i) {
                u10 = u00 + u10; u11 = u01 + u11; u00 = u00 * 2i; u01 = u01 * 2i; gi = gi + fi; d = d + 1i;
            } else {
                u00 = u00 * 2i; u01 = u01 * 2i; d = d + 1i;
            }
            gi = gi >> 1u;
        }
{
            let g_low: i32 = gi & 1i;
            if ((d > 0i) && (g_low == 1i)) {
                let n00 = u10 * 2i; let n01 = u11 * 2i; let n10 = u10 - u00; let n11 = u11 - u01;
                let nf = gi; gi = gi - fi; fi = nf; u00 = n00; u01 = n01; u10 = n10; u11 = n11; d = 1i - d;
            } else if (g_low == 1i) {
                u10 = u00 + u10; u11 = u01 + u11; u00 = u00 * 2i; u01 = u01 * 2i; gi = gi + fi; d = d + 1i;
            } else {
                u00 = u00 * 2i; u01 = u01 * 2i; d = d + 1i;
            }
            gi = gi >> 1u;
        }
{
            let g_low: i32 = gi & 1i;
            if ((d > 0i) && (g_low == 1i)) {
                let n00 = u10 * 2i; let n01 = u11 * 2i; let n10 = u10 - u00; let n11 = u11 - u01;
                let nf = gi; gi = gi - fi; fi = nf; u00 = n00; u01 = n01; u10 = n10; u11 = n11; d = 1i - d;
            } else if (g_low == 1i) {
                u10 = u00 + u10; u11 = u01 + u11; u00 = u00 * 2i; u01 = u01 * 2i; gi = gi + fi; d = d + 1i;
            } else {
                u00 = u00 * 2i; u01 = u01 * 2i; d = d + 1i;
            }
            gi = gi >> 1u;
        }
{
            let g_low: i32 = gi & 1i;
            if ((d > 0i) && (g_low == 1i)) {
                let n00 = u10 * 2i; let n01 = u11 * 2i; let n10 = u10 - u00; let n11 = u11 - u01;
                let nf = gi; gi = gi - fi; fi = nf; u00 = n00; u01 = n01; u10 = n10; u11 = n11; d = 1i - d;
            } else if (g_low == 1i) {
                u10 = u00 + u10; u11 = u01 + u11; u00 = u00 * 2i; u01 = u01 * 2i; gi = gi + fi; d = d + 1i;
            } else {
                u00 = u00 * 2i; u01 = u01 * 2i; d = d + 1i;
            }
            gi = gi >> 1u;
        }
{
            let g_low: i32 = gi & 1i;
            if ((d > 0i) && (g_low == 1i)) {
                let n00 = u10 * 2i; let n01 = u11 * 2i; let n10 = u10 - u00; let n11 = u11 - u01;
                let nf = gi; gi = gi - fi; fi = nf; u00 = n00; u01 = n01; u10 = n10; u11 = n11; d = 1i - d;
            } else if (g_low == 1i) {
                u10 = u00 + u10; u11 = u01 + u11; u00 = u00 * 2i; u01 = u01 * 2i; gi = gi + fi; d = d + 1i;
            } else {
                u00 = u00 * 2i; u01 = u01 * 2i; d = d + 1i;
            }
            gi = gi >> 1u;
        }
{
            let g_low: i32 = gi & 1i;
            if ((d > 0i) && (g_low == 1i)) {
                let n00 = u10 * 2i; let n01 = u11 * 2i; let n10 = u10 - u00; let n11 = u11 - u01;
                let nf = gi; gi = gi - fi; fi = nf; u00 = n00; u01 = n01; u10 = n10; u11 = n11; d = 1i - d;
            } else if (g_low == 1i) {
                u10 = u00 + u10; u11 = u01 + u11; u00 = u00 * 2i; u01 = u01 * 2i; gi = gi + fi; d = d + 1i;
            } else {
                u00 = u00 * 2i; u01 = u01 * 2i; d = d + 1i;
            }
            gi = gi >> 1u;
        }
{
            let g_low: i32 = gi & 1i;
            if ((d > 0i) && (g_low == 1i)) {
                let n00 = u10 * 2i; let n01 = u11 * 2i; let n10 = u10 - u00; let n11 = u11 - u01;
                let nf = gi; gi = gi - fi; fi = nf; u00 = n00; u01 = n01; u10 = n10; u11 = n11; d = 1i - d;
            } else if (g_low == 1i) {
                u10 = u00 + u10; u11 = u01 + u11; u00 = u00 * 2i; u01 = u01 * 2i; gi = gi + fi; d = d + 1i;
            } else {
                u00 = u00 * 2i; u01 = u01 * 2i; d = d + 1i;
            }
            gi = gi >> 1u;
        }
{
            let g_low: i32 = gi & 1i;
            if ((d > 0i) && (g_low == 1i)) {
                let n00 = u10 * 2i; let n01 = u11 * 2i; let n10 = u10 - u00; let n11 = u11 - u01;
                let nf = gi; gi = gi - fi; fi = nf; u00 = n00; u01 = n01; u10 = n10; u11 = n11; d = 1i - d;
            } else if (g_low == 1i) {
                u10 = u00 + u10; u11 = u01 + u11; u00 = u00 * 2i; u01 = u01 * 2i; gi = gi + fi; d = d + 1i;
            } else {
                u00 = u00 * 2i; u01 = u01 * 2i; d = d + 1i;
            }
            gi = gi >> 1u;
        }
{
            let g_low: i32 = gi & 1i;
            if ((d > 0i) && (g_low == 1i)) {
                let n00 = u10 * 2i; let n01 = u11 * 2i; let n10 = u10 - u00; let n11 = u11 - u01;
                let nf = gi; gi = gi - fi; fi = nf; u00 = n00; u01 = n01; u10 = n10; u11 = n11; d = 1i - d;
            } else if (g_low == 1i) {
                u10 = u00 + u10; u11 = u01 + u11; u00 = u00 * 2i; u01 = u01 * 2i; gi = gi + fi; d = d + 1i;
            } else {
                u00 = u00 * 2i; u01 = u01 * 2i; d = d + 1i;
            }
            gi = gi >> 1u;
        }
{
            let g_low: i32 = gi & 1i;
            if ((d > 0i) && (g_low == 1i)) {
                let n00 = u10 * 2i; let n01 = u11 * 2i; let n10 = u10 - u00; let n11 = u11 - u01;
                let nf = gi; gi = gi - fi; fi = nf; u00 = n00; u01 = n01; u10 = n10; u11 = n11; d = 1i - d;
            } else if (g_low == 1i) {
                u10 = u00 + u10; u11 = u01 + u11; u00 = u00 * 2i; u01 = u01 * 2i; gi = gi + fi; d = d + 1i;
            } else {
                u00 = u00 * 2i; u01 = u01 * 2i; d = d + 1i;
            }
            gi = gi >> 1u;
        }
{
            let g_low: i32 = gi & 1i;
            if ((d > 0i) && (g_low == 1i)) {
                let n00 = u10 * 2i; let n01 = u11 * 2i; let n10 = u10 - u00; let n11 = u11 - u01;
                let nf = gi; gi = gi - fi; fi = nf; u00 = n00; u01 = n01; u10 = n10; u11 = n11; d = 1i - d;
            } else if (g_low == 1i) {
                u10 = u00 + u10; u11 = u01 + u11; u00 = u00 * 2i; u01 = u01 * 2i; gi = gi + fi; d = d + 1i;
            } else {
                u00 = u00 * 2i; u01 = u01 * 2i; d = d + 1i;
            }
            gi = gi >> 1u;
        }
{
            let g_low: i32 = gi & 1i;
            if ((d > 0i) && (g_low == 1i)) {
                let n00 = u10 * 2i; let n01 = u11 * 2i; let n10 = u10 - u00; let n11 = u11 - u01;
                let nf = gi; gi = gi - fi; fi = nf; u00 = n00; u01 = n01; u10 = n10; u11 = n11; d = 1i - d;
            } else if (g_low == 1i) {
                u10 = u00 + u10; u11 = u01 + u11; u00 = u00 * 2i; u01 = u01 * 2i; gi = gi + fi; d = d + 1i;
            } else {
                u00 = u00 * 2i; u01 = u01 * 2i; d = d + 1i;
            }
            gi = gi >> 1u;
        }
{
            let g_low: i32 = gi & 1i;
            if ((d > 0i) && (g_low == 1i)) {
                let n00 = u10 * 2i; let n01 = u11 * 2i; let n10 = u10 - u00; let n11 = u11 - u01;
                let nf = gi; gi = gi - fi; fi = nf; u00 = n00; u01 = n01; u10 = n10; u11 = n11; d = 1i - d;
            } else if (g_low == 1i) {
                u10 = u00 + u10; u11 = u01 + u11; u00 = u00 * 2i; u01 = u01 * 2i; gi = gi + fi; d = d + 1i;
            } else {
                u00 = u00 * 2i; u01 = u01 * 2i; d = d + 1i;
            }
            gi = gi >> 1u;
        }

        delta = d;
        var nf: Pk9; var ng: Pk9;
        pk15_axby_shr_k(&f, u00, &g, u01, &nf);
        pk15_axby_shr_k(&f, u10, &g, u11, &ng);
        f = nf; g = ng;
        var nu: Pk9; var nv: Pk9;
        pk15_axby_modp_halve_k(&u, u00, &v, u01, &nu);
        pk15_axby_modp_halve_k(&u, u10, &v, u11, &nv);
        u = nu; v = nv;
    }
    pk15_norm_modp(&u);
    if (pk15_is_neg(&f)) { pk15_neg_modp(&u); }
    var d17: BigInt;
    { d17.limbs[0u] = (u.w[0u] >> ((0u) * 15u)) & PK15_MASK; }
{ d17.limbs[1u] = (u.w[0u] >> ((1u) * 15u)) & PK15_MASK; }
{ d17.limbs[2u] = (u.w[1u] >> ((0u) * 15u)) & PK15_MASK; }
{ d17.limbs[3u] = (u.w[1u] >> ((1u) * 15u)) & PK15_MASK; }
{ d17.limbs[4u] = (u.w[2u] >> ((0u) * 15u)) & PK15_MASK; }
{ d17.limbs[5u] = (u.w[2u] >> ((1u) * 15u)) & PK15_MASK; }
{ d17.limbs[6u] = (u.w[3u] >> ((0u) * 15u)) & PK15_MASK; }
{ d17.limbs[7u] = (u.w[3u] >> ((1u) * 15u)) & PK15_MASK; }
{ d17.limbs[8u] = (u.w[4u] >> ((0u) * 15u)) & PK15_MASK; }
{ d17.limbs[9u] = (u.w[4u] >> ((1u) * 15u)) & PK15_MASK; }
{ d17.limbs[10u] = (u.w[5u] >> ((0u) * 15u)) & PK15_MASK; }
{ d17.limbs[11u] = (u.w[5u] >> ((1u) * 15u)) & PK15_MASK; }
{ d17.limbs[12u] = (u.w[6u] >> ((0u) * 15u)) & PK15_MASK; }
{ d17.limbs[13u] = (u.w[6u] >> ((1u) * 15u)) & PK15_MASK; }
{ d17.limbs[14u] = (u.w[7u] >> ((0u) * 15u)) & PK15_MASK; }
{ d17.limbs[15u] = (u.w[7u] >> ((1u) * 15u)) & PK15_MASK; }
{ d17.limbs[16u] = (u.w[8u] >> ((0u) * 15u)) & PK15_MASK; }

    var r_cubed: BigInt = get_r_cubed();
    return montgomery_product(&d17, &r_cubed);
}
