#include "barretenberg/vm2/tracegen_helper.hpp"

#include <array>
#include <functional>
#include <list>
#include <span>
#include <string>

#include "barretenberg/common/std_array.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/vm/stats.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookup_dummy_dynamic.hpp"
#include "barretenberg/vm2/generated/relations/lookup_dummy_precomputed.hpp"
#include "barretenberg/vm2/generated/relations/lookup_rng_chk_diff.hpp"
#include "barretenberg/vm2/generated/relations/lookup_rng_chk_is_r0_16_bit.hpp"
#include "barretenberg/vm2/generated/relations/lookup_rng_chk_is_r1_16_bit.hpp"
#include "barretenberg/vm2/generated/relations/lookup_rng_chk_is_r2_16_bit.hpp"
#include "barretenberg/vm2/generated/relations/lookup_rng_chk_is_r3_16_bit.hpp"
#include "barretenberg/vm2/generated/relations/lookup_rng_chk_is_r4_16_bit.hpp"
#include "barretenberg/vm2/generated/relations/lookup_rng_chk_is_r5_16_bit.hpp"
#include "barretenberg/vm2/generated/relations/lookup_rng_chk_is_r6_16_bit.hpp"
#include "barretenberg/vm2/generated/relations/lookup_rng_chk_is_r7_16_bit.hpp"
#include "barretenberg/vm2/generated/relations/lookup_rng_chk_pow_2.hpp"
#include "barretenberg/vm2/generated/relations/perm_dummy_dynamic.hpp"
#include "barretenberg/vm2/tracegen/alu_trace.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_bitwise.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_power_of_2.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_range.hpp"
#include "barretenberg/vm2/tracegen/lib/permutation_builder.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2 {

using namespace bb::avm2::simulation;
using namespace bb::avm2::tracegen;

namespace {

auto build_precomputed_columns_jobs(TraceContainer& trace)
{
    return std::array<std::function<void()>, 3>{
        [&]() {
            PrecomputedTraceBuilder precomputed_builder;
            AVM_TRACK_TIME("tracegen/precomputed/misc", precomputed_builder.process_misc(trace));
        },
        [&]() {
            PrecomputedTraceBuilder precomputed_builder;
            AVM_TRACK_TIME("tracegen/precomputed/bitwise", precomputed_builder.process_bitwise(trace));
        },
        [&]() {
            PrecomputedTraceBuilder precomputed_builder;
            AVM_TRACK_TIME("tracegen/precomputed/range_8", precomputed_builder.process_sel_range_8(trace));
            AVM_TRACK_TIME("tracegen/precomputed/range_16", precomputed_builder.process_sel_range_16(trace));
            AVM_TRACK_TIME("tracegen/precomputed/power_of_2", precomputed_builder.process_power_of_2(trace));
        },
    };
}

void execute_jobs(std::span<std::function<void()>> jobs)
{
    parallel_for(jobs.size(), [&](size_t i) { jobs[i](); });
}

template <typename T> inline void clear_events(T& c)
{
    c.clear();
    c.shrink_to_fit();
}

void print_trace_stats(const TraceContainer& trace)
{
    unordered_flat_map<std::string, uint32_t> namespace_column_sizes;
    uint64_t total_rows = 0;
    for (size_t col = 0; col < static_cast<size_t>(ColumnAndShifts::NUM_COLUMNS); ++col) {
        const auto& column_rows = trace.get_column_rows(static_cast<Column>(col));
        const std::string& column_name = COLUMN_NAMES.at(col);
        const auto namespace_name = column_name.substr(0, column_name.find('_'));
        namespace_column_sizes[namespace_name] = std::max(namespace_column_sizes[namespace_name], column_rows);
        total_rows += column_rows;
    }
    vinfo("Column sizes per namespace:");
    for (const auto& [namespace_name, column_size] : namespace_column_sizes) {
        vinfo("  ",
              namespace_name,
              ": ",
              column_size,
              " (~2^",
              numeric::get_msb(numeric::round_up_power_2(column_size)),
              ")");
    }
    info("Sum of all column rows: ", total_rows, " (~2^", numeric::get_msb(numeric::round_up_power_2(total_rows)), ")");
}

} // namespace

TraceContainer AvmTraceGenHelper::generate_trace(EventsContainer&& events)
{
    TraceContainer trace;

    // We process the events in parallel. Ideally the jobs should access disjoint column sets.
    {
        auto jobs = concatenate(
            // Precomputed column jobs.
            build_precomputed_columns_jobs(trace),
            // Subtrace jobs.
            std::array<std::function<void()>, 2>{
                [&]() {
                    ExecutionTraceBuilder exec_builder;
                    AVM_TRACK_TIME("tracegen/execution",
                                   exec_builder.process(events.execution, events.addressing, trace));
                    clear_events(events.execution);
                    clear_events(events.addressing);
                },
                [&]() {
                    AluTraceBuilder alu_builder;
                    AVM_TRACK_TIME("tracegen/alu", alu_builder.process(events.alu, trace));
                    clear_events(events.alu);
                },
            });
        AVM_TRACK_TIME("tracegen/traces", execute_jobs(jobs));
    }

    // Now we can compute lookups and permutations.
    {
        auto jobs_interactions = std::array<std::function<void()>, 13>{
            [&]() {
                LookupIntoBitwise<lookup_dummy_precomputed_lookup_settings> lookup_execution_bitwise;
                lookup_execution_bitwise.process(trace);
            },
            [&]() {
                LookupIntoDynamicTable<lookup_dummy_dynamic_lookup_settings> lookup_execution_execution;
                lookup_execution_execution.process(trace);
            },
            [&]() {
                PermutationBuilder<perm_dummy_dynamic_permutation_settings> perm_execution_execution;
                perm_execution_execution.process(trace);
            },
            [&]() {
                LookupIntoRange<lookup_rng_chk_diff_lookup_settings> lookup_rng_chk_diff;
                lookup_rng_chk_diff.process(trace);
            },
            [&]() {
                LookupIntoPowerOf2<lookup_rng_chk_pow_2_lookup_settings> lookup_rng_chk_pow_2;
                lookup_rng_chk_pow_2.process(trace);
            },
            [&]() {
                LookupIntoRange<lookup_rng_chk_is_r0_16_bit_lookup_settings> lookup_rng_chk_is_r0_16_bit;
                lookup_rng_chk_is_r0_16_bit.process(trace);
            },
            [&]() {
                LookupIntoRange<lookup_rng_chk_is_r1_16_bit_lookup_settings> lookup_rng_chk_is_r1_16_bit;
                lookup_rng_chk_is_r1_16_bit.process(trace);
            },
            [&]() {
                LookupIntoRange<lookup_rng_chk_is_r2_16_bit_lookup_settings> lookup_rng_chk_is_r2_16_bit;
                lookup_rng_chk_is_r2_16_bit.process(trace);
            },
            [&]() {
                LookupIntoRange<lookup_rng_chk_is_r3_16_bit_lookup_settings> lookup_rng_chk_is_r3_16_bit;
                lookup_rng_chk_is_r3_16_bit.process(trace);
            },
            [&]() {
                LookupIntoRange<lookup_rng_chk_is_r4_16_bit_lookup_settings> lookup_rng_chk_is_r4_16_bit;
                lookup_rng_chk_is_r4_16_bit.process(trace);
            },
            [&]() {
                LookupIntoRange<lookup_rng_chk_is_r5_16_bit_lookup_settings> lookup_rng_chk_is_r5_16_bit;
                lookup_rng_chk_is_r5_16_bit.process(trace);
            },
            [&]() {
                LookupIntoRange<lookup_rng_chk_is_r6_16_bit_lookup_settings> lookup_rng_chk_is_r6_16_bit;
                lookup_rng_chk_is_r6_16_bit.process(trace);
            },
            [&]() {
                LookupIntoRange<lookup_rng_chk_is_r7_16_bit_lookup_settings> lookup_rng_chk_is_r7_16_bit;
                lookup_rng_chk_is_r7_16_bit.process(trace);
            },
        };
        AVM_TRACK_TIME("tracegen/interactions", execute_jobs(jobs_interactions));
    }

    print_trace_stats(trace);
    return trace;
}

TraceContainer AvmTraceGenHelper::generate_precomputed_columns()
{
    TraceContainer trace;
    auto jobs = build_precomputed_columns_jobs(trace);
    execute_jobs(jobs);
    return trace;
}

} // namespace bb::avm2
