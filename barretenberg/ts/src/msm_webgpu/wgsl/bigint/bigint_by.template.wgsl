// WGSL bigint helpers for the Bernstein-Yang safegcd inversion port
// (sub-step 1.2 of the WebGPU MSM rewrite plan). The semantics here MUST
// match the TS reference at cuzk/bernstein_yang.ts exactly so divsteps /
// apply_matrix can be transliterated against this file in sub-step 1.3.
//
// REPRESENTATIONS
//   - BigIntBY: 9 limbs of signed-29-bit chunks (i32). Top limb carries
//     sign; lower limbs in [0, 2^29) post-normalise. Matches Wasm9x29.
//   - u64 as vec2<u32>: value = .x + (.y << 32). All u64 ops use this.
//   - i64 as vec2<i32>: value = u32(.x) + (i32(.y) << 32). The low half
//     carries the raw bit pattern (treated as unsigned), the high half
//     is signed. Used for matrix entries u/v/q/r which grow to ±2^58.
//
// LOOP BOUND DISCIPLINE
//   Every `for` loop in this file uses a const upper bound (BY_NUM_LIMBS).
//   The WGSL bounded-loop audit is `grep 'for ' ...`, run after Mustache
//   render — every match has `< BY_NUM_LIMBS` or `< {{ num_words }}`.

const BY_NUM_LIMBS: u32 = 9u;
const BY_LIMB_BITS: u32 = 29u;
const BY_LIMB_MASK: u32 = (1u << 29u) - 1u;
const BY_BATCH: u32 = 58u;
const BY_NUM_OUTER: u32 = 13u;
const BY_REDUCE_INTERVAL: u32 = 4u;
const BY_RTC_MAX_ITERS: u32 = 36u;

// 29-bit signed limb wrapped as i32. Lower limbs canonical in [0, 2^29);
// top limb is the signed extension carrier.
struct BigIntBY {
    l: array<i32, 9>,
}

// ============================================================
// u64 arithmetic as vec2<u32> (x = .x + (.y << 32))
// ============================================================

// u64 add. Pre: any a, b. Post: low 64 bits of a + b.
fn u64_add(a: vec2<u32>, b: vec2<u32>) -> vec2<u32> {
    let lo = a.x + b.x;
    let carry = select(0u, 1u, lo < a.x);
    let hi = a.y + b.y + carry;
    return vec2<u32>(lo, hi);
}

// u64 sub. Pre: any a, b. Post: low 64 bits of (a - b) mod 2^64.
fn u64_sub(a: vec2<u32>, b: vec2<u32>) -> vec2<u32> {
    let lo = a.x - b.x;
    let borrow = select(0u, 1u, a.x < b.x);
    let hi = a.y - b.y - borrow;
    return vec2<u32>(lo, hi);
}

// u64 logical right shift by 1. Pre: any x. Post: x >> 1 unsigned.
fn u64_shr1(x: vec2<u32>) -> vec2<u32> {
    let lo = (x.x >> 1u) | ((x.y & 1u) << 31u);
    let hi = x.y >> 1u;
    return vec2<u32>(lo, hi);
}

// Bit 0 of a u64. Pre: any x. Post: 0 or 1.
fn u64_low_bit(x: vec2<u32>) -> u32 {
    return x.x & 1u;
}

// u64 two's-complement negate. Pre: any x. Post: (-x) mod 2^64.
fn u64_neg(x: vec2<u32>) -> vec2<u32> {
    let nx = vec2<u32>(~x.x, ~x.y);
    return u64_add(nx, vec2<u32>(1u, 0u));
}

// u64 bitwise AND. Pre: any a, mask. Post: a & mask, limbwise.
fn u64_and(a: vec2<u32>, mask: vec2<u32>) -> vec2<u32> {
    return vec2<u32>(a.x & mask.x, a.y & mask.y);
}

// ============================================================
// i64 signed arithmetic as vec2<i32> (lo bits, hi signed)
// value = u32(.x) + (i32(.y) << 32) treated as signed two's-complement.
// ============================================================

// i64 add. Pre: |a|, |b| < 2^63. Post: low 64 bits of a + b, signed.
fn i64_add_pair(a: vec2<i32>, b: vec2<i32>) -> vec2<i32> {
    let au = u32(a.x);
    let bu = u32(b.x);
    let lo = au + bu;
    let carry = select(0u, 1u, lo < au);
    let hi = a.y + b.y + i32(carry);
    return vec2<i32>(i32(lo), hi);
}

// i64 sub. Pre: |a|, |b| < 2^63. Post: low 64 bits of a - b, signed.
fn i64_sub_pair(a: vec2<i32>, b: vec2<i32>) -> vec2<i32> {
    let au = u32(a.x);
    let bu = u32(b.x);
    let lo = au - bu;
    let borrow = select(0u, 1u, au < bu);
    let hi = a.y - b.y - i32(borrow);
    return vec2<i32>(i32(lo), hi);
}

// i64 left shift by 1. Pre: a in (-2^62, 2^62). Post: a << 1, signed.
fn i64_shl1_pair(a: vec2<i32>) -> vec2<i32> {
    let au = u32(a.x);
    let lo = au << 1u;
    let bit31 = au >> 31u;
    // Arithmetic shift left of hi half: bring bottom carry bit up.
    let hi_u = (u32(a.y) << 1u) | bit31;
    return vec2<i32>(i32(lo), i32(hi_u));
}

// i64 two's-complement negate. Pre: any a (low 64 bits well-defined).
// Post: (-a) mod 2^64 as a signed pair.
fn i64_neg_pair(a: vec2<i32>) -> vec2<i32> {
    let nlo = ~u32(a.x);
    let nhi = ~u32(a.y);
    let lo = nlo + 1u;
    let carry = select(0u, 1u, lo < nlo);
    let hi_u = nhi + carry;
    return vec2<i32>(i32(lo), i32(hi_u));
}

// ============================================================
// signed_mul_split: signed 29 × 31-bit product, split into 29-bit chunks.
//
// Pre:  |a| <= 2^29 (one BY limb), |b| <= 2^31 - 1 (i32 matrix-entry low).
// Post: returns (lo29, hi) with a*b = lo29 + (hi * 2^29),
//       0 <= lo29 < 2^29; |hi| <= 2^31 (fits in i32 except at the single
//       corner a == -2^29, b == -2^31 which the caller does not pass).
//
// Partial-product width split (the plan-mandated proof sketch):
//   Split each operand as v = v_lo + v_hi * 2^15 where v_lo is sign-
//   extended low 15 bits, i.e. v_lo in [-2^14, 2^14). Then v_hi = (v -
//   v_lo) >> 15.
//     |a_lo|, |b_lo| <= 2^14
//     |a_hi| <= ceil(2^29 / 2^15) = 2^14
//     |b_hi| <= ceil(2^31 / 2^15) = 2^16
//   Four signed partial products:
//     pll = a_lo * b_lo, |pll| <= 2^14 * 2^14 = 2^28          [< 2^31 ✓]
//     plh = a_lo * b_hi, |plh| <= 2^14 * 2^16 = 2^30          [< 2^31 ✓]
//     phl = a_hi * b_lo, |phl| <= 2^14 * 2^14 = 2^28          [< 2^31 ✓]
//     phh = a_hi * b_hi, |phh| <= 2^14 * 2^16 = 2^30          [< 2^31 ✓]
//   Middle sum:
//     mid = plh + phl,   |mid| <= 2^30 + 2^28 < 2^31           [fits i32]
//   Every partial fits in signed i32, satisfying the plan's audit. The
//   subsequent combination uses u32 wrap arithmetic to assemble the low
//   64 bits of the signed product without further overflow concerns.
fn signed_mul_split(a: i32, b: i32) -> vec2<i32> {
    // Sign-extend the low 15 bits of each operand: (v << 17) >> 17 fills
    // bits 15..31 with the sign of bit 14. WGSL i32 shifts are well-defined
    // (left shift discards high bits; right shift on i32 is arithmetic).
    let a_lo: i32 = (a << 17u) >> 17u;
    let a_hi: i32 = (a - a_lo) >> 15u;
    let b_lo: i32 = (b << 17u) >> 17u;
    let b_hi: i32 = (b - b_lo) >> 15u;

    let pll: i32 = a_lo * b_lo;
    let plh: i32 = a_lo * b_hi;
    let phl: i32 = a_hi * b_lo;
    let phh: i32 = a_hi * b_hi;
    let mid: i32 = plh + phl;

    // total = pll + mid * 2^15 + phh * 2^30, computed as the low 64 bits
    // of an i64 via u32 wrap arithmetic.
    //
    // Each i32 piece extended to i64 (lo, hi):
    //   pll: lo = u32(pll),       hi = u32(pll >> 31)   (sign mask)
    //   mid << 15: lo = u32(mid) << 15, hi = u32(mid >> 17)
    //   phh << 30: lo = u32(phh) << 30, hi = u32(phh >> 2)
    // The >> on signed pieces is arithmetic so the high half carries the
    // correct sign extension.
    let pll_lo: u32 = u32(pll);
    let pll_hi: u32 = u32(pll >> 31u);
    let mid_lo: u32 = u32(mid) << 15u;
    let mid_hi: u32 = u32(mid >> 17u);
    let phh_lo: u32 = u32(phh) << 30u;
    let phh_hi: u32 = u32(phh >> 2u);

    // Sum the three i64 values with carry chains.
    let s1_lo: u32 = pll_lo + mid_lo;
    let c1: u32 = select(0u, 1u, s1_lo < pll_lo);
    let s1_hi: u32 = pll_hi + mid_hi + c1;

    let sum_lo: u32 = s1_lo + phh_lo;
    let c2: u32 = select(0u, 1u, sum_lo < s1_lo);
    let sum_hi: u32 = s1_hi + phh_hi + c2;

    // Re-split into lo29 (low 29 bits) and hi = ARS by 29 (signed).
    let lo29: u32 = sum_lo & 0x1FFFFFFFu;
    // hi bits 0..2 from sum_lo[29..31]; bits 3..31 from sum_hi[0..28].
    // sum_hi[29..31] are sign-extension bits under the precondition
    // |a*b| <= 2^60 and are absorbed correctly when bitcasting hi_u to i32.
    let hi_u: u32 = (sum_lo >> 29u) | (sum_hi << 3u);
    return vec2<i32>(i32(lo29), i32(hi_u));
}

// by_accumulate: acc + m_lo * x_limb as a 58-bit signed two-limb pair.
//
// Pre:  |acc.x| < 2^29 (canonical low half), |acc.y| < 2^29 + 2^k for
//       some small k (caller bounded), |m_lo| <= 2^29, |x_limb| <= 2^29.
// Post: returns (lo29, hi) with acc + m_lo * x_limb = lo29 + hi * 2^29,
//       0 <= lo29 < 2^29 (canonical low limb). hi grows by at most one
//       carry bit per call.
//
// This is the per-limb cross-product helper used by apply_matrix. The
// product |m_lo * x_limb| <= 2^58, well within signed_mul_split's bounds.
fn by_accumulate(acc: vec2<i32>, m_lo: i32, x_limb: i32) -> vec2<i32> {
    let prod = signed_mul_split(m_lo, x_limb);
    // Add (prod.x, prod.y) to (acc.x, acc.y) treating both halves as signed
    // 32-bit lanes. acc.x in [0, 2^29), prod.x in [0, 2^29), so the low-half
    // sum is in [0, 2^30) — fits i32, no carry to track for this helper.
    let lo_sum = acc.x + prod.x;
    let lo29 = lo_sum & i32(BY_LIMB_MASK);
    // The high half absorbs prod.y plus any bits of lo_sum above bit 28.
    // WGSL requires the rhs of `>>` to be u32 (the lhs stays i32 — i32 shift
    // is arithmetic, preserving sign).
    let lo_overflow = lo_sum >> BY_LIMB_BITS;
    let hi = acc.y + prod.y + lo_overflow;
    return vec2<i32>(lo29, hi);
}

// by_low_u64_lohi: low 64 bits of a BigIntBY as a vec2<u32> (.x = low 32,
// .y = high 32). Mirrors `Wasm9x29::low_64()` and the TS `low64`:
//   bits 0..28  = x.l[0]  & LIMB_MASK
//   bits 29..57 = x.l[1]  & LIMB_MASK
//   bits 58..63 = x.l[2]  & 0x3F
// All inputs treated as unsigned u32 bit patterns. Negative limbs
// reinterpreted via `u32(...)` — the caller is responsible for ensuring the
// lower three limbs are canonical (in [0, 2^29) etc.), which is the case in
// the BY driver after each by_normalise.
fn by_low_u64_lohi(x: BigIntBY) -> vec2<u32> {
    let l0: u32 = u32(x.l[0]) & BY_LIMB_MASK;
    let l1: u32 = u32(x.l[1]) & BY_LIMB_MASK;
    let l2: u32 = u32(x.l[2]) & 0x3Fu;
    // low 32 bits: l0 in bits 0..28, low 3 bits of l1 at 29..31.
    let lo32: u32 = l0 | ((l1 & 0x7u) << 29u);
    // high 32 bits: high 26 bits of l1 at 0..25, l2 (6 bits) at 26..31.
    let hi32: u32 = (l1 >> 3u) | (l2 << 26u);
    return vec2<u32>(lo32, hi32);
}

// by_normalise: carry-propagate so each limb i in [0, N-1) ends up in
// [0, 2^29) and the top limb absorbs the final signed carry.
//
// Pre:  any signed limb values (caller may pass non-canonical ±2^60).
// Post: x.l[0..N-2] in [0, 2^29); x.l[N-1] is the signed extension.
fn by_normalise(x: ptr<function, BigIntBY>) {
    var c: i32 = 0;
    for (var i: u32 = 0u; i < BY_NUM_LIMBS - 1u; i = i + 1u) {
        let v = (*x).l[i] + c;
        (*x).l[i] = v & i32(BY_LIMB_MASK);
        // Arithmetic shift on i32 propagates sign; matches BigInt(v) >> 29n in TS.
        // WGSL requires the rhs of `>>` to be u32 (the lhs i32 then gets the
        // arithmetic shift semantics we want).
        c = v >> BY_LIMB_BITS;
    }
    (*x).l[BY_NUM_LIMBS - 1u] = (*x).l[BY_NUM_LIMBS - 1u] + c;
}

// ============================================================
// Conversion between 20×13-bit BigInt and 9×29-bit BigIntBY.
//
// The conversion is a bit-rewrite: read 29 source bits at offset
// 29*k into limb k. Each 29-bit window spans up to 4 consecutive
// source limbs (worst case bit-offset 12, covers 27 bits in 3 limbs;
// needs 2 more from a 4th).
//
// Pre (by_from_bigint):  x in [0, 2^260) represented in 20 × 13-bit limbs.
// Post:                  result in [0, 2^256), 9 canonical 29-bit limbs.
// Pre (by_to_bigint):    x canonical (lower limbs in [0, 2^29), top non-neg).
// Post:                  result in [0, 2^260), 20 × 13-bit unsigned limbs.
// ============================================================

const BY_SRC_LIMB_BITS: u32 = 13u;
const BY_SRC_LIMB_MASK: u32 = (1u << 13u) - 1u;

// Read a 29-bit window from the 20×13-bit BigInt starting at bit `bit_lo`.
// The window spans up to 4 consecutive source limbs (ceil((29 + 12) / 13) = 4).
fn by_read_29bit_window(x: BigInt, bit_lo: u32) -> u32 {
    let base_idx = bit_lo / BY_SRC_LIMB_BITS;       // first source limb touched
    let in_limb_bit = bit_lo % BY_SRC_LIMB_BITS;     // bit offset within base limb
    // Up to four consecutive limbs (out-of-range reads return 0).
    var v0: u32 = 0u;
    var v1: u32 = 0u;
    var v2: u32 = 0u;
    var v3: u32 = 0u;
    if (base_idx < {{ num_words }}u) { v0 = x.limbs[base_idx]; }
    if (base_idx + 1u < {{ num_words }}u) { v1 = x.limbs[base_idx + 1u]; }
    if (base_idx + 2u < {{ num_words }}u) { v2 = x.limbs[base_idx + 2u]; }
    if (base_idx + 3u < {{ num_words }}u) { v3 = x.limbs[base_idx + 3u]; }
    // Stitch: contributions are v0 >> in_limb_bit, v1..v3 at increasing offsets.
    // The v3 shift can reach 13*3 - 0 = 39 which exceeds 32 — but in WGSL
    // shifting a 13-bit limb by >= 32 yields zero by spec; we only need v3
    // when in_limb_bit > 10, where the shift is 39 - in_limb_bit ∈ [27, 28].
    // For in_limb_bit < 11 the contribution of v3 is irrelevant (covered by
    // v0..v2). For safety we mask before shifting so >= 32 shifts vanish.
    let s0 = v0 >> in_limb_bit;
    let s1 = v1 << (BY_SRC_LIMB_BITS - in_limb_bit);
    let s2 = v2 << ((BY_SRC_LIMB_BITS * 2u) - in_limb_bit);
    let shift3: u32 = (BY_SRC_LIMB_BITS * 3u) - in_limb_bit;
    // shift3 is in [27, 39]; for shift3 >= 32 we explicitly produce 0 to
    // avoid WGSL's undefined-behavior region for shifts >= bit-width.
    var s3: u32 = 0u;
    if (shift3 < 32u) {
        s3 = v3 << shift3;
    }
    return (s0 | s1 | s2 | s3) & BY_LIMB_MASK;
}

fn by_from_bigint(x: BigInt) -> BigIntBY {
    var r: BigIntBY;
    for (var i: u32 = 0u; i < BY_NUM_LIMBS; i = i + 1u) {
        r.l[i] = i32(by_read_29bit_window(x, i * BY_LIMB_BITS));
    }
    return r;
}

// Write a 13-bit window into the 20×13-bit BigInt at bit `bit_lo`.
// Reads three consecutive 29-bit BY limbs and emits the right 13-bit slice.
fn by_read_13bit_window(x: BigIntBY, bit_lo: u32) -> u32 {
    let base_idx = bit_lo / BY_LIMB_BITS;
    let in_limb_bit = bit_lo % BY_LIMB_BITS;
    // Up to two BY limbs cover any 13-bit window (since 29 > 13).
    var v0: u32 = 0u;
    var v1: u32 = 0u;
    if (base_idx < BY_NUM_LIMBS) { v0 = u32(x.l[base_idx]); }
    if (base_idx + 1u < BY_NUM_LIMBS) { v1 = u32(x.l[base_idx + 1u]); }
    let s0 = v0 >> in_limb_bit;
    // Shift amount for v1 is (29 - in_limb_bit). In WGSL shifts of >= 32 are
    // undefined; (29 - in_limb_bit) is in [1, 29] so always < 32.
    let shift_up = BY_LIMB_BITS - in_limb_bit;
    let s1 = v1 << shift_up;
    return (s0 | s1) & BY_SRC_LIMB_MASK;
}

fn by_to_bigint(x: BigIntBY) -> BigInt {
    var out: BigInt;
    for (var i: u32 = 0u; i < {{ num_words }}u; i = i + 1u) {
        out.limbs[i] = by_read_13bit_window(x, i * BY_SRC_LIMB_BITS);
    }
    return out;
}
