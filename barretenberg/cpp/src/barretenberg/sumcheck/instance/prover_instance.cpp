#include "prover_instance.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/proof_system/composer/permutation_lib.hpp"
#include "barretenberg/proof_system/library/grand_product_delta.hpp"
#include "barretenberg/proof_system/library/grand_product_library.hpp"

namespace bb {
/**
 * @brief Helper method to compute quantities like total number of gates and dyadic circuit size
 *
 * @tparam Flavor
 * @param circuit
 */
template <class Flavor> void ProverInstance_<Flavor>::compute_circuit_size_parameters(Circuit& circuit)
{
    // Get num conventional gates, num public inputs and num Goblin style ECC op gates
    // const size_t num_gates = circuit.num_gates;
    num_ecc_op_gates = 0;
    if constexpr (IsGoblinFlavor<Flavor>) {
        num_ecc_op_gates = circuit.num_ecc_op_gates;
    }

    // minimum circuit size due to the length of lookups plus tables
    const size_t minimum_circuit_size_due_to_lookups =
        circuit.get_tables_size() + circuit.get_lookups_size() + num_zero_rows;

    // number of populated rows in the execution trace
    size_t num_rows_populated_in_execution_trace =
        num_zero_rows + num_ecc_op_gates + circuit.public_inputs.size() + circuit.num_gates;

    // The number of gates is max(lookup gates + tables, rows already populated in trace) + 1, where the +1 is due to
    // addition of a "zero row" at top of the execution trace to ensure wires and other polys are shiftable.
    size_t total_num_gates = std::max(minimum_circuit_size_due_to_lookups, num_rows_populated_in_execution_trace);

    // Next power of 2
    dyadic_circuit_size = circuit.get_circuit_subgroup_size(total_num_gates);
}

/**
 * @brief Construct Goblin style ECC op wire polynomials
 * @details The Ecc op wire values are assumed to have already been stored in the corresponding block of the
 * conventional wire polynomials. The values for the ecc op wire polynomials are set based on those values.
 *
 * @tparam Flavor
 * @param wire_polynomials
 */
template <class Flavor> void ProverInstance_<Flavor>::construct_ecc_op_wire_polynomials(auto& wire_polynomials)
{
    std::array<polynomial, Flavor::NUM_WIRES> op_wire_polynomials;
    for (auto& poly : op_wire_polynomials) {
        poly = static_cast<polynomial>(dyadic_circuit_size);
    }

    // The ECC op wires are constructed to contain the op data on the appropriate range and to vanish everywhere else.
    // The op data is assumed to have already been stored at the correct location in the convetional wires so the data
    // can simply be copied over directly.
    const size_t op_wire_offset = Flavor::has_zero_row ? 1 : 0;
    for (size_t poly_idx = 0; poly_idx < Flavor::NUM_WIRES; ++poly_idx) {
        for (size_t i = 0; i < num_ecc_op_gates; ++i) {
            size_t idx = i + op_wire_offset;
            op_wire_polynomials[poly_idx][idx] = wire_polynomials[poly_idx][idx];
        }
    }

    proving_key->ecc_op_wire_1 = op_wire_polynomials[0].share();
    proving_key->ecc_op_wire_2 = op_wire_polynomials[1].share();
    proving_key->ecc_op_wire_3 = op_wire_polynomials[2].share();
    proving_key->ecc_op_wire_4 = op_wire_polynomials[3].share();
}

/**
 * @brief
 * @details
 *
 * @tparam Flavor
 * @param circuit
 */
template <class Flavor>
void ProverInstance_<Flavor>::construct_databus_polynomials(Circuit& circuit)
    requires IsGoblinFlavor<Flavor>
{
    polynomial public_calldata(dyadic_circuit_size);
    polynomial calldata_read_counts(dyadic_circuit_size);

    // Note: We do not utilize a zero row for databus columns
    for (size_t idx = 0; idx < circuit.public_calldata.size(); ++idx) {
        public_calldata[idx] = circuit.get_variable(circuit.public_calldata[idx]);
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/821): automate updating of read counts
        calldata_read_counts[idx] = circuit.calldata_read_counts[idx];
    }

    proving_key->calldata = public_calldata.share();
    proving_key->calldata_read_counts = calldata_read_counts.share();
}

template <class Flavor>
void ProverInstance_<Flavor>::construct_table_polynomials(Circuit& circuit, size_t dyadic_circuit_size)
{
    auto table_polynomials = construct_lookup_table_polynomials<Flavor>(circuit, dyadic_circuit_size);
    proving_key->table_1 = table_polynomials[0].share();
    proving_key->table_2 = table_polynomials[1].share();
    proving_key->table_3 = table_polynomials[2].share();
    proving_key->table_4 = table_polynomials[3].share();
}

template <class Flavor> void ProverInstance_<Flavor>::initialize_prover_polynomials()
{
    for (auto [prover_poly, key_poly] : zip_view(prover_polynomials.get_unshifted(), proving_key->get_all())) {
        ASSERT(flavor_get_label(prover_polynomials, prover_poly) == flavor_get_label(*proving_key, key_poly));
        prover_poly = key_poly.share();
    }
    for (auto [prover_poly, key_poly] : zip_view(prover_polynomials.get_shifted(), proving_key->get_to_be_shifted())) {
        ASSERT(flavor_get_label(prover_polynomials, prover_poly) ==
               (flavor_get_label(*proving_key, key_poly) + "_shift"));
        prover_poly = key_poly.shifted();
    }

    std::span<FF> public_wires_source = prover_polynomials.w_r;

    // Determine public input offsets in the circuit relative to the 0th index for Ultra flavors
    pub_inputs_offset = Flavor::has_zero_row ? 1 : 0;
    if constexpr (IsGoblinFlavor<Flavor>) {
        pub_inputs_offset += proving_key->num_ecc_op_gates;
    }
    // Construct the public inputs array
    for (size_t i = 0; i < proving_key->num_public_inputs; ++i) {
        size_t idx = i + pub_inputs_offset;
        public_inputs.emplace_back(public_wires_source[idx]);
    }

    instance_size = proving_key->circuit_size;
    log_instance_size = static_cast<size_t>(numeric::get_msb(instance_size));
}

template <class Flavor> void ProverInstance_<Flavor>::compute_sorted_accumulator_polynomials(FF eta)
{
    relation_parameters.eta = eta;
    // Compute sorted witness-table accumulator
    compute_sorted_list_accumulator(eta);
    prover_polynomials.sorted_accum = proving_key->sorted_accum.share();
    prover_polynomials.sorted_accum_shift = proving_key->sorted_accum.shifted();

    // Finalize fourth wire polynomial by adding lookup memory records
    add_plookup_memory_records_to_wire_4(eta);
    prover_polynomials.w_4 = proving_key->w_4.share();
    prover_polynomials.w_4_shift = proving_key->w_4.shifted();
}

/**
 * @brief Construct sorted list accumulator polynomial 's'.
 *
 * @details Compute s = s_1 + η*s_2 + η²*s_3 + η³*s_4 (via Horner) where s_i are the
 * sorted concatenated witness/table polynomials
 *
 * @param key proving key
 * @param sorted_list_polynomials sorted concatenated witness/table polynomials
 * @param eta random challenge
 * @return Polynomial
 */
template <class Flavor> void ProverInstance_<Flavor>::compute_sorted_list_accumulator(FF eta)
{
    const size_t circuit_size = proving_key->circuit_size;

    auto sorted_list_accumulator = Polynomial{ circuit_size };

    // Construct s via Horner, i.e. s = s_1 + η(s_2 + η(s_3 + η*s_4))
    for (size_t i = 0; i < circuit_size; ++i) {
        FF T0 = sorted_polynomials[3][i];
        T0 *= eta;
        T0 += sorted_polynomials[2][i];
        T0 *= eta;
        T0 += sorted_polynomials[1][i];
        T0 *= eta;
        T0 += sorted_polynomials[0][i];
        sorted_list_accumulator[i] = T0;
    }
    proving_key->sorted_accum = sorted_list_accumulator.share();
}

/**
 * @brief Add plookup memory records to the fourth wire polynomial
 *
 * @details This operation must be performed after the first three wires have been committed to, hence the dependence on
 * the `eta` challenge.
 *
 * @tparam Flavor
 * @param eta challenge produced after commitment to first three wire polynomials
 */
template <class Flavor> void ProverInstance_<Flavor>::add_plookup_memory_records_to_wire_4(FF eta)
{
    // The plookup memory record values are computed at the indicated indices as
    // w4 = w3 * eta^3 + w2 * eta^2 + w1 * eta + read_write_flag;
    // (See plookup_auxiliary_widget.hpp for details)
    auto wires = proving_key->get_wires();

    // Compute read record values
    for (const auto& gate_idx : proving_key->memory_read_records) {
        wires[3][gate_idx] += wires[2][gate_idx];
        wires[3][gate_idx] *= eta;
        wires[3][gate_idx] += wires[1][gate_idx];
        wires[3][gate_idx] *= eta;
        wires[3][gate_idx] += wires[0][gate_idx];
        wires[3][gate_idx] *= eta;
    }

    // Compute write record values
    for (const auto& gate_idx : proving_key->memory_write_records) {
        wires[3][gate_idx] += wires[2][gate_idx];
        wires[3][gate_idx] *= eta;
        wires[3][gate_idx] += wires[1][gate_idx];
        wires[3][gate_idx] *= eta;
        wires[3][gate_idx] += wires[0][gate_idx];
        wires[3][gate_idx] *= eta;
        wires[3][gate_idx] += 1;
    }
}

/**
 * @brief Compute the inverse polynomial used in the log derivative lookup argument
 *
 * @tparam Flavor
 * @param beta
 * @param gamma
 */
template <class Flavor>
void ProverInstance_<Flavor>::compute_logderivative_inverse(FF beta, FF gamma)
    requires IsGoblinFlavor<Flavor>
{
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;

    // Compute permutation and lookup grand product polynomials
    bb::compute_logderivative_inverse<Flavor, typename Flavor::LogDerivLookupRelation>(
        prover_polynomials, relation_parameters, proving_key->circuit_size);
}

/**
 * @brief Compute the simple id polynomial used in the log derivative lookup argument
 *
 * @tparam Flavor
 * @param beta
 * @param gamma
 */
template <class Flavor>
void ProverInstance_<Flavor>::compute_databus_id()
    requires IsGoblinFlavor<Flavor>
{
    typename Flavor::Polynomial databus_id(proving_key->circuit_size);
    for (size_t i = 0; i < databus_id.size(); ++i) {
        databus_id[i] = i;
    }
    proving_key->databus_id = databus_id.share();
}

template <class Flavor> void ProverInstance_<Flavor>::compute_grand_product_polynomials(FF beta, FF gamma)
{
    auto public_input_delta =
        compute_public_input_delta<Flavor>(public_inputs, beta, gamma, proving_key->circuit_size, pub_inputs_offset);
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;
    relation_parameters.public_input_delta = public_input_delta;
    auto lookup_grand_product_delta = compute_lookup_grand_product_delta(beta, gamma, proving_key->circuit_size);
    relation_parameters.lookup_grand_product_delta = lookup_grand_product_delta;

    // Compute permutation and lookup grand product polynomials
    compute_grand_products<Flavor>(proving_key, prover_polynomials, relation_parameters);
}

template class ProverInstance_<UltraFlavor>;
template class ProverInstance_<GoblinUltraFlavor>;

} // namespace bb
