#include "barretenberg/bbapi/bbapi_avm.hpp"
#include "barretenberg/api/api_avm.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"

namespace bb::bbapi {

namespace {

// Reset the AVM per-stage timings registry so the snapshot we return reflects only this call.
void reset_avm_stats()
{
    ::bb::avm2::Stats::get().reset();
}

// Take a snapshot of the AVM per-stage timings registry and convert it to the wire-format struct.
std::vector<AvmStat> snapshot_avm_stats()
{
    auto snapshot = ::bb::avm2::Stats::get().snapshot();
    std::vector<AvmStat> result;
    result.reserve(snapshot.size());
    for (auto& [name, value] : snapshot) {
        result.push_back(AvmStat{ .name = std::move(name), .value_ms = value });
    }
    return result;
}

} // namespace

AvmProve::Response AvmProve::execute(const BBApiRequest& /*request*/) &&
{
    reset_avm_stats();
    auto result = avm_prove_from_bytes(std::move(inputs));
    return Response{
        .proof = std::move(result.proof),
        .stats = snapshot_avm_stats(),
    };
}

AvmVerify::Response AvmVerify::execute(const BBApiRequest& /*request*/) &&
{
    bool verified = avm_verify_from_bytes(std::move(proof), std::move(public_inputs));
    return Response{ .verified = verified };
}

AvmCheckCircuit::Response AvmCheckCircuit::execute(const BBApiRequest& /*request*/) &&
{
    reset_avm_stats();
    bool passed = avm_check_circuit_from_bytes(std::move(inputs));
    return Response{ .passed = passed, .stats = snapshot_avm_stats() };
}

} // namespace bb::bbapi
