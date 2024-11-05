#pragma once

#include "barretenberg/plonk_honk_shared/arithmetization/mega_arithmetization.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

namespace bb {

/**
 * @brief Tracks the cumulative usage of the execution trace across a series of circuits
 * @details Primary uses are (1) determining the minimum required structured trace block sizes for a series of circuits
 * in an IVC, and (2) determining the optimal distribution of rows across threads to evenly distribute work based on the
 * fact that unused rows often do not require any computation.
 *
 */
struct ExecutionTraceUsageTracker {
    using Range = std::pair<size_t, size_t>;
    using Builder = MegaCircuitBuilder;
    using MegaTraceBlockSizes = MegaArithmetization::MegaTraceBlocks<size_t>;
    using MegaTraceActiveRanges = MegaArithmetization::MegaTraceBlocks<Range>;
    using MegaTraceFixedBlockSizes = MegaArithmetization::TraceBlocks;

    MegaTraceBlockSizes max_sizes;        // max utilization of each block
    MegaTraceFixedBlockSizes fixed_sizes; // fixed size of each block prescribed by structuring
    MegaTraceActiveRanges active_ranges;  // ranges utlized by the accumulator within the ambient structured trace

    std::vector<Range> thread_ranges; // ranges within the ambient space over which utilized space is evenly distibuted

    // Max sizes of the "tables" for databus and conventional lookups (distinct from the sizes of their gate blocks)
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

    // Update the max block utilization and active trace ranges based on the data from a provided circuit
    void update(const Builder& circuit)
    {
        // Update the max utilization of each gate block
        for (auto [block, max_size] : zip_view(circuit.blocks.get(), max_sizes.get())) {
            max_size = std::max(block.size(), max_size);
        }

        // update the max sixe of the databus and lookup tables
        max_databus_size = std::max({ max_databus_size,
                                      circuit.get_calldata().size(),
                                      circuit.get_secondary_calldata().size(),
                                      circuit.get_return_data().size() });
        max_tables_size = std::max(max_tables_size, circuit.get_tables_size());

        // Update the active ranges of the trace based on max block utilization
        for (auto [max_size, fixed_block, active_range] :
             zip_view(max_sizes.get(), fixed_sizes.get(), active_ranges.get())) {
            size_t start_idx = fixed_block.trace_offset;
            size_t end_idx = start_idx + max_size;
            active_range = Range{ start_idx, end_idx };
        }

        // The active ranges for the databus and lookup relations (both based on log-deriv lookup argument) must
        // incorporate both the lookup/read gate blocks as well as the rows containing the data that is being read.
        // Update the corresponding ranges accordingly. (Note: tables are constructed at the 'bottom' of the trace).
        size_t dyadic_circuit_size = circuit.get_circuit_subgroup_size(fixed_sizes.get_total_structured_size());
        active_ranges.busread.first = 0; // databus data is stored at the top of the trace
        active_ranges.busread.second = std::max(max_databus_size, active_ranges.busread.second);
        active_ranges.lookup.first = std::min(dyadic_circuit_size - max_tables_size, active_ranges.lookup.first);
        active_ranges.lookup.second = dyadic_circuit_size; // lookups are stored at the bottom of the trace
    }

    // Check whether an index is contained within the active ranges
    bool check_is_active(const size_t idx)
    {
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

    /**
     * @brief Construct ranges  of execution trace rows that evenly distribute the active content of the trace across a
     * given number of threads.
     *
     * @param num_threads Num ranges over which to distribute the data
     * @param full_domain_size Size of full domain; needed only for unstructured case
     */
    void construct_thread_ranges(const size_t num_threads, const size_t full_domain_size)
    {
        // Copy the ranges into a simple std container for processing by subsequent methods (cheap)
        std::vector<Range> active_ranges_copy;
        for (const auto& range : active_ranges.get()) {
            active_ranges_copy.push_back(range);
        }

        // Convert the active ranges for each gate type into a set of sorted non-overlapping ranges (union of the input)
        std::vector<Range> simplified_active_ranges;
        if (trace_structure == TraceStructure::NONE) {
            // If not using a structured trace, set the active range to the whole domain
            simplified_active_ranges.push_back(Range{ 0, full_domain_size });
        } else {
            simplified_active_ranges = construct_union_of_ranges(active_ranges_copy);
        }

        // Determine ranges in the structured trace that even distibute the active content across threads
        thread_ranges = construct_ranges_for_equal_content_distribution(simplified_active_ranges, num_threads);
    }

    /**
     * @brief Construct sorted disjoint ranges representing the union of an arbitrary set of ranges
     * @details Used to convert the more complex set of active ranges for the gate types into a set of well formed
     * ranges that can be more easily analyzed.
     *
     * @param ranges Arbitrary set of input ranges (in practice, active ranges of gate types)
     * @return std::vector<Range>
     */
    static std::vector<Range> construct_union_of_ranges(std::vector<Range>& ranges)
    {
        std::vector<Range> union_ranges;

        // Sort the ranges by start index (secondarily by end_idx if start indices agree)
        std::sort(ranges.begin(), ranges.end());

        union_ranges.push_back(ranges.front());

        for (const Range& range : ranges) {
            Range& prev_range = union_ranges.back();

            // If the two ranges overlap or are contiguous, merge them
            if (range.first <= prev_range.second) {
                prev_range.second = std::max(range.second, prev_range.second);
            } else { // otherwise add the present range to the union
                union_ranges.push_back(range);
            }
        }

        return union_ranges;
    }

    /**
     * @brief Given a set of ranges indicating "active" regions of an ambient space, define a given number of new ranges
     * on the ambient space which evenly divide the content
     * @details In practive this is used to determine even distribution of execution trace rows across threads according
     * to ranges describing the active rows of an IVC accumulator
     *
     * @param union_ranges A set of sorted, disjoint ranges
     * @param num_threads
     * @return std::vector<Range>
     */
    static std::vector<Range> construct_ranges_for_equal_content_distribution(const std::vector<Range>& union_ranges,
                                                                              const size_t num_threads)
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