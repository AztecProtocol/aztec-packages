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
bool TranslatorVerifier::verify_proof(
    const HonkProof& proof,
    const uint256_t& evaluation_input_x,
    const BF& batching_challenge_v,
    const uint256_t& accumulated_result,
    const std::array<Commitment, TranslatorFlavor::NUM_OP_QUEUE_WIRES>& op_queue_wire_commitments)
{
    using Curve = Flavor::Curve;
    using PCS = Flavor::PCS;
    using Shplemini = ShpleminiVerifier_<Curve>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = ClaimBatcher::Batch;
    using InterleavedBatch = ClaimBatcher::InterleavedBatch;
    using Sumcheck = SumcheckVerifier<Flavor>;
    using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;

    // Load the proof produced by the translator prover
    transcript->load_proof(proof);

    // Fiat-Shamir the vk hash
    typename Flavor::FF vk_hash = key->hash();
    transcript->add_to_hash_buffer("vk_hash", vk_hash);
    vinfo("Translator vk hash in verifier: ", vk_hash);

    Flavor::VerifierCommitments commitments{ key };
    Flavor::CommitmentLabels commitment_labels;

    // Use accumulated_result from ECCVM verifier instead of receiving from transcript
    put_translation_data_in_relation_parameters(evaluation_input_x, batching_challenge_v, accumulated_result);

    // Receive Gemini masking polynomial commitment (for ZK-PCS)
    commitments.gemini_masking_poly = transcript->template receive_from_prover<Commitment>("Gemini:masking_poly_comm");

    // Set op queue wire commitments (provided by merge protocol, not from translator proof)
    commitments.op = op_queue_wire_commitments[0];
    commitments.x_lo_y_hi = op_queue_wire_commitments[1];
    commitments.x_hi_z_1 = op_queue_wire_commitments[2];
    commitments.y_lo_z_2 = op_queue_wire_commitments[3];

    // Receive commitments to non-op-queue wires and ordered range constraints
    for (auto [comm, label] : zip_view(commitments.get_non_opqueue_wires_and_ordered_range_constraints(),
                                       commitment_labels.get_non_opqueue_wires_and_ordered_range_constraints())) {
        comm = transcript->template receive_from_prover<Commitment>(label);
    }

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
    Sumcheck sumcheck(transcript, alpha, Flavor::CONST_TRANSLATOR_LOG_N);

    std::vector<FF> gate_challenges(Flavor::CONST_TRANSLATOR_LOG_N);
    for (size_t idx = 0; idx < gate_challenges.size(); idx++) {
        gate_challenges[idx] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(idx));
    }

    // Receive commitments to Libra masking polynomials
    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};
    libra_commitments[0] = transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");

    std::vector<FF> padding_indicator_array(Flavor::CONST_TRANSLATOR_LOG_N);
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
} // namespace bb
