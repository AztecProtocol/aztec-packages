// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/common/thread.hpp"
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

template <class Fq, class Fr, class T> constexpr void element<Fq, Fr, T>::self_dbl() noexcept
{
    if constexpr (Fq::modulus.data[3] >= 0x4000000000000000ULL) {
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

    // T2 = T2*T1 = y*y*y*y
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
constexpr void element<Fq, Fr, T>::self_mixed_add_or_sub(const affine_element<Fq, Fr, T>& other,
                                                         const uint64_t predicate) noexcept
{
    if constexpr (Fq::modulus.data[3] >= 0x4000000000000000ULL) {
        if (is_point_at_infinity()) {
            conditional_negate_affine(other, *(affine_element<Fq, Fr, T>*)this, predicate); // NOLINT
            z = Fq::one();
            return;
        }
    } else {
        const bool edge_case_trigger = x.is_msb_set() || other.x.is_msb_set();
        if (edge_case_trigger) {
            if (x.is_msb_set()) {
                conditional_negate_affine(other, *(affine_element<Fq, Fr, T>*)this, predicate); // NOLINT
                z = Fq::one();
            }
            return;
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
    T2.self_conditional_negate(predicate);
    T2 -= y;

    if (__builtin_expect(T1.is_zero(), 0)) {
        if (T2.is_zero()) {
            // y2 equals y1, x2 equals x1, double x1
            self_dbl();
            return;
        }
        self_set_infinity();
        return;
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
}

template <class Fq, class Fr, class T>
constexpr element<Fq, Fr, T> element<Fq, Fr, T>::operator+=(const affine_element<Fq, Fr, T>& other) noexcept
{
    if constexpr (Fq::modulus.data[3] >= 0x4000000000000000ULL) {
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
    if constexpr (Fq::modulus.data[3] >= 0x4000000000000000ULL) {
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
    BB_OP_COUNT_TRACK_NAME("element::operator+");
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
    BB_OP_COUNT_TRACK();
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

template <class Fq, class Fr, class T> constexpr element<Fq, Fr, T> element<Fq, Fr, T>::normalize() const noexcept
{
    const affine_element<Fq, Fr, T> converted = *this;
    return element(converted);
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
    if constexpr (Fq::modulus.data[3] >= 0x4000000000000000ULL) {
        // We set the value of x equal to modulus to represent inifinty
        x.data[0] = Fq::modulus.data[0];
        x.data[1] = Fq::modulus.data[1];
        x.data[2] = Fq::modulus.data[2];
        x.data[3] = Fq::modulus.data[3];
    } else {
        (*this).x = Fq::zero();
        (*this).y = Fq::zero();
        (*this).z = Fq::zero();
        x.self_set_msb();
    }
}

template <class Fq, class Fr, class T> constexpr bool element<Fq, Fr, T>::is_point_at_infinity() const noexcept
{
    if constexpr (Fq::modulus.data[3] >= 0x4000000000000000ULL) {
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
    // This is simpler and doublings of infinity should be fast. We should think if we want to defend against the
    // timing leak here (if used with ECDSA it can sometimes lead to private key compromise)
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
 * @brief Pairwise affine add points in first and second group
 *
 * @param first_group
 * @param second_group
 * @param results
 */
template <class Fq, class Fr, class T>
void element<Fq, Fr, T>::batch_affine_add(const std::span<affine_element<Fq, Fr, T>>& first_group,
                                          const std::span<affine_element<Fq, Fr, T>>& second_group,
                                          const std::span<affine_element<Fq, Fr, T>>& results) noexcept
{
    typedef affine_element<Fq, Fr, T> affine_element;
    const size_t num_points = first_group.size();
    BB_ASSERT_EQ(second_group.size(), first_group.size());

    // Space for temporary values
    std::vector<Fq> scratch_space(num_points);

    parallel_for_heuristic(
        num_points, [&](size_t i) { results[i] = first_group[i]; }, thread_heuristics::FF_COPY_COST * 2);

    // TODO(#826): Same code as in batch mul
    //  we can mutate rhs but NOT lhs!
    //  output is stored in rhs
    /**
     * @brief Perform point addition rhs[i]=rhs[i]+lhs[i] with batch inversion
     *
     */
    const auto batch_affine_add_chunked =
        [](const affine_element* lhs, affine_element* rhs, const size_t point_count, Fq* personal_scratch_space) {
            Fq batch_inversion_accumulator = Fq::one();

            for (size_t i = 0; i < point_count; i += 1) {
                personal_scratch_space[i] = lhs[i].x + rhs[i].x; // x2 + x1
                rhs[i].x -= lhs[i].x;                            // x2 - x1
                rhs[i].y -= lhs[i].y;                            // y2 - y1
                rhs[i].y *= batch_inversion_accumulator;         // (y2 - y1)*accumulator_old
                batch_inversion_accumulator *= (rhs[i].x);
            }
            batch_inversion_accumulator = batch_inversion_accumulator.invert();

            for (size_t i = (point_count)-1; i < point_count; i -= 1) {
                rhs[i].y *= batch_inversion_accumulator; // update accumulator
                batch_inversion_accumulator *= rhs[i].x;
                rhs[i].x = rhs[i].y.sqr();
                rhs[i].x = rhs[i].x - (personal_scratch_space[i]); // x3 = lambda_squared - x2
                                                                   // - x1
                personal_scratch_space[i] = lhs[i].x - rhs[i].x;
                personal_scratch_space[i] *= rhs[i].y;
                rhs[i].y = personal_scratch_space[i] - lhs[i].y;
            }
        };

    /**
     * @brief Perform batch affine addition in parallel
     *
     */
    const auto batch_affine_add_internal = [&](const affine_element* lhs, affine_element* rhs) {
        parallel_for_heuristic(
            num_points,
            [&](size_t start, size_t end, BB_UNUSED size_t chunk_index) {
                batch_affine_add_chunked(lhs + start, rhs + start, end - start, &scratch_space[0] + start);
            },
            thread_heuristics::FF_ADDITION_COST * 6 + thread_heuristics::FF_MULTIPLICATION_COST * 6);
    };
    batch_affine_add_internal(&second_group[0], &results[0]);
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
    PROFILE_THIS();
    typedef affine_element<Fq, Fr, T> affine_element;
    const size_t num_points = points.size();

    // Space for temporary values
    std::vector<Fq> scratch_space(num_points);

    // TODO(#826): Same code as in batch add
    //  we can mutate rhs but NOT lhs!
    //  output is stored in rhs
    /**
     * @brief Perform point addition rhs[i]=rhs[i]+lhs[i] with batch inversion
     *
     */
    const auto batch_affine_add_chunked =
        [](const affine_element* lhs, affine_element* rhs, const size_t point_count, Fq* personal_scratch_space) {
            Fq batch_inversion_accumulator = Fq::one();

            for (size_t i = 0; i < point_count; i += 1) {
                personal_scratch_space[i] = lhs[i].x + rhs[i].x; // x2 + x1
                rhs[i].x -= lhs[i].x;                            // x2 - x1
                rhs[i].y -= lhs[i].y;                            // y2 - y1
                rhs[i].y *= batch_inversion_accumulator;         // (y2 - y1)*accumulator_old
                batch_inversion_accumulator *= (rhs[i].x);
            }
            batch_inversion_accumulator = batch_inversion_accumulator.invert();

            for (size_t i = (point_count)-1; i < point_count; i -= 1) {
                rhs[i].y *= batch_inversion_accumulator; // update accumulator
                batch_inversion_accumulator *= rhs[i].x;
                rhs[i].x = rhs[i].y.sqr();
                rhs[i].x = rhs[i].x - (personal_scratch_space[i]); // x3 = lambda_squared - x2
                                                                   // - x1
                personal_scratch_space[i] = lhs[i].x - rhs[i].x;
                personal_scratch_space[i] *= rhs[i].y;
                rhs[i].y = personal_scratch_space[i] - lhs[i].y;
            }
        };

    /**
     * @brief Perform batch affine addition in parallel
     *
     */
    const auto batch_affine_add_internal =
        [num_points, &scratch_space, &batch_affine_add_chunked](const affine_element* lhs, affine_element* rhs) {
            parallel_for_heuristic(
                num_points,
                [&](size_t start, size_t end, BB_UNUSED size_t chunk_index) {
                    batch_affine_add_chunked(lhs + start, rhs + start, end - start, &scratch_space[0] + start);
                },
                thread_heuristics::FF_ADDITION_COST * 6 + thread_heuristics::FF_MULTIPLICATION_COST * 6);
        };

    /**
     * @brief Perform point doubling lhs[i]=lhs[i]+lhs[i] with batch inversion
     *
     */
    const auto batch_affine_double_chunked =
        [](affine_element* lhs, const size_t point_count, Fq* personal_scratch_space) {
            Fq batch_inversion_accumulator = Fq::one();

            for (size_t i = 0; i < point_count; i += 1) {

                personal_scratch_space[i] = lhs[i].x.sqr();
                personal_scratch_space[i] =
                    personal_scratch_space[i] + personal_scratch_space[i] + personal_scratch_space[i];

                personal_scratch_space[i] *= batch_inversion_accumulator;

                batch_inversion_accumulator *= (lhs[i].y + lhs[i].y);
            }
            batch_inversion_accumulator = batch_inversion_accumulator.invert();

            Fq temp;
            for (size_t i = (point_count)-1; i < point_count; i -= 1) {

                personal_scratch_space[i] *= batch_inversion_accumulator;
                batch_inversion_accumulator *= (lhs[i].y + lhs[i].y);

                temp = lhs[i].x;
                lhs[i].x = personal_scratch_space[i].sqr() - (lhs[i].x + lhs[i].x);
                lhs[i].y = personal_scratch_space[i] * (temp - lhs[i].x) - lhs[i].y;
            }
        };
    /**
     * @brief Perform point doubling in parallel
     *
     */
    const auto batch_affine_double = [num_points, &scratch_space, &batch_affine_double_chunked](affine_element* lhs) {
        parallel_for_heuristic(
            num_points,
            [&](size_t start, size_t end, BB_UNUSED size_t chunk_index) {
                batch_affine_double_chunked(lhs + start, end - start, &scratch_space[0] + start);
            },
            thread_heuristics::FF_ADDITION_COST * 7 + thread_heuristics::FF_MULTIPLICATION_COST * 6);
    };

    // We compute the resulting point through WNAF by evaluating (the (\sum_i (16ⁱ⋅
    // (a_i ∈ {-15,-13,-11,-9,-7,-5,-3,-1,1,3,5,7,9,11,13,15}))) - skew), where skew is 0 or 1. The result of the sum is
    // always odd and skew is used to reconstruct an even scalar. This means that to construct scalar p-1, where p is
    // the order of the scalar field, we first compute p through the sums and then subtract -1. Howver, since we are
    // computing p⋅Point, we get a point at infinity, which is an edgecase, and we don't want to handle edgecases in the
    // hot loop since the slow the computation down. So it's better to just handle it here.
    if (scalar == -Fr::one()) {
        std::vector<affine_element> results(num_points);
        parallel_for_heuristic(
            num_points, [&](size_t i) { results[i] = -points[i]; }, thread_heuristics::FF_COPY_COST);
        return results;
    }
    // Compute wnaf for scalar
    const Fr converted_scalar = scalar.from_montgomery_form();

    // If the scalar is zero, just set results to the point at infinity
    if (converted_scalar.is_zero()) {
        affine_element result{ Fq::zero(), Fq::zero() };
        result.self_set_infinity();
        std::vector<affine_element> results(num_points);
        parallel_for_heuristic(
            num_points, [&](size_t i) { results[i] = result; }, thread_heuristics::FF_COPY_COST);
        return results;
    }

    constexpr size_t LOOKUP_SIZE = 8;
    constexpr size_t NUM_ROUNDS = 32;
    std::array<std::vector<affine_element>, LOOKUP_SIZE> lookup_table;
    for (auto& table : lookup_table) {
        table.resize(num_points);
    }
    // Initialize first etnries in lookup table
    std::vector<affine_element> temp_point_vector(num_points);
    parallel_for_heuristic(
        num_points,
        [&](size_t i) {
            // If the point is at infinity we fix-up the result later
            // To avoid 'trying to invert zero in the field' we set the point to 'one' here
            temp_point_vector[i] = points[i].is_point_at_infinity() ? affine_element::one() : points[i];
            lookup_table[0][i] = points[i].is_point_at_infinity() ? affine_element::one() : points[i];
        },
        thread_heuristics::FF_COPY_COST * 2);

    // Construct lookup table
    batch_affine_double(&temp_point_vector[0]);
    for (size_t j = 1; j < LOOKUP_SIZE; ++j) {
        parallel_for_heuristic(
            num_points,
            [&](size_t i) { lookup_table[j][i] = lookup_table[j - 1][i]; },
            thread_heuristics::FF_COPY_COST);
        batch_affine_add_internal(&temp_point_vector[0], &lookup_table[j][0]);
    }

    detail::EndoScalars endo_scalars = Fr::split_into_endomorphism_scalars(converted_scalar);
    detail::EndomorphismWnaf<element, NUM_ROUNDS> wnaf{ endo_scalars };

    std::vector<affine_element> work_elements(num_points);

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
        parallel_for_heuristic(
            num_points,
            [&](size_t i) {
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
            },
            (is_odd ? thread_heuristics::FF_MULTIPLICATION_COST : 0) + thread_heuristics::FF_COPY_COST +
                thread_heuristics::FF_ADDITION_COST);
    }
    // First cycle of addition
    batch_affine_add_internal(&temp_point_vector[0], &work_elements[0]);
    // Run through SM logic in wnaf form (excluding the skew)
    for (size_t j = 2; j < NUM_ROUNDS * 2; ++j) {
        wnaf_entry = wnaf.table[j];
        index = wnaf_entry & 0x0fffffffU;
        sign = static_cast<bool>((wnaf_entry >> 31) & 1);
        const bool is_odd = ((j & 1) == 1);
        if (!is_odd) {
            for (size_t k = 0; k < 4; ++k) {
                batch_affine_double(&work_elements[0]);
            }
        }
        parallel_for_heuristic(
            num_points,
            [&](size_t i) {
                auto to_add = lookup_table[static_cast<size_t>(index)][i];
                to_add.y.self_conditional_negate(sign ^ is_odd);
                if (is_odd) {
                    to_add.x *= beta;
                }
                temp_point_vector[i] = to_add;
            },
            (is_odd ? thread_heuristics::FF_MULTIPLICATION_COST : 0) + thread_heuristics::FF_COPY_COST +
                thread_heuristics::FF_ADDITION_COST);
        batch_affine_add_internal(&temp_point_vector[0], &work_elements[0]);
    }

    // Apply skew for the first endo scalar
    if (wnaf.skew) {
        parallel_for_heuristic(
            num_points,
            [&](size_t i) { temp_point_vector[i] = -lookup_table[0][i]; },
            thread_heuristics::FF_ADDITION_COST + thread_heuristics::FF_COPY_COST);
        batch_affine_add_internal(&temp_point_vector[0], &work_elements[0]);
    }
    // Apply skew for the second endo scalar
    if (wnaf.endo_skew) {
        parallel_for_heuristic(
            num_points,
            [&](size_t i) {
                temp_point_vector[i] = lookup_table[0][i];
                temp_point_vector[i].x *= beta;
            },
            thread_heuristics::FF_MULTIPLICATION_COST + thread_heuristics::FF_COPY_COST);
        batch_affine_add_internal(&temp_point_vector[0], &work_elements[0]);
    }
    // handle points at infinity explicitly
    parallel_for_heuristic(
        num_points,
        [&](size_t i) {
            work_elements[i] = points[i].is_point_at_infinity() ? work_elements[i].set_infinity() : work_elements[i];
        },
        thread_heuristics::FF_COPY_COST);

    return work_elements;
}

template <typename Fq, typename Fr, typename T>
void element<Fq, Fr, T>::conditional_negate_affine(const affine_element<Fq, Fr, T>& in,
                                                   affine_element<Fq, Fr, T>& out,
                                                   const uint64_t predicate) noexcept
{
    out = { in.x, predicate ? -in.y : in.y };
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
