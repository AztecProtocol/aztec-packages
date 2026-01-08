// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "./eccvm_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/stdlib/eccvm_verifier/eccvm_recursive_flavor.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

namespace bb {

/**
 * @brief Verifies an ECCVM Honk proof for given program settings.
 * @details Works for both native verification and recursive (in-circuit) verification.
 */
template <typename Flavor>
typename ECCVMVerifier_<Flavor>::ReductionResult ECCVMVerifier_<Flavor>::reduce_to_ipa_opening()
{
    using Curve = typename Flavor::Curve;
    using Shplemini = ShpleminiVerifier_<Curve, Flavor::HasZK>;
    using Shplonk = ShplonkVerifier_<Curve>;
    using OpeningClaim = OpeningClaim<Curve>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = typename ClaimBatcher::Batch;

    RelationParameters<FF> relation_parameters;

    // Load proof into transcript
    transcript->load_proof(proof);

    // Fiat-Shamir the vk hash (computed in constructor)
    transcript->add_to_hash_buffer("vk_hash", vk_hash);
    vinfo("ECCVM vk hash: ", vk_hash);

    VerifierCommitments commitments{ key };
    CommitmentLabels commitment_labels;

    // Receive Gemini masking polynomial commitment (for ZK-PCS)
    commitments.gemini_masking_poly = transcript->template receive_from_prover<Commitment>("Gemini:masking_poly_comm");
    for (auto [comm, label] : zip_view(commitments.get_wires(), commitment_labels.get_wires())) {
        comm = transcript->template receive_from_prover<Commitment>(label);
    }

    // Get challenge for sorted list batching and wire four memory records
    auto [beta, gamma] = transcript->template get_challenges<FF>(std::array<std::string, 2>{ "beta", "gamma" });

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

    // Each linearly independent subrelation contribution is multiplied by `alpha^i`, where
    //  i = 0, ..., NUM_SUBRELATIONS- 1.
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    // Execute Sumcheck Verifier
    SumcheckVerifier<Flavor> sumcheck(transcript, alpha, CONST_ECCVM_LOG_N);

    std::vector<FF> gate_challenges(CONST_ECCVM_LOG_N);
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    // Receive commitments to Libra masking polynomials
    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};

    libra_commitments[0] = transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");
    std::vector<FF> padding_indicator_array(CONST_ECCVM_LOG_N, FF(1));

    auto sumcheck_output = sumcheck.verify(relation_parameters, gate_challenges, padding_indicator_array);

    libra_commitments[1] = transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
    libra_commitments[2] = transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    // Compute the Shplemini accumulator consisting of the Shplonk evaluation and the commitments and scalars vector
    // produced by the unified protocol

    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ commitments.get_unshifted(), sumcheck_output.claimed_evaluations.get_unshifted() },
        .shifted = ClaimBatch{ commitments.get_to_be_shifted(), sumcheck_output.claimed_evaluations.get_shifted() }
    };

    auto [sumcheck_batch_opening_claims, consistency_checked] =
        Shplemini::compute_batch_opening_claim(padding_indicator_array,
                                               claim_batcher,
                                               sumcheck_output.challenge,
                                               key->pcs_g1_identity,
                                               transcript,
                                               Flavor::REPEATED_COMMITMENTS,
                                               libra_commitments,
                                               sumcheck_output.claimed_libra_evaluation,
                                               sumcheck_output.round_univariate_commitments,
                                               sumcheck_output.round_univariate_evaluations);

    // Reduce the accumulator to a single opening claim
    OpeningClaim multivariate_to_univariate_opening_claim =
        PCS::reduce_batch_opening_claim(sumcheck_batch_opening_claims);

    // Produce the opening claim for batch opening of `op`, `Px`, `Py`, `z1`, and `z2` wires as univariate
    // polynomials

    std::vector<Commitment> translation_commitments = { commitments.transcript_op,
                                                        commitments.transcript_Px,
                                                        commitments.transcript_Py,
                                                        commitments.transcript_z1,
                                                        commitments.transcript_z2 };
    compute_translation_opening_claims(translation_commitments);

    opening_claims.back() = multivariate_to_univariate_opening_claim;

    // Construct the combined opening claim
    const OpeningClaim batch_opening_claim =
        Shplonk::reduce_verification(key->pcs_g1_identity, opening_claims, transcript);

    bool sumcheck_verified = sumcheck_output.verified;
    vinfo("ECCVM Verifier: sumcheck verified: ", sumcheck_verified);
    vinfo("ECCVM Verifier: consistency checked: ", consistency_checked);
    vinfo("ECCVM Verifier: translation masking consistency checked: ", translation_masking_consistency_checked);

    compute_accumulated_result();

    return { batch_opening_claim, sumcheck_verified && consistency_checked && translation_masking_consistency_checked };
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
template <typename Flavor>
void ECCVMVerifier_<Flavor>::compute_translation_opening_claims(const std::vector<Commitment>& translation_commitments)
{
    // Used to capture the batched evaluation of unmasked `translation_polynomials` while preserving ZK
    using SmallIPA = SmallSubgroupIPAVerifier<Curve>;

    // Initialize SmallSubgroupIPA structures
    SmallSubgroupIPACommitments<Commitment> small_ipa_commitments;
    std::array<FF, NUM_SMALL_IPA_EVALUATIONS> small_ipa_evaluations;
    const auto labels = SmallIPA::evaluation_labels("Translation:");

    // Get a commitment to M + Z_H * R, where M is a concatenation of the masking terms of
    // `translation_polynomials`, Z_H = X^{|H|} - 1, and R is a random degree 2 polynomial
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

    // OriginTag false positive: Small IPA evaluations need to satisfy an identity where they are mixing without
    // challenges, it is safe because these evaluations are opened in Shplonk.
    if constexpr (IsRecursive) {
        for (auto& eval : small_ipa_evaluations) {
            eval.clear_round_provenance();
        }
    }

    // Check Grand Sum Identity at r

    translation_masking_consistency_checked =
        SmallIPA::check_eccvm_evaluations_consistency(small_ipa_evaluations,
                                                      small_ipa_evaluation_challenge,
                                                      evaluation_challenge_x,
                                                      batching_challenge_v,
                                                      translation_masking_term_eval);

    // Compute the batched commitment and batched evaluation for the univariate opening claim
    FF batched_translation_evaluation = translation_evaluations.get_all()[0];
    FF batching_scalar = batching_challenge_v;

    Commitment batched_commitment;
    std::vector<FF> batching_challenges = { FF::one() };
    for (size_t idx = 1; idx < NUM_TRANSLATION_EVALUATIONS; ++idx) {
        batched_translation_evaluation += batching_scalar * translation_evaluations.get_all()[idx];
        batching_challenges.push_back(batching_scalar);
        batching_scalar *= batching_challenge_v;
    }
    if constexpr (IsRecursive) {
        batched_commitment = Commitment::batch_mul(translation_commitments, batching_challenges);
    } else {
        batched_commitment = batch_mul_native<Curve>(translation_commitments, batching_challenges);
    }

    // Place the claim to the array containing the SmallSubgroupIPA opening claims
    opening_claims[NUM_SMALL_IPA_EVALUATIONS] = { { evaluation_challenge_x, batched_translation_evaluation },
                                                  batched_commitment };

    // Compute `translation_masking_term_eval` * `evaluation_challenge_x`^{circuit_size -
    // NUM_DISABLED_ROWS_IN_SUMCHECK}
    shift_translation_masking_term_eval(evaluation_challenge_x, translation_masking_term_eval);
}

// Compute the accumulated result from translation evaluations
// This is the value that Translator will use in its relations
// Formula: accumulated_result = (op + v*Px + v²*Py + v³*z1 + v⁴*z2 - masking_term) / x
template <typename Flavor> void ECCVMVerifier_<Flavor>::compute_accumulated_result()
{
    FF v = batching_challenge_v;
    FF v_squared = v * v;
    FF v_cubed = v_squared * v;
    FF v_fourth = v_cubed * v;

    FF batched_eval_minus_masking = translation_evaluations.op + v * translation_evaluations.Px +
                                    v_squared * translation_evaluations.Py + v_cubed * translation_evaluations.z1 +
                                    v_fourth * translation_evaluations.z2 - translation_masking_term_eval;

    accumulated_result = batched_eval_minus_masking / evaluation_challenge_x;
}

// Explicit template instantiations
template class ECCVMVerifier_<ECCVMFlavor>;
template class ECCVMVerifier_<ECCVMRecursiveFlavor>;

} // namespace bb
