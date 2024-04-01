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
    auto verification_key = compute_verification_key(circuit_constructor);

    ECCVMVerifier_<Flavor> output_state(verification_key);

    auto pcs_verification_key = std::make_unique<VerifierCommitmentKey>(verification_key->circuit_size, crs_factory_);

    output_state.pcs_verification_key = std::move(pcs_verification_key);
    output_state.transcript = transcript;

    return output_state;
}

/**
 * Compute verification key consisting of selector precommitments.
 *
 * @return Pointer to created circuit verification key.
 * */
template <IsECCVMFlavor Flavor>
std::shared_ptr<typename Flavor::VerificationKey> ECCVMComposer_<Flavor>::compute_verification_key(
    [[maybe_unused]] CircuitConstructor& circuit_constructor)
{
    if (verification_key) {
        return verification_key;
    }

    verification_key =
        std::make_shared<typename Flavor::VerificationKey>(proving_key->circuit_size, proving_key->num_public_inputs);

    verification_key->lagrange_first = commitment_key->commit(proving_key->lagrange_first);
    verification_key->lagrange_second = commitment_key->commit(proving_key->lagrange_second);
    verification_key->lagrange_last = commitment_key->commit(proving_key->lagrange_last);
    return verification_key;
}
template class ECCVMComposer_<ECCVMFlavor>;

} // namespace bb
