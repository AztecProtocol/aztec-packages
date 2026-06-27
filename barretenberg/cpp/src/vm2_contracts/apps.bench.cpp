#include <cstdint>
#include <cstdlib>
#include <exception>
#include <filesystem>
#include <fstream>
#include <string>
#include <vector>

#include <nlohmann/json.hpp>

#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/testing/public_tx_simulation_tester.hpp"
#include "vm2_contracts/amm_fixture.hpp"
#include "vm2_contracts/app_test_helpers.hpp"
#include "vm2_contracts/app_tester.hpp"
#include "vm2_contracts/bulk_fixture.hpp"
#include "vm2_contracts/contract_artifact.hpp"
#include "vm2_contracts/fixture_common.hpp"
#include "vm2_contracts/noir_abi.hpp"
#include "vm2_contracts/noir_abi_json.hpp"
#include "vm2_contracts/test_executor_metrics.hpp"
#include "vm2_contracts/token_fixture.hpp"

// Public-tx simulation benchmark. It runs the app scenarios directly against the C++ AVM simulator and
// emits github-action-benchmark metrics (per labeled tx: totalDurationMs / manaUsed /
// totalInstructionsExecuted) to $BENCH_OUTPUT, which the benchmark dashboard ingests.
//
// The "regular apps" scenarios run with call-metadata collection OFF (for speed); the gadgets
// scenarios run with the default (collecting) config.
namespace bb::avm2 {
namespace {

using contracts::AbiValue;
using contracts::AppTester;
using contracts::ContractArtifact;
using contracts::ExpectFn;
using contracts::make_call;
using contracts::TestExecutorMetrics;
using testing::PublicTxSimulationTester;
using testing::TestEnqueuedCall;

// The speed config for the "regular apps" group (no collection).
PublicSimulatorConfig speed_config()
{
    return PublicSimulatorConfig{ .skip_fee_enforcement = false, .collect_call_metadata = false };
}

// Fails the bench loudly (a benchmark that can't run is a real breakage).
void expect_ok(bool ok)
{
    if (!ok) {
        throw std::runtime_error("benchmark scenario reverted / failed");
    }
}

bool is_ok(const TxSimulationResult& result)
{
    return result.revert_code == RevertCode::OK;
}

// Locates barretenberg/cpp/src/vm2_contracts/account_proof.json (the storage-proof fixture input) by
// walking up from the cwd; honors $AVM_STORAGE_PROOF_JSON as an override.
std::filesystem::path account_proof_json_path()
{
    if (const char* override_path = std::getenv("AVM_STORAGE_PROOF_JSON")) {
        return override_path;
    }
    const std::filesystem::path rel = "barretenberg/cpp/src/vm2_contracts/account_proof.json";
    for (std::filesystem::path dir = std::filesystem::current_path(); !dir.empty(); dir = dir.parent_path()) {
        if (std::filesystem::exists(dir / rel)) {
            return dir / rel;
        }
        if (dir == dir.root_path()) {
            break;
        }
    }
    throw std::runtime_error("could not locate account_proof.json (set $AVM_STORAGE_PROOF_JSON)");
}

// --- "Regular apps and AVM test contract" group ---

void run_token(TestExecutorMetrics& metrics)
{
    AppTester tester(&metrics, speed_config());
    tester.set_metrics_prefix("Token contract tests");
    const ContractArtifact token = ContractArtifact::load_noir_contract("token_contract-Token.json");
    // Skip return-value assertions: call-metadata collection is off for benchmarking.
    contracts::token_test(tester, token, expect_ok, /*skip_return_value_assertions=*/true);
}

void run_amm(TestExecutorMetrics& metrics)
{
    AppTester tester(&metrics, speed_config());
    tester.set_metrics_prefix("AMM contract tests");
    const ContractArtifact token = ContractArtifact::load_noir_contract("token_contract-Token.json");
    const ContractArtifact amm = ContractArtifact::load_noir_contract("amm_contract-AMM.json");
    contracts::amm_test(tester, token, amm, expect_ok);
}

void run_bulk(TestExecutorMetrics& metrics)
{
    AppTester tester(&metrics, speed_config());
    tester.set_metrics_prefix("AvmTest contract tests");
    contracts::bulk_test(tester, expect_ok);
}

void run_mega_bulk(TestExecutorMetrics& metrics)
{
    AppTester tester(&metrics, speed_config());
    tester.set_metrics_prefix("AvmTest contract tests");
    contracts::mega_bulk_test(tester, expect_ok);
}

void run_large_calldata(TestExecutorMetrics& metrics)
{
    AppTester tester(&metrics, speed_config());
    tester.set_metrics_prefix("AvmTest contract tests");
    const ContractArtifact avm = ContractArtifact::load_noir_contract("avm_test_contract-AvmTest.json");
    const auto contract = tester.deploy(avm);
    const std::vector<FF> input = contracts::consecutive_fields(300);
    expect_ok(is_ok(tester.execute_tx_with_label(
        "AvmTest/nested_call_large_calldata",
        PublicTxSimulationTester::default_sender(),
        { make_call(contract.address, avm, "nested_call_large_calldata", { AbiValue::fields(input) }) },
        /*commit=*/false)));
}

void run_public_fns_with_emit_repro(TestExecutorMetrics& metrics)
{
    AppTester tester(&metrics, speed_config());
    tester.set_metrics_prefix("PublicFnsWithEmitRepro contract tests");
    const ContractArtifact repro =
        ContractArtifact::load_noir_contract("public_fns_with_emit_repro_contract-PublicFnsWithEmitRepro.json");
    const auto contract = tester.deploy(repro);
    expect_ok(
        is_ok(tester.execute_tx_with_label("PublicFnsWithEmitRepro/fn_01",
                                           PublicTxSimulationTester::default_sender(),
                                           { make_call(contract.address, repro, "fn_01", { AbiValue::integer(1) }) },
                                           /*commit=*/false)));
}

void run_storage_proof(TestExecutorMetrics& metrics)
{
    AppTester tester(&metrics, speed_config());
    tester.set_metrics_prefix("StorageProof contract tests");
    const ContractArtifact contract_artifact =
        ContractArtifact::load_noir_contract("storage_proof_test_contract-StorageProofTest.json");
    const auto contract = tester.deploy(contract_artifact);

    std::ifstream file(account_proof_json_path());
    const nlohmann::json proof = nlohmann::json::parse(file);
    const auto& params = contract_artifact.get_function("account_proof").parameters;
    std::vector<AbiValue> args;
    args.reserve(params.size());
    for (const auto& param : params) {
        args.push_back(contracts::abi_value_from_json(param.type, proof.at(param.name)));
    }

    expect_ok(is_ok(tester.execute_tx_with_label(
        "AvmStorageProofTest/account_proof",
        PublicTxSimulationTester::default_sender(),
        { TestEnqueuedCall{ .contract_address = contract.address,
                            .calldata = contract_artifact.make_calldata("account_proof", args),
                            .is_static_call = true } },
        /*commit=*/false)));
}

// --- "AVM gadgets tests" group (default/collecting config, fresh deploy per scenario) ---

void run_gadget(TestExecutorMetrics& metrics, const std::string& fn_name, size_t input_length)
{
    AppTester tester(&metrics, PublicTxSimulationTester::default_config());
    tester.set_metrics_prefix("AvmGadgetsTest contract tests");
    const ContractArtifact gadgets =
        ContractArtifact::load_noir_contract("avm_gadgets_test_contract-AvmGadgetsTest.json");
    const auto contract = tester.deploy(gadgets);
    expect_ok(is_ok(tester.execute_tx_with_label(
        "AvmGadgetsTest/" + fn_name,
        PublicTxSimulationTester::default_sender(),
        { make_call(
            contract.address, gadgets, fn_name, { AbiValue::fields(contracts::consecutive_fields(input_length)) }) },
        /*commit=*/false)));
}

void run_gadgets(TestExecutorMetrics& metrics)
{
    for (uint32_t length :
         { 10u, 20u, 30u, 40u, 50u, 60u, 70u, 80u, 90u, 100u, 255u, 256u, 511u, 512u, 1024u, 1536u }) {
        run_gadget(metrics, "sha256_hash_" + std::to_string(length), length);
    }
    run_gadget(metrics, "keccak_hash", 10u);
    run_gadget(metrics, "keccak_hash_1400", 1400u);
    run_gadget(metrics, "keccak_f1600", 25u);
    run_gadget(metrics, "poseidon2_hash", 10u);
    run_gadget(metrics, "poseidon2_hash_1000fields", 1000u);
    run_gadget(metrics, "pedersen_hash", 10u);
    run_gadget(metrics, "pedersen_hash_with_index", 10u);
}

int run()
{
    TestExecutorMetrics metrics("avm/simulation");

    run_token(metrics);
    run_amm(metrics);
    run_bulk(metrics);
    run_mega_bulk(metrics);
    run_large_calldata(metrics);
    run_public_fns_with_emit_repro(metrics);
    run_storage_proof(metrics);
    run_gadgets(metrics);

    if (const char* bench_output = std::getenv("BENCH_OUTPUT")) {
        const std::filesystem::path out_path = bench_output;
        if (out_path.has_parent_path()) {
            std::filesystem::create_directories(out_path.parent_path());
        }
        std::ofstream(out_path) << metrics.to_github_action_benchmark_json();
        info("Wrote benchmark output to ", out_path.string());
    }
    info("\n", metrics.to_pretty_string());
    return 0;
}

} // namespace
} // namespace bb::avm2

int main()
{
    try {
        return bb::avm2::run();
    } catch (const std::exception& e) {
        info("AVM apps benchmark failed: ", e.what());
        return 1;
    }
}
