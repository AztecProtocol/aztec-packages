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
 * @param proof Chonk proof (ChonkStdlibProof for recursive, Chonk::Proof for native)
 * @return Output (ReductionResult for recursive, bool for native)
 */
template <bool IsRecursive> ChonkVerifier<IsRecursive>::Output ChonkVerifier<IsRecursive>::verify(const Proof& proof)
{
    using MergeCommitments = typename GoblinVerifier::MergeVerifier::InputCommitments;

    // Create shared transcript for all verifiers
    std::shared_ptr<Transcript> chonk_verifier_transcript = std::make_shared<Transcript>();

    // Step 1: Verify the Hiding kernel proof
    HidingKernelVerifier verifier{ vk_and_hash, chonk_verifier_transcript };
    auto mega_output = verifier.verify_proof(proof.mega_proof);

    // Step 2: Perform databus consistency checks
    const Commitment calldata_commitment = verifier.get_verifier_instance()->witness_commitments.calldata;
    const Commitment return_data_commitment = mega_output.kernel_return_data;

    if constexpr (IsRecursive) {
        // Recursive mode: assert equality in-circuit
        mega_output.kernel_return_data.incomplete_assert_equal(calldata_commitment);
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
        .T_prev_commitments = std::move(mega_output.ecc_op_tables)
    };
    GoblinVerifier goblin_verifier{
        chonk_verifier_transcript, proof.goblin_proof, merge_commitments, MergeSettings::APPEND
    };
    GoblinReductionResult goblin_output = goblin_verifier.reduce_to_pairing_check_and_ipa_opening();

    if constexpr (IsRecursive) {
        // Recursive mode: aggregate pairing points and return deferred verification data
        goblin_output.pairing_points.aggregate(mega_output.points_accumulator);
        return goblin_output;
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
