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
    std::shared_ptr<Transcript> civc_rec_verifier_transcript(std::make_shared<Transcript>());
    // Construct stdlib Mega verification key
    auto stdlib_mega_vk_and_hash = std::make_shared<RecursiveVKAndHash>(*builder, ivc_verification_key.mega);

    // Perform recursive decider verification
    MegaVerifier verifier{ builder.get(), stdlib_mega_vk_and_hash, civc_rec_verifier_transcript };
    MegaVerifier::Output mega_output = verifier.verify_proof(proof.mega_proof);

    // Perform Goblin recursive verification
    GoblinVerificationKey goblin_verification_key{};
    GoblinVerifier goblin_verifier{ builder.get(), goblin_verification_key, civc_rec_verifier_transcript };
    GoblinRecursiveVerifierOutput output =
        goblin_verifier.verify(proof.goblin_proof, verifier.key->witness_commitments.get_ecc_op_wires());
    output.points_accumulator.aggregate(mega_output.points_accumulator);
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1396): State tracking in CIVC verifiers
    return { output };
}

} // namespace bb::stdlib::recursion::honk
