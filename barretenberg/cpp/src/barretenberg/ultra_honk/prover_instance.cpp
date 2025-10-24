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
 * @brief Helper method to compute quantities like total number of gates and dyadic circuit size
 *
 * @tparam Flavor
 * @param circuit
 */
template <IsUltraOrMegaHonk Flavor> size_t ProverInstance_<Flavor>::compute_dyadic_size(Circuit& circuit)
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

template <IsUltraOrMegaHonk Flavor> void ProverInstance_<Flavor>::allocate_wires()
{
    BB_BENCH_NAME("allocate_wires");

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1555):Wires can be allocated based on final active row
    // rather than dyadic size.
    for (auto& wire : polynomials.get_wires()) {
        wire = Polynomial::shiftable(dyadic_size());
    }
}

template <IsUltraOrMegaHonk Flavor> void ProverInstance_<Flavor>::allocate_permutation_argument_polynomials()
{
    BB_BENCH_NAME("allocate_permutation_argument_polynomials");

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1555): Sigma and id polynomials can be allocated based
    // on final active row rather than dyadic size.
    for (auto& sigma : polynomials.get_sigmas()) {
        sigma = Polynomial(dyadic_size());
    }
    for (auto& id : polynomials.get_ids()) {
        id = Polynomial(dyadic_size());
    }
    polynomials.z_perm = Polynomial::shiftable(dyadic_size());
}

template <IsUltraOrMegaHonk Flavor> void ProverInstance_<Flavor>::allocate_lagrange_polynomials()
{
    BB_BENCH_NAME("allocate_lagrange_polynomials");

    // First and last lagrange polynomials (in the full circuit size)
    polynomials.lagrange_first = Polynomial(
        /* size=*/1, /*virtual size=*/dyadic_size(), /*start_index=*/0);

    // Even though lagrange_last has a single non-zero element, we cannot set its size to 0 as different
    // instances being folded might have lagrange_last set at different indexes and folding does not work
    // correctly unless the polynomial is allocated in the correct range to accomodate this
    polynomials.lagrange_last = Polynomial(
        /* size=*/dyadic_size(), /*virtual size=*/dyadic_size(), /*start_index=*/0);
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

    size_t table_offset = circuit.blocks.lookup.trace_offset();
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1555): Can allocate table polynomials based on genuine
    // lookup table sizes in all cases. Same applies to read_counts/tags, except for ZK case.
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
        static_cast<size_t>(circuit.blocks.lookup.trace_offset()) + circuit.blocks.lookup.size();
    const auto tables_end = circuit.blocks.lookup.trace_offset() + max_tables_size;

    // Allocate the lookup_inverses polynomial

    const size_t lookup_inverses_start = table_offset;
    const size_t lookup_inverses_end = std::max(lookup_block_end, tables_end);

    polynomials.lookup_inverses =
        Polynomial(lookup_inverses_end - lookup_inverses_start, dyadic_size(), lookup_inverses_start);
}

template <IsUltraOrMegaHonk Flavor>
void ProverInstance_<Flavor>::allocate_ecc_op_polynomials(const Circuit& circuit)
    requires IsMegaFlavor<Flavor>
{
    BB_BENCH_NAME("allocate_ecc_op_polynomials");

    // Allocate the ecc op wires and selector
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
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1555): Each triple of databus polynomials can be
    // allocated based on the size of the corresponding column (except for ZK case).
    const size_t poly_size = std::min(static_cast<size_t>(MAX_DATABUS_SIZE), dyadic_size());
    polynomials.calldata = Polynomial(poly_size, dyadic_size());
    polynomials.calldata_read_counts = Polynomial(poly_size, dyadic_size());
    polynomials.calldata_read_tags = Polynomial(poly_size, dyadic_size());
    polynomials.secondary_calldata = Polynomial(poly_size, dyadic_size());
    polynomials.secondary_calldata_read_counts = Polynomial(poly_size, dyadic_size());
    polynomials.secondary_calldata_read_tags = Polynomial(poly_size, dyadic_size());
    polynomials.return_data = Polynomial(poly_size, dyadic_size());
    polynomials.return_data_read_counts = Polynomial(poly_size, dyadic_size());
    polynomials.return_data_read_tags = Polynomial(poly_size, dyadic_size());

    // Allocate log derivative lookup argument inverse polynomials
    const size_t q_busread_end = circuit.blocks.busread.trace_offset() + circuit.blocks.busread.size();
    const size_t calldata_size = circuit.get_calldata().size();
    const size_t secondary_calldata_size = circuit.get_secondary_calldata().size();
    const size_t return_data_size = circuit.get_return_data().size();

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1555): Size of databus_id can always be set to max size
    // between the three databus columns. It currently uses dyadic_size because its values are later set based on its
    // size(). This means when we naively construct all ProverPolynomials with dyadic size (e.g. for ZK), we get a
    // different databus_id polynomial and therefore a different VK.
    polynomials.databus_id = Polynomial(dyadic_size(), dyadic_size());
    // polynomials.databus_id = Polynomial(std::max({ calldata_size, secondary_calldata_size, return_data_size,
    // q_busread_end }), dyadic_size());

    polynomials.calldata_inverses = Polynomial(std::max(calldata_size, q_busread_end), dyadic_size());
    polynomials.secondary_calldata_inverses =
        Polynomial(std::max(secondary_calldata_size, q_busread_end), dyadic_size());
    polynomials.return_data_inverses = Polynomial(std::max(return_data_size, q_busread_end), dyadic_size());
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
