#pragma once

#include <array>
#include <cstdint>

#include "./field_impl.hpp"
#include "barretenberg/common/op_count.hpp"

namespace bb {

// NOLINTBEGIN(readability-implicit-bool-conversion)
template <class T> constexpr std::pair<uint64_t, uint64_t> field<T>::mul_wide(uint64_t a, uint64_t b) noexcept
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    const uint128_t res = (static_cast<uint128_t>(a) * static_cast<uint128_t>(b));
    return { static_cast<uint64_t>(res), static_cast<uint64_t>(res >> 64) };
#else
    const uint64_t product = a * b;
    return { product & 0xffffffffULL, product >> 32 };
#endif
}

template <class T>
constexpr uint64_t field<T>::mac(
    const uint64_t a, const uint64_t b, const uint64_t c, const uint64_t carry_in, uint64_t& carry_out) noexcept
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    const uint128_t res = static_cast<uint128_t>(a) + (static_cast<uint128_t>(b) * static_cast<uint128_t>(c)) +
                          static_cast<uint128_t>(carry_in);
    carry_out = static_cast<uint64_t>(res >> 64);
    return static_cast<uint64_t>(res);
#else
    const uint64_t product = b * c + a + carry_in;
    carry_out = product >> 32;
    return product & 0xffffffffULL;
#endif
}

template <class T>
constexpr void field<T>::mac(const uint64_t a,
                             const uint64_t b,
                             const uint64_t c,
                             const uint64_t carry_in,
                             uint64_t& out,
                             uint64_t& carry_out) noexcept
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    const uint128_t res = static_cast<uint128_t>(a) + (static_cast<uint128_t>(b) * static_cast<uint128_t>(c)) +
                          static_cast<uint128_t>(carry_in);
    out = static_cast<uint64_t>(res);
    carry_out = static_cast<uint64_t>(res >> 64);
#else
    const uint64_t product = b * c + a + carry_in;
    carry_out = product >> 32;
    out = product & 0xffffffffULL;
#endif
}

template <class T>
constexpr uint64_t field<T>::mac_mini(const uint64_t a,
                                      const uint64_t b,
                                      const uint64_t c,
                                      uint64_t& carry_out) noexcept
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    const uint128_t res = static_cast<uint128_t>(a) + (static_cast<uint128_t>(b) * static_cast<uint128_t>(c));
    carry_out = static_cast<uint64_t>(res >> 64);
    return static_cast<uint64_t>(res);
#else
    const uint64_t product = b * c + a;
    carry_out = product >> 32;
    return product & 0xffffffffULL;
#endif
}

template <class T>
constexpr void field<T>::mac_mini(
    const uint64_t a, const uint64_t b, const uint64_t c, uint64_t& out, uint64_t& carry_out) noexcept
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    const uint128_t res = static_cast<uint128_t>(a) + (static_cast<uint128_t>(b) * static_cast<uint128_t>(c));
    out = static_cast<uint64_t>(res);
    carry_out = static_cast<uint64_t>(res >> 64);
#else
    const uint64_t result = b * c + a;
    carry_out = result >> 32;
    out = result & 0xffffffffULL;
#endif
}

template <class T>
constexpr uint64_t field<T>::mac_discard_lo(const uint64_t a, const uint64_t b, const uint64_t c) noexcept
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    const uint128_t res = static_cast<uint128_t>(a) + (static_cast<uint128_t>(b) * static_cast<uint128_t>(c));
    return static_cast<uint64_t>(res >> 64);
#else
    return (b * c + a) >> 32;
#endif
}

template <class T>
constexpr uint64_t field<T>::addc(const uint64_t a,
                                  const uint64_t b,
                                  const uint64_t carry_in,
                                  uint64_t& carry_out) noexcept
{
    BB_OP_COUNT_TRACK();
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    uint128_t res = static_cast<uint128_t>(a) + static_cast<uint128_t>(b) + static_cast<uint128_t>(carry_in);
    carry_out = static_cast<uint64_t>(res >> 64);
    return static_cast<uint64_t>(res);
#else
    uint64_t r = a + b;
    const uint64_t carry_temp = r < a;
    r += carry_in;
    carry_out = carry_temp + (r < carry_in);
    return r;
#endif
}

template <class T>
constexpr uint64_t field<T>::sbb(const uint64_t a,
                                 const uint64_t b,
                                 const uint64_t borrow_in,
                                 uint64_t& borrow_out) noexcept
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    uint128_t res = static_cast<uint128_t>(a) - (static_cast<uint128_t>(b) + static_cast<uint128_t>(borrow_in >> 63));
    borrow_out = static_cast<uint64_t>(res >> 64);
    return static_cast<uint64_t>(res);
#else
    uint64_t t_1 = a - (borrow_in >> 63ULL);
    uint64_t borrow_temp_1 = t_1 > a;
    uint64_t t_2 = t_1 - b;
    uint64_t borrow_temp_2 = t_2 > t_1;
    borrow_out = 0ULL - (borrow_temp_1 | borrow_temp_2);
    return t_2;
#endif
}

template <class T>
constexpr uint64_t field<T>::square_accumulate(const uint64_t a,
                                               const uint64_t b,
                                               const uint64_t c,
                                               const uint64_t carry_in_lo,
                                               const uint64_t carry_in_hi,
                                               uint64_t& carry_lo,
                                               uint64_t& carry_hi) noexcept
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    const uint128_t product = static_cast<uint128_t>(b) * static_cast<uint128_t>(c);
    const auto r0 = static_cast<uint64_t>(product);
    const auto r1 = static_cast<uint64_t>(product >> 64);
    uint64_t out = r0 + r0;
    carry_lo = (out < r0);
    out += a;
    carry_lo += (out < a);
    out += carry_in_lo;
    carry_lo += (out < carry_in_lo);
    carry_lo += r1;
    carry_hi = (carry_lo < r1);
    carry_lo += r1;
    carry_hi += (carry_lo < r1);
    carry_lo += carry_in_hi;
    carry_hi += (carry_lo < carry_in_hi);
    return out;
#else
    const auto product = b * c;
    const auto t0 = product + a + carry_in_lo;
    const auto t1 = product + t0;
    carry_hi = t1 < product;
    const auto t2 = t1 + (carry_in_hi << 32);
    carry_hi += t2 < t1;
    carry_lo = t2 >> 32;
    return t2 & 0xffffffffULL;
#endif
}

template <class T> constexpr field<T> field<T>::reduce() const noexcept
{
    if constexpr (modulus.data[3] >= 0x4000000000000000ULL) {
        uint256_t val{ data[0], data[1], data[2], data[3] };
        if (val >= modulus) {
            val -= modulus;
        }
        return { val.data[0], val.data[1], val.data[2], val.data[3] };
    }
    uint64_t t0 = data[0] + not_modulus.data[0];
    uint64_t c = t0 < data[0];
    auto t1 = addc(data[1], not_modulus.data[1], c, c);
    auto t2 = addc(data[2], not_modulus.data[2], c, c);
    auto t3 = addc(data[3], not_modulus.data[3], c, c);
    const uint64_t selection_mask = 0ULL - c; // 0xffff... if we have overflowed.
    const uint64_t selection_mask_inverse = ~selection_mask;
    // if we overflow, we want to swap
    return {
        (data[0] & selection_mask_inverse) | (t0 & selection_mask),
        (data[1] & selection_mask_inverse) | (t1 & selection_mask),
        (data[2] & selection_mask_inverse) | (t2 & selection_mask),
        (data[3] & selection_mask_inverse) | (t3 & selection_mask),
    };
}

template <class T> constexpr field<T> field<T>::add(const field& other) const noexcept
{
    if constexpr (modulus.data[3] >= 0x4000000000000000ULL) {
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
            // Since both values are in [0, 2**256), the result is in [0, 2**257-2]. Subtracting one p might not be
            // enough. We need to ensure that we've underflown the 0 and that might require subtracting an additional p
            if (!b) {
                b = 0;
                r0 = sbb(r0, modulus.data[0], b, b);
                r1 = sbb(r1, modulus.data[1], b, b);
                r2 = sbb(r2, modulus.data[2], b, b);
                r3 = sbb(r3, modulus.data[3], b, b);
            }
        }
        return { r0, r1, r2, r3 };
    } else {
        uint64_t r0 = data[0] + other.data[0];
        uint64_t c = r0 < data[0];
        auto r1 = addc(data[1], other.data[1], c, c);
        auto r2 = addc(data[2], other.data[2], c, c);
        uint64_t r3 = data[3] + other.data[3] + c;

        uint64_t t0 = r0 + twice_not_modulus.data[0];
        c = t0 < twice_not_modulus.data[0];
        uint64_t t1 = addc(r1, twice_not_modulus.data[1], c, c);
        uint64_t t2 = addc(r2, twice_not_modulus.data[2], c, c);
        uint64_t t3 = addc(r3, twice_not_modulus.data[3], c, c);
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

    r0 += (modulus.data[0] & borrow);
    uint64_t carry = r0 < (modulus.data[0] & borrow);
    r1 = addc(r1, modulus.data[1] & borrow, carry, carry);
    r2 = addc(r2, modulus.data[2] & borrow, carry, carry);
    r3 = addc(r3, (modulus.data[3] & borrow), carry, carry);
    // The value being subtracted is in [0, 2**256), if we subtract 0 - 2*255 and then add p, the value will stay
    // negative. If we are adding p, we need to check that we've overflown 2**256. If not, we should add p again
    if (!carry) {
        r0 += (modulus.data[0] & borrow);
        uint64_t carry = r0 < (modulus.data[0] & borrow);
        r1 = addc(r1, modulus.data[1] & borrow, carry, carry);
        r2 = addc(r2, modulus.data[2] & borrow, carry, carry);
        r3 = addc(r3, (modulus.data[3] & borrow), carry, carry);
    }
    return { r0, r1, r2, r3 };
}

template <class T> constexpr field<T> field<T>::subtract_coarse(const field& other) const noexcept
{
    if constexpr (modulus.data[3] >= 0x4000000000000000ULL) {
        return subtract(other);
    }
    uint64_t borrow = 0;
    uint64_t r0 = sbb(data[0], other.data[0], borrow, borrow);
    uint64_t r1 = sbb(data[1], other.data[1], borrow, borrow);
    uint64_t r2 = sbb(data[2], other.data[2], borrow, borrow);
    uint64_t r3 = sbb(data[3], other.data[3], borrow, borrow);

    r0 += (twice_modulus.data[0] & borrow);
    uint64_t carry = r0 < (twice_modulus.data[0] & borrow);
    r1 = addc(r1, twice_modulus.data[1] & borrow, carry, carry);
    r2 = addc(r2, twice_modulus.data[2] & borrow, carry, carry);
    r3 += (twice_modulus.data[3] & borrow) + carry;

    return { r0, r1, r2, r3 };
}
template <class T> constexpr field<T> field<T>::montgomery_mul_big(const field& other) const noexcept
{
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
    uint64_t c = 0;
    uint64_t t0 = 0;
    uint64_t t1 = 0;
    uint64_t t2 = 0;
    uint64_t t3 = 0;
    uint64_t t4 = 0;
    uint64_t t5 = 0;
    uint64_t k = 0;
    for (const auto& element : data) {
        c = 0;
        mac(t0, element, other.data[0], c, t0, c);
        mac(t1, element, other.data[1], c, t1, c);
        mac(t2, element, other.data[2], c, t2, c);
        mac(t3, element, other.data[3], c, t3, c);
        t4 = addc(t4, c, 0, t5);

        c = 0;
        k = t0 * T::r_inv;
        c = mac_discard_lo(t0, k, modulus.data[0]);
        mac(t1, k, modulus.data[1], c, t0, c);
        mac(t2, k, modulus.data[2], c, t1, c);
        mac(t3, k, modulus.data[3], c, t2, c);
        t3 = addc(c, t4, 0, c);
        t4 = t5 + c;
    }
    uint64_t borrow = 0;
    uint64_t r0 = sbb(t0, modulus.data[0], borrow, borrow);
    uint64_t r1 = sbb(t1, modulus.data[1], borrow, borrow);
    uint64_t r2 = sbb(t2, modulus.data[2], borrow, borrow);
    uint64_t r3 = sbb(t3, modulus.data[3], borrow, borrow);
    borrow = borrow ^ (0ULL - t4);
    r0 += (modulus.data[0] & borrow);
    uint64_t carry = r0 < (modulus.data[0] & borrow);
    r1 = addc(r1, modulus.data[1] & borrow, carry, carry);
    r2 = addc(r2, modulus.data[2] & borrow, carry, carry);
    r3 += (modulus.data[3] & borrow) + carry;
    return { r0, r1, r2, r3 };
#else

    constexpr uint64_t wasm_modulus[9]{ modulus.data[0] & 0x1fffffff,
                                        (modulus.data[0] >> 29) & 0x1fffffff,
                                        ((modulus.data[0] >> 58) & 0x3f) | ((modulus.data[1] & 0x7fffff) << 6),
                                        (modulus.data[1] >> 23) & 0x1fffffff,
                                        ((modulus.data[1] >> 52) & 0xfff) | ((modulus.data[2] & 0x1ffff) << 12),
                                        (modulus.data[2] >> 17) & 0x1fffffff,
                                        ((modulus.data[2] >> 46) & 0x3ffff) | ((modulus.data[3] & 0x7ff) << 18),
                                        (modulus.data[3] >> 11) & 0x1fffffff,
                                        (modulus.data[3] >> 40) & 0x1fffffff };
    uint64_t left[9] = { data[0] & 0x1fffffff,
                         (data[0] >> 29) & 0x1fffffff,
                         ((data[0] >> 58) & 0x3f) | ((data[1] & 0x7fffff) << 6),
                         (data[1] >> 23) & 0x1fffffff,
                         ((data[1] >> 52) & 0xfff) | ((data[2] & 0x1ffff) << 12),
                         (data[2] >> 17) & 0x1fffffff,
                         ((data[2] >> 46) & 0x3ffff) | ((data[3] & 0x7ff) << 18),
                         (data[3] >> 11) & 0x1fffffff,
                         (data[3] >> 40) & 0x1fffffff };
    uint64_t right[9] = { other.data[0] & 0x1fffffff,
                          (other.data[0] >> 29) & 0x1fffffff,
                          ((other.data[0] >> 58) & 0x3f) | ((other.data[1] & 0x7fffff) << 6),
                          (other.data[1] >> 23) & 0x1fffffff,
                          ((other.data[1] >> 52) & 0xfff) | ((other.data[2] & 0x1ffff) << 12),
                          (other.data[2] >> 17) & 0x1fffffff,
                          ((other.data[2] >> 46) & 0x3ffff) | ((other.data[3] & 0x7ff) << 18),
                          (other.data[3] >> 11) & 0x1fffffff,
                          (other.data[3] >> 40) & 0x1fffffff };
    constexpr uint64_t mask = 0x1fffffff;
    constexpr uint64_t r_inv = T::r_inv & mask;
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
    temp_0 += left[0] * right[0];
    temp_1 += left[0] * right[1];
    temp_2 += left[0] * right[2];
    temp_3 += left[0] * right[3];
    temp_4 += left[0] * right[4];
    temp_5 += left[0] * right[5];
    temp_6 += left[0] * right[6];
    temp_7 += left[0] * right[7];
    temp_8 += left[0] * right[8];
    temp_1 += left[1] * right[0];
    temp_2 += left[1] * right[1];
    temp_3 += left[1] * right[2];
    temp_4 += left[1] * right[3];
    temp_5 += left[1] * right[4];
    temp_6 += left[1] * right[5];
    temp_7 += left[1] * right[6];
    temp_8 += left[1] * right[7];
    temp_9 += left[1] * right[8];
    temp_2 += left[2] * right[0];
    temp_3 += left[2] * right[1];
    temp_4 += left[2] * right[2];
    temp_5 += left[2] * right[3];
    temp_6 += left[2] * right[4];
    temp_7 += left[2] * right[5];
    temp_8 += left[2] * right[6];
    temp_9 += left[2] * right[7];
    temp_10 += left[2] * right[8];
    temp_3 += left[3] * right[0];
    temp_4 += left[3] * right[1];
    temp_5 += left[3] * right[2];
    temp_6 += left[3] * right[3];
    temp_7 += left[3] * right[4];
    temp_8 += left[3] * right[5];
    temp_9 += left[3] * right[6];
    temp_10 += left[3] * right[7];
    temp_11 += left[3] * right[8];
    temp_4 += left[4] * right[0];
    temp_5 += left[4] * right[1];
    temp_6 += left[4] * right[2];
    temp_7 += left[4] * right[3];
    temp_8 += left[4] * right[4];
    temp_9 += left[4] * right[5];
    temp_10 += left[4] * right[6];
    temp_11 += left[4] * right[7];
    temp_12 += left[4] * right[8];
    temp_5 += left[5] * right[0];
    temp_6 += left[5] * right[1];
    temp_7 += left[5] * right[2];
    temp_8 += left[5] * right[3];
    temp_9 += left[5] * right[4];
    temp_10 += left[5] * right[5];
    temp_11 += left[5] * right[6];
    temp_12 += left[5] * right[7];
    temp_13 += left[5] * right[8];
    temp_6 += left[6] * right[0];
    temp_7 += left[6] * right[1];
    temp_8 += left[6] * right[2];
    temp_9 += left[6] * right[3];
    temp_10 += left[6] * right[4];
    temp_11 += left[6] * right[5];
    temp_12 += left[6] * right[6];
    temp_13 += left[6] * right[7];
    temp_14 += left[6] * right[8];
    temp_7 += left[7] * right[0];
    temp_8 += left[7] * right[1];
    temp_9 += left[7] * right[2];
    temp_10 += left[7] * right[3];
    temp_11 += left[7] * right[4];
    temp_12 += left[7] * right[5];
    temp_13 += left[7] * right[6];
    temp_14 += left[7] * right[7];
    temp_15 += left[7] * right[8];
    temp_8 += left[8] * right[0];
    temp_9 += left[8] * right[1];
    temp_10 += left[8] * right[2];
    temp_11 += left[8] * right[3];
    temp_12 += left[8] * right[4];
    temp_13 += left[8] * right[5];
    temp_14 += left[8] * right[6];
    temp_15 += left[8] * right[7];
    temp_16 += left[8] * right[8];
    uint64_t k;
    k = (temp_0 * r_inv) & mask;
    temp_0 += k * wasm_modulus[0];
    temp_1 += k * wasm_modulus[1] + (temp_0 >> 29);
    temp_2 += k * wasm_modulus[2];
    temp_3 += k * wasm_modulus[3];
    temp_4 += k * wasm_modulus[4];
    temp_5 += k * wasm_modulus[5];
    temp_6 += k * wasm_modulus[6];
    temp_7 += k * wasm_modulus[7];
    temp_8 += k * wasm_modulus[8];
    k = (temp_1 * r_inv) & mask;
    temp_1 += k * wasm_modulus[0];
    temp_2 += k * wasm_modulus[1] + (temp_1 >> 29);
    temp_3 += k * wasm_modulus[2];
    temp_4 += k * wasm_modulus[3];
    temp_5 += k * wasm_modulus[4];
    temp_6 += k * wasm_modulus[5];
    temp_7 += k * wasm_modulus[6];
    temp_8 += k * wasm_modulus[7];
    temp_9 += k * wasm_modulus[8];
    k = (temp_2 * r_inv) & mask;
    temp_2 += k * wasm_modulus[0];
    temp_3 += k * wasm_modulus[1] + (temp_2 >> 29);
    temp_4 += k * wasm_modulus[2];
    temp_5 += k * wasm_modulus[3];
    temp_6 += k * wasm_modulus[4];
    temp_7 += k * wasm_modulus[5];
    temp_8 += k * wasm_modulus[6];
    temp_9 += k * wasm_modulus[7];
    temp_10 += k * wasm_modulus[8];
    k = (temp_3 * r_inv) & mask;
    temp_3 += k * wasm_modulus[0];
    temp_4 += k * wasm_modulus[1] + (temp_3 >> 29);
    temp_5 += k * wasm_modulus[2];
    temp_6 += k * wasm_modulus[3];
    temp_7 += k * wasm_modulus[4];
    temp_8 += k * wasm_modulus[5];
    temp_9 += k * wasm_modulus[6];
    temp_10 += k * wasm_modulus[7];
    temp_11 += k * wasm_modulus[8];
    k = (temp_4 * r_inv) & mask;
    temp_4 += k * wasm_modulus[0];
    temp_5 += k * wasm_modulus[1] + (temp_4 >> 29);
    temp_6 += k * wasm_modulus[2];
    temp_7 += k * wasm_modulus[3];
    temp_8 += k * wasm_modulus[4];
    temp_9 += k * wasm_modulus[5];
    temp_10 += k * wasm_modulus[6];
    temp_11 += k * wasm_modulus[7];
    temp_12 += k * wasm_modulus[8];
    k = (temp_5 * r_inv) & mask;
    temp_5 += k * wasm_modulus[0];
    temp_6 += k * wasm_modulus[1] + (temp_5 >> 29);
    temp_7 += k * wasm_modulus[2];
    temp_8 += k * wasm_modulus[3];
    temp_9 += k * wasm_modulus[4];
    temp_10 += k * wasm_modulus[5];
    temp_11 += k * wasm_modulus[6];
    temp_12 += k * wasm_modulus[7];
    temp_13 += k * wasm_modulus[8];
    k = (temp_6 * r_inv) & mask;
    temp_6 += k * wasm_modulus[0];
    temp_7 += k * wasm_modulus[1] + (temp_6 >> 29);
    temp_8 += k * wasm_modulus[2];
    temp_9 += k * wasm_modulus[3];
    temp_10 += k * wasm_modulus[4];
    temp_11 += k * wasm_modulus[5];
    temp_12 += k * wasm_modulus[6];
    temp_13 += k * wasm_modulus[7];
    temp_14 += k * wasm_modulus[8];
    k = (temp_7 * r_inv) & mask;
    temp_7 += k * wasm_modulus[0];
    temp_8 += k * wasm_modulus[1] + (temp_7 >> 29);
    temp_9 += k * wasm_modulus[2];
    temp_10 += k * wasm_modulus[3];
    temp_11 += k * wasm_modulus[4];
    temp_12 += k * wasm_modulus[5];
    temp_13 += k * wasm_modulus[6];
    temp_14 += k * wasm_modulus[7];
    temp_15 += k * wasm_modulus[8];
    k = (temp_8 * r_inv) & mask;
    temp_8 += k * wasm_modulus[0];
    temp_9 += k * wasm_modulus[1] + (temp_8 >> 29);
    temp_10 += k * wasm_modulus[2];
    temp_11 += k * wasm_modulus[3];
    temp_12 += k * wasm_modulus[4];
    temp_13 += k * wasm_modulus[5];
    temp_14 += k * wasm_modulus[6];
    temp_15 += k * wasm_modulus[7];
    temp_16 += k * wasm_modulus[8];
    temp_10 += temp_9 >> 29;
    temp_9 &= mask;
    temp_11 += temp_10 >> 29;
    temp_10 &= mask;
    temp_12 += temp_11 >> 29;
    temp_11 &= mask;
    temp_13 += temp_12 >> 29;
    temp_12 &= mask;
    temp_14 += temp_13 >> 29;
    temp_13 &= mask;
    temp_15 += temp_14 >> 29;
    temp_14 &= mask;
    temp_16 += temp_15 >> 29;
    temp_15 &= mask;
    temp_17 += temp_16 >> 29;
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

    // if (!std::is_constant_evaluated()) {
    //     info("Temp_17: ", temp_17);
    //     info("Modulus_8: ", wasm_modulus[8]);
    //     info("r_temp_8: ", r_temp_8);
    // }
    return { (temp_9 << 0) | (temp_10 << 29) | (temp_11 << 58),
             (temp_11 >> 6) | (temp_12 << 23) | (temp_13 << 52),
             (temp_13 >> 12) | (temp_14 << 17) | (temp_15 << 46),
             (temp_15 >> 18) | (temp_16 << 11) | (temp_17 << 40) };

#endif
}

#if defined(__wasm__) || !defined(__SIZEOF_INT128__)
template <class T>
constexpr void field<T>::wasm_madd(uint64_t& left_limb,
                                   const uint64_t* right_limbs,
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

template <class T>
constexpr void field<T>::wasm_karatsuba_madd(
    const uint64_t* left_limbs, const uint64_t* right_limbs, uint64_t& result_0, uint64_t& result_1, uint64_t& result_2)
{
    uint64_t low = left_limbs[0] * right_limbs[0];
    uint64_t high = left_limbs[1] * right_limbs[1];
    uint64_t middle = (left_limbs[0] + left_limbs[1]) * (right_limbs[0] + right_limbs[1]);
    result_0 += low;
    result_1 += middle - high - low;
    result_2 += high;
}

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
    constexpr uint64_t wasm_modulus[9]{ modulus.data[0] & 0x1fffffff,
                                        (modulus.data[0] >> 29) & 0x1fffffff,
                                        ((modulus.data[0] >> 58) & 0x3f) | ((modulus.data[1] & 0x7fffff) << 6),
                                        (modulus.data[1] >> 23) & 0x1fffffff,
                                        ((modulus.data[1] >> 52) & 0xfff) | ((modulus.data[2] & 0x1ffff) << 12),
                                        (modulus.data[2] >> 17) & 0x1fffffff,
                                        ((modulus.data[2] >> 46) & 0x3ffff) | ((modulus.data[3] & 0x7ff) << 18),
                                        (modulus.data[3] >> 11) & 0x1fffffff,
                                        (modulus.data[3] >> 40) & 0x1fffffff };
    constexpr uint64_t mask = 0x1fffffff;
    constexpr uint64_t r_inv = T::r_inv & mask;
    uint64_t k = (result_0 * r_inv) & mask;
    result_0 += k * wasm_modulus[0];
    result_1 += k * wasm_modulus[1] + (result_0 >> 29);
    result_2 += k * wasm_modulus[2];
    result_3 += k * wasm_modulus[3];
    result_4 += k * wasm_modulus[4];
    result_5 += k * wasm_modulus[5];
    result_6 += k * wasm_modulus[6];
    result_7 += k * wasm_modulus[7];
    result_8 += k * wasm_modulus[8];
}
#endif
template <class T> constexpr field<T> field<T>::montgomery_mul(const field& other) const noexcept
{
    if constexpr (modulus.data[3] >= 0x4000000000000000ULL) {
        return montgomery_mul_big(other);
    }
#if defined(__SIZEOF_INT128__) && !defined(__wasm__)
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

    uint64_t left[9] = { data[0] & 0x1fffffff,
                         (data[0] >> 29) & 0x1fffffff,
                         ((data[0] >> 58) & 0x3f) | ((data[1] & 0x7fffff) << 6),
                         (data[1] >> 23) & 0x1fffffff,
                         ((data[1] >> 52) & 0xfff) | ((data[2] & 0x1ffff) << 12),
                         (data[2] >> 17) & 0x1fffffff,
                         ((data[2] >> 46) & 0x3ffff) | ((data[3] & 0x7ff) << 18),
                         (data[3] >> 11) & 0x1fffffff,
                         (data[3] >> 40) & 0x1fffffff };
    uint64_t right[9] = { other.data[0] & 0x1fffffff,
                          (other.data[0] >> 29) & 0x1fffffff,
                          ((other.data[0] >> 58) & 0x3f) | ((other.data[1] & 0x7fffff) << 6),
                          (other.data[1] >> 23) & 0x1fffffff,
                          ((other.data[1] >> 52) & 0xfff) | ((other.data[2] & 0x1ffff) << 12),
                          (other.data[2] >> 17) & 0x1fffffff,
                          ((other.data[2] >> 46) & 0x3ffff) | ((other.data[3] & 0x7ff) << 18),
                          (other.data[3] >> 11) & 0x1fffffff,
                          (other.data[3] >> 40) & 0x1fffffff };
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

    wasm_karatsuba_madd(left, right, temp_0, temp_1, temp_2);
    wasm_karatsuba_madd(&left[0], &right[2], temp_2, temp_3, temp_4);
    wasm_karatsuba_madd(&left[2], &right[0], temp_2, temp_3, temp_4);
    wasm_karatsuba_madd(&left[4], &right[0], temp_4, temp_5, temp_6);
    wasm_karatsuba_madd(&left[0], &right[4], temp_4, temp_5, temp_6);
    wasm_karatsuba_madd(&left[2], &right[2], temp_4, temp_5, temp_6);
    wasm_karatsuba_madd(&left[6], &right[0], temp_6, temp_7, temp_8);
    wasm_karatsuba_madd(&left[4], &right[2], temp_6, temp_7, temp_8);
    wasm_karatsuba_madd(&left[2], &right[4], temp_6, temp_7, temp_8);
    wasm_karatsuba_madd(&left[0], &right[6], temp_6, temp_7, temp_8);
    wasm_karatsuba_madd(&left[6], &right[2], temp_8, temp_9, temp_10);
    wasm_karatsuba_madd(&left[4], &right[4], temp_8, temp_9, temp_10);
    wasm_karatsuba_madd(&left[2], &right[6], temp_8, temp_9, temp_10);
    wasm_karatsuba_madd(&left[4], &right[6], temp_10, temp_11, temp_12);
    wasm_karatsuba_madd(&left[6], &right[4], temp_10, temp_11, temp_12);
    wasm_karatsuba_madd(&left[6], &right[6], temp_12, temp_13, temp_14);
    wasm_madd(left[8], right, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15, temp_16);
    temp_8 += left[0] * right[8];
    temp_9 += left[1] * right[8];
    temp_10 += left[2] * right[8];
    temp_11 += left[3] * right[8];
    temp_12 += left[4] * right[8];
    temp_13 += left[5] * right[8];
    temp_14 += left[6] * right[8];
    temp_15 += left[7] * right[8];

    wasm_reduce(temp_0, temp_1, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8);
    wasm_reduce(temp_1, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9);
    wasm_reduce(temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10);
    wasm_reduce(temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11);
    wasm_reduce(temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12);
    wasm_reduce(temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13);
    wasm_reduce(temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14);
    wasm_reduce(temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15);
    wasm_reduce(temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15, temp_16);

    // wasm_madd(left[0], right, temp_0, temp_1, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8);
    // wasm_reduce(temp_0, temp_1, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8);
    // wasm_madd(left[1], right, temp_1, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9);
    // wasm_reduce(temp_1, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9);
    // wasm_madd(left[2], right, temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10);
    // wasm_reduce(temp_2, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10);
    // wasm_madd(left[3], right, temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11);
    // wasm_reduce(temp_3, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11);
    // wasm_madd(left[4], right, temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12);
    // wasm_reduce(temp_4, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12);
    // wasm_madd(left[5], right, temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13);
    // wasm_reduce(temp_5, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13);
    // wasm_madd(left[6], right, temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14);
    // wasm_reduce(temp_6, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14);
    // wasm_madd(left[7], right, temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15);
    // wasm_reduce(temp_7, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15);
    // wasm_madd(left[8], right, temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15, temp_16);
    // wasm_reduce(temp_8, temp_9, temp_10, temp_11, temp_12, temp_13, temp_14, temp_15, temp_16);

    temp_10 += temp_9 >> 29;
    temp_9 &= mask;
    temp_11 += temp_10 >> 29;
    temp_10 &= mask;
    temp_12 += temp_11 >> 29;
    temp_11 &= mask;
    temp_13 += temp_12 >> 29;
    temp_12 &= mask;
    temp_14 += temp_13 >> 29;
    temp_13 &= mask;
    temp_15 += temp_14 >> 29;
    temp_14 &= mask;
    temp_16 += temp_15 >> 29;
    temp_15 &= mask;
    temp_17 = temp_16 >> 29;
    temp_16 &= mask;
    return { (temp_9 << 0) | (temp_10 << 29) | (temp_11 << 58),
             (temp_11 >> 6) | (temp_12 << 23) | (temp_13 << 52),
             (temp_13 >> 12) | (temp_14 << 17) | (temp_15 << 46),
             (temp_15 >> 18) | (temp_16 << 11) | (temp_17 << 40) };
#endif
}

template <class T> constexpr field<T> field<T>::montgomery_square() const noexcept
{
    if constexpr (modulus.data[3] >= 0x4000000000000000ULL) {
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
    // We use ‘montgomery_mul' instead of 'square_accumulate'. The number of additions and comparisons in
    // 'square_accumulate' makes it slower in this particular case.
    // return montgomery_mul(*this);
    constexpr uint64_t wasm_modulus[9]{ modulus.data[0] & 0x1fffffff,
                                        (modulus.data[0] >> 29) & 0x1fffffff,
                                        ((modulus.data[0] >> 58) & 0x3f) | ((modulus.data[1] & 0x7fffff) << 6),
                                        (modulus.data[1] >> 23) & 0x1fffffff,
                                        ((modulus.data[1] >> 52) & 0xfff) | ((modulus.data[2] & 0x1ffff) << 12),
                                        (modulus.data[2] >> 17) & 0x1fffffff,
                                        ((modulus.data[2] >> 46) & 0x3ffff) | ((modulus.data[3] & 0x7ff) << 18),
                                        (modulus.data[3] >> 11) & 0x1fffffff,
                                        (modulus.data[3] >> 40) & 0x1fffffff };
    uint64_t left[9] = { data[0] & 0x1fffffff,
                         (data[0] >> 29) & 0x1fffffff,
                         ((data[0] >> 58) & 0x3f) | ((data[1] & 0x7fffff) << 6),
                         (data[1] >> 23) & 0x1fffffff,
                         ((data[1] >> 52) & 0xfff) | ((data[2] & 0x1ffff) << 12),
                         (data[2] >> 17) & 0x1fffffff,
                         ((data[2] >> 46) & 0x3ffff) | ((data[3] & 0x7ff) << 18),
                         (data[3] >> 11) & 0x1fffffff,
                         (data[3] >> 40) & 0x1fffffff };
    constexpr uint64_t mask = 0x1fffffff;
    constexpr uint64_t r_inv = T::r_inv & mask;
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
    uint64_t acc;
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
    uint64_t k;
    k = (temp_0 * r_inv) & mask;
    temp_0 += k * wasm_modulus[0];
    temp_1 += k * wasm_modulus[1] + (temp_0 >> 29);
    temp_2 += k * wasm_modulus[2];
    temp_3 += k * wasm_modulus[3];
    temp_4 += k * wasm_modulus[4];
    temp_5 += k * wasm_modulus[5];
    temp_6 += k * wasm_modulus[6];
    temp_7 += k * wasm_modulus[7];
    temp_8 += k * wasm_modulus[8];
    k = (temp_1 * r_inv) & mask;
    temp_1 += k * wasm_modulus[0];
    temp_2 += k * wasm_modulus[1] + (temp_1 >> 29);
    temp_3 += k * wasm_modulus[2];
    temp_4 += k * wasm_modulus[3];
    temp_5 += k * wasm_modulus[4];
    temp_6 += k * wasm_modulus[5];
    temp_7 += k * wasm_modulus[6];
    temp_8 += k * wasm_modulus[7];
    temp_9 += k * wasm_modulus[8];
    k = (temp_2 * r_inv) & mask;
    temp_2 += k * wasm_modulus[0];
    temp_3 += k * wasm_modulus[1] + (temp_2 >> 29);
    temp_4 += k * wasm_modulus[2];
    temp_5 += k * wasm_modulus[3];
    temp_6 += k * wasm_modulus[4];
    temp_7 += k * wasm_modulus[5];
    temp_8 += k * wasm_modulus[6];
    temp_9 += k * wasm_modulus[7];
    temp_10 += k * wasm_modulus[8];
    k = (temp_3 * r_inv) & mask;
    temp_3 += k * wasm_modulus[0];
    temp_4 += k * wasm_modulus[1] + (temp_3 >> 29);
    temp_5 += k * wasm_modulus[2];
    temp_6 += k * wasm_modulus[3];
    temp_7 += k * wasm_modulus[4];
    temp_8 += k * wasm_modulus[5];
    temp_9 += k * wasm_modulus[6];
    temp_10 += k * wasm_modulus[7];
    temp_11 += k * wasm_modulus[8];
    k = (temp_4 * r_inv) & mask;
    temp_4 += k * wasm_modulus[0];
    temp_5 += k * wasm_modulus[1] + (temp_4 >> 29);
    temp_6 += k * wasm_modulus[2];
    temp_7 += k * wasm_modulus[3];
    temp_8 += k * wasm_modulus[4];
    temp_9 += k * wasm_modulus[5];
    temp_10 += k * wasm_modulus[6];
    temp_11 += k * wasm_modulus[7];
    temp_12 += k * wasm_modulus[8];
    k = (temp_5 * r_inv) & mask;
    temp_5 += k * wasm_modulus[0];
    temp_6 += k * wasm_modulus[1] + (temp_5 >> 29);
    temp_7 += k * wasm_modulus[2];
    temp_8 += k * wasm_modulus[3];
    temp_9 += k * wasm_modulus[4];
    temp_10 += k * wasm_modulus[5];
    temp_11 += k * wasm_modulus[6];
    temp_12 += k * wasm_modulus[7];
    temp_13 += k * wasm_modulus[8];
    k = (temp_6 * r_inv) & mask;
    temp_6 += k * wasm_modulus[0];
    temp_7 += k * wasm_modulus[1] + (temp_6 >> 29);
    temp_8 += k * wasm_modulus[2];
    temp_9 += k * wasm_modulus[3];
    temp_10 += k * wasm_modulus[4];
    temp_11 += k * wasm_modulus[5];
    temp_12 += k * wasm_modulus[6];
    temp_13 += k * wasm_modulus[7];
    temp_14 += k * wasm_modulus[8];
    k = (temp_7 * r_inv) & mask;
    temp_7 += k * wasm_modulus[0];
    temp_8 += k * wasm_modulus[1] + (temp_7 >> 29);
    temp_9 += k * wasm_modulus[2];
    temp_10 += k * wasm_modulus[3];
    temp_11 += k * wasm_modulus[4];
    temp_12 += k * wasm_modulus[5];
    temp_13 += k * wasm_modulus[6];
    temp_14 += k * wasm_modulus[7];
    temp_15 += k * wasm_modulus[8];
    k = (temp_8 * r_inv) & mask;
    temp_8 += k * wasm_modulus[0];
    temp_9 += k * wasm_modulus[1] + (temp_8 >> 29);
    temp_10 += k * wasm_modulus[2];
    temp_11 += k * wasm_modulus[3];
    temp_12 += k * wasm_modulus[4];
    temp_13 += k * wasm_modulus[5];
    temp_14 += k * wasm_modulus[6];
    temp_15 += k * wasm_modulus[7];
    temp_16 += k * wasm_modulus[8];
    temp_10 += temp_9 >> 29;
    temp_9 &= mask;
    temp_11 += temp_10 >> 29;
    temp_10 &= mask;
    temp_12 += temp_11 >> 29;
    temp_11 &= mask;
    temp_13 += temp_12 >> 29;
    temp_12 &= mask;
    temp_14 += temp_13 >> 29;
    temp_13 &= mask;
    temp_15 += temp_14 >> 29;
    temp_14 &= mask;
    temp_16 += temp_15 >> 29;
    temp_15 &= mask;
    temp_17 += temp_16 >> 29;
    temp_16 &= mask;
    return { (temp_9 << 0) | (temp_10 << 29) | (temp_11 << 58),
             (temp_11 >> 6) | (temp_12 << 23) | (temp_13 << 52),
             (temp_13 >> 12) | (temp_14 << 17) | (temp_15 << 46),
             (temp_15 >> 18) | (temp_16 << 11) | (temp_17 << 40) };
#endif
}

template <class T> constexpr struct field<T>::wide_array field<T>::mul_512(const field& other) const noexcept {
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
    const uint64_t left[8]{
        data[0] & 0xffffffffULL, data[0] >> 32, data[1] & 0xffffffffULL, data[1] >> 32,
        data[2] & 0xffffffffULL, data[2] >> 32, data[3] & 0xffffffffULL, data[3] >> 32,
    };

    const uint64_t right[8]{
        other.data[0] & 0xffffffffULL, other.data[0] >> 32, other.data[1] & 0xffffffffULL, other.data[1] >> 32,
        other.data[2] & 0xffffffffULL, other.data[2] >> 32, other.data[3] & 0xffffffffULL, other.data[3] >> 32,
    };

    uint64_t carry_2 = 0;
    auto [r0, carry] = mul_wide(left[0], right[0]);
    uint64_t r1 = mac_mini(carry, left[0], right[1], carry);
    uint64_t r2 = mac_mini(carry, left[0], right[2], carry);
    uint64_t r3 = mac_mini(carry, left[0], right[3], carry);
    uint64_t r4 = mac_mini(carry, left[0], right[4], carry);
    uint64_t r5 = mac_mini(carry, left[0], right[5], carry);
    uint64_t r6 = mac_mini(carry, left[0], right[6], carry);
    uint64_t r7 = mac_mini(carry, left[0], right[7], carry_2);

    r1 = mac_mini(r1, left[1], right[0], carry);
    r2 = mac(r2, left[1], right[1], carry, carry);
    r3 = mac(r3, left[1], right[2], carry, carry);
    r4 = mac(r4, left[1], right[3], carry, carry);
    r5 = mac(r5, left[1], right[4], carry, carry);
    r6 = mac(r6, left[1], right[5], carry, carry);
    r7 = mac(r7, left[1], right[6], carry, carry);
    uint64_t r8 = mac(carry_2, left[1], right[7], carry, carry_2);

    r2 = mac_mini(r2, left[2], right[0], carry);
    r3 = mac(r3, left[2], right[1], carry, carry);
    r4 = mac(r4, left[2], right[2], carry, carry);
    r5 = mac(r5, left[2], right[3], carry, carry);
    r6 = mac(r6, left[2], right[4], carry, carry);
    r7 = mac(r7, left[2], right[5], carry, carry);
    r8 = mac(r8, left[2], right[6], carry, carry);
    uint64_t r9 = mac(carry_2, left[2], right[7], carry, carry_2);

    r3 = mac_mini(r3, left[3], right[0], carry);
    r4 = mac(r4, left[3], right[1], carry, carry);
    r5 = mac(r5, left[3], right[2], carry, carry);
    r6 = mac(r6, left[3], right[3], carry, carry);
    r7 = mac(r7, left[3], right[4], carry, carry);
    r8 = mac(r8, left[3], right[5], carry, carry);
    r9 = mac(r9, left[3], right[6], carry, carry);
    uint64_t r10 = mac(carry_2, left[3], right[7], carry, carry_2);

    r4 = mac_mini(r4, left[4], right[0], carry);
    r5 = mac(r5, left[4], right[1], carry, carry);
    r6 = mac(r6, left[4], right[2], carry, carry);
    r7 = mac(r7, left[4], right[3], carry, carry);
    r8 = mac(r8, left[4], right[4], carry, carry);
    r9 = mac(r9, left[4], right[5], carry, carry);
    r10 = mac(r10, left[4], right[6], carry, carry);
    uint64_t r11 = mac(carry_2, left[4], right[7], carry, carry_2);

    r5 = mac_mini(r5, left[5], right[0], carry);
    r6 = mac(r6, left[5], right[1], carry, carry);
    r7 = mac(r7, left[5], right[2], carry, carry);
    r8 = mac(r8, left[5], right[3], carry, carry);
    r9 = mac(r9, left[5], right[4], carry, carry);
    r10 = mac(r10, left[5], right[5], carry, carry);
    r11 = mac(r11, left[5], right[6], carry, carry);
    uint64_t r12 = mac(carry_2, left[5], right[7], carry, carry_2);

    r6 = mac_mini(r6, left[6], right[0], carry);
    r7 = mac(r7, left[6], right[1], carry, carry);
    r8 = mac(r8, left[6], right[2], carry, carry);
    r9 = mac(r9, left[6], right[3], carry, carry);
    r10 = mac(r10, left[6], right[4], carry, carry);
    r11 = mac(r11, left[6], right[5], carry, carry);
    r12 = mac(r12, left[6], right[6], carry, carry);
    uint64_t r13 = mac(carry_2, left[6], right[7], carry, carry_2);

    r7 = mac_mini(r7, left[7], right[0], carry);
    r8 = mac(r8, left[7], right[1], carry, carry);
    r9 = mac(r9, left[7], right[2], carry, carry);
    r10 = mac(r10, left[7], right[3], carry, carry);
    r11 = mac(r11, left[7], right[4], carry, carry);
    r12 = mac(r12, left[7], right[5], carry, carry);
    r13 = mac(r13, left[7], right[6], carry, carry);
    uint64_t r14 = mac(carry_2, left[7], right[7], carry, carry_2);

    return {
        r0 + (r1 << 32), r2 + (r3 << 32),   r4 + (r5 << 32),   r6 + (r7 << 32),
        r8 + (r9 << 32), r10 + (r11 << 32), r12 + (r13 << 32), r14 + (carry_2 << 32),
    };
#endif
}

// NOLINTEND(readability-implicit-bool-conversion)
} // namespace bb