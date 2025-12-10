#include "barretenberg/avm_fuzzer/fuzz_lib/simulator.hpp"

#include <cstdint>
#include <iomanip>
#include <iostream>
#include <nlohmann/json.hpp>
#include <sys/wait.h>
#include <unistd.h>
#include <vector>

#include "barretenberg/avm_fuzzer/common/interfaces/dbs.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/common/base64.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/common/stringify.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"
#include "barretenberg/world_state/types.hpp"
#include "barretenberg/world_state/world_state.hpp"

using bb::avm2::GlobalVariables;
using namespace bb::avm2;
using namespace bb::avm2::simulation;
using namespace bb::avm2::fuzzer;
using namespace bb::world_state;
using json = nlohmann::json;

// Helper function to serialize tx, globals, and contract data to JSON
std::string serialize_simulation_request(const Tx& tx,
                                         const GlobalVariables& globals,
                                         const FuzzerContractDB& contract_db)
{
    json j;

    // Pass WorldState database path and configuration for TypeScript to open the same DB
    // Note: TypeScript expects the parent directory and adds "world_state/" subdirectory itself
    j["ws_data_dir"] = FuzzerWorldStateManager::get_data_dir();
    j["ws_map_size_kb"] = FuzzerWorldStateManager::get_map_size_kb();

    // Serialize Tx using msgpack and base64 encode
    auto [tx_buffer, tx_size] = msgpack_encode_buffer(tx);
    j["tx"] = base64_encode(tx_buffer, tx_size);
    delete[] tx_buffer;

    // Serialize GlobalVariables using msgpack and base64 encode
    auto [globals_buffer, globals_size] = msgpack_encode_buffer(globals);
    j["globals"] = base64_encode(globals_buffer, globals_size);
    delete[] globals_buffer;

    // Serialize contract instances as vector of pairs (address, instance) to avoid non-string map keys
    std::vector<std::pair<AztecAddress, ContractInstance>> instances_vec;
    for (const auto& [address, instance] : contract_db.get_contract_instances()) {
        instances_vec.emplace_back(address, instance);
    }
    auto [instances_buffer, instances_size] = msgpack_encode_buffer(instances_vec);
    j["contractInstances"] = base64_encode(instances_buffer, instances_size);
    delete[] instances_buffer;

    // Serialize contract classes as vector (id is already inside each class)
    std::vector<ContractClass> classes_vec;
    for (const auto& [_, contract_class] : contract_db.get_contract_classes()) {
        classes_vec.push_back(contract_class);
    }
    auto [classes_buffer, classes_size] = msgpack_encode_buffer(classes_vec);
    j["contractClasses"] = base64_encode(classes_buffer, classes_size);
    delete[] classes_buffer;

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

SimulatorResult CppSimulator::simulate(fuzzer::FuzzerWorldStateManager& ws_mgr,
                                       fuzzer::FuzzerContractDB& contract_db,
                                       const Tx& tx)
{
    const PublicSimulatorConfig config{ .collect_call_metadata = true, .collect_public_inputs = true };

    ProtocolContracts protocol_contracts{};

    auto globals = create_default_globals();

    WorldState& ws = ws_mgr.get_world_state();
    WorldStateRevision ws_rev = ws_mgr.get_current_revision();

    AvmSimulationHelper helper;
    TxSimulationResult result =
        helper.simulate_fast_with_existing_ws(contract_db, ws_rev, ws, config, tx, globals, protocol_contracts);
    bool reverted = result.revert_code != RevertCode::OK;
    // Just process the top level call's output
    vinfo(
        "C++ Simulator result - reverted: ", reverted, ", output size: ", result.call_stack_metadata[0].output.size());
    std::vector<FF> values = {};
    if (result.call_stack_metadata.size() != 0) {
        for (const auto& output : result.call_stack_metadata.at(0).output) {
            values.push_back(output);
        }
    }
    if (result.public_inputs.has_value()) {
        return { .reverted = reverted,
                 .output = values,
                 .end_tree_snapshots = result.public_inputs->end_tree_snapshots };
    }
    return { .reverted = reverted, .output = values };
}

JsSimulator* JsSimulator::instance = nullptr;
JsSimulator::JsSimulator(std::string& simulator_path)
    : simulator_path(simulator_path)
    , process("LOG_LEVEL=silent node " + simulator_path + " 2>/dev/null")
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

SimulatorResult JsSimulator::simulate([[maybe_unused]] fuzzer::FuzzerWorldStateManager& ws_mgr,
                                      fuzzer::FuzzerContractDB& contract_db,
                                      const Tx& tx)
{
    auto globals = create_default_globals();

    std::string serialized = serialize_simulation_request(tx, globals, contract_db);
    fuzz_info("Sending request to simulator: ", serialized);

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

    fuzz_info("Received response from simulator: ", response);
    // Parse with msg_pack
    auto res_buffer = base64_decode(response);
    SimulatorResult result;
    result = msgpack::unpack(res_buffer.data(), res_buffer.size()).get().convert(result);
    return result;
}

bool compare_simulator_results(const SimulatorResult& result1, const SimulatorResult& result2)
{
    return result1.reverted == result2.reverted && result1.output == result2.output &&
           result1.end_tree_snapshots == result2.end_tree_snapshots;
}
