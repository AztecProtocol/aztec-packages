#include "execution_trace.hpp"
#include "barretenberg/flavor/plonk_flavors.hpp"
#include "barretenberg/plonk/proof_system/proving_key/proving_key.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_keccak.hpp"
namespace bb {

template <class Flavor>
void ExecutionTrace_<Flavor>::populate(Builder& builder, typename Flavor::ProvingKey& proving_key, bool is_structured)
{
    ZoneScopedN("trace populate");
    // Share wire polynomials, selector polynomials between proving key and builder and copy cycles from raw circuit
    // data
    auto trace_data = construct_trace_data(builder, proving_key, is_structured);

    if constexpr (IsHonkFlavor<Flavor>) {
        proving_key.pub_inputs_offset = trace_data.pub_inputs_offset;
    }
    if constexpr (IsUltraPlonkOrHonk<Flavor>) {
        ZoneScopedN("add_memory_records_to_proving_key");
        add_memory_records_to_proving_key(trace_data, builder, proving_key);
    }

    if constexpr (IsGoblinFlavor<Flavor>) {
        ZoneScopedN("add_ecc_op_wires_to_proving_key");
        add_ecc_op_wires_to_proving_key(builder, proving_key);
    }

    // Compute the permutation argument polynomials (sigma/id) and add them to proving key
    {
        ZoneScopedN("compute_permutation_argument_polynomials");
        compute_permutation_argument_polynomials<Flavor>(builder, &proving_key, trace_data.copy_cycles);
    }
}

template <class Flavor>
void ExecutionTrace_<Flavor>::add_memory_records_to_proving_key(TraceData& trace_data,
                                                                Builder& builder,
                                                                typename Flavor::ProvingKey& proving_key)
    requires IsUltraPlonkOrHonk<Flavor>
{
    ASSERT(proving_key.memory_read_records.empty() && proving_key.memory_write_records.empty());

    // Update indices of RAM/ROM reads/writes based on where block containing these gates sits in the trace
    for (auto& index : builder.memory_read_records) {
        proving_key.memory_read_records.emplace_back(index + trace_data.ram_rom_offset);
    }
    for (auto& index : builder.memory_write_records) {
        proving_key.memory_write_records.emplace_back(index + trace_data.ram_rom_offset);
    }
}

template <class Flavor>
typename ExecutionTrace_<Flavor>::TraceData ExecutionTrace_<Flavor>::construct_trace_data(
    Builder& builder, typename Flavor::ProvingKey& proving_key, bool is_structured)
{
    ZoneScopedN("construct_trace_data");
    TraceData trace_data{ builder, proving_key };

    // Complete the public inputs execution trace block from builder.public_inputs
    populate_public_inputs_block(builder);

    uint32_t offset = Flavor::has_zero_row ? 1 : 0; // Offset at which to place each block in the trace polynomials
    // For each block in the trace, populate wire polys, copy cycles and selector polys

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1078): remove when Keccak flavor works with Poseidon
    // gate
    auto get_blocks = [&]() {
        if constexpr (!HasKeccak<Flavor>) {
            return builder.blocks.get();
        } else {
            return builder.blocks.get_for_ultra_keccak();
        }
    };

    for (auto& block : get_blocks()) {
        auto block_size = static_cast<uint32_t>(block.size());

        // Update wire polynomials and copy cycles
        // NB: The order of row/column loops is arbitrary but needs to be row/column to match old copy_cycle code
        {
            ZoneScopedN("populating wires and copy_cycles");
            for (uint32_t block_row_idx = 0; block_row_idx < block_size; ++block_row_idx) {
                for (uint32_t wire_idx = 0; wire_idx < NUM_WIRES; ++wire_idx) {
                    uint32_t var_idx = block.wires[wire_idx][block_row_idx]; // an index into the variables array
                    uint32_t real_var_idx = builder.real_variable_index[var_idx];
                    uint32_t trace_row_idx = block_row_idx + offset;
                    // Insert the real witness values from this block into the wire polys at the correct offset
                    trace_data.wires[wire_idx][trace_row_idx] = builder.get_variable(var_idx);
                    // Add the address of the witness value to its corresponding copy cycle
                    trace_data.copy_cycles[real_var_idx].emplace_back(cycle_node{ wire_idx, trace_row_idx });
                }
            }
        }

        // Insert the selector values for this block into the selector polynomials at the correct offset
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/398): implicit arithmetization/flavor consistency
        for (size_t selector_idx = 0; selector_idx < NUM_USED_SELECTORS; selector_idx++) {
            auto selector_poly = trace_data.selectors[selector_idx];
            auto selector = block.selectors[selector_idx];
            for (size_t row_idx = 0; row_idx < block_size; ++row_idx) {
                size_t trace_row_idx = row_idx + offset;
                trace_data.selectors[selector_idx][trace_row_idx] = selector[row_idx];
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
        if (is_structured) {
            offset += block.get_fixed_size();
        } else { // otherwise, the next block starts immediately following the previous one
            offset += block_size;
        }
    }
    size_t biggest_copy_cycle = 0;
    int count0 = 0;
    int count1 = 0;
    int count2 = 0;
    int count3 = 0;
    int count4 = 0;
    int count1048600 = 0;
    int countelse = 0;
    for (size_t i = 0; i < builder.variables.size(); ++i) {
        size_t len = trace_data.copy_cycles[i].size();
        biggest_copy_cycle = std::max(biggest_copy_cycle, len);
        if (len == 0)
            count0++;
        else if (len == 1)
            count1++;
        else if (len == 2)
            count2++;
        else if (len == 3)
            count3++;
        else if (len == 4)
            count4++;
        else if (len == 1048600)
            count1048600++;
        else {
            info("other len: ", len);
            countelse++;
        }
    }
    info("biggest copy cycle: ", biggest_copy_cycle);
    info("count0: ", count0);
    info("count1: ", count1);
    info("count2: ", count2);
    info("count3: ", count3);
    info("count4: ", count4);
    info("count1048600: ", count1048600);
    info("countelse: ", countelse);
    return trace_data;
}

template <class Flavor> void ExecutionTrace_<Flavor>::populate_public_inputs_block(Builder& builder)
{
    ZoneScopedN("populate_public_inputs_block");
    // Update the public inputs block
    for (auto& idx : builder.public_inputs) {
        for (size_t wire_idx = 0; wire_idx < NUM_WIRES; ++wire_idx) {
            if (wire_idx < 2) { // first two wires get a copy of the public inputs
                builder.blocks.pub_inputs.wires[wire_idx].emplace_back(idx);
            } else { // the remaining wires get zeros
                builder.blocks.pub_inputs.wires[wire_idx].emplace_back(builder.zero_idx);
            }
        }
        for (auto& selector : builder.blocks.pub_inputs.selectors) {
            selector.emplace_back(0);
        }
    }
}

template <class Flavor>
void ExecutionTrace_<Flavor>::add_ecc_op_wires_to_proving_key(Builder& builder,
                                                              typename Flavor::ProvingKey& proving_key)
    requires IsGoblinFlavor<Flavor>
{
    // Copy the ecc op data from the conventional wires into the op wires over the range of ecc op gates
    auto& ecc_op_selector = proving_key.polynomials.lagrange_ecc_op;
    const size_t op_wire_offset = Flavor::has_zero_row ? 1 : 0;
    for (auto [ecc_op_wire, wire] :
         zip_view(proving_key.polynomials.get_ecc_op_wires(), proving_key.polynomials.get_wires())) {
        for (size_t i = 0; i < builder.blocks.ecc_op.size(); ++i) {
            size_t idx = i + op_wire_offset;
            ecc_op_wire[idx] = wire[idx];
            ecc_op_selector[idx] = 1; // construct selector as the indicator on the ecc op block
        }
    }
}

template class ExecutionTrace_<UltraFlavor>;
template class ExecutionTrace_<UltraKeccakFlavor>;
template class ExecutionTrace_<MegaFlavor>;
template class ExecutionTrace_<plonk::flavor::Standard>;
template class ExecutionTrace_<plonk::flavor::Ultra>;

} // namespace bb