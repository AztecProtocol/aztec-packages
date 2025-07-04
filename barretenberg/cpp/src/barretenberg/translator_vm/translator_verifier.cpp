// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "./translator_verifier.hpp"
#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/transcript/transcript.hpp"

namespace bb {

TranslatorVerifier::TranslatorVerifier(const std::shared_ptr<Transcript>& transcript)
    : transcript(transcript)
{}

TranslatorVerifier::TranslatorVerifier(const std::shared_ptr<VerificationKey>& verifier_key,
                                       const std::shared_ptr<Transcript>& transcript)
    : key(verifier_key)
    , transcript(transcript)
{}

void TranslatorVerifier::put_translation_data_in_relation_parameters(const uint256_t& evaluation_input_x,
                                                                     const BF& batching_challenge_v,
                                                                     const uint256_t& accumulated_result)
{

    const auto compute_four_limbs = [](const auto& in) {
        constexpr size_t NUM_LIMB_BITS = Flavor::NUM_LIMB_BITS;
        return std::array<FF, 4>{ in.slice(0, NUM_LIMB_BITS),
                                  in.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2),
                                  in.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3),
                                  in.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4) };
    };

    const auto compute_five_limbs = [](const auto& in) {
        constexpr size_t NUM_LIMB_BITS = Flavor::NUM_LIMB_BITS;
        return std::array<FF, 5>{ in.slice(0, NUM_LIMB_BITS),
                                  in.slice(NUM_LIMB_BITS, NUM_LIMB_BITS * 2),
                                  in.slice(NUM_LIMB_BITS * 2, NUM_LIMB_BITS * 3),
                                  in.slice(NUM_LIMB_BITS * 3, NUM_LIMB_BITS * 4),
                                  in };
    };

    relation_parameters.evaluation_input_x = compute_five_limbs(evaluation_input_x);

    uint256_t batching_challenge_v_power{ batching_challenge_v };
    for (size_t i = 0; i < 4; i++) {
        relation_parameters.batching_challenge_v[i] = compute_five_limbs(batching_challenge_v_power);
        batching_challenge_v_power = BF(batching_challenge_v_power) * batching_challenge_v;
    }

    relation_parameters.accumulated_result = compute_four_limbs(accumulated_result);
};

/**
 * @brief This function verifies a TranslatorFlavor Honk proof for given program settings.
 */
bool TranslatorVerifier::verify_proof(const HonkProof& proof,
                                      const uint256_t& evaluation_input_x,
                                      const BF& batching_challenge_v)
{
    using Curve = Flavor::Curve;
    using PCS = Flavor::PCS;
    using Shplemini = ShpleminiVerifier_<Curve>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;
    using InterleavedBatch = ClaimBatcher::InterleavedBatch;
    using Sumcheck = SumcheckVerifier<Flavor, Flavor::CONST_TRANSLATOR_LOG_N>;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;

    // Load the proof produced by the translator prover
    transcript->load_proof(proof);

    Flavor::VerifierCommitments commitments{ key };
    Flavor::CommitmentLabels commitment_labels;

    const BF accumulated_result = transcript->template receive_from_prover<BF>("accumulated_result");

    put_translation_data_in_relation_parameters(evaluation_input_x, batching_challenge_v, accumulated_result);

    // Get commitments to wires and the ordered range constraints that do not require additional challenges
    for (auto [comm, label] : zip_view(commitments.get_wires_and_ordered_range_constraints(),
                                       commitment_labels.get_wires_and_ordered_range_constraints())) {
        comm = transcript->template receive_from_prover<Commitment>(label);
    }
    op_queue_commitments = { commitments.op, commitments.x_lo_y_hi, commitments.x_hi_z_1, commitments.y_lo_z_2 };

    // Get permutation challenges
    FF beta = transcript->template get_challenge<FF>("beta");
    FF gamma = transcript->template get_challenge<FF>("gamma");

    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;

    // Get commitment to permutation and lookup grand products
    commitments.z_perm = transcript->template receive_from_prover<Commitment>(commitment_labels.z_perm);

    // Each linearly independent subrelation contribution is multiplied by `alpha^i`, where
    //  i = 0, ..., NUM_SUBRELATIONS- 1.
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    // Execute Sumcheck Verifier
    Sumcheck sumcheck(transcript, alpha);

    std::vector<FF> gate_challenges(Flavor::CONST_TRANSLATOR_LOG_N);
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    // Receive commitments to Libra masking polynomials
    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};
    libra_commitments[0] = transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");

    std::array<FF, TranslatorFlavor::CONST_TRANSLATOR_LOG_N> padding_indicator_array;
    std::ranges::fill(padding_indicator_array, FF{ 1 });

    auto sumcheck_output = sumcheck.verify(relation_parameters, gate_challenges, padding_indicator_array);

    // If Sumcheck did not verify, return false
    if (!sumcheck_output.verified) {
        return false;
    }

    libra_commitments[1] = transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
    libra_commitments[2] = transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    // Execute Shplemini
    bool consistency_checked = false;
    ClaimBatcher claim_batcher{
        .unshifted = ClaimBatch{ commitments.get_unshifted_without_interleaved(),
                                 sumcheck_output.claimed_evaluations.get_unshifted_without_interleaved() },
        .shifted = ClaimBatch{ commitments.get_to_be_shifted(), sumcheck_output.claimed_evaluations.get_shifted() },
        .interleaved = InterleavedBatch{ .commitments_groups = commitments.get_groups_to_be_interleaved(),
                                         .evaluations = sumcheck_output.claimed_evaluations.get_interleaved() }
    };
    const BatchOpeningClaim<Curve> opening_claim =
        Shplemini::compute_batch_opening_claim(padding_indicator_array,
                                               claim_batcher,
                                               sumcheck_output.challenge,
                                               Commitment::one(),
                                               transcript,
                                               Flavor::REPEATED_COMMITMENTS,
                                               Flavor::HasZK,
                                               &consistency_checked,
                                               libra_commitments,
                                               sumcheck_output.claimed_libra_evaluation);
    const auto pairing_points = PCS::reduce_verify_batch_opening_claim(opening_claim, transcript);

    VerifierCommitmentKey pcs_vkey{};
    auto verified = pcs_vkey.pairing_check(pairing_points[0], pairing_points[1]);
    return verified && consistency_checked;
}

bool TranslatorVerifier::verify_translation(const TranslationEvaluations& translation_evaluations,
                                            const BF& translation_masking_term_eval)
{
    const auto reconstruct_from_array = [&](const auto& arr) {
        const BF elt_0 = (static_cast<uint256_t>(arr[0]));
        const BF elt_1 = (static_cast<uint256_t>(arr[1]) << 68);
        const BF elt_2 = (static_cast<uint256_t>(arr[2]) << 136);
        const BF elt_3 = (static_cast<uint256_t>(arr[3]) << 204);
        const BF reconstructed = elt_0 + elt_1 + elt_2 + elt_3;
        return reconstructed;
    };

    const auto& reconstruct_value_from_eccvm_evaluations = [&](const TranslationEvaluations& translation_evaluations,
                                                               auto& relation_parameters) {
        const BF accumulated_result = reconstruct_from_array(relation_parameters.accumulated_result);
        const BF x = reconstruct_from_array(relation_parameters.evaluation_input_x);
        const BF v1 = reconstruct_from_array(relation_parameters.batching_challenge_v[0]);
        const BF v2 = reconstruct_from_array(relation_parameters.batching_challenge_v[1]);
        const BF v3 = reconstruct_from_array(relation_parameters.batching_challenge_v[2]);
        const BF v4 = reconstruct_from_array(relation_parameters.batching_challenge_v[3]);
        const BF& op = translation_evaluations.op;
        const BF& Px = translation_evaluations.Px;
        const BF& Py = translation_evaluations.Py;
        const BF& z1 = translation_evaluations.z1;
        const BF& z2 = translation_evaluations.z2;

        const BF eccvm_opening = (op + (v1 * Px) + (v2 * Py) + (v3 * z1) + (v4 * z2)) - translation_masking_term_eval;
        // multiply by x here to deal with shift
        return x * accumulated_result == eccvm_opening;
    };

    bool is_value_reconstructed =
        reconstruct_value_from_eccvm_evaluations(translation_evaluations, relation_parameters);
    return is_value_reconstructed;
}

/**
 * @brief Checks that translator and merge protocol operate on the same EccOpQueue data.
 *
 * @details The final merge verifier receives commitments to 4 polynomials whose coefficients are the values of the full
 * op queue (referred to as the ultra ops table in the merge protocol). These have to match the EccOpQueue commitments
 * received by the translator verifier, representing 4 wires in its circuit, to ensure the two Goblin components,
 * both operating on the UltraOp version of the op queue, actually use the same data.
 */
bool TranslatorVerifier::verify_consistency_with_final_merge(const std::array<Commitment, 4> merge_commitments)
{
    if (op_queue_commitments[0] != merge_commitments[0]) {
        info("Consistency check failed: op commitment mismatch");
        return false;
    }

    if (op_queue_commitments[1] != merge_commitments[1]) {
        info("Consistency check failed: x_lo_y_hi commitment mismatch");
        return false;
    }

    if (op_queue_commitments[2] != merge_commitments[2]) {
        info("Consistency check failed: x_hi_z_1 commitment mismatch");
        return false;
    }

    if (op_queue_commitments[3] != merge_commitments[3]) {
        info("Consistency check failed: y_lo_z_2 commitment mismatch");
        return false;
    }

    return true;
}
} // namespace bb
