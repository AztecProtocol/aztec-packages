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
template <class Flavor> size_t ProverInstance_<Flavor>::compute_dyadic_size(Circuit& circuit)
{
    // minimum circuit size due to lookup argument
    const size_t min_size_due_to_lookups = circuit.get_tables_size() + circuit.get_lookups_size();

    // minumum size of execution trace due to everything else
    size_t min_size_of_execution_trace = circuit.public_inputs.size() + circuit.num_gates;
    if constexpr (IsGoblinFlavor<Flavor>) {
        min_size_of_execution_trace += circuit.num_ecc_op_gates;
    }

    // The number of gates is the maxmimum required by the lookup argument or everything else, plus an optional zero row
    // to allow for shifts.
    size_t num_zero_rows = Flavor::has_zero_row ? 1 : 0;
    size_t total_num_gates = num_zero_rows + std::max(min_size_due_to_lookups, min_size_of_execution_trace);

    // Next power of 2 (dyadic circuit size)
    return circuit.get_circuit_subgroup_size(total_num_gates);
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
    Polynomial public_calldata{ dyadic_circuit_size };
    Polynomial calldata_read_counts{ dyadic_circuit_size };
    Polynomial databus_id{ dyadic_circuit_size };

    // Note: We do not utilize a zero row for databus columns
    for (size_t idx = 0; idx < circuit.public_calldata.size(); ++idx) {
        public_calldata[idx] = circuit.get_variable(circuit.public_calldata[idx]);
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/821): automate updating of read counts
        calldata_read_counts[idx] = circuit.calldata_read_counts[idx];
    }

    // Compute a simple identity polynomial for use in the databus lookup argument
    for (size_t i = 0; i < databus_id.size(); ++i) {
        databus_id[i] = i;
    }

    proving_key->calldata = public_calldata.share();
    proving_key->calldata_read_counts = calldata_read_counts.share();
    proving_key->databus_id = databus_id.share();
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

template <class Flavor> void ProverInstance_<Flavor>::compute_grand_product_polynomials(FF beta, FF gamma)
{
    auto public_input_delta = compute_public_input_delta<Flavor>(
        proving_key->public_inputs, beta, gamma, proving_key->circuit_size, proving_key->pub_inputs_offset);
    relation_parameters.beta = beta;
    relation_parameters.gamma = gamma;
    relation_parameters.public_input_delta = public_input_delta;
    auto lookup_grand_product_delta = compute_lookup_grand_product_delta(beta, gamma, proving_key->circuit_size);
    relation_parameters.lookup_grand_product_delta = lookup_grand_product_delta;

    // Compute permutation and lookup grand product polynomials
    prover_polynomials = ProverPolynomials(proving_key);
    compute_grand_products<Flavor>(proving_key, prover_polynomials, relation_parameters);
    proving_key->z_perm = prover_polynomials.z_perm;
    proving_key->z_lookup = prover_polynomials.z_lookup;
}

template class ProverInstance_<UltraFlavor>;
template class ProverInstance_<GoblinUltraFlavor>;

} // namespace bb
