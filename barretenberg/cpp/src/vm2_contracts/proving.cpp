#include "vm2_contracts/proving.hpp"

#include <string>
#include <unordered_map>

#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/vm2/avm_api.hpp"
#include "barretenberg/vm2/testing/public_tx_simulation_tester.hpp"
#include "barretenberg/vm2/tooling/stats.hpp"

namespace bb::avm2::contracts {

PublicSimulatorConfig proving_config()
{
    PublicSimulatorConfig config = testing::PublicTxSimulationTester::default_config();
    config.collect_hints = true;         // Required for proving.
    config.collect_public_inputs = true; // Required for proving.
    return config;
}

namespace {

AvmProvingInputs proving_inputs(const TxSimulationResult& result)
{
    if (!result.public_inputs.has_value() || !result.hints.has_value()) {
        throw_or_abort("proving requires a result simulated with proving_config() (hints/public inputs missing)");
    }
    return AvmProvingInputs{ .public_inputs = *result.public_inputs, .hints = *result.hints };
}

// Maps the current `bb::avm2::Stats` snapshot into a ProverMetrics. `Stats::time()` appends "_ms" to
// each key, so we strip it to match the lookup keys (mirroring AvmProvingTester.recordProverMetrics).
ProverMetrics prover_metrics_from_stats()
{
    std::unordered_map<std::string, uint64_t> times;
    for (auto& [name, value_ms] : Stats::get().snapshot()) {
        const bool has_suffix = name.size() >= 3 && name.compare(name.size() - 3, 3, "_ms") == 0;
        times[has_suffix ? name.substr(0, name.size() - 3) : name] = value_ms;
    }
    const auto get = [&](const std::string& key) -> std::optional<uint64_t> {
        const auto it = times.find(key);
        return it == times.end() ? std::nullopt : std::optional<uint64_t>(it->second);
    };
    return ProverMetrics{
        .prover_simulation_step_ms = get("simulation/all"),
        .prover_proving_step_ms = get("proving/all"),
        .prover_trace_generation_step_ms = get("tracegen/all"),
        .trace_generation_interactions_ms = get("tracegen/interactions"),
        .trace_generation_traces_ms = get("tracegen/traces"),
        .proving_sumcheck_ms = get("prove/sumcheck"),
        .proving_pcs_ms = get("prove/pcs_rounds"),
        .proving_log_derivative_inverse_ms = get("prove/log_derivative_inverse_round"),
        .proving_log_derivative_inverse_commitments_ms = get("prove/log_derivative_inverse_commitments_round"),
        .proving_wire_commitments_ms = get("prove/wire_commitments_round"),
    };
}

} // namespace

bool check_circuit(const TxSimulationResult& result, ProverMetrics* out_metrics)
{
    if (out_metrics != nullptr) {
        Stats::get().reset();
    }
    AvmAPI api;
    const bool passed = api.check_circuit(proving_inputs(result));
    if (out_metrics != nullptr) {
        *out_metrics = prover_metrics_from_stats();
    }
    return passed;
}

bool prove_and_verify(const TxSimulationResult& result, ProverMetrics* out_metrics)
{
    // Full proving commits polynomials, which needs the global CRS; check-circuit does not. Initialize
    // it once on first use (idempotent across calls within a test binary run).
    static const bool crs_initialized = [] {
        srs::init_file_crs_factory(srs::bb_crs_path());
        return true;
    }();
    (void)crs_initialized;

    if (out_metrics != nullptr) {
        Stats::get().reset();
    }
    AvmAPI api;
    const AvmAPI::AvmProof proof = api.prove(proving_inputs(result));
    const bool verified = api.verify(proof, *result.public_inputs);
    if (out_metrics != nullptr) {
        *out_metrics = prover_metrics_from_stats();
    }
    return verified;
}

} // namespace bb::avm2::contracts
