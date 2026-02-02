#include "barretenberg/avm_fuzzer/common/fuzzer_tracegen_helper.hpp"
#include "barretenberg/common/std_vector.hpp"

namespace bb::avm2::fuzzer {

using namespace bb::avm2::simulation;
using namespace bb::avm2::tracegen;

namespace {

void execute_jobs(std::span<std::function<void()>> jobs)
{
    parallel_for(jobs.size(), [&](size_t i) { jobs[i](); });
}

} // namespace

void AvmFuzzerTraceGenHelper::generate_trace_from_precomputed(TraceContainer& trace,
                                                              EventsContainer&& events,
                                                              const PublicInputs& public_inputs)
{
    auto jobs = concatenate(build_public_inputs_columns_jobs(trace, public_inputs),
                            build_fill_trace_columns_jobs(trace, std::move(events)));
    execute_jobs(jobs);
    fill_trace_interactions(trace);
}

void AvmFuzzerTraceGenHelper::fill_trace_interactions(TraceContainer& trace)
{
    AvmTraceGenHelper::fill_trace_interactions(trace);
}

} // namespace bb::avm2::fuzzer
