#include "barretenberg/avm_fuzzer/fuzz_lib/simulator.hpp"

#include <iomanip>
#include <iostream>
#include <libdeflate.h>
#include <nlohmann/json.hpp>
#include <sys/wait.h>
#include <unistd.h>
#include <vector>

#include "barretenberg/avm_fuzzer/common/interfaces/dbs.hpp"
#include "barretenberg/avm_fuzzer/common/interfaces/simulation_helper.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/common/base64.hpp"
#include "barretenberg/common/get_bytecode.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/common/stringify.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

using bb::avm2::GlobalVariables;
using namespace bb::avm2;
using namespace bb::avm2::simulation;
using namespace bb::avm2::fuzzer;
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

// Creates a default transaction that the single app logic enqueued call can be inserted into
Tx create_default_tx(const AztecAddress& contract_address,
                     const AztecAddress& sender_address,
                     const std::vector<FF>& calldata,
                     [[maybe_unused]] const FF& transaction_fee,
                     bool is_static_call,
                     const Gas& gas_limit)
{
    return Tx
    {
        .hash = std::string("0xdeadbeef"),
        .gasSettings = GasSettings{
            .gasLimits = gas_limit,
        },
        .effectiveGasFees = GasFees{
            .feePerDaGas = 0,
            .feePerL2Gas = 0,
        },
        .nonRevertibleAccumulatedData = AccumulatedData{
            .noteHashes = {},
            // This nullifier is needed to make the nonces for note hashes and expected by simulation_helper
            .nullifiers = {FF("0x00000000000000000000000000000000000000000000000000000000deadbeef")},
            .l2ToL1Messages = {},
        },
        .revertibleAccumulatedData = AccumulatedData{
            .noteHashes = {},
            .nullifiers = {},
            .l2ToL1Messages = {},
        },
        .setupEnqueuedCalls = {},
        .appLogicEnqueuedCalls = {
            PublicCallRequestWithCalldata{
                .request = PublicCallRequest{
                    .msgSender = 0,
                    .contractAddress = contract_address,
                    .isStaticCall = is_static_call,
                    .calldataHash = 0,
                },
                .calldata = calldata,
            },
        },
        .teardownEnqueuedCall = std::nullopt,
        .gasUsedByPrivate = Gas{ .l2Gas = 0, .daGas = 0 },
        .feePayer = sender_address,
    };
}

class TestSimulator {
  protected:
    FuzzerSimulationHelper helper;
    AztecAddress contract_address{ 42 };
    AztecAddress sender_address{ 100 };
    FF transaction_fee = 0; // This has to be zero for now since we don't handle fee payment right now.
    GlobalVariables globals = create_default_globals();
    bool is_static_call = false;
    Gas gas_limit{ 1000000, 1000000 }; // Large gas limit for tests
  public:
    TxSimulationResult simulate(const std::vector<uint8_t>& bytecode, const std::vector<FF>& calldata)
    {
        FuzzerContractDB minimal_contract_db(bytecode);
        FuzzerLowLevelDB minimal_low_level_db;

        // This is needed so that the contract existence check passes in simulation
        minimal_low_level_db.insert_contract_address(contract_address);
        ProtocolContracts protocol_contracts{};

        return helper.simulate_fast(
            minimal_contract_db,
            minimal_low_level_db,
            create_default_tx(contract_address, sender_address, calldata, transaction_fee, is_static_call, gas_limit),
            globals,
            protocol_contracts);
    }
};

SimulatorResult CppSimulator::simulate(const std::vector<uint8_t>& bytecode, const std::vector<FF>& calldata)
{
    TestSimulator simulator;
    TxSimulationResult result = simulator.simulate(bytecode, calldata);
    vinfo("C++ Simulator result - reverted: ", result.reverted, ", output size: ", result.app_logic_output->size());
    return { .reverted = result.reverted, .output = result.app_logic_output.value_or(std::vector<FF>{}) };
}

JsSimulator* JsSimulator::instance = nullptr;
JsSimulator::JsSimulator(std::string& simulator_path)
    : simulator_path(simulator_path)
    , process("LOG_LEVEL=silent node " + simulator_path + " 2>/dev/null")
{}

void JsSimulator::restart_simulator()
{
    if (instance == nullptr) {
        throw std::runtime_error("JsSimulator should be initialized before restarting");
    }
    std::string simulator_path = instance->simulator_path;
    delete instance;
    instance = new JsSimulator(simulator_path);
}

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

    std::vector<uint8_t> decoded_response;
    // for some reason, the typescript simulator responds with an empty response (invalid gzip) one time in ~500k runs
    // restarting the process if this happens
    try {
        // HACK: decode_bytecode decodes base64 and ungzips it
        decoded_response = decode_bytecode(response);
    } catch (const std::exception& e) {
        std::cout << "Error decoding response: " << e.what() << std::endl;
        std::cout << "Response: " << response << std::endl;
        restart_simulator();

        return simulate(bytecode, calldata);
    }

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
