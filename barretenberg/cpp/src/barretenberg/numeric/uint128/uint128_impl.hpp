// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#ifdef __i386__
#pragma once
#include "../bitop/get_msb.hpp"
#include "./uint128.hpp"
#include "barretenberg/common/assert.hpp"
namespace bb::numeric {

constexpr std::pair<uint32_t, uint32_t> uint128_t::mul_wide(const uint32_t a, const uint32_t b)
{
    const uint32_t a_lo = a & 0xffffULL;
    const uint32_t a_hi = a >> 16ULL;
    const uint32_t b_lo = b & 0xffffULL;
    const uint32_t b_hi = b >> 16ULL;

    const uint32_t lo_lo = a_lo * b_lo;
    const uint32_t hi_lo = a_hi * b_lo;
    const uint32_t lo_hi = a_lo * b_hi;
    const uint32_t hi_hi = a_hi * b_hi;

    const uint32_t cross = (lo_lo >> 16) + (hi_lo & 0xffffULL) + lo_hi;

    return { (cross << 16ULL) | (lo_lo & 0xffffULL), (hi_lo >> 16ULL) + (cross >> 16ULL) + hi_hi };
}

// compute a + b + carry, returning the carry
constexpr std::pair<uint32_t, uint32_t> uint128_t::addc(const uint32_t a, const uint32_t b, const uint32_t carry_in)
{
    const uint32_t sum = a + b;
    const auto carry_temp = static_cast<uint32_t>(sum < a);
    const uint32_t r = sum + carry_in;
    const uint32_t carry_out = carry_temp + static_cast<unsigned int>(r < carry_in);
    return { r, carry_out };
}

constexpr uint32_t uint128_t::addc_discard_hi(const uint32_t a, const uint32_t b, const uint32_t carry_in)
{
    return a + b + carry_in;
}

constexpr std::pair<uint32_t, uint32_t> uint128_t::sbb(const uint32_t a, const uint32_t b, const uint32_t borrow_in)
{
    const uint32_t t_1 = a - (borrow_in >> 31ULL);
    const auto borrow_temp_1 = static_cast<uint32_t>(t_1 > a);
    const uint32_t t_2 = t_1 - b;
    const auto borrow_temp_2 = static_cast<uint32_t>(t_2 > t_1);

    return { t_2, 0ULL - (borrow_temp_1 | borrow_temp_2) };
}

constexpr uint32_t uint128_t::sbb_discard_hi(const uint32_t a, const uint32_t b, const uint32_t borrow_in)
{
    return a - b - (borrow_in >> 31ULL);
}

// {r, carry_out} = a + carry_in + b * c
constexpr std::pair<uint32_t, uint32_t> uint128_t::mac(const uint32_t a,
                                                       const uint32_t b,
                                                       const uint32_t c,
                                                       const uint32_t carry_in)
{
    std::pair<uint32_t, uint32_t> result = mul_wide(b, c);
    result.first += a;
    const auto overflow_c = static_cast<uint32_t>(result.first < a);
    result.first += carry_in;
    const auto overflow_carry = static_cast<uint32_t>(result.first < carry_in);
    result.second += (overflow_c + overflow_carry);
    return result;
}

constexpr uint32_t uint128_t::mac_discard_hi(const uint32_t a,
                                             const uint32_t b,
                                             const uint32_t c,
                                             const uint32_t carry_in)
{
    return (b * c + a + carry_in);
}

constexpr std::pair<uint128_t, uint128_t> uint128_t::divmod(const uint128_t& b) const
{
    if (*this == 0 || b == 0) {
        return { 0, 0 };
    }
    if (b == 1) {
        return { *this, 0 };
    }
    if (*this == b) {
        return { 1, 0 };
    }
    if (b > *this) {
        return { 0, *this };
    }

    uint128_t quotient = 0;
    uint128_t remainder = *this;

    uint64_t bit_difference = get_msb() - b.get_msb();

    uint128_t divisor = b << bit_difference;
    uint128_t accumulator = uint128_t(1) << bit_difference;

    // if the divisor is bigger than the remainder, a and b have the same bit length
    if (divisor > remainder) {
        divisor >>= 1;
        accumulator >>= 1;
    }

    // while the remainder is bigger than our original divisor, we can subtract multiples of b from the remainder,
    // and add to the quotient
    while (remainder >= b) {

        // we've shunted 'divisor' up to have the same bit length as our remainder.
        // If remainder >= divisor, then a is at least '1 << bit_difference' multiples of b
        if (remainder >= divisor) {
            remainder -= divisor;
            // we can use OR here instead of +, as
            // accumulator is always a nice power of two
            quotient |= accumulator;
        }
        divisor >>= 1;
        accumulator >>= 1;
    }

    return { quotient, remainder };
}

constexpr std::pair<uint128_t, uint128_t> uint128_t::mul_extended(const uint128_t& other) const
{
    const auto [r0, t0] = mul_wide(data[0], other.data[0]);
    const auto [q0, t1] = mac(t0, data[0], other.data[1], 0);
    const auto [q1, t2] = mac(t1, data[0], other.data[2], 0);
    const auto [q2, z0] = mac(t2, data[0], other.data[3], 0);

    const auto [r1, t3] = mac(q0, data[1], other.data[0], 0);
    const auto [q3, t4] = mac(q1, data[1], other.data[1], t3);
    const auto [q4, t5] = mac(q2, data[1], other.data[2], t4);
    const auto [q5, z1] = mac(z0, data[1], other.data[3], t5);

    const auto [r2, t6] = mac(q3, data[2], other.data[0], 0);
    const auto [q6, t7] = mac(q4, data[2], other.data[1], t6);
    const auto [q7, t8] = mac(q5, data[2], other.data[2], t7);
    const auto [q8, z2] = mac(z1, data[2], other.data[3], t8);

    const auto [r3, t9] = mac(q6, data[3], other.data[0], 0);
    const auto [r4, t10] = mac(q7, data[3], other.data[1], t9);
    const auto [r5, t11] = mac(q8, data[3], other.data[2], t10);
    const auto [r6, r7] = mac(z2, data[3], other.data[3], t11);

    uint128_t lo(r0, r1, r2, r3);
    uint128_t hi(r4, r5, r6, r7);
    return { lo, hi };
}

/**
 * Viewing `this` uint128_t as a bit string, and counting bits from 0, slices a substring.
 * @returns the uint128_t equal to the substring of bits from (and including) the `start`-th bit, to (but excluding) the
 * `end`-th bit of `this`.
 */
constexpr uint128_t uint128_t::slice(const uint64_t start, const uint64_t end) const
{
    const uint64_t range = end - start;
    const uint128_t mask = (range == 128) ? -uint128_t(1) : (uint128_t(1) << range) - 1;
    return ((*this) >> start) & mask;
}

constexpr uint128_t uint128_t::pow(const uint128_t& exponent) const
{
    uint128_t accumulator{ data[0], data[1], data[2], data[3] };
    uint128_t to_mul{ data[0], data[1], data[2], data[3] };
    const uint64_t maximum_set_bit = exponent.get_msb();

    for (int i = static_cast<int>(maximum_set_bit) - 1; i >= 0; --i) {
        accumulator *= accumulator;
        if (exponent.get_bit(static_cast<uint64_t>(i))) {
            accumulator *= to_mul;
        }
    }
    if (exponent == uint128_t(0)) {
        accumulator = uint128_t(1);
    } else if (*this == uint128_t(0)) {
        accumulator = uint128_t(0);
    }
    return accumulator;
}

constexpr bool uint128_t::get_bit(const uint64_t bit_index) const
{
    ASSERT_IN_CONSTEXPR(bit_index < 128);
    if (bit_index > 127) {
        return false;
    }
    const auto idx = static_cast<size_t>(bit_index >> 5);
    const size_t shift = bit_index & 31;
    return static_cast<bool>((data[idx] >> shift) & 1);
}

constexpr uint64_t uint128_t::get_msb() const
{
    uint64_t idx = numeric::get_msb64(data[3]);
    idx = (idx == 0 && data[3] == 0) ? numeric::get_msb64(data[2]) : idx + 32;
    idx = (idx == 0 && data[2] == 0) ? numeric::get_msb64(data[1]) : idx + 32;
    idx = (idx == 0 && data[1] == 0) ? numeric::get_msb64(data[0]) : idx + 32;
    return idx;
}

constexpr uint128_t uint128_t::operator+(const uint128_t& other) const
{
    const auto [r0, t0] = addc(data[0], other.data[0], 0);
    const auto [r1, t1] = addc(data[1], other.data[1], t0);
    const auto [r2, t2] = addc(data[2], other.data[2], t1);
    const auto r3 = addc_discard_hi(data[3], other.data[3], t2);
    return { r0, r1, r2, r3 };
};

constexpr uint128_t uint128_t::operator-(const uint128_t& other) const
{

    const auto [r0, t0] = sbb(data[0], other.data[0], 0);
    const auto [r1, t1] = sbb(data[1], other.data[1], t0);
    const auto [r2, t2] = sbb(data[2], other.data[2], t1);
    const auto r3 = sbb_discard_hi(data[3], other.data[3], t2);
    return { r0, r1, r2, r3 };
}

constexpr uint128_t uint128_t::operator-() const
{
    return uint128_t(0) - *this;
}

constexpr uint128_t uint128_t::operator*(const uint128_t& other) const
{
    const auto [r0, t0] = mac(0, data[0], other.data[0], 0ULL);
    const auto [q0, t1] = mac(0, data[0], other.data[1], t0);
    const auto [q1, t2] = mac(0, data[0], other.data[2], t1);
    const auto q2 = mac_discard_hi(0, data[0], other.data[3], t2);

    const auto [r1, t3] = mac(q0, data[1], other.data[0], 0ULL);
    const auto [q3, t4] = mac(q1, data[1], other.data[1], t3);
    const auto q4 = mac_discard_hi(q2, data[1], other.data[2], t4);

    const auto [r2, t5] = mac(q3, data[2], other.data[0], 0ULL);
    const auto q5 = mac_discard_hi(q4, data[2], other.data[1], t5);

    const auto r3 = mac_discard_hi(q5, data[3], other.data[0], 0ULL);

    return { r0, r1, r2, r3 };
}

constexpr uint128_t uint128_t::operator/(const uint128_t& other) const
{
    return divmod(other).first;
}

constexpr uint128_t uint128_t::operator%(const uint128_t& other) const
{
    return divmod(other).second;
}

constexpr uint128_t uint128_t::operator&(const uint128_t& other) const
{
    return { data[0] & other.data[0], data[1] & other.data[1], data[2] & other.data[2], data[3] & other.data[3] };
}

constexpr uint128_t uint128_t::operator^(const uint128_t& other) const
{
    return { data[0] ^ other.data[0], data[1] ^ other.data[1], data[2] ^ other.data[2], data[3] ^ other.data[3] };
}

constexpr uint128_t uint128_t::operator|(const uint128_t& other) const
{
    return { data[0] | other.data[0], data[1] | other.data[1], data[2] | other.data[2], data[3] | other.data[3] };
}

constexpr uint128_t uint128_t::operator~() const
{
    return { ~data[0], ~data[1], ~data[2], ~data[3] };
}

constexpr bool uint128_t::operator==(const uint128_t& other) const
{
    return data[0] == other.data[0] && data[1] == other.data[1] && data[2] == other.data[2] && data[3] == other.data[3];
}

constexpr bool uint128_t::operator!=(const uint128_t& other) const
{
    return !(*this == other);
}

constexpr bool uint128_t::operator!() const
{
    return *this == uint128_t(0ULL);
}

constexpr bool uint128_t::operator>(const uint128_t& other) const
{
    bool t0 = data[3] > other.data[3];
    bool t1 = data[3] == other.data[3] && data[2] > other.data[2];
    bool t2 = data[3] == other.data[3] && data[2] == other.data[2] && data[1] > other.data[1];
    bool t3 =
        data[3] == other.data[3] && data[2] == other.data[2] && data[1] == other.data[1] && data[0] > other.data[0];
    return t0 || t1 || t2 || t3;
}

constexpr bool uint128_t::operator>=(const uint128_t& other) const
{
    return (*this > other) || (*this == other);
}

constexpr bool uint128_t::operator<(const uint128_t& other) const
{
    return other > *this;
}

constexpr bool uint128_t::operator<=(const uint128_t& other) const
{
    return (*this < other) || (*this == other);
}

constexpr uint128_t uint128_t::operator>>(const uint128_t& other) const
{
    uint32_t total_shift = other.data[0];

    if (total_shift >= 128 || (other.data[1] != 0U) || (other.data[2] != 0U) || (other.data[3] != 0U)) {
        return 0;
    }

    if (total_shift == 0) {
        return *this;
    }

    uint32_t num_shifted_limbs = total_shift >> 5ULL;
    uint32_t limb_shift = total_shift & 31ULL;

    std::array<uint32_t, 4> shifted_limbs = { 0, 0, 0, 0 };

    if (limb_shift == 0) {
        shifted_limbs[0] = data[0];
        shifted_limbs[1] = data[1];
        shifted_limbs[2] = data[2];
        shifted_limbs[3] = data[3];
    } else {
        uint32_t remainder_shift = 32ULL - limb_shift;

        shifted_limbs[3] = data[3] >> limb_shift;

        uint32_t remainder = (data[3]) << remainder_shift;

        shifted_limbs[2] = (data[2] >> limb_shift) + remainder;

        remainder = (data[2]) << remainder_shift;

        shifted_limbs[1] = (data[1] >> limb_shift) + remainder;

        remainder = (data[1]) << remainder_shift;

        shifted_limbs[0] = (data[0] >> limb_shift) + remainder;
    }
    uint128_t result(0);

    for (size_t i = 0; i < 4 - num_shifted_limbs; ++i) {
        result.data[i] = shifted_limbs[static_cast<size_t>(i + num_shifted_limbs)];
    }

    return result;
}

constexpr uint128_t uint128_t::operator<<(const uint128_t& other) const
{
    uint32_t total_shift = other.data[0];

    if (total_shift >= 128 || (other.data[1] != 0U) || (other.data[2] != 0U) || (other.data[3] != 0U)) {
        return 0;
    }

    if (total_shift == 0) {
        return *this;
    }
    uint32_t num_shifted_limbs = total_shift >> 5ULL;
    uint32_t limb_shift = total_shift & 31ULL;

    std::array<uint32_t, 4> shifted_limbs{ 0, 0, 0, 0 };

    if (limb_shift == 0) {
        shifted_limbs[0] = data[0];
        shifted_limbs[1] = data[1];
        shifted_limbs[2] = data[2];
        shifted_limbs[3] = data[3];
    } else {
        uint32_t remainder_shift = 32ULL - limb_shift;

        shifted_limbs[0] = data[0] << limb_shift;

        uint32_t remainder = data[0] >> remainder_shift;

        shifted_limbs[1] = (data[1] << limb_shift) + remainder;

        remainder = data[1] >> remainder_shift;

        shifted_limbs[2] = (data[2] << limb_shift) + remainder;

        remainder = data[2] >> remainder_shift;

        shifted_limbs[3] = (data[3] << limb_shift) + remainder;
    }
    uint128_t result(0);

    for (size_t i = 0; i < 4 - num_shifted_limbs; ++i) {
        result.data[static_cast<size_t>(i + num_shifted_limbs)] = shifted_limbs[i];
    }

    return result;
}

} // namespace bb::numeric
#endif
