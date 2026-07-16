// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "affine_element.hpp"
#include "barretenberg/common/compiler_hints.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include <array>
#include <random>
#include <span>
#include <vector>

namespace bb::group_elements {

/**
 * @brief element class. Implements ecc group arithmetic using Jacobian coordinates
 * See https://hyperelliptic.org/EFD/g1p/auto-shortw-jacobian-0.html#doubling-dbl-2009-l
 *
 * Note: BN254 / Grumpkin G1 have cofactor 1, so on-curve membership coincides with prime-order
 * subgroup membership. BN254 G2 has a non-trivial cofactor; an explicit subgroup check is provided
 * by `affine_element::is_in_prime_subgroup()` and must be applied to externally-supplied G2 bytes
 * (see bbapi). The arithmetic in this file does not rederive subgroup membership and assumes the
 * caller already ensured operands are valid prime-order subgroup elements.
 *
 * @tparam Fq prime field the curve is defined over
 * @tparam Fr prime field whose characteristic equals the size of the prime-order elliptic curve subgroup
 * @tparam Params curve parameters
 */
template <class Fq, class Fr, class Params> class alignas(32) element {
  public:
    static constexpr Fq curve_b = Params::b;

    element() noexcept = default;

    constexpr element(const Fq& a, const Fq& b, const Fq& c) noexcept;
    constexpr element(const element& other) noexcept;
    constexpr element(element&& other) noexcept;
    constexpr element(const affine_element<Fq, Fr, Params>& other) noexcept;
    ~element() noexcept = default;

    static constexpr element one() noexcept { return { Params::one_x, Params::one_y, Fq::one() }; };
    static constexpr element zero() noexcept
    {
        element zero;
        zero.self_set_infinity();
        return zero;
    };

    constexpr element& operator=(const element& other) noexcept;
    constexpr element& operator=(element&& other) noexcept;

    constexpr operator affine_element<Fq, Fr, Params>() const noexcept;

    static element random_element(numeric::RNG* engine = nullptr) noexcept;

    constexpr element dbl() const noexcept;
    constexpr void self_dbl() noexcept;

    constexpr element operator+(const element& other) const noexcept;
    constexpr element operator+(const affine_element<Fq, Fr, Params>& other) const noexcept;
    constexpr element operator+=(const element& other) noexcept;
    constexpr element operator+=(const affine_element<Fq, Fr, Params>& other) noexcept;

    constexpr element operator-(const element& other) const noexcept;
    constexpr element operator-(const affine_element<Fq, Fr, Params>& other) const noexcept;
    constexpr element operator-() const noexcept;
    constexpr element operator-=(const element& other) noexcept;
    constexpr element operator-=(const affine_element<Fq, Fr, Params>& other) noexcept;

    friend constexpr element operator+(const affine_element<Fq, Fr, Params>& left, const element& right) noexcept
    {
        return right + left;
    }
    friend constexpr element operator-(const affine_element<Fq, Fr, Params>& left, const element& right) noexcept
    {
        return -right + left;
    }

    element operator*(const Fr& exponent) const noexcept;
    element operator*=(const Fr& exponent) noexcept;

    /**
     * @brief Constant-time scalar multiplication intended for secret scalars (e.g. ECDSA / Schnorr nonces).
     *
     * Implementation: Montgomery ladder (Montgomery 1987 [1]; SCA-regular form: Joye & Yen,
     * CHES 2002 [2]) over a fixed iteration count, with Coron's first DPA countermeasure
     * (CHES 1999 [3]) applied to the scalar: k' = k + r * n for a fresh random 64-bit r sampled
     * per call. Since n * P = O in the prime-order subgroup, k' * P = k * P; the randomization
     * decorrelates the per-bit timing trace across signings with the same k.
     *
     * [1] P. L. Montgomery, "Speeding the Pollard and Elliptic Curve Methods of Factorization",
     *     Mathematics of Computation 48 (1987), pp. 243-264.
     * [2] M. Joye and S.-M. Yen, "The Montgomery Powering Ladder", CHES 2002, LNCS 2523,
     *     pp. 291-302.
     * [3] J.-S. Coron, "Resistance against Differential Power Analysis for Elliptic Curve
     *     Cryptosystems", CHES 1999, LNCS 1717, pp. 292-302.
     *
     * @param engine Optional RNG for the blinding factor. If nullptr, uses the global RNG.
     *
     * @warning Slower than operator*. Use only when the scalar is secret. For public scalars (MSM,
     *          public arithmetic), prefer operator*.
     */
    element mul_const_time(const Fr& scalar, numeric::RNG* engine = nullptr) const noexcept;

    // If you end up implementing this, congrats, you've solved the DL problem!
    // P.S. This is a joke, don't even attempt! 😂
    // constexpr Fr operator/(const element& other) noexcept {}

    constexpr element normalize() const noexcept;
    constexpr element normalize_const_time() const noexcept;
    constexpr affine_element<Fq, Fr, Params> to_affine_const_time() const noexcept;
    static element infinity();
    BB_INLINE constexpr element set_infinity() const noexcept;
    BB_INLINE constexpr void self_set_infinity() noexcept;
    [[nodiscard]] BB_INLINE constexpr bool is_point_at_infinity() const noexcept;
    [[nodiscard]] BB_INLINE constexpr bool on_curve() const noexcept;
    BB_INLINE constexpr bool operator==(const element& other) const noexcept;

    static void batch_normalize(element* elements, size_t num_elements) noexcept;
    static void batch_affine_add(const std::span<affine_element<Fq, Fr, Params>>& first_group,
                                 const std::span<affine_element<Fq, Fr, Params>>& second_group,
                                 const std::span<affine_element<Fq, Fr, Params>>& results) noexcept;

    /**
     * @brief Straus-style multi-scalar multiplication.
     * @details Computes Σ_i scalars[i] * points[i], efficient when num points is small (~64 or less)
     */
    static element straus_msm(std::span<const affine_element<Fq, Fr, Params>> points,
                              std::span<const Fr> scalars) noexcept;
    static std::vector<affine_element<Fq, Fr, Params>> batch_mul_with_endomorphism(
        const std::span<const affine_element<Fq, Fr, Params>>& points, const Fr& scalar) noexcept;

    /**
     * @brief Multi-scalar multiplication: compute sum_i(scalars[i] * points[i])
     * @details Delegates to affine_element::batch_mul. Provided for interface compatibility with stdlib.
     */
    static affine_element<Fq, Fr, Params> batch_mul(std::span<const affine_element<Fq, Fr, Params>> points,
                                                    std::span<Fr> scalars,
                                                    size_t max_num_bits = 0,
                                                    bool with_edgecases = true,
                                                    const Fr& masking_scalar = Fr(1)) noexcept
    {
        return affine_element<Fq, Fr, Params>::batch_mul(points, scalars, max_num_bits, with_edgecases, masking_scalar);
    }

    Fq x;
    Fq y;
    Fq z;

  private:
    // For test access to mul_without_endomorphism
    friend class TestElementPrivate;
    element mul_without_endomorphism(const Fr& scalar) const noexcept;
    element mul_with_endomorphism(const Fr& scalar) const noexcept;

    template <typename = typename std::enable_if<Params::can_hash_to_curve>>
    static element random_coordinates_on_curve(numeric::RNG* engine = nullptr) noexcept;

    friend std::ostream& operator<<(std::ostream& os, const element& a)
    {
        os << "{ " << a.x << ", " << a.y << ", " << a.z << " }";
        return os;
    }
};

template <class Fq, class Fr, class Params> std::ostream& operator<<(std::ostream& os, element<Fq, Fr, Params> const& e)
{
    return os << "x:" << e.x << " y:" << e.y << " z:" << e.z;
}

} // namespace bb::group_elements

#include "./element_impl.hpp"
