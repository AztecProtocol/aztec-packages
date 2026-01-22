// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include <array>
#include <cstdint>

#include "./field_impl.hpp"
#include "barretenberg/common/bb_bench.hpp"

namespace bb {

// NOLINTBEGIN(readability-implicit-bool-conversion)
template <class T>
constexpr std::pair<uint64_t, uint64_t> field<T>::mul_wide([[maybe_unused]] uint64_t a,
                                                           [[maybe_unused]] uint64_t b) noexcept
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    const uint128_t res = (static_cast<uint128_t>(a) * static_cast<uint128_t>(b));
    return { static_cast<uint64_t>(res), static_cast<uint64_t>(res >> 64) };
#else
    static_assert(false, "mul_wide is not implemented for WASM");
    return { 0, 0 };
#endif
}
/**
 * @brief Compute uint128_t(a * b + c + carry_in), where the inputs are all `uint64_t`. Return the top 64 bits.
 */
template <class T>
constexpr uint64_t field<T>::mac([[maybe_unused]] const uint64_t a,
                                 [[maybe_unused]] const uint64_t b,
                                 [[maybe_unused]] const uint64_t c,
                                 [[maybe_unused]] const uint64_t carry_in,
                                 [[maybe_unused]] uint64_t& carry_out) noexcept
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    const uint128_t res = static_cast<uint128_t>(a) + (static_cast<uint128_t>(b) * static_cast<uint128_t>(c)) +
                          static_cast<uint128_t>(carry_in);
    carry_out = static_cast<uint64_t>(res >> 64);
    return static_cast<uint64_t>(res);
#else
    static_assert(false, "mac is not implemented for WASM");
    return 0;
#endif
}

/**
 * @brief Compute uint128_t(a * b + c + carry_in), where the inputs are all `uint64_t`. out is rewritten to the bottom
 * 64 bits and carry_out is rewritten to the top 64 bits.
 */
template <class T>
constexpr void field<T>::mac([[maybe_unused]] const uint64_t a,
                             [[maybe_unused]] const uint64_t b,
                             [[maybe_unused]] const uint64_t c,
                             [[maybe_unused]] const uint64_t carry_in,
                             [[maybe_unused]] uint64_t& out,
                             [[maybe_unused]] uint64_t& carry_out) noexcept
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    const uint128_t res = static_cast<uint128_t>(a) + (static_cast<uint128_t>(b) * static_cast<uint128_t>(c)) +
                          static_cast<uint128_t>(carry_in);
    out = static_cast<uint64_t>(res);
    carry_out = static_cast<uint64_t>(res >> 64);
#else
    static_assert(false, "mac is not implemented for WASM");
#endif
}

template <class T>
constexpr uint64_t field<T>::mac_mini([[maybe_unused]] const uint64_t a,
                                      [[maybe_unused]] const uint64_t b,
                                      [[maybe_unused]] const uint64_t c,
                                      [[maybe_unused]] uint64_t& carry_out) noexcept
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    const uint128_t res = static_cast<uint128_t>(a) + (static_cast<uint128_t>(b) * static_cast<uint128_t>(c));
    carry_out = static_cast<uint64_t>(res >> 64);
    return static_cast<uint64_t>(res);
#else
    static_assert(false, "mac is not implemented for WASM");
    return 0;
#endif
}

template <class T>
constexpr void field<T>::mac_mini([[maybe_unused]] const uint64_t a,
                                  [[maybe_unused]] const uint64_t b,
                                  [[maybe_unused]] const uint64_t c,
                                  [[maybe_unused]] uint64_t& out,
                                  [[maybe_unused]] uint64_t& carry_out) noexcept
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    const uint128_t res = static_cast<uint128_t>(a) + (static_cast<uint128_t>(b) * static_cast<uint128_t>(c));
    out = static_cast<uint64_t>(res);
    carry_out = static_cast<uint64_t>(res >> 64);
#else
    static_assert(false, "mac_mini is not implemented for WASM");
#endif
}

template <class T>
constexpr uint64_t field<T>::mac_discard_lo([[maybe_unused]] const uint64_t a,
                                            [[maybe_unused]] const uint64_t b,
                                            [[maybe_unused]] const uint64_t c) noexcept
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    const uint128_t res = static_cast<uint128_t>(a) + (static_cast<uint128_t>(b) * static_cast<uint128_t>(c));
    return static_cast<uint64_t>(res >> 64);
#else
    static_assert(false, "mac_discord_lo is not implemented for WASM");
    return 0;
#endif
}
/**
 * @brief unsigned 64-bit add-with-carry that takes in a `carry_in` and a `carry_out` bit and rewrites the latter.
 *
 * @note If `carry_in` starts out in {0, 1}, then after calling this function `carry_out` is in {0, 1}. In particular,
 * to have the expected semantic meaning, this function tacitly assumes that `carry_in` is in {0, 1}.
 */
template <class T>
constexpr uint64_t field<T>::addc(const uint64_t a,
                                  const uint64_t b,
                                  const uint64_t carry_in,
                                  uint64_t& carry_out) noexcept
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    uint128_t res = static_cast<uint128_t>(a) + static_cast<uint128_t>(b) + static_cast<uint128_t>(carry_in);
    carry_out = static_cast<uint64_t>(res >> 64);
    return static_cast<uint64_t>(res);
#else
    uint64_t r = a + b;
    const uint64_t carry_temp = r < a; // carry_temp == 1 iff a + b overflows (without the carry_in bit)
    r += carry_in;
    carry_out = carry_temp +
                (r < carry_in); // (r < carry_in) iff a + b == 2^64 - 1 and carry_in == 1, which means that (r >= a)
    return r;
#endif
}
/**
 * @brief unsigned 64-bit subtract-with-borrow that takes in borrow_in value in the size-2 set {0, 2^64 - 1},
 * which we interpret as {no borrow, yes borrow}, computes (a - b - (borrow_in != 0)). rewrites borrow_out.
 *
 * @note If `borrow_in` is in {0, 2^64 - 1}, then after calling this function, `borrow_out` is in {0, 2^64 - 1}. In
 * particular, to have the expected semantic meaning, this function tacitly assumes that `borrow_in` takes on only these
 * two values.
 */
template <class T>
constexpr uint64_t field<T>::sbb(const uint64_t a,
                                 const uint64_t b,
                                 const uint64_t borrow_in,
                                 uint64_t& borrow_out) noexcept
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    uint128_t res = static_cast<uint128_t>(a) - (static_cast<uint128_t>(b) + static_cast<uint128_t>(borrow_in >> 63));
    borrow_out = static_cast<uint64_t>(
        res >> 64); // consider the set of negative outputs of [0, 2^64 - 1] - [0, 2^64]; then the highest-order 64 bits
                    // are either all 0 or all 1. hence `borrow_out` is in {0, 2^64 - 1}.
    return static_cast<uint64_t>(res);
#else
    uint64_t t_1 = a - (borrow_in >> 63ULL);
    uint64_t borrow_temp_1 = t_1 > a; // 0 iff a == 0 and borrow_in is non-zero (i.e., 2^64 - 1).
    uint64_t t_2 = t_1 - b;
    uint64_t borrow_temp_2 = t_2 > t_1;                  // 0 iff b > t_1
    borrow_out = 0ULL - (borrow_temp_1 | borrow_temp_2); // underflow if either staged underflowed.
    return t_2;
#endif
}
/**
 * @brief Computes a + 2 * b * c + carry_in_lo + 2^64 * carry_in_hi, in the form of returning a uint64_t and modifying
 * carry_lo and carry_hi. Here, carry_lo represents bits 64 - 127 of the result and carry_hi bits 128-191 of the result.
 * carry_lo can be an arbitrary uint64_t, while carry_hi is in {0, 1, 2}. AUDITTODO: CHECK THIS.
 *
 */
template <class T>
constexpr uint64_t field<T>::square_accumulate([[maybe_unused]] const uint64_t a,
                                               [[maybe_unused]] const uint64_t b,
                                               [[maybe_unused]] const uint64_t c,
                                               [[maybe_unused]] const uint64_t carry_in_lo,
                                               [[maybe_unused]] const uint64_t carry_in_hi,
                                               [[maybe_unused]] uint64_t& carry_lo,
                                               [[maybe_unused]] uint64_t& carry_hi) noexcept
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    const uint128_t product = static_cast<uint128_t>(b) * static_cast<uint128_t>(c);
    const auto r0 = static_cast<uint64_t>(product); // uint64_t(b * c)
    const auto r1 = static_cast<uint64_t>(product >> 64);
    uint64_t out = r0 + r0;
    carry_lo = (out < r0);                // 1 iff r_0 + r_0 overflows. (r_0 = uint_64t(b * c))
    out += a;                             // uint_64t(a + (2 * b * c))
    carry_lo += (out < a);                // + 1 if a + uint_64t(2 * b * c) overflows
    out += carry_in_lo;                   // uint_64t(a + (2 * b * c) + carry_in_lo)
    carry_lo += (out < carry_in_lo);      // + 1 if uint_64t(a + (2 * b * c)) + carry_in_lo overflows.
    carry_lo += r1;                       // + r_1 (r_1 == "high order bits of b * c")
    carry_hi = (carry_lo < r1);           // 1 if adding r_1 to carry_lo causes overflow
    carry_lo += r1;                       // + r_1 (we do this twice because of 2 * (b * c))
    carry_hi += (carry_lo < r1);          // + 1 if adding r_1 causes overflow
    carry_lo += carry_in_hi;              // finally add in the input "upper bits" contribution carry_in_hi
    carry_hi += (carry_lo < carry_in_hi); // + 1 if this caused an overflow
    return out;
#else
    static_assert(false, "square_accumulate is not implemented for WASM");
    return 0;
#endif
}
/**
 * @brief reduce once, i.e., if the value is bigger than the modulus, subtract off the modulus once.
 *
 * @note the output will be smaller than the modulus.
 *     * If we are in the 256-bit prime range, then this follows from the fact that 2p > 2^256.
 *     * If we are in the 254-bit prime range, this follows from the fact that we guarantee that the
 *       `data` is always in _coarse representation_, meaning that the underlying uint256_t derived from the limbs is in
 *       [0, 2p).
 * @note when the modulus is < 2^254 (e.g., for the BN-254 fields), the algorithm is constant-time: it has no
 * branching.
 */
template <class T> constexpr field<T> field<T>::reduce() const noexcept
{
    if constexpr (modulus.data[3] >= MODULUS_TOP_LIMB_LARGE_THRESHOLD) {
        uint256_t val{ data[0], data[1], data[2], data[3] };
        if (val >= modulus) {
            val -= modulus;
        }
        return { val.data[0], val.data[1], val.data[2], val.data[3] };
    }
    // not_modulus == 2^256 - modulus
    // do limb-based add-and-carry with `not_modulus`. this yields a _constant-time_ algorithm.
    uint64_t t0 = data[0] + not_modulus.data[0];
    uint64_t c = t0 < data[0];
    auto t1 = addc(data[1], not_modulus.data[1], c, c);
    auto t2 = addc(data[2], not_modulus.data[2], c, c);
    auto t3 = addc(data[3], not_modulus.data[3], c, c);
    // c != 0 iff val >= modulus.
    const uint64_t selection_mask = 0ULL - c; // 0xffffffff if we have overflowed.
    const uint64_t selection_mask_inverse = ~selection_mask;
    // if c == 0, then the original element is already reduced. if we overflow, we want to return the element whose
    // limbs are {t0, t1, t2, t3}.
    return {
        (data[0] & selection_mask_inverse) | (t0 & selection_mask),
        (data[1] & selection_mask_inverse) | (t1 & selection_mask),
        (data[2] & selection_mask_inverse) | (t2 & selection_mask),
        (data[3] & selection_mask_inverse) | (t3 & selection_mask),
    };
}

///////////////////////
///// ADD and SUB /////
///////////////////////

// Both `add` and `sub` use constexpr branching to distinguish the cases: modulus has <= 254 bits (fields associated to
// BN-254) and modulus has 256 bits. The former has the so-called "coarse" optimization: we allow the inputs to be in
// the range [0, 2p) and the outputs will similarly only be constrained to [0, 2p)

template <class T> constexpr field<T> field<T>::add(const field& other) const noexcept
{
    if constexpr (modulus.data[3] >= MODULUS_TOP_LIMB_LARGE_THRESHOLD) {
        uint64_t r0 = data[0] + other.data[0];
        uint64_t c = r0 < data[0];
        auto r1 = addc(data[1], other.data[1], c, c);
        auto r2 = addc(data[2], other.data[2], c, c);
        auto r3 = addc(data[3], other.data[3], c, c);
        if (c) {
            uint64_t b = 0;
            r0 = sbb(r0, modulus.data[0], b, b);
            r1 = sbb(r1, modulus.data[1], b, b);
            r2 = sbb(r2, modulus.data[2], b, b);
            r3 = sbb(r3, modulus.data[3], b, b);
            // Since both values are in [0, 2^256), the result is in [0, 2^257-2). Subtracting one p might not
            // be enough. We need to ensure that we've underflown the 0 and that might require subtracting an additional
            // p. This can only happen if at least one of the two arguments has uint256_t-element (derived from limbs)
            // LARGER than p (i.e., non-reduced).
            if (!b) {
                b = 0;
                r0 = sbb(r0, modulus.data[0], b, b);
                r1 = sbb(r1, modulus.data[1], b, b);
                r2 = sbb(r2, modulus.data[2], b, b);
                r3 = sbb(r3, modulus.data[3], b, b);
            }
        }
        // if c != 0, i.e., if there was no carry, we do no additional processing. Note that this means that the output
        // might be larger than p, even if the original self and other were in the range [0, p). This is witnessed in
        // the test AddYieldsLimbsBiggerThanModulus.
        //  AUDITTODO(https://github.com/AztecProtocol/barretenberg/issues/1608): Should we reduce here, to try to
        //  enforce in the API that the output of every computation is in [0, p)?
        return { r0, r1, r2, r3 };
    } else {
        uint64_t r0 = data[0] + other.data[0];
        uint64_t c = r0 < data[0];
        auto r1 = addc(data[1], other.data[1], c, c);
        auto r2 = addc(data[2], other.data[2], c, c);
        uint64_t r3 = data[3] + other.data[3] +
                      c; // in the small modulus branch so this will satisfy the right size bounds: both self
                         // and other are in the range [0, 2p), which means their sum is in [0, 4p-1).

        uint64_t t0 = r0 + twice_not_modulus.data[0];
        c = t0 < twice_not_modulus.data[0];
        uint64_t t1 = addc(r1, twice_not_modulus.data[1], c, c);
        uint64_t t2 = addc(r2, twice_not_modulus.data[2], c, c);
        uint64_t t3 = addc(r3, twice_not_modulus.data[3], c, c);
        // c == 1 iff self + other >= 2 * p.
        // if c == 0, then return the r_i (naive sum still in coarse form), if c == 1, return the t_i.
        const uint64_t selection_mask = 0ULL - c;
        const uint64_t selection_mask_inverse = ~selection_mask;

        return {
            (r0 & selection_mask_inverse) | (t0 & selection_mask),
            (r1 & selection_mask_inverse) | (t1 & selection_mask),
            (r2 & selection_mask_inverse) | (t2 & selection_mask),
            (r3 & selection_mask_inverse) | (t3 & selection_mask),
        };
    }
}

template <class T> constexpr field<T> field<T>::subtract(const field& other) const noexcept
{
    uint64_t borrow = 0;
    uint64_t r0 = sbb(data[0], other.data[0], borrow, borrow);
    uint64_t r1 = sbb(data[1], other.data[1], borrow, borrow);
    uint64_t r2 = sbb(data[2], other.data[2], borrow, borrow);
    uint64_t r3 = sbb(data[3], other.data[3], borrow, borrow);

    // recall that borrow is in the size-2 set {0, 2^64 - 1}.
    if constexpr (modulus.data[3] >= MODULUS_TOP_LIMB_LARGE_THRESHOLD) {
        // add the modulus if borrow != 0, i.e., if other > self as uint256_t.
        r0 += (modulus.data[0] & borrow);
        uint64_t carry = r0 < (modulus.data[0] & borrow);
        r1 = addc(r1, modulus.data[1] & borrow, carry, carry);
        r2 = addc(r2, modulus.data[2] & borrow, carry, carry);
        r3 = addc(r3, modulus.data[3] & borrow, carry, carry);
        // The value being subtracted is in [0, 2^256) (see
        // AUDITTODO(https://github.com/AztecProtocol/barretenberg/issues/1608)); it is possible that adding one copy of
        // p still leaves us with a negative number. To check if we might need to add another copy of p, we check if
        // `carry == 0`; this means that (if we are "in the borrow branch"), the addition did not 2^256-overflow, which
        // means we are still negative. If we not in the borrow branch (i.e., if `borrow == 0`), `carry == 0` and we add
        // nothing using the
        // `& borrow` trick for the `addc` argument.
        if (!carry) {
            r0 += (modulus.data[0] & borrow);
            uint64_t carry = r0 < (modulus.data[0] & borrow);
            r1 = addc(r1, modulus.data[1] & borrow, carry, carry);
            r2 = addc(r2, modulus.data[2] & borrow, carry, carry);
            r3 = addc(r3, (modulus.data[3] & borrow), carry, carry);
        }
        return { r0, r1, r2, r3 };
    }
    // Recall that in this constexpr branch, we use _coarse representation_, meaning the underlying limbs of both self
    // and other yield uint256_t are in [0, 2p) . If there is a borrow, then it is possible that adding one copy of p
    // is insufficient to make the result positive (and adding two copies both preserves the residue mod p and keeps us
    // in the coarse-range).
    r0 += (twice_modulus.data[0] & borrow);
    uint64_t carry = r0 < (twice_modulus.data[0] & borrow);
    r1 = addc(r1, twice_modulus.data[1] & borrow, carry, carry);
    r2 = addc(r2, twice_modulus.data[2] & borrow, carry, carry);
    r3 += (twice_modulus.data[3] & borrow) + carry;

    return { r0, r1, r2, r3 };
}

/**
 * @brief Mongtomery multiplication for moduli > 2²⁵⁴
 *
 * @details Explanation of Montgomery form can be found in \ref field_docs_montgomery_explainer and the difference
 * between WASM and generic versions is explained in \ref field_docs_architecture_details
 *
 * @note Both non-WASM and WASM algorithms are constant-time.
 */
template <class T> constexpr field<T> field<T>::montgomery_mul_big(const field& other) const noexcept
{
    // only applicable for big moduli
    static_assert(modulus.data[3] >= MODULUS_TOP_LIMB_LARGE_THRESHOLD);

#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    uint64_t c = 0;
    uint64_t t0 = 0;
    uint64_t t1 = 0;
    uint64_t t2 = 0;
    uint64_t t3 = 0;
    uint64_t t4 = 0;
    uint64_t t5 = 0;
    uint64_t k = 0;

    // Montgomery multiplication main loop: iterates 4 times, once per limb of self.data.
    // We compute self * other in Montgomery form by maintaining a 5-limb running accumulator (t0-t4, with t5 for
    // overflow). In each iteration:
    // 1. Accumulate one limb of self multiplied by all limbs of other into (t0, t1, t2, t3, t4, t5)
    // 2. "Zero out" the lowest limb t0 by computing k = t0 * r_inv (mod 2^64), then adding k * modulus
    //    This shifts the accumulator right by one limb position (t1->t0, t2->t1, etc.)
    // The value of k is chosen so that (t0 + k * modulus[0]) ≡ 0 (mod 2^64), meaning the shifting of the accumulator
    // amounts to  dividing by 2^64.
    //
    // After 4 iterations, we've accumulated the full product and divided by R = 2^256,
    // leaving the Montgomery form result in (t0, t1, t2, t3, t4).
    for (const auto& element : data) {
        c = 0;
        // element = self.data[j]
        // ti <- ti + self.data[j] * other.data[i] + carry_in, for i = 0..3.
        // c is the carry_in for the computation; the carry-out is then written to c at every ste at every step..
        mac(t0, element, other.data[0], c, t0, c);
        mac(t1, element, other.data[1], c, t1, c);
        mac(t2, element, other.data[2], c, t2, c);
        mac(t3, element, other.data[3], c, t3, c);
        // t4 += c, with carry-out written to t5.
        // t5 is in {0, 1}.
        t4 = addc(t4, c, 0, t5);

        // add a multiple of the modulus, so that the result is divisible by 2^64, and then divide. these processes are
        // done "simultaneously".
        k = t0 * T::r_inv;
        // the uint128_t t0 + (t0 * r_inv) * modulus[0] is divisible by 2^64. set c to be the high 64-bits of this
        // number.
        c = mac_discard_lo(t0, k, modulus.data[0]);
        mac(t1, k, modulus.data[1], c, t0, c);
        mac(t2, k, modulus.data[2], c, t1, c);
        mac(t3, k, modulus.data[3], c, t2, c);
        t3 = addc(c, t4, 0, c); // c is now in {0, 1}
        t4 = t5 + c;
    }
    // The result is now contains in the 64*5-bit number with limbs {t0, t1, t2, t3, t4}. In fact, this number has at
    // most 257 bits because t4 is in {0, 1}. Proof: we have just computed (aR * bR + \sum_i k_i p)/(2^256), where each
    // k_i is less than 2^{64i} * (2^64 - 1) for i = 0..3. The numerator is therefore upper-bounded by (2^256 - 1)^2 +
    // (2^256 - 1) * p, hence the whole quantity is bounded by 2^256 + p - 1. Therefore, t4 is in {0, 1}, and we must do
    // at most one subtraction to get in range. AUDITTODO(https://github.com/AztecProtocol/barretenberg/issues/1608): if
    // we demand that the numbers are strictly in [0, p-1], then this bound improves to 2p - 1, which is what is written
    // in the field docs.

    // constant-time "conditional reduction" that computes the following without branches:
    // `result = (value >= modulus) ? value - modulus : value`
    uint64_t borrow = 0;
    uint64_t r0 = sbb(t0, modulus.data[0], borrow, borrow);
    uint64_t r1 = sbb(t1, modulus.data[1], borrow, borrow);
    uint64_t r2 = sbb(t2, modulus.data[2], borrow, borrow);
    uint64_t r3 = sbb(t3, modulus.data[3], borrow, borrow);
    // if t4 == 1, then from the above upper bound of 2^256 + p - 1, it follows that borrow != 0, i.e., borrow == 2^64
    // - 1. if t4 == 0, both options for borrow are possible.
    borrow = borrow ^ (0ULL - t4); // borrow is set to 0 if (t4 == 1 and hence borrow == 2^64 - 1) OR if (borrow == 0
                                   // AND t4 == 1). borrow is set to 2^64 - 1 if (t4 == 0 AND borrow == 2^64 - 1)
    r0 += (modulus.data[0] & borrow);
    uint64_t carry = r0 < (modulus.data[0] & borrow);
    r1 = addc(r1, modulus.data[1] & borrow, carry, carry);
    r2 = addc(r2, modulus.data[2] & borrow, carry, carry);
    r3 += (modulus.data[3] & borrow) + carry;
    return { r0, r1, r2, r3 };
#else

    // Convert 4 64-bit limbs to 9 29-bit limbs
    auto left = wasm_convert(data);
    auto right = wasm_convert(other.data);
    constexpr uint64_t mask = 0x1fffffff;
    uint64_t temp_0 = 0;
    uint64_t temp_1 = 0;
    uint64_t temp_2 = 0;
    uint64_t temp_3 = 0;
    uint64_t temp_4 = 0;
    uint64_t temp_5 = 0;
    uint64_t temp_6 = 0;
    uint64_t temp_7 = 0;
    uint64_t temp_8 = 0;
    uint64_t temp_9 = 0;
    uint64_t temp_10 = 0;
    uint64_t temp_11 = 0;
    uint64_t temp_12 = 0;
    uint64_t temp_13 = 0;
    uint64_t temp_14 = 0;
    uint64_t temp_15 = 0;
    uint64_t temp_16 = 0;
    uint64_t temp_17 = 0;
    // Compute left[0] * right and replace with a representative modulo p that zeros out the lowest
    // 29 bits. In other words, after first reduction: temp_1..temp_8 hold the partial Montgomery product after
    // processing left[0]. temp_0 has been "consumed" (its information propagated via carry to temp_1).
    // Multiply-add 0th limb of the left argument by all 9 limbs of the right arguemnt
    wasm_madd(left[0], right, temp_0, temp_1, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8);
    // Instantly Montgomery reduce
    wasm_reduce(temp_0, temp_1, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8);
    //  Continue for other limbs
    wasm_madd(left[1], right, temp_1, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9);
    wasm_reduce(temp_1, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9);
    wasm_madd(left[2], right, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10);
    wasm_reduce(temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10);
    wasm_madd(left[3], right, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11);
    wasm_reduce(temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11);
    wasm_madd(left[4], right, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12);
    wasm_reduce(temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12);
    wasm_madd(left[5], right, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13);
    wasm_reduce(temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13);
    wasm_madd(left[6], right, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14);
    wasm_reduce(temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14);
    wasm_madd(left[7], right, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15);
    wasm_reduce(temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15);
    wasm_madd(left[8], right, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15, temp_16);
    wasm_reduce(temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15, temp_16);
    // MontgomeryMul(left, right) := (left * right) / R mod p.
    // Then, after the add/reduce sequence, we have the following: MontgomeryMul(left, right) ≡ \sum_{i=0}^8 temp_{i+9}
    // * 2^{29 * i} mod p. In particular, the information we want is stored in {t_9, ..., t_16}. However, these t_i are
    // not yet 29 bits.
    //
    // Moreover, we claim that the value \sum_{i=0}^8 temp_{i+9} is less than than p + 2^{512-261} = p +
    // 2^{251}. The reasoning is again generic: we have computed aR * bR + k_{0, 1, .., 8}p. Each aR and bR are, by
    // assumption, 256 bits, and each k is 29 bits: k_0 is at most 2^29 - 1, k_1 is at most 2^58 - 2^29, etc.
    // Telescoping, this means that the sum is upper-bounded by 2^512 + (2^261 - 1) * p. As we are taking the "high"
    // part, we are simply trying to upper-bound this sum divided by 2^261. In particular, this shows that we have to do
    // at most one subtraction to make the result 256 bits.
    //
    // After all multiplications and additions, convert relaxed form to strict (i.e., force all limbs to be
    // 29 bits)
    temp_10 += temp_9 >> WASM_LIMB_BITS;
    temp_9 &= mask;
    temp_11 += temp_10 >> WASM_LIMB_BITS;
    temp_10 &= mask;
    temp_12 += temp_11 >> WASM_LIMB_BITS;
    temp_11 &= mask;
    temp_13 += temp_12 >> WASM_LIMB_BITS;
    temp_12 &= mask;
    temp_14 += temp_13 >> WASM_LIMB_BITS;
    temp_13 &= mask;
    temp_15 += temp_14 >> WASM_LIMB_BITS;
    temp_14 &= mask;
    temp_16 += temp_15 >> WASM_LIMB_BITS;
    temp_15 &= mask;
    temp_17 += temp_16 >> WASM_LIMB_BITS;
    temp_16 &= mask;

    uint64_t r_temp_0;
    uint64_t r_temp_1;
    uint64_t r_temp_2;
    uint64_t r_temp_3;
    uint64_t r_temp_4;
    uint64_t r_temp_5;
    uint64_t r_temp_6;
    uint64_t r_temp_7;
    uint64_t r_temp_8;

    r_temp_0 = temp_9 - wasm_modulus[0];
    r_temp_1 = temp_10 - wasm_modulus[1] - ((r_temp_0) >> 63);
    r_temp_2 = temp_11 - wasm_modulus[2] - ((r_temp_1) >> 63);
    r_temp_3 = temp_12 - wasm_modulus[3] - ((r_temp_2) >> 63);
    r_temp_4 = temp_13 - wasm_modulus[4] - ((r_temp_3) >> 63);
    r_temp_5 = temp_14 - wasm_modulus[5] - ((r_temp_4) >> 63);
    r_temp_6 = temp_15 - wasm_modulus[6] - ((r_temp_5) >> 63);
    r_temp_7 = temp_16 - wasm_modulus[7] - ((r_temp_6) >> 63);
    r_temp_8 = temp_17 - wasm_modulus[8] - ((r_temp_7) >> 63);

    // Depending on whether the subtraction underflowed, choose original value or the result of subtraction
    uint64_t new_mask = 0 - (r_temp_8 >> 63);
    uint64_t inverse_mask = (~new_mask) & mask;
    temp_9 = (temp_9 & new_mask) | (r_temp_0 & inverse_mask);
    temp_10 = (temp_10 & new_mask) | (r_temp_1 & inverse_mask);
    temp_11 = (temp_11 & new_mask) | (r_temp_2 & inverse_mask);
    temp_12 = (temp_12 & new_mask) | (r_temp_3 & inverse_mask);
    temp_13 = (temp_13 & new_mask) | (r_temp_4 & inverse_mask);
    temp_14 = (temp_14 & new_mask) | (r_temp_5 & inverse_mask);
    temp_15 = (temp_15 & new_mask) | (r_temp_6 & inverse_mask);
    temp_16 = (temp_16 & new_mask) | (r_temp_7 & inverse_mask);
    temp_17 = (temp_17 & new_mask) | (r_temp_8 & inverse_mask);

    // Convert back to 4 64-bit limbs
    return { (temp_9 << 0) | (temp_10 << 29) | (temp_11 << 58),
             (temp_11 >> 6) | (temp_12 << 23) | (temp_13 << 52),
             (temp_13 >> 12) | (temp_14 << 17) | (temp_15 << 46),
             (temp_15 >> 18) | (temp_16 << 11) | (temp_17 << 40) };

#endif
}

#if defined(__wasm__) || !defined(__SIZEOF_INT128__)

/**
 * @brief Multiply left limb by a sequence of 9 limbs and accumulate into result variables
 *
 * @note There is no carrying in this method.
 */
template <class T>
constexpr void field<T>::wasm_madd(uint64_t& left_limb,
                                   const std::array<uint64_t, WASM_NUM_LIMBS>& right_limbs,
                                   uint64_t& result_0,
                                   uint64_t& result_1,
                                   uint64_t& result_2,
                                   uint64_t& result_3,
                                   uint64_t& result_4,
                                   uint64_t& result_5,
                                   uint64_t& result_6,
                                   uint64_t& result_7,
                                   uint64_t& result_8)
{
    result_0 += left_limb * right_limbs[0];
    result_1 += left_limb * right_limbs[1];
    result_2 += left_limb * right_limbs[2];
    result_3 += left_limb * right_limbs[3];
    result_4 += left_limb * right_limbs[4];
    result_5 += left_limb * right_limbs[5];
    result_6 += left_limb * right_limbs[6];
    result_7 += left_limb * right_limbs[7];
    result_8 += left_limb * right_limbs[8];
}

/**
 * @brief Perform 29-bit Montgomery reduction on 1 limb (result_0 should be zero modulo 2^29 after calling this method).
 *
 * @details Inputs are 9 `uint64_t` limbs (result_0, ..., result_8), with the assumption that adding a 58-bit number
 * (from a 29-bit × 29-bit multiplication) does NOT cause 64-bit overflow.
 * Let x = \sum_{i=0}^{8} result_i * 2^{29*i} be the value represented before calling this method.
 * After calling this method, the value \sum_{i=1}^{8} result_i * 2^{29*i} is congruent to x / 2^29 modulo p.
 * Moreover, the low 29 bits of result_0 are zero and result_0 can be discarded.
 * The carry information from result_0 is propagated to result_1 via the term (result_0 >> 29).
 * No other carries are propagated, hence the limbs remain in "relaxed form".
 *
 * @note In particular, the limbs are in "relaxed form", i.e., they are not strictly constrained to be 29 bits.
 * @note This function is called 9 times during Montgomery multiplication (once per limb), where the initial inputs are
 * 58 bits, and the alternation between wasm_madd and wasm_reduce keeps the accumulated values safely within 64 bits.
 * @note We only propagate the carry from result_0 to result_1 because result_0 is effectively discarded after
 * this operation (it's not used in subsequent iterations), while result_1 through result_8 continue accumulating. The
 * methods calling this method will be responsible for strictifying the result again.
 * @note For our application, we require bounds on the output limbs (especially result_8). For information on how we
 * deduce these, please see where this method is called.
 */
template <class T>
constexpr void field<T>::wasm_reduce(uint64_t& result_0,
                                     uint64_t& result_1,
                                     uint64_t& result_2,
                                     uint64_t& result_3,
                                     uint64_t& result_4,
                                     uint64_t& result_5,
                                     uint64_t& result_6,
                                     uint64_t& result_7,
                                     uint64_t& result_8)
{
    constexpr uint64_t mask = 0x1fffffff;
    constexpr uint64_t r_inv = T::r_inv & mask; //  -(modulus ^ { -1 }) modulo 2 ^ WASM_LIMB_BITS
    uint64_t k = (result_0 * r_inv) & mask;
    result_0 += k * wasm_modulus[0];
    result_1 += k * wasm_modulus[1] + (result_0 >> WASM_LIMB_BITS);
    result_2 += k * wasm_modulus[2];
    result_3 += k * wasm_modulus[3];
    result_4 += k * wasm_modulus[4];
    result_5 += k * wasm_modulus[5];
    result_6 += k * wasm_modulus[6];
    result_7 += k * wasm_modulus[7];
    result_8 += k * wasm_modulus[8];
}

/**
 * @brief Perform 29-bit montgomery reduction on 1 limb using Yuval's method.
 * @details We explain, colloquially, what we are doing. We are given a number of the form x := \sum_{i=0}^{9}result_i *
 * 2^{29*i}. Our goal is to find a number, congruent to x mod p, whose lowest 29 bits are 0, and then divide by 2^29.
 * Set r_inv to be 2^{-29} modulo p.  We simply add (r_inv * result_0) to \sum_{i=1}^9(result_i * 2^{29(i - 1)}).
 * @note We accumulate the higher order bits from result_0 because, although we discard result_0 after this
 * reduction, it is possible that result_0 had MORE than 29 bits. We therefore propage them as this step to result_1.
 * @note For a reference, please see: https://hackmd.io/@Ingonyama/Barret-Montgomery
 *
 */
template <class T>
constexpr void field<T>::wasm_reduce_yuval(uint64_t& result_0,
                                           uint64_t& result_1,
                                           uint64_t& result_2,
                                           uint64_t& result_3,
                                           uint64_t& result_4,
                                           uint64_t& result_5,
                                           uint64_t& result_6,
                                           uint64_t& result_7,
                                           uint64_t& result_8,
                                           uint64_t& result_9)
{
    constexpr uint64_t mask = 0x1fffffff;
    const uint64_t result_0_masked = result_0 & mask;
    result_1 += result_0_masked * wasm_r_inv[0] + (result_0 >> WASM_LIMB_BITS);
    result_2 += result_0_masked * wasm_r_inv[1];
    result_3 += result_0_masked * wasm_r_inv[2];
    result_4 += result_0_masked * wasm_r_inv[3];
    result_5 += result_0_masked * wasm_r_inv[4];
    result_6 += result_0_masked * wasm_r_inv[5];
    result_7 += result_0_masked * wasm_r_inv[6];
    result_8 += result_0_masked * wasm_r_inv[7];
    result_9 += result_0_masked * wasm_r_inv[8];
}
/**
 * @brief Convert 4 64-bit limbs into 9 29-bit limbs
 *
 */
template <class T> constexpr std::array<uint64_t, WASM_NUM_LIMBS> field<T>::wasm_convert(const uint64_t* data)
{
    return { data[0] & 0x1fffffff,
             (data[0] >> WASM_LIMB_BITS) & 0x1fffffff,
             ((data[0] >> 58) & 0x3f) | ((data[1] & 0x7fffff) << 6),
             (data[1] >> 23) & 0x1fffffff,
             ((data[1] >> 52) & 0xfff) | ((data[2] & 0x1ffff) << 12),
             (data[2] >> 17) & 0x1fffffff,
             ((data[2] >> 46) & 0x3ffff) | ((data[3] & 0x7ff) << 18),
             (data[3] >> 11) & 0x1fffffff,
             (data[3] >> 40) & 0x1fffffff };
}
#endif
template <class T> constexpr field<T> field<T>::montgomery_mul(const field& other) const noexcept
{
    if constexpr (modulus.data[3] >= MODULUS_TOP_LIMB_LARGE_THRESHOLD) {
        return montgomery_mul_big(other);
    }
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    // process first limb of self, data[0]
    auto [t0, c] = mul_wide(data[0], other.data[0]);
    uint64_t k = t0 * T::r_inv;
    uint64_t a = mac_discard_lo(t0, k, modulus.data[0]);

    uint64_t t1 = mac_mini(a, data[0], other.data[1], a);
    mac(t1, k, modulus.data[1], c, t0, c);
    uint64_t t2 = mac_mini(a, data[0], other.data[2], a);
    mac(t2, k, modulus.data[2], c, t1, c);
    uint64_t t3 = mac_mini(a, data[0], other.data[3], a);
    mac(t3, k, modulus.data[3], c, t2, c);
    t3 = c + a;
    // process second limb of self, data[1]
    mac_mini(t0, data[1], other.data[0], t0, a);
    k = t0 * T::r_inv;
    c = mac_discard_lo(t0, k, modulus.data[0]);
    mac(t1, data[1], other.data[1], a, t1, a);
    mac(t1, k, modulus.data[1], c, t0, c);
    mac(t2, data[1], other.data[2], a, t2, a);
    mac(t2, k, modulus.data[2], c, t1, c);
    mac(t3, data[1], other.data[3], a, t3, a);
    mac(t3, k, modulus.data[3], c, t2, c);
    t3 = c + a;
    // process third limb of self, data[2]
    mac_mini(t0, data[2], other.data[0], t0, a);
    k = t0 * T::r_inv;
    c = mac_discard_lo(t0, k, modulus.data[0]);
    mac(t1, data[2], other.data[1], a, t1, a);
    mac(t1, k, modulus.data[1], c, t0, c);
    mac(t2, data[2], other.data[2], a, t2, a);
    mac(t2, k, modulus.data[2], c, t1, c);
    mac(t3, data[2], other.data[3], a, t3, a);
    mac(t3, k, modulus.data[3], c, t2, c);
    t3 = c + a;
    // process fourth limb of self, data[3]
    mac_mini(t0, data[3], other.data[0], t0, a);
    k = t0 * T::r_inv;
    c = mac_discard_lo(t0, k, modulus.data[0]);
    mac(t1, data[3], other.data[1], a, t1, a);
    mac(t1, k, modulus.data[1], c, t0, c);
    mac(t2, data[3], other.data[2], a, t2, a);
    mac(t2, k, modulus.data[2], c, t1, c);
    mac(t3, data[3], other.data[3], a, t3, a);
    mac(t3, k, modulus.data[3], c, t2, c);
    t3 = c + a;
    return { t0, t1, t2, t3 };
#else

    // Convert 4 64-bit limbs to 9 29-bit ones
    auto left = wasm_convert(data);
    auto right = wasm_convert(other.data);
    constexpr uint64_t mask = 0x1fffffff;
    uint64_t temp_0 = 0;
    uint64_t temp_1 = 0;
    uint64_t temp_2 = 0;
    uint64_t temp_3 = 0;
    uint64_t temp_4 = 0;
    uint64_t temp_5 = 0;
    uint64_t temp_6 = 0;
    uint64_t temp_7 = 0;
    uint64_t temp_8 = 0;
    uint64_t temp_9 = 0;
    uint64_t temp_10 = 0;
    uint64_t temp_11 = 0;
    uint64_t temp_12 = 0;
    uint64_t temp_13 = 0;
    uint64_t temp_14 = 0;
    uint64_t temp_15 = 0;
    uint64_t temp_16 = 0;

    // Perform a series of mul-adds and then reductions
    wasm_madd(left[0], right, temp_0, temp_1, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8);
    wasm_madd(left[1], right, temp_1, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9);
    wasm_madd(left[2], right, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10);
    wasm_madd(left[3], right, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11);
    wasm_madd(left[4], right, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12);
    wasm_madd(left[5], right, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13);
    wasm_madd(left[6], right, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14);
    wasm_madd(left[7], right, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15);
    wasm_madd(left[8], right, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15, temp_16);
    // At this point, the value aR * bR is contained in \sum_{i=0}^16 temp_{i}*2^{29*i}. Note that this value is no
    // greater than 4p^2 as aR and bR are both less than 2p.
    wasm_reduce_yuval(temp_0, temp_1, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9);
    wasm_reduce_yuval(temp_1, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10);
    wasm_reduce_yuval(temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11);
    wasm_reduce_yuval(temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12);
    wasm_reduce_yuval(temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13);
    wasm_reduce_yuval(temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14);
    wasm_reduce_yuval(temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15);
    wasm_reduce_yuval(temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15, temp_16);

    // The first 8 limbs are reduced using Yuval's method, the last one is reduced using the regular method
    // The reason for this is that Yuval's method produces a 10-limb representation of the reduced limb, which is then
    // added to the higher limbs. If we do this for the last limb we reduce, we'll get a 10-limb representation instead
    // of a 9-limb one, so we'll have to reduce it again in some other way.
    wasm_reduce(temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15, temp_16);
    // We must now reason about the current value of \sum_{i=0}^8 temp_{i+8} from the original assumptions.
    // Following the algorithm, this is aR * bR + k_{0, 1, ..., 7}*r_inv_wasm + k_8p. Here, k_0 < 2^29-1, k_1 < 2^58 -
    // 2^29, and so on, until k_8 < 2^261 - 2^232. Moreover, r_inv_wasm < p. (From the definition, it is the value of
    // 2^{-29} mod p, and our choice of limb-representation is smaller than p. In fact, it is empirically smaller than
    // p/2 for Fq and Fr.)
    //
    // Therefore, this whole sum is bounded by 4p^2 + (2^261 - 1)*p. Dividing by 2^261 and taking
    // the integral part (corresponding to taking the top half of the limbs), and noting that 4p^2 / 2^261 << 1, we
    // conclude that the result is in [0, p]. In particular, this implies that we are safely in [0, 2p), as desired.
    //
    // Note that the above analysis is soft, and it is overwhelmingly likely that the result is in [0, p). However, the
    // only guarantee we require is that it is in [0, 2p), as with 254-bit fields we work with the coarse
    // representation.

    // Convert result to unrelaxed form (all limbs are 29 bits)
    temp_10 += temp_9 >> WASM_LIMB_BITS;
    temp_9 &= mask;
    temp_11 += temp_10 >> WASM_LIMB_BITS;
    temp_10 &= mask;
    temp_12 += temp_11 >> WASM_LIMB_BITS;
    temp_11 &= mask;
    temp_13 += temp_12 >> WASM_LIMB_BITS;
    temp_12 &= mask;
    temp_14 += temp_13 >> WASM_LIMB_BITS;
    temp_13 &= mask;
    temp_15 += temp_14 >> WASM_LIMB_BITS;
    temp_14 &= mask;
    temp_16 += temp_15 >> WASM_LIMB_BITS;
    temp_15 &= mask;

    // Convert back to 4 64-bit limbs form
    return { (temp_9 << 0) | (temp_10 << 29) | (temp_11 << 58),
             (temp_11 >> 6) | (temp_12 << 23) | (temp_13 << 52),
             (temp_13 >> 12) | (temp_14 << 17) | (temp_15 << 46),
             (temp_15 >> 18) | (temp_16 << 11) };
#endif
}

template <class T> constexpr field<T> field<T>::montgomery_square() const noexcept
{
    if constexpr (modulus.data[3] >= MODULUS_TOP_LIMB_LARGE_THRESHOLD) {
        return montgomery_mul_big(*this);
    }
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    uint64_t carry_hi = 0;

    auto [t0, carry_lo] = mul_wide(data[0], data[0]);
    uint64_t t1 = square_accumulate(0, data[1], data[0], carry_lo, carry_hi, carry_lo, carry_hi);
    uint64_t t2 = square_accumulate(0, data[2], data[0], carry_lo, carry_hi, carry_lo, carry_hi);
    uint64_t t3 = square_accumulate(0, data[3], data[0], carry_lo, carry_hi, carry_lo, carry_hi);

    uint64_t round_carry = carry_lo;
    uint64_t k = t0 * T::r_inv;
    carry_lo = mac_discard_lo(t0, k, modulus.data[0]);
    mac(t1, k, modulus.data[1], carry_lo, t0, carry_lo);
    mac(t2, k, modulus.data[2], carry_lo, t1, carry_lo);
    mac(t3, k, modulus.data[3], carry_lo, t2, carry_lo);
    t3 = carry_lo + round_carry;

    t1 = mac_mini(t1, data[1], data[1], carry_lo);
    carry_hi = 0;
    t2 = square_accumulate(t2, data[2], data[1], carry_lo, carry_hi, carry_lo, carry_hi);
    t3 = square_accumulate(t3, data[3], data[1], carry_lo, carry_hi, carry_lo, carry_hi);
    round_carry = carry_lo;
    k = t0 * T::r_inv;
    carry_lo = mac_discard_lo(t0, k, modulus.data[0]);
    mac(t1, k, modulus.data[1], carry_lo, t0, carry_lo);
    mac(t2, k, modulus.data[2], carry_lo, t1, carry_lo);
    mac(t3, k, modulus.data[3], carry_lo, t2, carry_lo);
    t3 = carry_lo + round_carry;

    t2 = mac_mini(t2, data[2], data[2], carry_lo);
    carry_hi = 0;
    t3 = square_accumulate(t3, data[3], data[2], carry_lo, carry_hi, carry_lo, carry_hi);
    round_carry = carry_lo;
    k = t0 * T::r_inv;
    carry_lo = mac_discard_lo(t0, k, modulus.data[0]);
    mac(t1, k, modulus.data[1], carry_lo, t0, carry_lo);
    mac(t2, k, modulus.data[2], carry_lo, t1, carry_lo);
    mac(t3, k, modulus.data[3], carry_lo, t2, carry_lo);
    t3 = carry_lo + round_carry;

    t3 = mac_mini(t3, data[3], data[3], carry_lo);
    k = t0 * T::r_inv;
    round_carry = carry_lo;
    carry_lo = mac_discard_lo(t0, k, modulus.data[0]);
    mac(t1, k, modulus.data[1], carry_lo, t0, carry_lo);
    mac(t2, k, modulus.data[2], carry_lo, t1, carry_lo);
    mac(t3, k, modulus.data[3], carry_lo, t2, carry_lo);
    t3 = carry_lo + round_carry;
    return { t0, t1, t2, t3 };
#else
    // Convert from 4 64-bit limbs to 9 29-bit ones
    auto left = wasm_convert(data);
    constexpr uint64_t mask = 0x1fffffff;
    uint64_t temp_0 = 0;
    uint64_t temp_1 = 0;
    uint64_t temp_2 = 0;
    uint64_t temp_3 = 0;
    uint64_t temp_4 = 0;
    uint64_t temp_5 = 0;
    uint64_t temp_6 = 0;
    uint64_t temp_7 = 0;
    uint64_t temp_8 = 0;
    uint64_t temp_9 = 0;
    uint64_t temp_10 = 0;
    uint64_t temp_11 = 0;
    uint64_t temp_12 = 0;
    uint64_t temp_13 = 0;
    uint64_t temp_14 = 0;
    uint64_t temp_15 = 0;
    uint64_t temp_16 = 0;
    uint64_t acc;
    // Perform multiplications, but accumulated results for limb k=i+j so that we can double them at the same time
    temp_0 += left[0] * left[0];
    acc = 0;
    acc += left[0] * left[1];
    temp_1 += (acc << 1);
    acc = 0;
    acc += left[0] * left[2];
    temp_2 += left[1] * left[1];
    temp_2 += (acc << 1);
    acc = 0;
    acc += left[0] * left[3];
    acc += left[1] * left[2];
    temp_3 += (acc << 1);
    acc = 0;
    acc += left[0] * left[4];
    acc += left[1] * left[3];
    temp_4 += left[2] * left[2];
    temp_4 += (acc << 1);
    acc = 0;
    acc += left[0] * left[5];
    acc += left[1] * left[4];
    acc += left[2] * left[3];
    temp_5 += (acc << 1);
    acc = 0;
    acc += left[0] * left[6];
    acc += left[1] * left[5];
    acc += left[2] * left[4];
    temp_6 += left[3] * left[3];
    temp_6 += (acc << 1);
    acc = 0;
    acc += left[0] * left[7];
    acc += left[1] * left[6];
    acc += left[2] * left[5];
    acc += left[3] * left[4];
    temp_7 += (acc << 1);
    acc = 0;
    acc += left[0] * left[8];
    acc += left[1] * left[7];
    acc += left[2] * left[6];
    acc += left[3] * left[5];
    temp_8 += left[4] * left[4];
    temp_8 += (acc << 1);
    acc = 0;
    acc += left[1] * left[8];
    acc += left[2] * left[7];
    acc += left[3] * left[6];
    acc += left[4] * left[5];
    temp_9 += (acc << 1);
    acc = 0;
    acc += left[2] * left[8];
    acc += left[3] * left[7];
    acc += left[4] * left[6];
    temp_10 += left[5] * left[5];
    temp_10 += (acc << 1);
    acc = 0;
    acc += left[3] * left[8];
    acc += left[4] * left[7];
    acc += left[5] * left[6];
    temp_11 += (acc << 1);
    acc = 0;
    acc += left[4] * left[8];
    acc += left[5] * left[7];
    temp_12 += left[6] * left[6];
    temp_12 += (acc << 1);
    acc = 0;
    acc += left[5] * left[8];
    acc += left[6] * left[7];
    temp_13 += (acc << 1);
    acc = 0;
    acc += left[6] * left[8];
    temp_14 += left[7] * left[7];
    temp_14 += (acc << 1);
    acc = 0;
    acc += left[7] * left[8];
    temp_15 += (acc << 1);
    temp_16 += left[8] * left[8];

    // Perform reductions

    wasm_reduce_yuval(temp_0, temp_1, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9);
    wasm_reduce_yuval(temp_1, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10);
    wasm_reduce_yuval(temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11);
    wasm_reduce_yuval(temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12);
    wasm_reduce_yuval(temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13);
    wasm_reduce_yuval(temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14);
    wasm_reduce_yuval(temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15);
    wasm_reduce_yuval(temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15, temp_16);

    // In case there is some unforseen edge case encountered in wasm multiplications, we can quickly restore previous
    // functionality. Comment all "wasm_reduce_yuval" and uncomment the following:

    // wasm_reduce(temp_0, temp_1, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8);
    // wasm_reduce(temp_1, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9);
    // wasm_reduce(temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10);
    // wasm_reduce(temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11);
    // wasm_reduce(temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12);
    // wasm_reduce(temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13);
    // wasm_reduce(temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14);
    // wasm_reduce(temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15);

    // The first 8 limbs are reduced using Yuval's method, the last one is reduced using the regular method
    // The reason for this is that Yuval's method produces a 10-limb representation of the reduced limb, which is then
    // added to the higher limbs. If we do this for the last limb we reduce, we'll get a 10-limb representation instead
    // of a 9-limb one, so we'll have to reduce it again in some other way.
    wasm_reduce(temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15, temp_16);

    // Convert to unrelaxed 29-bit form
    temp_10 += temp_9 >> WASM_LIMB_BITS;
    temp_9 &= mask;
    temp_11 += temp_10 >> WASM_LIMB_BITS;
    temp_10 &= mask;
    temp_12 += temp_11 >> WASM_LIMB_BITS;
    temp_11 &= mask;
    temp_13 += temp_12 >> WASM_LIMB_BITS;
    temp_12 &= mask;
    temp_14 += temp_13 >> WASM_LIMB_BITS;
    temp_13 &= mask;
    temp_15 += temp_14 >> WASM_LIMB_BITS;
    temp_14 &= mask;
    temp_16 += temp_15 >> WASM_LIMB_BITS;
    temp_15 &= mask;
    // Convert to 4 64-bit form
    return { (temp_9 << 0) | (temp_10 << 29) | (temp_11 << 58),
             (temp_11 >> 6) | (temp_12 << 23) | (temp_13 << 52),
             (temp_13 >> 12) | (temp_14 << 17) | (temp_15 << 46),
             (temp_15 >> 18) | (temp_16 << 11) };
#endif
}

template <class T> constexpr struct field<T>::wide_array field<T>::mul_512(const field& other) const noexcept
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    uint64_t carry_2 = 0;
    auto [r0, carry] = mul_wide(data[0], other.data[0]);
    uint64_t r1 = mac_mini(carry, data[0], other.data[1], carry);
    uint64_t r2 = mac_mini(carry, data[0], other.data[2], carry);
    uint64_t r3 = mac_mini(carry, data[0], other.data[3], carry_2);

    r1 = mac_mini(r1, data[1], other.data[0], carry);
    r2 = mac(r2, data[1], other.data[1], carry, carry);
    r3 = mac(r3, data[1], other.data[2], carry, carry);
    uint64_t r4 = mac(carry_2, data[1], other.data[3], carry, carry_2);

    r2 = mac_mini(r2, data[2], other.data[0], carry);
    r3 = mac(r3, data[2], other.data[1], carry, carry);
    r4 = mac(r4, data[2], other.data[2], carry, carry);
    uint64_t r5 = mac(carry_2, data[2], other.data[3], carry, carry_2);

    r3 = mac_mini(r3, data[3], other.data[0], carry);
    r4 = mac(r4, data[3], other.data[1], carry, carry);
    r5 = mac(r5, data[3], other.data[2], carry, carry);
    uint64_t r6 = mac(carry_2, data[3], other.data[3], carry, carry_2);

    return { r0, r1, r2, r3, r4, r5, r6, carry_2 };
#else
    // Convert from 4 64-bit limbs to 9 29-bit limbs
    auto left = wasm_convert(data);
    auto right = wasm_convert(other.data);
    constexpr uint64_t mask = 0x1fffffff;
    uint64_t temp_0 = 0;
    uint64_t temp_1 = 0;
    uint64_t temp_2 = 0;
    uint64_t temp_3 = 0;
    uint64_t temp_4 = 0;
    uint64_t temp_5 = 0;
    uint64_t temp_6 = 0;
    uint64_t temp_7 = 0;
    uint64_t temp_8 = 0;
    uint64_t temp_9 = 0;
    uint64_t temp_10 = 0;
    uint64_t temp_11 = 0;
    uint64_t temp_12 = 0;
    uint64_t temp_13 = 0;
    uint64_t temp_14 = 0;
    uint64_t temp_15 = 0;
    uint64_t temp_16 = 0;

    // Multiply-add all limbs
    wasm_madd(left[0], right, temp_0, temp_1, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8);
    wasm_madd(left[1], right, temp_1, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9);
    wasm_madd(left[2], right, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10);
    wasm_madd(left[3], right, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11);
    wasm_madd(left[4], right, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12);
    wasm_madd(left[5], right, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13);
    wasm_madd(left[6], right, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14);
    wasm_madd(left[7], right, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15);
    wasm_madd(left[8], right, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15, temp_16);

    // Convert to unrelaxed 29-bit form
    temp_1 += temp_0 >> WASM_LIMB_BITS;
    temp_0 &= mask;
    temp_2 += temp_1 >> WASM_LIMB_BITS;
    temp_1 &= mask;
    temp_3 += temp_2 >> WASM_LIMB_BITS;
    temp_2 &= mask;
    temp_4 += temp_3 >> WASM_LIMB_BITS;
    temp_3 &= mask;
    temp_5 += temp_4 >> WASM_LIMB_BITS;
    temp_4 &= mask;
    temp_6 += temp_5 >> WASM_LIMB_BITS;
    temp_5 &= mask;
    temp_7 += temp_6 >> WASM_LIMB_BITS;
    temp_6 &= mask;
    temp_8 += temp_7 >> WASM_LIMB_BITS;
    temp_7 &= mask;
    temp_9 += temp_8 >> WASM_LIMB_BITS;
    temp_8 &= mask;
    temp_10 += temp_9 >> WASM_LIMB_BITS;
    temp_9 &= mask;
    temp_11 += temp_10 >> WASM_LIMB_BITS;
    temp_10 &= mask;
    temp_12 += temp_11 >> WASM_LIMB_BITS;
    temp_11 &= mask;
    temp_13 += temp_12 >> WASM_LIMB_BITS;
    temp_12 &= mask;
    temp_14 += temp_13 >> WASM_LIMB_BITS;
    temp_13 &= mask;
    temp_15 += temp_14 >> WASM_LIMB_BITS;
    temp_14 &= mask;
    temp_16 += temp_15 >> WASM_LIMB_BITS;
    temp_15 &= mask;

    // Convert to 8 64-bit limbs
    return { (temp_0 << 0) | (temp_1 << 29) | (temp_2 << 58),
             (temp_2 >> 6) | (temp_3 << 23) | (temp_4 << 52),
             (temp_4 >> 12) | (temp_5 << 17) | (temp_6 << 46),
             (temp_6 >> 18) | (temp_7 << 11) | (temp_8 << 40),
             (temp_8 >> 24) | (temp_9 << 5) | (temp_10 << 34) | (temp_11 << 63),
             (temp_11 >> 1) | (temp_12 << 28) | (temp_13 << 57),
             (temp_13 >> 7) | (temp_14 << 22) | (temp_15 << 51),
             (temp_15 >> 13) | (temp_16 << 16) };
#endif
}

// NOLINTEND(readability-implicit-bool-conversion)
} // namespace bb
