// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Khashayar], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/claim_batcher.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/transcript/transcript.hpp"

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
 * The verifier is able to compute the simulated commitments to A₀₊(X) and A₀₋(X)
 * since they are linear-combinations of the commitments [fⱼ] and [gⱼ].
 */
namespace bb {

/**
 * @brief Prover output (evaluation pair, witness) that can be passed on to Shplonk batch opening.
 * @details Evaluation pairs {r, A₀₊(r)}, {-r, A₀₋(-r)}, {r^{2^j}, Aⱼ(r^{2^j)}, {-r^{2^j}, Aⱼ(-r^{2^j)}, j = [1,
 * ..., m-1] and witness (Fold) polynomials
 * [
 *   A₀₊(X) = F(X) + r⁻¹⋅G(X)
 *   A₀₋(X) = F(X) - r⁻¹⋅G(X)
 *   A₁(X) = (1-u₀)⋅even(A₀)(X) + u₀⋅odd(A₀)(X)
 *   ...
 *   Aₘ₋₁(X) = (1-uₘ₋₂)⋅even(Aₘ₋₂)(X) + uₘ₋₂⋅odd(Aₘ₋₂)(X)
 * ]
 * @tparam Curve CommitmentScheme parameters
 */

namespace gemini {
/**
 * @brief Compute powers of challenge ρ
 *
 * @tparam Fr
 * @param rho
 * @param num_powers
 * @return std::vector<Fr>
 */
template <class Fr> inline std::vector<Fr> powers_of_rho(const Fr& rho, const size_t num_powers)
{
    std::vector<Fr> rhos;
    rhos.reserve(num_powers);
    if (num_powers >= 1) {
        rhos.emplace_back(Fr(1));
    }
    for (size_t j = 1; j < num_powers; j++) {
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
template <class Fr> inline std::vector<Fr> powers_of_evaluation_challenge(const Fr& r, const size_t num_squares)
{
    std::vector<Fr> squares;
    squares.reserve(num_squares);
    squares.emplace_back(r);
    for (size_t j = 1; j < num_squares; j++) {
        squares.emplace_back(squares[j - 1].sqr());
    }
    return squares;
};
} // namespace gemini

template <typename Curve> class GeminiProver_ {
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;
    using Polynomial = bb::Polynomial<Fr>;
    using Claim = ProverOpeningClaim<Curve>;

  public:
    /**
     * @brief Class responsible for computation of the batched multilinear polynomials required by the Gemini
     * protocol
     * @details Opening multivariate polynomials using Gemini requires the computation of batched polynomials.
     * The first, here denoted A₀, is a linear combination of all polynomials to be opened. If we denote the linear
     * combinations (based on challenge rho) of the unshifted and to-be-shifted-by-1 polynomials by F and G
     * respectively, then A₀ = F + G/X. This polynomial is "folded" in Gemini to produce d-1 univariate polynomials
     * Fold_i, i = 1, ..., d-1. The second and third are the partially evaluated batched polynomials
     * A₀₊ = F + G/r, and A₀₋ = F - G/r. These are required in order to prove the opening of shifted polynomials
     * G_i/X from the commitments to their unshifted counterparts G_i.
     * @note TODO(https://github.com/AztecProtocol/barretenberg/issues/1223): There are certain operations herein
     * that could be made more efficient by e.g. reusing already initialized polynomials, possibly at the expense of
     * clarity.
     */
    class PolynomialBatcher {

        size_t full_batched_size = 0; // size of the full batched polynomial (generally the circuit size)
        size_t actual_data_size_ = 0; // max end_index across all polynomials (actual data extent)

        Polynomial batched_unshifted;            // linear combination of unshifted polynomials
        Polynomial batched_to_be_shifted_by_one; // linear combination of to-be-shifted polynomials

      public:
        RefVector<Polynomial> unshifted;            // set of unshifted polynomials
        RefVector<Polynomial> to_be_shifted_by_one; // set of polynomials to be left shifted by 1

        PolynomialBatcher(const size_t full_batched_size, const size_t actual_data_size = 0)
            : full_batched_size(full_batched_size)
            , actual_data_size_(actual_data_size == 0 ? full_batched_size : actual_data_size)
            , batched_unshifted(actual_data_size_, full_batched_size)
            , batched_to_be_shifted_by_one(Polynomial::shiftable(actual_data_size_, full_batched_size))
        {}

        bool has_unshifted() const { return unshifted.size() > 0; }
        bool has_to_be_shifted_by_one() const { return to_be_shifted_by_one.size() > 0; }

        // Set references to the polynomials to be batched
        void set_unshifted(RefVector<Polynomial> polynomials) { unshifted = polynomials; }
        void set_to_be_shifted_by_one(RefVector<Polynomial> polynomials) { to_be_shifted_by_one = polynomials; }

        /**
         * @brief Compute batched polynomial A₀ = F + G/X as the linear combination of all polynomials to be opened,
         * where F is the linear combination of the unshifted polynomials and G is the linear combination of the
         * to-be-shifted-by-1 polynomials.
         *
         * @param challenge batching challenge
         * @return Polynomial A₀
         */
        Polynomial compute_batched(const Fr& challenge)
        {
            BB_BENCH_NAME("compute_batched");
            Fr running_scalar(1);

            // Batch base polynomials via a single fused parallel_for over the destination range,
            // amortising N× parallel_for startup overhead into 1×. Updates running_scalar in place.
            auto batch = [&](Polynomial& batched, const RefVector<Polynomial>& polynomials_to_batch) {
                const size_t n = polynomials_to_batch.size();
                std::vector<PolynomialSpan<const Fr>> sources;
                std::vector<Fr> scalars;
                sources.reserve(n);
                scalars.reserve(n);
                for (size_t i = 0; i < n; ++i) {
                    sources.emplace_back(polynomials_to_batch[i]);
                    scalars.push_back(running_scalar);
                    running_scalar *= challenge;
                }
                add_scaled_batch(
                    batched, std::span<const PolynomialSpan<const Fr>>(sources), std::span<const Fr>(scalars));
            };

            Polynomial full_batched(full_batched_size);

            if (has_unshifted()) {
                batch(batched_unshifted, unshifted);
                full_batched += batched_unshifted;
            }

            if (has_to_be_shifted_by_one()) {
                batch(batched_to_be_shifted_by_one, to_be_shifted_by_one);
                full_batched += batched_to_be_shifted_by_one.shifted();
            }

            return full_batched;
        }

        /**
         * @brief Compute partially evaluated batched polynomials A₀(X, r) = A₀₊ = F + G/r, A₀(X, -r) = A₀₋ = F - G/r
         *
         * @param r_challenge partial evaluation challenge
         * @return std::pair<Polynomial, Polynomial> {A₀₊, A₀₋}
         */
        std::pair<Polynomial, Polynomial> compute_partially_evaluated_batch_polynomials(const Fr& r_challenge)
        {
            Polynomial A_0_pos(actual_data_size_, full_batched_size);

            if (has_unshifted()) {
                A_0_pos += batched_unshifted;
            }

            Polynomial A_0_neg = A_0_pos;

            Fr r_inv = r_challenge.invert();
            if (has_to_be_shifted_by_one()) {
                A_0_pos.add_scaled(batched_to_be_shifted_by_one, r_inv);
                A_0_neg.add_scaled(batched_to_be_shifted_by_one, -r_inv);
            }

            return { A_0_pos, A_0_neg };
        };
    };

    static std::vector<Polynomial> compute_fold_polynomials(const size_t log_n,
                                                            std::span<const Fr> multilinear_challenge,
                                                            const Polynomial& A_0);

    static std::vector<Claim> construct_univariate_opening_claims(const size_t log_n,
                                                                  Polynomial&& A_0_pos,
                                                                  Polynomial&& A_0_neg,
                                                                  std::vector<Polynomial>&& fold_polynomials,
                                                                  const Fr& r_challenge);

    template <typename Transcript>
    static std::vector<Claim> prove(size_t circuit_size,
                                    PolynomialBatcher& polynomial_batcher,
                                    std::span<Fr> multilinear_challenge,
                                    const CommitmentKey<Curve>& commitment_key,
                                    const std::shared_ptr<Transcript>& transcript,
                                    bool has_zk = false);

}; // namespace bb

/**
 * @brief Gemini Verifier utility methods used by ShpleminiVerifier
 */
template <typename Curve> class GeminiVerifier_ {
    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;

  public:
    /**
     * @brief Receive the fold commitments from the prover. This method is used by Shplemini where padding may be
     * enabled, i.e. the verifier receives the same number of commitments independent of the actual circuit size.
     *
     * @param virtual_log_n An integer >= log_n
     * @param transcript
     * @return A vector of fold commitments \f$ [A_i] \f$ for \f$ i = 1, \ldots, \text{virtual_log_n}-1\f$.
     */
    static std::vector<Commitment> get_fold_commitments(const size_t virtual_log_n, auto& transcript)
    {
        std::vector<Commitment> fold_commitments;
        fold_commitments.reserve(virtual_log_n - 1);
        for (size_t i = 1; i < virtual_log_n; ++i) {
            const Commitment commitment =
                transcript->template receive_from_prover<Commitment>("Gemini:FOLD_" + std::to_string(i));
            fold_commitments.emplace_back(commitment);
        }
        return fold_commitments;
    }

    /**
     * @brief Receive the fold evaluations from the prover. This method is used by Shplemini where padding may be
     * enabled, i.e. the verifier receives the same number of commitments independent of the actual circuit size.
     *
     * @param virtual_log_n An integer >= log_n
     * @param transcript
     * @return A vector of claimed negative fold evaluation \f$ A_i(-r^{2^i}) \f$  for \f$ i = 0, \ldots,
     * \text{virtual_log_n}-1\f$.
     */
    static std::vector<Fr> get_gemini_evaluations(const size_t virtual_log_n, auto& transcript)
    {
        std::vector<Fr> gemini_evaluations;
        gemini_evaluations.reserve(virtual_log_n);

        for (size_t i = 1; i <= virtual_log_n; ++i) {
            const Fr evaluation = transcript->template receive_from_prover<Fr>("Gemini:a_" + std::to_string(i));
            gemini_evaluations.emplace_back(evaluation);
        }
        return gemini_evaluations;
    }

    /**
     * @brief Compute \f$ A_0(r), A_1(r^2), \ldots, A_{d-1}(r^{2^{d-1}})\f$
     *
     * Recall that \f$ A_0(r) = \sum \rho^i \cdot f_i + \frac{1}{r} \cdot \sum \rho^{i+k} g_i \f$, where \f$
     * k \f$ is the number of "unshifted" commitments. \f$ f_i \f$ are the unshifted polynomials and \f$ g_i \f$ are the
     * to-be-shifted-by-1 polynomials.
     *
     * @details Initialize `a_pos` = \f$ A_{d}(r) \f$ with the batched evaluation \f$ \sum \rho^i f_i(\vec{u}) +
     * \sum
     * \rho^{i+k} g_i(\vec{u}) \f$. The verifier recovers \f$ A_{l-1}(r^{2^{l-1}}) \f$ from the "negative" value \f$
     * A_{l-1}\left(-r^{2^{l-1}}\right) \f$ received from the prover and the value \f$ A_{l}\left(r^{2^{l}}\right)
     * \f$ computed at the previous step. Namely, the verifier computes
     * \f{align}{ A_{l-1}\left(r^{2^{l-1}}\right) =
     * \frac{2 \cdot r^{2^{l-1}} \cdot A_{l}\left(r^{2^l}\right) - A_{l-1}\left( -r^{2^{l-1}} \right)\cdot
     * \left(r^{2^{l-1}} (1-u_{l-1}) - u_{l-1}\right)} {r^{2^{l-1}} (1- u_{l-1}) + u_{l-1}}. \f}
     *
     * @param batched_evaluation The evaluation of the batched polynomial at \f$ (u_0, \ldots, u_{d-1})\f$.
     * @param evaluation_point Evaluation point \f$ (u_0, \ldots, u_{d-1}) \f$. Depending on the context, might be
     * padded to `virtual_log_n` size.
     * @param challenge_powers Powers of \f$ r \f$, \f$ r^2 ,\dots, r^{2^{d-1}} \f$.
     * @param fold_neg_evals  Evaluations \f$ A_{i-1}(-r^{2^{i-1}}) \f$.
     * @return \f$ A_{i}(r^{2^{i}})\f$ for \f$ i = 0, \ldots, \text{virtual_log_n} - 1 \f$.
     */
    static std::vector<Fr> compute_fold_pos_evaluations(const Fr& batched_evaluation,
                                                        std::span<const Fr> evaluation_point, // size = virtual_log_n
                                                        std::span<const Fr> challenge_powers, // size = virtual_log_n
                                                        std::span<const Fr> fold_neg_evals)   // size = virtual_log_n
    {
        const size_t virtual_log_n = evaluation_point.size();

        std::vector<Fr> evals(fold_neg_evals.begin(), fold_neg_evals.end());

        Fr eval_pos_prev = batched_evaluation;

        std::vector<Fr> fold_pos_evaluations;
        fold_pos_evaluations.reserve(virtual_log_n);

        // Solve the sequence of linear equations
        for (size_t l = virtual_log_n; l != 0; --l) {
            // Get r²⁽ˡ⁻¹⁾
            const Fr& challenge_power = challenge_powers[l - 1];
            // Get uₗ₋₁
            const Fr& u = evaluation_point[l - 1];
            // Get A₍ₗ₋₁₎(−r²⁽ˡ⁻¹⁾)
            const Fr& eval_neg = evals[l - 1];
            // Compute the numerator
            Fr eval_pos = ((challenge_power * eval_pos_prev * 2) - eval_neg * (challenge_power * (Fr(1) - u) - u));
            // Divide by the denominator
            eval_pos *= (challenge_power * (Fr(1) - u) + u).invert();

            eval_pos_prev = eval_pos;
            fold_pos_evaluations.emplace_back(eval_pos_prev);
        }

        std::reverse(fold_pos_evaluations.begin(), fold_pos_evaluations.end());

        return fold_pos_evaluations;
    }
};

} // namespace bb
