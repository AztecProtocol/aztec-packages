#include "ultra_composer.hpp"
#include "barretenberg/honk/proof_system/ultra_prover.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/proof_system/composer/composer_lib.hpp"
#include "barretenberg/proof_system/composer/permutation_lib.hpp"

namespace proof_system::honk {

template <UltraFlavor Flavor> Instance<Flavor> UltraComposer_<Flavor>::create_instance(CircuitBuilder& circuit)
{
    // this could be either here or in the Instance idk
    circuit.add_gates_to_ensure_all_polys_are_non_zero();
    circuit.finalize_circuit();
    Instance<Flavor> instance = Instance(circuit);
    return instance;
}

template <UltraFlavor Flavor> UltraProver_<Flavor> UltraComposer_<Flavor>::create_prover(Instance<Flavor>& instance)
{
    compute_commitment_key(instance.proving_key->circuit_size);
    UltraProver_<Flavor> output_state(instance, commitment_key);

    return output_state;
}

/**
 * Create verifier: compute verification key,
 * initialize verifier with it and an initial manifest and initialize commitment_scheme.
 *
 * @return The verifier.
 * */
template <UltraFlavor Flavor>
UltraVerifier_<Flavor> UltraComposer_<Flavor>::create_verifier(const Instance<Flavor>& instance)
{
    // for the folding composer we compute the commitment keys here!
    auto verification_key = instance.compute_verification_key(commitment_key);
    // change this it's clunky and inconsistent
    UltraVerifier_<Flavor> output_state(verification_key);
    auto pcs_verification_key = std::make_unique<VerifierCommitmentKey>(verification_key->circuit_size, crs_factory_);
    output_state.pcs_verification_key = std::move(pcs_verification_key);

    return output_state;
}

template class UltraComposer_<honk::flavor::Ultra>;
template class UltraComposer_<honk::flavor::UltraGrumpkin>;
template class UltraComposer_<honk::flavor::GoblinUltra>;

} // namespace proof_system::honk
