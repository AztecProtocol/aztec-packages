#pragma once
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/commitment_schemes/commitment_key.hpp"
#include "barretenberg/commitment_schemes/gemini/gemini_impl.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
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

    template <typename Transcript, size_t LENGTH = 0>
    static OpeningClaim prove(const FF circuit_size,
                              RefSpan<Polynomial> f_polynomials,
                              RefSpan<Polynomial> g_polynomials,
                              std::span<FF> multilinear_challenge,
                              const std::shared_ptr<CommitmentKey<Curve>>& commitment_key,
                              const std::shared_ptr<Transcript>& transcript,
                              RefSpan<Polynomial> concatenated_polynomials = {},
                              const std::vector<RefVector<Polynomial>>& groups_to_be_concatenated = {},
                              const std::vector<bb::Univariate<FF, LENGTH>>& libra_univariates = {},
                              const std::vector<FF>& libra_evaluations = {})
    {
        std::vector<OpeningClaim> opening_claims = GeminiProver::prove(circuit_size,
                                                                       f_polynomials,
                                                                       g_polynomials,
                                                                       multilinear_challenge,
                                                                       commitment_key,
                                                                       transcript,
                                                                       concatenated_polynomials,
                                                                       groups_to_be_concatenated);
        // Create opening claims for Libra masking univariates
        std::vector<OpeningClaim> libra_opening_claims;
        size_t idx = 0;
        for (auto [libra_univariate, libra_evaluation] : zip_view(libra_univariates, libra_evaluations)) {
            OpeningClaim new_claim;
            new_claim.polynomial = Polynomial(libra_univariate);
            new_claim.opening_pair.challenge = multilinear_challenge[idx];
            new_claim.opening_pair.evaluation = libra_evaluation;
            libra_opening_claims.push_back(new_claim);
            idx++;
        }
        OpeningClaim batched_claim =
            ShplonkProver::prove(commitment_key, opening_claims, transcript, libra_opening_claims);
        return batched_claim;
    };
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
 * \#\text{claimed_evaluations} + \text{log_circuit_size} + 2
 * \f]
 *
 * The output triple is either fed to the corresponding \ref bb::KZG< Curve_ >::reduce_verify_batch_opening_claim
 * "KZG method" or \ref bb::IPA< Curve_ >::reduce_verify_batch_opening_claim "IPA method". In the case of KZG, we reduce
 * \f$ 6 \f$ batch_mul calls needed for the verification of the multivariate evaluation claims to the single batch_mul
 * described above. In the case of IPA, the total number of batch_mul calls needed to verify the multivariate evaluation
 * claims is reduced by \f$ 5 \f$.
 *
 * TODO (https://github.com/AztecProtocol/barretenberg/issues/1084) Reduce the size of batch_mul further by eliminating
 * shifted commitments.
 */

template <typename Curve> class ShpleminiVerifier_ {
    using Fr = typename Curve::ScalarField;
    using GroupElement = typename Curve::Element;
    using Commitment = typename Curve::AffineElement;
    using VK = VerifierCommitmentKey<Curve>;
    using ShplonkVerifier = ShplonkVerifier_<Curve>;
    using GeminiVerifier = GeminiVerifier_<Curve>;

  public:
    template <typename Transcript>
    static BatchOpeningClaim<Curve> compute_batch_opening_claim(
        const Fr N,
        RefSpan<Commitment> unshifted_commitments,
        RefSpan<Commitment> shifted_commitments,
        RefSpan<Fr> unshifted_evaluations,
        RefSpan<Fr> shifted_evaluations,
        const std::vector<Fr>& multivariate_challenge,
        const Commitment& g1_identity,
        const std::shared_ptr<Transcript>& transcript,
        const std::vector<RefVector<Commitment>>& concatenation_group_commitments = {},
        RefSpan<Fr> concatenated_evaluations = {},
        RefSpan<Commitment> libra_univariate_commitments = {},
        const std::vector<Fr>& libra_univariate_evaluations = {})

    {

        // Extract log_circuit_size
        size_t log_circuit_size{ 0 };
        if constexpr (Curve::is_stdlib_type) {
            log_circuit_size = numeric::get_msb(static_cast<uint32_t>(N.get_value()));
        } else {
            log_circuit_size = numeric::get_msb(static_cast<uint32_t>(N));
        }

        // Get the challenge ρ to batch commitments to multilinear polynomials and their shifts
        const Fr multivariate_batching_challenge = transcript->template get_challenge<Fr>("rho");

        // Process Gemini transcript data:
        // - Get Gemini commitments (com(A₁), com(A₂), … , com(Aₙ₋₁))
        const std::vector<Commitment> fold_commitments =
            GeminiVerifier::get_fold_commitments(log_circuit_size, transcript);
        // - Get Gemini evaluation challenge for Aᵢ, i = 0, … , d−1
        const Fr gemini_evaluation_challenge = transcript->template get_challenge<Fr>("Gemini:r");

        // - Get evaluations (A₀(−r), A₁(−r²), ... , Aₙ₋₁(−r²⁽ⁿ⁻¹⁾))
        const std::vector<Fr> gemini_evaluations = GeminiVerifier::get_gemini_evaluations(log_circuit_size, transcript);
        // - Compute vector (r, r², ... , r²⁽ⁿ⁻¹⁾), where n = log_circuit_size
        const std::vector<Fr> gemini_eval_challenge_powers =
            gemini::powers_of_evaluation_challenge(gemini_evaluation_challenge, CONST_PROOF_SIZE_LOG_N);

        // Process Shplonk transcript data:
        // - Get Shplonk batching challenge
        const Fr shplonk_batching_challenge = transcript->template get_challenge<Fr>("Shplonk:nu");
        // - Get the quotient commitment for the Shplonk batching of Gemini opening claims
        const auto Q_commitment = transcript->template receive_from_prover<Commitment>("Shplonk:Q");

        // Start populating the vector (Q, f₀, ... , fₖ₋₁, g₀, ... , gₘ₋₁, com(A₁), ... , com(Aₙ₋₁), [1]₁) where fᵢ are
        // the k commitments to unshifted polynomials and gⱼ are the m commitments to shifted polynomials
        std::vector<Commitment> commitments{ Q_commitment };

        // Get Shplonk opening point z
        const Fr shplonk_evaluation_challenge = transcript->template get_challenge<Fr>("Shplonk:z");

        // Start computing the scalar to be multiplied by [1]₁
        Fr constant_term_accumulator = Fr(0);

        // Initialize the vector of scalars placing the scalar 1 correposnding to Q_commitment
        std::vector<Fr> scalars;
        if constexpr (Curve::is_stdlib_type) {
            auto builder = shplonk_batching_challenge.get_context();
            scalars.emplace_back(Fr(builder, 1));
        } else {
            scalars.emplace_back(Fr(1));
        }

        // Compute 1/(z − r), 1/(z + r), 1/(z + r²), … , 1/(z + r²⁽ⁿ⁻¹⁾)
        // These represent the denominators of the summand terms in Shplonk partially evaluated polynomial Q_z
        const std::vector<Fr> inverse_vanishing_evals = ShplonkVerifier::compute_inverted_gemini_denominators(
            log_circuit_size + 1, shplonk_evaluation_challenge, gemini_eval_challenge_powers);

        // Compute the additional factors to be multiplied with unshifted and shifted commitments when lazily
        // reconstructing thec commitment of Q_z

        // i-th unshifted commitment is multiplied by −ρⁱ and the unshifted_scalar ( 1/(z−r) + ν/(z+r) )
        const Fr unshifted_scalar =
            inverse_vanishing_evals[0] + shplonk_batching_challenge * inverse_vanishing_evals[1];

        //  j-th shifted commitment is multiplied by −ρᵏ⁺ʲ⁻¹ and the shifted_scalar r⁻¹ ⋅ (1/(z−r) − ν/(z+r))
        const Fr shifted_scalar =
            gemini_evaluation_challenge.invert() *
            (inverse_vanishing_evals[0] - shplonk_batching_challenge * inverse_vanishing_evals[1]);

        std::vector<Fr> concatenation_scalars;
        if (!concatenation_group_commitments.empty()) {
            const size_t concatenation_group_size = concatenation_group_commitments[0].size();
            // The "real" size of polynomials in concatenation groups (i.e. the number of non-zero values)
            const size_t mini_circuit_size = (1 << log_circuit_size) / concatenation_group_size;
            Fr r_shift_pos = Fr(1);
            Fr r_shift_neg = Fr(1);
            const Fr r_pow_minicircuit = gemini_evaluation_challenge.pow(mini_circuit_size);
            const Fr r_neg_pow_minicircuit = (-gemini_evaluation_challenge).pow(mini_circuit_size);

            for (size_t i = 0; i < concatenation_group_size; ++i) {
                // The l-th commitment in each concatenation group will be multiplied by  -ρᵏ⁺ᵐ⁺ˡ and
                // ( rˡˢ /(z−r) + ν ⋅ (-r)ˡˢ /(z+r) ) where s is the mini circuit size
                concatenation_scalars.emplace_back(r_shift_pos * inverse_vanishing_evals[0] +
                                                   r_shift_neg * shplonk_batching_challenge *
                                                       inverse_vanishing_evals[1]);

                r_shift_pos *= r_pow_minicircuit;
                r_shift_neg *= r_neg_pow_minicircuit;
            }
        }

        // Place the commitments to prover polynomials in the commitments vector. Compute the evaluation of the
        // batched multilinear polynomial. Populate the vector of scalars for the final batch mul
        Fr batched_evaluation = Fr(0);
        batch_multivariate_opening_claims(unshifted_commitments,
                                          shifted_commitments,
                                          unshifted_evaluations,
                                          shifted_evaluations,
                                          multivariate_batching_challenge,
                                          unshifted_scalar,
                                          shifted_scalar,
                                          commitments,
                                          scalars,
                                          batched_evaluation,
                                          concatenation_scalars,
                                          concatenation_group_commitments,
                                          concatenated_evaluations);

        // Place the commitments to Gemini Aᵢ to the vector of commitments, compute the contributions from
        // Aᵢ(−r²ⁱ) for i=1, … , n−1 to the constant term accumulator, add corresponding scalars
        batch_gemini_claims_received_from_prover(log_circuit_size,
                                                 fold_commitments,
                                                 gemini_evaluations,
                                                 inverse_vanishing_evals,
                                                 shplonk_batching_challenge,
                                                 commitments,
                                                 scalars,
                                                 constant_term_accumulator);

        // Add contributions from A₀(r) and A₀(-r) to constant_term_accumulator:
        // - Compute A₀(r)
        const Fr a_0_pos =
            GeminiVerifier_<Curve>::compute_gemini_batched_univariate_evaluation(log_circuit_size,
                                                                                 batched_evaluation,
                                                                                 multivariate_challenge,
                                                                                 gemini_eval_challenge_powers,
                                                                                 gemini_evaluations);
        // - Add A₀(r)/(z−r) to the constant term accumulator
        constant_term_accumulator += a_0_pos * inverse_vanishing_evals[0];
        // Add A₀(−r)/(z+r) to the constant term accumulator
        constant_term_accumulator += gemini_evaluations[0] * shplonk_batching_challenge * inverse_vanishing_evals[1];

        // Finalize the batch opening claim
        commitments.emplace_back(g1_identity);
        scalars.emplace_back(constant_term_accumulator);

        // For ZK flavors, the sumcheck output contains the evaluations of Libra univariates that submitted to the
        // ShpleminiVerifier, otherwise this argument is set to be empty
        if (!libra_univariate_evaluations.empty()) {
            add_zk_data(commitments,
                        scalars,
                        libra_univariate_commitments,
                        libra_univariate_evaluations,
                        multivariate_challenge,
                        shplonk_batching_challenge,
                        shplonk_evaluation_challenge);
        }

        return { commitments, scalars, shplonk_evaluation_challenge };
    };
    /**
     * @brief Populates the vectors of commitments and scalars, and computes the evaluation of the batched
     * multilinear polynomial at the sumcheck challenge.
     *
     * @details This function iterates over all commitments and the claimed evaluations of the corresponding
     * polynomials. The following notations are used:
     * - \f$ \rho \f$: Batching challenge for multivariate claims.
     * - \f$ z \f$: SHPLONK evaluation challenge.
     * - \f$ r \f$: Gemini evaluation challenge.
     * - \f$ \nu \f$: SHPLONK batching challenge.
     *
     * The vector of scalars is populated as follows:
     * \f[
     * \left(
     * - \left(\frac{1}{z-r} + \nu \times \frac{1}{z+r}\right),
     * \ldots,
     * - \rho^{i+k-1} \times \left(\frac{1}{z-r} + \nu \times \frac{1}{z+r}\right),
     * - \rho^{i+k} \times \frac{1}{r} \times \left(\frac{1}{z-r} - \nu \times \frac{1}{z+r}\right),
     * \ldots,
     * - \rho^{k+m-1} \times \frac{1}{r} \times \left(\frac{1}{z-r} - \nu \times \frac{1}{z+r}\right)
     * \right)
     * \f]
     *
     * The following vector is concatenated to the vector of commitments:
     * \f[
     * f_0, \ldots, f_{m-1}, f_{\text{shift}, 0}, \ldots, f_{\text{shift}, k-1}
     * \f]
     *
     * Simultaneously, the evaluation of the multilinear polynomial
     * \f[
     * \sum \rho^i \cdot f_i + \sum \rho^{i+k} \cdot f_{\text{shift}, i}
     * \f]
     * at the challenge point \f$ (u_0,\ldots, u_{n-1}) \f$ is computed.
     *
     * This approach minimizes the number of iterations over the commitments to multilinear polynomials
     * and eliminates the need to store the powers of \f$ \rho \f$.
     *
     * @param unshifted_commitments Commitments to unshifted polynomials.
     * @param shifted_commitments Commitments to shifted polynomials.
     * @param claimed_evaluations Claimed evaluations of the corresponding polynomials.
     * @param multivariate_batching_challenge Random challenge used for batching of multivariate evaluation claims.
     * @param unshifted_scalar Scaling factor for commitments to unshifted polynomials.
     * @param shifted_scalar Scaling factor for commitments to shifted polynomials.
     * @param commitments The vector of commitments to be populated.
     * @param scalars The vector of scalars to be populated.
     * @param batched_evaluation The evaluation of the batched multilinear polynomial.
     * @param concatenated_scalars Scaling factors for the commitments to polynomials in concatenation groups, one for
     * each group.
     * @param concatenation_group_commitments Commitments to polynomials to be concatenated.
     * @param concatenated_evaluations Evaluations of the full concatenated polynomials.
     */
    static void batch_multivariate_opening_claims(
        RefSpan<Commitment> unshifted_commitments,
        RefSpan<Commitment> shifted_commitments,
        RefSpan<Fr> unshifted_evaluations,
        RefSpan<Fr> shifted_evaluations,
        const Fr& multivariate_batching_challenge,
        const Fr& unshifted_scalar,
        const Fr& shifted_scalar,
        std::vector<Commitment>& commitments,
        std::vector<Fr>& scalars,
        Fr& batched_evaluation,
        std::vector<Fr> concatenated_scalars = {},
        const std::vector<RefVector<Commitment>>& concatenation_group_commitments = {},
        RefSpan<Fr> concatenated_evaluations = {})
    {
        Fr current_batching_challenge = Fr(1);
        for (auto [unshifted_commitment, unshifted_evaluation] :
             zip_view(unshifted_commitments, unshifted_evaluations)) {
            // Move unshifted commitments to the 'commitments' vector
            commitments.emplace_back(std::move(unshifted_commitment));
            // Compute −ρⁱ ⋅ (1/(z−r) + ν/(z+r)) and place into 'scalars'
            scalars.emplace_back(-unshifted_scalar * current_batching_challenge);
            // Accumulate the evaluation of ∑ ρⁱ ⋅ fᵢ at the sumcheck challenge
            batched_evaluation += unshifted_evaluation * current_batching_challenge;
            // Update the batching challenge
            current_batching_challenge *= multivariate_batching_challenge;
        }
        for (auto [shifted_commitment, shifted_evaluation] : zip_view(shifted_commitments, shifted_evaluations)) {
            // Move shifted commitments to the 'commitments' vector
            commitments.emplace_back(std::move(shifted_commitment));
            // Compute −ρ⁽ᵏ⁺ʲ⁾ ⋅ r⁻¹ ⋅ (1/(z−r) − ν/(z+r)) and place into 'scalars'
            scalars.emplace_back(-shifted_scalar * current_batching_challenge);
            // Accumulate the evaluation of ∑ ρ⁽ᵏ⁺ʲ⁾ ⋅ f_shift at the sumcheck challenge
            batched_evaluation += shifted_evaluation * current_batching_challenge;
            // Update the batching challenge ρ
            current_batching_challenge *= multivariate_batching_challenge;
        }

        // If we are performing an opening verification for the translator, add the contributions from the concatenation
        // commitments and evaluations to the result
        ASSERT(concatenated_evaluations.size() == concatenation_group_commitments.size());
        if (!concatenation_group_commitments.empty()) {
            size_t concatenation_group_size = concatenation_group_commitments[0].size();
            size_t group_idx = 0;
            for (auto concatenation_group_commitment : concatenation_group_commitments) {
                for (size_t i = 0; i < concatenation_group_size; ++i) {
                    commitments.emplace_back(std::move(concatenation_group_commitment[i]));
                    scalars.emplace_back(-current_batching_challenge * concatenated_scalars[i]);
                }
                // Accumulate the batched evaluations of concatenated polynomials
                batched_evaluation += concatenated_evaluations[group_idx] * current_batching_challenge;
                // Update the batching challenge ρ
                current_batching_challenge *= multivariate_batching_challenge;
                group_idx++;
            }
        }
    }

    /**
     * @brief Populates the 'commitments' and 'scalars' vectors with the commitments to Gemini fold polynomials \f$
     * A_i \f$.
     *
     * @details Once the commitments to Gemini "fold" polynomials \f$ A_i \f$ and their evaluations at \f$ -r^{2^i}
     * \f$, where \f$ i = 1, \ldots, n-1 \f$, are received by the verifier, it performs the following operations:
     *
     * 1. Moves the vector
     * \f[
     * \left( \text{com}(A_1), \text{com}(A_2), \ldots, \text{com}(A_{n-1}) \right)
     * \f]
     * to the 'commitments' vector.
     *
     * 2. Computes the scalars:
     * \f[
     * \frac{\nu^{2}}{z + r^2}, \frac{\nu^3}{z + r^4}, \ldots, \frac{\nu^{n-1}}{z + r^{2^{n-1}}}
     * \f]
     * and places them into the 'scalars' vector.
     *
     * 3. Accumulates the summands of the constant term:
     * \f[
     * \sum_{i=2}^{n-1} \frac{\nu^{i} \cdot A_i(-r^{2^i})}{z + r^{2^i}}
     * \f]
     * and adds them to the 'constant_term_accumulator'.
     *
     * @param log_circuit_size The logarithm of the circuit size, determining the depth of the Gemini protocol.
     * @param fold_commitments A vector containing the commitments to the Gemini fold polynomials \f$ A_i \f$.
     * @param gemini_evaluations A vector containing the evaluations of the Gemini fold polynomials \f$ A_i \f$ at
     * points \f$ -r^{2^i} \f$.
     * @param inverse_vanishing_evals A vector containing the inverse evaluations of the vanishing polynomial.
     * @param shplonk_batching_challenge The batching challenge \f$ \nu \f$ used in the SHPLONK protocol.
     * @param commitments Output vector where the commitments to the Gemini fold polynomials will be stored.
     * @param scalars Output vector where the computed scalars will be stored.
     * @param constant_term_accumulator The accumulator for the summands of the constant term.
     */
    static void batch_gemini_claims_received_from_prover(const size_t log_circuit_size,
                                                         const std::vector<Commitment>& fold_commitments,
                                                         const std::vector<Fr>& gemini_evaluations,
                                                         const std::vector<Fr>& inverse_vanishing_evals,
                                                         const Fr& shplonk_batching_challenge,
                                                         std::vector<Commitment>& commitments,
                                                         std::vector<Fr>& scalars,
                                                         Fr& constant_term_accumulator)
    {

        // Initialize batching challenge as ν²
        Fr current_batching_challenge = shplonk_batching_challenge.sqr();
        for (size_t j = 0; j < CONST_PROOF_SIZE_LOG_N - 1; ++j) {
            // Compute the scaling factor  (ν²⁺ⁱ) / (z + r²⁽ⁱ⁺²⁾) for i = 0, … , d-2
            Fr scaling_factor = current_batching_challenge * inverse_vanishing_evals[j + 2];

            // Add Aᵢ(−r²ⁱ) for i = 1, … , n-1 to the constant term accumulator
            constant_term_accumulator += scaling_factor * gemini_evaluations[j + 1];

            // Update the batching challenge
            current_batching_challenge *= shplonk_batching_challenge;

            if constexpr (Curve::is_stdlib_type) {
                auto builder = shplonk_batching_challenge.get_context();
                // TODO(https://github.com/AztecProtocol/barretenberg/issues/1114): insecure!
                stdlib::bool_t dummy_round = stdlib::witness_t(builder, j >= (log_circuit_size - 1));
                Fr zero = Fr(0);
                scaling_factor = Fr::conditional_assign(dummy_round, zero, scaling_factor);
            } else {
                if (j >= (log_circuit_size - 1)) {
                    scaling_factor = 0;
                }
            }
            // Place the scaling factor to the 'scalars' vector
            scalars.emplace_back(-scaling_factor);
            // Move com(Aᵢ) to the 'commitments' vector
            commitments.emplace_back(std::move(fold_commitments[j]));
        }
    }

    /**
     * @brief Add the opening data corresponding to Libra masking univariates to the batched opening claim
     *
     * @details After verifying ZK Sumcheck, the verifier has to validate the claims about the evaluations of Libra
     * univariates used to mask Sumcheck round univariates. To minimize the overhead of such openings, we continue the
     * Shplonk batching started in Gemini, i.e. we add new claims multiplied by a suitable power of the Shplonk batching
     * challenge and re-use the evaluation challenge sampled to prove the evaluations of Gemini polynomials.
     *
     * @param commitments
     * @param scalars
     * @param libra_univariate_commitments
     * @param libra_univariate_evaluations
     * @param multivariate_challenge
     * @param shplonk_batching_challenge
     * @param shplonk_evaluation_challenge
     */
    static void add_zk_data(std::vector<Commitment>& commitments,
                            std::vector<Fr>& scalars,
                            RefSpan<Commitment> libra_univariate_commitments,
                            const std::vector<Fr>& libra_univariate_evaluations,
                            const std::vector<Fr>& multivariate_challenge,
                            const Fr& shplonk_batching_challenge,
                            const Fr& shplonk_evaluation_challenge)

    {
        // compute current power of Shplonk batching challenge taking into account the const proof size
        Fr shplonk_challenge_power = Fr{ 1 };
        for (size_t j = 0; j < CONST_PROOF_SIZE_LOG_N + 2; ++j) {
            shplonk_challenge_power *= shplonk_batching_challenge;
        }

        // need to keep track of the contribution to the constant term
        Fr& constant_term = scalars.back();
        // compute shplonk denominators and batch invert them
        std::vector<Fr> denominators;
        size_t num_libra_univariates = libra_univariate_commitments.size();

        // compute Shplonk denominators and invert them
        for (size_t idx = 0; idx < num_libra_univariates; idx++) {
            if constexpr (Curve::is_stdlib_type) {
                denominators.push_back(Fr(1) / (shplonk_evaluation_challenge - multivariate_challenge[idx]));
            } else {
                denominators.push_back(shplonk_evaluation_challenge - multivariate_challenge[idx]);
            }
        };
        if constexpr (!Curve::is_stdlib_type) {
            Fr::batch_invert(denominators);
        }
        // add Libra commitments to the vector of commitments; compute corresponding scalars and the correction to the
        // constant term
        for (const auto [libra_univariate_commitment, denominator, libra_univariate_evaluation] :
             zip_view(libra_univariate_commitments, denominators, libra_univariate_evaluations)) {
            commitments.push_back(std::move(libra_univariate_commitment));
            Fr scaling_factor = denominator * shplonk_challenge_power;
            scalars.push_back((-scaling_factor));
            shplonk_challenge_power *= shplonk_batching_challenge;
            // update the constant term of the Shplonk batched claim
            constant_term += scaling_factor * libra_univariate_evaluation;
        }
    }
};
} // namespace bb