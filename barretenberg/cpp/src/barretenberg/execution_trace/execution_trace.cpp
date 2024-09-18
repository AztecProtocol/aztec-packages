#include "execution_trace.hpp"
#include "barretenberg/flavor/plonk_flavors.hpp"
#include "barretenberg/plonk/proof_system/proving_key/proving_key.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_keccak_flavor.hpp"
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
    // Complete the public inputs execution trace block from builder.public_inputs
    populate_public_inputs_block(builder);

    ZoneScopedN("construct_trace_data");
    // Allocate the wires and selectors polynomials
    if constexpr (IsHonkFlavor<Flavor>) {
        for (auto& wire : proving_key.polynomials.get_wires()) {
            wire = Polynomial::shiftable(proving_key.circuit_size);
        }
        // Define selectors over the block they are isolated to
        uint32_t offset = Flavor::has_zero_row ? 1 : 0;
        if constexpr (IsGoblinFlavor<Flavor>) {
            offset += builder.blocks.ecc_op.get_fixed_size(is_structured);
            info("offset after ecc_op block is ", offset);
        }
        offset += builder.blocks.pub_inputs.get_fixed_size(is_structured);
        info("offset after pub_inputs block is ", offset);
        proving_key.polynomials.q_arith =
            Polynomial(proving_key.circuit_size - offset, proving_key.circuit_size, offset);
        offset += builder.blocks.arithmetic.get_fixed_size(is_structured);
        info("offset after arithmetic block is ", offset);
        proving_key.polynomials.q_delta_range =
            Polynomial(builder.blocks.delta_range.size(), proving_key.circuit_size, offset);
        offset += builder.blocks.delta_range.get_fixed_size(is_structured);
        info("offset after delta_range block is ", offset);
        proving_key.polynomials.q_elliptic =
            Polynomial(builder.blocks.elliptic.size(), proving_key.circuit_size, offset);
        offset += builder.blocks.elliptic.get_fixed_size(is_structured);
        info("offset after elliptic block is ", offset);
        proving_key.polynomials.q_aux = Polynomial(builder.blocks.aux.size(), proving_key.circuit_size, offset);
        offset += builder.blocks.aux.get_fixed_size(is_structured);
        info("offset after aux block is ", offset);
        proving_key.polynomials.q_lookup = Polynomial(builder.blocks.lookup.size(), proving_key.circuit_size, offset);
        offset += builder.blocks.lookup.get_fixed_size(is_structured);
        info("offset after lookup block is ", offset);
        if constexpr (HasDataBus<Flavor>) {
            proving_key.polynomials.q_busread =
                Polynomial(builder.blocks.busread.size(), proving_key.circuit_size, offset);
            offset += builder.blocks.busread.get_fixed_size(is_structured);
            info("offset after busread block is ", offset);
        }
        proving_key.polynomials.q_poseidon2_external =
            Polynomial(builder.blocks.poseidon2_external.size(), proving_key.circuit_size, offset);
        offset += builder.blocks.poseidon2_external.get_fixed_size(is_structured);
        info("offset after poseidon2_external block is ", offset);
        proving_key.polynomials.q_poseidon2_internal =
            Polynomial(builder.blocks.poseidon2_internal.size(), proving_key.circuit_size, offset);
        offset += builder.blocks.poseidon2_internal.get_fixed_size(is_structured);
        info("offset after poseidon2_internal block is ", offset);
        // set the other selector polynomials to full size
        proving_key.polynomials.q_m = Polynomial(proving_key.circuit_size);
        proving_key.polynomials.q_c = Polynomial(proving_key.circuit_size);
        proving_key.polynomials.q_l = Polynomial(proving_key.circuit_size);
        proving_key.polynomials.q_r = Polynomial(proving_key.circuit_size);
        proving_key.polynomials.q_o = Polynomial(proving_key.circuit_size);
        proving_key.polynomials.q_4 = Polynomial(proving_key.circuit_size);
    }

    TraceData trace_data{ builder, proving_key };

    uint32_t offset = Flavor::has_zero_row ? 1 : 0; // Offset at which to place each block in the trace polynomials
    // For each block in the trace, populate wire polys, copy cycles and selector polys

    for (auto& block : builder.blocks.get()) {
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
                    trace_data.wires[wire_idx].at(trace_row_idx) = builder.get_variable(var_idx);
                    // Add the address of the witness value to its corresponding copy cycle
                    trace_data.copy_cycles[real_var_idx].emplace_back(cycle_node{ wire_idx, trace_row_idx });
                }
            }
        }

        // Insert the selector values for this block into the selector polynomials at the correct offset
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/398): implicit arithmetization/flavor consistency
        for (size_t selector_idx = 0; selector_idx < NUM_SELECTORS; selector_idx++) {
            auto selector_poly = trace_data.selectors[selector_idx];
            auto selector = block.selectors[selector_idx];
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
    auto& ecc_op_selector = proving_key.polynomials.lagrange_ecc_op;
    const size_t op_wire_offset = Flavor::has_zero_row ? 1 : 0;
    // Allocate the ecc op wires and selector
    const size_t num_ecc_ops = builder.blocks.ecc_op.size();
    if constexpr (IsHonkFlavor<Flavor>) {
        for (auto& wire : proving_key.polynomials.get_ecc_op_wires()) {
            wire = Polynomial(num_ecc_ops, proving_key.circuit_size, op_wire_offset);
        }
        ecc_op_selector = Polynomial(num_ecc_ops, proving_key.circuit_size, op_wire_offset);
    }
    // Copy the ecc op data from the conventional wires into the op wires over the range of ecc op gates
    for (auto [ecc_op_wire, wire] :
         zip_view(proving_key.polynomials.get_ecc_op_wires(), proving_key.polynomials.get_wires())) {
        for (size_t i = 0; i < num_ecc_ops; ++i) {
            size_t idx = i + op_wire_offset;
            ecc_op_wire.at(idx) = wire[idx];
            ecc_op_selector.at(idx) = 1; // construct selector as the indicator on the ecc op block
        }
    }
}

template class ExecutionTrace_<UltraFlavor>;
template class ExecutionTrace_<UltraKeccakFlavor>;
template class ExecutionTrace_<MegaFlavor>;
template class ExecutionTrace_<plonk::flavor::Standard>;
template class ExecutionTrace_<plonk::flavor::Ultra>;

} // namespace bb