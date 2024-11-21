#include "client_ivc_recursive_verifier.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief Performs recursive verification of the Client IVC proof.
 *
 * @todo (https://github.com/AztecProtocol/barretenberg/issues/934):  Add logic for accumulating the pairing points
 * produced by the verifiers (and potentially IPA accumulators for ECCVM verifier)
 */
ClientIVCRecursiveVerifier::Output ClientIVCRecursiveVerifier::verify(const ClientIVC::Proof& proof)
{
    // Construct stdlib Mega verification key
    auto stdlib_mega_vk =
        std::make_shared<RecursiveVerificationKey>(builder.get(), verifier_input.mega_verification_key);

    // Dummy aggregation object until we do proper aggregation
    aggregation_state<typename RecursiveFlavor::Curve> agg_obj =
        init_default_aggregation_state<Builder, typename RecursiveFlavor::Curve>(*builder);

    // Perform recursive decider verification
    MegaVerifier verifier{ builder.get(), stdlib_mega_vk };
    verifier.verify_proof(proof.mega_proof, agg_obj);

    // Perform Goblin recursive verification
    GoblinVerifier goblin_verifier{ builder.get(), verifier_input.goblin_input };
    GoblinRecursiveVerifierOutput output = goblin_verifier.verify(proof.goblin_proof);

    return output;
}

} // namespace bb::stdlib::recursion::honk