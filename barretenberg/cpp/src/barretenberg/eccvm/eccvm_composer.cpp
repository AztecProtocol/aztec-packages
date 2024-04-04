#include "eccvm_composer.hpp"
#include "barretenberg/plonk_honk_shared/composer/composer_lib.hpp"
#include "barretenberg/plonk_honk_shared/composer/permutation_lib.hpp"

namespace bb {

/**
 * Create verifier: compute verification key,
 * initialize verifier with it and an initial manifest and initialize commitment_scheme.
 *
 * @return The verifier.
 * */
template <IsECCVMFlavor Flavor>
ECCVMVerifier_<Flavor> ECCVMComposer_<Flavor>::create_verifier(CircuitConstructor& circuit_constructor,
                                                               const std::shared_ptr<Transcript>& transcript)
{
    proving_key = std::make_shared<typename Flavor::ProvingKey>(circuit_constructor);
    auto verification_key = std::make_shared<typename Flavor::VerificationKey>(proving_key);

    ECCVMVerifier_<Flavor> output_state(verification_key);

    auto pcs_verification_key = std::make_unique<VerifierCommitmentKey>(verification_key->circuit_size, crs_factory_);

    output_state.pcs_verification_key = std::move(pcs_verification_key);
    output_state.transcript = transcript;

    return output_state;
}

template class ECCVMComposer_<ECCVMFlavor>;

} // namespace bb
