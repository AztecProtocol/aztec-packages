#pragma once

#include "barretenberg/plonk_honk_shared/arithmetization/mega_arithmetization.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

namespace bb {

/**
 * @brief A debugging utility for tracking the max size of each block over all circuits in the IVC
 *
 */
struct ExecutionTraceUsageTracker {
    using Builder = MegaCircuitBuilder;
    using MegaTraceBlockSizes = MegaArithmetization::MegaTraceBlocks<size_t>;
    using MegaTraceActiveRanges = MegaArithmetization::MegaTraceBlocks<std::pair<size_t, size_t>>;
    using MegaTraceFixedBlockSizes = MegaArithmetization::TraceBlocks;

    MegaTraceBlockSizes max_sizes;
    MegaTraceFixedBlockSizes fixed_sizes;
    MegaTraceActiveRanges active_ranges;

    size_t max_databus_size = 0;
    size_t max_tables_size = 0;

    TraceStructure trace_structure = TraceStructure::NONE;

    ExecutionTraceUsageTracker(const TraceStructure& trace_structure = TraceStructure::NONE)
        : trace_structure(trace_structure)
    {
        for (auto& size : max_sizes.get()) {
            size = 0; // init max sizes to zero
        }
        fixed_sizes.set_fixed_block_sizes(trace_structure);
        fixed_sizes.compute_offsets(/*is_structured=*/true);
    }

    // Update the max block sizes based on the block sizes of a provided circuit
    void update(Builder& circuit)
    {
        for (auto [block, max_size] : zip_view(circuit.blocks.get(), max_sizes.get())) {
            max_size = std::max(block.size(), max_size);
        }
        max_databus_size = std::max({ max_databus_size,
                                      circuit.get_calldata().size(),
                                      circuit.get_secondary_calldata().size(),
                                      circuit.get_return_data().size() });
        max_tables_size = std::max(max_tables_size, circuit.get_tables_size());

        for (auto [max_size, fixed_block, active_range] :
             zip_view(max_sizes.get(), fixed_sizes.get(), active_ranges.get())) {
            size_t start_idx = fixed_block.trace_offset;
            size_t end_idx = start_idx + max_size;
            active_range = std::pair<size_t, size_t>{ start_idx, end_idx };
        }

        size_t dyadic_circuit_size = circuit.get_circuit_subgroup_size(fixed_sizes.get_total_structured_size());

        // Update ranges for databus and lookups to incorporate their respective tables
        active_ranges.busread.first = 0;
        active_ranges.busread.second = std::max(max_databus_size, active_ranges.busread.second);
        active_ranges.lookup.first = std::min(dyadic_circuit_size - max_tables_size, active_ranges.lookup.first);
        active_ranges.lookup.second = dyadic_circuit_size;
    }

    // Check whether an index is contained within the active ranges
    bool check_is_active(const size_t idx)
    {
        // WORKTODO: if unstructured, just use genuine circuit content here
        // If structured trace is not in use, assume the whole trace is active
        if (trace_structure == TraceStructure::NONE) {
            return true;
        }
        for (auto& range : active_ranges.get()) {
            if (idx >= range.first && idx < range.second) {
                return true;
            }
        }
        return false;
    }

    // For printing only. Must match the order of the members in the arithmetization
    std::vector<std::string> block_labels{ "ecc_op",     "pub_inputs",         "busread",
                                           "arithmetic", "delta_range",        "elliptic",
                                           "aux",        "poseidon2_external", "poseidon2_internal",
                                           "lookup" };

    void print()
    {
        info("Minimum required block sizes for structured trace: ");
        for (auto [label, max_size] : zip_view(block_labels, max_sizes.get())) {
            std::cout << std::left << std::setw(20) << (label + ":") << max_size << std::endl;
        }
        info("");
    }

    void print_active_ranges()
    {
        info("Active regions of accumulator: ");
        for (auto [label, range] : zip_view(block_labels, active_ranges.get())) {
            std::cout << std::left << std::setw(20) << (label + ":") << "(" << range.first << ", " << range.second
                      << ")" << std::endl;
        }
        info("");
    }
};
} // namespace bb