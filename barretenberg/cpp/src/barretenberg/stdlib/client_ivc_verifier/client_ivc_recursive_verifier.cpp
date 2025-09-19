// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "client_ivc_recursive_verifier.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief Creates a circuit that executes the ClientIvc verification algorithm.
 *
 * @param proof Stdlib proof
 * @return ClientIVCRecursiveVerifier::Output
 */
ClientIVCRecursiveVerifier::Output ClientIVCRecursiveVerifier::verify(const StdlibProof& proof)
{
    using MergeCommitments = GoblinVerifier::MergeVerifier::InputCommitments;
    std::shared_ptr<Transcript> civc_rec_verifier_transcript(std::make_shared<Transcript>());

    // Perform recursive decider verification
    MegaVerifier verifier{ builder, stdlib_mega_vk_and_hash, civc_rec_verifier_transcript };
    MegaVerifier::Output mega_output = verifier.template verify_proof<HidingKernelIO<Builder>>(proof.mega_proof);

    // Perform Goblin recursive verification
    GoblinVerificationKey goblin_verification_key{};
    MergeCommitments merge_commitments{
        .t_commitments = verifier.verifier_instance->witness_commitments.get_ecc_op_wires()
                             .get_copy(), // Commitments to subtables added by the hiding kernel
        .T_prev_commitments = std::move(mega_output.ecc_op_tables) // Commitments to the state of the ecc op_queue as
                                                                   // computed insided the hiding kernel
    };
    GoblinVerifier goblin_verifier{ builder, goblin_verification_key, civc_rec_verifier_transcript };
    GoblinRecursiveVerifierOutput output =
        goblin_verifier.verify(proof.goblin_proof, merge_commitments, MergeSettings::APPEND);
    output.points_accumulator.aggregate(mega_output.points_accumulator);
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1396): State tracking in CIVC verifiers
    return { output };
}

} // namespace bb::stdlib::recursion::honk
