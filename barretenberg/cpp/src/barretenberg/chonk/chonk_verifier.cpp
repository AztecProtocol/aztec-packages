// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "chonk_verifier.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"

namespace bb {

/**
 * @brief Verifies a Chonk IVC proof (Native specialization).
 */
template <> ChonkVerifier<false>::Output ChonkVerifier<false>::verify(const Proof& proof)
{
    // Step 1: Verify the Hiding kernel proof (includes pairing check)
    HidingKernelVerifier verifier{ vk_and_hash, transcript };
    auto verifier_output = verifier.verify_proof(proof.mega_proof);
    if (!verifier_output.result) {
        info("ChonkVerifier: verification failed at MegaZK verification step");
        return false;
    }

    // Extract public inputs and kernel data
    HidingKernelIO kernel_io;
    kernel_io.reconstruct_from_public(verifier.get_public_inputs());

    // Step 2: Perform databus consistency check
    const Commitment calldata_commitment = verifier.get_calldata_commitment();
    const Commitment return_data_commitment = kernel_io.kernel_return_data;
    bool databus_consistency_verified = (calldata_commitment == return_data_commitment);
    vinfo("ChonkVerifier: databus consistency verified: ", databus_consistency_verified);
    if (!databus_consistency_verified) {
        info("Chonk Verifier: verification failed at databus consistency check");
        return false;
    }

    // Step 3: Goblin verification (merge, eccvm, translator)
    MergeCommitments merge_commitments{ .t_commitments = verifier.get_ecc_op_wires(),
                                        .T_prev_commitments = kernel_io.ecc_op_tables };
    GoblinVerifier goblin_verifier{ transcript, proof.goblin_proof, merge_commitments, MergeSettings::APPEND };
    GoblinReductionResult goblin_output = goblin_verifier.reduce_to_pairing_check_and_ipa_opening();

    if (!goblin_output.all_checks_passed) {
        info("ChonkVerifier: chonk verification failed at Goblin checks (merge/eccvm/translator reduction + pairing)");
        return false;
    }

    // Step 4: Verify IPA opening
    auto ipa_transcript = std::make_shared<Goblin::Transcript>(goblin_output.ipa_proof);
    auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
    bool ipa_verified = IPA<curve::Grumpkin>::reduce_verify(ipa_vk, goblin_output.ipa_claim, ipa_transcript);
    vinfo("ChonkVerifier: Goblin IPA verified: ", ipa_verified);
    if (!ipa_verified) {
        info("ChonkVerifier: Chonk verification failed at IPA check");
        return false;
    }

    return true;
}

/**
 * @brief Verifies a Chonk IVC proof in-circuit.
 */
template <> ChonkVerifier<true>::Output ChonkVerifier<true>::verify(const Proof& proof)
{
    // Step 1: Reduce the Hiding kernel proof to pairing check
    HidingKernelVerifier verifier{ vk_and_hash, transcript };
    auto [mega_pcs_pairing_points, mega_reduction_succeeded] = verifier.reduce_to_pairing_check(proof.mega_proof);
    vinfo("ChonkRecursiveVerifier: MegaZK reduced to pairing check: ", mega_reduction_succeeded ? "true" : "false");

    // Extract public inputs and kernel data
    HidingKernelIO kernel_io;
    kernel_io.reconstruct_from_public(verifier.get_public_inputs());

    // Step 2: Perform databus consistency check (in-circuit)
    const Commitment calldata_commitment = verifier.get_calldata_commitment();
    if (kernel_io.kernel_return_data.get_value() != calldata_commitment.get_value()) {
        info("ChonkRecursiveVerifier: Databus Consistency check failure");
    }
    kernel_io.kernel_return_data.incomplete_assert_equal(calldata_commitment);

    // Step 3: Goblin verification (merge, eccvm, translator)
    MergeCommitments merge_commitments{ .t_commitments = verifier.get_ecc_op_wires(),
                                        .T_prev_commitments = kernel_io.ecc_op_tables };
    GoblinVerifier goblin_verifier{ transcript, proof.goblin_proof, merge_commitments, MergeSettings::APPEND };
    GoblinReductionResult goblin_output = goblin_verifier.reduce_to_pairing_check_and_ipa_opening();

    // Step 4: Batch aggregate all pairing points
    std::vector<PairingPoints> pairing_points_to_aggregate;
    pairing_points_to_aggregate.reserve(NUM_PAIRING_POINTS);

    // Collect all pairing points: PI, PCS, Merge, Translator
    pairing_points_to_aggregate.push_back(kernel_io.pairing_inputs);
    pairing_points_to_aggregate.push_back(std::move(mega_pcs_pairing_points));
    pairing_points_to_aggregate.push_back(std::move(goblin_output.merge_pairing_points));
    pairing_points_to_aggregate.push_back(std::move(goblin_output.translator_pairing_points));

    // Edge case handling disabled: Safe because:
    // 1. Verifier-computed points (PCS, Merge, Translator) are deterministic and won't collide
    // 2. PI points are added to to the result of batching of the above points, biggroup point addition gracefully
    // handles edge cases.
    constexpr bool handle_edge_cases = false;
    PairingPoints aggregated_pairing_points =
        PairingPoints::aggregate_multiple(pairing_points_to_aggregate, handle_edge_cases);

    // Return reduction result with aggregated pairing points
    return ReductionResult{ .pairing_points = std::move(aggregated_pairing_points),
                            .ipa_claim = std::move(goblin_output.ipa_claim),
                            .ipa_proof = std::move(goblin_output.ipa_proof),
                            .all_checks_passed = mega_reduction_succeeded && goblin_output.all_checks_passed };
}

// Template instantiations
template class ChonkVerifier<false>; // Native verifier
template class ChonkVerifier<true>;  // Recursive verifier

} // namespace bb
