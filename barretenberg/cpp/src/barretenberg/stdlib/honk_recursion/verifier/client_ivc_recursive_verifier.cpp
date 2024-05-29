#include "client_ivc_recursive_verifier.hpp"

namespace bb::stdlib::recursion::honk {

void ClientIvcRecursiveVerifier_::verify(const ClientIVC::Proof& proof, const VerifierData& data)
{
    // Verify some stuff
    (void)data;
    (void)proof;
    (void)builder;

    DeciderVerifier decider{ builder, data.verifier_accumulator_instance };
    decider.verify_proof(proof.decider_proof);
}

} // namespace bb::stdlib::recursion::honk