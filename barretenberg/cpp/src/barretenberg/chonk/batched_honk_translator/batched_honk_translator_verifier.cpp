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
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/sumcheck/sumcheck_round.hpp"
#include "barretenberg/translator_vm/translator_verifier.hpp"
#include "barretenberg/ultra_honk/oink_verifier.hpp"

namespace bb {

template <typename Curve>
BatchedHonkTranslatorVerifier_<Curve>::BatchedHonkTranslatorVerifier_(
    std::shared_ptr<MegaZKVKAndHash> mega_zk_vk_and_hash, std::shared_ptr<Transcript> transcript)
    : mega_zk_vk_and_hash(std::move(mega_zk_vk_and_hash))
    , transcript(std::move(transcript))
{}

/**
 * @brief Verify the MegaZK circuit's Oink phase.
 * @details Loads the hiding proof, runs OinkVerifier, and returns the data callers need
 * between Phase 1 and Phase 2 (public inputs, kernel_calldata commitment, ECC op wires).
 * Populates mega_zk_relation_parameters.
 */
template <typename Curve>
typename BatchedHonkTranslatorVerifier_<Curve>::OinkResult BatchedHonkTranslatorVerifier_<Curve>::verify_mega_zk_oink(
    const Proof& mega_zk_proof)
{
    transcript->load_proof(mega_zk_proof);

    if constexpr (IsRecursive) {
        builder = mega_zk_proof.get_context();
    }

    mega_zk_verifier_instance = std::make_shared<MegaZKVerifierInstance>(mega_zk_vk_and_hash);

    // Derive num_public_inputs from the Oink-only MegaZK proof.
    if (mega_zk_proof.size() < ProofLength::Oink<MegaZKFlavorT>::LENGTH_WITHOUT_PUB_INPUTS) {
        throw_or_abort("MegaZK Oink proof too short to derive num_public_inputs");
    }
    const size_t num_public_inputs = mega_zk_proof.size() - ProofLength::Oink<MegaZKFlavorT>::LENGTH_WITHOUT_PUB_INPUTS;

    OinkVerifier<MegaZKFlavorT> oink_verifier{ mega_zk_verifier_instance, transcript, num_public_inputs };
    oink_verifier.verify(/*emit_alpha=*/false);

    mega_zk_relation_parameters = mega_zk_verifier_instance->relation_parameters;

    return OinkResult{
        .public_inputs = mega_zk_verifier_instance->public_inputs,
        .ecc_op_wires = mega_zk_verifier_instance->witness_commitments.get_ecc_op_wires().get_copy(),
        .kernel_calldata_commitment = mega_zk_verifier_instance->witness_commitments.kernel_calldata(),
    };
}

/**
 * @brief Verify the translator's Oink phase.
 * @details Delegates to TranslatorVerifier_::receive_pre_sumcheck(), which loads the translator
 * proof, hashes the VK, sets relation parameters, and receives wire + permutation commitments.
 * Populates translator_relation_parameters.
 */
template <typename Curve>
typename BatchedHonkTranslatorVerifier_<Curve>::TransVerifierCommitments BatchedHonkTranslatorVerifier_<
    Curve>::verify_translator_oink(const Proof& joint_proof,
                                   const TransBF& evaluation_input_x,
                                   const TransBF& batching_challenge_v,
                                   const TransBF& accumulated_result,
                                   const std::array<Commitment, TranslatorFlavor::NUM_OP_QUEUE_WIRES>&
                                       op_queue_wire_commitments)
{
    // Pass the full joint_proof to TranslatorVerifier. It calls
    // transcript->load_proof(proof) in receive_pre_sumcheck(), loading everything
    // (translator oink + joint sumcheck + joint PCS data) into the transcript buffer.
    // The joint phases that follow will read the remaining data in order.
    TranslatorVerifier_<TransFlavor> trans_verifier(transcript,
                                                    joint_proof,
                                                    evaluation_input_x,
                                                    batching_challenge_v,
                                                    accumulated_result,
                                                    op_queue_wire_commitments);
    auto trans_commitments = trans_verifier.receive_pre_sumcheck();
    translator_relation_parameters = trans_verifier.relation_parameters;
    return trans_commitments;
}

/**
 * @brief Verify the joint 17-round sumcheck.
 * @details Draws joint alpha, processes 17 sumcheck rounds, receives evaluations from both circuits,
 * computes the joint full-relation purported value, and performs final verification.
 * Populates joint_challenge, mega_zk_evals, trans_evals, libra_commitments, libra_evaluation, libra_challenge.
 * @return true if sumcheck verification passed.
 */
template <typename Curve> bool BatchedHonkTranslatorVerifier_<Curve>::verify_joint_sumcheck()
{
    static constexpr size_t JOINT_LOG_N = TranslatorFlavor::CONST_TRANSLATOR_LOG_N; // 17

    // Draw joint alpha after all pre-sumcheck commitments from both circuits.
    const FF alpha = transcript->template get_challenge<FF>("Sumcheck:alpha");

    // Compute α^{K_H}.
    FF alpha_power_KH = FF(1);
    for (size_t i = 0; i < MegaZKFlavorT::NUM_SUBRELATIONS; i++) {
        alpha_power_KH *= alpha;
    }

    // Subrelation separators.
    auto mega_zk_alphas = initialize_relation_separator<FF, MegaZKFlavorT::NUM_SUBRELATIONS - 1>(alpha);
    auto translator_alphas = initialize_relation_separator<FF, TransFlavor::NUM_SUBRELATIONS - 1>(alpha);

    // Draw gate challenges.
    std::vector<FF> gate_challenges =
        transcript->template get_dyadic_powers_of_challenge<FF>("Sumcheck:gate_challenge", JOINT_LOG_N);

    // Receive Libra masking commitments.
    libra_commitments = {};
    libra_commitments[0] = transcript->template receive_from_prover<Commitment>("Libra:concatenation_commitment");

    // ZK correction: receive Libra:Sum and Libra:Challenge to set initial target sum.
    FF libra_total_sum = transcript->template receive_from_prover<FF>("Libra:Sum");
    libra_challenge = transcript->template get_challenge<FF>("Libra:Challenge");

    // Use committed sumcheck infrastructure: defers per-round checks to Shplemini.
    static constexpr bool UseCommittedSumcheck = true;
    SumcheckVerifierRound<MegaZKFlavorT, UseCommittedSumcheck> joint_round(libra_total_sum * libra_challenge);

    GateSeparatorPolynomial<FF> gate_sep(gate_challenges);

    joint_challenge.clear();
    joint_challenge.reserve(JOINT_LOG_N);

    for (size_t round_idx = 0; round_idx < JOINT_LOG_N; round_idx++) {
        joint_round.process_round(transcript, joint_challenge, gate_sep, round_idx);

        if (round_idx == TranslatorFlavor::LOG_MINI_CIRCUIT_SIZE - 1) {
            TransFlavor::set_minicircuit_evaluations(
                trans_evals,
                transcript->template receive_from_prover<std::array<FF, TransFlavor::NUM_MINICIRCUIT_EVALUATIONS>>(
                    "Sumcheck:minicircuit_evaluations"));
        }
    }

    // Receive MegaZK evaluations after all rounds — full N-variable multilinear evaluations.
    {
        auto transcript_evals =
            transcript->template receive_from_prover<std::array<FF, MegaZKFlavorT::NUM_ALL_ENTITIES>>(
                "Sumcheck:evaluations");
        for (auto [eval, te] : zip_view(mega_zk_evals.get_all(), transcript_evals)) {
            eval = te;
        }
    }

    // Receive translator evaluations (full-circuit subset, then complete from minicircuit + precomputed).
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
        for (auto& eval : mega_zk_evals.get_all()) {
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

    // MegaZK circuit FRV: evaluations are full N-variable multilinear evaluations.
    SumcheckVerifierRound<MegaZKFlavorT> mega_zk_frv_round;
    FF frv_mega_zk = mega_zk_frv_round.compute_full_relation_purported_value(
        mega_zk_evals, mega_zk_relation_parameters, final_gate_sep, mega_zk_alphas, joint_challenge);

    // Translator FRV (no row-disabling).
    SumcheckVerifierRound<TransFlavor> trans_frv_round;
    FF frv_translator = trans_frv_round.compute_full_relation_purported_value(
        trans_evals, translator_relation_parameters, final_gate_sep, translator_alphas);

    // Combine: FRV_joint = FRV_MZK + α^{K_H} · FRV_translator.
    FF frv_joint = frv_mega_zk + alpha_power_KH * frv_translator;

    // Receive and apply Libra correction.
    libra_evaluation = transcript->template receive_from_prover<FF>("Libra:claimed_evaluation");

    // Receive Libra grand-sum and quotient commitments.
    libra_commitments[1] = transcript->template receive_from_prover<Commitment>("Libra:grand_sum_commitment");
    libra_commitments[2] = transcript->template receive_from_prover<Commitment>("Libra:quotient_commitment");

    if constexpr (IsRecursive) {
        const auto challenge_tag = joint_challenge.back().get_origin_tag();
        libra_evaluation.set_origin_tag(challenge_tag);
    }

    frv_joint += libra_evaluation * libra_challenge;

    // Final verification via committed sumcheck round: checks first-round sum and populates Shplemini data.
    bool verified = joint_round.perform_final_verification(frv_joint);
    round_univariate_commitments = std::move(joint_round.round_univariate_commitments);
    round_univariate_evaluations = std::move(joint_round.round_univariate_evaluations);

    return verified;
}

/**
 * @brief Execute the joint Shplemini / KZG PCS reduction.
 * @details Combines commitments and evaluations from both circuits into a single batch opening
 * claim, then reduces to a KZG pairing check.
 */
template <typename Curve>
typename BatchedHonkTranslatorVerifier_<Curve>::ReductionResult BatchedHonkTranslatorVerifier_<Curve>::verify_joint_pcs(
    bool sumcheck_verified, MegaZKVerifierCommitments& mega_zk_commitments, TransVerifierCommitments& trans_commitments)
{
    using MegaZKShplemini = ShpleminiVerifier_<Curve, MegaZKFlavorT::HasZK>;
    using ClaimBatcher = ClaimBatcher_<Curve>;
    using ClaimBatch = typename ClaimBatcher::Batch;

    const Commitment one_commitment = [&]() {
        if constexpr (IsRecursive) {
            return Commitment::one(builder);
        } else {
            return Commitment::one();
        }
    }();

    // Translator claim components (translator first: its masking poly must be at position 0 for Shplemini offset=2).
    auto concat_shift_evals = TranslatorFlavor::reconstruct_concatenated_evaluations(
        trans_evals.get_groups_to_be_concatenated_shifted(), std::span<const FF>(joint_challenge));

    RefVector<Commitment> joint_unshifted_comms = trans_commitments.get_pcs_unshifted();
    RefVector<FF> joint_unshifted_evals = trans_evals.get_pcs_unshifted();

    // Append MegaZK unshifted (no masking poly — translator provides the joint masking poly).
    for (auto& comm : mega_zk_commitments.get_unshifted()) {
        joint_unshifted_comms.push_back(comm);
    }
    for (auto& eval : mega_zk_evals.get_unshifted()) {
        joint_unshifted_evals.push_back(eval);
    }

    // Shifted: MegaZK first, then translator.
    RefVector<Commitment> joint_shifted_comms = mega_zk_commitments.get_to_be_shifted();
    RefVector<FF> joint_shifted_evals = mega_zk_evals.get_shifted();

    auto trans_shifted_comms = trans_commitments.get_pcs_to_be_shifted();
    auto trans_pcs_shifted_evals = trans_evals.get_pcs_shifted();
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

    auto [opening_claim, consistency_checked] =
        MegaZKShplemini::compute_batch_opening_claim(joint_claim_batcher,
                                                     joint_challenge,
                                                     one_commitment,
                                                     transcript,
                                                     REPEATED_COMMITMENTS,
                                                     libra_commitments,
                                                     libra_evaluation,
                                                     round_univariate_commitments,
                                                     round_univariate_evaluations);

    auto pairing_points = MegaZKFlavorT::PCS::reduce_verify_batch_opening_claim(std::move(opening_claim), transcript);

    return { pairing_points, sumcheck_verified && consistency_checked };
}

template <typename Curve>
typename BatchedHonkTranslatorVerifier_<Curve>::ReductionResult BatchedHonkTranslatorVerifier_<Curve>::verify(
    const Proof& joint_proof,
    const TransBF& evaluation_input_x,
    const TransBF& batching_challenge_v,
    const TransBF& accumulated_result,
    const std::array<Commitment, TranslatorFlavor::NUM_OP_QUEUE_WIRES>& op_queue_wire_commitments)
{
    // Reconstruct MegaZK commitments from the stored verifier instance.
    MegaZKVerifierCommitments mega_zk_commitments = VerifierCommitmentsConstructor<MegaZKFlavorT>::construct(
        mega_zk_verifier_instance->get_vk(), mega_zk_verifier_instance->witness_commitments);
    auto trans_commitments = verify_translator_oink(
        joint_proof, evaluation_input_x, batching_challenge_v, accumulated_result, op_queue_wire_commitments);
    bool sumcheck_verified = verify_joint_sumcheck();
    return verify_joint_pcs(sumcheck_verified, mega_zk_commitments, trans_commitments);
}

// Explicit instantiations.
template class BatchedHonkTranslatorVerifier_<curve::BN254>;
template class BatchedHonkTranslatorVerifier_<stdlib::bn254<UltraCircuitBuilder>>;

} // namespace bb
