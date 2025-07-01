// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "./eccvm_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplonk.hpp"
#include "barretenberg/commitment_schemes/small_subgroup_ipa/small_subgroup_ipa.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"

namespace bb {

/**
 * @brief This function verifies an ECCVM Honk proof for given program settings.
 */
bool ECCVMVerifier::verify_proof(const ECCVMProof& proof)
{
    using Curve = typename Flavor::Curve;
    using Shplemini = ShpleminiVerifier_<Curve>;
    using Shplonk = ShplonkVerifier_<Curve>;
    using OpeningClaim = OpeningClaim<Curve>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;

    RelationParameters<FF> relation_parameters;

    ipa_transcript->load_proof(proof.ipa_proof);
    transcript->load_proof(proof.pre_ipa_proof);

    VerifierCommitments commitments{ key };
    CommitmentLabels commitment_labels;

    for (auto [comm, label] : zip_view(commitments.get_wires(), commitment_labels.get_wires())) {
        comm = transcript->template receive_from_prover<Commitment>(label);
    }

    // Get challenge for sorted list batching and wire four memory records
    auto [beta, gamma] = transcript->template get_challenges<FF>("beta", "gamma");

    auto beta_sqr = beta * beta;
    relation_parameters.gamma = gamma;
    relation_parameters.beta = beta;
    relation_parameters.beta_sqr = beta * beta;
    relation_parameters.beta_cube = beta_sqr * beta;
    relation_parameters.eccvm_set_permutation_delta =
        gamma * (gamma + beta_sqr) * (gamma + beta_sqr + beta_sqr) * (gamma + beta_sqr + beta_sqr + beta_sqr);
    relation_parameters.eccvm_set_permutation_delta = relation_parameters.eccvm_set_permutation_delta.invert();

    // Get commitment to permutation and lookup grand products
    commitments.lookup_inverses =
        transcript->template receive_from_prover<Commitment>(commitment_labels.lookup_inverses);
    commitments.z_perm = transcript->template receive_from_prover<Commitment>(commitment_labels.z_perm);

    // Execute Sumcheck Verifier
    SumcheckVerifier<Flavor, CONST_ECCVM_LOG_N> sumcheck(transcript);
    FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");
    RelationSeparator alphas{ alpha };

    for (size_t i = 1; i < alphas.size(); ++i) {
        alphas[i] = alphas[i - 1] * alpha;
    }

    std::vector<FF> gate_challenges(CONST_ECCVM_LOG_N);
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    // Receive commitments to Libra masking polynomials
    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};

    libra_commitments[0] = transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");

    auto sumcheck_output = sumcheck.verify(relation_parameters, alphas, gate_challenges);

    libra_commitments[1] = transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
    libra_commitments[2] = transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    // Compute the Shplemini accumulator consisting of the Shplonk evaluation and the commitments and scalars vector
    // produced by the unified protocol
    bool consistency_checked = true;
    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ commitments.get_unshifted(), sumcheck_output.claimed_evaluations.get_unshifted() },
        .shifted = ClaimBatch{ commitments.get_to_be_shifted(), sumcheck_output.claimed_evaluations.get_shifted() }
    };

    std::array<FF, CONST_ECCVM_LOG_N> padding_indicator_array;
    std::ranges::fill(padding_indicator_array, FF{ 1 });

    BatchOpeningClaim<Curve> sumcheck_batch_opening_claims =
        Shplemini::compute_batch_opening_claim(padding_indicator_array,
                                               claim_batcher,
                                               sumcheck_output.challenge,
                                               key->pcs_verification_key.get_g1_identity(),
                                               transcript,
                                               Flavor::REPEATED_COMMITMENTS,
                                               Flavor::HasZK,
                                               &consistency_checked,
                                               libra_commitments,
                                               sumcheck_output.claimed_libra_evaluation,
                                               sumcheck_output.round_univariate_commitments,
                                               sumcheck_output.round_univariate_evaluations);

    // Reduce the accumulator to a single opening claim
    OpeningClaim multivariate_to_univariate_opening_claim =
        PCS::reduce_batch_opening_claim(sumcheck_batch_opening_claims);

    // Produce the opening claim for batch opening of `op`, `Px`, `Py`, `z1`, and `z2` wires as univariate polynomials
    std::array<Commitment, NUM_TRANSLATION_EVALUATIONS> translation_commitments = { commitments.transcript_op,
                                                                                    commitments.transcript_Px,
                                                                                    commitments.transcript_Py,
                                                                                    commitments.transcript_z1,
                                                                                    commitments.transcript_z2 };

    compute_translation_opening_claims(translation_commitments);

    opening_claims.back() = multivariate_to_univariate_opening_claim;

    // Construct and verify the combined opening claim
    const OpeningClaim batch_opening_claim =
        Shplonk::reduce_verification(key->pcs_verification_key.get_g1_identity(), opening_claims, transcript);

    const bool batched_opening_verified =
        PCS::reduce_verify(key->pcs_verification_key, batch_opening_claim, ipa_transcript);
    vinfo("eccvm sumcheck verified?: ", sumcheck_output.verified);
    vinfo("batch opening verified?: ", batched_opening_verified);
    vinfo("eccvm consistency check verified?: ", consistency_checked);
    vinfo("translation masking consistency checked?: ", translation_masking_consistency_checked);
    return sumcheck_output.verified && batched_opening_verified && consistency_checked &&
           translation_masking_consistency_checked;
}

/**
 * @brief To link the ECCVM Transcript wires `op`, `Px`, `Py`, `z1`, and `z2` to the accumulator computed by the
 * translator, we verify their evaluations as univariates. For efficiency reasons, we batch these evaluations.
 *
 * @details For details, see the docs of \ref ECCVMProver::compute_translation_opening_claims() method.
 *
 * @param translation_commitments Commitments to  `op`, `Px`, `Py`, `z1`, and `z2`
 * @return Populate `opening_claims`.
 */
void ECCVMVerifier::compute_translation_opening_claims(
    const std::array<Commitment, NUM_TRANSLATION_EVALUATIONS>& translation_commitments)
{
    // Used to capture the batched evaluation of unmasked `translation_polynomials` while preserving ZK
    using SmallIPA = SmallSubgroupIPAVerifier<ECCVMFlavor::Curve>;

    // Initialize SmallSubgroupIPA structures
    SmallSubgroupIPACommitments<Commitment> small_ipa_commitments;
    std::array<FF, NUM_SMALL_IPA_EVALUATIONS> small_ipa_evaluations;
    const std::array<std::string, NUM_SMALL_IPA_EVALUATIONS> labels = SmallIPA::evaluation_labels("Translation:");

    // Get a commitment to M + Z_H * R, where M is a concatenation of the masking terms of `translation_polynomials`,
    // Z_H = X^{|H|} - 1, and R is a random degree 2 polynomial
    small_ipa_commitments.concatenated =
        transcript->template receive_from_prover<Commitment>("Translation:concatenated_masking_term_commitment");

    // Get a challenge to evaluate `translation_polynomials` as univariates
    evaluation_challenge_x = transcript->template get_challenge<FF>("Translation:evaluation_challenge_x");

    // Populate the translation evaluations  {`op(x)`, `Px(x)`, `Py(x)`, `z1(x)`, `z2(x)`} to be batched
    for (auto [eval, label] : zip_view(translation_evaluations.get_all(), translation_evaluations.labels)) {
        eval = transcript->template receive_from_prover<FF>(label);
    }

    // Get the batching challenge for commitments and evaluations
    batching_challenge_v = transcript->template get_challenge<FF>("Translation:batching_challenge_v");

    // Get the value ∑ mᵢ(x) ⋅ vⁱ
    translation_masking_term_eval = transcript->template receive_from_prover<FF>("Translation:masking_term_eval");

    // Receive commitments to the SmallSubgroupIPA witnesses that are computed once x and v are available
    small_ipa_commitments.grand_sum =
        transcript->template receive_from_prover<Commitment>("Translation:grand_sum_commitment");
    small_ipa_commitments.quotient =
        transcript->template receive_from_prover<Commitment>("Translation:quotient_commitment");

    // Get a challenge for the evaluations of the concatenated masking term G, grand sum A, its shift, and grand sum
    // identity quotient Q
    const FF small_ipa_evaluation_challenge =
        transcript->template get_challenge<FF>("Translation:small_ipa_evaluation_challenge");

    // Compute {r, r * g, r, r}, where r = `small_ipa_evaluation_challenge`
    std::array<FF, NUM_SMALL_IPA_EVALUATIONS> evaluation_points =
        SmallIPA::evaluation_points(small_ipa_evaluation_challenge);

    // Get the evaluations G(r), A(g * r), A(r), Q(r)
    for (size_t idx = 0; idx < NUM_SMALL_IPA_EVALUATIONS; idx++) {
        small_ipa_evaluations[idx] = transcript->template receive_from_prover<FF>(labels[idx]);
        opening_claims[idx] = { { evaluation_points[idx], small_ipa_evaluations[idx] },
                                small_ipa_commitments.get_all()[idx] };
    }

    // Check Grand Sum Identity at r
    translation_masking_consistency_checked =
        SmallIPA::check_eccvm_evaluations_consistency(small_ipa_evaluations,
                                                      small_ipa_evaluation_challenge,
                                                      evaluation_challenge_x,
                                                      batching_challenge_v,
                                                      translation_masking_term_eval);

    // Compute the batched commitment and batched evaluation for the univariate opening claim
    Commitment batched_commitment = translation_commitments[0];
    FF batched_translation_evaluation = translation_evaluations.get_all()[0];
    FF batching_scalar = batching_challenge_v;
    for (size_t idx = 1; idx < NUM_TRANSLATION_EVALUATIONS; ++idx) {
        batched_commitment = batched_commitment + translation_commitments[idx] * batching_scalar;
        batched_translation_evaluation += batching_scalar * translation_evaluations.get_all()[idx];
        batching_scalar *= batching_challenge_v;
    }

    // Place the claim to the array containing the SmallSubgroupIPA opening claims
    opening_claims[NUM_SMALL_IPA_EVALUATIONS] = { { evaluation_challenge_x, batched_translation_evaluation },
                                                  batched_commitment };

    // Compute `translation_masking_term_eval` * `evaluation_challenge_x`^{circuit_size - NUM_DISABLED_ROWS_IN_SUMCHECK}
    shift_translation_masking_term_eval(evaluation_challenge_x, translation_masking_term_eval);
};

} // namespace bb
