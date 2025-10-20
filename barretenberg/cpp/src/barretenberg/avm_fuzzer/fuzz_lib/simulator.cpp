#include "simulator.hpp"
#include <iomanip>
#include <iostream>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/common/stringify.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"
#include <nlohmann/json.hpp>

using bb::avm2::GlobalVariables;
using namespace bb::avm2;
using namespace bb::avm2::simulation;
using namespace bb::avm2::testing;
using json = nlohmann::json;

// Helper function to serialize bytecode and calldata to JSON and print to stdout
void print_bytecode_and_calldata_json(const std::vector<uint8_t>& bytecode, const std::vector<FF>& calldata)
{
    json j;
    j["bytecode"] = bytecode;

    // Convert FF values to strings for JSON serialization
    std::vector<std::string> calldata_strings;
    calldata_strings.reserve(calldata.size());
    for (const auto& field : calldata) {
        calldata_strings.push_back(field_to_string(field));
    }
    j["calldata"] = calldata_strings;

    std::cout << j.dump() << std::endl;
}

// Helper function to create default global variables for testing
GlobalVariables create_default_globals()
{
    return GlobalVariables{
        .chainId = 1,
        .version = 1,
        .blockNumber = 1,
        .slotNumber = 1,
        .timestamp = 1000000,
        .coinbase = EthAddress{ 0 },
        .feeRecipient = AztecAddress{ 0 },
        .gasFees = GasFees{ .feePerDaGas = 1, .feePerL2Gas = 1 },
    };
}

class TestSimulator {
  protected:
    AvmSimulationHelper helper;
    AztecAddress contract_address{ 42 };
    AztecAddress sender_address{ 100 };
    FF transaction_fee = 0;
    GlobalVariables globals = create_default_globals();
    bool is_static_call = false;
    Gas gas_limit{ 1000000, 1000000 }; // Large gas limit for tests
  public:
    EnqueuedCallResult simulate(const std::vector<uint8_t>& bytecode, const std::vector<FF>& calldata)
    {
        return helper.simulate_bytecode(
            contract_address, sender_address, transaction_fee, globals, is_static_call, calldata, gas_limit, bytecode);
    }
};

SimulatorResult CppSimulator::simulate(const std::vector<uint8_t>& bytecode, const std::vector<FF>& calldata)
{
    TestSimulator simulator;
    auto result = simulator.simulate(bytecode, calldata);
    return { .reverted = result.reverted, .output = result.output };
}

// TODO(defkit) implement communication with the javascript simulator
SimulatorResult JsSimulator::simulate(const std::vector<uint8_t>& bytecode, const std::vector<FF>& calldata)
{
    print_bytecode_and_calldata_json(bytecode, calldata);
    TestSimulator simulator;
    auto result = simulator.simulate(bytecode, calldata);

    return { .reverted = result.reverted, .output = result.output };
}

bool compare_simulator_results(const SimulatorResult& result1, const SimulatorResult& result2)
{
    return result1.reverted == result2.reverted && result1.output == result2.output;
}
