#include "client_ivc_recursive_verifier.hpp"

namespace bb::stdlib::recursion::honk {

void ClientIVCRecursiveVerifier::verify(const ClientIVC::Proof& proof,
                                        FoldVerifierInput& fold_verifier_input,
                                        GoblinVerifierInput& goblin_verifier_input)
{
    info("Folding verifier!");
    // Perform recursive folding verification
    FoldingVerifier folding_verifier{ builder, fold_verifier_input };
    auto recursive_verifier_accumulator = folding_verifier.verify_folding_proof(proof.folding_proof);
    auto native_verifier_acc =
        std::make_shared<FoldVerifierInput::Instance>(recursive_verifier_accumulator->get_value());

    info("Decider verifier!");
    // Perform recursive decider verification
    DeciderVerifier decider{ builder, native_verifier_acc };
    decider.verify_proof(proof.decider_proof);

    info("Goblin verifier!");
    // Perform Goblin recursive verification
    GoblinVerifier goblin_verifier{ builder, goblin_verifier_input };
    goblin_verifier.verify(proof.goblin_proof);
}

} // namespace bb::stdlib::recursion::honk