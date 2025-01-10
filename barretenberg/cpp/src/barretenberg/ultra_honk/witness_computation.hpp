#pragma once

#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
namespace bb {
/**
 * @brief Class for all the oink rounds, which are shared between the folding prover and ultra prover.
 * @details This class contains execute_preamble_round(), execute_wire_commitments_round(),
 * execute_sorted_list_accumulator_round(), execute_log_derivative_inverse_round(), and
 * execute_grand_product_computation_round().
 *
 * @tparam Flavor
 */
template <IsUltraFlavor Flavor> class WitnessComputation {
    using FF = typename Flavor::FF;

  public:
    static void add_ram_rom_memory_records_to_wire_4(Flavor::ProvingKey& proving_key,
                                                     const FF& eta,
                                                     const FF& eta_two,
                                                     const FF& eta_three);

    static void compute_logderivative_inverses(Flavor::ProvingKey& proving_key,
                                               RelationParameters<FF>& relation_parameters);

    static void compute_grand_product_polynomial(Flavor::ProvingKey& proving_key,
                                                 RelationParameters<FF>& relation_parameters,
                                                 size_t size_override = 0);
};

} // namespace bb