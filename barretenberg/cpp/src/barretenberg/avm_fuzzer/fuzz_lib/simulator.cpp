#include "barretenberg/avm_fuzzer/fuzz_lib/simulator.hpp"

#include <iomanip>
#include <iostream>
#include <libdeflate.h>
#include <nlohmann/json.hpp>
#include <sys/wait.h>
#include <unistd.h>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/common/base64.hpp"
#include "barretenberg/common/get_bytecode.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/common/stringify.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"

using bb::avm2::GlobalVariables;
using namespace bb::avm2;
using namespace bb::avm2::simulation;
using json = nlohmann::json;

// Helper function to serialize bytecode and calldata to JSON and print to stdout
std::string serialize_bytecode_and_calldata(const std::vector<uint8_t>& bytecode, const std::vector<FF>& calldata)
{
    json j;
    j["bytecode"] = base64_encode(bytecode.data(), bytecode.size());

    // Convert FF values to strings for JSON serialization
    std::vector<std::string> calldata_strings;
    calldata_strings.reserve(calldata.size());
    for (const auto& field : calldata) {
        calldata_strings.push_back(field_to_string(field));
    }
    j["inputs"] = calldata_strings;

    return j.dump();
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
    EnqueuedCallResult result = simulator.simulate(bytecode, calldata);
    return { .reverted = !result.success, .output = result.output.value_or(std::vector<FF>{}) };
}

JsSimulator* JsSimulator::instance = nullptr;
JsSimulator::JsSimulator(std::string& simulator_path)
    : process("LOG_LEVEL=silent node " + simulator_path + " 2>/dev/null")
{}

JsSimulator* JsSimulator::getInstance()
{
    if (instance == nullptr) {
        throw std::runtime_error("JsSimulator should be initializing in FUZZ INIT");
    }
    return instance;
}

/// Initializes the typescript simulator process
/// See yarn-project/simulator/scripts/fuzzing
void JsSimulator::initialize(std::string& simulator_path)
{
    if (instance != nullptr) {
        throw std::runtime_error("JsSimulator already initialized");
    }
    instance = new JsSimulator(simulator_path);
}

SimulatorResult JsSimulator::simulate(const std::vector<uint8_t>& bytecode, const std::vector<FF>& calldata)
{
    std::string serialized = serialize_bytecode_and_calldata(bytecode, calldata);

    // Send the request
    process.write_line(serialized);
    std::string response = process.read_line();
    // Remove the newline character
    response.erase(response.find_last_not_of('\n') + 1);

    // HACK
    // decode_bytecode decodes base64 and ungzips it
    std::vector<uint8_t> decoded_response = decode_bytecode(response);
    std::string response_string(decoded_response.begin(), decoded_response.end());
    json response_json = json::parse(response_string);
    bool reverted = response_json["reverted"];
    std::vector<std::string> output = response_json["output"];
    std::vector<FF> output_fields;
    output_fields.reserve(output.size());
    for (const auto& field : output) {
        output_fields.push_back(FF(field));
    }
    SimulatorResult result = { .reverted = reverted, .output = output_fields };
    return result;
}

bool compare_simulator_results(const SimulatorResult& result1, const SimulatorResult& result2)
{
    return result1.reverted == result2.reverted && result1.output == result2.output;
}
