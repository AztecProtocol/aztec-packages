// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/ultra_honk/witness_computation.hpp"
#include "barretenberg/common/op_count.hpp"
#include "barretenberg/ext/starknet/flavor/ultra_starknet_flavor.hpp"
#include "barretenberg/ext/starknet/flavor/ultra_starknet_zk_flavor.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"
#include "barretenberg/honk/library/grand_product_delta.hpp"
#include "barretenberg/honk/library/grand_product_library.hpp"
#include "barretenberg/honk/proving_key_inspector.hpp"
#include "barretenberg/relations/databus_lookup_relation.hpp"
#include "barretenberg/relations/logderiv_lookup_relation.hpp"
#include "barretenberg/relations/permutation_relation.hpp"

namespace bb {

/**
 * @brief Add RAM/ROM memory records to the fourth wire polynomial
 *
 * @details This operation must be performed after the first three wires have been
 * committed to, hence the dependence on the `eta` challenge.
 *
 * @tparam Flavor
 * @param eta challenge produced after commitment to first three wire polynomials
 */
template <IsUltraOrMegaHonk Flavor>
void WitnessComputation<Flavor>::add_ram_rom_memory_records_to_wire_4(typename Flavor::ProvingKey& proving_key,
                                                                      const typename Flavor::FF& eta,
                                                                      const typename Flavor::FF& eta_two,
                                                                      const typename Flavor::FF& eta_three)
{
    // The memory record values are computed at the indicated indices as
    // w4 = w3 * eta^3 + w2 * eta^2 + w1 * eta + read_write_flag;
    // (See the Auxiliary relation for details)
    auto wires = proving_key.polynomials.get_wires();

    // Compute read record values
    for (const auto& gate_idx : proving_key.memory_read_records) {
        wires[3].at(gate_idx) += wires[2][gate_idx] * eta_three;
        wires[3].at(gate_idx) += wires[1][gate_idx] * eta_two;
        wires[3].at(gate_idx) += wires[0][gate_idx] * eta;
    }

    // Compute write record values
    for (const auto& gate_idx : proving_key.memory_write_records) {
        wires[3].at(gate_idx) += wires[2][gate_idx] * eta_three;
        wires[3].at(gate_idx) += wires[1][gate_idx] * eta_two;
        wires[3].at(gate_idx) += wires[0][gate_idx] * eta;
        wires[3].at(gate_idx) += 1;
    }
}

/**
 * @brief Compute the inverse polynomials used in the log derivative lookup relations
 *
 * @tparam Flavor
 * @param beta
 * @param gamma
 */
template <IsUltraOrMegaHonk Flavor>
void WitnessComputation<Flavor>::compute_logderivative_inverses(Flavor::ProvingKey& proving_key,
                                                                RelationParameters<FF>& relation_parameters)
{
    PROFILE_THIS_NAME("compute_logderivative_inverses");

    // Compute inverses for conventional lookups
    LogDerivLookupRelation<FF>::compute_logderivative_inverse(
        proving_key.polynomials, relation_parameters, proving_key.circuit_size);

    if constexpr (HasDataBus<Flavor>) {
        // Compute inverses for calldata reads
        DatabusLookupRelation<FF>::template compute_logderivative_inverse</*bus_idx=*/0>(
            proving_key.polynomials, relation_parameters, proving_key.circuit_size);

        // Compute inverses for secondary_calldata reads
        DatabusLookupRelation<FF>::template compute_logderivative_inverse</*bus_idx=*/1>(
            proving_key.polynomials, relation_parameters, proving_key.circuit_size);

        // Compute inverses for return data reads
        DatabusLookupRelation<FF>::template compute_logderivative_inverse</*bus_idx=*/2>(
            proving_key.polynomials, relation_parameters, proving_key.circuit_size);
    }
}

/**
 * @brief Computes public_input_delta and the permutation grand product polynomial
 *
 * @param relation_parameters
 * @param size_override override the size of the domain over which to compute the grand product
 */
template <IsUltraOrMegaHonk Flavor>
void WitnessComputation<Flavor>::compute_grand_product_polynomial(Flavor::ProvingKey& proving_key,
                                                                  RelationParameters<FF>& relation_parameters,
                                                                  size_t size_override)
{
    relation_parameters.public_input_delta = compute_public_input_delta<Flavor>(proving_key.public_inputs,
                                                                                relation_parameters.beta,
                                                                                relation_parameters.gamma,
                                                                                proving_key.circuit_size,
                                                                                proving_key.pub_inputs_offset);

    // Compute permutation grand product polynomial
    compute_grand_product<Flavor, UltraPermutationRelation<FF>>(
        proving_key.polynomials, relation_parameters, size_override, proving_key.active_region_data);
}

/**
 * @brief TEST only method for completing computation of the prover polynomials using random challenges
 *
 * @tparam Flavor
 * @param decider_pk
 */
template <IsUltraOrMegaHonk Flavor>
void WitnessComputation<Flavor>::complete_proving_key_for_test(
    const std::shared_ptr<DeciderProvingKey_<Flavor>>& decider_pk)
{
    // Generate random eta, beta and gamma
    decider_pk->relation_parameters.eta = FF::random_element();
    decider_pk->relation_parameters.eta = FF::random_element();
    decider_pk->relation_parameters.eta_two = FF::random_element();
    decider_pk->relation_parameters.eta_three = FF::random_element();
    decider_pk->relation_parameters.beta = FF::random_element();
    decider_pk->relation_parameters.gamma = FF::random_element();

    add_ram_rom_memory_records_to_wire_4(decider_pk->proving_key,
                                         decider_pk->relation_parameters.eta,
                                         decider_pk->relation_parameters.eta_two,
                                         decider_pk->relation_parameters.eta_three);

    compute_logderivative_inverses(decider_pk->proving_key, decider_pk->relation_parameters);

    compute_grand_product_polynomial(
        decider_pk->proving_key, decider_pk->relation_parameters, decider_pk->final_active_wire_idx + 1);
}

template class WitnessComputation<UltraFlavor>;
template class WitnessComputation<UltraZKFlavor>;
template class WitnessComputation<UltraKeccakFlavor>;
#ifdef STARKNET_GARAGA_FLAVORS
template class WitnessComputation<UltraStarknetFlavor>;
template class WitnessComputation<UltraStarknetZKFlavor>;
#endif
template class WitnessComputation<UltraKeccakZKFlavor>;
template class WitnessComputation<UltraRollupFlavor>;
template class WitnessComputation<MegaFlavor>;
template class WitnessComputation<MegaZKFlavor>;

} // namespace bb
