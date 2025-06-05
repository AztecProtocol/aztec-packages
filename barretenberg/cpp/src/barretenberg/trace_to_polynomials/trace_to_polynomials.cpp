// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "trace_to_polynomials.hpp"
#include "barretenberg/ext/starknet/stdlib_circuit_builders/ultra_starknet_flavor.hpp"
#include "barretenberg/ext/starknet/stdlib_circuit_builders/ultra_starknet_zk_flavor.hpp"

#include "barretenberg/stdlib_circuit_builders/mega_zk_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_keccak_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_rollup_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_zk_flavor.hpp"
namespace bb {

template <class Flavor>
void TraceToPolynomials<Flavor>::populate(Builder& builder,
                                          typename Flavor::ProvingKey& proving_key,
                                          bool is_structured)
{

    PROFILE_THIS_NAME("trace populate");

    // Share wire polynomials, selector polynomials between proving key and builder and copy cycles from raw circuit
    // data
    auto trace_data = construct_trace_data(builder, proving_key, is_structured);

    if constexpr (IsUltraOrMegaHonk<Flavor>) {
        proving_key.pub_inputs_offset = trace_data.pub_inputs_offset;
    }
    if constexpr (IsUltraOrMegaHonk<Flavor>) {

        PROFILE_THIS_NAME("add_memory_records_to_proving_key");

        add_memory_records_to_proving_key(trace_data, builder, proving_key);
    }

    if constexpr (IsMegaFlavor<Flavor>) {

        PROFILE_THIS_NAME("add_ecc_op_wires_to_proving_key");

        add_ecc_op_wires_to_proving_key(builder, proving_key);
    }

    // Compute the permutation argument polynomials (sigma/id) and add them to proving key
    {

        PROFILE_THIS_NAME("compute_permutation_argument_polynomials");

        compute_permutation_argument_polynomials<Flavor>(builder, &proving_key, trace_data.copy_cycles);
    }
}

template <class Flavor>
void TraceToPolynomials<Flavor>::add_memory_records_to_proving_key(TraceData& trace_data,
                                                                   Builder& builder,
                                                                   typename Flavor::ProvingKey& proving_key)
    requires IsUltraOrMegaHonk<Flavor>
{
    ASSERT(proving_key.memory_read_records.empty() && proving_key.memory_write_records.empty());

    // Update indices of RAM/ROM reads/writes based on where block containing these gates sits in the trace
    proving_key.memory_read_records.reserve(builder.memory_read_records.size());
    for (auto& index : builder.memory_read_records) {
        proving_key.memory_read_records.emplace_back(index + trace_data.ram_rom_offset);
    }
    proving_key.memory_write_records.reserve(builder.memory_write_records.size());
    for (auto& index : builder.memory_write_records) {
        proving_key.memory_write_records.emplace_back(index + trace_data.ram_rom_offset);
    }
}

template <class Flavor>
typename TraceToPolynomials<Flavor>::TraceData TraceToPolynomials<Flavor>::construct_trace_data(
    Builder& builder, typename Flavor::ProvingKey& proving_key, bool is_structured)
{

    PROFILE_THIS_NAME("construct_trace_data");

    TraceData trace_data{ builder, proving_key };

    uint32_t offset = Flavor::has_zero_row ? 1 : 0; // Offset at which to place each block in the trace polynomials
    // For each block in the trace, populate wire polys, copy cycles and selector polys

    for (auto& block : builder.blocks.get()) {
        auto block_size = static_cast<uint32_t>(block.size());

        // Save ranges over which the blocks are "active" for use in structured commitments
        if constexpr (IsUltraOrMegaHonk<Flavor>) { // Mega and Ultra
            PROFILE_THIS_NAME("construct_active_indices");
            if (block.size() > 0) {
                proving_key.active_region_data.add_range(offset, offset + block.size());
            }
        }

        // Update wire polynomials and copy cycles
        // NB: The order of row/column loops is arbitrary but needs to be row/column to match old copy_cycle code
        {

            PROFILE_THIS_NAME("populating wires and copy_cycles");

            for (uint32_t block_row_idx = 0; block_row_idx < block_size; ++block_row_idx) {
                for (uint32_t wire_idx = 0; wire_idx < NUM_WIRES; ++wire_idx) {
                    uint32_t var_idx = block.wires[wire_idx][block_row_idx]; // an index into the variables array
                    uint32_t real_var_idx = builder.real_variable_index[var_idx];
                    uint32_t trace_row_idx = block_row_idx + offset;
                    // Insert the real witness values from this block into the wire polys at the correct offset
                    trace_data.wires[wire_idx].at(trace_row_idx) = builder.get_variable(var_idx);
                    // Add the address of the witness value to its corresponding copy cycle
                    trace_data.copy_cycles[real_var_idx].emplace_back(cycle_node{ wire_idx, trace_row_idx });
                }
            }
        }

        // Insert the selector values for this block into the selector polynomials at the correct offset
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/398): implicit arithmetization/flavor consistency
        for (size_t selector_idx = 0; selector_idx < NUM_SELECTORS; selector_idx++) {
            auto& selector = block.selectors[selector_idx];
            for (size_t row_idx = 0; row_idx < block_size; ++row_idx) {
                size_t trace_row_idx = row_idx + offset;
                trace_data.selectors[selector_idx].set_if_valid_index(trace_row_idx, selector[row_idx]);
            }
        }

        // Store the offset of the block containing RAM/ROM read/write gates for use in updating memory records
        if (block.has_ram_rom) {
            trace_data.ram_rom_offset = offset;
        }
        // Store offset of public inputs block for use in the pub input mechanism of the permutation argument
        if (block.is_pub_inputs) {
            trace_data.pub_inputs_offset = offset;
        }

        // If the trace is structured, we populate the data from the next block at a fixed block size offset
        // otherwise, the next block starts immediately following the previous one
        offset += block.get_fixed_size(is_structured);
    }

    return trace_data;
}

template <class Flavor>
void TraceToPolynomials<Flavor>::add_ecc_op_wires_to_proving_key(Builder& builder,
                                                                 typename Flavor::ProvingKey& proving_key)
    requires IsMegaFlavor<Flavor>
{
    auto& ecc_op_selector = proving_key.polynomials.lagrange_ecc_op;
    const size_t wire_idx_offset = Flavor::has_zero_row ? 1 : 0;

    // Copy the ecc op data from the conventional wires into the op wires over the range of ecc op gates. The data is
    // stored in the ecc op wires starting from index 0, whereas the wires contain the data offset by a zero row.
    const size_t num_ecc_ops = builder.blocks.ecc_op.size();
    for (auto [ecc_op_wire, wire] :
         zip_view(proving_key.polynomials.get_ecc_op_wires(), proving_key.polynomials.get_wires())) {
        for (size_t i = 0; i < num_ecc_ops; ++i) {
            ecc_op_wire.at(i) = wire[i + wire_idx_offset];
            ecc_op_selector.at(i) = 1; // construct selector as the indicator on the ecc op block
        }
    }
}

template class TraceToPolynomials<UltraFlavor>;
template class TraceToPolynomials<UltraZKFlavor>;
template class TraceToPolynomials<UltraKeccakFlavor>;
#ifdef STARKNET_GARAGA_FLAVORS
template class TraceToPolynomials<UltraStarknetFlavor>;
template class TraceToPolynomials<UltraStarknetZKFlavor>;
#endif
template class TraceToPolynomials<UltraKeccakZKFlavor>;
template class TraceToPolynomials<UltraRollupFlavor>;
template class TraceToPolynomials<MegaFlavor>;
template class TraceToPolynomials<MegaZKFlavor>;

} // namespace bb
