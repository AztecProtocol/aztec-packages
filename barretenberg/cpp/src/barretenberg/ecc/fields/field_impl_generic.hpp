// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Raju], commit: }
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
 * carry_lo can be an arbitrary uint64_t.
 *
 * @note the maximal value of this function is 2^129 + 2^128 - 2^66 + 2^64 < 2^129 + 2^128. Therefore, carry_hi is
 * always in {0, 1, 2}.
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

        field result{
            (r0 & selection_mask_inverse) | (t0 & selection_mask),
            (r1 & selection_mask_inverse) | (t1 & selection_mask),
            (r2 & selection_mask_inverse) | (t2 & selection_mask),
            (r3 & selection_mask_inverse) | (t3 & selection_mask),
        };
        if (!std::is_constant_evaluated()) {
            result.assert_coarse_form();
        }
        return result;
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
        // The value being subtracted is in [0, 2^256); it is possible that adding one copy of
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

    field result{ r0, r1, r2, r3 };
    if (!std::is_constant_evaluated()) {
        result.assert_coarse_form();
    }
    return result;
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
    // at most one subtraction to get in range.

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

    // Convert 4 64-bit limbs to 9 29-bit limbs.
    auto left = wasm_convert(data);
    auto right = wasm_convert(other.data);
    std::array<uint64_t, 17> temp{};

    // 9-step Montgomery reduction chain computes (left * right) / R mod p, R = 2^256.
    // Each iteration multiply-adds left[i] × right and zeros 29 bits via wasm_reduce_29; the final
    // step uses wasm_reduce_24 so the total zeroed bits sum to 256 (equivalent to div by R = 2^256)
    BB_FORCE_UNROLL
    for (size_t i = 0; i < 8; ++i) {
        const std::span<uint64_t, WASM_NUM_LIMBS> window{ &temp[i], WASM_NUM_LIMBS };
        wasm_madd(left[i], right, window);
        wasm_reduce_29(window);
    }
    const std::span<uint64_t, WASM_NUM_LIMBS> last_window{ &temp[8], WASM_NUM_LIMBS };
    wasm_madd(left[8], right, last_window);
    wasm_reduce_24(last_window);

    // Post-reduction bound:
    //   T₀ = aR·bR < p² (aR, bR < p), to which at step i we add 2^prefix_i · k_i · p, where k_i
    //   is bounded by 2^29 for i = 0..7, 2^24 for i = 8, and prefix_i = i * 29 for i = 0..8.
    //   As k = Σ k_i · 2^prefix_i for i = 0..8 < R, hence:
    //   (T₀ + [Σ 2^prefix_i · k_i · p for i = 0..8]) / R < (p² + R · p) / R < 2p < 2^257  as p < R.
    // Since result < 2p, a single conditional subtraction of p suffices to bring it into [0, p).
    //
    // Layout in temp[8..16] after the chain:
    //   temp[8]:     5 bits at positions 24..28 (bits 0..23 zeroed by wasm_reduce_24,
    //                bits 29+ already propagated to temp[9])
    //   temp[9..15]: 29 bits each,
    //   temp[16]:    49 bits (unmasked as bound < 2^49 follows from result < 2^257)
    temp[8] &= WASM_LIMB_MASK;
    BB_FORCE_UNROLL
    for (size_t i = 9; i < 16; ++i) {
        temp[i + 1] += temp[i] >> WASM_LIMB_BITS;
        temp[i] &= WASM_LIMB_MASK;
    }

    // Re-align the (5, 7×29, 49) layout into the canonical (8×29, 25) form: each new limb takes
    // 5 high bits from temp[8 + i] (positions 24..28) and 24 low bits from temp[9 + i].
    // PERF: an alternative would be a per-curve (5, 7×29, 49) wasm_modulus_r256 layout, skipping
    // the realignment at the cost of an additional constant.
    std::array<uint64_t, 9> v;
    BB_FORCE_UNROLL
    for (size_t i = 0; i < 8; ++i) {
        v[i] = ((temp[8 + i] >> WASM_FINAL_REDUCE_BITS) | (temp[9 + i] << WASM_FINAL_REMAINDER_BITS)) & WASM_LIMB_MASK;
    }
    v[8] = temp[16] >> WASM_FINAL_REDUCE_BITS; // bits 232..256 (25 bits incl. overflow)

    // Subtract wasm_modulus from v with a borrow chain. `r_v[i-1] >> 63` extracts the borrow
    // bit: it is 1 iff the prior unsigned subtraction underflowed (its high bit got set on wrap).
    std::array<uint64_t, 9> r_v;
    r_v[0] = v[0] - wasm_modulus[0];
    BB_FORCE_UNROLL
    for (size_t i = 1; i < 9; ++i) {
        r_v[i] = v[i] - wasm_modulus[i] - (r_v[i - 1] >> 63);
    }

    // Constant-time conditional reduction: keep v[i] if r_v underflowed (v < modulus), else use r_v[i].
    const uint64_t keep_orig_mask = 0 - (r_v[8] >> 63);
    const uint64_t take_sub_mask = ~keep_orig_mask;
    std::array<uint64_t, 9> out;
    BB_FORCE_UNROLL
    for (size_t i = 0; i < 8; ++i) {
        out[i] = (v[i] & keep_orig_mask) | (r_v[i] & take_sub_mask & WASM_LIMB_MASK);
    }
    out[8] = (v[8] & keep_orig_mask) | (r_v[8] & take_sub_mask & WASM_FINAL_REDUCE_MASK);

    // Pack 9 limbs (8×29 + 1×24) into 4 64-bit limbs.
    return { (out[0] << 0) | (out[1] << 29) | (out[2] << 58),
             (out[2] >> 6) | (out[3] << 23) | (out[4] << 52),
             (out[4] >> 12) | (out[5] << 17) | (out[6] << 46),
             (out[6] >> 18) | (out[7] << 11) | (out[8] << 40) };

#endif
}

#if defined(__wasm__) || !defined(__SIZEOF_INT128__)

/**
 * @brief N×N schoolbook for relaxed-29-bit limbs (each limb ≤ 2^30 - 1).
 */
template <class T>
template <size_t N>
constexpr std::array<uint64_t, 2 * N - 1> field<T>::wasm_schoolbook_mul(const std::array<uint64_t, N>& a,
                                                                        const std::array<uint64_t, N>& b)
{
    // Output column k (k ∈ [0, 2N-1)) sums all products a[i]*b[j] with 0 ≤ i,j < N and i+j = k,
    // which is maximised at the middle column k = N-1 with N products. As each limb is ≤ (2^30 - 1),
    // to avoid uint64_t overflow we need N * (2^30 - 1)^2 < 2^64, giving N ≤ 16.
    static_assert(N >= 1 && N <= 16, "wasm_schoolbook_mul: N must be in [1, 16]");

    std::array<uint64_t, 2 * N - 1> out{};
    BB_FORCE_UNROLL
    for (size_t i = 0; i < N; ++i) {
        BB_FORCE_UNROLL
        for (size_t j = 0; j < N; ++j) {
            out[i + j] += a[i] * b[j];
        }
    }
    return out;
}

/**
 * @brief 9×9 Karatsuba product (5+4 split) over relaxed 29-bit limbs (66 muls vs. 81 naive schoolbook).
 */
template <class T>
constexpr std::array<uint64_t, 2 * WASM_NUM_LIMBS - 1> field<T>::wasm_karatsuba_mul(
    const std::array<uint64_t, WASM_NUM_LIMBS>& left, const std::array<uint64_t, WASM_NUM_LIMBS>& right)
{
    const std::array<uint64_t, 5> left_lo = { left[0], left[1], left[2], left[3], left[4] };
    const std::array<uint64_t, 5> right_lo = { right[0], right[1], right[2], right[3], right[4] };
    const std::array<uint64_t, 4> left_hi = { left[5], left[6], left[7], left[8] };
    const std::array<uint64_t, 4> right_hi = { right[5], right[6], right[7], right[8] };

    // Pad the 4-limb high half with a 0 at index 4 so left_sum / right_sum stay 5 limbs.
    const std::array<uint64_t, 5> left_sum = {
        left[0] + left[5], left[1] + left[6], left[2] + left[7], left[3] + left[8], left[4]
    };
    const std::array<uint64_t, 5> right_sum = {
        right[0] + right[5], right[1] + right[6], right[2] + right[7], right[3] + right[8], right[4]
    };

    const auto pl = wasm_schoolbook_mul<5>(left_lo, right_lo);
    const auto ph = wasm_schoolbook_mul<4>(left_hi, right_hi);
    // left_sum / right_sum entries are sums of two 29-bit limbs (≤ 2^30 - 1), within the schoolbook limb size.
    const auto pc = wasm_schoolbook_mul<5>(left_sum, right_sum);

    // out[k] = pl[k] + (pc - pl - ph)[k-5] + ph[k-10]; ph has only 7 limbs so indices 12, 13 drop the - ph term.
    return { pl[0],
             pl[1],
             pl[2],
             pl[3],
             pl[4],
             pl[5] + (pc[0] - pl[0] - ph[0]),
             pl[6] + (pc[1] - pl[1] - ph[1]),
             pl[7] + (pc[2] - pl[2] - ph[2]),
             pl[8] + (pc[3] - pl[3] - ph[3]),
             pc[4] - pl[4] - ph[4],
             (pc[5] - pl[5] - ph[5]) + ph[0],
             (pc[6] - pl[6] - ph[6]) + ph[1],
             (pc[7] - pl[7]) + ph[2],
             (pc[8] - pl[8]) + ph[3],
             ph[4],
             ph[5],
             ph[6] };
}

/**
 * @brief Multiply left limb by a sequence of 9 limbs and accumulate into result[0..8].
 *
 * @note There is no carrying in this method.
 */
template <class T>
constexpr void field<T>::wasm_madd(uint64_t left_limb,
                                   const std::array<uint64_t, WASM_NUM_LIMBS>& right_limbs,
                                   std::span<uint64_t, WASM_NUM_LIMBS> result)
{
    BB_FORCE_UNROLL
    for (size_t i = 0; i < WASM_NUM_LIMBS; ++i) {
        result[i] += left_limb * right_limbs[i];
    }
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
 * @note This function is called 8 times during the R=2^256 WASM reduction chain
 * (the 9th step uses wasm_reduce_24), where the initial inputs are 58 bits and
 * the alternation between wasm_madd and wasm_reduce_29 keeps the accumulated
 * values safely within 64 bits.
 * @note We only propagate the carry from result_0 to result_1 because result_0 is effectively discarded after
 * this operation (it's not used in subsequent iterations), while result_1 through result_8 continue accumulating. The
 * methods calling this method will be responsible for strictifying the result again.
 * @note For our application, we require bounds on the output limbs (especially result_8). For information on how we
 * deduce these, please see where this method is called.
 */
template <class T> constexpr void field<T>::wasm_reduce_29(std::span<uint64_t, WASM_NUM_LIMBS> result)
{
    constexpr uint64_t r_inv = T::r_inv & WASM_LIMB_MASK; // -(modulus^{-1}) modulo 2^WASM_LIMB_BITS
    uint64_t k = (result[0] * r_inv) & WASM_LIMB_MASK;
    result[0] += k * wasm_modulus[0];
    result[1] += k * wasm_modulus[1] + (result[0] >> WASM_LIMB_BITS);
    BB_FORCE_UNROLL
    for (size_t i = 2; i < WASM_NUM_LIMBS; ++i) {
        result[i] += k * wasm_modulus[i];
    }
}

/**
 * @brief Like wasm_reduce_29 but zeroes only the lowest 24 bits of result_0 (bits 24..28 are kept as result data).
 */
template <class T> constexpr void field<T>::wasm_reduce_24(std::span<uint64_t, WASM_NUM_LIMBS> result)
{
    constexpr uint64_t r_inv = T::r_inv & WASM_FINAL_REDUCE_MASK; // -(modulus^{-1}) modulo 2^WASM_FINAL_REDUCE_BITS
    uint64_t k = (result[0] * r_inv) & WASM_FINAL_REDUCE_MASK;
    result[0] += k * wasm_modulus[0];
    result[1] += k * wasm_modulus[1] + (result[0] >> WASM_LIMB_BITS); // Carry shifts by the limb width.
    BB_FORCE_UNROLL
    for (size_t i = 2; i < WASM_NUM_LIMBS; ++i) {
        result[i] += k * wasm_modulus[i];
    }
}

/**
 * @brief Perform 29-bit Montgomery reduction on 1 limb using Yuval's method.
 *
 * @details Given a value x = \sum_{i=0}^{9} result_i * 2^{29i}, we want to compute x / 2^{29} mod p.
 *
 * Standard Montgomery reduction achieves this by finding k = result_0 * (-p^{-1}) mod 2^{29}, adding k*p to zero out
 * the lowest limb, then shifting. Yuval's method instead directly computes x / 2^{29} mod p by observing:
 *
 *   x / 2^{29} = (x - result_0) / 2^{29} + result_0 * 2^{-29}  (mod p)
 *
 * The first term is just the higher limbs (an integer shift since result_0 contains all low bits).
 * The second term is result_0 * r_inv, where r_inv = 2^{-29} mod p is precomputed as `wasm_r_inv`.
 *
 * After calling this method, result_0 is discarded and result_1..result_9 hold x / 2^{29} mod p.
 *
 * @note The term (result_0 >> 29) propagates any overflow bits beyond the lowest 29 bits of result_0 to result_1,
 * since the limbs are in "relaxed form" and may exceed 29 bits.
 *
 * @note For a reference, please see: https://hackmd.io/@Ingonyama/Barret-Montgomery
 */
template <class T> constexpr void field<T>::wasm_reduce_yuval(std::span<uint64_t, WASM_NUM_LIMBS + 1> result)
{
    const uint64_t result_0_masked = result[0] & WASM_LIMB_MASK;
    result[1] += result_0_masked * wasm_r_inv[0] + (result[0] >> WASM_LIMB_BITS);
    BB_FORCE_UNROLL
    for (size_t i = 2; i < WASM_NUM_LIMBS + 1; ++i) {
        result[i] += result_0_masked * wasm_r_inv[i - 1];
    }
}
/**
 * @brief Convert 4 64-bit limbs into 9 29-bit limbs
 *
 */
template <class T> constexpr std::array<uint64_t, WASM_NUM_LIMBS> field<T>::wasm_convert(const uint64_t* data)
{
    return { data[0] & WASM_LIMB_MASK,
             (data[0] >> WASM_LIMB_BITS) & WASM_LIMB_MASK,
             ((data[0] >> 58) & 0x3f) | ((data[1] & 0x7fffff) << 6),
             (data[1] >> 23) & WASM_LIMB_MASK,
             ((data[1] >> 52) & 0xfff) | ((data[2] & 0x1ffff) << 12),
             (data[2] >> 17) & WASM_LIMB_MASK,
             ((data[2] >> 46) & 0x3ffff) | ((data[3] & 0x7ff) << 18),
             (data[3] >> 11) & WASM_LIMB_MASK,
             (data[3] >> 40) & WASM_LIMB_MASK };
}

/**
 * @brief Reduce a 17-limb relaxed-29-bit accumulator by R = 2^256 and pack into canonical 4 × 64-bit
 * Montgomery limbs. Shared by `montgomery_mul` and `montgomery_square` (small-modulus path).
 *
 * @details The reduction is 7 Yuval-style 29-bit + 1 standard Montgomery 29-bit + 1 final 24-bit
 * Montgomery (7*29 + 29 + 24 = 256). The Montgomery step at `temp[7]` tightens the running bound
 * (Yuval slack is 2^29*p vs. p for Montgomery); a final Yuval is impossible because its 10-limb
 * output would overflow the limb window. See field_docs.md for the full bounds derivation; the
 * post-reduction value is in [0, 2p) so no conditional subtraction is needed for coarse form.
 */
template <class T>
constexpr std::array<uint64_t, 4> field<T>::wasm_reduce_and_pack(std::array<uint64_t, 2 * WASM_NUM_LIMBS - 1>& temp)
{
    BB_FORCE_UNROLL
    for (size_t i = 0; i < 7; ++i) {
        wasm_reduce_yuval(std::span<uint64_t, WASM_NUM_LIMBS + 1>{ &temp[i], WASM_NUM_LIMBS + 1 });
    }
    wasm_reduce_29(std::span<uint64_t, WASM_NUM_LIMBS>{ &temp[7], WASM_NUM_LIMBS });
    wasm_reduce_24(std::span<uint64_t, WASM_NUM_LIMBS>{ &temp[8], WASM_NUM_LIMBS });

    // wasm_reduce_24 leaves bits 0..23 zero and bits 29+ already propagated to temp[9]; shift
    // the 5 result bits at positions 24..28 down to positions 0..4 so temp[8] packs uniformly.
    temp[8] = (temp[8] >> WASM_FINAL_REDUCE_BITS) & WASM_FINAL_REMAINDER_MASK;
    BB_FORCE_UNROLL
    for (size_t i = 9; i < 16; ++i) {
        temp[i + 1] += temp[i] >> WASM_LIMB_BITS;
        temp[i] &= WASM_LIMB_MASK;
    }

    // Pack: temp[8] is 5 bits, temp[9..15] are 29-bit, temp[16] holds at most 48 bits.
    return { temp[8] | (temp[9] << 5) | (temp[10] << 34) | (temp[11] << 63),
             (temp[11] >> 1) | (temp[12] << 28) | (temp[13] << 57),
             (temp[13] >> 7) | (temp[14] << 22) | (temp[15] << 51),
             (temp[15] >> 13) | (temp[16] << 16) };
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
    {
        field result{ t0, t1, t2, t3 };
        if (!std::is_constant_evaluated()) {
            result.assert_coarse_form();
        }
        return result;
    }
#else

    // Convert 4 64-bit limbs to 9 29-bit ones, multiply in relaxed form (Karatsuba 5+4),
    // then reduce by R = 2^256 and pack back to coarse form [0, 2p).
    const auto left = wasm_convert(data);
    const auto right = wasm_convert(other.data);
    auto temp = wasm_karatsuba_mul(left, right);
    auto out = wasm_reduce_and_pack(temp);
    return { out[0], out[1], out[2], out[3] };
#endif
}
/**
 * @brief Squaring via a variant of the Montgomery algorithm, where we roughly take advantage of the repeated terms in
 * the expansion.
 * @note The correctness of both the x64 and the WASM branches is _precisely_ analogus to what is argued in the
 * `montgomery_mul()` method.
 */
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
    {
        field result{ t0, t1, t2, t3 };
        if (!std::is_constant_evaluated()) {
            result.assert_coarse_form();
        }
        return result;
    }
#else
    // Convert from 4 64-bit limbs to 9 29-bit ones
    auto left = wasm_convert(data);
    std::array<uint64_t, 2 * WASM_NUM_LIMBS - 1> temp{};
    uint64_t acc;
    temp[0] += left[0] * left[0];
    acc = 0;
    acc += left[0] * left[1];
    temp[1] += (acc << 1);
    acc = 0;
    acc += left[0] * left[2];
    temp[2] += left[1] * left[1];
    temp[2] += (acc << 1);
    acc = 0;
    acc += left[0] * left[3];
    acc += left[1] * left[2];
    temp[3] += (acc << 1);
    acc = 0;
    acc += left[0] * left[4];
    acc += left[1] * left[3];
    temp[4] += left[2] * left[2];
    temp[4] += (acc << 1);
    acc = 0;
    acc += left[0] * left[5];
    acc += left[1] * left[4];
    acc += left[2] * left[3];
    temp[5] += (acc << 1);
    acc = 0;
    acc += left[0] * left[6];
    acc += left[1] * left[5];
    acc += left[2] * left[4];
    temp[6] += left[3] * left[3];
    temp[6] += (acc << 1);
    acc = 0;
    acc += left[0] * left[7];
    acc += left[1] * left[6];
    acc += left[2] * left[5];
    acc += left[3] * left[4];
    temp[7] += (acc << 1);
    acc = 0;
    acc += left[0] * left[8];
    acc += left[1] * left[7];
    acc += left[2] * left[6];
    acc += left[3] * left[5];
    temp[8] += left[4] * left[4];
    temp[8] += (acc << 1);
    acc = 0;
    acc += left[1] * left[8];
    acc += left[2] * left[7];
    acc += left[3] * left[6];
    acc += left[4] * left[5];
    temp[9] += (acc << 1);
    acc = 0;
    acc += left[2] * left[8];
    acc += left[3] * left[7];
    acc += left[4] * left[6];
    temp[10] += left[5] * left[5];
    temp[10] += (acc << 1);
    acc = 0;
    acc += left[3] * left[8];
    acc += left[4] * left[7];
    acc += left[5] * left[6];
    temp[11] += (acc << 1);
    acc = 0;
    acc += left[4] * left[8];
    acc += left[5] * left[7];
    temp[12] += left[6] * left[6];
    temp[12] += (acc << 1);
    acc = 0;
    acc += left[5] * left[8];
    acc += left[6] * left[7];
    temp[13] += (acc << 1);
    acc = 0;
    acc += left[6] * left[8];
    temp[14] += left[7] * left[7];
    temp[14] += (acc << 1);
    acc = 0;
    acc += left[7] * left[8];
    temp[15] += (acc << 1);
    temp[16] += left[8] * left[8];

    // Shared with montgomery_mul: reduce by R = 2^256 and pack into canonical form.
    auto out = wasm_reduce_and_pack(temp);
    return { out[0], out[1], out[2], out[3] };
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
    const auto left = wasm_convert(data);
    const auto right = wasm_convert(other.data);
    auto temp = wasm_karatsuba_mul(left, right);

    // Convert to unrelaxed 29-bit form
    BB_FORCE_UNROLL
    for (size_t i = 0; i < 16; ++i) {
        temp[i + 1] += temp[i] >> WASM_LIMB_BITS;
        temp[i] &= WASM_LIMB_MASK;
    }

    // Convert to 8 64-bit limbs
    return { (temp[0] << 0) | (temp[1] << 29) | (temp[2] << 58),
             (temp[2] >> 6) | (temp[3] << 23) | (temp[4] << 52),
             (temp[4] >> 12) | (temp[5] << 17) | (temp[6] << 46),
             (temp[6] >> 18) | (temp[7] << 11) | (temp[8] << 40),
             (temp[8] >> 24) | (temp[9] << 5) | (temp[10] << 34) | (temp[11] << 63),
             (temp[11] >> 1) | (temp[12] << 28) | (temp[13] << 57),
             (temp[13] >> 7) | (temp[14] << 22) | (temp[15] << 51),
             (temp[15] >> 13) | (temp[16] << 16) };
#endif
}

// NOLINTEND(readability-implicit-bool-conversion)
} // namespace bb
