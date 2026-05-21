// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/fields/vector_field.hpp"
#include "element.hpp"
#include <array>
#include <cstdint>
#include <type_traits>

// NOLINTBEGIN(readability-implicit-bool-conversion, cppcoreguidelines-avoid-c-arrays)
namespace bb::group_elements {
template <class Fq, class Fr, class T>
constexpr element<Fq, Fr, T>::element(const Fq& a, const Fq& b, const Fq& c) noexcept
    : x(a)
    , y(b)
    , z(c)
{}

template <class Fq, class Fr, class T>
constexpr element<Fq, Fr, T>::element(const element& other) noexcept
    : x(other.x)
    , y(other.y)
    , z(other.z)
{}

template <class Fq, class Fr, class T>
constexpr element<Fq, Fr, T>::element(element&& other) noexcept
    : x(other.x)
    , y(other.y)
    , z(other.z)
{}

template <class Fq, class Fr, class T>
constexpr element<Fq, Fr, T>::element(const affine_element<Fq, Fr, T>& other) noexcept
    : x(other.x)
    , y(other.y)
    , z(Fq::one())
{}

template <class Fq, class Fr, class T>
constexpr element<Fq, Fr, T>& element<Fq, Fr, T>::operator=(const element& other) noexcept
{
    if (this == &other) {
        return *this;
    }
    x = other.x;
    y = other.y;
    z = other.z;
    return *this;
}

template <class Fq, class Fr, class T>
constexpr element<Fq, Fr, T>& element<Fq, Fr, T>::operator=(element&& other) noexcept
{
    x = other.x;
    y = other.y;
    z = other.z;
    return *this;
}

// Warning: variable-time — calls `z.invert()` (Bernstein-Yang safegcd).  Do not
// use on points derived from secret material (signing nonces, private keys, DH
// shared secrets).  For those, call `to_affine_const_time()` explicitly; the
// implicit conversion does NOT pick up the const-time path.
template <class Fq, class Fr, class T> constexpr element<Fq, Fr, T>::operator affine_element<Fq, Fr, T>() const noexcept
{
    if (is_point_at_infinity()) {
        affine_element<Fq, Fr, T> result;
        result.x = Fq(0);
        result.y = Fq(0);
        result.self_set_infinity();
        return result;
    }
    Fq z_inv = z.invert();
    Fq zz_inv = z_inv.sqr();
    Fq zzz_inv = zz_inv * z_inv;
    affine_element<Fq, Fr, T> result(x * zz_inv, y * zzz_inv);
    return result;
}

template <class Fq, class Fr, class T>
constexpr affine_element<Fq, Fr, T> element<Fq, Fr, T>::to_affine_const_time() const noexcept
{
    if (is_point_at_infinity()) {
        affine_element<Fq, Fr, T> result;
        result.x = Fq(0);
        result.y = Fq(0);
        result.self_set_infinity();
        return result;
    }
    Fq z_inv = z.invert_const_time();
    Fq zz_inv = z_inv.sqr();
    Fq zzz_inv = zz_inv * z_inv;
    affine_element<Fq, Fr, T> result(x * zz_inv, y * zzz_inv);
    return result;
}

template <class Fq, class Fr, class T> constexpr void element<Fq, Fr, T>::self_dbl() noexcept
{
    if constexpr (Fq::modulus.data[3] >= MODULUS_TOP_LIMB_LARGE_THRESHOLD) {
        if (is_point_at_infinity()) {
            return;
        }
    } else {
        if (x.is_msb_set_word()) {
            return;
        }
    }

    // T0 = x*x
    Fq T0 = x.sqr();

    // T1 = y*y
    Fq T1 = y.sqr();

    // T2 = T1*T1 = y*y*y*y
    Fq T2 = T1.sqr();

    // T1 = T1 + x = x + y*y
    T1 += x;

    // T1 = T1 * T1
    T1.self_sqr();

    // T3 = T0 + T2 = xx + y*y*y*y
    Fq T3 = T0 + T2;

    // T1 = T1 - T3 = x*x + y*y*y*y + 2*x*x*y*y*y*y - x*x - y*y*y*y = 2*x*x*y*y*y*y = 2*S
    T1 -= T3;

    // T1 = 2T1 = 4*S
    T1 += T1;

    // T3 = 3T0
    T3 = T0 + T0;
    T3 += T0;
    if constexpr (T::has_a) {
        T3 += (T::a * z.sqr().sqr());
    }

    // z2 = 2*y*z
    z += z;
    z *= y;

    // T0 = 2T1
    T0 = T1 + T1;

    // x2 = T3*T3
    x = T3.sqr();

    // x2 = x2 - 2T1
    x -= T0;

    // T2 = 8T2
    T2 += T2;
    T2 += T2;
    T2 += T2;

    // y2 = T1 - x2
    y = T1 - x;

    // y2 = y2 * T3 - T2
    y *= T3;
    y -= T2;
}

template <class Fq, class Fr, class T> constexpr element<Fq, Fr, T> element<Fq, Fr, T>::dbl() const noexcept
{
    element result(*this);
    result.self_dbl();
    return result;
}

template <class Fq, class Fr, class T>
constexpr element<Fq, Fr, T> element<Fq, Fr, T>::operator+=(const affine_element<Fq, Fr, T>& other) noexcept
{
    if constexpr (Fq::modulus.data[3] >= MODULUS_TOP_LIMB_LARGE_THRESHOLD) {
        // If either point is infinity, return the other point
        if (other.is_point_at_infinity()) {
            return *this;
        }
        if (is_point_at_infinity()) {
            *this = { other.x, other.y, Fq::one() };
            return *this;
        }
    } else {
        const bool edge_case_trigger = x.is_msb_set() || other.x.is_msb_set();
        if (edge_case_trigger) {
            if (x.is_msb_set()) {
                *this = { other.x, other.y, Fq::one() };
            }
            return *this;
        }
    }

    // T0 = z1.z1
    Fq T0 = z.sqr();

    // T1 = x2.t0 - x1 = x2.z1.z1 - x1
    Fq T1 = other.x * T0;
    T1 -= x;

    // T2 = T0.z1 = z1.z1.z1
    // T2 = T2.y2 - y1 = y2.z1.z1.z1 - y1
    Fq T2 = z * T0;
    T2 *= other.y;
    T2 -= y;

    if (__builtin_expect(T1.is_zero(), 0)) {
        if (T2.is_zero()) {
            self_dbl();
            return *this;
        }
        self_set_infinity();
        return *this;
    }

    // T2 = 2T2 = 2(y2.z1.z1.z1 - y1) = R
    // z3 = z1 + H
    T2 += T2;
    z += T1;

    // T3 = T1*T1 = HH
    Fq T3 = T1.sqr();

    // z3 = z3 - z1z1 - HH
    T0 += T3;

    // z3 = (z1 + H)*(z1 + H)
    z.self_sqr();
    z -= T0;

    // T3 = 4HH
    T3 += T3;
    T3 += T3;

    // T1 = T1*T3 = 4HHH
    T1 *= T3;

    // T3 = T3 * x1 = 4HH*x1
    T3 *= x;

    // T0 = 2T3
    T0 = T3 + T3;

    // T0 = T0 + T1 = 2(4HH*x1) + 4HHH
    T0 += T1;
    x = T2.sqr();

    // x3 = x3 - T0 = R*R - 8HH*x1 -4HHH
    x -= T0;

    // T3 = T3 - x3 = 4HH*x1 - x3
    T3 -= x;

    T1 *= y;
    T1 += T1;

    // T3 = T2 * T3 = R*(4HH*x1 - x3)
    T3 *= T2;

    // y3 = T3 - T1
    y = T3 - T1;
    return *this;
}

template <class Fq, class Fr, class T>
constexpr element<Fq, Fr, T> element<Fq, Fr, T>::operator+(const affine_element<Fq, Fr, T>& other) const noexcept
{
    element result(*this);
    return (result += other);
}

template <class Fq, class Fr, class T>
constexpr element<Fq, Fr, T> element<Fq, Fr, T>::operator-=(const affine_element<Fq, Fr, T>& other) noexcept
{
    const affine_element<Fq, Fr, T> to_add{ other.x, -other.y };
    return operator+=(to_add);
}

template <class Fq, class Fr, class T>
constexpr element<Fq, Fr, T> element<Fq, Fr, T>::operator-(const affine_element<Fq, Fr, T>& other) const noexcept
{
    element result(*this);
    return (result -= other);
}

template <class Fq, class Fr, class T>
constexpr element<Fq, Fr, T> element<Fq, Fr, T>::operator+=(const element& other) noexcept
{
    if constexpr (Fq::modulus.data[3] >= MODULUS_TOP_LIMB_LARGE_THRESHOLD) {
        bool p1_zero = is_point_at_infinity();
        bool p2_zero = other.is_point_at_infinity();
        if (__builtin_expect((p1_zero || p2_zero), 0)) {
            if (p1_zero && !p2_zero) {
                *this = other;
                return *this;
            }
            if (p2_zero && !p1_zero) {
                return *this;
            }
            self_set_infinity();
            return *this;
        }
    } else {
        bool p1_zero = x.is_msb_set();
        bool p2_zero = other.x.is_msb_set();
        if (__builtin_expect((p1_zero || p2_zero), 0)) {
            if (p1_zero && !p2_zero) {
                *this = other;
                return *this;
            }
            if (p2_zero && !p1_zero) {
                return *this;
            }
            self_set_infinity();
            return *this;
        }
    }
    Fq Z1Z1(z.sqr());
    Fq Z2Z2(other.z.sqr());
    Fq S2(Z1Z1 * z);
    Fq U2(Z1Z1 * other.x);
    S2 *= other.y;
    Fq U1(Z2Z2 * x);
    Fq S1(Z2Z2 * other.z);
    S1 *= y;

    Fq F(S2 - S1);

    Fq H(U2 - U1);

    if (__builtin_expect(H.is_zero(), 0)) {
        if (F.is_zero()) {
            self_dbl();
            return *this;
        }
        self_set_infinity();
        return *this;
    }

    F += F;

    Fq I(H + H);
    I.self_sqr();

    Fq J(H * I);

    U1 *= I;

    U2 = U1 + U1;
    U2 += J;

    x = F.sqr();

    x -= U2;

    J *= S1;
    J += J;

    y = U1 - x;

    y *= F;

    y -= J;

    z += other.z;

    Z1Z1 += Z2Z2;

    z.self_sqr();
    z -= Z1Z1;
    z *= H;
    return *this;
}

template <class Fq, class Fr, class T>
constexpr element<Fq, Fr, T> element<Fq, Fr, T>::operator+(const element& other) const noexcept
{
    element result(*this);
    return (result += other);
}

template <class Fq, class Fr, class T>
constexpr element<Fq, Fr, T> element<Fq, Fr, T>::operator-=(const element& other) noexcept
{
    const element to_add{ other.x, -other.y, other.z };
    return operator+=(to_add);
}

template <class Fq, class Fr, class T>
constexpr element<Fq, Fr, T> element<Fq, Fr, T>::operator-(const element& other) const noexcept
{
    element result(*this);
    return (result -= other);
}

template <class Fq, class Fr, class T> constexpr element<Fq, Fr, T> element<Fq, Fr, T>::operator-() const noexcept
{
    return { x, -y, z };
}

template <class Fq, class Fr, class T>
element<Fq, Fr, T> element<Fq, Fr, T>::operator*(const Fr& exponent) const noexcept
{
    if constexpr (T::USE_ENDOMORPHISM) {
        return mul_with_endomorphism(exponent);
    }
    return mul_without_endomorphism(exponent);
}

template <class Fq, class Fr, class T> element<Fq, Fr, T> element<Fq, Fr, T>::operator*=(const Fr& exponent) noexcept
{
    *this = operator*(exponent);
    return *this;
}

template <class Fq, class Fr, class T>
element<Fq, Fr, T> element<Fq, Fr, T>::mul_const_time(const Fr& scalar, numeric::RNG* engine) const noexcept
{
    if (engine == nullptr) {
        engine = &numeric::get_randomness();
    }

    // Convert the scalar to canonical u256 form
    const uint256_t k = uint256_t(scalar);

    // Coron's first DPA countermeasure (J.-S. Coron, "Resistance against Differential Power Analysis
    // for Elliptic Curve Cryptosystems", CHES 1999, LNCS 1717, pp. 292-302, Section 5.1): blind the
    // scalar with k' = k + r * n where r is a fresh random 64-bit value sampled per call. Since
    // n * P = O for any P in the prime-order subgroup, k' * P = k * P. The randomization defeats
    // DPA: per-bit traces of two signings with the same k decorrelate because the bit pattern of k'
    // differs across calls.
    //
    // We force the high bit of r to be 1 so that r is sampled uniformly from [2^63, 2^64). This
    // guarantees r * n has a fixed-width range (MSB at position M+63 or M+64 for n with MSB at M),
    // so the iteration count remains exactly NUM_BITS regardless of the sampled r.
    const uint64_t r = engine->get_random_uint64() | (UINT64_C(1) << 63);
    const uint512_t r_times_n = uint512_t(uint256_t(Fr::modulus)) * uint512_t(uint256_t(r));
    const uint512_t k_blinded = uint512_t(k) + r_times_n;

    // For n with MSB at position M, r * n < 2^(M + 65), so k_blinded < 2^(M + 65) + n < 2^(M + 66).
    // Iterating M+65 bits is safe because k < n means the additional bit from k cannot push k_blinded
    // past 2^(M + 65) when n is at the lower end of [2^M, 2^(M+1)); we add one extra bit (M + 66
    // total) to cover the worst case where n is close to 2^(M+1).
    constexpr size_t NUM_BITS = static_cast<size_t>(uint256_t(Fr::modulus).get_msb()) + 66;

    // Constant-time conditional swap of two Fq coordinates. `mask` is 0 (no swap) or all-ones (swap),
    // derived from the secret bit via integer subtraction so no branch is emitted.
    auto cs_fq = [](Fq& a, Fq& b, uint64_t mask) {
        constexpr size_t NUM_LIMBS = sizeof(Fq) / sizeof(uint64_t);
        for (size_t i = 0; i < NUM_LIMBS; ++i) {
            uint64_t t = mask & (a.data[i] ^ b.data[i]);
            a.data[i] ^= t;
            b.data[i] ^= t;
        }
    };
    auto cswap = [&cs_fq](element& a, element& b, uint64_t mask) {
        cs_fq(a.x, b.x, mask);
        cs_fq(a.y, b.y, mask);
        cs_fq(a.z, b.z, mask);
    };

    // Montgomery ladder. Invariant after each iteration: R1 - R0 = P.
    // Once R0 first becomes non-infinity (after the first 1-bit of k_blinded is processed), the
    // invariant guarantees R0 + R1 and 2 * R0 do not hit the doubling/infinity special-case branches.
    element R0 = element::infinity();
    element R1(*this);

    for (size_t i = NUM_BITS; i-- > 0;) {
        const uint64_t mask = 0ULL - static_cast<uint64_t>(k_blinded.get_bit(i));
        cswap(R0, R1, mask);
        R1 = R0 + R1;
        R0 = R0.dbl();
        cswap(R0, R1, mask);
    }
    return R0;
}

// Warning: variable-time via the implicit affine conversion above.  For
// secret-input points use `normalize_const_time()`.
template <class Fq, class Fr, class T> constexpr element<Fq, Fr, T> element<Fq, Fr, T>::normalize() const noexcept
{
    const affine_element<Fq, Fr, T> converted = *this;
    return element(converted);
}

template <class Fq, class Fr, class T>
constexpr element<Fq, Fr, T> element<Fq, Fr, T>::normalize_const_time() const noexcept
{
    return element(to_affine_const_time());
}

template <class Fq, class Fr, class T> element<Fq, Fr, T> element<Fq, Fr, T>::infinity()
{
    element<Fq, Fr, T> e{};
    e.self_set_infinity();
    return e;
}

template <class Fq, class Fr, class T> constexpr element<Fq, Fr, T> element<Fq, Fr, T>::set_infinity() const noexcept
{
    element result(*this);
    result.self_set_infinity();
    return result;
}

template <class Fq, class Fr, class T> constexpr void element<Fq, Fr, T>::self_set_infinity() noexcept
{
    if constexpr (Fq::modulus.data[3] >= MODULUS_TOP_LIMB_LARGE_THRESHOLD) {
        // We set the value of x equal to modulus to represent inifinty
        x.data[0] = Fq::modulus.data[0];
        x.data[1] = Fq::modulus.data[1];
        x.data[2] = Fq::modulus.data[2];
        x.data[3] = Fq::modulus.data[3];

        // Clear y and z so the infinity representation is canonical regardless of prior state
        y = Fq::zero();
        z = Fq::zero();
    } else {
        (*this).x = Fq::zero();
        (*this).y = Fq::zero();
        (*this).z = Fq::zero();
        x.self_set_msb();
    }
}

template <class Fq, class Fr, class T> constexpr bool element<Fq, Fr, T>::is_point_at_infinity() const noexcept
{
    if constexpr (Fq::modulus.data[3] >= MODULUS_TOP_LIMB_LARGE_THRESHOLD) {
        // We check if the value of x is equal to modulus to represent inifinty
        return ((x.data[0] ^ Fq::modulus.data[0]) | (x.data[1] ^ Fq::modulus.data[1]) |
                (x.data[2] ^ Fq::modulus.data[2]) | (x.data[3] ^ Fq::modulus.data[3])) == 0;
    } else {
        return (x.is_msb_set());
    }
}

template <class Fq, class Fr, class T> constexpr bool element<Fq, Fr, T>::on_curve() const noexcept
{
    if (is_point_at_infinity()) {
        return true;
    }
    // We specify the point at inifinity not by (0 \lambda 0), so z should not be 0
    if (z.is_zero()) {
        return false;
    }
    Fq zz = z.sqr();
    Fq zzzz = zz.sqr();
    Fq bz_6 = zzzz * zz * T::b;
    if constexpr (T::has_a) {
        bz_6 += (x * T::a) * zzzz;
    }
    Fq xxx = x.sqr() * x + bz_6;
    Fq yy = y.sqr();
    return (xxx == yy);
}

template <class Fq, class Fr, class T>
constexpr bool element<Fq, Fr, T>::operator==(const element& other) const noexcept
{
    // If one of points is not on curve, we have no business comparing them.
    if ((!on_curve()) || (!other.on_curve())) {
        return false;
    }
    bool am_infinity = is_point_at_infinity();
    bool is_infinity = other.is_point_at_infinity();
    bool both_infinity = am_infinity && is_infinity;
    // If just one is infinity, then they are obviously not equal.
    if ((!both_infinity) && (am_infinity || is_infinity)) {
        return false;
    }
    const Fq lhs_zz = z.sqr();
    const Fq lhs_zzz = lhs_zz * z;
    const Fq rhs_zz = other.z.sqr();
    const Fq rhs_zzz = rhs_zz * other.z;

    const Fq lhs_x = x * rhs_zz;
    const Fq lhs_y = y * rhs_zzz;

    const Fq rhs_x = other.x * lhs_zz;
    const Fq rhs_y = other.y * lhs_zzz;
    return both_infinity || ((lhs_x == rhs_x) && (lhs_y == rhs_y));
}

template <class Fq, class Fr, class T>
element<Fq, Fr, T> element<Fq, Fr, T>::random_element(numeric::RNG* engine) noexcept
{
    if constexpr (T::can_hash_to_curve) {
        element result = random_coordinates_on_curve(engine);
        result.z = Fq::random_element(engine);
        Fq zz = result.z.sqr();
        Fq zzz = zz * result.z;
        result.x *= zz;
        result.y *= zzz;
        return result;
    } else {
        Fr scalar = Fr::random_element(engine);
        return (element{ T::one_x, T::one_y, Fq::one() } * scalar);
    }
}

template <class Fq, class Fr, class T>
element<Fq, Fr, T> element<Fq, Fr, T>::mul_without_endomorphism(const Fr& scalar) const noexcept
{
    const uint256_t converted_scalar(scalar);

    if (converted_scalar == 0) {
        return element::infinity();
    }

    element accumulator(*this);
    const uint64_t maximum_set_bit = converted_scalar.get_msb();
    // NOT constant-time: the loop bound leaks bit-length and the per-bit branch leaks Hamming
    // weight. This is acceptable only for public scalars; secret scalars must go through
    // mul_const_time.
    for (uint64_t i = maximum_set_bit - 1; i < maximum_set_bit; --i) {
        accumulator.self_dbl();
        if (converted_scalar.get_bit(i)) {
            accumulator += *this;
        }
    }
    return accumulator;
}

namespace detail {
// Represents the result of
using EndoScalars = std::pair<std::array<uint64_t, 2>, std::array<uint64_t, 2>>;

/**
 * @brief Handles the WNAF computation for scalars that are split using an endomorphism,
 * achieved through `split_into_endomorphism_scalars`. It facilitates efficient computation of elliptic curve
 * point multiplication by optimizing the representation of these scalars.
 *
 * @tparam Element The data type of elements in the elliptic curve.
 * @tparam NUM_ROUNDS The number of computation rounds for WNAF.
 */
template <typename Element, std::size_t NUM_ROUNDS> struct EndomorphismWnaf {
    // NUM_WNAF_BITS: Number of bits per window in the WNAF representation.
    static constexpr size_t NUM_WNAF_BITS = 4;
    // table: Stores the WNAF representation of the scalars.
    std::array<uint64_t, NUM_ROUNDS * 2> table;
    // skew and endo_skew: Indicate if our original scalar is even or odd.
    bool skew = false;
    bool endo_skew = false;

    /**
     * @param scalars A pair of 128-bit scalars (as two uint64_t arrays), split using an endomorphism.
     */
    EndomorphismWnaf(const EndoScalars& scalars)
    {
        wnaf::fixed_wnaf(&scalars.first[0], &table[0], skew, 0, 2, NUM_WNAF_BITS);
        wnaf::fixed_wnaf(&scalars.second[0], &table[1], endo_skew, 0, 2, NUM_WNAF_BITS);
    }
};

} // namespace detail

template <class Fq, class Fr, class T>
element<Fq, Fr, T> element<Fq, Fr, T>::mul_with_endomorphism(const Fr& scalar) const noexcept
{
    // Consider the infinity flag, return infinity if set
    if (is_point_at_infinity()) {
        return element::infinity();
    }
    constexpr size_t NUM_ROUNDS = 32;
    const Fr converted_scalar = scalar.from_montgomery_form();

    if (converted_scalar.is_zero()) {
        return element::infinity();
    }
    static constexpr size_t LOOKUP_SIZE = 8;
    std::array<element, LOOKUP_SIZE> lookup_table;

    element d2 = dbl();
    lookup_table[0] = element(*this);
    for (size_t i = 1; i < LOOKUP_SIZE; ++i) {
        lookup_table[i] = lookup_table[i - 1] + d2;
    }

    detail::EndoScalars endo_scalars = Fr::split_into_endomorphism_scalars(converted_scalar);
    detail::EndomorphismWnaf<element, NUM_ROUNDS> wnaf{ endo_scalars };
    element accumulator{ T::one_x, T::one_y, Fq::one() };
    accumulator.self_set_infinity();
    Fq beta = Fq::cube_root_of_unity();

    for (size_t i = 0; i < NUM_ROUNDS * 2; ++i) {
        uint64_t wnaf_entry = wnaf.table[i];
        uint64_t index = wnaf_entry & 0x0fffffffU;
        bool sign = static_cast<bool>((wnaf_entry >> 31) & 1);
        const bool is_odd = ((i & 1) == 1);
        auto to_add = lookup_table[static_cast<size_t>(index)];
        to_add.y.self_conditional_negate(sign ^ is_odd);
        if (is_odd) {
            to_add.x *= beta;
        }
        accumulator += to_add;

        if (i != ((2 * NUM_ROUNDS) - 1) && is_odd) {
            for (size_t j = 0; j < 4; ++j) {
                accumulator.self_dbl();
            }
        }
    }

    if (wnaf.skew) {
        accumulator += -lookup_table[0];
    }
    if (wnaf.endo_skew) {
        accumulator += element{ lookup_table[0].x * beta, lookup_table[0].y, lookup_table[0].z };
    }

    return accumulator;
}

/**
 * @brief Batch affine addition for parallel arrays: (lhs[i], rhs[i]) → rhs[i]
 * @details Uses Montgomery's batch inversion trick. lhs and rhs are separate arrays so no aliasing issues.
 *
 * @param lhs        Input array of first summands (read-only)
 * @param rhs        Input array of second summands; results are written here (rhs[i] = lhs[i] + rhs[i])
 * @param num_pairs  Number of point pairs to add
 * @param scratch_space Temporary storage for batch inversion, size >= num_pairs
 *
 * @warning ASSUMES NO EDGE CASES:
 *   - All points must be valid (not point at infinity)
 *   - lhs[i] != rhs[i] for all i (no point doubling cases)
 *   - lhs[i] != -rhs[i] for all i (no point at infinity results)
 */
template <typename AffineElement, typename Fq>
__attribute__((always_inline)) inline void batch_affine_add_impl(const AffineElement* lhs,
                                                                 AffineElement* rhs,
                                                                 const size_t num_pairs,
                                                                 Fq* scratch_space) noexcept
{
    Fq batch_inversion_accumulator = Fq::one();

    // Forward pass: prepare batch inversion
    for (size_t i = 0; i < num_pairs; ++i) {
        scratch_space[i] = lhs[i].x + rhs[i].x;
        rhs[i].x -= lhs[i].x;
        rhs[i].y -= lhs[i].y;
        rhs[i].y *= batch_inversion_accumulator;
        batch_inversion_accumulator *= rhs[i].x;
    }

    if (batch_inversion_accumulator == Fq::zero()) {
        throw_or_abort("attempted to invert zero in batch_affine_add_impl");
    }
    batch_inversion_accumulator = batch_inversion_accumulator.invert();

    // Backward pass: compute additions
    for (size_t i = num_pairs - 1; i < num_pairs; --i) {
        // lambda = (y2 - y1) / (x2 - x1)
        rhs[i].y *= batch_inversion_accumulator;
        batch_inversion_accumulator *= rhs[i].x;
        rhs[i].x = rhs[i].y.sqr();
        rhs[i].x -= scratch_space[i]; // x3 = lambda^2 - (x1 + x2)

        // y3 = lambda * (x1 - x3) - y1
        Fq temp = lhs[i].x - rhs[i].x;
        temp *= rhs[i].y;
        rhs[i].y = temp - lhs[i].y;
    }
}

/**
 * @brief Batch affine addition for interleaved arrays: pairs (points[2i], points[2i+1]) → points[num_points/2 + i]
 * @details Optimized for the pippenger interleaved memory layout where lhs and rhs live in the same contiguous array.
 *          Uses direct address arithmetic and hardcoded prefetch to avoid aliasing penalties that arise when the
 *          generic batch_affine_add_impl is called with lhs_base == rhs_base (the compiler cannot prove that writes
 *          to `output` don't alias reads from `lhs`, forcing unnecessary reloads).
 *
 *          Under WASM SIMD with the BN254 base field, runs a 5-wide q1s1 forward+backward pass (5 lane
 *          accumulators interleaving 5 independent batch-inversion chains via VectorField<Bn254FqParams>),
 *          plus a scalar K=1 tail for points not covered by a full 10-point group. Below K5_MIN_POINTS or
 *          on non-WASM targets, degenerates to the original single-accumulator path.
 *
 * @param points     Interleaved array: [lhs0, rhs0, lhs1, rhs1, ...]. Results written to top half.
 * @param num_points Total number of points (must be even). Number of pairs = num_points / 2.
 * @param scratch_space Temporary storage for batch inversion, size >= num_points / 2.
 */
template <typename AffineElement, typename Fq>
__attribute__((always_inline)) inline void batch_affine_add_interleaved(AffineElement* points,
                                                                        const size_t num_points,
                                                                        Fq* scratch_space) noexcept
{
    // K=5 dispatch: only when WASM SIMD is wired AND the base field is BN254 Fq (the only Params we have
    // a VectorField operator* specialization for). Below K5_MIN_POINTS the per-group setup (gather/scatter,
    // batch-inversion split tree) outweighs the per-mul savings, so we keep the original K=1 path.
#if defined(__wasm_simd128__)
    constexpr bool CAN_USE_K5 = std::is_same_v<Fq, bb::fq>;
#else
    constexpr bool CAN_USE_K5 = false;
#endif
    constexpr size_t K5_MIN_POINTS = 20;

    const size_t k5_pair_groups = (CAN_USE_K5 && num_points >= K5_MIN_POINTS) ? ((num_points >> 1) / 5) : size_t{ 0 };
    const size_t k5_points = k5_pair_groups * 10;

    std::array<Fq, 5> acc_lanes = { Fq::one(), Fq::one(), Fq::one(), Fq::one(), Fq::one() };

    // ---------------------------------------------------------------------
    // K=5 forward pass. Per group of 10 points, two 5-wide muls:
    //   y_lane *= acc_lane    (5-wide)
    //   acc_lane *= x_lane    (5-wide)
    // Each lane k threads its own independent batch-inversion chain through the groups.
    //
    // Note: tried keeping acc_lanes in packed VFq form across iterations
    // (one to_array() at loop exit instead of per-group) to drop the
    // apparent AoS↔packed round-trip — no measurable end-to-end
    // improvement on V8/wasmtime. LLVM appears to SROA the round-trip
    // already.
    // ---------------------------------------------------------------------
    if constexpr (CAN_USE_K5) {
        using VFq = VectorField<Bn254FqParams>;
        std::array<Fq, 5> y_buf; // (y2 - y1) per lane in current group
        std::array<Fq, 5> x_buf; // (x2 - x1) per lane in current group
        for (size_t g = 0; g < k5_pair_groups; ++g) {
            const size_t i = g * 10;
            for (size_t k = 0; k < 5; ++k) {
                const size_t pi = i + (2 * k);
                scratch_space[pi >> 1] = points[pi].x + points[pi + 1].x; // x1 + x2 (saved for backward)
                points[pi + 1].x -= points[pi].x;                         // x2 - x1
                points[pi + 1].y -= points[pi].y;                         // y2 - y1
                y_buf[k] = points[pi + 1].y;
                x_buf[k] = points[pi + 1].x;
            }
            VFq vec_acc(acc_lanes);
            std::array<Fq, 5> y_out = (VFq(y_buf) * vec_acc).to_array();
            for (size_t k = 0; k < 5; ++k) {
                points[i + (2 * k) + 1].y = y_out[k];
            }
            acc_lanes = (vec_acc * VFq(x_buf)).to_array();
        }
    }

    // ---------------------------------------------------------------------
    // Combine 5 lane accumulators into one and run the K=1 forward tail.
    // When k5_points == 0 this collapses cleanly to the original K=1 forward
    // pass (acc_lanes is all-ones, so the product is one).
    // ---------------------------------------------------------------------
    Fq batch_inversion_accumulator = acc_lanes[0] * acc_lanes[1] * acc_lanes[2] * acc_lanes[3] * acc_lanes[4];
    for (size_t i = k5_points; i < num_points; i += 2) {
        scratch_space[i >> 1] = points[i].x + points[i + 1].x;
        points[i + 1].x -= points[i].x;
        points[i + 1].y -= points[i].y;
        points[i + 1].y *= batch_inversion_accumulator;
        batch_inversion_accumulator *= points[i + 1].x;
    }

    if (batch_inversion_accumulator == Fq::zero()) {
        throw_or_abort("attempted to invert zero in batch_affine_add_interleaved");
    }
    batch_inversion_accumulator = batch_inversion_accumulator.invert();

    // ---------------------------------------------------------------------
    // K=1 backward tail. Walks down from num_points to k5_points, unwinding
    // the tail's contribution to batch_inversion_accumulator. After this
    // loop completes, batch_inversion_accumulator = 1 / (prod of acc_lanes).
    // ---------------------------------------------------------------------
    for (size_t i = num_points; i > k5_points;) {
        i -= 2;
        // lambda = (y2 - y1) / (x2 - x1)
        points[i + 1].y *= batch_inversion_accumulator;
        batch_inversion_accumulator *= points[i + 1].x;
        points[i + 1].x = points[i + 1].y.sqr();
        // x3 = lambda^2 - (x1 + x2)
        points[(i + num_points) >> 1].x = points[i + 1].x - scratch_space[i >> 1];

        if (i >= k5_points + 2) {
            __builtin_prefetch(points + i - 2);
            __builtin_prefetch(points + i - 1);
            __builtin_prefetch(points + ((i + num_points - 2) >> 1));
            __builtin_prefetch(scratch_space + ((i - 2) >> 1));
        }

        // y3 = lambda * (x1 - x3) - y1
        points[i].x -= points[(i + num_points) >> 1].x;
        points[i].x *= points[i + 1].y;
        points[(i + num_points) >> 1].y = points[i].x - points[i].y;
    }

    // ---------------------------------------------------------------------
    // K=5 backward pass. Split batch_inversion_accumulator into 5 per-lane
    // inverses via the standard batch-inversion product tree, then walk
    // groups in reverse order with 5-wide muls. Each group does 4 muls (vs
    // the 4 muls/pair × 5 pairs = 20 scalar muls of K=1).
    // ---------------------------------------------------------------------
    if constexpr (CAN_USE_K5) {
        if (k5_pair_groups == 0) {
            return;
        }
        using VFq = VectorField<Bn254FqParams>;

        // 4 prefix muls + 8 unwind muls = 12 muls + 1 inversion (already done) to recover 5 lane inverses.
        std::array<Fq, 4> prefix;
        prefix[0] = acc_lanes[0];
        prefix[1] = prefix[0] * acc_lanes[1];
        prefix[2] = prefix[1] * acc_lanes[2];
        prefix[3] = prefix[2] * acc_lanes[3];
        std::array<Fq, 5> inv_lanes;
        Fq running_inv = batch_inversion_accumulator;
        inv_lanes[4] = running_inv * prefix[3];
        running_inv *= acc_lanes[4];
        inv_lanes[3] = running_inv * prefix[2];
        running_inv *= acc_lanes[3];
        inv_lanes[2] = running_inv * prefix[1];
        running_inv *= acc_lanes[2];
        inv_lanes[1] = running_inv * prefix[0];
        running_inv *= acc_lanes[1];
        inv_lanes[0] = running_inv;

        for (size_t g_rev = k5_pair_groups; g_rev > 0; --g_rev) {
            const size_t g = g_rev - 1;
            const size_t i = g * 10;

            // Snapshot ALL reads from `points` before any writes to upper-half output slots.
            // Critical: the output slot (pi + num_points) >> 1 for one lane's pair may collide
            // with the input slot pi or pi+1 of a LATER lane in the same group when k5_points
            // exceeds num_points/2 (typical for large MSM bucket sizes). Without snapshotting,
            // a write at lane k_write clobbers a read at lane k_read > k_write, corrupting y3.
            std::array<Fq, 5> y_buf;          // (y2 - y1) * acc_old per lane (stored at points[pi+1].y)
            std::array<Fq, 5> x_buf;          // x2 - x1 per lane (stored at points[pi+1].x)
            std::array<Fq, 5> x1_buf;         // original lhs x1 (points[pi].x)
            std::array<Fq, 5> y1_buf;         // original lhs y1 (points[pi].y)
            std::array<Fq, 5> x1_plus_x2_buf; // x1 + x2 (saved in scratch by forward)
            for (size_t k = 0; k < 5; ++k) {
                const size_t pi = i + (2 * k);
                y_buf[k] = points[pi + 1].y;
                x_buf[k] = points[pi + 1].x;
                x1_buf[k] = points[pi].x;
                y1_buf[k] = points[pi].y;
                x1_plus_x2_buf[k] = scratch_space[pi >> 1];
            }

            // lambda = y_buf * inv_lanes  (5-wide)
            std::array<Fq, 5> lambda_buf = (VFq(y_buf) * VFq(inv_lanes)).to_array();

            // inv_lanes *= x_buf — unwinds inv for the previous group's lane k  (5-wide)
            inv_lanes = (VFq(inv_lanes) * VFq(x_buf)).to_array();

            // lambda_sq = lambda * lambda  (5-wide)
            VFq vec_lambda(lambda_buf);
            std::array<Fq, 5> lambda_sq = (vec_lambda * vec_lambda).to_array();

            // x3 = lambda^2 - (x1 + x2);  x1_minus_x3 = x1 - x3   (scalar prep)
            std::array<Fq, 5> x3_buf;
            std::array<Fq, 5> x1_minus_x3_buf;
            for (size_t k = 0; k < 5; ++k) {
                x3_buf[k] = lambda_sq[k] - x1_plus_x2_buf[k];
                x1_minus_x3_buf[k] = x1_buf[k] - x3_buf[k];
            }

            // ly = lambda * (x1 - x3)  (5-wide)
            std::array<Fq, 5> ly = (vec_lambda * VFq(x1_minus_x3_buf)).to_array();

            // y3 = ly - y1 (scalar); write x3 / y3 to compressed output positions. All input
            // reads are now from snapshot buffers — writes can safely clobber points[pi+1] and
            // even points[pi] / scratch_space[pi >> 1] without affecting later lanes.
            for (size_t k = 0; k < 5; ++k) {
                const size_t pi = i + (2 * k);
                points[(pi + num_points) >> 1].x = x3_buf[k];
                points[(pi + num_points) >> 1].y = ly[k] - y1_buf[k];
            }
        }
    }
}

/**
 * @brief Batch affine point doubling using Montgomery's trick
 * @tparam AffineElement Affine point type
 * @tparam Fq Base field type
 * @tparam T Curve parameters type (for adding `a` in slope calculation)
 *
 * @warning ASSUMES NO EDGE CASES:
 *   - All points must be valid (not point at infinity)
 *   - points[i].y != 0 for all i (no vertical tangents)
 *   - No points with order 2 (where 2P = point at infinity)
 *
 * @note This is the "unsafe" fast path. For general point doubling with edge case handling,
 *       use Jacobian arithmetic or check for edge cases before calling this function.
 *
 * Under WASM SIMD with the BN254 base field, runs a 5-wide q1s1 forward+backward pass (5 lane
 * accumulators interleaving 5 independent batch-inversion chains via VectorField<Bn254FqParams>),
 * plus a scalar K=1 tail for points not covered by a full 5-point group. Below K5_MIN_POINTS or
 * on non-WASM targets, degenerates to the original single-accumulator path.
 */
template <typename AffineElement, typename Fq, typename T>
__attribute__((always_inline)) inline void batch_affine_double_impl(AffineElement* points,
                                                                    const size_t num_points,
                                                                    Fq* scratch_space) noexcept
{
#if defined(__wasm_simd128__)
    constexpr bool CAN_USE_K5 = std::is_same_v<Fq, bb::fq>;
#else
    constexpr bool CAN_USE_K5 = false;
#endif
    constexpr size_t K5_MIN_POINTS = 20;

    const size_t k5_groups = (CAN_USE_K5 && num_points >= K5_MIN_POINTS) ? (num_points / 5) : size_t{ 0 };
    const size_t k5_points = k5_groups * 5;

    std::array<Fq, 5> acc_lanes = { Fq::one(), Fq::one(), Fq::one(), Fq::one(), Fq::one() };

    // ---------------------------------------------------------------------
    // K=5 forward pass. Per group of 5 points, three 5-wide muls:
    //   x_sq    = x * x         (5-wide sqr)
    //   scratch = (3*x_sq) * acc (5-wide mul; 3*x_sq via scalar adds)
    //   acc    *= 2y            (5-wide mul)
    // Each lane k threads its own independent batch-inversion chain through the groups.
    // ---------------------------------------------------------------------
    if constexpr (CAN_USE_K5) {
        using VFq = VectorField<Bn254FqParams>;
        std::array<Fq, 5> x_buf;
        std::array<Fq, 5> two_y_buf;
        std::array<Fq, 5> scratch_buf;
        for (size_t g = 0; g < k5_groups; ++g) {
            const size_t i = g * 5;
            for (size_t k = 0; k < 5; ++k) {
                x_buf[k] = points[i + k].x;
                two_y_buf[k] = points[i + k].y + points[i + k].y;
            }
            VFq vec_x(x_buf);
            std::array<Fq, 5> x_sq = (vec_x * vec_x).to_array();
            for (size_t k = 0; k < 5; ++k) {
                scratch_buf[k] = x_sq[k] + x_sq[k] + x_sq[k];
            }
            VFq vec_acc(acc_lanes);
            std::array<Fq, 5> scratch_out = (VFq(scratch_buf) * vec_acc).to_array();
            for (size_t k = 0; k < 5; ++k) {
                scratch_space[i + k] = scratch_out[k];
            }
            acc_lanes = (vec_acc * VFq(two_y_buf)).to_array();
        }
    }

    // ---------------------------------------------------------------------
    // Combine 5 lane accumulators into one and run the K=1 forward tail.
    // When k5_points == 0 this collapses cleanly to the original K=1 forward
    // pass (acc_lanes is all-ones, so the product is one).
    // ---------------------------------------------------------------------
    Fq batch_inversion_accumulator = acc_lanes[0] * acc_lanes[1] * acc_lanes[2] * acc_lanes[3] * acc_lanes[4];
    for (size_t i = k5_points; i < num_points; ++i) {
        scratch_space[i] = points[i].x.sqr();
        if constexpr (T::has_a) {
            scratch_space[i] += T::a; // adjust slope in numerator
        }
        scratch_space[i] = scratch_space[i] + scratch_space[i] + scratch_space[i];
        scratch_space[i] *= batch_inversion_accumulator;
        batch_inversion_accumulator *= (points[i].y + points[i].y);
    }

    if (batch_inversion_accumulator == Fq::zero()) {
        throw_or_abort("attempted to invert zero in batch_affine_double_impl");
    }
    batch_inversion_accumulator = batch_inversion_accumulator.invert();

    // ---------------------------------------------------------------------
    // K=1 backward tail. Walks down from num_points to k5_points, unwinding
    // the tail's contribution to batch_inversion_accumulator. After this
    // loop completes, batch_inversion_accumulator = 1 / (prod of acc_lanes).
    // ---------------------------------------------------------------------
    Fq temp_x;
    for (size_t i_plus_1 = num_points; i_plus_1 > k5_points; --i_plus_1) {
        size_t i = i_plus_1 - 1;

        scratch_space[i] *= batch_inversion_accumulator;
        batch_inversion_accumulator *= (points[i].y + points[i].y);

        temp_x = points[i].x;
        points[i].x = scratch_space[i].sqr() - (points[i].x + points[i].x);
        points[i].y = scratch_space[i] * (temp_x - points[i].x) - points[i].y;
    }

    // ---------------------------------------------------------------------
    // K=5 backward pass. Split batch_inversion_accumulator into 5 per-lane
    // inverses via the standard batch-inversion product tree, then walk
    // groups in reverse order with 5-wide muls. Each group does 4 muls (vs
    // the (3 muls + 1 sqr)/point × 5 points = 20 scalar mul-class ops of K=1).
    // ---------------------------------------------------------------------
    if constexpr (CAN_USE_K5) {
        if (k5_groups == 0) {
            return;
        }
        using VFq = VectorField<Bn254FqParams>;

        // 4 prefix muls + 8 unwind muls = 12 muls + 1 inversion (already done) to recover 5 lane inverses.
        std::array<Fq, 4> prefix;
        prefix[0] = acc_lanes[0];
        prefix[1] = prefix[0] * acc_lanes[1];
        prefix[2] = prefix[1] * acc_lanes[2];
        prefix[3] = prefix[2] * acc_lanes[3];
        std::array<Fq, 5> inv_lanes;
        Fq running_inv = batch_inversion_accumulator;
        inv_lanes[4] = running_inv * prefix[3];
        running_inv *= acc_lanes[4];
        inv_lanes[3] = running_inv * prefix[2];
        running_inv *= acc_lanes[3];
        inv_lanes[2] = running_inv * prefix[1];
        running_inv *= acc_lanes[2];
        inv_lanes[1] = running_inv * prefix[0];
        running_inv *= acc_lanes[1];
        inv_lanes[0] = running_inv;

        for (size_t g_rev = k5_groups; g_rev > 0; --g_rev) {
            const size_t g = g_rev - 1;
            const size_t i = g * 5;

            // No aliasing concerns (each lane k has its own points[i + k]); single gather is fine.
            std::array<Fq, 5> scratch_buf;
            std::array<Fq, 5> x_buf;
            std::array<Fq, 5> y_buf;
            std::array<Fq, 5> two_y_buf;
            for (size_t k = 0; k < 5; ++k) {
                scratch_buf[k] = scratch_space[i + k];
                x_buf[k] = points[i + k].x;
                y_buf[k] = points[i + k].y;
                two_y_buf[k] = y_buf[k] + y_buf[k];
            }

            // lambda = scratch * inv_lanes  (5-wide mul)
            std::array<Fq, 5> lambda_buf = (VFq(scratch_buf) * VFq(inv_lanes)).to_array();

            // inv_lanes *= 2y_buf — unwinds inv for the previous group's lane k  (5-wide mul)
            inv_lanes = (VFq(inv_lanes) * VFq(two_y_buf)).to_array();

            // lambda_sq = lambda * lambda  (5-wide sqr)
            VFq vec_lambda(lambda_buf);
            std::array<Fq, 5> lambda_sq = (vec_lambda * vec_lambda).to_array();

            // new_x = lambda^2 - 2x; temp = x - new_x (scalar prep)
            std::array<Fq, 5> new_x_buf;
            std::array<Fq, 5> x_minus_new_x_buf;
            for (size_t k = 0; k < 5; ++k) {
                new_x_buf[k] = lambda_sq[k] - (x_buf[k] + x_buf[k]);
                x_minus_new_x_buf[k] = x_buf[k] - new_x_buf[k];
            }

            // ly = lambda * (x - new_x)  (5-wide mul)
            std::array<Fq, 5> ly = (vec_lambda * VFq(x_minus_new_x_buf)).to_array();

            for (size_t k = 0; k < 5; ++k) {
                points[i + k].x = new_x_buf[k];
                points[i + k].y = ly[k] - y_buf[k];
            }
        }
    }
}

/**
 * @brief Pairwise affine add points in first and second group
 *
 * @param first_group Left-hand points
 * @param second_group Right-hand points
 * @param results Output array for results[i] = first_group[i] + second_group[i]
 *
 * @warning This function does NOT handle edge cases (point at infinity, point doubling, etc.).
 *          For generic point addition with edge case handling, use Jacobian coordinates instead.
 *          Only use this when you know points are in generic position (e.g., in Pippenger/MSM).
 */
template <class Fq, class Fr, class T>
void element<Fq, Fr, T>::batch_affine_add(const std::span<affine_element<Fq, Fr, T>>& first_group,
                                          const std::span<affine_element<Fq, Fr, T>>& second_group,
                                          const std::span<affine_element<Fq, Fr, T>>& results) noexcept
{
    using affine_element = affine_element<Fq, Fr, T>;
    const size_t num_points = first_group.size();
    BB_ASSERT_EQ(second_group.size(), first_group.size());

    // Space for temporary values
    std::vector<Fq> scratch_space(num_points);

    parallel_for_heuristic(
        num_points, [&](size_t i) { results[i] = first_group[i]; }, thread_heuristics::FF_COPY_COST * 2);

    // Perform batch affine addition: (lhs[i], rhs[i]) -> rhs[i]
    parallel_for_heuristic(
        num_points,
        [&](size_t start, size_t end, BB_UNUSED size_t chunk_index) {
            batch_affine_add_impl<affine_element, Fq>(
                &second_group[start], &results[start], end - start, &scratch_space[start]);
        },
        thread_heuristics::FF_ADDITION_COST * 6 + thread_heuristics::FF_MULTIPLICATION_COST * 6);
}

/**
 * @brief Multiply each point by the same scalar
 *
 * @details We use the fact that all points are being multiplied by the same scalar to batch the operations (perform
 * batch affine additions and doublings with batch inversion trick)
 *
 * @param points The span of individual points that need to be scaled
 * @param scalar The scalar we multiply all the points by
 * @return std::vector<affine_element<Fq, Fr, T>> Vector of new points where each point is exponent⋅points[i]
 */
template <class Fq, class Fr, class T>
std::vector<affine_element<Fq, Fr, T>> element<Fq, Fr, T>::batch_mul_with_endomorphism(
    const std::span<const affine_element<Fq, Fr, T>>& points, const Fr& scalar) noexcept
{
    BB_BENCH();
    using affine_element = affine_element<Fq, Fr, T>;
    const size_t num_points = points.size();

    // Space for temporary values
    std::vector<Fq> scratch_space(num_points);

    // We compute the resulting point through WNAF by evaluating (the (\sum_i (16ⁱ⋅
    // (a_i ∈ {-15,-13,-11,-9,-7,-5,-3,-1,1,3,5,7,9,11,13,15}))) - skew), where skew is 0 or 1. The result of the sum is
    // always odd and skew is used to reconstruct an even scalar. This means that to construct scalar p-1, where p is
    // the order of the scalar field, we first compute p through the sums and then subtract -1. Howver, since we are
    // computing p⋅Point, we get a point at infinity, which is an edgecase, and we don't want to handle edgecases in the
    // hot loop since the slow the computation down. So it's better to just handle it here.
    if (scalar == -Fr::one()) {
        std::vector<affine_element> results(num_points);
        parallel_for_heuristic(num_points, [&](size_t i) { results[i] = -points[i]; }, thread_heuristics::FF_COPY_COST);
        return results;
    }
    // Compute wnaf for scalar
    const Fr converted_scalar = scalar.from_montgomery_form();

    // If the scalar is zero, just set results to the point at infinity
    if (converted_scalar.is_zero()) {
        affine_element result{ Fq::zero(), Fq::zero() };
        result.self_set_infinity();
        std::vector<affine_element> results(num_points);
        parallel_for_heuristic(num_points, [&](size_t i) { results[i] = result; }, thread_heuristics::FF_COPY_COST);
        return results;
    }

    constexpr size_t LOOKUP_SIZE = 8;
    constexpr size_t NUM_ROUNDS = 32;

    detail::EndoScalars endo_scalars = Fr::split_into_endomorphism_scalars(converted_scalar);
    detail::EndomorphismWnaf<element, NUM_ROUNDS> wnaf{ endo_scalars };

    std::vector<affine_element> work_elements(num_points);
    std::array<std::vector<affine_element>, LOOKUP_SIZE> lookup_table;
    for (auto& table : lookup_table) {
        table.resize(num_points);
    }
    std::vector<affine_element> temp_point_vector(num_points);

    auto execute_range = [&](size_t start, size_t end) {
        BB_BENCH_TRACY_NAME("batch_mul_with_endo/execute_range");
        // Perform batch affine addition in parallel
        const auto add_chunked = [&](const affine_element* lhs, affine_element* rhs) {
            batch_affine_add_impl<affine_element, Fq>(&lhs[start], &rhs[start], end - start, &scratch_space[start]);
        };

        // Perform point doubling in parallel
        const auto double_chunked = [&](affine_element* lhs) {
            batch_affine_double_impl<affine_element, Fq, T>(&lhs[start], end - start, &scratch_space[start]);
        };

        // Initialize first entries in lookup table
        for (size_t i = start; i < end; ++i) {
            if (points[i].is_point_at_infinity()) {
                temp_point_vector[i] = affine_element::one();
                lookup_table[0][i] = affine_element::one();
            } else {
                temp_point_vector[i] = points[i];
                lookup_table[0][i] = points[i];
            }
        }
        // Costruct lookup table
        double_chunked(&temp_point_vector[0]);
        for (size_t j = 1; j < LOOKUP_SIZE; ++j) {
            for (size_t i = start; i < end; ++i) {
                lookup_table[j][i] = lookup_table[j - 1][i];
            }
            add_chunked(&temp_point_vector[0], &lookup_table[j][0]);
        }

        constexpr Fq beta = Fq::cube_root_of_unity();
        uint64_t wnaf_entry = 0;
        uint64_t index = 0;
        bool sign = 0;
        // Prepare elements for the first batch addition
        for (size_t j = 0; j < 2; ++j) {
            wnaf_entry = wnaf.table[j];
            index = wnaf_entry & 0x0fffffffU;
            sign = static_cast<bool>((wnaf_entry >> 31) & 1);
            const bool is_odd = ((j & 1) == 1);
            for (size_t i = start; i < end; ++i) {
                auto to_add = lookup_table[static_cast<size_t>(index)][i];
                to_add.y.self_conditional_negate(sign ^ is_odd);
                if (is_odd) {
                    to_add.x *= beta;
                }
                if (j == 0) {
                    work_elements[i] = to_add;
                } else {
                    temp_point_vector[i] = to_add;
                }
            }
        }
        add_chunked(&temp_point_vector[0], &work_elements[0]);
        // Run through SM logic in wnaf form (excluding the skew)
        for (size_t j = 2; j < NUM_ROUNDS * 2; ++j) {
            wnaf_entry = wnaf.table[j];
            index = wnaf_entry & 0x0fffffffU;
            sign = static_cast<bool>((wnaf_entry >> 31) & 1);
            const bool is_odd = ((j & 1) == 1);
            if (!is_odd) {
                for (size_t k = 0; k < 4; ++k) {
                    double_chunked(&work_elements[0]);
                }
            }
            for (size_t i = start; i < end; ++i) {
                auto to_add = lookup_table[static_cast<size_t>(index)][i];
                to_add.y.self_conditional_negate(sign ^ is_odd);
                if (is_odd) {
                    to_add.x *= beta;
                }
                temp_point_vector[i] = to_add;
            }
            add_chunked(&temp_point_vector[0], &work_elements[0]);
        }
        // Apply skew for the first endo scalar
        // Use affine_element::operator+ (via Jacobian) to handle edge cases related to the point at infinity.
        if (wnaf.skew) {
            for (size_t i = start; i < end; ++i) {
                work_elements[i] = work_elements[i] + (-lookup_table[0][i]);
            }
        }
        // Apply skew for the second endo scalar
        if (wnaf.endo_skew) {
            for (size_t i = start; i < end; ++i) {
                affine_element endo_point = lookup_table[0][i];
                endo_point.x *= beta;
                work_elements[i] = work_elements[i] + endo_point;
            }
        }
        // Handle points at infinity explicitly
        for (size_t i = start; i < end; ++i) {
            work_elements[i] = points[i].is_point_at_infinity() ? work_elements[i].set_infinity() : work_elements[i];
        }
    };
    parallel_for_range(num_points, execute_range);

    return work_elements;
}

/**
 * @brief Convert N Jacobian points to affine form via Montgomery's batch-inversion trick.
 *
 * @details Forward pass: compute the prefix product of z-coordinates, storing the per-point
 * prefix in `temporaries`. Invert the full product once. Backward pass: walk down recovering
 * z_inv[i] = accumulator * temporaries[i], then update accumulator *= z[i]. Each non-infinity
 * point pays 1 mul forward + (4 muls + 1 sqr) backward.
 *
 * Under WASM SIMD with the BN254 base field and no point at infinity present, runs a 5-wide
 * q1s1 forward+backward pass (5 lane accumulators interleaving 5 independent batch-inversion
 * chains via VectorField<Bn254FqParams>), plus a scalar K=1 tail for points not covered by a
 * full 5-point group. Each group of 5 points collapses 30 scalar mul-class ops in backward to
 * 6 width-5 vec muls (+12 amortized split-tree muls). If any point in `elements` is at
 * infinity, falls through entirely to the K=1 path — masking lane k for an infinity slot in
 * the middle of a chain would require per-lane filtering that is not worth the complexity at
 * the hot caller (`scalar_multiplication.cpp` per-thread MSM output finalization, where
 * infinity outputs are vanishingly rare).
 */
template <typename Fq, typename Fr, typename T>
void element<Fq, Fr, T>::batch_normalize(element* elements, const size_t num_elements) noexcept
{
#if defined(__wasm_simd128__)
    constexpr bool CAN_USE_K5_TYPE = std::is_same_v<Fq, bb::fq>;
#else
    constexpr bool CAN_USE_K5_TYPE = false;
#endif
    constexpr size_t K5_MIN_POINTS = 20;

    // K=5 eligibility: WASM SIMD + BN254 Fq + size threshold + no infinity slot. The prescan
    // is O(num_elements) with one branch per element; the savings over a full backward pass
    // dwarf it on the typical large-N hot path.
    bool any_infinity = false;
    if constexpr (CAN_USE_K5_TYPE) {
        if (num_elements >= K5_MIN_POINTS) {
            for (size_t i = 0; i < num_elements; ++i) {
                if (elements[i].is_point_at_infinity()) {
                    any_infinity = true;
                    break;
                }
            }
        }
    }
    const size_t k5_groups =
        (CAN_USE_K5_TYPE && num_elements >= K5_MIN_POINTS && !any_infinity) ? (num_elements / 5) : size_t{ 0 };
    const size_t k5_points = k5_groups * 5;

    std::vector<Fq> temporaries;
    temporaries.reserve(num_elements);
    Fq accumulator = Fq::one();

    std::array<Fq, 5> acc_lanes = { Fq::one(), Fq::one(), Fq::one(), Fq::one(), Fq::one() };

    // ---------------------------------------------------------------------
    // K=5 forward pass. Per group of 5 points i = g*5 + k (k in [0,5)), lane k owns the
    // batch-inversion chain that visits elements[g*5+k] across groups g = 0..k5_groups-1.
    //
    // Before updating, snapshot acc_lanes[k] into temporaries[g*5+k] — that is the prefix
    // product seen by lane k's chain up to (but excluding) elements[g*5+k]. The backward
    // pass uses this to recover 1/z[g*5+k] = inv_lane[k] * temporaries[g*5+k].
    //
    // Then advance all five lanes via one width-5 mul: acc_lanes *= z's of this group.
    // ---------------------------------------------------------------------
    if constexpr (CAN_USE_K5_TYPE) {
        using VFq = VectorField<Bn254FqParams>;
        for (size_t g = 0; g < k5_groups; ++g) {
            const size_t i = g * 5;
            for (size_t k = 0; k < 5; ++k) {
                temporaries.emplace_back(acc_lanes[k]);
            }
            std::array<Fq, 5> z_buf;
            for (size_t k = 0; k < 5; ++k) {
                z_buf[k] = elements[i + k].z;
            }
            acc_lanes = (VFq(acc_lanes) * VFq(z_buf)).to_array();
        }
    }

    // ---------------------------------------------------------------------
    // Combine 5 lane accumulators into one global accumulator and run the K=1 forward tail.
    // When k5_points == 0 (no K=5 eligibility) this is the full original forward pass —
    // acc_lanes is all-ones, so the product is one and `accumulator` starts at Fq::one().
    // ---------------------------------------------------------------------
    accumulator = acc_lanes[0] * acc_lanes[1] * acc_lanes[2] * acc_lanes[3] * acc_lanes[4];
    for (size_t i = k5_points; i < num_elements; ++i) {
        temporaries.emplace_back(accumulator);
        if (!elements[i].is_point_at_infinity()) {
            accumulator *= elements[i].z;
        }
    }
    accumulator = accumulator.invert();

    /**
     * We now proceed to iterate back down the array of points.
     * At each iteration we update the accumulator to contain the z-coordinate of the currently worked-upon
     *z-coordinate. We can then multiply this accumulator with `temporaries`, to get a scalar that is equal to the
     *inverse of the z-coordinate of the point at the next iteration cycle e.g. Imagine we have 4 points, such that:
     *
     * accumulator = 1 / z.data[0]*z.data[1]*z.data[2]*z.data[3]
     * temporaries[3] = z.data[0]*z.data[1]*z.data[2]
     * temporaries[2] = z.data[0]*z.data[1]
     * temporaries[1] = z.data[0]
     * temporaries[0] = 1
     *
     * At the first iteration, accumulator * temporaries[3] = z.data[0]*z.data[1]*z.data[2] /
     *z.data[0]*z.data[1]*z.data[2]*z.data[3]  = (1 / z.data[3]) We then update accumulator, such that:
     *
     * accumulator = accumulator * z.data[3] = 1 / z.data[0]*z.data[1]*z.data[2]
     *
     * At the second iteration, accumulator * temporaries[2] = z.data[0]*z.data[1] / z.data[0]*z.data[1]*z.data[2] =
     *(1 z.data[2]) And so on, until we have computed every z-inverse!
     *
     * We can then convert out of Jacobian form (x = X / Z^2, y = Y / Z^3) with 4 muls and 1 square.
     **/

    // ---------------------------------------------------------------------
    // K=1 backward tail. Walks down from num_elements to k5_points, unwinding the tail's
    // contribution to `accumulator`. After this loop completes,
    // accumulator = 1 / (product of acc_lanes) = 1 / (product of z's in the K=5 region).
    // When k5_points == 0 this is the full original backward pass.
    // ---------------------------------------------------------------------
    for (size_t i = num_elements; i > k5_points;) {
        --i;
        if (!elements[i].is_point_at_infinity()) {
            Fq z_inv = accumulator * temporaries[i];
            Fq zz_inv = z_inv.sqr();
            elements[i].x *= zz_inv;
            elements[i].y *= (zz_inv * z_inv);
            accumulator *= elements[i].z;
        }
        elements[i].z = Fq::one();
    }

    // ---------------------------------------------------------------------
    // K=5 backward pass. Split `accumulator` into 5 per-lane inverses via the standard
    // batch-inversion product tree, then walk groups in reverse with 5-wide muls. Each group
    // does 6 muls (vs (4 muls + 1 sqr)/point × 5 points = 25 scalar mul-class ops of K=1).
    // ---------------------------------------------------------------------
    if constexpr (CAN_USE_K5_TYPE) {
        if (k5_groups == 0) {
            return;
        }
        using VFq = VectorField<Bn254FqParams>;

        // 4 prefix muls + 8 unwind muls = 12 muls + 1 inversion (already done) to recover 5 lane inverses.
        std::array<Fq, 4> prefix;
        prefix[0] = acc_lanes[0];
        prefix[1] = prefix[0] * acc_lanes[1];
        prefix[2] = prefix[1] * acc_lanes[2];
        prefix[3] = prefix[2] * acc_lanes[3];
        std::array<Fq, 5> inv_lanes;
        Fq running_inv = accumulator;
        inv_lanes[4] = running_inv * prefix[3];
        running_inv *= acc_lanes[4];
        inv_lanes[3] = running_inv * prefix[2];
        running_inv *= acc_lanes[3];
        inv_lanes[2] = running_inv * prefix[1];
        running_inv *= acc_lanes[2];
        inv_lanes[1] = running_inv * prefix[0];
        running_inv *= acc_lanes[1];
        inv_lanes[0] = running_inv;

        for (size_t g_rev = k5_groups; g_rev > 0; --g_rev) {
            const size_t g = g_rev - 1;
            const size_t i = g * 5;

            // No aliasing: lane k touches only elements[i + k]. Single gather is fine.
            std::array<Fq, 5> z_buf;
            std::array<Fq, 5> tmp_buf;
            std::array<Fq, 5> x_buf;
            std::array<Fq, 5> y_buf;
            for (size_t k = 0; k < 5; ++k) {
                z_buf[k] = elements[i + k].z;
                tmp_buf[k] = temporaries[i + k];
                x_buf[k] = elements[i + k].x;
                y_buf[k] = elements[i + k].y;
            }

            // z_inv = inv_lanes * tmp_buf  (5-wide mul)
            VFq vec_z_inv = VFq(inv_lanes) * VFq(tmp_buf);

            // inv_lanes *= z_buf — unwinds inv for the previous group's lane k  (5-wide mul)
            inv_lanes = (VFq(inv_lanes) * VFq(z_buf)).to_array();

            // zz_inv = z_inv * z_inv  (5-wide sqr)
            VFq vec_zz_inv = vec_z_inv * vec_z_inv;

            // zzz_inv = zz_inv * z_inv  (5-wide mul)
            std::array<Fq, 5> zzz_inv_buf = (vec_zz_inv * vec_z_inv).to_array();

            // x *= zz_inv  (5-wide mul)
            std::array<Fq, 5> new_x = (VFq(x_buf) * vec_zz_inv).to_array();

            // y *= zzz_inv  (5-wide mul)
            std::array<Fq, 5> new_y = (VFq(y_buf) * VFq(zzz_inv_buf)).to_array();

            for (size_t k = 0; k < 5; ++k) {
                elements[i + k].x = new_x[k];
                elements[i + k].y = new_y[k];
                elements[i + k].z = Fq::one();
            }
        }
    }
}

template <typename Fq, typename Fr, typename T>
template <typename>
element<Fq, Fr, T> element<Fq, Fr, T>::random_coordinates_on_curve(numeric::RNG* engine) noexcept
{
    bool found_one = false;
    Fq yy;
    Fq x;
    Fq y;
    while (!found_one) {
        x = Fq::random_element(engine);
        yy = x.sqr() * x + T::b;
        if constexpr (T::has_a) {
            yy += (x * T::a);
        }
        auto [found_root, y1] = yy.sqrt();
        y = y1;
        found_one = found_root;
    }
    return { x, y, Fq::one() };
}

} // namespace bb::group_elements
// NOLINTEND(readability-implicit-bool-conversion, cppcoreguidelines-avoid-c-arrays)
