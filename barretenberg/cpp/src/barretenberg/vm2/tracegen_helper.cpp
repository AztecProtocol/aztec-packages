#include "barretenberg/vm2/tracegen_helper.hpp"

#include <array>
#include <functional>
#include <list>
#include <span>

#include "barretenberg/common/std_array.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/vm/stats.hpp"
#include "barretenberg/vm2/generated/relations/lookup_dummy_dynamic.hpp"
#include "barretenberg/vm2/generated/relations/lookup_dummy_precomputed.hpp"
#include "barretenberg/vm2/generated/relations/perm_dummy_dynamic.hpp"
#include "barretenberg/vm2/tracegen/alu_trace.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_bitwise.hpp"
#include "barretenberg/vm2/tracegen/lib/permutation_builder.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2 {

using namespace bb::avm2::simulation;
using namespace bb::avm2::tracegen;

namespace {

auto build_precomputed_columns_jobs(TraceContainer& trace)
{
    return std::array<std::function<void()>, 2>{
        [&]() {
            PrecomputedTraceBuilder precomputed_builder;
            AVM_TRACK_TIME("tracegen/precomputed/misc", precomputed_builder.process_misc(trace));
        },
        [&]() {
            PrecomputedTraceBuilder precomputed_builder;
            AVM_TRACK_TIME("tracegen/precomputed/bitwise", precomputed_builder.process_bitwise(trace));
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
        auto jobs_interactions = std::array<std::function<void()>, 3>{
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
        };
        AVM_TRACK_TIME("tracegen/interactions", execute_jobs(jobs_interactions));
    }

    const auto rows = trace.get_num_rows_without_clk();
    info("Generated trace with ",
         rows,
         " rows (closest power of 2: ",
         numeric::get_msb(numeric::round_up_power_2(rows)),
         ") and column clk with 2^21 rows.");
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