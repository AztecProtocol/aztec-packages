#include "client_ivc_recursive_verifier.hpp"

namespace bb::stdlib::recursion::honk {

/**
 * @brief Performs recursive verification of the Client IVC proof.
 *
 * @todo (https://github.com/AztecProtocol/barretenberg/issues/934):  Add logic for accumulating the pairing points
 * produced by the verifiers (and potentially IPA accumulators for ECCVM verifier)
 */
void ClientIVCRecursiveVerifier::verify(const ClientIVC::Proof& proof)
{
    // Construct stdlib mega verification key
    auto stdlib_mega_vk =
        std::make_shared<RecursiveVerificationKey>(builder.get(), verifier_input.mega_verification_key);
    aggregation_state<typename RecursiveFlavor::Curve> agg_obj =
        init_default_aggregation_state<Builder, typename RecursiveFlavor::Curve>(*builder);

    // do something with public inputs here?
    //
    // Perform recursive decider verification
    MegaVerifier verifier{ builder.get(), stdlib_mega_vk };
    verifier.verify_proof(proof.ultra_proof, agg_obj);
    info("number of public inputs in ultra proof: ",
         static_cast<uint32_t>(static_cast<uint256_t>(proof.ultra_proof[1])));

    // Perform Goblin recursive verification
    GoblinVerifier goblin_verifier{ builder.get(), verifier_input.goblin_input };
    goblin_verifier.verify(proof.goblin_proof);
}

} // namespace bb::stdlib::recursion::honk