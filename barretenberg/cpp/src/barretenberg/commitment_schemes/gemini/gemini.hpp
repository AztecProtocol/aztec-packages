#pragma once
#include "../claim.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include <vector>

/**
 * @brief Protocol for opening several multi-linear polynomials at the same point.
 *
 *
 * m = number of variables
 * n = 2ᵐ
 * u = (u₀,...,uₘ₋₁)
 * f₀, …, fₖ₋₁ = multilinear polynomials,
 * g₀, …, gₕ₋₁ = shifted multilinear polynomial,
 *  Each gⱼ is the left-shift of some f↺ᵢ, and gⱼ points to the same memory location as fᵢ.
 * v₀, …, vₖ₋₁, v↺₀, …, v↺ₕ₋₁ = multilinear evalutions s.t. fⱼ(u) = vⱼ, and gⱼ(u) = f↺ⱼ(u) = v↺ⱼ
 *
 * We use a challenge ρ to create a random linear combination of all fⱼ,
 * and actually define A₀ = F + G↺, where
 *   F  = ∑ⱼ ρʲ fⱼ
 *   G  = ∑ⱼ ρᵏ⁺ʲ gⱼ,
 *   G↺ = is the shift of G
 * where fⱼ is normal, and gⱼ is shifted.
 * The evaluations are also batched, and
 *   v  = ∑ ρʲ⋅vⱼ + ∑ ρᵏ⁺ʲ⋅v↺ⱼ = F(u) + G↺(u)
 *
 * The prover then creates the folded polynomials A₀, ..., Aₘ₋₁,
 * and opens them at different points, as univariates.
 *
 * We open A₀ as univariate at r and -r.
 * Since A₀ = F + G↺, but the verifier only has commitments to the gⱼs,
 * we need to partially evaluate A₀ at both evaluation points.
 * As univariate, we have
 *  A₀(X) = F(X) + G↺(X) = F(X) + G(X)/X
 * So we define
 *  - A₀₊(X) = F(X) + G(X)/r
 *  - A₀₋(X) = F(X) − G(X)/r
 * So that A₀₊(r) = A₀(r) and A₀₋(-r) = A₀(-r).
 * The verifier is able to computed the simulated commitments to A₀₊(X) and A₀₋(X)
 * since they are linear-combinations of the commitments [fⱼ] and [gⱼ].
 */
namespace bb {

/**
 * @brief Prover output (evalutation pair, witness) that can be passed on to Shplonk batch opening.
 * @details Evaluation pairs {r, A₀₊(r)}, {-r, A₀₋(-r)}, {-r^{2^j}, Aⱼ(-r^{2^j)}, j = [1, ..., m-1]
 * and witness (Fold) polynomials
 * [
 *   A₀₊(X) = F(X) + r⁻¹⋅G(X)
 *   A₀₋(X) = F(X) - r⁻¹⋅G(X)
 *   A₁(X) = (1-u₀)⋅even(A₀)(X) + u₀⋅odd(A₀)(X)
 *   ...
 *   Aₘ₋₁(X) = (1-uₘ₋₂)⋅even(Aₘ₋₂)(X) + uₘ₋₂⋅odd(Aₘ₋₂)(X)
 * ]
 * @tparam Curve CommitmentScheme parameters
 */
template <typename Curve> struct GeminiProverOutput {
    std::vector<bb::Polynomial<typename Curve::ScalarField>> witnesses;
    std::vector<OpeningPair<Curve>> opening_pairs;
};

namespace gemini {
/**
 * @brief Compute powers of challenge ρ
 *
 * @tparam Fr
 * @param rho
 * @param num_powers
 * @return std::vector<Fr>
 */
template <class Fr> inline std::vector<Fr> powers_of_rho(const Fr rho, const size_t num_powers)
{
    std::vector<Fr> rhos = { Fr(1), rho };
    rhos.reserve(num_powers);
    for (size_t j = 2; j < num_powers; j++) {
        rhos.emplace_back(rhos[j - 1] * rho);
    }
    return rhos;
};

/**
 * @brief Compute squares of folding challenge r
 *
 * @param r
 * @param num_squares The number of foldings
 * @return std::vector<typename Curve::ScalarField>
 */
template <class Fr> inline std::vector<Fr> squares_of_r(const Fr r, const size_t num_squares)
{
    std::vector<Fr> squares = { r };
    squares.reserve(num_squares);
    for (size_t j = 1; j < num_squares; j++) {
        squares.emplace_back(squares[j - 1].sqr());
    }
    return squares;
};
} // namespace gemini

template <typename Curve> class GeminiProver_ {
    using Fr = typename Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

  public:
    static std::vector<Polynomial> compute_gemini_polynomials(std::span<const Fr> mle_opening_point,
                                                              Polynomial&& batched_unshifted,
                                                              Polynomial&& batched_to_be_shifted);

    static std::vector<ProverOpeningClaim<Curve>> compute_fold_polynomial_evaluations(
        std::span<const Fr> mle_opening_point, std::vector<Polynomial>&& gemini_polynomials, const Fr& r_challenge);
}; // namespace bb

/*!
 * @brief Gemini Verifier designed to run in tandem with \ref bb::ShplonkVerifier_< Curve >::verify_gemini "verify
gemini" method of the Shplonk Verifier.
 *
 * @details This verifier obtains the commitments to Prover's folded polynomials \f$ A_1,\ldots, A_{d-1}\f$, where \f$ d
= \text{log_circuit_size}\f$, gets the opening challenge \f$ r \f$, and receives the claimed evaluations \f$ A_1(-r),
\ldots, A_{d-1} (-r^{2^{d-1}})\f$. The output is a tuple consisting of a vector of the  powers of the gemini challenge
\f$(r, r^2, \ldots, r^{2^{d-1}})\f$, the claimed evaluations of \f$ A_i \f$ at corresponding points, and a vector of
commitments \f$(A_1,\ldots, A_{d-1})\f$. The only computation performed at this stage is the computation of the vector
of powers of \f$ r \f$.
 *
 * @tparam Curve
 */
template <typename Curve> class GeminiVerifier_ {
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;

  public:
    /**
     * @brief Returns a tuple of vectors \f$  (r, r^2, \ldots, r^{2^{d-1}} )\f$ , \f$ \left( A_0(-r), A_1(-r^2), \ldots,
     * A_{d-1}(-r^{2^{d-1}}) \right)\f$, \f$ ( \text{com}(A_1), \text{com}(A_2), \ldots, \text{com}(A_{d-1} ) \f$
     *
     * @param log_circuit_size MLE evaluation point u
     * @param r Gemini evaluation challenge.
     * @param transcript verifier's transcript
     */
    static std::tuple<std::vector<Fr>, std::vector<Fr>, std::vector<Commitment>> reduce_efficient_verification(
        const size_t log_circuit_size, // log circuit size
        Fr& r,                         // gemini challenge
        auto& transcript)
    {
        // Get commitments to polynomials A_i, i = 1,...,m-1 from transcript
        std::vector<Commitment> commitments;
        commitments.reserve(log_circuit_size - 1);
        for (size_t i = 0; i < log_circuit_size - 1; ++i) {
            auto commitment =
                transcript->template receive_from_prover<Commitment>("Gemini:FOLD_" + std::to_string(i + 1));
            commitments.emplace_back(commitment);
        }
        // get the Gemini challenge r and compute its powers
        r = transcript->template get_challenge<Fr>("Gemini:r");
        std::vector<Fr> r_squares = gemini::squares_of_r(r, log_circuit_size);
        // get evaluations a_i, i = 0,...,m-1 from transcript
        std::vector<Fr> evaluations;
        evaluations.reserve(log_circuit_size);
        // populate the output tuple
        for (size_t i = 0; i < log_circuit_size; ++i) {
            auto eval = transcript->template receive_from_prover<Fr>("Gemini:a_" + std::to_string(i));
            evaluations.emplace_back(eval);
        }
        return std::make_tuple(r_squares, evaluations, commitments);
    }
};
} // namespace bb