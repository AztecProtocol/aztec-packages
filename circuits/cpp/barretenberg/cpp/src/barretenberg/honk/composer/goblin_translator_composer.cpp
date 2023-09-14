#include "goblin_translator_composer.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/honk/flavor/goblin_translator.hpp"
#include "barretenberg/honk/proof_system/goblin_translator_prover.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/proof_system/circuit_builder/goblin_translator_circuit_builder.hpp"
#include "barretenberg/proof_system/composer/composer_lib.hpp"
#include "barretenberg/proof_system/composer/permutation_lib.hpp"
#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <iterator>
#include <vector>

namespace proof_system::honk {

/**
 * @brief Helper method to compute quantities like total number of gates and dyadic circuit size
 *
 * @tparam Flavor
 * @param circuit_constructor
 */
template <typename Flavor>
void GoblinTranslatorComposer_<Flavor>::compute_circuit_size_parameters(CircuitBuilder& circuit_constructor)
{
    const size_t num_gates = circuit_constructor.num_gates;

    // number of populated rows in the execution trace
    size_t num_rows_populated_in_execution_trace = num_gates;

    // The number of gates is max(lookup gates + tables, rows already populated in trace) + 1, where the +1 is due to
    // addition of a "zero row" at top of the execution trace to ensure wires and other polys are shiftable.
    ASSERT(MINI_CIRCUIT_SIZE >= num_rows_populated_in_execution_trace);
    total_num_gates = std::max(MINI_CIRCUIT_SIZE, num_rows_populated_in_execution_trace);

    // Next power of 2
    mini_circuit_dyadic_size = circuit_constructor.get_circuit_subgroup_size(total_num_gates);
    dyadic_circuit_size = mini_circuit_dyadic_size * Flavor::CONCATENATION_INDEX;
    info(dyadic_circuit_size);
}

/**
 * @brief Construct the witness polynomials from the witness vectors in the circuit constructor.
 *
 * @details In goblin translator wires come as is, since they have to reflect the structure of polynomials in the first
 * 4 wires, which we've commited to
 *
 * @tparam Flavor provides the circuit constructor type and the number of wires.
 * @param circuit_constructor
 * @param dyadic_circuit_size Power of 2 circuit size
 *
 * @return std::vector<typename Flavor::Polynomial>
 * */
template <typename Flavor>
std::vector<typename Flavor::Polynomial> construct_wire_polynomials_base_goblin_translator(
    const typename Flavor::CircuitBuilder& circuit_constructor, const size_t dyadic_circuit_size)
{
    const size_t num_gates = circuit_constructor.num_gates;

    std::vector<typename Flavor::Polynomial> wire_polynomials;

    // Populate the wire polynomials with values from conventional wires
    for (size_t wire_idx = 0; wire_idx < Flavor::NUM_WIRES; ++wire_idx) {

        // Expect all values to be set to 0 initially
        // TODO(kesha): fix for sparse polynomials;
        typename Flavor::Polynomial w_lagrange(dyadic_circuit_size);

        // Insert conventional gate wire values into the wire polynomial
        for (size_t i = 0; i < num_gates; ++i) {
            auto& wire = circuit_constructor.wires[wire_idx];
            w_lagrange[i] = circuit_constructor.get_variable(wire[i]);
        }

        wire_polynomials.push_back(std::move(w_lagrange));
    }
    return wire_polynomials;
}

/**
 * @brief Compute witness polynomials
 *
 */
template <typename Flavor> void GoblinTranslatorComposer_<Flavor>::compute_witness(CircuitBuilder& circuit_constructor)
{
    if (computed_witness) {
        return;
    }

    // Construct the conventional wire polynomials
    auto wire_polynomials =
        construct_wire_polynomials_base_goblin_translator<Flavor>(circuit_constructor, dyadic_circuit_size);

    proving_key->op = wire_polynomials[0];
    proving_key->x_lo_y_hi = wire_polynomials[1];
    info(proving_key->x_lo_y_hi[0]);
    proving_key->x_hi_z_1 = wire_polynomials[2];
    proving_key->y_lo_z_2 = wire_polynomials[3];
    proving_key->p_x_low_limbs = wire_polynomials[4];
    proving_key->p_x_low_limbs_range_constraint_0 = wire_polynomials[5];
    proving_key->p_x_low_limbs_range_constraint_1 = wire_polynomials[6];
    proving_key->p_x_low_limbs_range_constraint_2 = wire_polynomials[7];
    proving_key->p_x_low_limbs_range_constraint_3 = wire_polynomials[8];
    proving_key->p_x_low_limbs_range_constraint_4 = wire_polynomials[9];
    proving_key->p_x_low_limbs_range_constraint_tail = wire_polynomials[10];
    proving_key->p_x_high_limbs = wire_polynomials[11];
    proving_key->p_x_high_limbs_range_constraint_0 = wire_polynomials[12];
    proving_key->p_x_high_limbs_range_constraint_1 = wire_polynomials[13];
    proving_key->p_x_high_limbs_range_constraint_2 = wire_polynomials[14];
    proving_key->p_x_high_limbs_range_constraint_3 = wire_polynomials[15];
    proving_key->p_x_high_limbs_range_constraint_4 = wire_polynomials[16];
    proving_key->p_x_high_limbs_range_constraint_tail = wire_polynomials[17];
    proving_key->p_y_low_limbs = wire_polynomials[18];
    proving_key->p_y_low_limbs_range_constraint_0 = wire_polynomials[19];
    proving_key->p_y_low_limbs_range_constraint_1 = wire_polynomials[20];
    proving_key->p_y_low_limbs_range_constraint_2 = wire_polynomials[21];
    proving_key->p_y_low_limbs_range_constraint_3 = wire_polynomials[22];
    proving_key->p_y_low_limbs_range_constraint_4 = wire_polynomials[23];
    proving_key->p_y_low_limbs_range_constraint_tail = wire_polynomials[24];
    proving_key->p_y_high_limbs = wire_polynomials[25];
    proving_key->p_y_high_limbs_range_constraint_0 = wire_polynomials[26];
    proving_key->p_y_high_limbs_range_constraint_1 = wire_polynomials[27];
    proving_key->p_y_high_limbs_range_constraint_2 = wire_polynomials[28];
    proving_key->p_y_high_limbs_range_constraint_3 = wire_polynomials[29];
    proving_key->p_y_high_limbs_range_constraint_4 = wire_polynomials[30];
    proving_key->p_y_high_limbs_range_constraint_tail = wire_polynomials[31];
    proving_key->z_lo_limbs = wire_polynomials[32];
    proving_key->z_lo_limbs_range_constraint_0 = wire_polynomials[33];
    proving_key->z_lo_limbs_range_constraint_1 = wire_polynomials[34];
    proving_key->z_lo_limbs_range_constraint_2 = wire_polynomials[35];
    proving_key->z_lo_limbs_range_constraint_3 = wire_polynomials[36];
    proving_key->z_lo_limbs_range_constraint_4 = wire_polynomials[37];
    proving_key->z_lo_limbs_range_constraint_tail = wire_polynomials[38];
    proving_key->z_hi_limbs = wire_polynomials[39];
    proving_key->z_hi_limbs_range_constraint_0 = wire_polynomials[40];
    proving_key->z_hi_limbs_range_constraint_1 = wire_polynomials[41];
    proving_key->z_hi_limbs_range_constraint_2 = wire_polynomials[42];
    proving_key->z_hi_limbs_range_constraint_3 = wire_polynomials[43];
    proving_key->z_hi_limbs_range_constraint_4 = wire_polynomials[44];
    proving_key->z_hi_limbs_range_constraint_tail = wire_polynomials[45];
    proving_key->accumulators_binary_limbs_0 = wire_polynomials[46];
    proving_key->accumulators_binary_limbs_1 = wire_polynomials[47];
    proving_key->accumulators_binary_limbs_2 = wire_polynomials[48];
    proving_key->accumulators_binary_limbs_3 = wire_polynomials[49];
    proving_key->accumulator_lo_limbs_range_constraint_0 = wire_polynomials[50];
    proving_key->accumulator_lo_limbs_range_constraint_1 = wire_polynomials[51];
    proving_key->accumulator_lo_limbs_range_constraint_2 = wire_polynomials[52];
    proving_key->accumulator_lo_limbs_range_constraint_3 = wire_polynomials[53];
    proving_key->accumulator_lo_limbs_range_constraint_4 = wire_polynomials[54];
    proving_key->accumulator_lo_limbs_range_constraint_tail = wire_polynomials[55];
    proving_key->accumulator_hi_limbs_range_constraint_0 = wire_polynomials[56];
    proving_key->accumulator_hi_limbs_range_constraint_1 = wire_polynomials[57];
    proving_key->accumulator_hi_limbs_range_constraint_2 = wire_polynomials[58];
    proving_key->accumulator_hi_limbs_range_constraint_3 = wire_polynomials[59];
    proving_key->accumulator_hi_limbs_range_constraint_4 = wire_polynomials[60];
    proving_key->accumulator_hi_limbs_range_constraint_tail = wire_polynomials[61];
    proving_key->quotient_lo_binary_limbs = wire_polynomials[62];
    proving_key->quotient_hi_binary_limbs = wire_polynomials[63];
    proving_key->quotient_lo_limbs_range_constraint_0 = wire_polynomials[64];
    proving_key->quotient_lo_limbs_range_constraint_1 = wire_polynomials[65];
    proving_key->quotient_lo_limbs_range_constraint_2 = wire_polynomials[66];
    proving_key->quotient_lo_limbs_range_constraint_3 = wire_polynomials[67];
    proving_key->quotient_lo_limbs_range_constraint_4 = wire_polynomials[68];
    proving_key->quotient_lo_limbs_range_constraint_tail = wire_polynomials[69];
    proving_key->quotient_hi_limbs_range_constraint_0 = wire_polynomials[70];
    proving_key->quotient_hi_limbs_range_constraint_1 = wire_polynomials[71];
    proving_key->quotient_hi_limbs_range_constraint_2 = wire_polynomials[72];
    proving_key->quotient_hi_limbs_range_constraint_3 = wire_polynomials[73];
    proving_key->quotient_hi_limbs_range_constraint_4 = wire_polynomials[74];
    proving_key->quotient_hi_limbs_range_constraint_tail = wire_polynomials[75];
    proving_key->relation_wide_limbs = wire_polynomials[76];
    proving_key->relation_wide_limbs_range_constraint_0 = wire_polynomials[77];
    proving_key->relation_wide_limbs_range_constraint_1 = wire_polynomials[78];
    proving_key->relation_wide_limbs_range_constraint_2 = wire_polynomials[79];
    proving_key->relation_wide_limbs_range_constraint_tail = wire_polynomials[80];
    compute_goblin_translator_range_constraint_ordered_polynomials<Flavor>(proving_key.get());
    computed_witness = true;
}

template <typename Flavor>
GoblinTranslatorProver_<Flavor> GoblinTranslatorComposer_<Flavor>::create_prover(CircuitBuilder& circuit_constructor)
{

    // Compute total number of gates, dyadic circuit size, etc.
    compute_circuit_size_parameters(circuit_constructor);

    compute_proving_key(circuit_constructor);
    compute_witness(circuit_constructor);

    compute_commitment_key(proving_key->circuit_size);

    GoblinTranslatorProver_<Flavor> output_state(proving_key, commitment_key);

    return output_state;
}

/**
 * Create verifier: compute verification key,
 * initialize verifier with it and an initial manifest and initialize commitment_scheme.
 *
 * @return The verifier.
 * */
template <typename Flavor>
GoblinTranslatorVerifier_<Flavor> GoblinTranslatorComposer_<Flavor>::create_verifier(
    const CircuitBuilder& circuit_constructor)
{
    auto verification_key = compute_verification_key(circuit_constructor);

    GoblinTranslatorVerifier_<Flavor> output_state(verification_key);

    auto pcs_verification_key = std::make_unique<PCSVerificationKey>(verification_key->circuit_size, crs_factory_);

    output_state.pcs_verification_key = std::move(pcs_verification_key);

    return output_state;
}

template <typename Flavor>
std::shared_ptr<typename Flavor::ProvingKey> GoblinTranslatorComposer_<Flavor>::compute_proving_key(
    const CircuitBuilder& circuit_builder)
{
    if (proving_key) {
        return proving_key;
    }

    proving_key = std::make_shared<ProvingKey>(dyadic_circuit_size);
    proving_key.get()->evaluation_input_x = circuit_builder.evaluation_input_x;
    proving_key.get()->batching_challenge_v = circuit_builder.batching_challenge_v;
    info(proving_key.get()->circuit_size);
    compute_first_and_last_lagrange_polynomials<Flavor>(proving_key.get());
    compute_odd_and_even_lagrange_polynomials<Flavor>(proving_key.get());
    compute_extra_range_constraint_numerator<Flavor>(proving_key.get());

    return proving_key;
}

/**
 * Compute verification key consisting of selector precommitments.
 *
 * @return Pointer to created circuit verification key.
 * */
template <typename Flavor>
std::shared_ptr<typename Flavor::VerificationKey> GoblinTranslatorComposer_<Flavor>::compute_verification_key(
    const CircuitBuilder& circuit_constructor)
{
    if (verification_key) {
        return verification_key;
    }

    if (!proving_key) {
        compute_proving_key(circuit_constructor);
    }

    verification_key =
        std::make_shared<typename Flavor::VerificationKey>(proving_key->circuit_size, proving_key->num_public_inputs);

    verification_key->lagrange_first = commitment_key->commit(proving_key->lagrange_first);
    verification_key->lagrange_last = commitment_key->commit(proving_key->lagrange_last);
    verification_key->lagrange_odd = commitment_key->commit(proving_key->lagrange_odd);
    verification_key->lagrange_even = commitment_key->commit(proving_key->lagrange_even);
    verification_key->ordered_extra_range_constraints_numerator =
        commitment_key->commit(proving_key->ordered_extra_range_constraints_numerator);

    return verification_key;
}
template class GoblinTranslatorComposer_<honk::flavor::GoblinTranslatorBasic>;

} // namespace proof_system::honk
