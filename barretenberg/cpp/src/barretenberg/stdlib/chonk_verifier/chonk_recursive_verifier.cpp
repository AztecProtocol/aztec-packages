// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "chonk_recursive_verifier.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief Creates a circuit that verifies a Chonk IVC proof.
 * @details Performs:
 *   1. MegaZK verification of the hiding kernel proof
 *   2. Databus consistency check (kernel return data == calldata commitment)
 *   3. Goblin verification using ECC op wire commitments from the kernel
 *
 * @param proof Stdlib Chonk proof containing mega_proof and goblin_proof
 * @return Output containing deferred verification data (pairing points, IPA claim)
 */
ChonkRecursiveVerifier::Output ChonkRecursiveVerifier::verify(const StdlibProof& proof)
{
    using MergeCommitments = GoblinVerifier::MergeVerifier::InputCommitments;
    std::shared_ptr<Transcript> chonk_rec_verifier_transcript(std::make_shared<Transcript>());

    // Perform recursive decider verification
    MegaVerifier verifier{ builder, stdlib_mega_vk_and_hash, chonk_rec_verifier_transcript };
    MegaVerifier::Output mega_output = verifier.template verify_proof<HidingKernelIO<Builder>>(proof.mega_proof);

    // Perform databus consistency checks
    mega_output.kernel_return_data.incomplete_assert_equal(verifier.verifier_instance->witness_commitments.calldata);

    // Perform Goblin recursive verification
    // Reduces Goblin proof to pairing points and IPA claim. In recursive mode, the all_checks_passed flag only includes
    // reduction checks that should be viewed as debugging hints.
    MergeCommitments merge_commitments{
        .t_commitments = verifier.verifier_instance->witness_commitments.get_ecc_op_wires()
                             .get_copy(), // Commitments to subtables added by the hiding kernel
        .T_prev_commitments = std::move(mega_output.ecc_op_tables) // Commitments to the state of the ecc op_queue as
                                                                   // computed insided the hiding kernel
    };
    GoblinVerifier goblin_verifier{
        chonk_rec_verifier_transcript, proof.goblin_proof, merge_commitments, MergeSettings::APPEND
    };
    GoblinVerifier::ReductionResult goblin_output = goblin_verifier.reduce_to_pairing_check_and_ipa_opening();
    goblin_output.pairing_points.aggregate(mega_output.points_accumulator);

    return { goblin_output };
}

} // namespace bb::stdlib::recursion::honk
