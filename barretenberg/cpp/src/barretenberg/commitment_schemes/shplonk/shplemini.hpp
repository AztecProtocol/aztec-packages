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
                              const std::shared_ptr<CommitmentKey<Curve>>& commitment_key,
                              const std::shared_ptr<Transcript>& transcript,
                              const std::array<Polynomial, NUM_SMALL_IPA_EVALUATIONS>& libra_polynomials = {},
                              const std::vector<Polynomial>& sumcheck_round_univariates = {},
                              const std::vector<std::array<FF, 3>>& sumcheck_round_evaluations = {})
    {
        // While Shplemini is not templated on Flavor, we derive ZK flag this way
        const bool has_zk = (libra_polynomials[0].size() > 0);

        std::vector<OpeningClaim> opening_claims = GeminiProver::prove(
            circuit_size, polynomial_batcher, multilinear_challenge, commitment_key, transcript, has_zk);
        // Create opening claims for Libra masking univariates and Sumcheck Round Univariates
        OpeningClaim new_claim;
        std::vector<OpeningClaim> libra_opening_claims;

        if (has_zk) {
            const FF& gemini_r = opening_claims[0].opening_pair.challenge;
            libra_opening_claims = compute_libra_opening_claims(gemini_r, libra_polynomials, transcript);
        }

        // Currently, only used in ECCVM.
        std::vector<OpeningClaim> sumcheck_round_claims;

        if (!sumcheck_round_univariates.empty()) {
            sumcheck_round_claims = compute_sumcheck_round_claims(
                circuit_size, multilinear_challenge, sumcheck_round_univariates, sumcheck_round_evaluations);
        }

        // Only used in Translator
        std::array<OpeningClaim, NUM_INTERLEAVING_CLAIMS> interleaving_claims;
        if (polynomial_batcher.has_interleaved()) {
            const FF& gemini_r = opening_claims[0].opening_pair.challenge;
            interleaving_claims = GeminiProver::compute_interleaving_claims(polynomial_batcher, gemini_r, transcript);
        }

        return ShplonkProver::prove(commitment_key,
                                    opening_claims,
                                    transcript,
                                    libra_opening_claims,
                                    sumcheck_round_claims,
                                    interleaving_claims);
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
    template <typename Transcript>
    static BatchOpeningClaim<Curve> compute_batch_opening_claim(
        const Fr N,
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
        ShpleminiVerifierState<Curve> verifier_state;

        const bool committed_sumcheck = !sumcheck_round_evaluations.empty();
        const bool has_interleaving = claim_batcher.interleaved.has_value();

        verifier_state.multilinear_challenge = multivariate_challenge;

        // Extract log_circuit_size

        if constexpr (Curve::is_stdlib_type) {
            verifier_state.log_n = numeric::get_msb(static_cast<uint32_t>(N.get_value()));
        } else {
            verifier_state.log_n = numeric::get_msb(static_cast<uint32_t>(N));
        }

        // When padding is enabled, the size of the multilinear challenge may be bigger than the log of `circuit_size`.
        verifier_state.virtual_log_n = multivariate_challenge.size();

        // While Shplemini is not templated on Flavor, we derive ZK flag this way
        Commitment hiding_polynomial_commitment;
        if (has_zk) {
            hiding_polynomial_commitment =
                transcript->template receive_from_prover<Commitment>("Gemini:masking_poly_comm");
            verifier_state.batched_evaluation =
                transcript->template receive_from_prover<Fr>("Gemini:masking_poly_eval");
        }

        // Get the challenge ρ to batch commitments to multilinear polynomials and their shifts
        verifier_state.gemini_batching_challenge = transcript->template get_challenge<Fr>("rho");

        // Process Gemini transcript data:
        // - Get Gemini commitments (com(A₁), com(A₂), … , com(Aₙ₋₁))
        const std::vector<Commitment> fold_commitments =
            GeminiVerifier::get_fold_commitments(verifier_state.virtual_log_n, transcript);
        // - Get Gemini evaluation challenge for Aᵢ, i = 0, … , d−1
        verifier_state.gemini_evaluation_challenge = transcript->template get_challenge<Fr>("Gemini:r");

        // - Get evaluations (A₀(−r), A₁(−r²), ... , Aₙ₋₁(−r²⁽ⁿ⁻¹⁾))
        const std::vector<Fr> gemini_fold_neg_evaluations =
            GeminiVerifier::get_gemini_evaluations(verifier_state.virtual_log_n, transcript);

        // Get evaluations of partially evaluated batched interleaved polynomials P₊(rˢ) and P₋((-r)ˢ)
        if (claim_batcher.interleaved) {
            verifier_state.p_pos = transcript->template receive_from_prover<Fr>("Gemini:P_pos");
            verifier_state.p_neg = transcript->template receive_from_prover<Fr>("Gemini:P_neg");
        }

        // - Compute vector (r, r², ... , r^{2^{d-1}}), where d = log_n
        const std::vector<Fr> gemini_eval_challenge_powers = gemini::powers_of_evaluation_challenge(
            verifier_state.gemini_evaluation_challenge, verifier_state.virtual_log_n);

        std::array<Fr, NUM_SMALL_IPA_EVALUATIONS> libra_evaluations;
        if (has_zk) {
            libra_evaluations[0] = transcript->template receive_from_prover<Fr>("Libra:concatenation_eval");
            libra_evaluations[1] = transcript->template receive_from_prover<Fr>("Libra:shifted_grand_sum_eval");
            libra_evaluations[2] = transcript->template receive_from_prover<Fr>("Libra:grand_sum_eval");
            libra_evaluations[3] = transcript->template receive_from_prover<Fr>("Libra:quotient_eval");
        }

        // Process Shplonk transcript data:
        // - Get Shplonk batching challenge
        verifier_state.shplonk_batching_challenge = transcript->template get_challenge<Fr>("Shplonk:nu");

        // - Get the quotient commitment for the Shplonk batching of Gemini opening claims
        const auto Q_commitment = transcript->template receive_from_prover<Commitment>("Shplonk:Q");

        // Start populating the vector (Q, f₀, ... , fₖ₋₁, g₀, ... , gₘ₋₁, com(A₁), ... , com(A_{d-1}), [1]₁) where fᵢ
        // are the k commitments to unshifted polynomials and gⱼ are the m commitments to shifted polynomials
        verifier_state.commitments.push_back(Q_commitment);

        // Get Shplonk opening point z
        verifier_state.shplonk_evaluation_challenge = transcript->template get_challenge<Fr>("Shplonk:z");

        // Initialize the vector of scalars placing the scalar 1 correposnding to Q_commitment
        if constexpr (Curve::is_stdlib_type) {
            auto builder = verifier_state.shplonk_batching_challenge.get_context();
            Fr one = Fr(builder, 1);
            one.convert_constant_to_fixed_witness();
            verifier_state.scalars.push_back(one);
        } else {
            verifier_state.scalars.push_back(Fr(1));
        }

        // Compute 1/(z − r), 1/(z + r), 1/(z - r²),  1/(z + r²), … , 1/(z - r^{2^{d-1}}), 1/(z + r^{2^{d-1}})
        // These represent the denominators of the summand terms in Shplonk partially evaluated polynomial Q_z
        const std::vector<Fr> inverse_vanishing_evals = ShplonkVerifier::compute_inverted_gemini_denominators(
            verifier_state.shplonk_evaluation_challenge, gemini_eval_challenge_powers);
        // Compute the Shplonk denominator for the interleaved opening claims 1/(z − r^s) where s is the group size
        if (has_interleaving) {
            Fr interleaving_vanishing_eval =
                (verifier_state.shplonk_evaluation_challenge -
                 verifier_state.gemini_evaluation_challenge.pow(claim_batcher.get_groups_to_be_interleaved_size()))
                    .invert();
            verifier_state.constant_term_accumulator +=
                verifier_state.p_pos * interleaving_vanishing_eval +
                verifier_state.p_neg * interleaving_vanishing_eval * verifier_state.shplonk_batching_challenge;

            verifier_state.interleaving_vanishing_eval = interleaving_vanishing_eval;
        }

        // Compute the additional factors to be multiplied with unshifted and shifted commitments when lazily
        // reconstructing the commitment of Q_z
        claim_batcher.compute_scalars_for_each_batch(inverse_vanishing_evals[0], // 1/(z − r)
                                                     inverse_vanishing_evals[1], // 1/(z + r)
                                                     verifier_state.shplonk_batching_challenge,
                                                     verifier_state.gemini_evaluation_challenge,
                                                     verifier_state.interleaving_vanishing_eval);

        if (has_zk) {
            verifier_state.commitments.emplace_back(hiding_polynomial_commitment);
            verifier_state.scalars.emplace_back(-claim_batcher.get_unshifted_batch_scalar()); // corresponds to ρ⁰

            // ρ⁰ is used to batch the hiding polynomial which has already been added to the commitments vector
            verifier_state.gemini_batching_challenge_power *= verifier_state.gemini_batching_challenge;
        }

        // Place the commitments to prover polynomials in the commitments vector. Compute the evaluation of the
        // batched multilinear polynomial. Populate the vector of scalars for the final batch mul

        // Compute the Shplonk batching power for the interleaved claims. This is \nu^{n+1} where n is the
        // log_circuit_size as the interleaved claims are sent after the rest of Gemini fold claims. Add the evaluations
        // of (P₊(rˢ) ⋅ ν^{n+1}) / (z − r^s) and (P₋(rˢ) ⋅ ν^{n+2})/(z − r^s) to the constant term accumulator
        // Update the commitments and scalars vectors as well as the batched evaluation given the present batches
        claim_batcher.update_batch_mul_inputs_and_batched_evaluation(verifier_state);

        remove_repeated_commitments(verifier_state, repeated_commitments, has_zk);

        // For ZK flavors, the sumcheck output contains the evaluations of Libra univariates that submitted to the
        // ShpleminiVerifier, otherwise this argument is set to be empty
        if (has_zk) {
            add_zk_data(verifier_state, libra_commitments, libra_evaluations);

            *consistency_checked = SmallSubgroupIPAVerifier<Curve>::check_libra_evaluations_consistency(
                libra_evaluations,
                verifier_state.gemini_evaluation_challenge,
                verifier_state.multilinear_challenge,
                libra_univariate_evaluation);
        }

        // Currently, only used in ECCVM
        if (committed_sumcheck) {
            batch_sumcheck_round_claims(verifier_state, sumcheck_round_commitments, sumcheck_round_evaluations);
        }

        // Reconstruct Aᵢ(r²ⁱ) for i=0, ..., n-1 from the batched evaluation of the multilinear polynomials and Aᵢ(−r²ⁱ)
        // for i = 0, ..., n-1.
        // In the case of interleaving, we compute A₀(r) as A₀₊(r) + P₊(r^s).
        const std::vector<Fr> gemini_fold_pos_evaluations =
            GeminiVerifier_<Curve>::compute_fold_pos_evaluations(verifier_state.log_n,
                                                                 verifier_state.batched_evaluation,
                                                                 verifier_state.multilinear_challenge, // virtual_log_n
                                                                 gemini_eval_challenge_powers,         // virtual_log_n
                                                                 gemini_fold_neg_evaluations,
                                                                 verifier_state.p_neg);

        // Place the commitments to Gemini fold polynomials Aᵢ in the vector of batch_mul commitments, compute the
        // contributions from Aᵢ(−r²ⁱ) for i=1, … , n−1 to the constant term accumulator, add corresponding scalars for
        // the batch mul
        batch_gemini_claims_received_from_prover(verifier_state,
                                                 fold_commitments,
                                                 gemini_fold_neg_evaluations,
                                                 gemini_fold_pos_evaluations,
                                                 inverse_vanishing_evals);
        const Fr full_a_0_pos = gemini_fold_pos_evaluations[0];
        // Retrieve  the contribution without P₊(r^s)
        Fr a_0_pos = full_a_0_pos;

        if (has_interleaving) {
            a_0_pos -= verifier_state.p_pos;
        }
        // Add contributions from A₀₊(r) and  A₀₋(-r) to constant_term_accumulator:
        //  Add  A₀₊(r)/(z−r) to the constant term accumulator
        verifier_state.constant_term_accumulator +=
            a_0_pos * verifier_state.shplonk_batching_challenge_power * inverse_vanishing_evals[0];
        verifier_state.shplonk_batching_challenge_power *= verifier_state.shplonk_batching_challenge;
        // Add  A₀₋(-r)/(z+r) to the constant term accumulator
        verifier_state.constant_term_accumulator += gemini_fold_neg_evaluations[0] *
                                                    verifier_state.shplonk_batching_challenge_power *
                                                    inverse_vanishing_evals[1];

        // Finalize the batch opening claim
        verifier_state.commitments.push_back(g1_identity);
        verifier_state.scalars.push_back(verifier_state.constant_term_accumulator);

        return { verifier_state.commitments, verifier_state.scalars, verifier_state.shplonk_evaluation_challenge };
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
     * \frac{\nu^{2 \cdot d} } {z - r^{2^{d-1}}} + \frac{\nu^{2 \cdot d + 1}}{z + r^{2^{d-1}}}. \f}
     * The commitments \f$ [A_1]_1, \ldots, [A_{d-1}]_1 \f$ are multiplied by these scalars in the final `batch_mul`
     * perfomed by KZG or IPA.
     *
     * 3. Accumulates the summands of the constant term:
     * \f{align}{
     * \frac{\nu^{2 i} \cdot A_i\left(r^{2^i} \right)}{z - r^{2^i}} + \frac{\nu^{2 \cdot i+1} \cdot
     * A_i\left(-r^{2^i}\right)}{z+ r^{2^i}} \f} for \f$ i = 1, \ldots, d-1 \f$ and adds them to the
     * 'constant_term_accumulator'.
     *
     * @param log_n The logarithm of the circuit size, determining the depth of the Gemini protocol.
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
    static void batch_gemini_claims_received_from_prover(ShpleminiVerifierState<Curve>& verifier_state,
                                                         const std::vector<Commitment>& fold_commitments,
                                                         const std::vector<Fr>& gemini_neg_evaluations,
                                                         const std::vector<Fr>& gemini_pos_evaluations,
                                                         const std::vector<Fr>& inverse_vanishing_evals)
    {
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1159): Decouple constants from primitives.
        // Start from 1, because the commitment to A_0 is reconstructed from the commitments to the multilinear
        // polynomials. The corresponding evaluations are also handled separately.
        for (size_t j = 1; j < verifier_state.virtual_log_n; ++j) {

            // Compute the "positive" scaling factor  (ν^{2j}) / (z - r^{2^{j}})
            Fr scaling_factor_pos = verifier_state.shplonk_batching_challenge_power * inverse_vanishing_evals[2 * j];
            verifier_state.shplonk_batching_challenge_power *= verifier_state.shplonk_batching_challenge;
            // Compute the "negative" scaling factor  (ν^{2j+1}) / (z + r^{2^{j}})
            Fr scaling_factor_neg =
                verifier_state.shplonk_batching_challenge_power * inverse_vanishing_evals[2 * j + 1];

            // Accumulate the const term contribution given by
            // v^{2j} * A_j(r^{2^j}) /(z - r^{2^j}) + v^{2j+1} * A_j(-r^{2^j}) /(z+ r^{2^j})
            verifier_state.constant_term_accumulator +=
                scaling_factor_neg * gemini_neg_evaluations[j] + scaling_factor_pos * gemini_pos_evaluations[j];

            if constexpr (Curve::is_stdlib_type) {
                auto builder = gemini_neg_evaluations[0].get_context();
                // TODO(https://github.com/AztecProtocol/barretenberg/issues/1114): insecure!
                stdlib::bool_t dummy_round = stdlib::witness_t(builder, j >= verifier_state.log_n);
                Fr zero = Fr(0);
                scaling_factor_neg = Fr::conditional_assign(dummy_round, zero, scaling_factor_neg);
                scaling_factor_pos = Fr::conditional_assign(dummy_round, zero, scaling_factor_pos);
            } else {
                if (j >= verifier_state.log_n) {
                    scaling_factor_neg = 0;
                    scaling_factor_pos = 0;
                }
            }
            // Place the scaling factor to the 'scalars' vector
            verifier_state.scalars.push_back(-scaling_factor_neg - scaling_factor_pos);
            // Move com(Aᵢ) to the 'commitments' vector
            verifier_state.commitments.push_back(std::move(fold_commitments[j - 1]));
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
    static void remove_repeated_commitments(ShpleminiVerifierState<Curve>& verifier_state,
                                            const RepeatedCommitmentsData& repeated_commitments,
                                            bool has_zk)
    {
        auto& scalars = verifier_state.scalars;
        auto& commitments = verifier_state.commitments;
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
    static void add_zk_data(ShpleminiVerifierState<Curve>& verifier_state,
                            const std::array<Commitment, NUM_LIBRA_COMMITMENTS>& libra_commitments,
                            const std::array<Fr, NUM_SMALL_IPA_EVALUATIONS>& libra_evaluations)

    {
        const Fr& gemini_evaluation_challenge = verifier_state.gemini_evaluation_challenge;
        const Fr& shplonk_batching_challenge = verifier_state.shplonk_batching_challenge;
        const Fr& shplonk_evaluation_challenge = verifier_state.shplonk_evaluation_challenge;

        Fr& shplonk_batching_challenge_power = verifier_state.shplonk_batching_challenge_power;

        // add Libra commitments to the vector of commitments
        for (size_t idx = 0; idx < libra_commitments.size(); idx++) {
            verifier_state.commitments.push_back(libra_commitments[idx]);
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
            shplonk_batching_challenge_power *= shplonk_batching_challenge;
            Fr scaling_factor = denominators[idx] * shplonk_batching_challenge_power;
            batching_scalars[idx] = -scaling_factor;
            verifier_state.constant_term_accumulator += scaling_factor * libra_evaluations[idx];
        }

        // to save a scalar mul, add the sum of the batching scalars corresponding to the big sum evaluations
        verifier_state.scalars.push_back(batching_scalars[0]);
        verifier_state.scalars.push_back(batching_scalars[1] + batching_scalars[2]);
        verifier_state.scalars.push_back(batching_scalars[3]);
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
    static void batch_sumcheck_round_claims(ShpleminiVerifierState<Curve>& verifier_state,
                                            const std::vector<Commitment>& sumcheck_round_commitments,
                                            const std::vector<std::array<Fr, 3>>& sumcheck_round_evaluations)
    {
        const Fr& shplonk_evaluation_challenge = verifier_state.shplonk_evaluation_challenge;
        Fr& shplonk_batching_challenge_power = verifier_state.shplonk_batching_challenge_power;
        std::span<const Fr>& multilinear_challenge = verifier_state.multilinear_challenge;

        std::vector<Fr> denominators = {};
        // Denominators for the opening claims at 0 and 1. Need to be computed only once as opposed to the claims at the
        // sumcheck round challenges.
        std::array<Fr, 2> const_denominators;

        const_denominators[0] = Fr(1) / (shplonk_evaluation_challenge);
        const_denominators[1] = Fr(1) / (shplonk_evaluation_challenge - Fr{ 1 });

        // Compute the denominators corresponding to the evaluation claims at the round challenges and add the
        // commitments to the sumcheck round univariates to the vector of commitments
        for (const auto& [challenge, comm] : zip_view(multilinear_challenge, sumcheck_round_commitments)) {
            denominators.push_back(shplonk_evaluation_challenge - challenge);
            verifier_state.commitments.push_back(comm);
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
        // to the evaluations at 0, 1, and the round challenge u_i
        for (const auto& [eval_array, denominator] : zip_view(sumcheck_round_evaluations, denominators)) {
            // Initialize batched_scalar corresponding to 3 evaluations claims
            Fr batched_scalar = Fr(0);
            Fr const_term_contribution = Fr(0);
            // Compute the contribution from the evaluations at 0 and 1
            for (size_t idx = 0; idx < 2; idx++) {
                Fr current_scaling_factor = const_denominators[idx] * shplonk_batching_challenge_power;
                batched_scalar -= current_scaling_factor;
                const_term_contribution += current_scaling_factor * eval_array[idx];
            }

            // Compute the contribution from the evaluation at the challenge u_i
            Fr current_scaling_factor = denominator * shplonk_batching_challenge_power;
            batched_scalar -= current_scaling_factor;
            const_term_contribution += current_scaling_factor * eval_array[2];

            // Update Shplonk constant term accumualator
            verifier_state.constant_term_accumulator += const_term_contribution;
            verifier_state.scalars.push_back(batched_scalar);
        }
    };
};
} // namespace bb
