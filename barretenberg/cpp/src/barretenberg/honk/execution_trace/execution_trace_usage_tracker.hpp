// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/honk/execution_trace/mega_execution_trace.hpp"
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
    using MegaTraceActiveRanges = MegaTraceBlockData<Range>;
    using MegaTraceFixedBlockSizes = MegaExecutionTraceBlocks;

    TraceStructure max_sizes;             // max utilization of each block
    MegaTraceFixedBlockSizes fixed_sizes; // fixed size of each block prescribed by structuring
    // Store active ranges based on the most current accumulator and those based on all but the most recently
    // accumulated circuit. The former is needed for the combiner calculation and the latter for the perturbator.
    // The ranges cover all areas in the trace where relations have nontrivial values.
    std::vector<Range> active_ranges;
    std::vector<Range> previous_active_ranges;

    std::vector<std::vector<Range>>
        thread_ranges; // ranges within the ambient space over which utilized space is evenly distibuted

    // Max sizes of the "tables" for databus and conventional lookups (distinct from the sizes of their gate blocks)
    size_t max_databus_size = 0;
    size_t max_tables_size = 0;
    size_t max_gates_size = 0;

    // For printing only. Must match the order of the members in the arithmetization

    static constexpr std::array<std::string_view, 13> block_labels{ "ecc_op",
                                                                    "busread",
                                                                    "lookup",
                                                                    "pub_inputs",
                                                                    "arithmetic",
                                                                    "delta_range",
                                                                    "elliptic",
                                                                    "aux",
                                                                    "poseidon2_external",
                                                                    "poseidon2_internal",
                                                                    "overflow",
                                                                    "databus_table_data",
                                                                    "lookup_table_data" };

    TraceSettings trace_settings;

    ExecutionTraceUsageTracker(const TraceSettings& trace_settings = TraceSettings{})
        : trace_settings(trace_settings)
    {
        for (auto& size : max_sizes.get()) {
            size = 0; // init max sizes to zero
        }

        if (trace_settings.structure) {
            fixed_sizes.set_fixed_block_sizes(trace_settings);
        }

        fixed_sizes.compute_offsets(/*is_structured=*/true);
    }

    // Update the max block utilization and active trace ranges based on the data from a provided circuit
    void update(const Builder& circuit)
    {
        // Update the max utilization of each gate block
        for (auto [block, max_size] : zip_view(circuit.blocks.get(), max_sizes.get())) {
            max_size = std::max(static_cast<uint32_t>(block.size()), max_size);
        }

        max_gates_size = std::max(max_gates_size, circuit.num_gates);

        // update the max sixe of the databus and lookup tables
        max_databus_size = std::max({ max_databus_size,
                                      circuit.get_calldata().size(),
                                      circuit.get_secondary_calldata().size(),
                                      circuit.get_return_data().size() });
        max_tables_size = std::max(max_tables_size, circuit.get_tables_size());

        // Update the active ranges of the trace based on max block utilization
        previous_active_ranges = active_ranges; // store active ranges based on all but the present circuit
        active_ranges.clear();
        for (auto [max_size, fixed_block] : zip_view(max_sizes.get(), fixed_sizes.get())) {
            size_t start_idx = fixed_block.trace_offset;
            size_t end_idx = start_idx + max_size;
            active_ranges.push_back(Range{ start_idx, end_idx });
        }

        // The active ranges must also include the rows where the actual databus and lookup table data are stored.
        size_t databus_data_start = 0; // Databus column data starts at idx 0
        size_t databus_data_end = databus_data_start + max_databus_size;
        active_ranges.push_back(Range{ databus_data_start, databus_data_end }); // region where databus contains data

        // Note: lookup table data is stored in the table polynomials at the idx where lookup gates block begins
        size_t lookup_tables_start = fixed_sizes.lookup.trace_offset;
        size_t lookup_tables_end = lookup_tables_start + max_tables_size;
        active_ranges.emplace_back(Range{ lookup_tables_start, lookup_tables_end }); // region of actual table data
    }

    void print()
    {
        // NOTE: This is used by downstream tools for parsing the required block sizes. Do not change this
        // without updating (or consulting Grego).
        info("Largest circuit: ", max_gates_size, " gates. Trace details:");
        info("Minimum required block sizes for structured trace: ");
        size_t idx = 0;
        for (auto max_size : max_sizes.get()) {
            std::cout << std::left << std::setw(20) << block_labels[idx] << ": " << max_size << std::endl;
            idx++;
        }
        info("");
    }

    void print_active_ranges()
    {
        info("Active regions of accumulator: ");
        for (auto [label, range] : zip_view(block_labels, active_ranges)) {
            std::cout << std::left << std::setw(20) << label << ": (" << range.first << ", " << range.second << ")"
                      << std::endl;
        }
        info("");
    }

    void print_previous_active_ranges()
    {
        info("Active regions of previous accumulator: ");
        for (auto [label, range] : zip_view(block_labels, previous_active_ranges)) {
            std::cout << std::left << std::setw(20) << label << ": (" << range.first << ", " << range.second << ")"
                      << std::endl;
        }
        info("");
    }

    void print_thread_ranges()
    {
        info("Thread ranges: ");
        for (const auto& ranges : thread_ranges) {
            std::cout << "[" << std::endl;
            for (auto range : ranges) {
                std::cout << "(" << range.first << ", " << range.second << ")" << std::endl;
            }
            std::cout << "]" << std::endl;
        }
        info("");
    }

    /**
     * @brief Construct ranges of execution trace rows that evenly distribute the active content of the trace across a
     * given number of threads.
     *
     * @param num_threads Num ranges over which to distribute the data
     * @param full_domain_size Size of full domain; needed only for unstructured case
     * @param use_prev_accumulator Base ranges on previous or current accumulator
     */
    void construct_thread_ranges(const size_t num_threads,
                                 const size_t full_domain_size,
                                 bool use_prev_accumulator = false)
    {
        // Convert the active ranges for each gate type into a set of sorted non-overlapping ranges (union of the input)
        std::vector<Range> simplified_active_ranges;
        if (!trace_settings.structure) {
            // If not using a structured trace, set the active range to the whole domain
            simplified_active_ranges.push_back(Range{ 0, full_domain_size });
        } else {
            simplified_active_ranges = use_prev_accumulator ? construct_union_of_ranges(previous_active_ranges)
                                                            : construct_union_of_ranges(active_ranges);
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
     * @return std::vector<std::vector<Range>>
     */
    static std::vector<std::vector<Range>> construct_ranges_for_equal_content_distribution(
        const std::vector<Range>& union_ranges, const size_t num_threads)
    {
        // Compute the minimum content per thread (final thread will get the leftovers = total_content % num_threads)
        size_t total_content = 0;
        for (const Range& range : union_ranges) {
            total_content += range.second - range.first;
        }
        size_t content_per_thread = total_content / num_threads;
        if (content_per_thread == 0) { // There are more threads than work
            // Put all work at the back
            std::vector<std::vector<Range>> thread_ranges(num_threads);
            thread_ranges.back() = union_ranges;
            return thread_ranges;
        }

        std::vector<std::vector<Range>> thread_ranges = { {} };
        size_t thread_space_remaining = content_per_thread; // content space remaining in current thread

        for (const Range& range : union_ranges) {

            size_t start_idx = range.first;
            size_t content_to_distribute = range.second - start_idx;
            while (content_to_distribute >= thread_space_remaining) {
                // There's enough content to fill the remaining space in the current thread
                size_t end_idx = start_idx + thread_space_remaining;
                thread_ranges.back().push_back(Range{ start_idx, end_idx });
                start_idx = end_idx;
                content_to_distribute -= thread_space_remaining;
                thread_space_remaining = content_per_thread;
                // Create a list for the next thread.
                thread_ranges.push_back({});
            }

            if (content_to_distribute > 0) {
                // Partially fill the next thread with all remaining content.
                thread_ranges.back().push_back(Range{ start_idx, range.second });
                thread_space_remaining -= content_to_distribute;
            }
        }

        // Merge the last two sets of ranges because the last one is a left over.
        std::vector<Range> back = std::move(thread_ranges.back());
        thread_ranges.pop_back();
        for (const Range& range : back) {
            thread_ranges.back().push_back(range);
        }
        thread_ranges.back() = construct_union_of_ranges(thread_ranges.back());

        return thread_ranges;
    }
};
} // namespace bb
