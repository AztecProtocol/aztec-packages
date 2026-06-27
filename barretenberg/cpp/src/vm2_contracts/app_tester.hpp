#pragma once

#include <cstdint>
#include <string>
#include <vector>

#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/testing/public_tx_simulation_tester.hpp"
#include "vm2_contracts/contract_artifact.hpp"
#include "vm2_contracts/noir_abi.hpp"
#include "vm2_contracts/test_executor_metrics.hpp"

// C++ counterpart of the bench-relevant API of the TS fixture `PublicTxSimulationTester`
// (yarn-project/simulator/src/public/fixtures/public_tx_simulation_tester.ts): it wraps the shared
// C++ `PublicTxSimulationTester`, owns a metrics prefix and a tx counter, and runs labeled
// transactions while (optionally) recording timing / mana metrics. The same harness is
// used by the apps_tests (with metrics disabled) and by the benchmark (with metrics enabled), so the
// token / amm / bulk fixtures have a single implementation.
namespace bb::avm2::contracts {

// How (if at all) execute_tx_with_label proves each executed tx. Mirrors the TS AvmProvingTester's
// checkCircuitOnly flag (None = plain simulation, as the apps_tests / benchmark do).
enum class ProvingMode { None, CheckCircuit, ProveAndVerify };

class AppTester {
  public:
    // `metrics` may be null (correctness tests), in which case execution is unmeasured. `config`
    // selects collection (tests use the metadata-collecting default so return values can be asserted;
    // the benchmark passes a bare config with collection off).
    explicit AppTester(TestExecutorMetrics* metrics = nullptr,
                       PublicSimulatorConfig config = testing::PublicTxSimulationTester::default_config());

    testing::PublicTxSimulationTester& inner() { return tester_; }
    const PublicSimulatorConfig& config() const { return config_; }

    void set_metrics_prefix(std::string prefix) { metrics_prefix_ = std::move(prefix); }

    // Enables proving: each execute_tx_with_label then check-circuits (or proves+verifies) the tx and
    // throws if it does not pass. Switches the simulation config to proving_config() (collecting the
    // hints + public inputs proving needs). Static reads via simulate_tx_with_label are not proven,
    // matching the TS AvmProvingTester (which only overrides executeTxWithLabel).
    void set_proving_mode(ProvingMode mode);

    // Deploys a contract from its artifact (see deploy_artifact / deploy_artifact_with_constructor).
    testing::DeployedContract deploy(const ContractArtifact& artifact, uint64_t seed = 0);
    testing::DeployedContract deploy_with_constructor(const ContractArtifact& artifact,
                                                      const std::vector<AbiValue>& constructor_args,
                                                      const AztecAddress& deployer,
                                                      uint64_t seed = 0);

    // Runs a labeled tx of app-logic calls. The label becomes `<prefix>/<label>/<txCount>` (matching
    // the TS tester), under which timing and public L2 mana are recorded. `commit` persists the tx's
    // state to the world state (needed for stateful multi-tx flows such as token / amm).
    TxSimulationResult execute_tx_with_label(const std::string& label,
                                             const AztecAddress& sender,
                                             const std::vector<testing::TestEnqueuedCall>& app_calls,
                                             bool commit);

    // As above, but never commits (for static / read-only calls such as balance checks).
    TxSimulationResult simulate_tx_with_label(const std::string& label,
                                              const AztecAddress& sender,
                                              const std::vector<testing::TestEnqueuedCall>& app_calls);

  private:
    TxSimulationResult run_labeled(const std::string& label,
                                   const AztecAddress& sender,
                                   const std::vector<testing::TestEnqueuedCall>& app_calls,
                                   bool commit,
                                   bool prove);
    std::string make_full_label(const std::string& label);
    void record_metrics(const std::string& full_label, const TxSimulationResult& result);

    testing::PublicTxSimulationTester tester_;
    TestExecutorMetrics* metrics_;
    PublicSimulatorConfig config_;
    ProvingMode proving_mode_ = ProvingMode::None;
    std::string metrics_prefix_;
    uint64_t tx_count_ = 0;
};

} // namespace bb::avm2::contracts
