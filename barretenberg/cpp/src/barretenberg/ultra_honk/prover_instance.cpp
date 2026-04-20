// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "prover_instance.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/memory_profile.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/flavor/mega_avm_flavor.hpp"
#include "barretenberg/honk/composer/composer_lib.hpp"
#include "barretenberg/honk/composer/permutation_lib.hpp"
#include "barretenberg/honk/proof_system/logderivative_library.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/trace_to_polynomials/trace_to_polynomials.hpp"

namespace bb {

template <typename Flavor> ProverInstance_<Flavor>::ProverInstance_(Circuit& circuit)
{
    BB_BENCH_NAME("ProverInstance(Circuit&)");
    vinfo("Constructing ProverInstance");

    // Check pairing point tagging: either no pairing points were created,
    // or all pairing points have been aggregated into a single equivalence class
    BB_ASSERT(circuit.pairing_points_tagging.has_single_pairing_point_tag(),
              "Pairing points must all be aggregated together. Either no pairing points should be created, or "
              "all created pairing points must be aggregated into a single pairing point. Found "
                  << circuit.pairing_points_tagging.num_unique_pairing_points() << " different pairing points.");
    // Check pairing point tagging: check that the pairing points have been set to public
    BB_ASSERT(circuit.pairing_points_tagging.has_public_pairing_points() ||
                  !circuit.pairing_points_tagging.has_pairing_points(),
              "Pairing points must be set to public in the circuit before constructing the ProverInstance.");

    // ProverInstances can be constructed multiple times, hence, we check whether the circuit has been finalized
    if (!circuit.circuit_finalized) {
        circuit.finalize_circuit(/* ensure_nonzero = */ true);
    }
    metadata.dyadic_size = compute_dyadic_size(circuit);
    masking_tail_data.dyadic_size = metadata.dyadic_size;

    // Find index of last non-trivial wire value in the trace
    circuit.blocks.compute_offsets(); // compute offset of each block within the trace
    for (auto& block : circuit.blocks.get()) {
        if (block.size() > 0) {
            final_active_wire_idx = block.trace_offset() + block.size() - 1;
        }
    }

    {
        BB_BENCH_NAME("allocating polynomials");
        vinfo("allocating polynomials object in prover instance...");

        populate_memory_records(circuit);
        allocate_wires();
        allocate_permutation_argument_polynomials();
        allocate_selectors(circuit);
        allocate_table_lookup_polynomials(circuit);
        allocate_lagrange_polynomials();

        if constexpr (IsMegaFlavor<Flavor>) {
            allocate_ecc_op_polynomials(circuit);
        }
        if constexpr (HasDataBus<Flavor>) {
            allocate_databus_polynomials(circuit);
        }

        // Set the shifted polynomials now that all of the to_be_shifted polynomials are defined.
        polynomials.set_shifted();
    }

    if (detail::use_memory_profile) {
        detail::GLOBAL_MEMORY_PROFILE.add_checkpoint("after_alloc");
    }

    // Construct and add to proving key the wire, selector and copy constraint polynomials
    vinfo("populating trace...");
    TraceToPolynomials<Flavor>::populate(circuit, polynomials);

    if constexpr (IsMegaFlavor<Flavor>) {
        BB_BENCH_NAME("constructing databus polynomials");
        construct_databus_polynomials(circuit);
    }

    // Set the lagrange polynomials
    polynomials.lagrange_first.at(0) = 1;
    polynomials.lagrange_last.at(final_active_wire_idx) = 1;

    construct_lookup_polynomials(circuit);

    // Public inputs
    metadata.num_public_inputs = circuit.blocks.pub_inputs.size();
    metadata.pub_inputs_offset = circuit.blocks.pub_inputs.trace_offset();
    for (size_t i = 0; i < metadata.num_public_inputs; ++i) {
        size_t idx = i + metadata.pub_inputs_offset;
        public_inputs.emplace_back(polynomials.w_r[idx]);
    }

    // Copy IPA proof if present
    ipa_proof = circuit.ipa_proof;

    if (std::getenv("BB_POLY_STATS")) {
        analyze_prover_polynomials(polynomials);
    }
    if (detail::use_memory_profile) {
        detail::GLOBAL_MEMORY_PROFILE.add_checkpoint("after_trace");
    }
}

/**
 * @brief Compute the minimum dyadic (power-of-2) circuit size
 * @details The dyadic circuit size is the smallest power of two which can accommodate all polynomials required for the
 * proving system. This size must account for the execution trace itself, i.e. the wires/selectors, but also any
 * auxiliary polynomials like those that store the table data for lookup arguments.
 *
 * @tparam Flavor
 * @param circuit
 */
template <typename Flavor> size_t ProverInstance_<Flavor>::compute_dyadic_size(Circuit& circuit)
{
    // For the lookup argument the circuit size must be at least as large as the sum of all tables used
    const size_t tables_size = circuit.get_tables_size();

    // minimum size of execution trace due to everything else
    size_t min_size_of_execution_trace = circuit.blocks.get_total_content_size();

    // The number of gates is the maximum required by the lookup argument or everything else, plus a zero row to allow
    // for shifts.
    size_t total_num_gates =
        NUM_DISABLED_ROWS_IN_SUMCHECK + NUM_ZERO_ROWS + std::max(tables_size, min_size_of_execution_trace);

    // Next power of 2 (dyadic circuit size)
    return circuit.get_circuit_subgroup_size(total_num_gates);
}

template <typename Flavor> void ProverInstance_<Flavor>::allocate_wires()
{
    BB_BENCH_NAME("allocate_wires");

    // Allocate wires to active trace range only. For ZK, masking values are stored in MaskingTailData.
    const size_t wire_size = trace_active_range_size();

    for (auto& wire : polynomials.get_wires()) {
        wire = Polynomial::shiftable(wire_size, dyadic_size());
    }
}

template <typename Flavor> void ProverInstance_<Flavor>::allocate_permutation_argument_polynomials()
{
    BB_BENCH_NAME("allocate_permutation_argument_polynomials");

    // Sigma and ID polynomials are zero outside the active trace range
    for (auto& sigma : polynomials.get_sigmas()) {
        sigma = Polynomial::shiftable(trace_active_range_size(), dyadic_size());
    }
    for (auto& id : polynomials.get_ids()) {
        id = Polynomial::shiftable(trace_active_range_size(), dyadic_size());
    }

    // Allocate z_perm to active trace range only. For ZK, masking values are stored in MaskingTailData.
    polynomials.z_perm = Polynomial::shiftable(trace_active_range_size(), dyadic_size());
}

template <typename Flavor> void ProverInstance_<Flavor>::allocate_lagrange_polynomials()
{
    BB_BENCH_NAME("allocate_lagrange_polynomials");

    polynomials.lagrange_first = Polynomial(
        /* size=*/1, /*virtual size=*/dyadic_size(), /*start_index=*/0);

    polynomials.lagrange_last = Polynomial(
        /* size=*/1, /*virtual size=*/dyadic_size(), /*start_index=*/final_active_wire_idx);
}

template <typename Flavor> void ProverInstance_<Flavor>::allocate_selectors(const Circuit& circuit)
{
    BB_BENCH_NAME("allocate_selectors");

    // Define gate selectors over the block they are isolated to
    for (auto [selector, block] : zip_view(polynomials.get_gate_selectors(), circuit.blocks.get_gate_blocks())) {
        selector = Polynomial(block.size(), dyadic_size(), block.trace_offset());
    }

    // Set the other non-gate selector polynomials (e.g. q_l, q_r, q_m etc.) to active trace size
    for (auto& selector : polynomials.get_non_gate_selectors()) {
        selector = Polynomial(trace_active_range_size(), dyadic_size());
    }
}

template <typename Flavor> void ProverInstance_<Flavor>::allocate_table_lookup_polynomials(const Circuit& circuit)
{
    BB_BENCH_NAME("allocate_table_lookup_and_lookup_read_polynomials");

    const size_t tables_size = circuit.get_tables_size(); // cumulative size of all lookup tables

    // Allocate polynomials containing the actual table data; offset to align with the lookup gate block
    BB_ASSERT_GT(dyadic_size(), tables_size);
    for (auto& table_poly : polynomials.get_tables()) {
        table_poly = Polynomial(tables_size, dyadic_size());
    }

    // Read counts and tags: track which table entries have been read
    // Allocate just the table size. For ZK, masking values are stored in MaskingTailData.
    polynomials.lookup_read_counts = Polynomial(tables_size, dyadic_size());
    polynomials.lookup_read_tags = Polynomial(tables_size, dyadic_size());

    // Lookup inverses: used in the log-derivative lookup argument
    // Must cover both the lookup gate block (where reads occur) and the table data itself
    const size_t lookup_block_end = circuit.blocks.lookup.trace_offset() + circuit.blocks.lookup.size();
    const size_t lookup_inverses_end = std::max(lookup_block_end, tables_size);

    // Allocate to the minimum needed size. For ZK, masking values are stored in MaskingTailData.
    polynomials.lookup_inverses = Polynomial(lookup_inverses_end, dyadic_size());
}

template <typename Flavor>
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

template <typename Flavor>
void ProverInstance_<Flavor>::allocate_databus_polynomials(const Circuit& circuit)
    requires HasDataBus<Flavor>
{
    BB_BENCH_NAME("allocate_databus_and_lookup_inverse_polynomials");

    // Databus inverses must cover both the databus gate block (where reads occur) and the data itself.
    const size_t q_busread_end = circuit.blocks.busread.trace_offset() + circuit.blocks.busread.size();

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1555): Minimum size >1 to avoid point at infinity
    // commitment.
    size_t max_databus_column_size = 2;

    bb::constexpr_for<0, NUM_BUS_COLUMNS, 1>([&]<size_t bus_idx>() {
        const size_t bus_size = circuit.get_bus_vector(bus_idx).size();
        max_databus_column_size = std::max(max_databus_column_size, bus_size);

        // Values + read_counts: sized to the bus data. For ZK, masking values are stored in MaskingTailData.
        auto entities = polynomials.template databus_entities_for_bus<bus_idx>();
        for (auto& entity : entities) {
            entity = Polynomial(bus_size, dyadic_size());
        }

        // Inverse polynomial: sized to cover both the busread gate block and the bus data.
        auto inverse_ref = polynomials.template databus_inverse_for_bus<bus_idx>();
        inverse_ref[0] = Polynomial(std::max(bus_size, q_busread_end), dyadic_size());
    });

    polynomials.databus_id = Polynomial(max_databus_column_size, dyadic_size());
}

template <typename Flavor> void ProverInstance_<Flavor>::construct_lookup_polynomials(Circuit& circuit)
{
    {
        BB_BENCH_NAME("constructing lookup table polynomials");
        construct_lookup_table_polynomials<Flavor>(polynomials.get_tables(), circuit);
    }
    {
        BB_BENCH_NAME("constructing lookup read counts");
        construct_lookup_read_counts<Flavor>(polynomials.lookup_read_counts, polynomials.lookup_read_tags, circuit);
    }
}

/**
 * @brief Populate the per-bus databus polynomials (values and read counts) and the identity polynomial.
 */
template <typename Flavor>
void ProverInstance_<Flavor>::construct_databus_polynomials(Circuit& circuit)
    requires HasDataBus<Flavor>
{
    // Note: Databus columns start from index 0. If this ever changes, make sure to also update the active range
    // construction in ExecutionTraceUsageTracker::update(). We do not utilize a zero row for databus columns.
    bb::constexpr_for<0, NUM_BUS_COLUMNS, 1>([&]<size_t bus_idx>() {
        const auto& bus_vec = circuit.get_bus_vector(bus_idx);
        auto entities = polynomials.template databus_entities_for_bus<bus_idx>();
        auto& values_poly = entities[0];
        auto& read_counts_poly = entities[1];
        for (size_t idx = 0; idx < bus_vec.size(); ++idx) {
            values_poly.at(idx) = circuit.get_variable(bus_vec[idx]);
            read_counts_poly.at(idx) = bus_vec.get_read_count(idx);
        }
    });

    // Compute a simple identity polynomial for use in the databus lookup argument.
    auto& databus_id = polynomials.databus_id;
    for (size_t i = 0; i < databus_id.size(); ++i) {
        databus_id.at(i) = i;
    }
}

/**
 * @brief Copy RAM/ROM record of reads and writes from the circuit to the instance.
 * @details The memory records in the circuit store indices within the memory block where a read/write is performed.
 * They are stored in the ProverInstance as indices into the full trace by accounting for the offset of the memory
 * block.
 */
template <typename Flavor> void ProverInstance_<Flavor>::populate_memory_records(const Circuit& circuit)
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
template class ProverInstance_<MegaFlavor>;
template class ProverInstance_<MegaZKFlavor>;
template class ProverInstance_<MegaAvmFlavor>;

} // namespace bb
