#include "barretenberg/bbapi/bbapi_bench.hpp"
#include "barretenberg/common/throw_or_abort.hpp"

#if !defined(__wasm__) || defined(ENABLE_WASM_BENCH)
#include "barretenberg/common/bb_bench.hpp"
#include <atomic>
#include <sstream>
#endif

namespace bb::bbapi {

BenchEnableTrace::Response BenchEnableTrace::execute(BB_UNUSED BBApiRequest& request) &&
{
#if !defined(__wasm__) || defined(ENABLE_WASM_BENCH)
    detail::use_bb_bench = true;
    detail::capture_per_call_events.store(enable, std::memory_order_relaxed);
    return {};
#else
    throw_or_abort("BenchEnableTrace requires ENABLE_WASM_BENCH in wasm builds");
#endif
}

BenchDump::Response BenchDump::execute(BB_UNUSED BBApiRequest& request) &&
{
#if !defined(__wasm__) || defined(ENABLE_WASM_BENCH)
    std::ostringstream aggregate_json;
    std::ostringstream trace_events_json;

    detail::GLOBAL_BENCH_STATS.serialize_aggregate_data_json(aggregate_json);
    if (include_trace) {
        detail::GLOBAL_BENCH_STATS.serialize_trace_events_json(trace_events_json);
    }
    if (reset) {
        detail::GLOBAL_BENCH_STATS.clear();
    }

    return { .aggregate_json = aggregate_json.str(), .trace_events_json = trace_events_json.str() };
#else
    throw_or_abort("BenchDump requires ENABLE_WASM_BENCH in wasm builds");
#endif
}

} // namespace bb::bbapi
