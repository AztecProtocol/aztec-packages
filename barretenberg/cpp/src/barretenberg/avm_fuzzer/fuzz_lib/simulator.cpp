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
#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
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
        .chain_id = CHAIN_ID,
        .version = VERSION,
        .block_number = BLOCK_NUMBER,
        .slot_number = SLOT_NUMBER,
        .timestamp = TIMESTAMP,
        .coinbase = COINBASE,
        .fee_recipient = FEE_RECIPIENT,
        .gas_fees = GasFees{ .fee_per_da_gas = FEE_PER_DA_GAS, .fee_per_l2_gas = FEE_PER_L2_GAS },
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
        .hash = TRANSACTION_HASH,
        .gas_settings = GasSettings{
            .gas_limits = gas_limit,
        },
        .effective_gas_fees = EFFECTIVE_GAS_FEES,
        .non_revertible_accumulated_data = AccumulatedData{
            .note_hashes = NON_REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES,
            // This nullifier is needed to make the nonces for note hashes and expected by simulation_helper
            .nullifiers = NON_REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS,
            .l2_to_l1_messages = NON_REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MESSAGES,
        },
        .revertible_accumulated_data = AccumulatedData{
            .note_hashes = REVERTIBLE_ACCUMULATED_DATA_NOTE_HASHES,
            .nullifiers = REVERTIBLE_ACCUMULATED_DATA_NULLIFIERS,
            .l2_to_l1_messages = REVERTIBLE_ACCUMULATED_DATA_L2_TO_L1_MESSAGES,
        },
        .setup_enqueued_calls = SETUP_ENQUEUED_CALLS,
        .app_logic_enqueued_calls = {
            PublicCallRequestWithCalldata{
                .request = PublicCallRequest{
                    .msg_sender = MSG_SENDER,
                    .contract_address = contract_address,
                    .is_static_call = is_static_call,
                    .calldata_hash = 0,
                },
                .calldata = calldata,
            },
        },
        .teardown_enqueued_call = TEARDOWN_ENQUEUED_CALLS,
        .gas_used_by_private = GAS_USED_BY_PRIVATE,
        .fee_payer = sender_address,
    };
}

class TestSimulator {
  protected:
    FuzzerSimulationHelper helper;
    AztecAddress contract_address{ CONTRACT_ADDRESS };
    AztecAddress sender_address{ MSG_SENDER };
    FF transaction_fee = TRANSACTION_FEE;
    GlobalVariables globals = create_default_globals();
    bool is_static_call = IS_STATIC_CALL;
    Gas gas_limit = GAS_LIMIT; // Large gas limit for tests
  public:
    TxSimulationResult simulate(const std::vector<uint8_t>& bytecode, const std::vector<FF>& calldata)
    {
        FuzzerContractDB minimal_contract_db(bytecode);
        FuzzerLowLevelDB minimal_low_level_db;

        const PublicSimulatorConfig config{ .collect_call_metadata = true };

        // This is needed so that the contract existence check passes in simulation
        minimal_low_level_db.insert_contract_address(contract_address);
        ProtocolContracts protocol_contracts{};

        return helper.simulate_fast(
            minimal_contract_db,
            minimal_low_level_db,
            config,
            create_default_tx(contract_address, sender_address, calldata, transaction_fee, is_static_call, gas_limit),
            globals,
            protocol_contracts);
    }
};

SimulatorResult CppSimulator::simulate(const std::vector<uint8_t>& bytecode, const std::vector<FF>& calldata)
{
    TestSimulator simulator;
    TxSimulationResult result = simulator.simulate(bytecode, calldata);
    bool reverted = result.revert_code != RevertCode::OK;
    vinfo("C++ Simulator result - reverted: ", reverted, ", output size: ", result.app_logic_return_values.size());
    std::vector<FF> values;
    for (const auto& metadata : result.app_logic_return_values) {
        if (metadata.values.has_value()) {
            for (const auto& value : *metadata.values) {
                values.push_back(value);
            }
        }
    }
    return { .reverted = reverted, .output = values };
}

JsSimulator* JsSimulator::instance = nullptr;
JsSimulator::JsSimulator(std::string& simulator_path)
    : simulator_path(simulator_path)
    , process("LOG_LEVEL=silent node " + simulator_path + " 2>/dev/null")
{}

void JsSimulator::restart_simulator_process()
{
    if (instance == nullptr) {
        throw std::runtime_error("JsSimulator should be initialized before restarting");
    }
    std::cout << "Restarting JsSimulator process" << std::endl;
    std::string simulator_path = instance->simulator_path;
    delete instance;
    instance = new JsSimulator(simulator_path);
}

void JsSimulator::restart_simulator()
{
    bool logging_enabled = std::getenv("AVM_FUZZER_LOGGING") != nullptr;
    if (logging_enabled) {
        info("Restarting JsSimulator");
    }
    if (instance == nullptr) {
        throw std::runtime_error("JsSimulator should be initialized before restarting");
    }
    instance->process.write_line("{\"restart\":1}");

    std::string response = instance->process.read_line();
    while (response.empty()) {
        std::cout << "Empty response, reading again" << std::endl;
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
        response = instance->process.read_line();
    }
    response.erase(response.find_last_not_of('\n') + 1);

    try {
        std::vector<uint8_t> decoded_response = decode_bytecode(response);
        std::string response_string(decoded_response.begin(), decoded_response.end());
        if (logging_enabled) {
            info("Received restart response: ", response_string);
        }
        json response_json = json::parse(response_string);

        // Check if this is actually a restart response (has "restarted" field)
        if (response_json.contains("reverted")) {
            if (logging_enabled) {
                info("Discarding stale simulation response, reading restart response");
            }
            response = instance->process.read_line();
            response.erase(response.find_last_not_of('\n') + 1);
            decoded_response = decode_bytecode(response);
            response_string = std::string(decoded_response.begin(), decoded_response.end());
            if (logging_enabled) {
                info("Received restart response: ", response_string);
            }
            response_json = json::parse(response_string);
        }

        bool restarted = response_json["restarted"];
        if (!restarted) {
            std::string error = response_json.value("error", "Unknown error");
            throw std::runtime_error("Restart failed: " + error);
        }
    } catch (const std::exception& e) {
        std::cout << "Error processing restart response: " << e.what() << "Response: " << response << std::endl;
        throw std::runtime_error("Failed to restart simulator: " + std::string(e.what()));
    }
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
    bool logging_enabled = std::getenv("AVM_FUZZER_LOGGING") != nullptr;
    std::string serialized = serialize_bytecode_and_calldata(bytecode, calldata);
    if (logging_enabled) {
        info("Sending request to simulator: ", serialized);
    }

    // Send the request
    process.write_line(serialized);
    std::string response = process.read_line();
    while (response.empty()) {
        std::cout << "Empty response, reading again" << std::endl;
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
        response = process.read_line();
    }
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
        restart_simulator_process();

        return simulate(bytecode, calldata);
    }

    std::string response_string(decoded_response.begin(), decoded_response.end());
    if (logging_enabled) {
        info("Received response from simulator: ", response_string);
    }
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
