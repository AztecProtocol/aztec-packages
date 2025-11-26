// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "prover_instance.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/honk/composer/permutation_lib.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

namespace bb {

/**
 * @brief Compute the minimum dyadic (power-of-2) circuit size
 * @details The dyadic circuit size is the smallest power of two which can accommodate all polynomials required for the
 * proving system. This size must account for the execution trace itself, i.e. the wires/selectors, but also any
 * auxiliary polynomials like those that store the table data for lookup arguments.
 *
 * @tparam Flavor
 * @param circuit
 */
template <IsUltraOrMegaHonk Flavor> size_t ProverInstance_<Flavor>::compute_dyadic_size(Circuit& circuit)
{
    // For the lookup argument the circuit size must be at least as large as the sum of all tables used
    const size_t tables_size = circuit.get_tables_size();

    // minimum size of execution trace due to everything else
    size_t min_size_of_execution_trace = circuit.blocks.get_total_content_size();

    // The number of gates is the maximum required by the lookup argument or everything else, plus an optional zero row
    // to allow for shifts.
    size_t total_num_gates =
        NUM_DISABLED_ROWS_IN_SUMCHECK + num_zero_rows + std::max(tables_size, min_size_of_execution_trace);

    // Next power of 2 (dyadic circuit size)
    return circuit.get_circuit_subgroup_size(total_num_gates);
}

template <IsUltraOrMegaHonk Flavor> void ProverInstance_<Flavor>::allocate_wires()
{
    BB_BENCH_NAME("allocate_wires");

    // If no ZK, allocate only the active range of the trace; else allocate full dyadic size to allow for blinding
    const size_t wire_size = Flavor::HasZK ? dyadic_size() : trace_active_range_size();

    for (auto& wire : polynomials.get_wires()) {
        wire = Polynomial::shiftable(wire_size, dyadic_size());
    }
}

template <IsUltraOrMegaHonk Flavor> void ProverInstance_<Flavor>::allocate_permutation_argument_polynomials()
{
    BB_BENCH_NAME("allocate_permutation_argument_polynomials");

    // Sigma and ID polynomials are zero outside the active trace range
    for (auto& sigma : polynomials.get_sigmas()) {
        sigma = Polynomial::shiftable(trace_active_range_size(), dyadic_size());
    }
    for (auto& id : polynomials.get_ids()) {
        id = Polynomial::shiftable(trace_active_range_size(), dyadic_size());
    }

    // If no ZK, allocate only the active range of the trace; else allocate full dyadic size to allow for blinding
    const size_t z_perm_size = Flavor::HasZK ? dyadic_size() : trace_active_range_size();
    polynomials.z_perm = Polynomial::shiftable(z_perm_size, dyadic_size());
}

template <IsUltraOrMegaHonk Flavor> void ProverInstance_<Flavor>::allocate_lagrange_polynomials()
{
    BB_BENCH_NAME("allocate_lagrange_polynomials");

    polynomials.lagrange_first = Polynomial(
        /* size=*/1, /*virtual size=*/dyadic_size(), /*start_index=*/0);

    polynomials.lagrange_last = Polynomial(
        /* size=*/1, /*virtual size=*/dyadic_size(), /*start_index=*/final_active_wire_idx);
}

template <IsUltraOrMegaHonk Flavor> void ProverInstance_<Flavor>::allocate_selectors(const Circuit& circuit)
{
    BB_BENCH_NAME("allocate_selectors");

    // Define gate selectors over the block they are isolated to
    for (auto [selector, block] : zip_view(polynomials.get_gate_selectors(), circuit.blocks.get_gate_blocks())) {
        selector = Polynomial(block.size(), dyadic_size(), block.trace_offset());
    }

    // Set the other non-gate selector polynomials (e.g. q_l, q_r, q_m etc.) to full size
    for (auto& selector : polynomials.get_non_gate_selectors()) {
        selector = Polynomial(dyadic_size());
    }
}

template <IsUltraOrMegaHonk Flavor>
void ProverInstance_<Flavor>::allocate_table_lookup_polynomials(const Circuit& circuit)
{
    BB_BENCH_NAME("allocate_table_lookup_and_lookup_read_polynomials");

    const size_t tables_size = circuit.get_tables_size(); // cumulative size of all lookup tables

    // Allocate polynomials containing the actual table data; offset to align with the lookup gate block
    BB_ASSERT_GT(dyadic_size(), tables_size);
    for (auto& table_poly : polynomials.get_tables()) {
        table_poly = Polynomial(tables_size, dyadic_size());
    }

    // Read counts and tags: track which table entries have been read
    // For non-ZK, allocate just the table size; for ZK: allocate fulll dyadic_size
    const size_t counts_and_tags_size = Flavor::HasZK ? dyadic_size() : tables_size;
    polynomials.lookup_read_counts = Polynomial(counts_and_tags_size, dyadic_size());
    polynomials.lookup_read_tags = Polynomial(counts_and_tags_size, dyadic_size());

    // Lookup inverses: used in the log-derivative lookup argument
    // Must cover both the lookup gate block (where reads occur) and the table data itself
    const size_t lookup_block_end = circuit.blocks.lookup.trace_offset() + circuit.blocks.lookup.size();
    const size_t lookup_inverses_end = std::max(lookup_block_end, tables_size);

    const size_t lookup_inverses_size = (Flavor::HasZK ? dyadic_size() : lookup_inverses_end);
    polynomials.lookup_inverses = Polynomial(lookup_inverses_size, dyadic_size());
}

template <IsUltraOrMegaHonk Flavor>
void ProverInstance_<Flavor>::allocate_ecc_op_polynomials(const Circuit& circuit)
    requires IsMegaFlavor<Flavor>
{
    BB_BENCH_NAME("allocate_ecc_op_polynomials");

    // Allocate the ecc op wires and selector
    // Note: ECC op wires are not blinded directly so we do not need to allocate full dyadic size for ZK
    const size_t ecc_op_block_size = circuit.blocks.ecc_op.size();
    for (auto& wire : polynomials.get_ecc_op_wires()) {
        wire = Polynomial(ecc_op_block_size, dyadic_size());
    }
    polynomials.lagrange_ecc_op = Polynomial(ecc_op_block_size, dyadic_size());
}

template <IsUltraOrMegaHonk Flavor>
void ProverInstance_<Flavor>::allocate_databus_polynomials(const Circuit& circuit)
    requires HasDataBus<Flavor>
{
    BB_BENCH_NAME("allocate_databus_and_lookup_inverse_polynomials");

    const size_t calldata_size = circuit.get_calldata().size();
    const size_t sec_calldata_size = circuit.get_secondary_calldata().size();
    const size_t return_data_size = circuit.get_return_data().size();

    // Allocate only enough space for the databus data; for ZK, allocate full dyadic size
    const size_t calldata_poly_size = Flavor::HasZK ? dyadic_size() : calldata_size;
    const size_t sec_calldata_poly_size = Flavor::HasZK ? dyadic_size() : sec_calldata_size;
    const size_t return_data_poly_size = Flavor::HasZK ? dyadic_size() : return_data_size;

    polynomials.calldata = Polynomial(calldata_poly_size, dyadic_size());
    polynomials.calldata_read_counts = Polynomial(calldata_poly_size, dyadic_size());
    polynomials.calldata_read_tags = Polynomial(calldata_poly_size, dyadic_size());

    polynomials.secondary_calldata = Polynomial(sec_calldata_poly_size, dyadic_size());
    polynomials.secondary_calldata_read_counts = Polynomial(sec_calldata_poly_size, dyadic_size());
    polynomials.secondary_calldata_read_tags = Polynomial(sec_calldata_poly_size, dyadic_size());

    polynomials.return_data = Polynomial(return_data_poly_size, dyadic_size());
    polynomials.return_data_read_counts = Polynomial(return_data_poly_size, dyadic_size());
    polynomials.return_data_read_tags = Polynomial(return_data_poly_size, dyadic_size());

    // Databus lookup inverses: used in the log-derivative lookup argument
    // Must cover both the databus gate block (where reads occur) and the databus data itself
    const size_t q_busread_end = circuit.blocks.busread.trace_offset() + circuit.blocks.busread.size();
    size_t calldata_inverses_size = Flavor::HasZK ? dyadic_size() : std::max(calldata_size, q_busread_end);
    size_t sec_calldata_inverses_size = Flavor::HasZK ? dyadic_size() : std::max(sec_calldata_size, q_busread_end);
    size_t return_data_inverses_size = Flavor::HasZK ? dyadic_size() : std::max(return_data_size, q_busread_end);

    polynomials.calldata_inverses = Polynomial(calldata_inverses_size, dyadic_size());
    polynomials.secondary_calldata_inverses = Polynomial(sec_calldata_inverses_size, dyadic_size());
    polynomials.return_data_inverses = Polynomial(return_data_inverses_size, dyadic_size());

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1555): Allocate minimum size >1 to avoid point at
    // infinity commitment.
    const size_t max_databus_column_size = std::max({ calldata_size, sec_calldata_size, return_data_size, 2UL });
    polynomials.databus_id = Polynomial(max_databus_column_size, dyadic_size());
}

/**
 * @brief
 * @details
 *
 * @tparam Flavor
 * @param circuit
 */
template <IsUltraOrMegaHonk Flavor>
void ProverInstance_<Flavor>::construct_databus_polynomials(Circuit& circuit)
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

    // Note: Databus columns start from index 0. If this ever changes, make sure to also update the active range
    // construction in ExecutionTraceUsageTracker::update(). We do not utilize a zero row for databus columns.
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
 * @brief Copy RAM/ROM record of reads and writes from the circuit to the instance.
 * @details The memory records in the circuit store indices within the memory block where a read/write is performed.
 * They are stored in the DPK as indices into the full trace by accounting for the offset of the memory block.
 */
template <IsUltraOrMegaHonk Flavor> void ProverInstance_<Flavor>::populate_memory_records(const Circuit& circuit)
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

template class ProverInstance_<UltraFlavor>;
template class ProverInstance_<UltraZKFlavor>;
template class ProverInstance_<UltraKeccakFlavor>;
#ifdef STARKNET_GARAGA_FLAVORS
template class ProverInstance_<UltraStarknetFlavor>;
template class ProverInstance_<UltraStarknetZKFlavor>;
#endif
template class ProverInstance_<UltraKeccakZKFlavor>;
template class ProverInstance_<UltraRollupFlavor>;
template class ProverInstance_<MegaFlavor>;
template class ProverInstance_<MegaZKFlavor>;

} // namespace bb
