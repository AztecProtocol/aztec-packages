// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/claim_batcher.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini_impl.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/flavor/repeated_commitments_data.hpp"
#include "barretenberg/sumcheck/zk_sumcheck_data.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

template <typename Curve> class ShpleminiProver_ {
  public:
    using FF = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using Polynomial = bb::Polynomial<FF>;
    using OpeningClaim = ProverOpeningClaim<Curve>;

    using VK = CommitmentKey<Curve>;
    using ShplonkProver = ShplonkProver_<Curve>;
    using GeminiProver = GeminiProver_<Curve>;
    using PolynomialBatcher = GeminiProver::PolynomialBatcher;

    template <typename Transcript>
    static OpeningClaim prove(const FF circuit_size,
                              PolynomialBatcher& polynomial_batcher,
                              std::span<FF> multilinear_challenge,
                              CommitmentKey<Curve>& commitment_key,
                              const std::shared_ptr<Transcript>& transcript,
                              const std::array<Polynomial, NUM_SMALL_IPA_EVALUATIONS>& libra_polynomials = {},
                              const std::vector<Polynomial>& sumcheck_round_univariates = {},
                              const std::vector<std::array<FF, 3>>& sumcheck_round_evaluations = {})
    {
        // While Shplemini is not templated on Flavor, we derive ZK flag this way
        const bool has_zk = (libra_polynomials[0].size() > 0);

        // When padding is enabled, the size of the multilinear challenge may be bigger than the log of `circuit_size`.
        const size_t virtual_log_n = multilinear_challenge.size();

        std::vector<OpeningClaim> opening_claims = GeminiProver::prove(
            circuit_size, polynomial_batcher, multilinear_challenge, commitment_key, transcript, has_zk);
        // Create opening claims for Libra masking univariates and Sumcheck Round Univariates
        std::vector<OpeningClaim> libra_opening_claims;

        if (has_zk) {
            const auto gemini_r = opening_claims[0].opening_pair.challenge;
            libra_opening_claims = compute_libra_opening_claims(gemini_r, libra_polynomials, transcript);
        }

        // Currently, only used in ECCVM.
        std::vector<OpeningClaim> sumcheck_round_claims;

        if (!sumcheck_round_univariates.empty()) {
            sumcheck_round_claims = compute_sumcheck_round_claims(
                circuit_size, multilinear_challenge, sumcheck_round_univariates, sumcheck_round_evaluations);
        }

        return ShplonkProver::prove(
            commitment_key, opening_claims, transcript, libra_opening_claims, sumcheck_round_claims, virtual_log_n);
    };

    /**
     * @brief For ZK Flavors: Evaluate the polynomials used in SmallSubgroupIPA argument, send the evaluations to the
     * verifier, and populate a vector of the opening claims.
     *
     */
    template <typename Transcript>
    static std::vector<OpeningClaim> compute_libra_opening_claims(
        const FF gemini_r,
        const std::array<Polynomial, NUM_SMALL_IPA_EVALUATIONS>& libra_polynomials,
        const std::shared_ptr<Transcript>& transcript)
    {
        OpeningClaim new_claim;

        std::vector<OpeningClaim> libra_opening_claims = {};

        static constexpr FF subgroup_generator = Curve::subgroup_generator;

        std::array<std::string, NUM_SMALL_IPA_EVALUATIONS> libra_eval_labels = {
            "Libra:concatenation_eval", "Libra:shifted_grand_sum_eval", "Libra:grand_sum_eval", "Libra:quotient_eval"
        };
        const std::array<FF, NUM_SMALL_IPA_EVALUATIONS> evaluation_points = {
            gemini_r, gemini_r * subgroup_generator, gemini_r, gemini_r
        };
        for (size_t idx = 0; idx < NUM_SMALL_IPA_EVALUATIONS; idx++) {
            new_claim.polynomial = std::move(libra_polynomials[idx]);
            new_claim.opening_pair.challenge = evaluation_points[idx];
            new_claim.opening_pair.evaluation = new_claim.polynomial.evaluate(evaluation_points[idx]);
            transcript->send_to_verifier(libra_eval_labels[idx], new_claim.opening_pair.evaluation);
            libra_opening_claims.push_back(new_claim);
        }

        return libra_opening_claims;
    }

    /**
     * @brief Create a vector of 3*log_n opening claims for the evaluations of Sumcheck Round Univariates at
     * 0, 1, and a round challenge.
     *
     */
    static std::vector<OpeningClaim> compute_sumcheck_round_claims(
        const FF circuit_size,
        std::span<FF> multilinear_challenge,
        const std::vector<Polynomial>& sumcheck_round_univariates,
        const std::vector<std::array<FF, 3>>& sumcheck_round_evaluations)
    {
        OpeningClaim new_claim;
        std::vector<OpeningClaim> sumcheck_round_claims = {};

        const size_t log_n = numeric::get_msb(static_cast<uint32_t>(circuit_size));
        for (size_t idx = 0; idx < log_n; idx++) {
            const std::vector<FF> evaluation_points = { FF(0), FF(1), multilinear_challenge[idx] };
            size_t eval_idx = 0;
            new_claim.polynomial = std::move(sumcheck_round_univariates[idx]);

            for (auto& eval_point : evaluation_points) {
                new_claim.opening_pair.challenge = eval_point;
                new_claim.opening_pair.evaluation = sumcheck_round_evaluations[idx][eval_idx];
                sumcheck_round_claims.push_back(new_claim);
                eval_idx++;
            }
        }

        return sumcheck_round_claims;
    }
};
/**
 * \brief An efficient verifier for the evaluation proofs of multilinear polynomials and their shifts.
 *
 * \details
 * \subsection Context
 *
 * This Verifier combines verifiers from four protocols:
 * 1. **Batch opening protocol**: Reduces various evaluation claims of multilinear polynomials and their shifts to the
 *    opening claim of a single batched polynomial.
 * 2. **Gemini protocol**: Reduces the batched polynomial opening claim to a claim about openings of Gemini univariate
 *    polynomials.
 * 3. **Shplonk protocol**: Reduces the opening of Gemini univariate polynomials at different points to a single opening
 *    of a batched univariate polynomial. Outputs \f$ \text{shplonk_opening_claim} \f$.
 * 4. **KZG or IPA protocol**: Verifies the evaluation of the univariate batched by Shplonk.
 *
 * **Important Observation**: From step 1 to step 4, the Verifier is not required to hash any results of its group
 * operations. Therefore, they could be performed at the very end, i.e. by the opening protocol of a chosen univariate
 * PCS. Because of this and the shape of the pairing check in Shplonk, various batch_mul calls could be reduced to a
 * single batch_mul call. This way we minimize the number of gates in the resulting recursive verifier circuits and save
 * some group operations in the native setting.
 *
 * \remark The sequence of steps could be performed by performing batching of unshifted and shifted polynomials, feeding
 * it to the existing GeminiVerifier, whose output would be passed to the ShplonkVerifier and then to the reduce_verify
 * method of a chosen PCS. However, it would be less efficient than ShpleminiVerifier in terms of group and field
 * operations.
 *
 * \subsection Implementation
 *
 * The method \ref compute_batch_opening_claim receives commitments to all prover polynomials, their claimed
 * evaluations, the sumcheck challenge, the group element \f$ [1]_1 \f$, and a pointer to the transcript. Its logic
 * could be divided into several steps:
 *
 * 1. Receive most of the challenges and prover data.
 * 2. Run the \ref batch_multivariate_opening_claims method corresponding to step 1 above.
 * 3. Corresponding to step 2 above:
 *    - Run the \ref batch_gemini_claims_received_from_prover method.
 *    - Compute the evaluation of the Gemini batched univariate.
 * 4. Output a \ref bb::BatchOpeningClaim<Curve> "batch opening claim", which is a atriple \f$ (\text{commitments},
 * \text{scalars}, \text{shplonk_evaluation_point}) \f$ that satisfies the following: \f[ \text{batch_mul}
 * (\text{commitments},\ \text{scalars}) = \text{shplonk_opening_claim}.\text{point} \f] and the sizes of 'commitments'
 * and 'scalars' are equal to: \f[
 * \#\text{claimed_evaluations} + \text{log_n} + 2
 * \f]
 *
 * The output triple is either fed to the corresponding \ref bb::KZG< Curve_ >::reduce_verify_batch_opening_claim
 * "KZG method" or \ref bb::IPA< Curve_ >::reduce_verify_batch_opening_claim "IPA method". In the case of KZG, we reduce
 * \f$ 6 \f$ batch_mul calls needed for the verification of the multivariate evaluation claims to the single batch_mul
 * described above. In the case of IPA, the total number of batch_mul calls needed to verify the multivariate evaluation
 * claims is reduced by \f$ 5 \f$.
 *
 */

template <typename Curve> class ShpleminiVerifier_ {
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using VK = VerifierCommitmentKey<Curve>;
    using ShplonkVerifier = ShplonkVerifier_<Curve>;
    using GeminiVerifier = GeminiVerifier_<Curve>;
    using ClaimBatcher = ClaimBatcher_<Curve>;

  public:
    /**
     * @brief Non-padding version of \ref compute_batch_opening_claim. Used by all native verifiers and by recursive
     * Translator and ECCVM verifiers.
     *
     */
    template <typename Transcript>
    static BatchOpeningClaim<Curve> compute_batch_opening_claim(
        std::span<const Fr> padding_indicator_array,
        ClaimBatcher& claim_batcher,
        const std::vector<Fr>& multivariate_challenge,
        const Commitment& g1_identity,
        const std::shared_ptr<Transcript>& transcript,
        const RepeatedCommitmentsData& repeated_commitments = {},
        const bool has_zk = false,
        bool* consistency_checked = nullptr, // TODO(https://github.com/AztecProtocol/barretenberg/issues/1191).
                                             // Shplemini Refactoring: Remove bool pointer
        const std::array<Commitment, NUM_LIBRA_COMMITMENTS>& libra_commitments = {},
        const Fr& libra_univariate_evaluation = Fr{ 0 },
        const std::vector<Commitment>& sumcheck_round_commitments = {},
        const std::vector<std::array<Fr, 3>>& sumcheck_round_evaluations = {})

    {
        const size_t virtual_log_n = multivariate_challenge.size();

        const bool committed_sumcheck = !sumcheck_round_evaluations.empty();

        Fr batched_evaluation = Fr{ 0 };

        // While Shplemini is not templated on Flavor, we derive ZK flag this way
        Commitment hiding_polynomial_commitment;
        if (has_zk) {
            hiding_polynomial_commitment =
                transcript->template receive_from_prover<Commitment>("Gemini:masking_poly_comm");
            batched_evaluation = transcript->template receive_from_prover<Fr>("Gemini:masking_poly_eval");
        }

        // Get the challenge ρ to batch commitments to multilinear polynomials and their shifts
        const Fr gemini_batching_challenge = transcript->template get_challenge<Fr>("rho");

        // Process Gemini transcript data:
        // - Get Gemini commitments (com(A₁), com(A₂), … , com(Aₙ₋₁))
        const std::vector<Commitment> fold_commitments =
            GeminiVerifier::get_fold_commitments(virtual_log_n, transcript);
        // - Get Gemini evaluation challenge for Aᵢ, i = 0, … , d−1
        const Fr gemini_evaluation_challenge = transcript->template get_challenge<Fr>("Gemini:r");

        // - Get evaluations (A₀(−r), A₁(−r²), ... , Aₙ₋₁(−r²⁽ⁿ⁻¹⁾))
        const std::vector<Fr> gemini_fold_neg_evaluations =
            GeminiVerifier::get_gemini_evaluations(virtual_log_n, transcript);

        // Get evaluations of partially evaluated batched interleaved polynomials P₊(rˢ) and P₋((-r)ˢ)
        Fr p_pos = Fr(0);
        Fr p_neg = Fr(0);
        if (claim_batcher.interleaved) {
            p_pos = transcript->template receive_from_prover<Fr>("Gemini:P_pos");
            p_neg = transcript->template receive_from_prover<Fr>("Gemini:P_neg");
        }

        // - Compute vector (r, r², ... , r^{2^{d-1}}), where d = log_n
        const std::vector<Fr> gemini_eval_challenge_powers =
            gemini::powers_of_evaluation_challenge(gemini_evaluation_challenge, virtual_log_n);

        std::array<Fr, NUM_SMALL_IPA_EVALUATIONS> libra_evaluations;
        if (has_zk) {
            libra_evaluations[0] = transcript->template receive_from_prover<Fr>("Libra:concatenation_eval");
            libra_evaluations[1] = transcript->template receive_from_prover<Fr>("Libra:shifted_grand_sum_eval");
            libra_evaluations[2] = transcript->template receive_from_prover<Fr>("Libra:grand_sum_eval");
            libra_evaluations[3] = transcript->template receive_from_prover<Fr>("Libra:quotient_eval");
        }

        // Process Shplonk transcript data:
        // - Get Shplonk batching challenge
        const Fr shplonk_batching_challenge = transcript->template get_challenge<Fr>("Shplonk:nu");

        // Compute the powers of ν that are required for batching Gemini, SmallSubgroupIPA, and committed sumcheck
        // univariate opening claims.
        const std::vector<Fr> shplonk_batching_challenge_powers = compute_shplonk_batching_challenge_powers(
            shplonk_batching_challenge, virtual_log_n, has_zk, committed_sumcheck);
        // - Get the quotient commitment for the Shplonk batching of Gemini opening claims
        const auto Q_commitment = transcript->template receive_from_prover<Commitment>("Shplonk:Q");

        // Start populating the vector (Q, f₀, ... , fₖ₋₁, g₀, ... , gₘ₋₁, com(A₁), ... , com(A_{d-1}), [1]₁) where fᵢ
        // are the k commitments to unshifted polynomials and gⱼ are the m commitments to shifted polynomials
        std::vector<Commitment> commitments{ Q_commitment };

        // Get Shplonk opening point z
        const Fr shplonk_evaluation_challenge = transcript->template get_challenge<Fr>("Shplonk:z");

        // Start computing the scalar to be multiplied by [1]₁
        Fr constant_term_accumulator = Fr(0);

        // Initialize the vector of scalars placing the scalar 1 correposnding to Q_commitment
        std::vector<Fr> scalars;

        scalars.emplace_back(Fr(1));

        // Compute 1/(z − r), 1/(z + r), 1/(z - r²),  1/(z + r²), … , 1/(z - r^{2^{d-1}}), 1/(z + r^{2^{d-1}})
        // These represent the denominators of the summand terms in Shplonk partially evaluated polynomial Q_z
        const std::vector<Fr> inverse_vanishing_evals = ShplonkVerifier::compute_inverted_gemini_denominators(
            shplonk_evaluation_challenge, gemini_eval_challenge_powers);

        // Compute the additional factors to be multiplied with unshifted and shifted commitments when lazily
        // reconstructing the commitment of Q_z
        claim_batcher.compute_scalars_for_each_batch(
            inverse_vanishing_evals, shplonk_batching_challenge, gemini_evaluation_challenge);

        if (has_zk) {
            commitments.emplace_back(hiding_polynomial_commitment);
            scalars.emplace_back(-claim_batcher.get_unshifted_batch_scalar()); // corresponds to ρ⁰
        }

        // Place the commitments to prover polynomials in the commitments vector. Compute the evaluation of the
        // batched multilinear polynomial. Populate the vector of scalars for the final batch mul

        Fr gemini_batching_challenge_power = Fr(1);
        if (has_zk) {
            // ρ⁰ is used to batch the hiding polynomial which has already been added to the commitments vector
            gemini_batching_challenge_power *= gemini_batching_challenge;
        }

        // Compute the Shplonk batching power for the interleaved claims. This is \nu^{d+1} where d = log_n as the
        // interleaved claims are sent after the rest of Gemini fold claims. Add the evaluations of (P₊(rˢ) ⋅ ν^{d+1}) /
        // (z − r^s) and (P₋(rˢ) ⋅ ν^{d+2})/(z − r^s) to the constant term accumulator
        Fr shplonk_batching_pos = Fr{ 0 };
        Fr shplonk_batching_neg = Fr{ 0 };
        if (claim_batcher.interleaved) {
            // Currently, the prover places the Interleaving claims before the Gemini dummy claims.
            // TODO(https://github.com/AztecProtocol/barretenberg/issues/1293): Decouple Gemini from Interleaving.
            const size_t interleaved_pos_index = 2 * virtual_log_n;
            const size_t interleaved_neg_index = interleaved_pos_index + 1;
            shplonk_batching_pos = shplonk_batching_challenge_powers[interleaved_pos_index];
            shplonk_batching_neg = shplonk_batching_challenge_powers[interleaved_neg_index];
            constant_term_accumulator += claim_batcher.interleaved->shplonk_denominator *
                                         (p_pos * shplonk_batching_pos + p_neg * shplonk_batching_neg);
        }
        // Update the commitments and scalars vectors as well as the batched evaluation given the present batches
        claim_batcher.update_batch_mul_inputs_and_batched_evaluation(commitments,
                                                                     scalars,
                                                                     batched_evaluation,
                                                                     gemini_batching_challenge,
                                                                     gemini_batching_challenge_power,
                                                                     shplonk_batching_pos,
                                                                     shplonk_batching_neg);

        // Reconstruct Aᵢ(r²ⁱ) for i=0, ..., d - 1 from the batched evaluation of the multilinear polynomials and
        // Aᵢ(−r²ⁱ) for i = 0, ..., d - 1. In the case of interleaving, we compute A₀(r) as A₀₊(r) + P₊(r^s).
        const std::vector<Fr> gemini_fold_pos_evaluations =
            GeminiVerifier_<Curve>::compute_fold_pos_evaluations(padding_indicator_array,
                                                                 batched_evaluation,
                                                                 multivariate_challenge,
                                                                 gemini_eval_challenge_powers,
                                                                 gemini_fold_neg_evaluations,
                                                                 p_neg);

        // Place the commitments to Gemini fold polynomials Aᵢ in the vector of batch_mul commitments, compute the
        // contributions from Aᵢ(−r²ⁱ) for i=1, … , d − 1 to the constant term accumulator, add corresponding scalars
        // for the batch mul
        batch_gemini_claims_received_from_prover(padding_indicator_array,
                                                 fold_commitments,
                                                 gemini_fold_neg_evaluations,
                                                 gemini_fold_pos_evaluations,
                                                 inverse_vanishing_evals,
                                                 shplonk_batching_challenge_powers,
                                                 commitments,
                                                 scalars,
                                                 constant_term_accumulator);
        const Fr full_a_0_pos = gemini_fold_pos_evaluations[0];
        // Retrieve  the contribution without P₊(r^s)
        Fr a_0_pos = full_a_0_pos - p_pos;
        // Add contributions from A₀₊(r) and  A₀₋(-r) to constant_term_accumulator:
        //  Add  A₀₊(r)/(z−r) to the constant term accumulator
        constant_term_accumulator += a_0_pos * inverse_vanishing_evals[0];
        // Add  A₀₋(-r)/(z+r) to the constant term accumulator
        constant_term_accumulator +=
            gemini_fold_neg_evaluations[0] * shplonk_batching_challenge * inverse_vanishing_evals[1];

        remove_repeated_commitments(commitments, scalars, repeated_commitments, has_zk);

        // For ZK flavors, the sumcheck output contains the evaluations of Libra univariates that submitted to the
        // ShpleminiVerifier, otherwise this argument is set to be empty
        if (has_zk) {
            add_zk_data(virtual_log_n,
                        commitments,
                        scalars,
                        constant_term_accumulator,
                        libra_commitments,
                        libra_evaluations,
                        gemini_evaluation_challenge,
                        shplonk_batching_challenge_powers,
                        shplonk_evaluation_challenge);

            *consistency_checked = SmallSubgroupIPAVerifier<Curve>::check_libra_evaluations_consistency(
                libra_evaluations, gemini_evaluation_challenge, multivariate_challenge, libra_univariate_evaluation);
        }

        // Currently, only used in ECCVM
        if (committed_sumcheck) {
            batch_sumcheck_round_claims(commitments,
                                        scalars,
                                        constant_term_accumulator,
                                        multivariate_challenge,
                                        shplonk_batching_challenge_powers,
                                        shplonk_evaluation_challenge,
                                        sumcheck_round_commitments,
                                        sumcheck_round_evaluations);
        }

        // Finalize the batch opening claim
        commitments.emplace_back(g1_identity);
        scalars.emplace_back(constant_term_accumulator);

        return { commitments, scalars, shplonk_evaluation_challenge };
    };

    /**
     * @brief Place fold polynomial commitments to `commitments` and compute the corresponding scalar multipliers.
     *
     * @details Once the commitments to Gemini "fold" polynomials \f$ A_i \f$ and their negative evaluations, i.e. \f$
     * A_i(-r^{2^i}) \f$, for \f$ i = 1, \ldots, d - 1 \f$, are obtained, and the verifier has reconstructed the
     * positive fold evaluation \f$ A_i(r^{2^i}) \f$ for \f$ i=1, \ldots, d- 1 \f$, it performs the following
     * operations:
     *
     * 1. Moves the vector
     * \f[
     * \left( \text{com}(A_1), \text{com}(A_2), \ldots, \text{com}(A_{d-1}) \right)
     * \f]
     * to the 'commitments' vector.
     *
     * 2. Computes the scalars
     * \f{align}{
     * \frac{\nu^2}{z - r^2} + \frac{\nu^3}{z + r^2},
     * \frac{\nu^4}{z - r^4} + \frac{\nu^5}{z + r^4},
     * \ldots,
     * \frac{\nu^{2 \cdot d} } {z - r^{2^{d-1}}} + \frac{\nu^{2 \cdot d + 1}}{z + r^{2^{d-1}}} \f}
     * and multiplies them against the entries of `padding_indicator_array`. The commitments \f$ [A_1]_1, \ldots,
     * [A_{d-1}]_1 \f$ are multiplied by these scalars in the final `batch_mul` perfomed by KZG or IPA. Since
     * `padding_indicator_array[i]` = 1 for i < log_n, and 0 otherwise, it ensures that the contributions from "dummy"
     * rounds do not affect the final `batch mul`.
     *
     * 3. Accumulates the summands of the constant term:
     * \f{align}{
     * \frac{\nu^{2 i} \cdot A_i\left(r^{2^i} \right)}{z - r^{2^i}} + \frac{\nu^{2 \cdot i+1} \cdot
     * A_i\left(-r^{2^i}\right)}{z+ r^{2^i}} \f} for \f$ i = 1, \ldots, d-1 \f$ and adds them to the
     * 'constant_term_accumulator'.
     *
     * @param padding_indicator_array An array with first log_n entries equal to 1, and the remaining entries are 0.
     * @param fold_commitments A vector containing the commitments to the Gemini fold polynomials \f$ A_i \f$.
     * @param gemini_neg_evaluations The evaluations of Gemini fold polynomials \f$ A_i \f$ at \f$ -r^{2^i} \f$ for \f$
     * i = 0, \ldots, d - 1 \f$.
     * @param gemini_pos_evaluations The evaluations of Gemini fold polynomials \f$ A_i \f$ at \f$ r^{2^i} \f$ for \f$
     * i = 0, \ldots, d - 1 \f$
     * @param inverse_vanishing_evals \f$ 1/(z − r), 1/(z + r), 1/(z - r^2),  1/(z + r^2), \ldots, 1/(z - r^{2^{d-1}}),
     * 1/(z + r^{2^{-1}}) \f$
     * @param shplonk_batching_challenge_powers A vector of powers of \f$ \nu \f$ used to batch all univariate claims.
     * @param commitments Output vector where the commitments to the Gemini fold polynomials will be stored.
     * @param scalars Output vector where the computed scalars will be stored.
     * @param constant_term_accumulator The accumulator for the summands of the Shplonk constant term.
     */
    static void batch_gemini_claims_received_from_prover(std::span<const Fr> padding_indicator_array,
                                                         const std::vector<Commitment>& fold_commitments,
                                                         std::span<const Fr> gemini_neg_evaluations,
                                                         std::span<const Fr> gemini_pos_evaluations,
                                                         std::span<const Fr> inverse_vanishing_evals,
                                                         std::span<const Fr> shplonk_batching_challenge_powers,
                                                         std::vector<Commitment>& commitments,
                                                         std::vector<Fr>& scalars,
                                                         Fr& constant_term_accumulator)
    {
        const size_t virtual_log_n = gemini_neg_evaluations.size();
        // Start from 1, because the commitment to A_0 is reconstructed from the commitments to the multilinear
        // polynomials. The corresponding evaluations are also handled separately.
        for (size_t j = 1; j < virtual_log_n; ++j) {
            // The index of 1/ (z - r^{2^{j}}) in the vector of inverted Gemini denominators
            const size_t pos_index = 2 * j;
            // The index of 1/ (z + r^{2^{j}}) in the vector of inverted Gemini denominators
            const size_t neg_index = 2 * j + 1;

            // Compute the "positive" scaling factor  (ν^{2j}) / (z - r^{2^{j}})
            Fr scaling_factor_pos = shplonk_batching_challenge_powers[pos_index] * inverse_vanishing_evals[pos_index];
            // Compute the "negative" scaling factor  (ν^{2j+1}) / (z + r^{2^{j}})
            Fr scaling_factor_neg = shplonk_batching_challenge_powers[neg_index] * inverse_vanishing_evals[neg_index];

            // Accumulate the const term contribution given by
            // v^{2j} * A_j(r^{2^j}) /(z - r^{2^j}) + v^{2j+1} * A_j(-r^{2^j}) /(z+ r^{2^j})
            constant_term_accumulator +=
                scaling_factor_neg * gemini_neg_evaluations[j] + scaling_factor_pos * gemini_pos_evaluations[j];

            // Place the scaling factor to the 'scalars' vector
            scalars.emplace_back(-padding_indicator_array[j] * (scaling_factor_neg + scaling_factor_pos));
            // Move com(Aᵢ) to the 'commitments' vector
            commitments.emplace_back(std::move(fold_commitments[j - 1]));
        }
    }

    /**
     * @brief Combines scalars of repeating commitments to reduce the number of scalar multiplications performed by the
     * verifier.
     *
     * @details The Shplemini verifier gets the access to multiple groups of commitments, some of which are duplicated
     * because they correspond to polynomials whose shifts also evaluated or used in concatenation groups in
     * Translator. This method combines the scalars associated with these repeating commitments, reducing the total
     * number of scalar multiplications required during the verification.
     *
     * More specifically, the Shplemini verifier receives two or three groups of commitments: get_unshifted() and
     * get_to_be_shifted() in the case of Ultra, Mega, and ECCVM Flavors; and get_unshifted_without_interleaved(),
     * get_to_be_shifted(), and get_groups_to_be_interleaved() in the case of the TranslatorFlavor. The commitments are
     * then placed in this specific order in a BatchOpeningClaim object containing a vector of commitments and a vector
     * of scalars. The ranges with repeated commitments belong to the Flavors. This method iterates over these ranges
     * and sums the scalar multipliers corresponding to the same group element. After combining the scalars, we erase
     * corresponding entries in both vectors.
     *
     */
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1151) Avoid erasing vector elements.
    static void remove_repeated_commitments(std::vector<Commitment>& commitments,
                                            std::vector<Fr>& scalars,
                                            const RepeatedCommitmentsData& repeated_commitments,
                                            bool has_zk)
    {
        // We started populating commitments and scalars by adding Shplonk:Q commitmment and the corresponding scalar
        // factor 1. In the case of ZK, we also added Gemini:masking_poly_comm before populating the vector with
        // commitments to prover polynomials
        const size_t offset = has_zk ? 2 : 1;

        // Extract the indices from the container, which is normally created in a given Flavor
        const size_t& first_range_to_be_shifted_start = repeated_commitments.first_range_to_be_shifted_start + offset;
        const size_t& first_range_shifted_start = repeated_commitments.first_range_shifted_start + offset;
        const size_t& first_range_size = repeated_commitments.first_range_size;

        const size_t& second_range_to_be_shifted_start = repeated_commitments.second_range_to_be_shifted_start + offset;
        const size_t& second_range_shifted_start = repeated_commitments.second_range_shifted_start + offset;
        const size_t& second_range_size = repeated_commitments.second_range_size;

        // Iterate over the first range of to-be-shifted scalars and their shifted counterparts
        for (size_t i = 0; i < first_range_size; i++) {
            size_t idx_to_be_shifted = i + first_range_to_be_shifted_start;
            size_t idx_shifted = i + first_range_shifted_start;
            scalars[idx_to_be_shifted] = scalars[idx_to_be_shifted] + scalars[idx_shifted];
        }

        // Iterate over the second range of to-be-shifted precomputed scalars and their shifted counterparts (if
        // provided)
        for (size_t i = 0; i < second_range_size; i++) {
            size_t idx_to_be_shifted = i + second_range_to_be_shifted_start;
            size_t idx_shifted = i + second_range_shifted_start;
            scalars[idx_to_be_shifted] = scalars[idx_to_be_shifted] + scalars[idx_shifted];
        }

        if (second_range_shifted_start > first_range_shifted_start) {
            // Erase the shifted scalars and commitments from the second range (if provided)
            for (size_t i = 0; i < second_range_size; ++i) {
                scalars.erase(scalars.begin() + static_cast<std::ptrdiff_t>(second_range_shifted_start));
                commitments.erase(commitments.begin() + static_cast<std::ptrdiff_t>(second_range_shifted_start));
            }

            // Erase the shifted scalars and commitments from the first range
            for (size_t i = 0; i < first_range_size; ++i) {
                scalars.erase(scalars.begin() + static_cast<std::ptrdiff_t>(first_range_shifted_start));
                commitments.erase(commitments.begin() + static_cast<std::ptrdiff_t>(first_range_shifted_start));
            }
        } else {
            // Erase the shifted scalars and commitments from the first range
            for (size_t i = 0; i < first_range_size; ++i) {
                scalars.erase(scalars.begin() + static_cast<std::ptrdiff_t>(first_range_shifted_start));
                commitments.erase(commitments.begin() + static_cast<std::ptrdiff_t>(first_range_shifted_start));
            }
            // Erase the shifted scalars and commitments from the second range (if provided)
            for (size_t i = 0; i < second_range_size; ++i) {
                scalars.erase(scalars.begin() + static_cast<std::ptrdiff_t>(second_range_shifted_start));
                commitments.erase(commitments.begin() + static_cast<std::ptrdiff_t>(second_range_shifted_start));
            }
        }
    }

    /**
     * @brief Add the opening data corresponding to Libra masking univariates to the batched opening claim
     *
     * @details After verifying ZK Sumcheck, the verifier has to validate the claims about the evaluations of Libra
     * univariates used to mask Sumcheck round univariates. To minimize the overhead of such openings, we continue
     * the Shplonk batching started in Gemini, i.e. we add new claims multiplied by a suitable power of the Shplonk
     * batching challenge and re-use the evaluation challenge sampled to prove the evaluations of Gemini
     * polynomials.
     *
     * @param commitments
     * @param scalars
     * @param libra_commitments
     * @param libra_univariate_evaluations
     * @param multivariate_challenge
     * @param shplonk_batching_challenge
     * @param shplonk_evaluation_challenge
     */
    static void add_zk_data(const size_t virtual_log_n,
                            std::vector<Commitment>& commitments,
                            std::vector<Fr>& scalars,
                            Fr& constant_term_accumulator,
                            const std::array<Commitment, NUM_LIBRA_COMMITMENTS>& libra_commitments,
                            const std::array<Fr, NUM_SMALL_IPA_EVALUATIONS>& libra_evaluations,
                            const Fr& gemini_evaluation_challenge,
                            const std::vector<Fr>& shplonk_batching_challenge_powers,
                            const Fr& shplonk_evaluation_challenge)

    {
        // add Libra commitments to the vector of commitments
        for (size_t idx = 0; idx < libra_commitments.size(); idx++) {
            commitments.push_back(libra_commitments[idx]);
        }

        // compute corresponding scalars and the correction to the constant term
        std::array<Fr, NUM_SMALL_IPA_EVALUATIONS> denominators;
        std::array<Fr, NUM_SMALL_IPA_EVALUATIONS> batching_scalars;
        // compute Shplonk denominators and invert them
        denominators[0] = Fr(1) / (shplonk_evaluation_challenge - gemini_evaluation_challenge);
        denominators[1] =
            Fr(1) / (shplonk_evaluation_challenge - Fr(Curve::subgroup_generator) * gemini_evaluation_challenge);
        denominators[2] = denominators[0];
        denominators[3] = denominators[0];

        // compute the scalars to be multiplied against the commitments [libra_concatenated], [grand_sum], [grand_sum],
        // and [libra_quotient]
        for (size_t idx = 0; idx < NUM_SMALL_IPA_EVALUATIONS; idx++) {
            Fr scaling_factor = denominators[idx] *
                                shplonk_batching_challenge_powers[2 * virtual_log_n + NUM_INTERLEAVING_CLAIMS + idx];
            batching_scalars[idx] = -scaling_factor;
            constant_term_accumulator += scaling_factor * libra_evaluations[idx];
        }

        // to save a scalar mul, add the sum of the batching scalars corresponding to the big sum evaluations
        scalars.push_back(batching_scalars[0]);
        scalars.push_back(batching_scalars[1] + batching_scalars[2]);
        scalars.push_back(batching_scalars[3]);
    }

    /**
     * @brief Adds the Sumcheck data into the Shplemini BatchOpeningClaim.
     *
     * @details This method computes denominators for the evaluations of Sumcheck Round Unviariates, combines them with
     * powers of the Shplonk batching challenge (\f$\nu\f$), and appends the resulting batched scalar factors to
     * \p scalars. It also updates \p commitments with Sumcheck's round commitments. The \p constant_term_accumulator is
     * incremented by each round's constant term contribution.
     *
     * Specifically, for round \f$i\f$ (with Sumcheck challenge \f$u_i\f$), we define:
     * \f[
     *   \alpha_i^0 = \frac{\nu^{k+3i}}{z}, \quad
     *   \alpha_i^1 = \frac{\nu^{k+3i+1}}{z - 1}, \quad
     *   \alpha_i^2 = \frac{\nu^{k+3i+2}}{z - u_i},
     * \f]
     * where \f$ z\f$ is the Shplonk evaluation challenge, \f$\nu\f$ is the batching challenge, and \f$k\f$ is an
     * offset exponent equal to `num_gemini_claims + NUM_INTERLEAVING_CLAIMS + NUM_LIBRA_EVALATIONS`, where
     * `num_gemini_claims` = `2 * log_n`. Then:
     *
     * - The **batched scalar** appended to \p scalars is
     *   \f[
     *     \text{batched_scaling_factor}_i \;=\;
     *       -\bigl(\alpha_i^0 + \alpha_i^1 + \alpha_i^2\bigr).
     *   \f]
     * - The **constant term** contribution for round \f$i\f$ is
     *   \f[
     *     \text{const_term_contribution}_i \;=\;
     *         \alpha_i^0 \cdot S_i(0)
     *       + \alpha_i^1 \cdot S_i(1)
     *       + \alpha_i^2 \cdot S_i\bigl(u_i\bigr),
     *   \f]
     *   where \f$S_i(x)\f$ denotes the Sumcheck round-\f$i\f$ univariate polynomial. This contribution is added to
     *   \p constant_term_accumulator.
     *
     * @param log_n
     * @param commitments
     * @param scalars
     * @param constant_term_accumulator
     * @param multilinear_challenge
     * @param shplonk_batching_challenge
     * @param shplonk_evaluation_challenge
     * @param sumcheck_round_commitments
     * @param sumcheck_round_evaluations
     */
    static void batch_sumcheck_round_claims(std::vector<Commitment>& commitments,
                                            std::vector<Fr>& scalars,
                                            Fr& constant_term_accumulator,
                                            const std::vector<Fr>& multilinear_challenge,
                                            const std::vector<Fr>& shplonk_batching_challenge_powers,
                                            const Fr& shplonk_evaluation_challenge,
                                            const std::vector<Commitment>& sumcheck_round_commitments,
                                            const std::vector<std::array<Fr, 3>>& sumcheck_round_evaluations)
    {

        std::vector<Fr> denominators = {};

        // The number of Gemini claims is equal to `2 * log_n` and `log_n` is equal to the size of
        // `multilinear_challenge`, as this method is never used with padding.
        const size_t num_gemini_claims = 2 * multilinear_challenge.size();
        // Denominators for the opening claims at 0 and 1. Need to be computed only once as opposed to the claims at the
        // sumcheck round challenges.
        std::array<Fr, 2> const_denominators;

        const_denominators[0] = Fr(1) / (shplonk_evaluation_challenge);
        const_denominators[1] = Fr(1) / (shplonk_evaluation_challenge - Fr{ 1 });

        // Compute the denominators corresponding to the evaluation claims at the round challenges and add the
        // commitments to the sumcheck round univariates to the vector of commitments
        for (const auto& [challenge, comm] : zip_view(multilinear_challenge, sumcheck_round_commitments)) {
            denominators.push_back(shplonk_evaluation_challenge - challenge);
            commitments.push_back(comm);
        }

        // Invert denominators
        if constexpr (!Curve::is_stdlib_type) {
            Fr::batch_invert(denominators);
        } else {
            for (auto& denominator : denominators) {
                denominator = Fr{ 1 } / denominator;
            }
        }

        // Each commitment to a sumcheck round univariate [S_i] is multiplied by the sum of three scalars corresponding
        // to the evaluations at 0, 1, and the round challenge u_i.
        // Compute the power of `shplonk_batching_challenge` to add sumcheck univariate commitments and evaluations to
        // the batch.
        size_t power = num_gemini_claims + NUM_INTERLEAVING_CLAIMS + NUM_SMALL_IPA_EVALUATIONS;
        for (const auto& [eval_array, denominator] : zip_view(sumcheck_round_evaluations, denominators)) {
            // Initialize batched_scalar corresponding to 3 evaluations claims
            Fr batched_scalar = Fr(0);
            Fr const_term_contribution = Fr(0);
            // Compute the contribution from the evaluations at 0 and 1
            for (size_t idx = 0; idx < 2; idx++) {
                Fr current_scaling_factor = const_denominators[idx] * shplonk_batching_challenge_powers[power++];
                batched_scalar -= current_scaling_factor;
                const_term_contribution += current_scaling_factor * eval_array[idx];
            }

            // Compute the contribution from the evaluation at the challenge u_i
            Fr current_scaling_factor = denominator * shplonk_batching_challenge_powers[power++];
            batched_scalar -= current_scaling_factor;
            const_term_contribution += current_scaling_factor * eval_array[2];

            // Update Shplonk constant term accumualator
            constant_term_accumulator += const_term_contribution;
            scalars.push_back(batched_scalar);
        }
    };
};
} // namespace bb
