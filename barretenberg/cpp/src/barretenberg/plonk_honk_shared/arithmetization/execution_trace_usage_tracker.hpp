#pragma once

#include "barretenberg/plonk_honk_shared/arithmetization/mega_arithmetization.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

namespace bb {

/**
 * @brief A debugging utility for tracking the max size of each block over all circuits in the IVC
 *
 */
struct ExecutionTraceUsageTracker {
    using Range = std::pair<size_t, size_t>;
    using Builder = MegaCircuitBuilder;
    using MegaTraceBlockSizes = MegaArithmetization::MegaTraceBlocks<size_t>;
    using MegaTraceActiveRanges = MegaArithmetization::MegaTraceBlocks<Range>;
    using MegaTraceFixedBlockSizes = MegaArithmetization::TraceBlocks;

    MegaTraceBlockSizes max_sizes;
    MegaTraceFixedBlockSizes fixed_sizes;
    MegaTraceActiveRanges active_ranges;

    std::vector<Range> thread_ranges;

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
            active_range = Range{ start_idx, end_idx };
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

    void print_thread_ranges()
    {
        info("Thread ranges: ");
        for (auto range : thread_ranges) {
            std::cout << "(" << range.first << ", " << range.second << ")" << std::endl;
        }
        info("");
    }

    void construct_thread_ranges(const size_t num_threads)
    {
        std::vector<Range> active_ranges_copy;
        for (const auto& range : active_ranges.get()) {
            active_ranges_copy.push_back(range);
        }

        std::vector<Range> simplified_active_ranges = construct_union_of_ranges(active_ranges_copy);

        thread_ranges = construct_thread_ranges_internal(simplified_active_ranges, num_threads);
        // print_thread_ranges();
    }

    static std::vector<Range> construct_union_of_ranges(std::vector<Range> ranges)
    {
        std::vector<Range> union_ranges;

        // Sort the ranges by start index (secondarily by end_idx if start indices agree)
        std::sort(ranges.begin(), ranges.end());

        union_ranges.push_back(ranges.front());

        for (const Range& range : ranges) {
            Range& prev_range = union_ranges.back();

            // If the two ranges overlap or are contiguous, merge them
            if (range.first <= prev_range.second) { // WORKTODO: I think remove this +1
                prev_range.second = std::max(range.second, prev_range.second);
            } else { // otherwise add the present range to the union
                union_ranges.push_back(range);
            }
        }

        return union_ranges;
    }

    static std::vector<Range> construct_thread_ranges_internal(const std::vector<Range>& union_ranges,
                                                               size_t num_threads)
    {
        // Compute the minimum content per thread (final thread will get the leftovers = total_content % num_threads)
        size_t total_content = 0;
        for (const Range& range : union_ranges) {
            total_content += range.second - range.first;
        }
        size_t content_per_thread = total_content / num_threads;

        std::vector<Range> thread_ranges;
        size_t start_idx = union_ranges.front().first;
        size_t thread_space_remaining = content_per_thread; // content space remaining in current thread
        size_t leftovers = 0;                               // content from last range not yet placed in a thread range

        for (const Range& range : union_ranges) {

            size_t range_size = range.second - range.first;
            size_t content_to_distribute = range_size + leftovers;
            size_t num_full_threads = content_to_distribute / content_per_thread;
            leftovers = content_to_distribute % content_per_thread;

            size_t end_idx = range.first;
            for (size_t i = 0; i < num_full_threads; ++i) {
                end_idx += thread_space_remaining;
                thread_ranges.push_back(Range{ start_idx, end_idx });
                start_idx = end_idx;
                thread_space_remaining = content_per_thread;
            }
            thread_space_remaining = content_per_thread - leftovers;
        }
        // Extend the final thread range to the end of the final union range
        thread_ranges.back().second = union_ranges.back().second;

        return thread_ranges;
    }
};
} // namespace bb