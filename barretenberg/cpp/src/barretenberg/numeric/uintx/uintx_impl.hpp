#pragma once
#include "./uintx.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/experimental_optimizations.hpp"

namespace bb::numeric {
template <class base_uint>
std::pair<uintx<base_uint>, uintx<base_uint>> uintx<base_uint>::divmod_base(const uintx& b) const

{
    BB_ASSERT(b != 0);
    if (*this == 0) {
        return { uintx(0), uintx(0) };
    }
    if (b == 1) {
        return { *this, uintx(0) };
    }
    if (*this == b) {
        return { uintx(1), uintx(0) };
    }
    if (b > *this) {
        return { uintx(0), *this };
    }

    uintx quotient(0);
    uintx remainder = *this;

    uint64_t bit_difference = get_msb() - b.get_msb();

    uintx divisor = b << bit_difference;
    uintx accumulator = uintx(1) << bit_difference;

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

    return std::make_pair(quotient, remainder);
}

/**
 * Computes invmod. Only for internal usage within the class.
 * This is an insecure version of the algorithm that doesn't take into account the 0 case and cases when modulus is
 * close to the top margin. The result is only meaningful when *this and modulus are coprime; non-coprime inputs
 * return an unspecified value (callers must guarantee coprimality or guard against the result being used).
 *
 * @param modulus The modulus of the ring
 *
 * @return The inverse of *this modulo modulus
 **/
template <class base_uint> uintx<base_uint> uintx<base_uint>::unsafe_invmod(const uintx& modulus) const
{

    uintx t1 = 0;
    uintx t2 = 1;
    uintx r2 = (*this > modulus) ? *this % modulus : *this;
    uintx r1 = modulus;
    uintx q = 0;
    while (r2 != 0) {
        q = r1 / r2;
        uintx temp_t1 = t1;
        uintx temp_r1 = r1;
        t1 = t2;
        t2 = temp_t1 - q * t2;
        r1 = r2;
        r2 = temp_r1 - q * r2;
    }

    if (t1 > modulus) {
        return modulus + t1;
    }
    return t1;
}

/**
 * Computes the inverse of *this, modulo modulus, via the extended Euclidean algorithm.
 *
 * Delegates to appropriate unsafe_invmod (if the modulus is close to uintx top margin there is a need to expand)
 *
 * @param modulus The modulus
 * @return The inverse of *this modulo modulus
 **/
template <class base_uint> uintx<base_uint> uintx<base_uint>::invmod(const uintx& modulus) const
{
    BB_ASSERT((*this) != 0);
    BB_ASSERT(modulus != 0);
    if (modulus.get_msb() >= (2 * base_uint::length() - 1)) {
        uintx<uintx<base_uint>> a_expanded(*this);
        uintx<uintx<base_uint>> modulus_expanded(modulus);
        return a_expanded.unsafe_invmod(modulus_expanded).lo;
    }
    return this->unsafe_invmod(modulus);
}

template <class base_uint> bool uintx<base_uint>::get_bit(const uint64_t bit_index) const
{
    if (bit_index >= base_uint::length()) {
        return hi.get_bit(bit_index - base_uint::length());
    }
    return lo.get_bit(bit_index);
}

template <class base_uint> uintx<base_uint> uintx<base_uint>::operator-() const
{
    return uintx(0) - *this;
}

template <class base_uint> uintx<base_uint> uintx<base_uint>::operator*(const uintx& other) const
{
    const auto lolo = lo.mul_extended(other.lo);

    // Cross terms contribute only to the top half, so their high halves can be discarded. A zero high operand
    // also makes its cross term zero, as with bigfield products of roughly 256-bit values stored in uint1024_t.
    if (!bb::experimental_optimizations_enabled()) {
        const auto lohi = lo.mul_extended(other.hi);
        const auto hilo = hi.mul_extended(other.lo);
        return { lolo.first, lolo.second + hilo.first + lohi.first };
    }
    base_uint top = lolo.second;
    if (other.hi != base_uint(0)) {
        top += lo * other.hi;
    }
    if (hi != base_uint(0)) {
        top += hi * other.lo;
    }
    return { lolo.first, top };
}

template <class base_uint>
std::pair<uintx<base_uint>, uintx<base_uint>> uintx<base_uint>::mul_extended(const uintx& other) const
{
    if (bb::experimental_optimizations_enabled() && hi == base_uint(0) && other.hi == base_uint(0)) {
        const auto lolo = lo.mul_extended(other.lo);
        return { uintx(lolo.first, lolo.second), uintx(0) };
    }

    const auto lolo = lo.mul_extended(other.lo);
    const auto lohi = lo.mul_extended(other.hi);
    const auto hilo = hi.mul_extended(other.lo);
    const auto hihi = hi.mul_extended(other.hi);

    base_uint t0 = lolo.first;
    base_uint t1 = lolo.second;
    base_uint t2 = hilo.second;
    base_uint t3 = hihi.second;
    base_uint t2_carry(0);
    base_uint t3_carry(0);
    t1 += hilo.first;
    t2_carry += (t1 < hilo.first ? base_uint(1) : base_uint(0));
    t1 += lohi.first;
    t2_carry += (t1 < lohi.first ? base_uint(1) : base_uint(0));
    t2 += lohi.second;
    t3_carry += (t2 < lohi.second ? base_uint(1) : base_uint(0));
    t2 += hihi.first;
    t3_carry += (t2 < hihi.first ? base_uint(1) : base_uint(0));
    t2 += t2_carry;
    t3_carry += (t2 < t2_carry ? base_uint(1) : base_uint(0));
    t3 += t3_carry;
    return { uintx(t0, t1), uintx(t2, t3) };
}

template <class base_uint> uintx<base_uint> uintx<base_uint>::operator/(const uintx& other) const

{
    return divmod(other).first;
}

template <class base_uint> uintx<base_uint> uintx<base_uint>::operator%(const uintx& other) const

{
    return divmod(other).second;
}

template <class base_uint> uintx<base_uint> uintx<base_uint>::operator^(const uintx& other) const
{
    return { lo ^ other.lo, hi ^ other.hi };
}

template <class base_uint> uintx<base_uint> uintx<base_uint>::operator|(const uintx& other) const
{
    return { lo | other.lo, hi | other.hi };
}

template <class base_uint> uintx<base_uint> uintx<base_uint>::operator~() const
{
    return { ~lo, ~hi };
}

template <class base_uint> bool uintx<base_uint>::operator==(const uintx& other) const
{
    return ((lo == other.lo) && (hi == other.hi));
}

template <class base_uint> bool uintx<base_uint>::operator!=(const uintx& other) const
{
    return !(*this == other);
}

template <class base_uint> bool uintx<base_uint>::operator!() const
{
    return *this == uintx(0ULL);
}

template <class base_uint> bool uintx<base_uint>::operator>(const uintx& other) const
{
    bool hi_gt = hi > other.hi;
    bool lo_gt = lo > other.lo;

    bool gt = (hi_gt) || (lo_gt && (hi == other.hi));
    return gt;
}

template <class base_uint> bool uintx<base_uint>::operator>=(const uintx& other) const
{
    return (*this > other) || (*this == other);
}

template <class base_uint> bool uintx<base_uint>::operator<(const uintx& other) const
{
    return other > *this;
}

template <class base_uint> bool uintx<base_uint>::operator<=(const uintx& other) const
{
    return (*this < other) || (*this == other);
}

template <class base_uint> std::pair<uintx<base_uint>, uintx<base_uint>> uintx<base_uint>::divmod(const uintx& b) const

{
    constexpr uint256_t BN254FQMODULUS256 =
        uint256_t(0x3C208C16D87CFD47UL, 0x97816a916871ca8dUL, 0xb85045b68181585dUL, 0x30644e72e131a029UL);
    constexpr uint256_t SECP256K1FQMODULUS256 =
        uint256_t(0xFFFFFFFEFFFFFC2FULL, 0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL, 0xFFFFFFFFFFFFFFFFULL);
    constexpr uint256_t SECP256R1FQMODULUS256 =
        uint256_t(0xFFFFFFFFFFFFFFFFULL, 0x00000000FFFFFFFFULL, 0x0000000000000000ULL, 0xFFFFFFFF00000001ULL);

    if (b == uintx(BN254FQMODULUS256)) {
        if constexpr (base_uint::length() == 512) {
            // For x < S = 2^576 and mu = floor(S / p), q = floor(x * mu / S) underestimates floor(x / p)
            // by at most one. The check below enforces this bound on x. Larger operands use full-width Barrett
            // reduction.
            if (bb::experimental_optimizations_enabled() && (hi >> 64) == base_uint(0)) {
                static const base_uint reciprocal = (uintx(1) << 576).divmod_base(uintx(BN254FQMODULUS256)).first.lo;
                const auto low_product = lo.mul_extended(reciprocal);
                // x = lo + 2^512 * hi. Since hi < 2^64 and mu < 2^323,
                // this sum fits in 388 bits, and the discarded low half cannot
                // affect the result after shifting by 576 bits.
                const base_uint middle = low_product.second + hi * reciprocal;
                base_uint quotient = middle >> 64;
                const auto product = quotient.mul_extended(base_uint(BN254FQMODULUS256));
                uintx remainder = *this - uintx(product.first, product.second);
                if (remainder >= uintx(BN254FQMODULUS256)) {
                    quotient += 1;
                    remainder -= uintx(BN254FQMODULUS256);
                }
                return { uintx(quotient), remainder };
            }
        }
        return (*this).template barrett_reduction<BN254FQMODULUS256>();
    }
    if (b == uintx(SECP256K1FQMODULUS256)) {
        return (*this).template barrett_reduction<SECP256K1FQMODULUS256>();
    }
    if (b == uintx(SECP256R1FQMODULUS256)) {
        return (*this).template barrett_reduction<SECP256R1FQMODULUS256>();
    }

    return divmod_base(b);
}

/**
 * @brief Compute fast division via a barrett reduction
 *        Evaluates x = qm + r where m = modulus. returns q, r
 * @details This implementation is less efficient due to making no assumptions about the value of *self.
 *          When using this method to perform modular reductions e.g. (*self) mod m, if (*self) < m^2 a lot of the
 *          `uintx` operations in this method could be replaced with `base_uint` operations
 *
 * @tparam base_uint
 * @tparam modulus
 * @return std::pair<uintx<base_uint>, uintx<base_uint>>
 */
template <class base_uint>
template <base_uint modulus>
std::pair<uintx<base_uint>, uintx<base_uint>> uintx<base_uint>::barrett_reduction() const
{
    // N.B. k could be modulus.get_msb() + 1 if we have strong bounds on the max value of (*self)
    //      (a smaller k would allow us to fit `redc_parameter` into `base_uint` and not `uintx`)
    constexpr size_t k = base_uint::length() - 1;
    // N.B. computation of redc_parameter requires division operation - if this cannot be precomputed (or amortized over
    // multiple reductions over the same modulus), barrett_reduction is much slower than divmod
    // The arithmetic below may use aligned vector loads. Copy the modulus into a base_uint constant because
    // the template parameter object may not have base_uint's alignment.
    static constexpr base_uint modulus_value = modulus;
    static const uintx redc_parameter = ((uintx(1) << (k * 2)).divmod_base(uintx(modulus_value))).first;

    const auto x = *this;

    // compute x * redc_parameter
    const auto mul_result = x.mul_extended(redc_parameter);
    constexpr size_t shift = 2 * k;

    // compute (x * redc_parameter) >> 2k
    // This is equivalent to (x * (2^{2k} / modulus) / 2^{2k})
    // which approximates to x / modulus
    const uintx downshifted_hi_bits = mul_result.second & ((uintx(1) << shift) - 1);
    const uintx mul_hi_underflow = uintx(downshifted_hi_bits) << (length() - shift);
    uintx quotient = (mul_result.first >> shift) | mul_hi_underflow;

    // compute remainder by determining value of x - quotient * modulus
    uintx qm_lo(0);
    {
        const auto lolo = quotient.lo.mul_extended(modulus_value);
        const auto lohi = quotient.hi.mul_extended(modulus_value);
        base_uint t0 = lolo.first;
        base_uint t1 = lolo.second;
        t1 = t1 + lohi.first;
        qm_lo = uintx(t0, t1);
    }
    uintx remainder = x - qm_lo;

    // The quotient estimate can be off by up to 4. Classic Barrett guarantees at most 1 correction
    // when k = ceil(log2(modulus)) and x < modulus^2. Here k = base_uint::length() - 1 (a fixed,
    // conservative choice), so x / 2^{2k} can be up to 3, giving an error bound of 4.
    size_t i = 0;
    while (remainder >= uintx(modulus_value)) {
        BB_ASSERT_LT(i, 4U);
        remainder = remainder - modulus_value;
        quotient = quotient + 1;
        i++;
    }
    return std::make_pair(quotient, remainder);
}
} // namespace bb::numeric
