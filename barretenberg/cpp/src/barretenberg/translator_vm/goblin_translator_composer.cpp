/**
 * @file goblin_translator_composer.cpp
 * @brief Contains the logic for transfroming a Goblin Translator Circuit Builder object into a witness and methods to
 * create prover and verifier objects
 * @date 2023-10-05
 */
#include "goblin_translator_composer.hpp"
#include "barretenberg/flavor/goblin_translator.hpp"
#include "barretenberg/honk/proof_system/permutation_library.hpp"
#include "barretenberg/proof_system/circuit_builder/goblin_translator_circuit_builder.hpp"
#include "barretenberg/proof_system/composer/composer_lib.hpp"
#include "barretenberg/proof_system/composer/permutation_lib.hpp"

namespace {
using Flavor = bb::GoblinTranslatorFlavor;
} // namespace

namespace bb {

/**
 * @brief Create verifier: compute verification key,
 * initialize verifier with it and an initial manifest and initialize commitment_scheme.
 *
 * @tparam Flavor
 * @param circuit_builder
 * @return GoblinTranslatorVerifier
 */
GoblinTranslatorVerifier GoblinTranslatorComposer::create_verifier(const CircuitBuilder& circuit_builder,
                                                                   const std::shared_ptr<Transcript>& transcript)
{
    auto verification_key = compute_verification_key(circuit_builder);

    GoblinTranslatorVerifier output_state(verification_key);

    auto pcs_verification_key = std::make_unique<VerifierCommitmentKey>();
    output_state.pcs_verification_key = std::move(pcs_verification_key);
    output_state.transcript = transcript;

    return output_state;
}

void compute_proving_key([[maybe_unused]] auto& in){};

/**
 * Compute verification key consisting of non-changing polynomials' precommitments.
 *
 * @return Pointer to created circuit verification key.
 * */
std::shared_ptr<typename Flavor::VerificationKey> GoblinTranslatorComposer::compute_verification_key(
    const CircuitBuilder& circuit_builder)
{
    if (verification_key) {
        return verification_key;
    }

    if (!proving_key) {
        compute_proving_key(circuit_builder);
    }

    verification_key = std::make_shared<VerificationKey>(proving_key->circuit_size, proving_key->num_public_inputs);

    verification_key->lagrange_first = commitment_key->commit(proving_key->lagrange_first);
    verification_key->lagrange_last = commitment_key->commit(proving_key->lagrange_last);
    verification_key->lagrange_odd_in_minicircuit = commitment_key->commit(proving_key->lagrange_odd_in_minicircuit);
    verification_key->lagrange_even_in_minicircuit = commitment_key->commit(proving_key->lagrange_even_in_minicircuit);
    verification_key->lagrange_second = commitment_key->commit(proving_key->lagrange_second);
    verification_key->lagrange_second_to_last_in_minicircuit =
        commitment_key->commit(proving_key->lagrange_second_to_last_in_minicircuit);
    verification_key->ordered_extra_range_constraints_numerator =
        commitment_key->commit(proving_key->ordered_extra_range_constraints_numerator);

    return verification_key;
}
} // namespace bb
