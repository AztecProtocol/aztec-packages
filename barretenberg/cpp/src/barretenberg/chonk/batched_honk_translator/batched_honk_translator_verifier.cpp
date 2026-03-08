#include "batched_honk_translator_verifier.hpp"

#include "barretenberg/commitment_schemes/shplonk/shplemini.hpp"
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/polynomials/gate_separator.hpp"
#include "barretenberg/polynomials/row_disabling_polynomial.hpp"
#include "barretenberg/relations/translator_vm/translator_decomposition_relation_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_delta_range_constraint_relation_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_extra_relations_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_non_native_field_relation_impl.hpp"
#include "barretenberg/relations/translator_vm/translator_permutation_relation_impl.hpp"
#include "barretenberg/stdlib/primitives/padding_indicator_array/padding_indicator_array.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/sumcheck/sumcheck_round.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"

namespace bb {

template <typename Curve>
BatchedHonkTranslatorVerifier_<Curve>::BatchedHonkTranslatorVerifier_(
    std::shared_ptr<HidingVKAndHash> hiding_vk_and_hash,
    std::shared_ptr<Transcript> transcript,
    const Proof& hiding_proof,
    const Proof& translator_proof,
    const TransBF& evaluation_input_x,
    const TransBF& batching_challenge_v,
    const TransBF& accumulated_result,
    const std::array<Commitment, TranslatorFlavor::NUM_OP_QUEUE_WIRES>& op_queue_wire_commitments)
    : hiding_vk_and_hash(std::move(hiding_vk_and_hash))
    , transcript(std::move(transcript))
    , hiding_proof(hiding_proof)
    , translator_proof(translator_proof)
    , evaluation_input_x(evaluation_input_x)
    , batching_challenge_v(batching_challenge_v)
    , accumulated_result(accumulated_result)
    , op_queue_wire_commitments(op_queue_wire_commitments)
{
    if constexpr (IsRecursive) {
        builder = hiding_proof.back().get_context();
    }
}

template <typename Curve>
typename BatchedHonkTranslatorVerifier_<Curve>::ReductionResult BatchedHonkTranslatorVerifier_<
    Curve>::reduce_to_pairing_check()
{
    using HidingShplemini = ShpleminiVerifier_<Curve, HidingFlavor::HasZK>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = typename ClaimBatcher::Batch;

    // -------------------------------------------------------------------------
    // Part 1: Hiding kernel pre-sumcheck (Oink phase)
    // -------------------------------------------------------------------------
    transcript->load_proof(hiding_proof);

    auto hiding_verifier_instance = std::make_shared<HidingVerifierInstance>(hiding_vk_and_hash);

    // Derive num_public_inputs from the Oink-only hiding proof.
    // hiding_proof contains: vk_hash + public_inputs + witness commitments (Oink data only, no sumcheck/PCS).
    const size_t num_public_inputs = hiding_proof.size() - ProofLength::Oink<HidingFlavor>::LENGTH_WITHOUT_PUB_INPUTS;

    OinkVerifier<HidingFlavor> oink_verifier{ hiding_verifier_instance, transcript, num_public_inputs };
    oink_verifier.verify();

    auto& hiding_params = hiding_verifier_instance->relation_parameters;
    hiding_relation_parameters = hiding_params;

    // Hiding kernel verifier commitments.
    typename HidingFlavor::VerifierCommitments hiding_commitments{ hiding_verifier_instance->get_vk(),
                                                                   hiding_verifier_instance->witness_commitments };
    if constexpr (HidingFlavor::HasZK) {
        hiding_commitments.gemini_masking_poly = hiding_verifier_instance->gemini_masking_commitment;
    }

    // -------------------------------------------------------------------------
    // Part 2: Translator pre-sumcheck (Oink-like phase)
    // Delegate to TranslatorVerifier_<TransFlavor>::receive_pre_sumcheck(), which:
    //   - loads translator_proof into the transcript,
    //   - hashes the VK, sets relation parameters from ECCVM inputs,
    //   - receives Gemini masking + wire commitments + beta/gamma + z_perm.
    // -------------------------------------------------------------------------
    TranslatorVerifier_<TransFlavor> trans_verifier(transcript,
                                                    translator_proof,
                                                    evaluation_input_x,
                                                    batching_challenge_v,
                                                    accumulated_result,
                                                    op_queue_wire_commitments);
    auto trans_commitments = trans_verifier.receive_pre_sumcheck();
    translator_relation_parameters = trans_verifier.relation_parameters;

    // -------------------------------------------------------------------------
    // Part 3: Joint sumcheck verification
    // -------------------------------------------------------------------------

    // Draw joint alpha after all pre-sumcheck commitments from both circuits.
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    // Compute α^{K_H}.
    FF alpha_power_KH = FF(1);
    for (size_t i = 0; i < HidingFlavor::NUM_SUBRELATIONS; i++) {
        alpha_power_KH *= alpha;
    }

    // Subrelation separators.
    auto hiding_alphas = initialize_relation_separator<FF, HidingFlavor::NUM_SUBRELATIONS - 1>(alpha);
    auto translator_alphas = initialize_relation_separator<FF, TransFlavor::NUM_SUBRELATIONS - 1>(alpha);

    static constexpr size_t JOINT_LOG_N = TranslatorFlavor::CONST_TRANSLATOR_LOG_N; // 17

    // Padding indicator arrays:
    // - Hiding kernel: computed in-circuit from the VK's log_circuit_size.
    // - Translator: all JOINT_LOG_N ones (full 2^17 circuit, no row disabling).
    std::vector<FF> hiding_padding = [&]() {
        if constexpr (IsRecursive) {
            return stdlib::compute_padding_indicator_array<Curve, JOINT_LOG_N>(
                hiding_vk_and_hash->vk->log_circuit_size);
        } else {
            const size_t hiding_log_n = static_cast<size_t>(hiding_vk_and_hash->vk->log_circuit_size);
            std::vector<FF> arr(JOINT_LOG_N, FF(0));
            for (size_t i = 0; i < hiding_log_n; i++) {
                arr[i] = FF(1);
            }
            return arr;
        }
    }();
    std::vector<FF> translator_padding(JOINT_LOG_N, FF(1));

    // Draw gate challenges.
    std::vector<FF> gate_challenges(JOINT_LOG_N);
    for (size_t i = 0; i < JOINT_LOG_N; i++) {
        gate_challenges[i] = transcript->template get_challenge<FF>("Sumcheck:gate_challenge_" + std::to_string(i));
    }

    // Receive Libra masking commitments.
    std::array<Commitment, NUM_LIBRA_COMMITMENTS> libra_commitments = {};
    libra_commitments[0] = transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");

    // ZK correction: receive Libra:Sum and Libra:Challenge to set initial target sum.
    FF libra_total_sum = transcript->template receive_from_prover<FF>("Libra:Sum");
    FF libra_challenge = transcript->template get_challenge<FF>("Libra:Challenge");

    // Initialise the joint sumcheck round verifier.
    // We use MegaZKFlavor's round verifier to process the 17 joint univariates (same degree 9).
    SumcheckVerifierRound<HidingFlavor> joint_round(libra_total_sum * libra_challenge);

    GateSeparatorPolynomial<FF> gate_sep(gate_challenges);

    std::vector<FF> joint_challenge;
    joint_challenge.reserve(JOINT_LOG_N);

    bool verified = true;
    typename HidingFlavor::AllValues hiding_evals;
    typename TransFlavor::AllValues trans_evals;

    for (size_t round_idx = 0; round_idx < JOINT_LOG_N; round_idx++) {
        joint_round.process_round(transcript, joint_challenge, gate_sep, FF(1), round_idx);
        verified = verified && !joint_round.round_failed;

        // Receive translator minicircuit evaluations at round LOG_MINI_CIRCUIT_SIZE - 1 = 12.
        if (round_idx == TranslatorFlavor::LOG_MINI_CIRCUIT_SIZE - 1) {
            TransFlavor::set_minicircuit_evaluations(
                trans_evals,
                transcript->template receive_from_prover<std::array<FF, TransFlavor::NUM_MINICIRCUIT_EVALUATIONS>>(
                    "Sumcheck:minicircuit_evaluations"));
        }
    }

    // -------------------------------------------------------------------------
    // Receive evaluations from both circuits.
    // -------------------------------------------------------------------------

    // Hiding kernel evaluations.
    {
        auto transcript_evals =
            transcript->template receive_from_prover<std::array<FF, HidingFlavor::NUM_ALL_ENTITIES>>(
                "Sumcheck:evaluations");
        for (auto [eval, te] : zip_view(hiding_evals.get_all(), transcript_evals)) {
            eval = te;
        }
    }

    // Translator evaluations (full-circuit subset, then complete from minicircuit + precomputed).
    {
        auto get_full_circuit_evals =
            transcript->template receive_from_prover<std::array<FF, TransFlavor::NUM_FULL_CIRCUIT_EVALUATIONS>>(
                "Sumcheck:evaluations_translator");
        TransFlavor::complete_full_circuit_evaluations(
            trans_evals, get_full_circuit_evals, std::span<const FF>(joint_challenge));
    }

    // Set OriginTag for recursive mode.
    if constexpr (IsRecursive) {
        const auto challenge_tag = joint_challenge.back().get_origin_tag();
        for (auto& eval : hiding_evals.get_all()) {
            eval.set_origin_tag(challenge_tag);
        }
        for (auto& eval : trans_evals.get_all()) {
            eval.set_origin_tag(challenge_tag);
        }
    }

    // -------------------------------------------------------------------------
    // Compute joint full-relation purported value.
    // -------------------------------------------------------------------------

    GateSeparatorPolynomial<FF> final_gate_sep(gate_challenges, joint_challenge);

    // Hiding kernel FRV (instance method, not static).
    SumcheckVerifierRound<HidingFlavor> hiding_frv_round;
    FF frv_hiding = hiding_frv_round.compute_full_relation_purported_value(
        hiding_evals, hiding_relation_parameters, final_gate_sep, hiding_alphas);

    // Apply row-disabling correction for hiding kernel.
    frv_hiding *= RowDisablingPolynomial<FF>::evaluate_at_challenge(joint_challenge, hiding_padding);

    // Translator FRV (no row-disabling; instance method).
    SumcheckVerifierRound<TransFlavor> trans_frv_round;
    FF frv_translator = trans_frv_round.compute_full_relation_purported_value(
        trans_evals, translator_relation_parameters, final_gate_sep, translator_alphas);

    // Combine: FRV_joint = FRV_hiding + α^{K_H} · FRV_translator.
    FF frv_joint = frv_hiding + alpha_power_KH * frv_translator;

    // Receive and apply Libra correction.
    const FF libra_evaluation = transcript->template receive_from_prover<FF>("Libra:claimed_evaluation");

    // Receive Libra grand-sum and quotient commitments (sent by SmallSubgroupIPA::prove() in
    // execute_joint_pcs(), which runs after execute_joint_sumcheck_rounds()).
    libra_commitments[1] = transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
    libra_commitments[2] = transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    if constexpr (IsRecursive) {
        // OriginTag false positive: libra_evaluation is PCS-bound (verified by Shplemini opening).
        const auto challenge_tag = joint_challenge.back().get_origin_tag();
        libra_evaluation.set_origin_tag(challenge_tag);
    }

    frv_joint += libra_evaluation * libra_challenge;

    // Final sumcheck check.
    verified = joint_round.perform_final_verification(frv_joint) && verified;

    // -------------------------------------------------------------------------
    // Part 4: Joint Shplemini / KZG PCS
    // -------------------------------------------------------------------------
    const Commitment one_commitment = [&]() {
        if constexpr (IsRecursive) {
            return Commitment::one(builder);
        } else {
            return Commitment::one();
        }
    }();

    // Build joint claim batchers.
    // get_unshifted/get_shifted return RefArrays; construct RefVectors explicitly so we can extend them.
    RefVector<Commitment> joint_unshifted_comms = hiding_commitments.get_unshifted();
    RefVector<FF> joint_unshifted_evals = hiding_evals.get_unshifted();
    RefVector<Commitment> joint_shifted_comms = hiding_commitments.get_to_be_shifted();
    RefVector<FF> joint_shifted_evals = hiding_evals.get_shifted();

    // Translator claim components.
    // Reconstructed concatenated shifted evaluations use the native TranslatorFlavor method.
    auto concat_shift_evals = TranslatorFlavor::reconstruct_concatenated_evaluations(
        trans_evals.get_groups_to_be_concatenated_shifted(), std::span<const FF>(joint_challenge));

    auto trans_unshifted_comms = trans_commitments.get_pcs_unshifted();
    auto trans_unshifted_evals = trans_evals.get_pcs_unshifted();
    auto trans_shifted_comms = trans_commitments.get_pcs_to_be_shifted();
    auto trans_pcs_shifted_evals = trans_evals.get_pcs_shifted();

    // Extend joint RefVectors with translator entries.
    for (auto& comm : trans_unshifted_comms) {
        joint_unshifted_comms.push_back(comm);
    }
    for (auto& eval : trans_unshifted_evals) {
        joint_unshifted_evals.push_back(eval);
    }
    for (auto& comm : trans_shifted_comms) {
        joint_shifted_comms.push_back(comm);
    }
    for (auto& eval : trans_pcs_shifted_evals) {
        joint_shifted_evals.push_back(eval);
    }
    for (auto& eval : concat_shift_evals) {
        joint_shifted_evals.push_back(eval);
    }

    ClaimBatcher joint_claim_batcher{ .unshifted = ClaimBatch{ joint_unshifted_comms, joint_unshifted_evals },
                                      .shifted = ClaimBatch{ joint_shifted_comms, joint_shifted_evals } };

    // Use a padding_indicator_array of all-ones for the joint Shplemini call.
    // Row-disabling has already been applied in the FRV computation above; Shplemini itself
    // does not need per-polynomial padding information.
    std::vector<FF> joint_padding(JOINT_LOG_N, FF(1));

    auto [opening_claim, consistency_checked] =
        HidingShplemini::compute_batch_opening_claim(joint_padding,
                                                     joint_claim_batcher,
                                                     joint_challenge,
                                                     one_commitment,
                                                     transcript,
                                                     RepeatedCommitmentsData{}, // joint set has no deduplication
                                                     libra_commitments,
                                                     libra_evaluation);

    auto pairing_points = HidingFlavor::PCS::reduce_verify_batch_opening_claim(std::move(opening_claim), transcript);

    vinfo("BatchedHonkTranslatorVerifier: sumcheck verified: ", verified);
    vinfo("BatchedHonkTranslatorVerifier: consistency checked: ", consistency_checked);

    return { pairing_points, verified && consistency_checked };
}

// Explicit instantiations.
template class BatchedHonkTranslatorVerifier_<curve::BN254>;
template class BatchedHonkTranslatorVerifier_<stdlib::bn254<UltraCircuitBuilder>>;

} // namespace bb
