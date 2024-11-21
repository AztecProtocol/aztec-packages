#include "decider_proving_key.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/plonk_honk_shared/composer/permutation_lib.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

namespace bb {

/**
 * @brief Helper method to compute quantities like total number of gates and dyadic circuit size
 *
 * @tparam Flavor
 * @param circuit
 */
template <IsUltraFlavor Flavor> size_t DeciderProvingKey_<Flavor>::compute_dyadic_size(Circuit& circuit)
{
    // for the lookup argument the circuit size must be at least as large as the sum of all tables used
    const size_t min_size_due_to_lookups = circuit.get_tables_size();

    // minimum size of execution trace due to everything else
    size_t min_size_of_execution_trace = circuit.public_inputs.size() + circuit.num_gates;
    if constexpr (IsMegaFlavor<Flavor>) {
        min_size_of_execution_trace += circuit.blocks.ecc_op.size();
    }

    // The number of gates is the maximum required by the lookup argument or everything else, plus an optional zero row
    // to allow for shifts.
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
template <IsUltraFlavor Flavor>
void DeciderProvingKey_<Flavor>::construct_databus_polynomials(Circuit& circuit)
    requires IsMegaFlavor<Flavor>
{
    auto& calldata_poly = proving_key.polynomials.calldata;
    auto& calldata_read_counts = proving_key.polynomials.calldata_read_counts;
    auto& calldata_read_tags = proving_key.polynomials.calldata_read_tags;
    auto& secondary_calldata_poly = proving_key.polynomials.secondary_calldata;
    auto& secondary_calldata_read_counts = proving_key.polynomials.secondary_calldata_read_counts;
    auto& secondary_calldata_read_tags = proving_key.polynomials.secondary_calldata_read_tags;
    auto& return_data_poly = proving_key.polynomials.return_data;
    auto& return_data_read_counts = proving_key.polynomials.return_data_read_counts;
    auto& return_data_read_tags = proving_key.polynomials.return_data_read_tags;

    auto calldata = circuit.get_calldata();
    auto secondary_calldata = circuit.get_secondary_calldata();
    auto return_data = circuit.get_return_data();

    // Note: We do not utilize a zero row for databus columns
    for (size_t idx = 0; idx < calldata.size(); ++idx) {
        calldata_poly.at(idx) = circuit.get_variable(calldata[idx]);        // calldata values
        calldata_read_counts.at(idx) = calldata.get_read_count(idx);        // read counts
        calldata_read_tags.at(idx) = calldata_read_counts[idx] > 0 ? 1 : 0; // has row been read or not
    }
    for (size_t idx = 0; idx < secondary_calldata.size(); ++idx) {
        secondary_calldata_poly.at(idx) = circuit.get_variable(secondary_calldata[idx]); // secondary_calldata values
        secondary_calldata_read_counts.at(idx) = secondary_calldata.get_read_count(idx); // read counts
        secondary_calldata_read_tags.at(idx) =
            secondary_calldata_read_counts[idx] > 0 ? 1 : 0; // has row been read or not
    }
    for (size_t idx = 0; idx < return_data.size(); ++idx) {
        return_data_poly.at(idx) = circuit.get_variable(return_data[idx]);        // return data values
        return_data_read_counts.at(idx) = return_data.get_read_count(idx);        // read counts
        return_data_read_tags.at(idx) = return_data_read_counts[idx] > 0 ? 1 : 0; // has row been read or not
    }

    auto& databus_id = proving_key.polynomials.databus_id;
    // Compute a simple identity polynomial for use in the databus lookup argument
    for (size_t i = 0; i < databus_id.size(); ++i) {
        databus_id.at(i) = i;
    }
}

/**
 * @brief Check that the number of gates in each block does not exceed its fixed capacity. Move any overflow to the
 * overflow block.
 * @details Using a structured trace (fixed capcity for each gate type) optimizes the efficiency of folding. However,
 * to accommodate circuits which cannot fit into a prescribed trace, gates which overflow their corresponding block are
 * placed into an overflow block which can contain arbitrary gate types.
 * @note One sublety is that gates at row i may in general utilize the values at row i+1 via shifts. If the last row in
 * a full-capacity block is such a gate, then moving the overflow out of sequence will cause that gate not to be
 * satisfied. To avoid this, when a block overflows, the final gate in the block is duplicated, once in the main block
 * with the selectors turned off but the wires values maintained (so that the prior gate can read into it but it does
 * not itself try to read into the next row) and again as a normal gate in the overflow block. Therefore, the total
 * number of gates in the circuit increases by one for each block that overflows.
 *
 * @tparam Flavor
 * @param circuit
 */
template <IsUltraFlavor Flavor>
void DeciderProvingKey_<Flavor>::move_structured_trace_overflow_to_overflow_block(Circuit& circuit)
{
    auto& blocks = circuit.blocks;
    auto& overflow_block = circuit.blocks.overflow;

    // Set has_overflow to true if a nonzero fixed size has been prescribed for the overflow block
    blocks.has_overflow = (overflow_block.get_fixed_size() > 0);

    blocks.compute_offsets(/*is_structured=*/true); // compute the offset of each fixed size block

    // Check each block for capacity overflow; if necessary move gates into the overflow block
    for (auto& block : blocks.get()) {
        size_t block_size = block.size();
        uint32_t fixed_block_size = block.get_fixed_size();
        if (block_size > fixed_block_size && block != overflow_block) {
            // Disallow overflow in blocks that are not expected to be used by App circuits
            ASSERT(!block.is_pub_inputs);
            if constexpr (IsMegaFlavor<Flavor>) {
                ASSERT(block != blocks.ecc_op);
            }

            // Set has_overflow to true if at least one block exceeds its capacity
            blocks.has_overflow = true;

            // The circuit memory read/write records store the indices at which a RAM/ROM read/write has occurred. If
            // the block containing RAM/ROM gates overflows, the indices of the corresponding gates in the memory
            // records need to be updated to reflect their new position in the overflow block
            if (block.has_ram_rom) {

                uint32_t overflow_cur_idx = overflow_block.trace_offset + static_cast<uint32_t>(overflow_block.size());
                overflow_cur_idx -= block.trace_offset; // we'll add block.trace_offset to everything later
                uint32_t offset = overflow_cur_idx + 1; // +1 accounts for duplication of final gate
                for (auto& idx : circuit.memory_read_records) {
                    // last gate in the main block will be duplicated; if necessary, duplicate the memory read idx too
                    if (idx == fixed_block_size - 1) {
                        circuit.memory_read_records.push_back(overflow_cur_idx);
                    }
                    if (idx >= fixed_block_size) {
                        idx -= fixed_block_size; // redefine index from zero
                        idx += offset;           // shift to correct location in overflow block
                    }
                }
                for (auto& idx : circuit.memory_write_records) {
                    // last gate in the main block will be duplicated; if necessary, duplicate the memory write idx too
                    if (idx == fixed_block_size - 1) {
                        circuit.memory_write_records.push_back(overflow_cur_idx);
                    }
                    if (idx >= fixed_block_size) {
                        idx -= fixed_block_size; // redefine index from zero
                        idx += offset;           // shift to correct location in overflow block
                    }
                }
            }

            // Move the excess wire and selector data from the offending block to the overflow block
            size_t overflow_start = fixed_block_size - 1; // the final gate in the main block is duplicated
            size_t overflow_end = block_size;
            for (auto [wire, overflow_wire] : zip_view(block.wires, overflow_block.wires)) {
                for (size_t i = overflow_start; i < overflow_end; ++i) {
                    overflow_wire.push_back(wire[i]);
                }
                wire.resize(fixed_block_size); // shrink the main block to its max capacity
            }
            for (auto [selector, overflow_selector] : zip_view(block.selectors, overflow_block.selectors)) {
                for (size_t i = overflow_start; i < overflow_end; ++i) {
                    overflow_selector.push_back(selector[i]);
                }
                selector.resize(fixed_block_size); // shrink the main block to its max capacity
            }
            // Convert duplicated final gate in the main block to a 'dummy' gate by turning off all selectors. This
            // ensures it can be read into by the previous gate but does not itself try to read into the next gate.
            for (auto& selector : block.get_gate_selectors()) {
                selector.back() = 0;
            }
        }
    }

    // Set the fixed size of the overflow block to its current size
    if (overflow_block.size() > overflow_block.get_fixed_size()) {
        info("WARNING: Structured trace overflowed beyond the prescribed fixed overflow size. This is valid in the "
             "context of one-off VK/proof generation but not in the IVC setting. \nPrescribed overflow size: ",
             overflow_block.get_fixed_size(),
             ". \nActual overflow size: ",
             overflow_block.size(),
             "\n");
        overflow_block.fixed_size = static_cast<uint32_t>(overflow_block.size());
        blocks.summarize();
    }
}

template class DeciderProvingKey_<UltraFlavor>;
template class DeciderProvingKey_<UltraKeccakFlavor>;
template class DeciderProvingKey_<UltraRollupFlavor>;
template class DeciderProvingKey_<MegaFlavor>;
template class DeciderProvingKey_<MegaZKFlavor>;

} // namespace bb
