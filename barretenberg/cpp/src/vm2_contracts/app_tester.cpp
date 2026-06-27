#include "vm2_contracts/app_tester.hpp"

#include <stdexcept>
#include <utility>

#include "vm2_contracts/app_test_helpers.hpp"
#include "vm2_contracts/proving.hpp"

namespace bb::avm2::contracts {

using testing::DeployedContract;
using testing::TestEnqueuedCall;

AppTester::AppTester(TestExecutorMetrics* metrics, PublicSimulatorConfig config)
    : metrics_(metrics)
    , config_(std::move(config))
{}

void AppTester::set_proving_mode(ProvingMode mode)
{
    proving_mode_ = mode;
    if (mode != ProvingMode::None) {
        config_ = proving_config();
    }
}

DeployedContract AppTester::deploy(const ContractArtifact& artifact, uint64_t seed)
{
    const DeployedContract deployed = deploy_artifact(tester_, artifact, seed);
    return deployed;
}

DeployedContract AppTester::deploy_with_constructor(const ContractArtifact& artifact,
                                                    const std::vector<AbiValue>& constructor_args,
                                                    const AztecAddress& deployer,
                                                    uint64_t seed)
{
    const DeployedContract deployed =
        deploy_artifact_with_constructor(tester_, artifact, constructor_args, deployer, seed);
    return deployed;
}

std::string AppTester::make_full_label(const std::string& label)
{
    const std::string label_with_count = label + "/" + std::to_string(tx_count_++);
    return metrics_prefix_.empty() ? label_with_count : metrics_prefix_ + "/" + label_with_count;
}

void AppTester::record_metrics(const std::string& full_label, const TxSimulationResult& result)
{
    if (metrics_ == nullptr) {
        return;
    }
    metrics_->stop_recording_tx_simulation(
        full_label, result.gas_used.public_gas.l2_gas, result.revert_code != RevertCode::OK);
}

TxSimulationResult AppTester::run_labeled(const std::string& label,
                                          const AztecAddress& sender,
                                          const std::vector<TestEnqueuedCall>& app_calls,
                                          bool commit,
                                          bool prove)
{
    const std::string full_label = make_full_label(label);
    if (metrics_ != nullptr) {
        metrics_->start_recording_tx_simulation(full_label);
    }
    const TxSimulationResult result = tester_.simulate_tx_as(sender, app_calls, commit, config_);
    record_metrics(full_label, result);
    if (prove && proving_mode_ != ProvingMode::None) {
        ProverMetrics prover_metrics;
        ProverMetrics* out_metrics = metrics_ != nullptr ? &prover_metrics : nullptr;
        const bool passed = proving_mode_ == ProvingMode::ProveAndVerify ? prove_and_verify(result, out_metrics)
                                                                         : check_circuit(result, out_metrics);
        if (!passed) {
            throw std::runtime_error("proving failed for " + full_label);
        }
        if (metrics_ != nullptr) {
            metrics_->record_prover_metrics(full_label, prover_metrics);
        }
    }
    return result;
}

TxSimulationResult AppTester::execute_tx_with_label(const std::string& label,
                                                    const AztecAddress& sender,
                                                    const std::vector<TestEnqueuedCall>& app_calls,
                                                    bool commit)
{
    return run_labeled(label, sender, app_calls, commit, /*prove=*/true);
}

TxSimulationResult AppTester::simulate_tx_with_label(const std::string& label,
                                                     const AztecAddress& sender,
                                                     const std::vector<TestEnqueuedCall>& app_calls)
{
    return run_labeled(label, sender, app_calls, /*commit=*/false, /*prove=*/false);
}

} // namespace bb::avm2::contracts
