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
 * @brief Verifies a Chonk IVC proof.
 * @details Performs:
 *   1. MegaZK verification of the hiding kernel proof
 *   2. Databus consistency check (kernel return data == calldata commitment)
 *   3. Goblin verification using ECC op wire commitments from the kernel
 *   4. (Native only) Pairing check and IPA verification
 *
 * @param proof Chonk proof (ChonkStdlibProof for recursive, ChonkProof for native)
 * @return Output (ReductionResult for recursive, bool for native)
 */
template <bool IsRecursive> ChonkVerifier<IsRecursive>::Output ChonkVerifier<IsRecursive>::verify(const Proof& proof)
{
    using MergeCommitments = typename GoblinVerifier::MergeVerifier::InputCommitments;

    // Create shared transcript for all verifiers
    std::shared_ptr<Transcript> chonk_verifier_transcript = std::make_shared<Transcript>();

    // Step 1: Reduce the Hiding kernel proof to pairing check
    HidingKernelVerifier verifier{ vk_and_hash, chonk_verifier_transcript };
    auto [mega_pcs_pairing_points, mega_reduction_succeeded] = verifier.reduce_to_pairing_check(proof.mega_proof);
    vinfo("MegaZK reduced to pairing check: ", mega_reduction_succeeded ? "true" : "false");

    if constexpr (!IsRecursive) {
        if (!mega_reduction_succeeded) {
            info("Chonk verification failed at MegaZK reduction step");
            return false;
        }
    }

    // Extract public inputs and kernel data
    HidingKernelIO kernel_io;
    kernel_io.reconstruct_from_public(verifier.get_verifier_instance()->public_inputs);

    // Step 2: Perform databus consistency checks
    const Commitment calldata_commitment = verifier.get_verifier_instance()->witness_commitments.calldata;
    const Commitment return_data_commitment = kernel_io.kernel_return_data;

    if constexpr (IsRecursive) {
        // Recursive mode: assert equality in-circuit
        kernel_io.kernel_return_data.incomplete_assert_equal(calldata_commitment);
    } else {
        // Native mode: check equality
        bool databus_consistency_verified = (calldata_commitment == return_data_commitment);
        vinfo("Databus consistency verified: ", databus_consistency_verified);
        if (!databus_consistency_verified) {
            info("Chonk verification failed at databus consistency check");
            return false;
        }
    }

    // Step 3: Goblin verification (merge, eccvm, translator)
    MergeCommitments merge_commitments{
        .t_commitments = verifier.get_verifier_instance()->witness_commitments.get_ecc_op_wires().get_copy(),
        .T_prev_commitments = std::move(kernel_io.ecc_op_tables)
    };
    GoblinVerifier goblin_verifier{
        chonk_verifier_transcript, proof.goblin_proof, merge_commitments, MergeSettings::APPEND
    };
    GoblinReductionResult goblin_output = goblin_verifier.reduce_to_pairing_check_and_ipa_opening();

    if constexpr (IsRecursive) {
        // Recursive mode: Batch aggregate all pairing points using aggregate_multiple for efficiency
        std::vector<PairingPoints> all_pairing_points;
        all_pairing_points.reserve(4);

        // Collect all pairing points: PI, PCS, Merge, Translator
        all_pairing_points.push_back(kernel_io.pairing_inputs);
        all_pairing_points.push_back(std::move(mega_pcs_pairing_points));
        all_pairing_points.push_back(std::move(goblin_output.merge_pairing_points));
        all_pairing_points.push_back(std::move(goblin_output.translator_pairing_points));

        const bool handle_edge_cases = false;
        // Single aggregation with batch_mul (more efficient than multiple aggregate calls)
        PairingPoints aggregated_pairing_points =
            PairingPoints::aggregate_multiple(all_pairing_points, handle_edge_cases);

        // Return reduction result with aggregated pairing points
        return GoblinReductionResult{ .merge_pairing_points = std::move(aggregated_pairing_points),
                                      .translator_pairing_points = {}, // Already aggregated into merge_pairing_points
                                      .ipa_claim = std::move(goblin_output.ipa_claim),
                                      .ipa_proof = std::move(goblin_output.ipa_proof),
                                      .all_checks_passed =
                                          mega_reduction_succeeded && goblin_output.all_checks_passed };
    } else {
        // Native mode: perform immediate pairing check and IPA verification
        if (!goblin_output.all_checks_passed) {
            info("Chonk verification failed at Goblin checks (merge/eccvm/translator reduction + pairing)");
            return false;
        }

        // Step 4: Verify IPA opening
        auto ipa_transcript = std::make_shared<Goblin::Transcript>(goblin_output.ipa_proof);
        auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
        bool ipa_verified = IPA<curve::Grumpkin>::reduce_verify(ipa_vk, goblin_output.ipa_claim, ipa_transcript);
        vinfo("Goblin IPA verified: ", ipa_verified);
        if (!ipa_verified) {
            info("Chonk verification failed at IPA check");
            return false;
        }

        return true;
    }
}

// Template instantiations
template class ChonkVerifier<false>; // Native verifier
template class ChonkVerifier<true>;  // Recursive verifier

} // namespace bb
