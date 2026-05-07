// Stub implementations of bb::avm2::Stats. Linked into binaries that don't pull in vm2_sim
// (e.g. lightweight `bb` and WASM builds), so callers like bbapi_avm.cpp resolve symbols in
// every build mode. The stub no-ops because AVM proving cannot run on these targets anyway.

#include "barretenberg/vm2/tooling/stats.hpp"

namespace bb::avm2 {

Stats& Stats::get()
{
    static Stats stats;
    return stats;
}

void Stats::reset() {}

void Stats::increment(const std::string& /*key*/, uint64_t /*value*/) {}

void Stats::time(const std::string& /*key*/, const std::function<void()>& f)
{
    f();
}

std::string Stats::to_string(int /*depth*/) const
{
    return {};
}

std::vector<std::pair<std::string, uint64_t>> Stats::snapshot() const
{
    return {};
}

} // namespace bb::avm2
