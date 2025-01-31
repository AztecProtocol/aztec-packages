#pragma once

#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/claim_batcher.hpp"
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
template <class Fr> inline std::vector<Fr> powers_of_evaluation_challenge(const Fr r, const size_t num_squares)
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
    using Commitment = typename Curve::AffineElement;
    using Polynomial = bb::Polynomial<Fr>;
    using Claim = ProverOpeningClaim<Curve>;

  public:
    /**
     * @brief Class responsible for computation of the batched multilinear polynomials required by the Gemini protocol
     * @details Opening multivariate polynomials using Gemini requires the computation of three batched polynomials. The
     * first, here denoted A₀, is a linear combination of all polynomials to be opened. If we denote the linear
     * combinations (based on challenge rho) of the unshifted and the to-be-shited-by-1 polynomials by F and G,
     * respectively, then A₀ = F + G/X. This polynomial is "folded" in Gemini to produce d-1 univariate polynomials
     * Fold_i, i = 1, ..., d-1. The second and third are the partially evaluated batched polynomials A₀₊ = F + G/r, and
     * A₀₋ = F - G/r. These are required in order to prove the opening of shifted polynomials G_i/X from the commitments
     * to their unshifted counterparts G_i.
     * @note TODO(https://github.com/AztecProtocol/barretenberg/issues/1223): There are certain operations herein that
     * could be made more efficient by e.g. reusing already initialized polynomials, possibly at the expense of clarity.
     */
    class PolynomialBatcher {

        size_t full_batched_size = 0; // size of the full batched polynomial (generally the circuit size)
        bool batched_unshifted_initialized = false;

        Polynomial random_polynomial; // random polynomial used for ZK
        bool has_random_polynomial = false;

        RefVector<Polynomial> unshifted;            // set of unshifted polynomials
        RefVector<Polynomial> to_be_shifted_by_one; // set of polynomials to be left shifted by 1

        Polynomial batched_unshifted;            // linear combination of unshifted polynomials
        Polynomial batched_to_be_shifted_by_one; // linear combination of to-be-shifted polynomials

      public:
        PolynomialBatcher(const size_t full_batched_size)
            : full_batched_size(full_batched_size)
            , batched_unshifted(full_batched_size)
            , batched_to_be_shifted_by_one(Polynomial::shiftable(full_batched_size))
        {}

        bool has_unshifted() const { return unshifted.size() > 0; }
        bool has_to_be_shifted_by_one() const { return to_be_shifted_by_one.size() > 0; }

        // Set references to the polynomials to be batched
        void set_unshifted(RefVector<Polynomial> polynomials) { unshifted = polynomials; }
        void set_to_be_shifted_by_one(RefVector<Polynomial> polynomials) { to_be_shifted_by_one = polynomials; }

        // Initialize the random polynomial used to add randomness to the batched polynomials for ZK
        void set_random_polynomial(Polynomial&& random)
        {
            has_random_polynomial = true;
            random_polynomial = random;
        }

        /**
         * @brief Compute batched polynomial A₀ = F + G/X as the linear combination of all polynomials to be opened
         * @details If the random polynomial is set, it is added to the batched polynomial for ZK
         *
         * @param challenge batching challenge
         * @param running_scalar power of the batching challenge
         * @return Polynomial A₀
         */
        Polynomial compute_batched(const Fr& challenge, Fr& running_scalar)
        {
            // lambda for batching polynomials; updates the running scalar in place
            auto batch = [&](Polynomial& batched, const RefVector<Polynomial>& polynomials_to_batch) {
                for (auto& poly : polynomials_to_batch) {
                    batched.add_scaled(poly, running_scalar);
                    running_scalar *= challenge;
                }
            };

            Polynomial full_batched(full_batched_size);

            // if necessary, add randomness to the full batched polynomial for ZK
            if (has_random_polynomial) {
                full_batched += random_polynomial;
            }

            // compute the linear combination F of the unshifted polynomials
            if (has_unshifted()) {
                batch(batched_unshifted, unshifted);
                full_batched += batched_unshifted; // A₀ = F
            }

            // compute the linear combination G of the to-be-shifted polynomials
            if (has_to_be_shifted_by_one()) {
                batch(batched_to_be_shifted_by_one, to_be_shifted_by_one);
                full_batched += batched_to_be_shifted_by_one.shifted(); // A₀ = F + G/X
            }

            return full_batched;
        }

        /**
         * @brief Compute partially evaluated batched polynomials A₀(X, r) = A₀₊ = F + G/r, A₀(X, -r) = A₀₋ = F - G/r
         * @details If the random polynomial is set, it is added to each batched polynomial for ZK
         *
         * @param r_challenge partial evaluation challenge
         * @return std::pair<Polynomial, Polynomial> {A₀₊, A₀₋}
         */
        std::pair<Polynomial, Polynomial> compute_partially_evaluated_batch_polynomials(const Fr& r_challenge)
        {
            // Initialize A₀₊ and compute A₀₊ += Random and A₀₊ += F as necessary
            Polynomial A_0_pos(full_batched_size); // A₀₊

            if (has_random_polynomial) {
                A_0_pos += random_polynomial; // A₀₊ += random
            }
            if (has_unshifted()) {
                A_0_pos += batched_unshifted; // A₀₊ += F
            }

            Polynomial A_0_neg = A_0_pos;

            if (has_to_be_shifted_by_one()) {
                Fr r_inv = r_challenge.invert();       // r⁻¹
                batched_to_be_shifted_by_one *= r_inv; // G = G/r

                A_0_pos += batched_to_be_shifted_by_one; // A₀₊ = F + G/r
                A_0_neg -= batched_to_be_shifted_by_one; // A₀₋ = F - G/r
            }

            return { A_0_pos, A_0_neg };
        };
    };

    static std::vector<Polynomial> compute_fold_polynomials(const size_t log_n,
                                                            std::span<const Fr> multilinear_challenge,
                                                            const Polynomial& A_0);

    static std::pair<Polynomial, Polynomial> compute_partially_evaluated_batch_polynomials(
        const size_t log_n,
        PolynomialBatcher& polynomial_batcher,
        const Fr& r_challenge,
        const std::vector<Polynomial>& batched_groups_to_be_concatenated = {});

    static std::vector<Claim> construct_univariate_opening_claims(const size_t log_n,
                                                                  Polynomial&& A_0_pos,
                                                                  Polynomial&& A_0_neg,
                                                                  std::vector<Polynomial>&& fold_polynomials,
                                                                  const Fr& r_challenge);

    template <typename Transcript>
    static std::vector<Claim> prove(const Fr circuit_size,
                                    PolynomialBatcher& polynomial_batcher,
                                    std::span<Fr> multilinear_challenge,
                                    const std::shared_ptr<CommitmentKey<Curve>>& commitment_key,
                                    const std::shared_ptr<Transcript>& transcript,
                                    RefSpan<Polynomial> concatenated_polynomials = {},
                                    const std::vector<RefVector<Polynomial>>& groups_to_be_concatenated = {},
                                    bool has_zk = false);

}; // namespace bb

template <typename Curve> class GeminiVerifier_ {
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using ClaimBatcher = ClaimBatcher_<Curve>;

  public:
    /**
     * @brief Returns univariate opening claims for the Fold polynomials to be checked later
     *
     * @param multilinear_evaluations the MLE evaluation point u
     * @param batched_evaluation batched evaluation from multivariate evals at the point u
     * @param batched_commitment_unshifted batched commitment to unshifted polynomials
     * @param batched_commitment_to_be_shifted batched commitment to to-be-shifted polynomials
     * @param proof commitments to the m-1 folded polynomials, and alleged evaluations.
     * @param transcript
     * @return Fold polynomial opening claims: (r, A₀(r), C₀₊), (-r, A₀(-r), C₀₋), and
     * (Cⱼ, Aⱼ(-r^{2ʲ}), -r^{2}), j = [1, ..., m-1]
     */
    static std::vector<OpeningClaim<Curve>> reduce_verification(
        std::span<Fr> multilinear_challenge,
        ClaimBatcher& claim_batcher,
        auto& transcript,
        const std::vector<RefVector<Commitment>>& concatenation_group_commitments = {},
        RefSpan<Fr> concatenated_evaluations = {})

    {
        const size_t num_variables = multilinear_challenge.size();

        const size_t N = 1 << num_variables;

        Fr rho = transcript->template get_challenge<Fr>("rho");

        GroupElement batched_commitment_unshifted = GroupElement::zero();
        GroupElement batched_commitment_to_be_shifted = GroupElement::zero();

        Fr batched_evaluation = Fr(0);
        Fr batching_scalar = Fr(1);
        for (auto [eval, comm] :
             zip_view(claim_batcher.get_unshifted().evaluations, claim_batcher.get_unshifted().commitments)) {
            batched_evaluation += eval * batching_scalar;
            batched_commitment_unshifted += comm * batching_scalar;
            batching_scalar *= rho;
        }

        for (auto [eval, comm] :
             zip_view(claim_batcher.get_shifted().evaluations, claim_batcher.get_shifted().commitments)) {
            batched_evaluation += eval * batching_scalar;
            batched_commitment_to_be_shifted += comm * batching_scalar;
            batching_scalar *= rho;
        }

        // Get polynomials Fold_i, i = 1,...,m-1 from transcript
        const std::vector<Commitment> commitments = get_fold_commitments(num_variables, transcript);

        // compute vector of powers of random evaluation point r
        const Fr r = transcript->template get_challenge<Fr>("Gemini:r");
        const std::vector<Fr> r_squares = gemini::powers_of_evaluation_challenge(r, CONST_PROOF_SIZE_LOG_N);

        // Get evaluations a_i, i = 0,...,m-1 from transcript
        const std::vector<Fr> evaluations = get_gemini_evaluations(num_variables, transcript);

        // C₀_r_pos = ∑ⱼ ρʲ⋅[fⱼ] + r⁻¹⋅∑ⱼ ρᵏ⁺ʲ [gⱼ], the commitment to A₀₊
        // C₀_r_neg = ∑ⱼ ρʲ⋅[fⱼ] - r⁻¹⋅∑ⱼ ρᵏ⁺ʲ [gⱼ], the commitment to  A₀₋
        GroupElement C0_r_pos = batched_commitment_unshifted;
        GroupElement C0_r_neg = batched_commitment_unshifted;

        Fr r_inv = r.invert();
        if (!batched_commitment_to_be_shifted.is_point_at_infinity()) {
            batched_commitment_to_be_shifted = batched_commitment_to_be_shifted * r_inv;
            C0_r_pos += batched_commitment_to_be_shifted;
            C0_r_neg -= batched_commitment_to_be_shifted;
        }

        // If verifying the opening for the translator VM, we reconstruct the commitment of the batched concatenated
        // polynomials, partially evaluated in r and -r, using the commitments in the concatenation groups and add their
        // contribution as well to to C₀_r_pos and C₀_r_neg
        ASSERT(concatenated_evaluations.size() == concatenation_group_commitments.size());
        if (!concatenation_group_commitments.empty()) {
            size_t concatenation_group_size = concatenation_group_commitments[0].size();
            // The "real" size of polynomials in concatenation groups (i.e. the number of non-zero values)
            const size_t mini_circuit_size = N / concatenation_group_size;
            Fr current_r_shift_pos = Fr(1);
            Fr current_r_shift_neg = Fr(1);
            const Fr r_pow_minicircuit = r.pow(mini_circuit_size);
            const Fr r_neg_pow_minicircuit = (-r).pow(mini_circuit_size);
            std::vector<Fr> r_shifts_pos;
            std::vector<Fr> r_shifts_neg;
            for (size_t i = 0; i < concatenation_group_size; ++i) {
                r_shifts_pos.emplace_back(current_r_shift_pos);
                r_shifts_neg.emplace_back(current_r_shift_neg);
                current_r_shift_pos *= r_pow_minicircuit;
                current_r_shift_neg *= r_neg_pow_minicircuit;
            }
            size_t j = 0;
            GroupElement batched_concatenated_pos = GroupElement::zero();
            GroupElement batched_concatenated_neg = GroupElement::zero();
            for (auto& concatenation_group_commitment : concatenation_group_commitments) {
                // Compute the contribution from each group j of commitments Gⱼ = {C₀, C₁, C₂, C₃, ...}
                // where s = mini_circuit_size as
                // C₀_r_pos += ∑ᵢ ρᵏ⁺ᵐ⁺ʲ⋅ rⁱˢ ⋅ Cᵢ
                // C₀_r_neg += ∑ᵢ ρᵏ⁺ᵐ⁺ʲ⋅ (-r)ⁱˢ ⋅ Cᵢ
                for (size_t i = 0; i < concatenation_group_size; ++i) {
                    batched_concatenated_pos += concatenation_group_commitment[i] * batching_scalar * r_shifts_pos[i];
                    batched_concatenated_neg += concatenation_group_commitment[i] * batching_scalar * r_shifts_neg[i];
                }
                batched_evaluation += concatenated_evaluations[j] * batching_scalar;
                batching_scalar *= rho;
                j++;
            }

            // Add the contributions from concatenation groups to get the final [A₀₊] and  [A₀₋]
            C0_r_pos += batched_concatenated_pos;
            C0_r_neg += batched_concatenated_neg;
        }

        // Compute evaluation A₀(r)
        auto a_0_pos = compute_gemini_batched_univariate_evaluation(
            num_variables, batched_evaluation, multilinear_challenge, r_squares, evaluations);
        std::vector<OpeningClaim<Curve>> fold_polynomial_opening_claims;
        fold_polynomial_opening_claims.reserve(num_variables + 1);

        // ( [A₀₊], r, A₀(r) )
        fold_polynomial_opening_claims.emplace_back(OpeningClaim<Curve>{ { r, a_0_pos }, C0_r_pos });
        // ( [A₀₋], -r, A₀(-r) )
        fold_polynomial_opening_claims.emplace_back(OpeningClaim<Curve>{ { -r, evaluations[0] }, C0_r_neg });
        for (size_t l = 0; l < num_variables - 1; ++l) {
            // ([A₀₋], −r^{2ˡ}, Aₗ(−r^{2ˡ}) )
            fold_polynomial_opening_claims.emplace_back(
                OpeningClaim<Curve>{ { -r_squares[l + 1], evaluations[l + 1] }, commitments[l] });
        }

        return fold_polynomial_opening_claims;
    }

    static std::vector<Commitment> get_fold_commitments([[maybe_unused]] const size_t log_circuit_size,
                                                        auto& transcript)
    {
        std::vector<Commitment> fold_commitments;
        fold_commitments.reserve(CONST_PROOF_SIZE_LOG_N - 1);
        for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N - 1; ++i) {
            const Commitment commitment =
                transcript->template receive_from_prover<Commitment>("Gemini:FOLD_" + std::to_string(i + 1));
            fold_commitments.emplace_back(commitment);
        }
        return fold_commitments;
    }
    static std::vector<Fr> get_gemini_evaluations([[maybe_unused]] const size_t log_circuit_size, auto& transcript)
    {
        std::vector<Fr> gemini_evaluations;
        gemini_evaluations.reserve(CONST_PROOF_SIZE_LOG_N);

        for (size_t i = 1; i <= CONST_PROOF_SIZE_LOG_N; ++i) {
            const Fr evaluation = transcript->template receive_from_prover<Fr>("Gemini:a_" + std::to_string(i));
            gemini_evaluations.emplace_back(evaluation);
        }
        return gemini_evaluations;
    }

    /**
     * @brief Compute the expected evaluation of the univariate commitment to the batched polynomial.
     *
     * Compute the evaluation \f$ A_0(r) = \sum \rho^i \cdot f_i + \frac{1}{r} \cdot \sum \rho^{i+k} g_i \f$, where \f$
     * k \f$ is the number of "unshifted" commitments.
     *
     * @details Initialize \f$ A_{d}(r) \f$ with the batched evaluation \f$ \sum \rho^i f_i(\vec{u}) + \sum \rho^{i+k}
     * g_i(\vec{u}) \f$. The folding property ensures that
     * \f{align}{
     * A_\ell\left(r^{2^\ell}\right) = (1 - u_{\ell-1}) \cdot \frac{A_{\ell-1}\left(r^{2^{\ell-1}}\right) +
     * A_{\ell-1}\left(-r^{2^{\ell-1}}\right)}{2}
     * + u_{\ell-1} \cdot \frac{A_{\ell-1}\left(r^{2^{\ell-1}}\right) -
     * A_{\ell-1}\left(-r^{2^{\ell-1}}\right)}{2r^{2^{\ell-1}}}
     * \f}
     * Therefore, the verifier can recover \f$ A_0(r) \f$ by solving several linear equations.
     *
     * @param batched_mle_eval The evaluation of the batched polynomial at \f$ (u_0, \ldots, u_{d-1})\f$.
     * @param evaluation_point Evaluation point \f$ (u_0, \ldots, u_{d-1}) \f$.
     * @param challenge_powers Powers of \f$ r \f$, \f$ r^2 \), ..., \( r^{2^{m-1}} \f$.
     * @param fold_polynomial_evals  Evaluations \f$ A_{i-1}(-r^{2^{i-1}}) \f$.
     * @return Evaluation \f$ A_0(r) \f$.
     */
    static Fr compute_gemini_batched_univariate_evaluation(
        const size_t num_variables,
        Fr& batched_eval_accumulator,
        std::span<const Fr> evaluation_point, // CONST_PROOF_SIZE
        std::span<const Fr> challenge_powers, // r_squares CONST_PROOF_SIZE_LOG_N
        std::span<const Fr> fold_polynomial_evals)
    {
        const auto& evals = fold_polynomial_evals;

        // Solve the sequence of linear equations
        for (size_t l = CONST_PROOF_SIZE_LOG_N; l != 0; --l) {
            // Get r²⁽ˡ⁻¹⁾
            const Fr& challenge_power = challenge_powers[l - 1];
            // Get uₗ₋₁
            const Fr& u = evaluation_point[l - 1];
            const Fr& eval_neg = evals[l - 1];
            // Get A₍ₗ₋₁₎(−r²⁽ˡ⁻¹⁾)
            // Compute the numerator
            Fr batched_eval_round_acc =
                ((challenge_power * batched_eval_accumulator * 2) - eval_neg * (challenge_power * (Fr(1) - u) - u));
            // Divide by the denominator
            batched_eval_round_acc *= (challenge_power * (Fr(1) - u) + u).invert();

            if constexpr (Curve::is_stdlib_type) {
                auto builder = evaluation_point[0].get_context();
                // TODO(https://github.com/AztecProtocol/barretenberg/issues/1114): insecure dummy_round derivation!
                stdlib::bool_t dummy_round = stdlib::witness_t(builder, l > num_variables);
                batched_eval_accumulator =
                    Fr::conditional_assign(dummy_round, batched_eval_accumulator, batched_eval_round_acc);

            } else {
                if (l <= num_variables) {
                    batched_eval_accumulator = batched_eval_round_acc;
                }
            }
        }

        return batched_eval_accumulator;
    }
};

} // namespace bb
