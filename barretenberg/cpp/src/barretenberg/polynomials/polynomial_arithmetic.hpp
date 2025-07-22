// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/common/assert.hpp"
#include "evaluation_domain.hpp"

namespace bb::polynomial_arithmetic {

template <typename T>
concept SupportsFFT = T::Params::has_high_2adicity;

template <typename Fr> struct LagrangeEvaluations {
    Fr vanishing_poly;
    Fr l_start;
    Fr l_end;
};
using lagrange_evaluations = LagrangeEvaluations<fr>;

template <typename Fr> Fr evaluate(const Fr* coeffs, const Fr& z, const size_t n);
template <typename Fr> Fr evaluate(std::span<const Fr> coeffs, const Fr& z, const size_t n)
{
    BB_ASSERT_LTE(n, coeffs.size());
    return evaluate(coeffs.data(), z, n);
};
template <typename Fr> Fr evaluate(std::span<const Fr> coeffs, const Fr& z)
{
    return evaluate(coeffs, z, coeffs.size());
};
template <typename Fr> Fr evaluate(const std::vector<Fr*> coeffs, const Fr& z, const size_t large_n);
template <typename Fr>
void copy_polynomial(const Fr* src, Fr* dest, size_t num_src_coefficients, size_t num_target_coefficients);

//  2. Compute a lookup table of the roots of unity, and suffer through cache misses from nonlinear access patterns
template <typename Fr>
    requires SupportsFFT<Fr>
void fft_inner_parallel(std::vector<Fr*> coeffs,
                        const EvaluationDomain<Fr>& domain,
                        const Fr&,
                        const std::vector<Fr*>& root_table);

template <typename Fr>
    requires SupportsFFT<Fr>
void fft(Fr* coeffs, const EvaluationDomain<Fr>& domain);
template <typename Fr>
    requires SupportsFFT<Fr>
void fft(Fr* coeffs, Fr* target, const EvaluationDomain<Fr>& domain);
template <typename Fr>
    requires SupportsFFT<Fr>
void fft(std::vector<Fr*> coeffs, const EvaluationDomain<Fr>& domain);

template <typename Fr>
    requires SupportsFFT<Fr>
void coset_fft(Fr* coeffs, const EvaluationDomain<Fr>& domain);
template <typename Fr>
    requires SupportsFFT<Fr>
void coset_fft(Fr* coeffs, Fr* target, const EvaluationDomain<Fr>& domain);
template <typename Fr>
    requires SupportsFFT<Fr>
void coset_fft(std::vector<Fr*> coeffs, const EvaluationDomain<Fr>& domain);
template <typename Fr>
    requires SupportsFFT<Fr>
void coset_fft(Fr* coeffs,
               const EvaluationDomain<Fr>& small_domain,
               const EvaluationDomain<Fr>& large_domain,
               const size_t domain_extension);

template <typename Fr>
    requires SupportsFFT<Fr>
void coset_fft_with_constant(Fr* coeffs, const EvaluationDomain<Fr>& domain, const Fr& constant);
template <typename Fr>
    requires SupportsFFT<Fr>
void coset_fft_with_generator_shift(Fr* coeffs, const EvaluationDomain<Fr>& domain, const Fr& constant);

template <typename Fr>
    requires SupportsFFT<Fr>
void ifft(Fr* coeffs, const EvaluationDomain<Fr>& domain);
template <typename Fr>
    requires SupportsFFT<Fr>
void ifft(Fr* coeffs, Fr* target, const EvaluationDomain<Fr>& domain);
template <typename Fr>
    requires SupportsFFT<Fr>
void ifft(std::vector<Fr*> coeffs, const EvaluationDomain<Fr>& domain);

template <typename Fr>
    requires SupportsFFT<Fr>
void ifft_with_constant(Fr* coeffs, const EvaluationDomain<Fr>& domain, const Fr& value);

template <typename Fr>
    requires SupportsFFT<Fr>
void coset_ifft(Fr* coeffs, const EvaluationDomain<Fr>& domain);
template <typename Fr>
    requires SupportsFFT<Fr>
void coset_ifft(std::vector<Fr*> coeffs, const EvaluationDomain<Fr>& domain);

// void populate_with_vanishing_polynomial(Fr* coeffs, const size_t num_non_zero_entries, const EvaluationDomain<Fr>&
// src_domain, const EvaluationDomain<Fr>& target_domain);

template <typename Fr>
    requires SupportsFFT<Fr>
Fr compute_kate_opening_coefficients(const Fr* src, Fr* dest, const Fr& z, const size_t n);

fr compute_barycentric_evaluation(const fr* coeffs,
                                  unsigned long num_coeffs,
                                  const fr& z,
                                  const EvaluationDomain<fr>& domain);

// This function computes sum of all scalars in a given array.
template <typename Fr> Fr compute_sum(const Fr* src, const size_t n);

// This function computes the polynomial (x - a)(x - b)(x - c)... given n distinct roots (a, b, c, ...).
template <typename Fr> void compute_linear_polynomial_product(const Fr* roots, Fr* dest, const size_t n);

// This function interpolates from points {(z_1, f(z_1)), (z_2, f(z_2)), ...}.
// `src` contains {f(z_1), f(z_2), ...}
template <typename Fr> void compute_interpolation(const Fr* src, Fr* dest, const Fr* evaluation_points, const size_t n);

// This function interpolates from points {(z_1, f(z_1)), (z_2, f(z_2)), ...}
// using a single scalar inversion and Lagrange polynomial interpolation.
// `src` contains {f(z_1), f(z_2), ...}
template <typename Fr>
void compute_efficient_interpolation(const Fr* src, Fr* dest, const Fr* evaluation_points, const size_t n);

/**
 * @brief Divides p(X) by (X-r) in-place.
 */
template <typename Fr> void factor_roots(std::span<Fr> polynomial, const Fr& root)
{
    const size_t size = polynomial.size();
    if (root.is_zero()) {
        // if one of the roots is 0 after having divided by all other roots,
        // then p(X) = a₁⋅X + ⋯ + aₙ₋₁⋅Xⁿ⁻¹
        // so we shift the array of coefficients to the left
        // and the result is p(X) = a₁ + ⋯ + aₙ₋₁⋅Xⁿ⁻² and we subtract 1 from the size.
        std::copy_n(polynomial.begin() + 1, size - 1, polynomial.begin());
    } else {
        // assume
        //  • r != 0
        //  • (X−r) | p(X)
        //  • q(X) = ∑ᵢⁿ⁻² bᵢ⋅Xⁱ
        //  • p(X) = ∑ᵢⁿ⁻¹ aᵢ⋅Xⁱ = (X-r)⋅q(X)
        //
        // p(X)         0           1           2       ...     n-2             n-1
        //              a₀          a₁          a₂              aₙ₋₂            aₙ₋₁
        //
        // q(X)         0           1           2       ...     n-2             n-1
        //              b₀          b₁          b₂              bₙ₋₂            0
        //
        // (X-r)⋅q(X)   0           1           2       ...     n-2             n-1
        //              -r⋅b₀       b₀-r⋅b₁     b₁-r⋅b₂         bₙ₋₃−r⋅bₙ₋₂      bₙ₋₂
        //
        // b₀   = a₀⋅(−r)⁻¹
        // b₁   = (a₁ - b₀)⋅(−r)⁻¹
        // b₂   = (a₂ - b₁)⋅(−r)⁻¹
        //      ⋮
        // bᵢ   = (aᵢ − bᵢ₋₁)⋅(−r)⁻¹
        //      ⋮
        // bₙ₋₂ = (aₙ₋₂ − bₙ₋₃)⋅(−r)⁻¹
        // bₙ₋₁ = 0

        // For the simple case of one root we compute (−r)⁻¹ and
        Fr root_inverse = (-root).invert();
        // set b₋₁ = 0
        Fr temp = 0;
        // We start multiplying lower coefficient by the inverse and subtracting those from highter coefficients
        // Since (x - r) should divide the polynomial cleanly, we can guide division with lower coefficients
        for (size_t i = 0; i < size - 1; ++i) {
            // at the start of the loop, temp = bᵢ₋₁
            // and we can compute bᵢ   = (aᵢ − bᵢ₋₁)⋅(−r)⁻¹
            temp = (polynomial[i] - temp);
            temp *= root_inverse;
            polynomial[i] = temp;
        }
    }
    polynomial[size - 1] = Fr::zero();
}

} // namespace bb::polynomial_arithmetic
