// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

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
 * The verifier is able to compute the simulated commitments to A₀₊(X) and A₀₋(X)
 * since they are linear-combinations of the commitments [fⱼ] and [gⱼ].
 */
namespace bb {

/**
 * @brief Prover output (evalutation pair, witness) that can be passed on to Shplonk batch opening.
 * @details Evaluation pairs {r, A₀₊(r)}, {-r, A₀₋(-r)}, {r^{2^j}, Aⱼ(r^{2^j)}, {-r^{2^j}, Aⱼ(-r^{2^j)}, j = [1, ...,
 * m-1] and witness (Fold) polynomials
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
     * combinations (based on challenge rho) of the unshifted, to-be-shifted-by-1, and to-be-right-shifted-by-k
     * polynomials by F, G, and H respectively, then A₀ = F + G/X + X^k*H. (Note: 'k' is assumed even and thus a factor
     * (-1)^k in not needed for the evaluation at -r). This polynomial is "folded" in Gemini to produce d-1 univariate
     * polynomials Fold_i, i = 1, ..., d-1. The second and third are the partially evaluated batched polynomials A₀₊ = F
     * + G/r + r^K*H, and A₀₋ = F - G/r + r^K*H. These are required in order to prove the opening of shifted polynomials
     * G_i/X, X^k*H_i and from the commitments to their unshifted counterparts G_i and H_i.
     * @note TODO(https://github.com/AztecProtocol/barretenberg/issues/1223): There are certain operations herein that
     * could be made more efficient by e.g. reusing already initialized polynomials, possibly at the expense of clarity.
     */
    class PolynomialBatcher {

        size_t full_batched_size = 0; // size of the full batched polynomial (generally the circuit size)
        bool batched_unshifted_initialized = false;

        Polynomial random_polynomial; // random polynomial used for ZK
        bool has_random_polynomial = false;

        RefVector<Polynomial> unshifted;                             // set of unshifted polynomials
        RefVector<Polynomial> to_be_shifted_by_one;                  // set of polynomials to be left shifted by 1
        RefVector<Polynomial> to_be_shifted_by_k;                    // set of polynomials to be right shifted by k
        RefVector<Polynomial> interleaved;                           // the interleaved polynomials used in Translator
        std::vector<RefVector<Polynomial>> groups_to_be_interleaved; // groups of polynomials to be interleaved

        size_t k_shift_magnitude = 0; // magnitude of right-shift-by-k (assumed even)

        Polynomial batched_unshifted;            // linear combination of unshifted polynomials
        Polynomial batched_to_be_shifted_by_one; // linear combination of to-be-shifted polynomials
        Polynomial batched_to_be_shifted_by_k;   // linear combination of to-be-shifted-by-k polynomials
        Polynomial batched_interleaved;          // linear combination of interleaved polynomials
        // linear combination of the groups to be interleaved where polynomial i in the batched group is obtained by
        // linearly combining the i-th polynomial in each group
        std::vector<Polynomial> batched_group;

      public:
        PolynomialBatcher(const size_t full_batched_size)
            : full_batched_size(full_batched_size)
            , batched_unshifted(full_batched_size)
            , batched_to_be_shifted_by_one(Polynomial::shiftable(full_batched_size))
        {}

        bool has_unshifted() const { return unshifted.size() > 0; }
        bool has_to_be_shifted_by_one() const { return to_be_shifted_by_one.size() > 0; }
        bool has_to_be_shifted_by_k() const { return to_be_shifted_by_k.size() > 0; }
        bool has_interleaved() const { return interleaved.size() > 0; }

        // Set references to the polynomials to be batched
        void set_unshifted(RefVector<Polynomial> polynomials) { unshifted = polynomials; }
        void set_to_be_shifted_by_one(RefVector<Polynomial> polynomials) { to_be_shifted_by_one = polynomials; }
        void set_to_be_shifted_by_k(RefVector<Polynomial> polynomials, const size_t shift_magnitude)
        {
            BB_ASSERT_EQ(
                k_shift_magnitude % 2, static_cast<size_t>(0), "k must be even for the formulas herein to be valid");
            to_be_shifted_by_k = polynomials;
            k_shift_magnitude = shift_magnitude;
        }

        // Initialize the random polynomial used to add randomness to the batched polynomials for ZK
        void set_random_polynomial(Polynomial&& random)
        {
            has_random_polynomial = true;
            random_polynomial = random;
        }

        void set_interleaved(RefVector<Polynomial> results, std::vector<RefVector<Polynomial>> groups)
        {
            // Ensure the Gemini subprotocol for interleaved polynomials operates correctly
            if (groups[0].size() % 2 != 0) {
                throw_or_abort("Group size must be even ");
            }
            interleaved = results;
            groups_to_be_interleaved = groups;
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
                full_batched += random_polynomial; // A₀ += rand
            }

            // compute the linear combination F of the unshifted polynomials
            if (has_unshifted()) {
                batch(batched_unshifted, unshifted);
                full_batched += batched_unshifted; // A₀ += F
            }

            // compute the linear combination G of the to-be-shifted polynomials
            if (has_to_be_shifted_by_one()) {
                batch(batched_to_be_shifted_by_one, to_be_shifted_by_one);
                full_batched += batched_to_be_shifted_by_one.shifted(); // A₀ += G/X
            }

            // compute the linear combination H of the to-be-shifted-by-k polynomials
            if (has_to_be_shifted_by_k()) {
                batched_to_be_shifted_by_k = Polynomial(full_batched_size - k_shift_magnitude, full_batched_size, 0);
                batch(batched_to_be_shifted_by_k, to_be_shifted_by_k);
                full_batched += batched_to_be_shifted_by_k.right_shifted(k_shift_magnitude); // A₀ += X^k * H
            }

            // compute the linear combination of the interleaved polynomials and groups
            if (has_interleaved()) {
                batched_interleaved = Polynomial(full_batched_size);
                for (size_t i = 0; i < groups_to_be_interleaved[0].size(); ++i) {
                    batched_group.push_back(Polynomial(full_batched_size));
                }
                for (size_t i = 0; i < groups_to_be_interleaved.size(); ++i) {
                    batched_interleaved.add_scaled(interleaved[i], running_scalar);
                    for (size_t j = 0; j < groups_to_be_interleaved[0].size(); ++j) {
                        batched_group[j].add_scaled(groups_to_be_interleaved[i][j], running_scalar);
                    }
                    running_scalar *= challenge;
                }
                full_batched += batched_interleaved;
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

            if (has_to_be_shifted_by_k()) {
                Fr r_pow_k = r_challenge.pow(k_shift_magnitude); // r^k
                batched_to_be_shifted_by_k *= r_pow_k;
                A_0_pos += batched_to_be_shifted_by_k; // A₀₊ += r^k * H
            }

            Polynomial A_0_neg = A_0_pos;

            if (has_to_be_shifted_by_one()) {
                Fr r_inv = r_challenge.invert();       // r⁻¹
                batched_to_be_shifted_by_one *= r_inv; // G = G/r

                A_0_pos += batched_to_be_shifted_by_one; // A₀₊ += G/r
                A_0_neg -= batched_to_be_shifted_by_one; // A₀₋ -= G/r
            }

            return { A_0_pos, A_0_neg };
        };
        /**
         * @brief Compute the partially evaluated polynomials P₊(X, r) and P₋(X, -r)
         *
         * @details If the interleaved polynomials are set, the full partially evaluated identites A₀(r) and  A₀(-r)
         * contain the contributions of P₊(r^s) and  P₋(r^s) respectively where s is the size of the interleaved group
         * assumed even. This function computes P₊(X) = ∑ r^i Pᵢ(X) and P₋(X) = ∑ (-r)^i Pᵢ(X) where Pᵢ(X) is the i-th
         * polynomial in the batched group.
         * @param r_challenge partial evaluation challenge
         * @return std::pair<Polynomial, Polynomial> {P₊, P₋}
         */

        std::pair<Polynomial, Polynomial> compute_partially_evaluated_interleaved_polynomial(const Fr& r_challenge)
        {
            Polynomial P_pos(batched_group[0]);
            Polynomial P_neg(batched_group[0]);

            Fr current_r_shift_pos = r_challenge;
            Fr current_r_shift_neg = -r_challenge;
            for (size_t i = 1; i < batched_group.size(); i++) {
                P_pos.add_scaled(batched_group[i], current_r_shift_pos);
                P_neg.add_scaled(batched_group[i], current_r_shift_neg);
                current_r_shift_pos *= r_challenge;
                current_r_shift_neg *= -r_challenge;
            }

            return { P_pos, P_neg };
        }

        size_t get_group_size() { return batched_group.size(); }
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
                                    const CommitmentKey<Curve>& commitment_key,
                                    const std::shared_ptr<Transcript>& transcript,
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
    static std::vector<OpeningClaim<Curve>> reduce_verification(std::span<Fr> multilinear_challenge,
                                                                ClaimBatcher& claim_batcher,
                                                                auto& transcript)

    {
        const size_t log_n = multilinear_challenge.size();
        const bool has_interleaved = claim_batcher.interleaved.has_value();

        const Fr rho = transcript->template get_challenge<Fr>("rho");

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
        const std::vector<Commitment> commitments = get_fold_commitments(log_n, transcript);

        // compute vector of powers of random evaluation point r
        const Fr r = transcript->template get_challenge<Fr>("Gemini:r");
        const std::vector<Fr> r_squares = gemini::powers_of_evaluation_challenge(r, log_n);

        // Get evaluations a_i, i = 0,...,m-1 from transcript
        const std::vector<Fr> evaluations = get_gemini_evaluations(log_n, transcript);

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

        // If verifying the opening for the translator VM, we reconstruct the commitment of the batched interleaved
        // polynomials, "partially evaluated" in r and -r, using the commitments in the interleaved groups
        GroupElement C_P_pos = GroupElement::zero();
        GroupElement C_P_neg = GroupElement::zero();
        if (has_interleaved) {
            size_t interleaved_group_size = claim_batcher.get_groups_to_be_interleaved_size();
            Fr current_r_shift_pos = Fr(1);
            Fr current_r_shift_neg = Fr(1);
            std::vector<Fr> r_shifts_pos;
            std::vector<Fr> r_shifts_neg;
            for (size_t i = 0; i < interleaved_group_size; ++i) {
                r_shifts_pos.emplace_back(current_r_shift_pos);
                r_shifts_neg.emplace_back(current_r_shift_neg);
                current_r_shift_pos *= r;
                current_r_shift_neg *= (-r);
            }

            for (auto [group_commitments, interleaved_evaluation] : zip_view(
                     claim_batcher.get_interleaved().commitments_groups, claim_batcher.get_interleaved().evaluations)) {
                // Compute the contribution from each group j of commitments Gⱼ = {C₀, C₁, C₂, C₃, ..., Cₛ₋₁} where s is
                // assumed even
                // C_P_pos += ∑ᵢ ρᵏ⁺ᵐ⁺ʲ⋅ rⁱ ⋅ Cᵢ
                // C_P_neg += ∑ᵢ ρᵏ⁺ᵐ⁺ʲ⋅ (-r)ⁱ ⋅ Cᵢ
                for (size_t i = 0; i < interleaved_group_size; ++i) {
                    C_P_pos += group_commitments[i] * batching_scalar * r_shifts_pos[i];
                    C_P_neg += group_commitments[i] * batching_scalar * r_shifts_neg[i];
                }
                batched_evaluation += interleaved_evaluation * batching_scalar;
                batching_scalar *= rho;
            }
        }

        Fr p_neg = Fr(0);
        Fr p_pos = Fr(0);
        if (has_interleaved) {
            p_pos = transcript->template receive_from_prover<Fr>("Gemini:P_0_pos");
            p_neg = transcript->template receive_from_prover<Fr>("Gemini:P_0_neg");
        }
        std::vector<Fr> padding_indicator_array(log_n, Fr{ 1 });

        // Compute the evaluations  Aₗ(r^{2ˡ}) for l = 0, ..., m-1
        std::vector<Fr> gemini_fold_pos_evaluations = compute_fold_pos_evaluations(
            padding_indicator_array, batched_evaluation, multilinear_challenge, r_squares, evaluations, p_neg);
        // Extract the evaluation A₀(r) = A₀₊(r) + P₊(r^s)
        auto full_a_0_pos = gemini_fold_pos_evaluations[0];
        std::vector<OpeningClaim<Curve>> fold_polynomial_opening_claims;
        fold_polynomial_opening_claims.reserve(2 * log_n + 2);

        // ( [A₀₊], r, A₀₊(r) )
        fold_polynomial_opening_claims.emplace_back(OpeningClaim<Curve>{ { r, full_a_0_pos - p_pos }, C0_r_pos });
        // ( [A₀₋], -r, A₀-(-r) )
        fold_polynomial_opening_claims.emplace_back(OpeningClaim<Curve>{ { -r, evaluations[0] }, C0_r_neg });
        for (size_t l = 0; l < log_n - 1; ++l) {
            // ([Aₗ], r^{2ˡ}, Aₗ(r^{2ˡ}) )
            fold_polynomial_opening_claims.emplace_back(
                OpeningClaim<Curve>{ { r_squares[l + 1], gemini_fold_pos_evaluations[l + 1] }, commitments[l] });
            // ([Aₗ], −r^{2ˡ}, Aₗ(−r^{2ˡ}) )
            fold_polynomial_opening_claims.emplace_back(
                OpeningClaim<Curve>{ { -r_squares[l + 1], evaluations[l + 1] }, commitments[l] });
        }
        if (has_interleaved) {
            uint32_t interleaved_group_size = claim_batcher.get_groups_to_be_interleaved_size();
            Fr r_pow = r.pow(interleaved_group_size);
            fold_polynomial_opening_claims.emplace_back(OpeningClaim<Curve>{ { r_pow, p_pos }, C_P_pos });
            fold_polynomial_opening_claims.emplace_back(OpeningClaim<Curve>{ { r_pow, p_neg }, C_P_neg });
        }

        return fold_polynomial_opening_claims;
    }

    /**
     * @brief Receive the fold commitments from the prover. This method is used by Shplemini where padding may be
     * enabled, i.e. the verifier receives the same number of commitments independent of the actual circuit size.
     *
     * @param virtual_log_n An integer >= log_n
     * @param transcript
     * @return A vector of fold commitments \f$ [A_i] \f$ for \f$ i = 1, \ldots, \text{virtual_log_n}-1\f$.
     */
    static std::vector<Commitment> get_fold_commitments([[maybe_unused]] const size_t virtual_log_n, auto& transcript)
    {
        std::vector<Commitment> fold_commitments;
        fold_commitments.reserve(virtual_log_n - 1);
        for (size_t i = 0; i < virtual_log_n - 1; ++i) {
            const Commitment commitment =
                transcript->template receive_from_prover<Commitment>("Gemini:FOLD_" + std::to_string(i + 1));
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
     * k \f$ is the number of "unshifted" commitments.
     *
     * @details Initialize `a_pos` = \f$ A_{d}(r) \f$ with the batched evaluation \f$ \sum \rho^i f_i(\vec{u}) + \sum
     * \rho^{i+k} g_i(\vec{u}) \f$. The verifier recovers \f$ A_{l-1}(r^{2^{l-1}}) \f$ from the "negative" value \f$
     * A_{l-1}\left(-r^{2^{l-1}}\right) \f$ received from the prover and the value \f$ A_{l}\left(r^{2^{l}}\right) \f$
     * computed at the previous step. Namely, the verifier computes
     * \f{align}{ A_{l-1}\left(r^{2^{l-1}}\right) =
     * \frac{2 \cdot r^{2^{l-1}} \cdot A_{l}\left(r^{2^l}\right) - A_{l-1}\left( -r^{2^{l-1}} \right)\cdot
     * \left(r^{2^{l-1}} (1-u_{l-1}) - u_{l-1}\right)} {r^{2^{l-1}} (1- u_{l-1}) + u_{l-1}}. \f}
     *
     * In the case of interleaving, the first "negative" evaluation has to be corrected by the contribution from \f$
     * P_{-}(-r^s)\f$, where \f$ s \f$ is the size of the group to be interleaved.
     *
     * This method uses `padding_indicator_array`, whose i-th entry is FF{1} if i < log_n and 0 otherwise.
     * We use these entries to either assign `eval_pos_prev` the value `eval_pos` computed in the current iteration of
     * the loop, or to propagate the batched evaluation of the multilinear polynomials to the next iteration. This
     * ensures the correctnes of the computation of the required positive evaluations.
     *
     * To ensure that dummy evaluations cannot be used to tamper with the final batch_mul result, we multiply dummy
     * positive evaluations by the entries of `padding_indicator_array`.
     *
     * @param padding_indicator_array An array with first log_n entries equal to 1, and the remaining entries are 0.
     * @param batched_evaluation The evaluation of the batched polynomial at \f$ (u_0, \ldots, u_{d-1})\f$.
     * @param evaluation_point Evaluation point \f$ (u_0, \ldots, u_{d-1}) \f$ padded to CONST_PROOF_SIZE_LOG_N.
     * @param challenge_powers Powers of \f$ r \f$, \f$ r^2 \), ..., \( r^{2^{d-1}} \f$.
     * @param fold_neg_evals  Evaluations \f$ A_{i-1}(-r^{2^{i-1}}) \f$.
     * @return \f A_{i}}(r^{2^{i}})\f$ \f$ i = 0, \ldots, \text{virtual_log_n} - 1 \f$.
     */
    static std::vector<Fr> compute_fold_pos_evaluations(std::span<const Fr> padding_indicator_array,
                                                        const Fr& batched_evaluation,
                                                        std::span<const Fr> evaluation_point, // size = virtual_log_n
                                                        std::span<const Fr> challenge_powers, // size = virtual_log_n
                                                        std::span<const Fr> fold_neg_evals,   // size = virtual_log_n
                                                        Fr p_neg = Fr(0))
    {
        const size_t virtual_log_n = evaluation_point.size();

        std::vector<Fr> evals(fold_neg_evals.begin(), fold_neg_evals.end());

        Fr eval_pos_prev = batched_evaluation;

        Fr zero{ 0 };
        if constexpr (Curve::is_stdlib_type) {
            zero.convert_constant_to_fixed_witness(fold_neg_evals[0].get_context());
        }

        std::vector<Fr> fold_pos_evaluations;
        fold_pos_evaluations.reserve(virtual_log_n);

        // Add the contribution of P-((-r)ˢ) to get A_0(-r), which is 0 if there are no interleaved polynomials
        evals[0] += p_neg;
        // Solve the sequence of linear equations
        for (size_t l = virtual_log_n; l != 0; --l) {
            // Get r²⁽ˡ⁻¹⁾
            const Fr& challenge_power = challenge_powers[l - 1];
            // Get uₗ₋₁
            const Fr& u = evaluation_point[l - 1];
            const Fr& eval_neg = evals[l - 1];
            // Get A₍ₗ₋₁₎(−r²⁽ˡ⁻¹⁾)
            // Compute the numerator
            Fr eval_pos = ((challenge_power * eval_pos_prev * 2) - eval_neg * (challenge_power * (Fr(1) - u) - u));
            // Divide by the denominator
            eval_pos *= (challenge_power * (Fr(1) - u) + u).invert();

            // If current index is bigger than log_n, we propagate `batched_evaluation` to the next
            // round.  Otherwise, current `eval_pos` A₍ₗ₋₁₎(−r²⁽ˡ⁻¹⁾) becomes `eval_pos_prev` in the round l-2.
            eval_pos_prev =
                padding_indicator_array[l - 1] * eval_pos + (Fr{ 1 } - padding_indicator_array[l - 1]) * eval_pos_prev;
            // If current index is bigger than log_n, we emplace 0, which is later multiplied against
            // Commitment::one().
            fold_pos_evaluations.emplace_back(padding_indicator_array[l - 1] * eval_pos_prev);
        }

        std::reverse(fold_pos_evaluations.begin(), fold_pos_evaluations.end());

        return fold_pos_evaluations;
    }
};

} // namespace bb
