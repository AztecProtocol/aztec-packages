#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <utility>
#include <vector>

// C++ port of the metrics subset collected by the TS `TestExecutorMetrics`
// (yarn-project/simulator/src/public/test_executor_metrics.ts) needed to reproduce the public-tx
// simulation benchmark and the bulk proving benchmark. It records, per labeled tx: wall-clock
// duration, public L2 mana used, total instructions executed, and (when proving) the prover-stage
// timings, then serialises them to the same github-action-benchmark JSON shape consumed by the
// benchmark dashboard.
namespace bb::avm2::contracts {

// Prover-stage timings (ms) for a single proven tx, mirroring the "Proving" subset of the TS
// `PublicTxMetrics`. Each is optional because check-circuit runs (and any stage not present in the
// `bb::avm2::Stats` snapshot) leave the corresponding entry unset, exactly as the TS recorder did.
struct ProverMetrics {
    std::optional<uint64_t> prover_simulation_step_ms;         // Stats: simulation/all
    std::optional<uint64_t> prover_proving_step_ms;            // Stats: proving/all
    std::optional<uint64_t> prover_trace_generation_step_ms;   // Stats: tracegen/all
    std::optional<uint64_t> trace_generation_interactions_ms;  // Stats: tracegen/interactions
    std::optional<uint64_t> trace_generation_traces_ms;        // Stats: tracegen/traces
    std::optional<uint64_t> proving_sumcheck_ms;               // Stats: prove/sumcheck
    std::optional<uint64_t> proving_pcs_ms;                    // Stats: prove/pcs_rounds
    std::optional<uint64_t> proving_log_derivative_inverse_ms; // Stats: prove/log_derivative_inverse_round
    std::optional<uint64_t>
        proving_log_derivative_inverse_commitments_ms;   // Stats: prove/log_derivative_inverse_commitments_round
    std::optional<uint64_t> proving_wire_commitments_ms; // Stats: prove/wire_commitments_round
};

// Metrics for a single (labeled) simulated tx.
struct TxMetrics {
    double total_duration_ms = 0;
    std::optional<uint64_t> mana_used;
    // Mirrors TS: the sum over enqueued calls' instruction counts. The measured (benchmark) simulator
    // does not hook per-call instruction counts, so this stays 0 here.
    uint64_t total_instructions_executed = 0;
    bool reverted = false;
    ProverMetrics prover;
};

class TestExecutorMetrics {
  public:
    TestExecutorMetrics() = default;
    // `name_prefix` is prepended to every emitted metric name (e.g. "avm/simulation" or "avm/proving"),
    // so the benchmark dashboard groups these under barretenberg/cpp/<name_prefix>/...
    explicit TestExecutorMetrics(std::string name_prefix)
        : name_prefix_(std::move(name_prefix))
    {}

    // Begins timing a tx under `tx_label`. Must be matched by stop_recording_tx_simulation.
    void start_recording_tx_simulation(const std::string& tx_label);
    // Stops timing `tx_label`, recording the wall-clock duration plus the public L2 mana used and
    // whether the tx reverted.
    void stop_recording_tx_simulation(const std::string& tx_label, uint64_t mana_used, bool reverted);

    // Records the prover-stage timings for `tx_label` (mirroring TS recordProverMetrics). The label may
    // already exist (sim metrics recorded first) or be new; either way the proving fields are merged in.
    void record_prover_metrics(const std::string& tx_label, const ProverMetrics& prover);

    // Serialises all recorded metrics to the github-action-benchmark JSON array
    // ([{name, value, unit}, ...]) consumed by the benchmark dashboard, matching
    // TestExecutorMetrics.toGithubActionBenchmarkJSON.
    std::string to_github_action_benchmark_json() const;

    // Human-readable summary (for logging when no BENCH_OUTPUT is set).
    std::string to_pretty_string() const;

  private:
    TxMetrics& metrics_for(const std::string& tx_label);
    const TxMetrics* find(const std::string& tx_label) const;

    // Prepended to every emitted metric name (empty for the unmeasured correctness tests).
    std::string name_prefix_;
    // Insertion-ordered tx label -> metrics. Labels are unique (the tester suffixes a tx count).
    std::vector<std::pair<std::string, TxMetrics>> tx_metrics_;
    std::optional<std::string> current_tx_label_;
    double current_start_ms_ = 0;
};

} // namespace bb::avm2::contracts
