// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "client_ivc_recursive_verifier.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief Performs recursive verification of the Client IVC proof.
 */
ClientIVCRecursiveVerifier::Output ClientIVCRecursiveVerifier::verify(const ClientIVC::Proof& proof)
{
    // Construct stdlib Mega verification key
    auto stdlib_mega_vk = std::make_shared<RecursiveVerificationKey>(builder.get(), ivc_verification_key.mega);

    // Perform recursive decider verification
    MegaVerifier verifier{ builder.get(), stdlib_mega_vk };
    MegaVerifier::Output mega_output = verifier.verify_proof(proof.mega_proof);

    // Perform Goblin recursive verification
    GoblinVerificationKey goblin_verification_key{};
    GoblinVerifier goblin_verifier{ builder.get(), goblin_verification_key };
    GoblinRecursiveVerifierOutput output = goblin_verifier.verify(proof.goblin_proof);
    output.points_accumulator.aggregate(mega_output.points_accumulator);
    return { output };
}

} // namespace bb::stdlib::recursion::honk
