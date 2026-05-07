// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "./field2_declarations.hpp"

/**
 * @brief Note, this file contains the definitions. of `field2` class.
 *        Declarations are in `field2_declarations.hpp`.
 *        Include ordering ensures linter/language server has knowledge of declarations when parsing definitions
 *
 */
namespace bb {
template <class base, class T> constexpr field2<base, T> field2<base, T>::operator*(const field2& other) const noexcept
{
    // no funny primes please! we assume -1 is not a quadratic residue
    static_assert((base::modulus.data[0] & 0x3UL) == 0x3UL);
    const auto [t1, t2] = base::paired_mul(c0, other.c0, c1, other.c1);
    const base t3 = c0 + c1;
    const base t4 = other.c0 + other.c1;

    return { t1 - t2, t3 * t4 - (t1 + t2) };
}

template <class base, class T> constexpr field2<base, T> field2<base, T>::operator+(const field2& other) const noexcept
{
    return { c0 + other.c0, c1 + other.c1 };
}

template <class base, class T> constexpr field2<base, T> field2<base, T>::operator-(const field2& other) const noexcept
{
    return { c0 - other.c0, c1 - other.c1 };
}

template <class base, class T> constexpr field2<base, T> field2<base, T>::operator-() const noexcept
{
    return { -c0, -c1 };
}

template <class base, class T> constexpr field2<base, T> field2<base, T>::operator/(const field2& other) const noexcept
{
    return operator*(other.invert());
}

template <class base, class T> constexpr field2<base, T> field2<base, T>::operator*=(const field2& other) noexcept
{
    *this = operator*(other);
    return *this;
}

template <class base, class T> constexpr field2<base, T> field2<base, T>::operator+=(const field2& other) noexcept
{
    *this = operator+(other);
    return *this;
}

template <class base, class T> constexpr field2<base, T> field2<base, T>::operator-=(const field2& other) noexcept
{
    *this = operator-(other);
    return *this;
}

template <class base, class T> constexpr field2<base, T> field2<base, T>::operator/=(const field2& other) noexcept
{
    *this = operator/(other);
    return *this;
}

template <class base, class T> constexpr field2<base, T> field2<base, T>::sqr() const noexcept
{
    const auto [t1, t2] = base::paired_mul(c0, c1, c0 + c1, c0 - c1);
    return { t2, t1 + t1 };
}

template <class base, class T> constexpr void field2<base, T>::self_sqr() noexcept
{
    *this = sqr();
}

// Montgomery form conversions use the reduced variants to ensure each component
// is in canonical form [0, p) rather than the coarse internal representation [0, 2p).
template <class base, class T> constexpr field2<base, T> field2<base, T>::to_montgomery_form() const noexcept
{
    field2 result = *this;
    result.self_to_montgomery_form();
    return result;
}

template <class base, class T> constexpr field2<base, T> field2<base, T>::from_montgomery_form() const noexcept
{
    field2 result = *this;
    result.self_from_montgomery_form();
    return result;
}

template <class base, class T> constexpr void field2<base, T>::self_to_montgomery_form() noexcept
{
    const auto [n0, n1] = base::paired_to_montgomery_form_reduced(c0, c1);
    c0 = n0;
    c1 = n1;
}

template <class base, class T> constexpr void field2<base, T>::self_from_montgomery_form() noexcept
{
    const auto [n0, n1] = base::paired_from_montgomery_form_reduced(c0, c1);
    c0 = n0;
    c1 = n1;
}

template <class base, class T> constexpr field2<base, T> field2<base, T>::reduce_once() const noexcept
{
    return { c0.reduce_once(), c1.reduce_once() };
}

template <class base, class T> constexpr void field2<base, T>::self_reduce_once() noexcept
{
    c0.self_reduce_once();
    c1.self_reduce_once();
}

template <class base, class T> constexpr void field2<base, T>::self_neg() noexcept
{
    c0.self_neg();
    c1.self_neg();
}

template <class base, class T> constexpr field2<base, T> field2<base, T>::pow(const uint256_t& exponent) const noexcept
{

    field2 accumulator = *this;
    field2 to_mul = *this;
    const uint64_t maximum_set_bit = exponent.get_msb();

    for (int i = static_cast<int>(maximum_set_bit) - 1; i >= 0; --i) {
        accumulator.self_sqr();
        if (exponent.get_bit(static_cast<uint64_t>(i))) {
            accumulator *= to_mul;
        }
    }

    if (*this == zero()) {
        accumulator = zero();
    } else if (exponent == uint256_t(0)) {
        accumulator = one();
    }
    return accumulator;
}

template <class base, class T> constexpr field2<base, T> field2<base, T>::pow(const uint64_t exponent) const noexcept
{
    return pow({ exponent, 0, 0, 0 });
}

template <class base, class T> constexpr field2<base, T> field2<base, T>::invert() const noexcept
{
    const auto [s0, s1] = base::paired_sqr(c0, c1);
    const base t3 = (s0 + s1).invert();
    const auto [m0, m1] = base::paired_mul(c0, t3, c1, t3);
    return { m0, -m1 };
}

template <class base, class T>
constexpr void field2<base, T>::self_conditional_negate(const uint64_t predicate) noexcept
{
    *this = predicate != 0U ? -(*this) : *this;
}

template <class base, class T> constexpr void field2<base, T>::self_set_msb() noexcept
{
    c0.data[3] = 0ULL | (1ULL << 63ULL);
}

template <class base, class T> constexpr bool field2<base, T>::is_msb_set() const noexcept
{
    return (c0.data[3] >> 63ULL) == 1ULL;
}

template <class base, class T> constexpr uint64_t field2<base, T>::is_msb_set_word() const noexcept
{
    return (c0.data[3] >> 63ULL);
}

template <class base, class T> constexpr bool field2<base, T>::is_zero() const noexcept
{
    return (c0.is_zero() && c1.is_zero());
}

template <class base, class T> constexpr bool field2<base, T>::operator==(const field2& other) const noexcept
{
    return (c0 == other.c0) && (c1 == other.c1);
}

template <class base, class T> constexpr field2<base, T> field2<base, T>::frobenius_map() const noexcept
{
    return { c0, -c1 };
}

template <class base, class T> constexpr void field2<base, T>::self_frobenius_map() noexcept
{
    c1.self_neg();
}

template <class base, class T> field2<base, T> field2<base, T>::random_element(numeric::RNG* engine)
{
    return { base::random_element(engine), base::random_element(engine) };
}
} // namespace bb