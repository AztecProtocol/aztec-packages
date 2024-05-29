#include "client_ivc_recursive_verifier.hpp"

namespace bb::stdlib::recursion::honk {

void ClientIvcRecursiveVerifier_::verify(const ClientIVC::Proof& proof, VerifierData& data)
{
    // Verify some stuff
    (void)data;
    (void)proof;
    (void)builder;

    FoldingVerifier folding_verifier{ builder, data.verifier_accumulator_instance, { data.honk_verification_key } };
    auto recursive_verifier_accumulator = folding_verifier.verify_folding_proof(proof.folding_proof);
    auto native_verifier_acc =
        std::make_shared<VerifierData::NativeInstance>(recursive_verifier_accumulator->get_value());

    DeciderVerifier decider{ builder, native_verifier_acc };
    decider.verify_proof(proof.decider_proof);
}

} // namespace bb::stdlib::recursion::honk