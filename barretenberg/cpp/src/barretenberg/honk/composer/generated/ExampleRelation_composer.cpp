

#include "./ExampleRelation_composer.hpp"
#include "barretenberg/honk/proof_system/generated/ExampleRelation_verifier.hpp"
#include "barretenberg/honk/proof_system/grand_product_library.hpp"
#include "barretenberg/proof_system/composer/composer_lib.hpp"
#include "barretenberg/proof_system/composer/permutation_lib.hpp"

namespace proof_system::honk {

template <typename Flavor> void ExampleRelationComposer_<Flavor>::compute_witness(CircuitConstructor& circuit)
{
    if (computed_witness) {
        return;
    }

    auto polynomials = circuit.compute_polynomials();

    auto key_wires = proving_key->get_wires();
    auto poly_wires = polynomials.get_wires();

    for (size_t i = 0; i < key_wires.size(); ++i) {
        std::copy(poly_wires[i].begin(), poly_wires[i].end(), key_wires[i].begin());
    }

    computed_witness = true;
}

template <typename Flavor>
ExampleRelationProver_<Flavor> ExampleRelationComposer_<Flavor>::create_prover(CircuitConstructor& circuit_constructor)
{
    compute_proving_key(circuit_constructor);
    compute_witness(circuit_constructor);
    compute_commitment_key(circuit_constructor.get_circuit_subgroup_size());

    ExampleRelationProver_<Flavor> output_state(proving_key, commitment_key);

    return output_state;
}

template <typename Flavor>
ExampleRelationVerifier_<Flavor> ExampleRelationComposer_<Flavor>::create_verifier(
    CircuitConstructor& circuit_constructor)
{
    auto verification_key = compute_verification_key(circuit_constructor);

    ExampleRelationVerifier_<Flavor> output_state(verification_key);

    auto pcs_verification_key = std::make_unique<VerifierCommitmentKey>(verification_key->circuit_size, crs_factory_);

    output_state.pcs_verification_key = std::move(pcs_verification_key);

    return output_state;
}

template <typename Flavor>
std::shared_ptr<typename Flavor::ProvingKey> ExampleRelationComposer_<Flavor>::compute_proving_key(
    CircuitConstructor& circuit_constructor)
{
    if (proving_key) {
        return proving_key;
    }

    // Initialize proving_key
    {
        const size_t subgroup_size = circuit_constructor.get_circuit_subgroup_size();
        proving_key = std::make_shared<typename Flavor::ProvingKey>(subgroup_size, 0);
    }

    proving_key->contains_recursive_proof = false;

    return proving_key;
}

template <typename Flavor>
std::shared_ptr<typename Flavor::VerificationKey> ExampleRelationComposer_<Flavor>::compute_verification_key(
    CircuitConstructor& circuit_constructor)
{
    if (verification_key) {
        return verification_key;
    }

    if (!proving_key) {
        compute_proving_key(circuit_constructor);
    }

    verification_key =
        std::make_shared<typename Flavor::VerificationKey>(proving_key->circuit_size, proving_key->num_public_inputs);

    // verification_key->lagrange_first = commitment_key->commit(proving_key->lagrange_first);
    // verification_key->lagrange_second = commitment_key->commit(proving_key->lagrange_second);
    // verification_key->lagrange_last = commitment_key->commit(proving_key->lagrange_last);

    return verification_key;
}
template class ExampleRelationComposer_<honk::flavor::ExampleRelationFlavor>;

} // namespace proof_system::honk
