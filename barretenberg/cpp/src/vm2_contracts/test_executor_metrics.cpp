#include "vm2_contracts/test_executor_metrics.hpp"

#include <chrono>

#include <nlohmann/json.hpp>

#include "barretenberg/common/throw_or_abort.hpp"

namespace bb::avm2::contracts {

namespace {

double now_ms()
{
    using clock = std::chrono::steady_clock;
    return std::chrono::duration<double, std::milli>(clock::now().time_since_epoch()).count();
}

} // namespace

TxMetrics& TestExecutorMetrics::metrics_for(const std::string& tx_label)
{
    for (auto& [label, metrics] : tx_metrics_) {
        if (label == tx_label) {
            return metrics;
        }
    }
    tx_metrics_.emplace_back(tx_label, TxMetrics{});
    return tx_metrics_.back().second;
}

const TxMetrics* TestExecutorMetrics::find(const std::string& tx_label) const
{
    for (const auto& [label, metrics] : tx_metrics_) {
        if (label == tx_label) {
            return &metrics;
        }
    }
    return nullptr;
}

void TestExecutorMetrics::start_recording_tx_simulation(const std::string& tx_label)
{
    if (current_tx_label_.has_value()) {
        throw_or_abort("Cannot start recording tx simulation when another is live");
    }
    metrics_for(tx_label);
    current_tx_label_ = tx_label;
    current_start_ms_ = now_ms();
}

void TestExecutorMetrics::stop_recording_tx_simulation(const std::string& tx_label, uint64_t mana_used, bool reverted)
{
    if (current_tx_label_ != tx_label) {
        throw_or_abort("Cannot stop recording metrics for tx when another is live");
    }
    TxMetrics& metrics = metrics_for(tx_label);
    metrics.total_duration_ms = now_ms() - current_start_ms_;
    metrics.mana_used = mana_used;
    metrics.reverted = reverted;
    current_tx_label_ = std::nullopt;
}

void TestExecutorMetrics::record_prover_metrics(const std::string& tx_label, const ProverMetrics& prover)
{
    metrics_for(tx_label).prover = prover;
}

std::string TestExecutorMetrics::to_github_action_benchmark_json() const
{
    nlohmann::json data = nlohmann::json::array();
    for (const auto& [label, metrics] : tx_metrics_) {
        const std::string name = name_prefix_.empty() ? label : name_prefix_ + "/" + label;
        data.push_back(
            { { "name", name + "/totalDurationMs" }, { "value", metrics.total_duration_ms }, { "unit", "ms" } });
        if (metrics.mana_used.has_value()) {
            data.push_back({ { "name", name + "/manaUsed" }, { "value", *metrics.mana_used }, { "unit", "mana" } });
        }
        data.push_back({ { "name", name + "/totalInstructionsExecuted" },
                         { "value", metrics.total_instructions_executed },
                         { "unit", "#instructions" } });
        const auto emit_ms = [&](const char* metric, const std::optional<uint64_t>& value) {
            if (value.has_value()) {
                data.push_back({ { "name", name + "/" + metric }, { "value", *value }, { "unit", "ms" } });
            }
        };
        emit_ms("proverSimulationStepMs", metrics.prover.prover_simulation_step_ms);
        emit_ms("proverProvingStepMs", metrics.prover.prover_proving_step_ms);
        emit_ms("proverTraceGenerationStepMs", metrics.prover.prover_trace_generation_step_ms);
        emit_ms("traceGenerationInteractionsMs", metrics.prover.trace_generation_interactions_ms);
        emit_ms("traceGenerationTracesMs", metrics.prover.trace_generation_traces_ms);
        emit_ms("provingSumcheckMs", metrics.prover.proving_sumcheck_ms);
        emit_ms("provingPcsMs", metrics.prover.proving_pcs_ms);
        emit_ms("provingLogDerivativeInverseMs", metrics.prover.proving_log_derivative_inverse_ms);
        emit_ms("provingLogDerivativeInverseCommitmentsMs",
                metrics.prover.proving_log_derivative_inverse_commitments_ms);
        emit_ms("provingWireCommitmentsMs", metrics.prover.proving_wire_commitments_ms);
    }
    return data.dump(2);
}

std::string TestExecutorMetrics::to_pretty_string() const
{
    std::string out = "# Public TX Simulation Metrics\n";
    for (const auto& [label, metrics] : tx_metrics_) {
        out += "\n## " + label + "\n";
        out += "- Total duration: " + std::to_string(metrics.total_duration_ms) + " ms\n";
        if (metrics.mana_used.has_value()) {
            out += "- Total mana used: " + std::to_string(*metrics.mana_used) + "\n";
            if (metrics.total_duration_ms > 0) {
                const auto mana_per_second =
                    static_cast<uint64_t>(static_cast<double>(*metrics.mana_used) * 1000.0 / metrics.total_duration_ms);
                out += "- Mana per second: " + std::to_string(mana_per_second) + "\n";
            }
        }
        std::string proving;
        const auto pretty_ms = [&](const char* label, const std::optional<uint64_t>& value) {
            if (value.has_value()) {
                proving += "    - " + std::string(label) + ": " + std::to_string(*value) + " ms\n";
            }
        };
        pretty_ms("Simulation (all)", metrics.prover.prover_simulation_step_ms);
        pretty_ms("Proving (all)", metrics.prover.prover_proving_step_ms);
        pretty_ms("Trace generation (all)", metrics.prover.prover_trace_generation_step_ms);
        pretty_ms("Trace generation interactions", metrics.prover.trace_generation_interactions_ms);
        pretty_ms("Trace generation traces", metrics.prover.trace_generation_traces_ms);
        pretty_ms("Sumcheck", metrics.prover.proving_sumcheck_ms);
        pretty_ms("PCS", metrics.prover.proving_pcs_ms);
        pretty_ms("Log derivative inverse", metrics.prover.proving_log_derivative_inverse_ms);
        pretty_ms("Log derivative inverse commitments", metrics.prover.proving_log_derivative_inverse_commitments_ms);
        pretty_ms("Wire commitments", metrics.prover.proving_wire_commitments_ms);
        if (!proving.empty()) {
            out += "- Proving:\n" + proving;
        }
        if (metrics.reverted) {
            out += "- Reverted!\n";
        }
    }
    return out;
}

} // namespace bb::avm2::contracts
