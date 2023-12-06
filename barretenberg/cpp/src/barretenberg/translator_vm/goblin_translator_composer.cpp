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

namespace proof_system::honk {
using Flavor = honk::flavor::GoblinTranslator;
using Curve = typename Flavor::Curve;
using FF = typename Flavor::FF;
using CircuitBuilder = typename Flavor::CircuitBuilder;
using ProvingKey = typename Flavor::ProvingKey;
using VerificationKey = typename Flavor::VerificationKey;
using PCS = typename Flavor::PCS;
using CommitmentKey = typename Flavor::CommitmentKey;
using VerifierCommitmentKey = typename Flavor::VerifierCommitmentKey;
using Polynomial = typename Flavor::Polynomial;
using Transcript = typename Flavor::Transcript;

/**
 * @brief Helper method to compute quantities like total number of gates and dyadic circuit size
 *
 * @tparam Flavor
 * @param circuit_builder
 */

void GoblinTranslatorComposer::compute_circuit_size_parameters(CircuitBuilder& circuit_builder)
{
    const size_t num_gates = circuit_builder.num_gates;

    // number of populated rows in the execution trace
    size_t num_rows_populated_in_execution_trace = num_gates;

    // Goblin translator circuits always have a predefined size and are structured as a VM (no concept of selectors)
    ASSERT(MINI_CIRCUIT_SIZE >= num_rows_populated_in_execution_trace);

    total_num_gates = std::max(MINI_CIRCUIT_SIZE, num_rows_populated_in_execution_trace);

    // Next power of 2
    mini_circuit_dyadic_size = circuit_builder.get_circuit_subgroup_size(total_num_gates);

    // The actual circuit size is several times bigger than the trace in the builder, because we use concatenation to
    // bring the degree of relations down, while extending the length.
    dyadic_circuit_size = mini_circuit_dyadic_size * Flavor::CONCATENATION_INDEX;
}

/**
 * @brief Construct the witness polynomials from the witness vectors in the circuit constructor.
 *
 * @details In goblin translator wires come as is, since they have to reflect the structure of polynomials in the first
 * 4 wires, which we've commited to
 *
 * @tparam Flavor provides the circuit constructor type and the number of wires.
 * @param circuit_builder
 * @param dyadic_circuit_size Power of 2 circuit size
 * @todo TODO(https://github.com/AztecProtocol/barretenberg/issues/783) Optimize memory operations.
 * @return std::vector<Polynomial>
 * */

std::vector<Polynomial> construct_wire_polynomials_base_goblin_translator(const CircuitBuilder& circuit_builder,
                                                                          const size_t dyadic_circuit_size)
{
    const size_t num_gates = circuit_builder.num_gates;

    std::vector<Polynomial> wire_polynomials;
    // Populate the wire polynomials with values from conventional wires
    for (size_t wire_idx = 0; wire_idx < Flavor::NUM_WIRES; ++wire_idx) {
        // Expect all values to be set to 0 initially
        Polynomial w_lagrange(dyadic_circuit_size);

        // Insert conventional gate wire values into the wire polynomial
        for (size_t i = 0; i < num_gates; ++i) {
            auto& wire = circuit_builder.wires[wire_idx];
            w_lagrange[i] = circuit_builder.get_variable(wire[i]);
        }

        wire_polynomials.push_back(std::move(w_lagrange));
    }
    return wire_polynomials;
}

/**
 * @brief Compute witness polynomials
 *
 */
void GoblinTranslatorComposer::compute_witness(CircuitBuilder& circuit_builder)
{
    if (computed_witness) {
        return;
    }

    // Construct the conventional wire polynomials
    auto wire_polynomials = construct_wire_polynomials_base_goblin_translator(circuit_builder, dyadic_circuit_size);

    // Most of the witness polynomials are the original wire polynomials
    for (auto [key_poly, wire_poly] : zip_view(proving_key->get_all(), wire_polynomials)) {
        key_poly = wire_poly.share();
    }

    // We construct concatenated versions of range constraint polynomials, where several polynomials are concatenated
    // into one. These polynomials are not commited to.
    proof_system::honk::permutation_library::compute_concatenated_polynomials<Flavor>(proving_key.get());

    // We also contruct ordered polynomials, which have the same values as concatenated ones + enough values to bridge
    // the range from 0 to maximum range defined by the range constraint.
    proof_system::honk::permutation_library::compute_goblin_translator_range_constraint_ordered_polynomials<Flavor>(
        proving_key.get());

    computed_witness = true;
}

/**
 * @brief Create a prover object (used to create the proof)
 *
 * @tparam Flavor
 * @param circuit_builder
 * @return GoblinTranslatorProver
 */

GoblinTranslatorProver GoblinTranslatorComposer::create_prover(CircuitBuilder& circuit_builder,
                                                               const std::shared_ptr<Transcript>& transcript)
{

    // Compute total number of gates, dyadic circuit size, etc.
    compute_circuit_size_parameters(circuit_builder);

    // Compute non-witness polynomials
    compute_proving_key(circuit_builder);

    compute_witness(circuit_builder);

    compute_commitment_key(proving_key->circuit_size);

    GoblinTranslatorProver output_state(proving_key, commitment_key, transcript);

    return output_state;
}

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

    auto pcs_verification_key = std::make_unique<VerifierCommitmentKey>(verification_key->circuit_size, crs_factory_);
    output_state.pcs_verification_key = std::move(pcs_verification_key);
    output_state.transcript = transcript;

    return output_state;
}

/**
 * @brief Move goblin translator specific inputs from circuit builder and compute all the constant polynomials used by
 * the prover
 *
 * @tparam Flavor
 * @param circuit_builder
 * @return std::shared_ptr<ProvingKey>
 */

std::shared_ptr<typename Flavor::ProvingKey> GoblinTranslatorComposer::compute_proving_key(
    const CircuitBuilder& circuit_builder)
{
    if (proving_key) {
        return proving_key;
    }

    proving_key = std::make_shared<ProvingKey>(dyadic_circuit_size);

    // The input/challenge that we are evaluating all polynomials at
    proving_key->evaluation_input_x = circuit_builder.evaluation_input_x;

    // The challenge for batching polynomials
    proving_key->batching_challenge_v = circuit_builder.batching_challenge_v;

    // First and last lagrange polynomials (in the full circuit size)
    compute_first_and_last_lagrange_polynomials<Flavor>(proving_key.get());

    // Compute polynomials with odd and even indices set to 1 up to the minicircuit margin + lagrange polynomials at
    // second and second to last indices in the minicircuit
    proof_system::honk::permutation_library::compute_lagrange_polynomials_for_goblin_translator<Flavor>(
        proving_key.get());

    // Compute the numerator for the permutation argument with several repetitions of steps bridging 0 and maximum range
    // constraint
    proof_system::honk::permutation_library::compute_extra_range_constraint_numerator<Flavor>(proving_key.get());

    return proving_key;
}

/**
 * Compute verification key consisting of non-changing polynomials' precommitments.
 *
 * @return Pointer to created circuit verification key.
 * */

std::shared_ptr<VerificationKey> GoblinTranslatorComposer::compute_verification_key(
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
} // namespace proof_system::honk
