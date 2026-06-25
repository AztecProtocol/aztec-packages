// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/groups/booth_recode.hpp"
#include "barretenberg/ecc/groups/element.hpp"
#include "element.hpp"
#include <cstdint>

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
// Represents the result of `split_into_endomorphism_scalars` — a pair of 128-bit halves
// (k1, k2) such that `k = k1 - k2·λ (mod r)`, where λ = endomorphism scalar.
using EndoScalars = std::pair<std::array<uint64_t, 2>, std::array<uint64_t, 2>>;

// GLV endomorphism multiplication recodes each 128-bit split scalar with signed Booth windows.
// K1 uses a standard 4-bit grid; batch_mul gives K2 a separate offset grid below.
using bb::ecc::booth::booth_packed_digit;
using bb::ecc::booth::make_booth_slice_params;
using bb::ecc::booth::make_offset_booth_slice_params;

// Booth window size for the GLV endomorphism path: c=4 over each 128-bit endomorphism
// half gives ceil(128/4) = 32 windows per half.
inline constexpr size_t BOOTH_ENDO_WINDOW_BITS = 4;
static_assert(BOOTH_ENDO_WINDOW_BITS + 1 <= 32);
inline constexpr size_t BOOTH_ENDO_NUM_WINDOWS = 32;
// Lookup table holds [1·P, 2·P, ..., 8·P] (= 2^(c-1) entries). Magnitude m ∈ [1, 8]
// indexes the table at m-1; magnitude 0 skips the window.
inline constexpr size_t BOOTH_ENDO_LOOKUP_SIZE = 1U << (BOOTH_ENDO_WINDOW_BITS - 1);
// 128 bits / 64 = 2 uint64 limbs per endomorphism half.
inline constexpr size_t BOOTH_ENDO_NUM_LIMBS_U64 = 2;

// K2's offset window decomposition: a 2-bit bottom window at bit 0, then 32 × 4-bit
// windows starting at bit 2. Pairing with K1's standard 4-bit grid at bit 0 yields
// a union of bit positions {0, 2, 4, ..., 124, 126}, so every transition between
// adjacent positions is exactly 2 doublings — every (2·dbl + add) pair fuses with
// batch_affine_combined_double_add_impl, saving 1 doubling per 4-bit chunk vs. the
// symmetric layout. With K2 < 2^127 (proven via the lattice analysis on BN254/Grumpkin
// — see Fr/Fq.hpp endomorphism comments), the top 4-bit window covers only bit 126,
// so its magnitude is in {0, 1, 2} and is empty ~50% of the time.
inline constexpr size_t BOOTH_ENDO_K2_LOW_WINDOW_BITS = 2;
static_assert(BOOTH_ENDO_K2_LOW_WINDOW_BITS + 1 <= 32);
inline constexpr size_t BOOTH_ENDO_K2_NUM_WINDOWS = BOOTH_ENDO_NUM_WINDOWS + 1; // 33

// batch_two_round_fold evaluates the four scalar-multiplication terms below on one shared doubling
// chain, interleaving their Booth digit windows on offset grids (term j on grid offset j) so each
// position 1..127 carries exactly one window (position 0 shares all four bottom windows) and each
// step is a single fused double-and-add.
// See ipa/ELEMENT_IMPL_FOLD.md for the derivation and cost model.
//
// Term → (scalar, base, grid offset):
//   0: K1 of u1·u2 on P0 (offset 0), 1: u1 on P1 (offset 1),
//   2: K2 of u1·u2 on φ(P0) (offset 2), 3: u2 on P2 (offset 3).
//
// The interleaved scan is compiled into a schedule of these ops, one per accumulator step, replayed
// over every point in the batch (see ELEMENT_IMPL_FOLD.md, "Phase 1 — schedule generation"):
//   DBL      — Horner doubling for a position whose window is zero: accum ← 2·accum.
//   SEED     — load a base into a still-empty accumulator: accum ← ±digit·base[term].
//   COMBINED — fused double-and-add owning this position's doubling: accum ← 2·accum + ±digit·base[term].
//   ADD      — plain add with no doubling (the extra position-0 windows): accum ← accum + ±digit·base[term].
enum class FoldOpKind : uint8_t { DBL, SEED, COMBINED, ADD };
struct FoldOp {
    FoldOpKind kind;
    uint8_t term;
    uint32_t digit;
    bool safe;
};

} // namespace detail

template <class Fq, class Fr, class T>
element<Fq, Fr, T> element<Fq, Fr, T>::mul_with_endomorphism(const Fr& scalar) const noexcept
{
    if (is_point_at_infinity()) {
        return element::infinity();
    }
    const Fr converted_scalar = scalar.from_montgomery_form();
    if (converted_scalar.is_zero()) {
        return element::infinity();
    }

    // Booth lookup: [1·P, 2·P, ..., 8·P]. Magnitude m ∈ [1, 2^(c-1)] indexes at m-1;
    // magnitude 0 (no contribution) just skips the add.
    constexpr size_t LOOKUP_SIZE = detail::BOOTH_ENDO_LOOKUP_SIZE;
    std::array<element, LOOKUP_SIZE> lookup_table;
    lookup_table[0] = element(*this);
    for (size_t i = 1; i < LOOKUP_SIZE; ++i) {
        lookup_table[i] = lookup_table[i - 1] + *this;
    }

    const detail::EndoScalars endo_scalars = Fr::split_into_endomorphism_scalars(converted_scalar);
    constexpr auto slice_params = detail::make_booth_slice_params<detail::BOOTH_ENDO_NUM_WINDOWS,
                                                                  detail::BOOTH_ENDO_WINDOW_BITS,
                                                                  detail::BOOTH_ENDO_NUM_LIMBS_U64>();
    const uint64_t* k1 = endo_scalars.first.data();
    const uint64_t* k2 = endo_scalars.second.data();

    element accumulator{ T::one_x, T::one_y, Fq::one() };
    accumulator.self_set_infinity();
    const Fq beta = Fq::cube_root_of_unity();

    // Process windows high-to-low; within each window add k1's digit, then k2's
    // (with x·=β and the GLV `k = k1 - k2·λ` sign flip on y), then double 4× to
    // shift the next window's contribution into place. No skew correction needed —
    // the signed-Booth digits already span the full c-bit range so an even scalar
    // doesn't require a post-pass.
    for (size_t w = detail::BOOTH_ENDO_NUM_WINDOWS; w-- > 0;) {
        for (size_t h = 0; h < 2; ++h) {
            const uint64_t* s = (h == 0) ? k1 : k2;
            const uint32_t digit = detail::booth_packed_digit(s, slice_params[w], detail::BOOTH_ENDO_WINDOW_BITS);
            const uint32_t magnitude = digit & 0x7FFFFFFFU;
            if (magnitude == 0) {
                continue;
            }
            const bool sign = (digit >> 31) != 0;
            element to_add = lookup_table[magnitude - 1];
            to_add.y.self_conditional_negate(sign ^ (h == 1));
            if (h == 1) {
                to_add.x *= beta;
            }
            accumulator += to_add;
        }
        if (w != 0) {
            for (size_t d = 0; d < detail::BOOTH_ENDO_WINDOW_BITS; ++d) {
                accumulator.self_dbl();
            }
        }
    }
    return accumulator;
}

template <class Fq, class Fr, class T>
element<Fq, Fr, T> element<Fq, Fr, T>::straus_msm(std::span<const affine_element<Fq, Fr, T>> points,
                                                  std::span<const Fr> scalars) noexcept
{
    BB_BENCH_NAME("Element::straus_msm");
    const size_t n = std::min(points.size(), scalars.size());
    if (n == 0) {
        return element::infinity();
    }

    if constexpr (T::USE_ENDOMORPHISM) {
        // Endomorphism-Booth path: build a small lookup table per active point and walk
        // the split-scalar windows high-to-low. The signed-Booth digits span the full
        // c-bit range, so no post-pass skew correction is needed.
        constexpr size_t LOOKUP_SIZE = detail::BOOTH_ENDO_LOOKUP_SIZE;
        constexpr size_t NUM_WINDOWS = detail::BOOTH_ENDO_NUM_WINDOWS;
        constexpr size_t WINDOW_BITS = detail::BOOTH_ENDO_WINDOW_BITS;
        constexpr auto slice_params = detail::make_booth_slice_params<detail::BOOTH_ENDO_NUM_WINDOWS,
                                                                      detail::BOOTH_ENDO_WINDOW_BITS,
                                                                      detail::BOOTH_ENDO_NUM_LIMBS_U64>();

        struct ActiveScalar {
            std::array<element, LOOKUP_SIZE> lookup;
            std::array<uint64_t, detail::BOOTH_ENDO_NUM_LIMBS_U64> k1{};
            std::array<uint64_t, detail::BOOTH_ENDO_NUM_LIMBS_U64> k2{};
        };

        std::vector<ActiveScalar> active;
        active.reserve(n);
        for (size_t i = 0; i < n; ++i) {
            if (points[i].is_point_at_infinity()) {
                continue;
            }
            const Fr converted = scalars[i].from_montgomery_form();
            if (converted.is_zero()) {
                continue;
            }
            ActiveScalar e;
            const element pt(points[i]);
            e.lookup[0] = pt;
            for (size_t k = 1; k < LOOKUP_SIZE; ++k) {
                e.lookup[k] = e.lookup[k - 1] + pt;
            }
            const detail::EndoScalars endo = Fr::split_into_endomorphism_scalars(converted);
            e.k1 = endo.first;
            e.k2 = endo.second;
            active.push_back(std::move(e));
        }
        if (active.empty()) {
            return element::infinity();
        }

        element accumulator{ T::one_x, T::one_y, Fq::one() };
        accumulator.self_set_infinity();
        const Fq beta = Fq::cube_root_of_unity();

        for (size_t w = NUM_WINDOWS; w-- > 0;) {
            for (size_t h = 0; h < 2; ++h) {
                for (auto& a : active) {
                    const uint64_t* s = (h == 0) ? a.k1.data() : a.k2.data();
                    const uint32_t digit = detail::booth_packed_digit(s, slice_params[w], WINDOW_BITS);
                    const uint32_t magnitude = digit & 0x7FFFFFFFU;
                    if (magnitude == 0) {
                        continue;
                    }
                    const bool sign = (digit >> 31) != 0;
                    element to_add = a.lookup[magnitude - 1];
                    to_add.y.self_conditional_negate(sign ^ (h == 1));
                    if (h == 1) {
                        to_add.x *= beta;
                    }
                    accumulator += to_add;
                }
            }
            if (w != 0) {
                for (size_t d = 0; d < WINDOW_BITS; ++d) {
                    accumulator.self_dbl();
                }
            }
        }
        return accumulator;
    } else {
        // No endomorphism: bit-by-bit simultaneous double-and-add over the active subset.
        std::vector<affine_element<Fq, Fr, T>> active_points;
        std::vector<uint256_t> active_scalars;
        active_points.reserve(n);
        active_scalars.reserve(n);
        uint64_t max_set_bit = 0;
        for (size_t i = 0; i < n; ++i) {
            if (points[i].is_point_at_infinity()) {
                continue;
            }
            uint256_t s(scalars[i]);
            if (s == 0) {
                continue;
            }
            max_set_bit = std::max(max_set_bit, s.get_msb());
            active_points.push_back(points[i]);
            active_scalars.push_back(s);
        }
        if (active_points.empty()) {
            return element::infinity();
        }

        element accumulator = element::infinity();
        for (uint64_t bit = max_set_bit + 1; bit-- > 0;) {
            accumulator.self_dbl();
            for (size_t i = 0; i < active_points.size(); ++i) {
                if (active_scalars[i].get_bit(bit)) {
                    accumulator += active_points[i];
                }
            }
        }
        return accumulator;
    }
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
 * @details Specialized for Pippenger's interleaved memory layout, where lhs and rhs live in
 *          the same contiguous array and results are written into the upper half.
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
    Fq batch_inversion_accumulator = Fq::one();

    // Forward pass: accumulate (x2 - x1) products for batch inversion
    for (size_t i = 0; i < num_points; i += 2) {
        scratch_space[i >> 1] = points[i].x + points[i + 1].x; // x1 + x2 (saved for later)
        points[i + 1].x -= points[i].x;                        // x2 - x1
        points[i + 1].y -= points[i].y;                        // y2 - y1
        points[i + 1].y *= batch_inversion_accumulator;
        batch_inversion_accumulator *= points[i + 1].x;
    }

    if (batch_inversion_accumulator == Fq::zero()) {
        throw_or_abort("attempted to invert zero in batch_affine_add_interleaved");
    }
    batch_inversion_accumulator = batch_inversion_accumulator.invert();

    // Backward pass: complete inversions and compute additions
    for (size_t i = num_points - 2; i < num_points; i -= 2) {
        // lambda = (y2 - y1) / (x2 - x1)
        points[i + 1].y *= batch_inversion_accumulator;
        batch_inversion_accumulator *= points[i + 1].x;
        points[i + 1].x = points[i + 1].y.sqr();
        // x3 = lambda^2 - (x1 + x2)
        points[(i + num_points) >> 1].x = points[i + 1].x - scratch_space[i >> 1];

        if (i >= 2) {
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
 */
template <typename AffineElement, typename Fq, typename T>
__attribute__((always_inline)) inline void batch_affine_double_impl(AffineElement* points,
                                                                    const size_t num_points,
                                                                    Fq* scratch_space) noexcept
{
    Fq batch_inversion_accumulator = Fq::one();

    // Forward pass: prepare batch inversion
    for (size_t i = 0; i < num_points; ++i) {
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

    // Backward pass: compute doublings
    Fq temp_x;
    for (size_t i_plus_1 = num_points; i_plus_1 > 0; --i_plus_1) {
        size_t i = i_plus_1 - 1;

        scratch_space[i] *= batch_inversion_accumulator;
        batch_inversion_accumulator *= (points[i].y + points[i].y);

        temp_x = points[i].x;
        points[i].x = scratch_space[i].sqr() - (points[i].x + points[i].x);
        points[i].y = scratch_space[i] * (temp_x - points[i].x) - points[i].y;
    }
}

/**
 * @brief Fused 2·P + Q for a parallel array of (P, Q) pairs.
 *
 * @details Computes (P + Q) + P via the chord-only path: derive the slope for
 *          the second add directly from λ1 instead of materialising the
 *          intermediate y3. Concretely:
 *            λ1 = (y2 − y1) / (x2 − x1)
 *            x3 = λ1² − x1 − x2
 *            λ2 = −λ1 − 2·y1 / (x3 − x1)
 *            x4 = λ2² − x1 − x3
 *            y4 = λ2·(x1 − x4) − y1
 *
 *          Two Montgomery batch inversions are required (one per λ) — same as
 *          a separate `batch_affine_double_impl` + `batch_affine_add_impl`
 *          would do — but the per-pair field work shrinks by 1 mul (no y3)
 *          and 1 sqr (no doubling's 3·x² sqr) compared to dbl-then-add.
 *
 * @param to_add       Input (x2, y2) per pair. Read-only.
 * @param accumulator  Input (x1, y1) per pair; overwritten with (x4, y4).
 * @param num_pairs    Number of pairs.
 * @param scratch_a    Fq scratch ≥ num_pairs.
 * @param scratch_b    Fq scratch ≥ num_pairs.
 * @param scratch_c    Fq scratch ≥ num_pairs.
 *
 * @warning ASSUMES NO EDGE CASES (inherits batch_affine_add_impl's contract):
 *   - x2 ≠ x1 for all pairs (Q ≠ ±P).
 *   - x3 ≠ x1 for all pairs (P + Q ≠ ±P, i.e. 2·P + Q ≠ O).
 */
template <typename AffineElement, typename Fq>
__attribute__((always_inline)) inline void batch_affine_combined_double_add_impl(const AffineElement* to_add,
                                                                                 AffineElement* accumulator,
                                                                                 const size_t num_pairs,
                                                                                 Fq* scratch_a,
                                                                                 Fq* scratch_b,
                                                                                 Fq* scratch_c) noexcept
{
    // === Phase 1: batch-invert (x2 − x1), produce λ1 and (x3 − x1). ===
    Fq batch_inv_acc = Fq::one();
    for (size_t i = 0; i < num_pairs; ++i) {
        // (x1 + x2): retained for x3 = λ1² − (x1 + x2) in the backward pass.
        scratch_a[i] = accumulator[i].x + to_add[i].x;
        // (x2 − x1): feeds Montgomery's batch inversion product.
        scratch_b[i] = to_add[i].x - accumulator[i].x;
        // (y2 − y1) × Π_{j<i}(x2_j − x1_j): partial numerator for λ1.
        scratch_c[i] = to_add[i].y - accumulator[i].y;
        scratch_c[i] *= batch_inv_acc;
        batch_inv_acc *= scratch_b[i];
    }
    if (batch_inv_acc == Fq::zero()) {
        throw_or_abort("attempted to invert zero in batch_affine_combined_double_add_impl phase 1");
    }
    batch_inv_acc = batch_inv_acc.invert();
    for (size_t k = num_pairs; k-- > 0;) {
        // λ1 = (y2 − y1) / (x2 − x1).
        scratch_c[k] *= batch_inv_acc;
        batch_inv_acc *= scratch_b[k];
        // x3 = λ1² − (x1 + x2);  overwrite scratch_b with (x3 − x1) for phase 2.
        Fq x3 = scratch_c[k].sqr();
        x3 -= scratch_a[k];
        scratch_b[k] = x3 - accumulator[k].x;
        // scratch_c[k] now holds λ1, retained for phase 2.
    }

    // === Phase 2: batch-invert (x3 − x1), produce λ2, write x4 and y4. ===
    batch_inv_acc = Fq::one();
    for (size_t i = 0; i < num_pairs; ++i) {
        // 2·y1 × Π_{j<i}(x3_j − x1_j): partial numerator for 2·y1 / (x3 − x1).
        scratch_a[i] = accumulator[i].y + accumulator[i].y;
        scratch_a[i] *= batch_inv_acc;
        batch_inv_acc *= scratch_b[i];
    }
    if (batch_inv_acc == Fq::zero()) {
        throw_or_abort("attempted to invert zero in batch_affine_combined_double_add_impl phase 2");
    }
    batch_inv_acc = batch_inv_acc.invert();
    for (size_t k = num_pairs; k-- > 0;) {
        // 2·y1 / (x3 − x1).
        scratch_a[k] *= batch_inv_acc;
        batch_inv_acc *= scratch_b[k];
        // λ2 = −λ1 − 2·y1 / (x3 − x1).
        Fq lambda2 = -scratch_c[k];
        lambda2 -= scratch_a[k];
        // x4 = λ2² − x1 − x3, where x3 = (x3 − x1) + x1 = scratch_b[k] + accumulator[k].x.
        Fq x4 = lambda2.sqr();
        x4 -= accumulator[k].x;
        x4 -= (scratch_b[k] + accumulator[k].x);
        // y4 = λ2 · (x1 − x4) − y1.
        Fq y4 = accumulator[k].x - x4;
        y4 *= lambda2;
        y4 -= accumulator[k].y;
        accumulator[k].x = x4;
        accumulator[k].y = y4;
    }
}

/**
 * @brief Batch affine addition for non-contiguous bucket positions:
 *        for each pair `(dst_idx, src_idx)`, mutates `buckets[dst_idx] += buckets[src_idx]` in place.
 *
 * @details Variant of `batch_affine_add_impl` that gathers operands by index from a shared bucket
 *          array. Used by the bucket-reduction path in `round_parallel_msm.cpp`, where the
 *          dst and src positions are scattered across a dense bucket array but the operation count
 *          is large enough to amortize one Montgomery batch inversion over the whole call.
 *
 *          One Fq inversion total, regardless of `num_pairs`. Each pair contributes
 *          ~6 muls + 1 sqr + a few adds + a small constant share of the inversion.
 *
 * @param buckets       base array of affine points (mutated in place at `dst_idx` positions).
 * @param pairs         array of (dst_idx, src_idx); after the call, buckets[dst_idx] = old buckets[dst_idx] +
 * buckets[src_idx].
 * @param num_pairs     number of pairs.
 * @param scratch_space Fq scratch of size ≥ num_pairs.
 *
 * @warning ASSUMES NO EDGE CASES:
 *   - All referenced points must be valid (not point at infinity). Caller must filter identities.
 *   - dst_idx != src_idx within a single call (no aliasing-as-doubling).
 *   - For each pair, buckets[dst_idx] != ±buckets[src_idx]. The first triggers doubling
 *     (denominator zero); the second produces point-at-infinity (also denominator zero).
 *   - Across pairs, no `dst_idx` equals any other pair's `src_idx` (no read-after-write aliasing).
 */
template <typename AffineElement, typename Fq>
__attribute__((always_inline)) inline void batch_affine_add_indexed_impl(AffineElement* buckets,
                                                                         const std::pair<uint32_t, uint32_t>* pairs,
                                                                         const size_t num_pairs,
                                                                         Fq* scratch_space) noexcept
{
    if (num_pairs == 0) {
        return;
    }

    // Sparse indexed bucket accesses are hard for hardware prefetchers. A small fixed
    // lookahead overlaps the next bucket load with the current pair's field arithmetic.
    constexpr size_t PREFETCH_AHEAD = 4;

    Fq batch_inversion_accumulator = Fq::one();

    // Forward pass: prepare batch inversion via the standard Montgomery trick.
    // Treats the dst slot as `rhs` (mutated in place) and src slot as `lhs` (read-only).
    for (size_t i = 0; i < num_pairs; ++i) {
        if (i + PREFETCH_AHEAD < num_pairs) {
            __builtin_prefetch(buckets + pairs[i + PREFETCH_AHEAD].first, 1, 3);  // dst: write
            __builtin_prefetch(buckets + pairs[i + PREFETCH_AHEAD].second, 0, 3); // src: read
        }
        AffineElement& dst = buckets[pairs[i].first];
        const AffineElement& src = buckets[pairs[i].second];
        scratch_space[i] = src.x + dst.x; // x1 + x2 (saved for backward pass)
        dst.x -= src.x;                   // x2 - x1 (denominator)
        dst.y -= src.y;                   // y2 - y1 (numerator before scaling)
        dst.y *= batch_inversion_accumulator;
        batch_inversion_accumulator *= dst.x;
    }

    if (batch_inversion_accumulator == Fq::zero()) {
        throw_or_abort("attempted to invert zero in batch_affine_add_indexed_impl");
    }
    batch_inversion_accumulator = batch_inversion_accumulator.invert();

    // Backward pass: complete each pair's slope and write x3, y3 into the dst slot.
    for (size_t j = num_pairs; j > 0; --j) {
        const size_t i = j - 1;
        if (i >= PREFETCH_AHEAD) {
            __builtin_prefetch(buckets + pairs[i - PREFETCH_AHEAD].first, 1, 3);  // dst: write
            __builtin_prefetch(buckets + pairs[i - PREFETCH_AHEAD].second, 0, 3); // src: read
            __builtin_prefetch(scratch_space + (i - PREFETCH_AHEAD), 0, 3);
        }
        AffineElement& dst = buckets[pairs[i].first];
        const AffineElement& src = buckets[pairs[i].second];

        // lambda = (y2 - y1) / (x2 - x1)
        dst.y *= batch_inversion_accumulator;
        batch_inversion_accumulator *= dst.x;
        dst.x = dst.y.sqr();
        dst.x -= scratch_space[i]; // x3 = lambda^2 - (x1 + x2)

        // y3 = lambda * (x1 - x3) - y1
        Fq temp = src.x - dst.x;
        temp *= dst.y;
        dst.y = temp - src.y;
    }
}

/**
 * @brief Batch affine doubling for non-contiguous bucket positions:
 *        for each `idx in indices`, mutates `buckets[idx] = 2 * buckets[idx]` in place.
 *
 * @details Variant of `batch_affine_double_impl` that gathers operands by index. One Fq inversion
 *          across the whole call. See `batch_affine_add_indexed_impl` for the rationale.
 *
 * @param buckets       base array of affine points (mutated in place at `indices` positions).
 * @param indices       array of bucket indices to double.
 * @param num_points    number of points to double.
 * @param scratch_space Fq scratch of size ≥ num_points.
 *
 * @warning ASSUMES NO EDGE CASES:
 *   - All referenced points must be valid (not point at infinity, y != 0). Caller must filter identities.
 *   - `indices` contains no duplicates (no aliasing).
 */
template <typename AffineElement, typename Fq>
__attribute__((always_inline)) inline void batch_affine_double_indexed_impl(AffineElement* buckets,
                                                                            const uint32_t* indices,
                                                                            const size_t num_points,
                                                                            Fq* scratch_space) noexcept
{
    if (num_points == 0) {
        return;
    }

    constexpr size_t PREFETCH_AHEAD = 4;

    Fq batch_inversion_accumulator = Fq::one();

    // Forward pass.
    for (size_t i = 0; i < num_points; ++i) {
        if (i + PREFETCH_AHEAD < num_points) {
            __builtin_prefetch(buckets + indices[i + PREFETCH_AHEAD], 1, 3);
        }
        AffineElement& p = buckets[indices[i]];
        scratch_space[i] = p.x.sqr();
        scratch_space[i] = scratch_space[i] + scratch_space[i] + scratch_space[i]; // 3 x^2
        scratch_space[i] *= batch_inversion_accumulator;
        batch_inversion_accumulator *= (p.y + p.y);
    }

    if (batch_inversion_accumulator == Fq::zero()) {
        throw_or_abort("attempted to invert zero in batch_affine_double_indexed_impl");
    }
    batch_inversion_accumulator = batch_inversion_accumulator.invert();

    // Backward pass.
    Fq temp_x;
    for (size_t j = num_points; j > 0; --j) {
        const size_t i = j - 1;
        if (i >= PREFETCH_AHEAD) {
            __builtin_prefetch(buckets + indices[i - PREFETCH_AHEAD], 1, 3);
            __builtin_prefetch(scratch_space + (i - PREFETCH_AHEAD), 0, 3);
        }
        AffineElement& p = buckets[indices[i]];

        scratch_space[i] *= batch_inversion_accumulator;
        batch_inversion_accumulator *= (p.y + p.y);

        temp_x = p.x;
        p.x = scratch_space[i].sqr() - (p.x + p.x);
        p.y = scratch_space[i] * (temp_x - p.x) - p.y;
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
    if (num_points == 0) {
        return {};
    }

    // Scratch for batch inversions.
    //   [0 .. N)        — single-inversion buffer for batch_affine_add_impl / batch_affine_double_impl
    //   [0 .. 3N)       — batch_affine_combined_double_add_impl needs three N-sized scratches
    //                     (one each for (x1+x2), (x2−x1)/(x3−x1), and the λ1/numerator product).
    std::vector<Fq> scratch_space(3 * num_points);
    Fq* const scratch_a = &scratch_space[0];
    Fq* const scratch_b = &scratch_space[num_points];
    Fq* const scratch_c = &scratch_space[2 * num_points];

    // p−1 still produces an "infinity" path at the end of the sum under any
    // signed-digit encoding (the partial sums hit a doubling edge), so short-circuit
    // it here to keep edge-case handling out of the hot loop.
    if (scalar == -Fr::one()) {
        std::vector<affine_element> results(num_points);
        parallel_for_heuristic(num_points, [&](size_t i) { results[i] = -points[i]; }, thread_heuristics::FF_COPY_COST);
        return results;
    }
    const Fr converted_scalar = scalar.from_montgomery_form();
    if (converted_scalar.is_zero()) {
        affine_element result{ Fq::zero(), Fq::zero() };
        result.self_set_infinity();
        std::vector<affine_element> results(num_points);
        parallel_for_heuristic(num_points, [&](size_t i) { results[i] = result; }, thread_heuristics::FF_COPY_COST);
        return results;
    }

    constexpr size_t LOOKUP_SIZE = detail::BOOTH_ENDO_LOOKUP_SIZE;
    constexpr size_t NUM_WINDOWS = detail::BOOTH_ENDO_NUM_WINDOWS;
    constexpr size_t K2_NUM_WINDOWS = detail::BOOTH_ENDO_K2_NUM_WINDOWS;
    constexpr size_t WINDOW_BITS = detail::BOOTH_ENDO_WINDOW_BITS;
    constexpr size_t K2_LOW_WINDOW_BITS = detail::BOOTH_ENDO_K2_LOW_WINDOW_BITS;
    constexpr auto slice_params = detail::make_booth_slice_params<detail::BOOTH_ENDO_NUM_WINDOWS,
                                                                  detail::BOOTH_ENDO_WINDOW_BITS,
                                                                  detail::BOOTH_ENDO_NUM_LIMBS_U64>();
    constexpr auto k2_slice_params = detail::make_offset_booth_slice_params<detail::BOOTH_ENDO_K2_NUM_WINDOWS,
                                                                            detail::BOOTH_ENDO_WINDOW_BITS,
                                                                            detail::BOOTH_ENDO_K2_LOW_WINDOW_BITS,
                                                                            detail::BOOTH_ENDO_NUM_LIMBS_U64>();

    // K1 keeps the standard 4-bit Booth grid at bit positions {0, 4, ..., 124}.
    // K2 uses the offset grid: a 2-bit window at bit 0, then 4-bit windows at
    // {2, 6, ..., 126}. The union of K1/K2 bit positions is {0, 2, 4, ..., 126},
    // so the main loop visits each position once with 2 doublings between
    // adjacent positions — every (2·dbl + add) pair fuses with combined_chunked.
    //
    // A scalar already below 2^127 (e.g. an unreduced 127-bit transcript challenge, as in the
    // IPA SRS fold) takes (k1, k2) = (scalar, 0) directly. An all-zero K2 digit sequence makes the
    // main loop run the single-sequence schedule (every K2 position is two plain doublings instead
    // of a doubling plus a fused add — about half the add passes), and the IPA fold's cost model
    // relies on that. The split would currently produce (scalar, 0) here anyway; bypassing it
    // makes the guarantee explicit rather than a property of the split's rounding.
    const bool is_short_scalar =
        ((converted_scalar.data[2] | converted_scalar.data[3]) == 0) && ((converted_scalar.data[1] >> 63) == 0);
    const detail::EndoScalars endo_scalars =
        is_short_scalar ? detail::EndoScalars{ { converted_scalar.data[0], converted_scalar.data[1] }, { 0ULL, 0ULL } }
                        : Fr::split_into_endomorphism_scalars(converted_scalar);
    const uint64_t* k1 = endo_scalars.first.data();
    const uint64_t* k2 = endo_scalars.second.data();
    BB_ASSERT((k2[1] >> 63) == 0, "GLV K2 split must fit below 2^127 for the offset Booth window schedule");

    std::array<uint32_t, NUM_WINDOWS> k1_digits{};
    std::array<uint32_t, K2_NUM_WINDOWS> k2_digits{};
    for (size_t w = 0; w < NUM_WINDOWS; ++w) {
        k1_digits[w] = detail::booth_packed_digit(k1, slice_params[w], WINDOW_BITS);
    }
    k2_digits[0] = detail::booth_packed_digit(k2, k2_slice_params[0], K2_LOW_WINDOW_BITS);
    for (size_t w = 1; w < K2_NUM_WINDOWS; ++w) {
        k2_digits[w] = detail::booth_packed_digit(k2, k2_slice_params[w], WINDOW_BITS);
    }

    // Precompute, for every chunked-combined/add call below, whether
    // batch_affine_combined_double_add_impl's edge conditions could fire.
    // Both edges (x(2·accum) == x(to_add), and 2·accum + to_add == O) are a function
    // only of the (k1, k2) Booth digit sequence and the (P, φP) basis, so we simulate the
    // accumulator's coefficients in that basis as int64s and set one mask bit per call site.
    //
    // Layout:
    //   bits 0..61: main loop, step s ↔ pos 124 - 2·s.
    //   bit 62: pos-0 combined_chunked.
    //   bit 63: pos-0 trailing add_chunked when both pos-0 digits are non-zero.
    // The pos-0 add_chunked on the !initialised seed path is omitted: there the accumulator
    // is d0·P and to_add is d1·φP with both digits
    // non-zero, so the two affine points cannot share an x-coordinate (P and φP are
    // independent generators of the prime-order subgroup), so its check is always false.
    auto compute_safe_mask = [&]() -> uint64_t {
        uint64_t mask = 0;
        int64_t a = 0;
        int64_t b = 0;
        bool initialised = false;

        const auto signed_digit = [](uint32_t packed) -> int64_t {
            const int64_t mag = static_cast<int64_t>(packed & 0x7FFFFFFFU);
            return ((packed >> 31) != 0) ? -mag : mag;
        };

        // Edge predicate for combined_chunked (does dbl-then-add internally).
        //  Pre-call accum = (a)P + (b)φP, internal accumulator post-double = (2a)P + (2b)φP.
        //  Edge 1: x((2a)P + (2b)φP) == x(d·BASE)  ⇔  one of (a, b) is 0 AND 2·other = ±d.
        //  Edge 2: (4a + d)P + 4b·φP == O           ⇔  b=0 AND 4a = -d  (K1 case)
        //                                            or a=0 AND 4b = -d (K2 case).
        const auto edge_for_combined = [&](int64_t d, bool is_k1) -> bool {
            if (is_k1) {
                if (b != 0) {
                    return false;
                }
                if ((d % 2 == 0) && (2 * a == d || 2 * a == -d)) {
                    return true;
                }
                return (d % 4 == 0) && (4 * a == -d);
            }
            if (a != 0) {
                return false;
            }
            if ((d % 2 == 0) && (2 * b == d || 2 * b == -d)) {
                return true;
            }
            return (d % 4 == 0) && (4 * b == -d);
        };

        // Edge predicate for plain add_chunked: accum = (a)P + (b)φP, to_add = d·BASE.
        //  x(accum) == x(to_add)  ⇔  accum = ±to_add  ⇔  the orthogonal basis coord is 0
        //                            AND |the aligned coord| = |d|.
        const auto edge_for_add = [&](int64_t d, bool is_k1) -> bool {
            if (is_k1) {
                return (b == 0) && (a == d || a == -d);
            }
            return (a == 0) && (b == d || b == -d);
        };

        // === Pos 126: K2 window 32 (top, 4-bit but value ≤ 2 since K2 < 2^127). ===
        {
            const uint32_t d126 = k2_digits[K2_NUM_WINDOWS - 1];
            if ((d126 & 0x7FFFFFFFU) != 0) {
                b = signed_digit(d126);
                initialised = true;
            }
        }

        // === Positions 124, 122, ..., 2 (62 iterations). ===
        for (size_t step = 0; step < 62; ++step) {
            // Once either basis coordinate is non-zero and outside ±4, no later edge predicate can fire:
            // same-basis additions are too small to collide, and opposite-basis additions see a non-zero
            // orthogonal coordinate. Stop before the coefficient simulation can overflow int64_t.
            if (((a != 0) && (std::abs(a) > 4)) || ((b != 0) && (std::abs(b) > 4))) {
                break;
            }
            const size_t pos = 124 - 2 * step;
            const bool is_k1 = (pos % 4 == 0);
            const uint32_t digit = is_k1 ? k1_digits[pos / 4] : k2_digits[(pos + 2) / 4];
            const uint32_t m = digit & 0x7FFFFFFFU;
            const int64_t d = signed_digit(digit);

            if (!initialised) {
                if (m != 0) {
                    if (is_k1) {
                        a = d;
                    } else {
                        b = d;
                    }
                    initialised = true;
                }
                continue;
            }
            if (m == 0) {
                a *= 4;
                b *= 4;
                continue;
            }
            if (edge_for_combined(d, is_k1)) {
                mask |= (uint64_t{ 1 } << step);
            }
            a *= 4;
            b *= 4;
            if (is_k1) {
                a += d;
            } else {
                b += d;
            }
        }

        // === Pos 0: K1 window 0 (4-bit) + K2 window 0 (2-bit). ===
        // Mirrors the runtime pos-0 branch structure below.
        {
            const uint32_t d0 = k1_digits[0];
            const uint32_t d1 = k2_digits[0];
            const uint32_t m0 = d0 & 0x7FFFFFFFU;
            const uint32_t m1 = d1 & 0x7FFFFFFFU;
            const int64_t s0 = signed_digit(d0);
            const int64_t s1 = signed_digit(d1);

            if (!initialised) {
                if (m0 != 0) {
                    a = s0;
                    initialised = true;
                    if (m1 != 0) { // accum=d0·P, to_add=d1·φP. Linear independence ⇒ no x-coordinate collision.
                        b += s1;
                    }
                } else if (m1 != 0) {
                    b = s1;
                    initialised = true;
                }
            } else if (m0 == 0 && m1 == 0) {
                a *= 4;
                b *= 4;
            } else {
                const bool fuse_with_h1 = (m0 == 0);
                const int64_t fused_d = fuse_with_h1 ? s1 : s0;
                if (edge_for_combined(fused_d, /*is_k1=*/!fuse_with_h1)) {
                    mask |= (uint64_t{ 1 } << 62);
                }
                a *= 4;
                b *= 4;
                if (fuse_with_h1) {
                    b += fused_d;
                } else {
                    a += fused_d;
                }
                if (m0 != 0 && m1 != 0) {
                    // Combined consumed d0 (the K1 contribution); the trailing add_chunked
                    // stacks d1 (the K2 contribution) on top.
                    if (edge_for_add(s1, /*is_k1=*/false)) {
                        mask |= (uint64_t{ 1 } << 63);
                    }
                }
                b += s1;
            }
        }

        return mask;
    };
    const uint64_t safe_mask = compute_safe_mask();

    std::vector<affine_element> work_elements(num_points);
    std::array<std::vector<affine_element>, LOOKUP_SIZE> lookup_table;
    for (auto& table : lookup_table) {
        table.resize(num_points);
    }
    std::vector<affine_element> temp_point_vector(num_points);

    auto execute_range = [&](size_t start, size_t end) {
        BB_BENCH_TRACY_NAME("batch_mul_with_endo/execute_range");
        const auto add_chunked = [&](const affine_element* lhs, affine_element* rhs) {
            batch_affine_add_impl<affine_element, Fq>(&lhs[start], &rhs[start], end - start, &scratch_a[start]);
        };
        const auto add_safe_chunked = [&](const affine_element* lhs, affine_element* rhs) {
            for (size_t i = start; i < end; ++i) {
                element acc(rhs[i]);
                acc += lhs[i];
                rhs[i] = affine_element(acc);
            }
        };
        const auto double_chunked = [&](affine_element* lhs) {
            batch_affine_double_impl<affine_element, Fq, T>(&lhs[start], end - start, &scratch_a[start]);
        };
        // Fused 2·accum + to_add — saves 1 mul + 1 sqr per point vs. (double + add).
        const auto combined_chunked = [&](const affine_element* to_add, affine_element* accum) {
            batch_affine_combined_double_add_impl<affine_element, Fq>(
                &to_add[start], &accum[start], end - start, &scratch_a[start], &scratch_b[start], &scratch_c[start]);
        };
        const auto combined_safe_chunked = [&](const affine_element* to_add, affine_element* accum) {
            for (size_t i = start; i < end; ++i) {
                element acc(accum[i]);
                acc.self_dbl();
                acc += to_add[i];
                accum[i] = affine_element(acc);
            }
        };
        // Build lookup table [1·P, 2·P, 3·P, ..., 8·P]. Substitute affine::one()
        // for points-at-infinity to keep the batch arithmetic edge-case-free; the
        // final pass below sets work_elements[i] to infinity for those slots.
        for (size_t i = start; i < end; ++i) {
            if (points[i].is_point_at_infinity()) {
                lookup_table[0][i] = affine_element::one();
                temp_point_vector[i] = affine_element::one();
            } else {
                lookup_table[0][i] = points[i];
                temp_point_vector[i] = points[i];
            }
        }
        // lookup[1] = 2·P via batch double (lookup[1] = lookup[0] + lookup[0] would
        // trip the equal-x guard in batch_affine_add_impl).
        for (size_t i = start; i < end; ++i) {
            lookup_table[1][i] = lookup_table[0][i];
        }
        double_chunked(&lookup_table[1][0]);
        // lookup[j] = lookup[j-1] + P for j ≥ 2 (lookup[j-1] = j·P, never equals P).
        for (size_t j = 2; j < LOOKUP_SIZE; ++j) {
            for (size_t i = start; i < end; ++i) {
                lookup_table[j][i] = lookup_table[j - 1][i];
            }
            add_chunked(&temp_point_vector[0], &lookup_table[j][0]);
        }

        constexpr Fq beta = Fq::cube_root_of_unity();

        // Materialise lookup[mag-1] (possibly negated, possibly β-twisted) for one
        // (window, half). Skips the points-at-infinity slots via the lookup entry
        // already being affine::one(); those slots get zeroed at the end.
        auto fill_to_add = [&](uint32_t digit, bool half_idx, affine_element* dst) {
            const uint32_t magnitude = digit & 0x7FFFFFFFU;
            const bool sign = (digit >> 31) != 0;
            const bool flip_y = sign ^ half_idx;
            for (size_t i = start; i < end; ++i) {
                affine_element pt = lookup_table[magnitude - 1][i];
                pt.y.self_conditional_negate(flip_y);
                if (half_idx) {
                    pt.x *= beta;
                }
                dst[i] = pt;
            }
        };

        // Walk K1/K2 bit positions {126, 124, 122, ..., 4, 2, 0} top-to-bottom.
        // Mapping: pos % 4 == 0 → K1 window pos/4; pos % 4 == 2 → K2 window (pos+2)/4.
        // Pos 126 hosts K2 window 32 (top, 4-bit but value ≤ 2 since K2 < 2^127, so
        // empty ~50% of the time). Pos 0 hosts both K1 window 0 and K2 window 0 (2-bit).
        //
        // Once initialised, every transition between adjacent positions is "2 dbl + add",
        // fused as "1 dbl + 1 combined_chunked". Booth digit 0 turns the add into a no-op,
        // so a zero digit just becomes 2 unfused doublings to shift past.
        bool initialised = false;
        const auto update_initialised_from_work = [&]() { initialised = !work_elements[start].is_point_at_infinity(); };
        auto seed_or_skip = [&](uint32_t digit, bool half_idx) {
            // Pre-init: no doublings (accumulator is conceptually identity).
            if ((digit & 0x7FFFFFFFU) != 0) {
                fill_to_add(digit, half_idx, &work_elements[0]);
                initialised = true;
            }
        };

        // Pos 126: K2 window 32 (top). Magnitude in {0, 1, 2} given K2 < 2^127.
        seed_or_skip(k2_digits[K2_NUM_WINDOWS - 1], /*half_idx=*/true);

        // Positions 124, 122, ..., 2 (62 positions, alternating K1 / K2).
        for (size_t step = 0; step < 62; ++step) {
            const size_t pos = 124 - 2 * step;
            const bool is_k1 = (pos % 4 == 0);
            const uint32_t digit = is_k1 ? k1_digits[pos / 4] : k2_digits[(pos + 2) / 4];
            const bool half_idx = !is_k1;
            const uint32_t m = digit & 0x7FFFFFFFU;

            if (!initialised) {
                if (m != 0) {
                    fill_to_add(digit, half_idx, &work_elements[0]);
                    initialised = true;
                }
                continue;
            }

            if (m == 0) {
                // 2 unfused doublings to shift past this empty position.
                double_chunked(&work_elements[0]);
                double_chunked(&work_elements[0]);
                continue;
            }

            // (2·dbl + add) fused as (1·dbl + combined_chunked).
            double_chunked(&work_elements[0]);
            fill_to_add(digit, half_idx, &temp_point_vector[0]);
            if ((safe_mask >> step) & uint64_t{ 1 }) {
                combined_safe_chunked(&temp_point_vector[0], &work_elements[0]);
                update_initialised_from_work();
            } else {
                combined_chunked(&temp_point_vector[0], &work_elements[0]);
            }
        }

        // Pos 0: both K1 window 0 (4-bit) and K2 window 0 (2-bit). Transition from
        // pos 2 still requires the standard 2-dbl shift; the second contribution rides
        // on top via an extra add_chunked.
        {
            const uint32_t d0 = k1_digits[0];
            const uint32_t d1 = k2_digits[0];
            const uint32_t m0 = d0 & 0x7FFFFFFFU;
            const uint32_t m1 = d1 & 0x7FFFFFFFU;

            if (!initialised) {
                if (m0 != 0) {
                    fill_to_add(d0, /*half_idx=*/false, &work_elements[0]);
                    initialised = true;
                    if (m1 != 0) {
                        // accum = d0·P, to_add = d1·φP with both digits non-zero.
                        // x-coords cannot collide (linear independence of P, φP), so the
                        // unsafe batch-add formula is always safe here.
                        fill_to_add(d1, /*half_idx=*/true, &temp_point_vector[0]);
                        add_chunked(&temp_point_vector[0], &work_elements[0]);
                    }
                } else if (m1 != 0) {
                    fill_to_add(d1, /*half_idx=*/true, &work_elements[0]);
                    initialised = true;
                }
            } else if (m0 == 0 && m1 == 0) {
                double_chunked(&work_elements[0]);
                double_chunked(&work_elements[0]);
            } else {
                double_chunked(&work_elements[0]);
                const bool fuse_with_h1 = (m0 == 0);
                const uint32_t fused_digit = fuse_with_h1 ? d1 : d0;
                fill_to_add(fused_digit, fuse_with_h1, &temp_point_vector[0]);
                if ((safe_mask >> 62) & uint64_t{ 1 }) {
                    combined_safe_chunked(&temp_point_vector[0], &work_elements[0]);
                    update_initialised_from_work();
                } else {
                    combined_chunked(&temp_point_vector[0], &work_elements[0]);
                }
                if (m0 != 0 && m1 != 0) {
                    if (!initialised) {
                        fill_to_add(d1, /*half_idx=*/true, &work_elements[0]);
                        initialised = true;
                    } else {
                        fill_to_add(d1, /*half_idx=*/true, &temp_point_vector[0]);
                        if ((safe_mask >> 63) & uint64_t{ 1 }) {
                            add_safe_chunked(&temp_point_vector[0], &work_elements[0]);
                            update_initialised_from_work();
                        } else {
                            add_chunked(&temp_point_vector[0], &work_elements[0]);
                        }
                    }
                }
            }
        }

        BB_ASSERT(initialised, "non-zero scalar must produce at least one non-zero Booth digit");

        // Restore infinity for slots where the input was at infinity.
        for (size_t i = start; i < end; ++i) {
            if (points[i].is_point_at_infinity()) {
                work_elements[i].self_set_infinity();
            }
        }
    };
    parallel_for_range(num_points, execute_range);

    return work_elements;
}

template <class Fq, class Fr, class T>
std::vector<affine_element<Fq, Fr, T>> element<Fq, Fr, T>::batch_two_round_fold(
    const std::span<const affine_element<Fq, Fr, T>>& points, const Fr& u1, const Fr& u2) noexcept
{
    BB_BENCH();
    using affine_element = affine_element<Fq, Fr, T>;

    // Four terms, one per SRS quarter: (u1·u2)·P0 + u1·P1 + u2·P2 + P3. Three are scalar-multiplied
    // (P0, P1, P2; term 2 reuses P0's table via φ); P3 is the constant tail added at the end.
    constexpr size_t NUM_TERMS = 4;
    constexpr size_t NUM_MULTIPLIED_BASES = 3;

    BB_ASSERT_EQ(points.size() % NUM_TERMS, 0U, "batch_two_round_fold input must split into four equal quarters");
    const size_t t = points.size() / NUM_TERMS;
    if (t == 0) {
        return {};
    }

    constexpr size_t LOOKUP_SIZE = detail::BOOTH_ENDO_LOOKUP_SIZE;
    constexpr size_t WINDOW_BITS = detail::BOOTH_ENDO_WINDOW_BITS;
    constexpr size_t NUM_WINDOWS = detail::BOOTH_ENDO_NUM_WINDOWS;
    constexpr size_t OFFSET_NUM_WINDOWS = detail::BOOTH_ENDO_K2_NUM_WINDOWS;
    // Highest bit position of a < 2^127 challenge; the Booth windows tile positions 0..TOP_BIT.
    constexpr size_t TOP_BIT = (WINDOW_BITS * NUM_WINDOWS) - 1; // 4*32 - 1 = 127

    const Fr u1_conv = u1.from_montgomery_form();
    const Fr u2_conv = u2.from_montgomery_form();
    BB_ASSERT(((u1_conv.data[2] | u1_conv.data[3]) == 0) && ((u1_conv.data[1] >> 63) == 0),
              "batch_two_round_fold challenges must be below 2^127");
    BB_ASSERT(((u2_conv.data[2] | u2_conv.data[3]) == 0) && ((u2_conv.data[1] >> 63) == 0),
              "batch_two_round_fold challenges must be below 2^127");
    const Fr u12_conv = (u1 * u2).from_montgomery_form();
    const detail::EndoScalars endo_scalars = Fr::split_into_endomorphism_scalars(u12_conv);
    BB_ASSERT_EQ((endo_scalars.first[1] >> 63), 0U, "GLV K1 split must fit below 2^127 for the Booth grid");
    BB_ASSERT_EQ((endo_scalars.second[1] >> 63), 0U, "GLV K2 split must fit below 2^127 for the offset Booth grid");

    // Per-term Booth digit arrays. Term 0 (K1 of u1·u2) uses the standard 4-bit grid;
    // terms 1, 2, 3 use the offset grids with 1-, 2-, 3-bit bottom windows respectively. The
    // interleaving below places term j at bit positions ≡ j (mod 4), which only tiles every
    // position exactly once when term 2's bottom window is 2 bits wide.
    static_assert(detail::BOOTH_ENDO_K2_LOW_WINDOW_BITS == 2,
                  "the offset-grid interleaving (term j at pos ≡ j mod 4) requires a 2-bit bottom window for term 2");
    constexpr auto grid0 =
        detail::make_booth_slice_params<NUM_WINDOWS, WINDOW_BITS, detail::BOOTH_ENDO_NUM_LIMBS_U64>();
    constexpr auto grid1 =
        detail::make_offset_booth_slice_params<OFFSET_NUM_WINDOWS, WINDOW_BITS, 1, detail::BOOTH_ENDO_NUM_LIMBS_U64>();
    constexpr auto grid2 = detail::make_offset_booth_slice_params<OFFSET_NUM_WINDOWS,
                                                                  WINDOW_BITS,
                                                                  detail::BOOTH_ENDO_K2_LOW_WINDOW_BITS,
                                                                  detail::BOOTH_ENDO_NUM_LIMBS_U64>();
    constexpr auto grid3 =
        detail::make_offset_booth_slice_params<OFFSET_NUM_WINDOWS, WINDOW_BITS, 3, detail::BOOTH_ENDO_NUM_LIMBS_U64>();

    std::array<uint32_t, NUM_WINDOWS> digits0{};
    std::array<uint32_t, OFFSET_NUM_WINDOWS> digits1{};
    std::array<uint32_t, OFFSET_NUM_WINDOWS> digits2{};
    std::array<uint32_t, OFFSET_NUM_WINDOWS> digits3{};
    for (size_t w = 0; w < NUM_WINDOWS; ++w) {
        digits0[w] = detail::booth_packed_digit(endo_scalars.first.data(), grid0[w], WINDOW_BITS);
    }
    digits1[0] = detail::booth_packed_digit(u1_conv.data, grid1[0], 1);
    digits2[0] =
        detail::booth_packed_digit(endo_scalars.second.data(), grid2[0], detail::BOOTH_ENDO_K2_LOW_WINDOW_BITS);
    digits3[0] = detail::booth_packed_digit(u2_conv.data, grid3[0], 3);
    for (size_t w = 1; w < OFFSET_NUM_WINDOWS; ++w) {
        digits1[w] = detail::booth_packed_digit(u1_conv.data, grid1[w], WINDOW_BITS);
        digits2[w] = detail::booth_packed_digit(endo_scalars.second.data(), grid2[w], WINDOW_BITS);
        digits3[w] = detail::booth_packed_digit(u2_conv.data, grid3[w], WINDOW_BITS);
    }
    // digit_at(j, m) = d^(j)_m, the packed Booth digit of term j's window m (see ELEMENT_IMPL_FOLD.md);
    // signed_delta turns it into the signed δ added to base B_j.
    const auto digit_at = [&](size_t term, size_t window) -> uint32_t {
        switch (term) {
        case 0:
            return digits0[window];
        case 1:
            return digits1[window];
        case 2:
            return digits2[window];
        default:
            return digits3[window];
        }
    };

    // Build the FoldOp schedule from the scalars (no points touched). The batch-affine formulas need
    // generic position, so each op carries a `safe` flag, computed by simulating the accumulator's
    // integer coordinates. See ipa/ELEMENT_IMPL_FOLD.md (Phase 1, The safe flags).
    std::vector<detail::FoldOp> ops;
    ops.reserve(TOP_BIT + NUM_TERMS + 1); // one op per bit position 1..TOP_BIT, plus position 0's windows
    bool final_initialised = false;
    {
        // Horner double-and-add, MSB→LSB, simulated on integers only: the accumulator is the vector
        // `coeff` (= c in the spec) over the per-term bases (P0, P1, φP0, P2), i.e. accum = Σ_i coeff[i]·base[i].
        std::array<int64_t, NUM_TERMS> coeff{ 0, 0, 0, 0 };
        bool initialised = false; // false until the first non-zero digit seeds the accumulator

        // Clamp coeff to ±CAP. CAP is arbitrary — any value well above the ±8 digit window and well
        // below int64 overflow works; see ipa/ELEMENT_IMPL_FOLD.md ("Clamping the simulation") for the
        // bounds and the soundness argument.
        constexpr int64_t CAP = int64_t{ 1 } << 40;
        const auto clamp_coeff = [&]() {
            for (auto& c : coeff) {
                c = std::clamp(c, -CAP, CAP);
            }
        };
        // Signed magnitude actually added to the accumulator. `digit` is a packed signed-Booth digit
        // (Constantine convention, as produced by booth_packed_digit): bit 31 is the sign and the low
        // 31 bits are the magnitude. Term 2 is the GLV K2 component on φ(P0); u1·u2 = K1 − K2·λ
        // decomposes with a minus on K2, so term 2's sign is flipped.
        const auto signed_delta = [](uint32_t digit, size_t term) -> int64_t {
            const auto mag = static_cast<int64_t>(digit & 0x7FFFFFFFU);
            const bool neg = ((digit >> 31) != 0) ^ (term == 2);
            return neg ? -mag : mag;
        };
        // An edge needs accum = ±d·base[j]; the bases are independent, so all other coords must be 0.
        const auto others_zero = [&](size_t j) {
            for (size_t i = 0; i < NUM_TERMS; ++i) {
                if (i != j && coeff[i] != 0) {
                    return false;
                }
            }
            return true;
        };
        // accum == O (the running point is the identity) — batch ops can't operate on it, so re-seed.
        const auto all_zero = [&]() { return coeff[0] == 0 && coeff[1] == 0 && coeff[2] == 0 && coeff[3] == 0; };

        // Apply one term's digit to `coeff` and record its op. `transition` = this digit owns the
        // position's doubling (→ COMBINED, 2·accum+base); false only for extra position-0 windows (→ ADD).
        const auto accumulate_digit = [&](size_t term, uint32_t digit, bool transition) {
            const int64_t delta = signed_delta(digit, term);
            const int64_t mag = std::abs(delta);
            if (!initialised) {
                // Nothing to double or add onto yet: the first non-zero digit just loads its base.
                ops.push_back({ detail::FoldOpKind::SEED, static_cast<uint8_t>(term), digit, false });
                coeff[term] = delta;
                initialised = true;
                return;
            }
            if (transition) {
                // COMBINED computes 2·accum + to_add. Batch-affine edge (shared x-coordinate) when
                // to_add = ±accum, or when 2·accum + to_add = O. See ipa/ELEMENT_IMPL_FOLD.md.
                const bool safe = others_zero(term) && (std::abs(coeff[term]) == mag || 2 * coeff[term] == -delta);
                ops.push_back({ detail::FoldOpKind::COMBINED, static_cast<uint8_t>(term), digit, safe });
                for (auto& c : coeff) {
                    c *= 2;
                }
            } else {
                // Plain ADD edge: to_add = ±accum.
                const bool safe = others_zero(term) && std::abs(coeff[term]) == mag;
                ops.push_back({ detail::FoldOpKind::ADD, static_cast<uint8_t>(term), digit, safe });
            }
            coeff[term] += delta;
            clamp_coeff();
            if (all_zero()) {
                // Only a safe op can reach the identity; re-seed at the next non-zero digit.
                initialised = false;
            }
        };

        // Iterate over bit positions 127→1. The offset grids place exactly one term's window at each
        // position: term = pos mod 4. Terms 1/2/3 keep their lowest window at position 0, so a window
        // at pos>0 is window (pos-term)/4 + 1; term 0 (no offset) uses pos/4.
        for (size_t pos = TOP_BIT; pos >= 1; --pos) {
            const size_t term = pos % NUM_TERMS;
            const size_t window = (term == 0) ? pos / WINDOW_BITS : (pos - term) / WINDOW_BITS + 1;
            const uint32_t digit = digit_at(term, window);
            if ((digit & 0x7FFFFFFFU) == 0) {
                // Zero digit: just the Horner doubling for this position — skipped while unseeded,
                // since there is no running point to double yet.
                if (initialised) {
                    ops.push_back({ detail::FoldOpKind::DBL, 0, 0, false });
                    for (auto& c : coeff) {
                        c *= 2;
                    }
                    clamp_coeff();
                }
                continue;
            }
            accumulate_digit(term, digit, /*transition=*/true);
        }

        // Position 0 holds all four lowest windows (term 0's window 0 plus the 1/2/3-bit bottoms of
        // terms 1/2/3). The step-in doubling fuses into the first non-zero one (COMBINED); the rest are ADDs.
        bool transition_pending = initialised;
        for (size_t term = 0; term < NUM_TERMS; ++term) {
            const uint32_t digit = digit_at(term, 0);
            if ((digit & 0x7FFFFFFFU) == 0) {
                continue;
            }
            accumulate_digit(term, digit, transition_pending);
            transition_pending = false;
        }
        // The step into position 0 must still happen if every window here was zero
        // (Horner: result = prev·2 + 0), so emit the trailing doubling when nothing consumed it.
        if (transition_pending) {
            ops.push_back({ detail::FoldOpKind::DBL, 0, 0, false });
        }
        final_initialised = initialised; // false ⟺ all terms cancelled, i.e. the chain's result is O
    }

    // Execute the schedule over the point batch.
    std::vector<affine_element> work_elements(t);

    if (!final_initialised) {
        // All four scalars vanish iff u1 = u2 = 0 (never for real Fiat–Shamir challenges); the
        // output is then the constant P3 quarter.
        parallel_for_heuristic(
            t, [&](size_t i) { work_elements[i] = points[3 * t + i]; }, thread_heuristics::FF_COPY_COST);
        return work_elements;
    }

    std::vector<Fq> scratch_space(3 * t);
    Fq* const scratch_a = &scratch_space[0];
    Fq* const scratch_b = &scratch_space[t];
    Fq* const scratch_c = &scratch_space[2 * t];

    // Lookup tables [1·B, ..., 8·B] for the three multiplied bases (term 2 reuses base 0's
    // table with the on-the-fly β twist, as in batch_mul_with_endomorphism).
    std::array<std::array<std::vector<affine_element>, LOOKUP_SIZE>, NUM_MULTIPLIED_BASES> lookup_tables;
    for (auto& base_table : lookup_tables) {
        for (auto& table : base_table) {
            table.resize(t);
        }
    }
    std::vector<affine_element> temp_point_vector(t);

    // Produce the folded outputs work_elements[i] = (u1·u2)·P0_i + u1·P1_i + u2·P2_i + P3_i for the
    // index range [start, end): build the per-base lookup tables over this slice, replay the op
    // schedule (one batched-affine group op per FoldOp), then add the constant P3 quarter. The same
    // schedule runs on every range; the split is for parallelism and batched-inversion amortisation.
    auto fold_point_range = [&](size_t start, size_t end) {
        const auto add_chunked = [&](const affine_element* lhs, affine_element* rhs) {
            batch_affine_add_impl<affine_element, Fq>(&lhs[start], &rhs[start], end - start, &scratch_a[start]);
        };
        const auto double_chunked = [&](affine_element* pts) {
            batch_affine_double_impl<affine_element, Fq, T>(&pts[start], end - start, &scratch_a[start]);
        };
        const auto combined_chunked = [&](const affine_element* to_add, affine_element* accum) {
            batch_affine_combined_double_add_impl<affine_element, Fq>(
                &to_add[start], &accum[start], end - start, &scratch_a[start], &scratch_b[start], &scratch_c[start]);
        };
        const auto add_safe_chunked = [&](const affine_element* lhs, affine_element* rhs) {
            for (size_t i = start; i < end; ++i) {
                element acc(rhs[i]);
                acc += lhs[i];
                rhs[i] = affine_element(acc);
            }
        };
        const auto combined_safe_chunked = [&](const affine_element* to_add, affine_element* accum) {
            for (size_t i = start; i < end; ++i) {
                element acc(accum[i]);
                acc.self_dbl();
                acc += to_add[i];
                accum[i] = affine_element(acc);
            }
        };

        // Build the lookup tables.
        for (size_t base = 0; base < NUM_MULTIPLIED_BASES; ++base) {
            const affine_element* base_points = &points[base * t];
            auto& table = lookup_tables[base];
            for (size_t i = start; i < end; ++i) {
                table[0][i] = base_points[i];
                table[1][i] = base_points[i];
                temp_point_vector[i] = base_points[i];
            }
            double_chunked(&table[1][0]);
            for (size_t j = 2; j < LOOKUP_SIZE; ++j) {
                for (size_t i = start; i < end; ++i) {
                    table[j][i] = table[j - 1][i];
                }
                add_chunked(&temp_point_vector[0], &table[j][0]);
            }
        }

        constexpr Fq beta = Fq::cube_root_of_unity();
        const auto fill_to_add = [&](size_t term, uint32_t digit, affine_element* dst) {
            const uint32_t magnitude = digit & 0x7FFFFFFFU;
            const bool flip_y = ((digit >> 31) != 0) ^ (term == 2);
            // term → multiplied-base index. Term 2 (the GLV K2 component on φ(P0)) shares base 0's
            // table via the β twist below, so it maps to 0 rather than a base of its own.
            static constexpr std::array<size_t, NUM_TERMS> term_to_base{ 0, 1, 0, 2 };
            const auto& table = lookup_tables[term_to_base[term]][magnitude - 1];
            for (size_t i = start; i < end; ++i) {
                affine_element pt = table[i];
                pt.y.self_conditional_negate(flip_y);
                if (term == 2) {
                    pt.x *= beta;
                }
                dst[i] = pt;
            }
        };

        for (const detail::FoldOp& op : ops) {
            switch (op.kind) {
            case detail::FoldOpKind::DBL:
                double_chunked(&work_elements[0]);
                break;
            case detail::FoldOpKind::SEED:
                fill_to_add(op.term, op.digit, &work_elements[0]);
                break;
            case detail::FoldOpKind::COMBINED:
                fill_to_add(op.term, op.digit, &temp_point_vector[0]);
                if (op.safe) {
                    combined_safe_chunked(&temp_point_vector[0], &work_elements[0]);
                } else {
                    combined_chunked(&temp_point_vector[0], &work_elements[0]);
                }
                break;
            case detail::FoldOpKind::ADD:
                fill_to_add(op.term, op.digit, &temp_point_vector[0]);
                if (op.safe) {
                    add_safe_chunked(&temp_point_vector[0], &work_elements[0]);
                } else {
                    add_chunked(&temp_point_vector[0], &work_elements[0]);
                }
                break;
            }
        }

        // Constant tail: + P3. The chain result carries no P3 component, so a collision would
        // require a small-coefficient relation between independent SRS points.
        add_chunked(&points[3 * t], &work_elements[0]);
    };
    parallel_for_range(t, fold_point_range);

    return work_elements;
}

template <typename Fq, typename Fr, typename T>
void element<Fq, Fr, T>::batch_normalize(element* elements, const size_t num_elements) noexcept
{
    std::vector<Fq> temporaries;
    temporaries.reserve(num_elements * 2);
    Fq accumulator = Fq::one();

    // Iterate over the points, computing the product of their z-coordinates.
    // At each iteration, store the currently-accumulated z-coordinate in `temporaries`
    for (size_t i = 0; i < num_elements; ++i) {
        temporaries.emplace_back(accumulator);
        if (!elements[i].is_point_at_infinity()) {
            accumulator *= elements[i].z;
        }
    }
    // For the rest of this method we refer to the product of all z-coordinates as the 'global' z-coordinate
    // Invert the global z-coordinate and store in `accumulator`
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
    for (size_t i = num_elements - 1; i < num_elements; --i) {
        if (!elements[i].is_point_at_infinity()) {
            Fq z_inv = accumulator * temporaries[i];
            Fq zz_inv = z_inv.sqr();
            elements[i].x *= zz_inv;
            elements[i].y *= (zz_inv * z_inv);
            accumulator *= elements[i].z;
        }
        elements[i].z = Fq::one();
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
