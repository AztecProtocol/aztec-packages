// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "decider_proving_key.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/honk/composer/permutation_lib.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

namespace bb {

/**
 * @brief Helper method to compute quantities like total number of gates and dyadic circuit size
 *
 * @tparam Flavor
 * @param circuit
 */
template <IsUltraOrMegaHonk Flavor> size_t DeciderProvingKey_<Flavor>::compute_dyadic_size(Circuit& circuit)
{
    // for the lookup argument the circuit size must be at least as large as the sum of all tables used
    const size_t min_size_due_to_lookups = circuit.get_tables_size();

    // minimum size of execution trace due to everything else
    size_t min_size_of_execution_trace = circuit.blocks.get_total_content_size();

    // The number of gates is the maximum required by the lookup argument or everything else, plus an optional zero row
    // to allow for shifts.
    size_t total_num_gates =
        NUM_DISABLED_ROWS_IN_SUMCHECK + num_zero_rows + std::max(min_size_due_to_lookups, min_size_of_execution_trace);

    // Next power of 2 (dyadic circuit size)
    return circuit.get_circuit_subgroup_size(total_num_gates);
}

template <IsUltraOrMegaHonk Flavor> void DeciderProvingKey_<Flavor>::allocate_wires()
{
    PROFILE_THIS_NAME("allocate_wires");

    for (auto& wire : polynomials.get_wires()) {
        wire = Polynomial::shiftable(dyadic_size());
    }
}

template <IsUltraOrMegaHonk Flavor> void DeciderProvingKey_<Flavor>::allocate_permutation_argument_polynomials()
{
    PROFILE_THIS_NAME("allocate_permutation_argument_polynomials");

    for (auto& sigma : polynomials.get_sigmas()) {
        sigma = Polynomial(dyadic_size());
    }
    for (auto& id : polynomials.get_ids()) {
        id = Polynomial(dyadic_size());
    }
    polynomials.z_perm = Polynomial::shiftable(dyadic_size());
}

template <IsUltraOrMegaHonk Flavor> void DeciderProvingKey_<Flavor>::allocate_lagrange_polynomials()
{
    PROFILE_THIS_NAME("allocate_lagrange_polynomials");

    // First and last lagrange polynomials (in the full circuit size)
    polynomials.lagrange_first = Polynomial(
        /* size=*/1, /*virtual size=*/dyadic_size(), /*start_index=*/0);

    // Even though lagrange_last has a single non-zero element, we cannot set its size to 0 as different
    // keys being folded might have lagrange_last set at different indexes and folding does not work
    // correctly unless the polynomial is allocated in the correct range to accomodate this
    polynomials.lagrange_last = Polynomial(
        /* size=*/dyadic_size(), /*virtual size=*/dyadic_size(), /*start_index=*/0);
}

template <IsUltraOrMegaHonk Flavor> void DeciderProvingKey_<Flavor>::allocate_selectors(const Circuit& circuit)
{
    PROFILE_THIS_NAME("allocate_selectors");

    // Define gate selectors over the block they are isolated to
    for (auto [selector, block] : zip_view(polynomials.get_gate_selectors(), circuit.blocks.get_gate_blocks())) {

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/914): q_arith is currently used
        // in memory block.
        if (&block == &circuit.blocks.arithmetic) {
            size_t arith_size = circuit.blocks.memory.trace_offset() - circuit.blocks.arithmetic.trace_offset() +
                                circuit.blocks.memory.get_fixed_size(is_structured);
            selector = Polynomial(arith_size, dyadic_size(), circuit.blocks.arithmetic.trace_offset());
        } else {
            selector = Polynomial(block.get_fixed_size(is_structured), dyadic_size(), block.trace_offset());
        }
    }

    // Set the other non-gate selector polynomials (e.g. q_l, q_r, q_m etc.) to full size
    for (auto& selector : polynomials.get_non_gate_selectors()) {
        selector = Polynomial(dyadic_size());
    }
}

template <IsUltraOrMegaHonk Flavor>
void DeciderProvingKey_<Flavor>::allocate_table_lookup_polynomials(const Circuit& circuit)
{
    PROFILE_THIS_NAME("allocate_table_lookup_and_lookup_read_polynomials");

    size_t table_offset = circuit.blocks.lookup.trace_offset();
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1193): can potentially improve memory footprint
    const size_t max_tables_size = dyadic_size() - table_offset;
    BB_ASSERT_GT(dyadic_size(), max_tables_size);

    // Allocate the polynomials containing the actual table data
    if constexpr (IsUltraOrMegaHonk<Flavor>) {
        for (auto& poly : polynomials.get_tables()) {
            poly = Polynomial(max_tables_size, dyadic_size(), table_offset);
        }
    }

    // Allocate the read counts and tags polynomials
    polynomials.lookup_read_counts = Polynomial(max_tables_size, dyadic_size(), table_offset);
    polynomials.lookup_read_tags = Polynomial(max_tables_size, dyadic_size(), table_offset);

    const size_t lookup_block_end =
        static_cast<size_t>(circuit.blocks.lookup.trace_offset() + circuit.blocks.lookup.get_fixed_size(is_structured));
    const auto tables_end = circuit.blocks.lookup.trace_offset() + max_tables_size;

    // Allocate the lookup_inverses polynomial

    const size_t lookup_inverses_start = table_offset;
    const size_t lookup_inverses_end = std::max(lookup_block_end, tables_end);

    polynomials.lookup_inverses =
        Polynomial(lookup_inverses_end - lookup_inverses_start, dyadic_size(), lookup_inverses_start);
}

template <IsUltraOrMegaHonk Flavor>
void DeciderProvingKey_<Flavor>::allocate_ecc_op_polynomials(const Circuit& circuit)
    requires IsMegaFlavor<Flavor>
{
    PROFILE_THIS_NAME("allocate_ecc_op_polynomials");

    // Allocate the ecc op wires and selector
    const size_t ecc_op_block_size = circuit.blocks.ecc_op.get_fixed_size(is_structured);
    for (auto& wire : polynomials.get_ecc_op_wires()) {
        wire = Polynomial(ecc_op_block_size, dyadic_size());
    }
    polynomials.lagrange_ecc_op = Polynomial(ecc_op_block_size, dyadic_size());
}

template <IsUltraOrMegaHonk Flavor>
void DeciderProvingKey_<Flavor>::allocate_databus_polynomials(const Circuit& circuit)
    requires HasDataBus<Flavor>
{
    PROFILE_THIS_NAME("allocate_databus_and_lookup_inverse_polynomials");
    polynomials.calldata = Polynomial(MAX_DATABUS_SIZE, dyadic_size());
    polynomials.calldata_read_counts = Polynomial(MAX_DATABUS_SIZE, dyadic_size());
    polynomials.calldata_read_tags = Polynomial(MAX_DATABUS_SIZE, dyadic_size());
    polynomials.secondary_calldata = Polynomial(MAX_DATABUS_SIZE, dyadic_size());
    polynomials.secondary_calldata_read_counts = Polynomial(MAX_DATABUS_SIZE, dyadic_size());
    polynomials.secondary_calldata_read_tags = Polynomial(MAX_DATABUS_SIZE, dyadic_size());
    polynomials.return_data = Polynomial(MAX_DATABUS_SIZE, dyadic_size());
    polynomials.return_data_read_counts = Polynomial(MAX_DATABUS_SIZE, dyadic_size());
    polynomials.return_data_read_tags = Polynomial(MAX_DATABUS_SIZE, dyadic_size());

    polynomials.databus_id = Polynomial(MAX_DATABUS_SIZE, dyadic_size());

    // Allocate log derivative lookup argument inverse polynomials
    const size_t q_busread_end =
        circuit.blocks.busread.trace_offset() + circuit.blocks.busread.get_fixed_size(is_structured);
    polynomials.calldata_inverses = Polynomial(std::max(circuit.get_calldata().size(), q_busread_end), dyadic_size());
    polynomials.secondary_calldata_inverses =
        Polynomial(std::max(circuit.get_secondary_calldata().size(), q_busread_end), dyadic_size());
    polynomials.return_data_inverses =
        Polynomial(std::max(circuit.get_return_data().size(), q_busread_end), dyadic_size());
}

/**
 * @brief
 * @details
 *
 * @tparam Flavor
 * @param circuit
 */
template <IsUltraOrMegaHonk Flavor>
void DeciderProvingKey_<Flavor>::construct_databus_polynomials(Circuit& circuit)
    requires HasDataBus<Flavor>
{
    auto& calldata_poly = polynomials.calldata;
    auto& calldata_read_counts = polynomials.calldata_read_counts;
    auto& calldata_read_tags = polynomials.calldata_read_tags;
    auto& secondary_calldata_poly = polynomials.secondary_calldata;
    auto& secondary_calldata_read_counts = polynomials.secondary_calldata_read_counts;
    auto& secondary_calldata_read_tags = polynomials.secondary_calldata_read_tags;
    auto& return_data_poly = polynomials.return_data;
    auto& return_data_read_counts = polynomials.return_data_read_counts;
    auto& return_data_read_tags = polynomials.return_data_read_tags;

    const auto& calldata = circuit.get_calldata();
    const auto& secondary_calldata = circuit.get_secondary_calldata();
    const auto& return_data = circuit.get_return_data();

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

    auto& databus_id = polynomials.databus_id;
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
template <IsUltraOrMegaHonk Flavor>
void DeciderProvingKey_<Flavor>::move_structured_trace_overflow_to_overflow_block(Circuit& circuit)
    requires IsMegaFlavor<Flavor>
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
            if (&block == &blocks.pub_inputs) {
                std::ostringstream oss;
                oss << "WARNING: Number of public inputs (" << block_size
                    << ") cannot exceed capacity specified in structured trace: " << fixed_block_size;
                throw_or_abort(oss.str());
            }
            if (&block == &blocks.ecc_op) {
                std::ostringstream oss;
                oss << "WARNING: Number of ecc op gates (" << block_size
                    << ") cannot exceed capacity specified in structured trace: " << fixed_block_size;
                throw_or_abort(oss.str());
            }

            // Set has_overflow to true if at least one block exceeds its capacity
            blocks.has_overflow = true;

            // The circuit memory read/write records store the indices at which a RAM/ROM read/write has occurred. If
            // the block containing RAM/ROM gates overflows, the indices of the corresponding gates in the memory
            // records need to be updated to reflect their new position in the overflow block
            if (&block == &blocks.memory) {
                uint32_t overflow_cur_idx =
                    overflow_block.trace_offset() + static_cast<uint32_t>(overflow_block.size());
                overflow_cur_idx -= block.trace_offset(); // we'll add block.trace_offset to everything later
                uint32_t offset = overflow_cur_idx + 1;   // +1 accounts for duplication of final gate
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
                BB_ASSERT_EQ(selector.empty(), false);
                selector.back() = 0;
            }
        }
    }

    // Set the fixed size of the overflow block to its current size
    if (overflow_block.size() > overflow_block.get_fixed_size()) {
        info("WARNING: Structured trace overflow mechanism in use. Performance may be degraded!");
        overflow_block.fixed_size = static_cast<uint32_t>(overflow_block.size());
        blocks.summarize();
    }
}

/**
 * @brief Copy RAM/ROM record of reads and writes from the circuit to the proving key.
 * @details The memory records in the circuit store indices within the memory block where a read/write is performed.
 * They are stored in the DPK as indices into the full trace by accounting for the offset of the memory block.
 */
template <IsUltraOrMegaHonk Flavor> void DeciderProvingKey_<Flavor>::populate_memory_records(const Circuit& circuit)
{
    // Store the read/write records as indices into the full trace by accounting for the offset of the memory block.
    uint32_t ram_rom_offset = circuit.blocks.memory.trace_offset();
    memory_read_records.reserve(circuit.memory_read_records.size());
    for (auto& index : circuit.memory_read_records) {
        memory_read_records.emplace_back(index + ram_rom_offset);
    }
    memory_write_records.reserve(circuit.memory_write_records.size());
    for (auto& index : circuit.memory_write_records) {
        memory_write_records.emplace_back(index + ram_rom_offset);
    }
}

template class DeciderProvingKey_<UltraFlavor>;
template class DeciderProvingKey_<UltraZKFlavor>;
template class DeciderProvingKey_<UltraKeccakFlavor>;
#ifdef STARKNET_GARAGA_FLAVORS
template class DeciderProvingKey_<UltraStarknetFlavor>;
template class DeciderProvingKey_<UltraStarknetZKFlavor>;
#endif
template class DeciderProvingKey_<UltraKeccakZKFlavor>;
template class DeciderProvingKey_<UltraRollupFlavor>;
template class DeciderProvingKey_<MegaFlavor>;
template class DeciderProvingKey_<MegaZKFlavor>;

} // namespace bb
