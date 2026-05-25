// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "chonk_verifier.hpp"
#include "barretenberg/chonk/batched_honk_translator/batched_honk_translator_verifier.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/goblin/goblin.hpp"

namespace bb {

/**
 * @brief Run all Chonk verification except IPA, returning the IPA data for deferred verification.
 *
 * @details Verification flow on a shared transcript:
 *   1. MegaZK Oink → extract HidingKernelIO (t_j, T_prev, calldata commitment)
 *   2. Databus consistency check
 *   3. Merge verification (using t_j, T_prev)
 *   4. ECCVM verification → get v, x, accumulated_result, IPA claim
 *   5. Translator Oink + Joint sumcheck + Joint PCS → pairing check
 */
template <> ChonkVerifier<false>::IPAReductionResult ChonkVerifier<false>::reduce_to_ipa_claim(const Proof& proof)
{
    BB_BENCH_NAME("ChonkVerifier::reduce_to_ipa_claim");

    // Step 1: Verify MegaZK Oink on the shared transcript
    BatchedHonkTranslatorVerifier batched_verifier(vk_and_hash, transcript);
    auto oink_result = batched_verifier.verify_mega_zk_oink(proof.hiding_oink_proof);

    // Extract public inputs and kernel data
    HidingKernelIO kernel_io;
    kernel_io.reconstruct_from_public(oink_result.public_inputs);

    // Check accumulated pairing points from the IVC chain (inner recursive verifications)
    if (!kernel_io.pairing_inputs.check()) {
        info("ChonkVerifier: verification failed at PI pairing points check");
        return { {}, {}, false };
    }

    // Step 2: Databus consistency check
    const Commitment kernel_calldata_commitment = oink_result.kernel_calldata_commitment;
    const Commitment return_data_commitment = kernel_io.kernel_return_data;
    bool databus_consistency_verified = (kernel_calldata_commitment == return_data_commitment);
    vinfo("ChonkVerifier: databus consistency verified: ", databus_consistency_verified);
    if (!databus_consistency_verified) {
        info("ChonkVerifier: verification failed at databus consistency check");
        return { {}, {}, false };
    }

    // Step 3: Merge verification
    // These commitments are already in the shared Fiat-Shamir transcript: Oink read the ecc-op wire commitments
    // directly, and it read the public inputs from which HidingKernelIO reconstructs the prior table commitments.
    MergeCommitments merge_commitments{ .t_commitments = oink_result.ecc_op_wires,
                                        .T_prev_commitments = kernel_io.ecc_op_tables };
    GoblinVerifier::MergeVerifier merge_verifier{ transcript };
    auto merge_result = merge_verifier.reduce_to_pairing_check(proof.merge_proof, merge_commitments);
    vinfo("ChonkVerifier: Merge reduced to pairing check: ", merge_result.reduction_succeeded ? "true" : "false");

    if (!merge_result.reduction_succeeded) {
        info("ChonkVerifier: verification failed at Merge reduction");
        return { {}, {}, false };
    }
    if (!merge_result.pairing_points.check()) {
        info("ChonkVerifier: verification failed at Merge pairing check");
        return { {}, {}, false };
    }

    // Step 4: ECCVM verification
    ECCVMVerifier_<ECCVMFlavor> eccvm_verifier{ transcript, proof.eccvm_proof };
    auto eccvm_result = eccvm_verifier.reduce_to_ipa_opening();
    vinfo("ChonkVerifier: ECCVM reduced to IPA opening: ", eccvm_result.reduction_succeeded ? "true" : "false");

    if (!eccvm_result.reduction_succeeded) {
        info("ChonkVerifier: verification failed at ECCVM step");
        return { {}, {}, false };
    }
    auto translator_input = eccvm_verifier.get_translator_input_data();

    // Step 5: Translator Oink + Joint sumcheck + Joint PCS
    auto batched_result = batched_verifier.verify(proof.joint_proof,
                                                  translator_input.evaluation_challenge_x,
                                                  translator_input.batching_challenge_v,
                                                  translator_input.accumulated_result,
                                                  merge_result.merged_commitments);
    vinfo("ChonkVerifier: Batched translator+joint reduction: ", batched_result.reduction_succeeded ? "true" : "false");

    if (!batched_result.reduction_succeeded) {
        info("ChonkVerifier: verification failed at batched translator+joint reduction");
        return { {}, {}, false };
    }
    if (!batched_result.pairing_points.check()) {
        info("ChonkVerifier: verification failed at batched translator+joint pairing check");
        return { {}, {}, false };
    }

    return { std::move(eccvm_result.ipa_claim), proof.ipa_proof, true };
}

/**
 * @brief Verifies a Chonk IVC proof (Native specialization).
 */
template <> ChonkVerifier<false>::Output ChonkVerifier<false>::verify(const Proof& proof)
{
    BB_BENCH_NAME("ChonkVerifier::verify");
    auto result = reduce_to_ipa_claim(proof);
    if (!result.all_checks_passed) {
        return false;
    }

    // Step 6: Verify IPA opening
    auto ipa_transcript = std::make_shared<Goblin::Transcript>(result.ipa_proof);
    auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
    bool ipa_verified = IPA<curve::Grumpkin>::reduce_verify(ipa_vk, result.ipa_claim, ipa_transcript);
    vinfo("ChonkVerifier: Goblin IPA verified: ", ipa_verified);
    if (!ipa_verified) {
        info("ChonkVerifier: Chonk verification failed at IPA check");
        return false;
    }

    return true;
}

/**
 * @brief Verifies a Chonk IVC proof in-circuit.
 *
 * @details Verification flow on a shared transcript:
 *   1. MegaZK Oink → extract HidingKernelIO (pairing points, calldata, ecc_op_tables)
 *   2. Databus consistency check (in-circuit)
 *   3. Merge verification → merge pairing points
 *   4. ECCVM verification → IPA claim + translator input data
 *   5. Translator Oink + Joint sumcheck + Joint PCS → batched pairing points
 *   6. Aggregate all pairing points (PI, Merge, Batched PCS)
 *
 * Returns ReductionResult with aggregated pairing points and IPA claim for deferred verification.
 */
template <> ChonkVerifier<true>::Output ChonkVerifier<true>::verify(const Proof& proof)
{
    // Step 1: Verify MegaZK Oink on the shared transcript
    BatchedHonkTranslatorRecursiveVerifier batched_verifier(vk_and_hash, transcript);
    auto oink_result = batched_verifier.verify_mega_zk_oink(proof.hiding_oink_proof);

    // Extract public inputs and kernel data
    HidingKernelIO kernel_io;
    kernel_io.reconstruct_from_public(oink_result.public_inputs);

    // Step 2: Databus consistency check (in-circuit)
    const Commitment kernel_calldata_commitment = oink_result.kernel_calldata_commitment;
    if (kernel_io.kernel_return_data.get_value() != kernel_calldata_commitment.get_value()) {
        info("ChonkRecursiveVerifier: Databus Consistency check failure");
    }
    kernel_io.kernel_return_data.incomplete_assert_equal(kernel_calldata_commitment);

    // Step 3: Merge verification
    // These commitments are already in the shared Fiat-Shamir transcript: Oink read the ecc-op wire commitments
    // directly, and it read the public inputs from which HidingKernelIO reconstructs the prior table commitments.
    MergeCommitments merge_commitments{ .t_commitments = oink_result.ecc_op_wires,
                                        .T_prev_commitments = kernel_io.ecc_op_tables };
    typename GoblinVerifier::MergeVerifier merge_verifier{ transcript };
    auto merge_result = merge_verifier.reduce_to_pairing_check(proof.merge_proof, merge_commitments);
    vinfo("ChonkRecursiveVerifier: Merge reduced to pairing check: ",
          merge_result.reduction_succeeded ? "true" : "false");

    // Step 4: ECCVM verification
    typename GoblinVerifier::ECCVMVerifier eccvm_verifier{ transcript, proof.eccvm_proof };
    auto eccvm_result = eccvm_verifier.reduce_to_ipa_opening();
    vinfo("ChonkRecursiveVerifier: ECCVM reduced to IPA opening: ",
          eccvm_result.reduction_succeeded ? "true" : "false");
    auto translator_input = eccvm_verifier.get_translator_input_data();

    // Step 5: Translator Oink + Joint sumcheck + Joint PCS
    auto batched_result = batched_verifier.verify(proof.joint_proof,
                                                  translator_input.evaluation_challenge_x,
                                                  translator_input.batching_challenge_v,
                                                  translator_input.accumulated_result,
                                                  merge_result.merged_commitments);
    vinfo("ChonkRecursiveVerifier: Batched translator+joint reduction: ",
          batched_result.reduction_succeeded ? "true" : "false");

    // Step 6: Aggregate all pairing points (PI, Merge, Batched PCS)
    std::vector<PairingPoints> pairing_points_to_aggregate;
    pairing_points_to_aggregate.reserve(NUM_PAIRING_POINTS);

    pairing_points_to_aggregate.push_back(kernel_io.pairing_inputs);
    pairing_points_to_aggregate.push_back(std::move(merge_result.pairing_points));
    pairing_points_to_aggregate.push_back(std::move(batched_result.pairing_points));

    // Edge case handling disabled: Safe because:
    // 1. Verifier-computed points (Merge, Batched PCS) are deterministic and won't collide
    // 2. PI points are added to the result of batching the above points; biggroup addition
    //    gracefully handles edge cases.
    constexpr bool handle_edge_cases = false;
    PairingPoints aggregated_pairing_points =
        PairingPoints::aggregate_multiple(pairing_points_to_aggregate, handle_edge_cases);

    bool all_checks_passed =
        merge_result.reduction_succeeded && eccvm_result.reduction_succeeded && batched_result.reduction_succeeded;

    return ReductionResult{ .pairing_points = std::move(aggregated_pairing_points),
                            .ipa_claim = std::move(eccvm_result.ipa_claim),
                            .ipa_proof = proof.ipa_proof,
                            .all_checks_passed = all_checks_passed };
}

/**
 * @brief Stub for recursive mode (not meaningful — reduce_to_ipa_claim is only used in native batch verification).
 */
template <>
ChonkVerifier<true>::IPAReductionResult ChonkVerifier<true>::reduce_to_ipa_claim([[maybe_unused]] const Proof& proof)
{
    throw_or_abort("reduce_to_ipa_claim is only available for native (non-recursive) ChonkVerifier");
}

// Template instantiations
template class ChonkVerifier<false>; // Native verifier
template class ChonkVerifier<true>;  // Recursive verifier

} // namespace bb
