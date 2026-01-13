#include "barretenberg/avm_fuzzer/fuzz_lib/simulator.hpp"

#include <cstdint>
#include <iomanip>
#include <iostream>
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
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"
#include "barretenberg/world_state/types.hpp"
#include "barretenberg/world_state/world_state.hpp"

using bb::avm2::GlobalVariables;
using namespace bb::avm2;
using namespace bb::avm2::simulation;
using namespace bb::avm2::fuzzer;
using namespace bb::world_state;

constexpr auto MAX_RETURN_DATA_SIZE_IN_FIELDS = 1024;

// Helper function to serialize simulation request via msgpack
std::string serialize_simulation_request(
    const Tx& tx,
    const GlobalVariables& globals,
    const FuzzerContractDB& contract_db,
    const std::vector<bb::crypto::merkle_tree::PublicDataLeafValue>& public_data_writes,
    const std::vector<FF>& note_hashes,
    const ProtocolContracts& protocol_contracts)
{
    // Build vectors from contract_db
    std::vector<ContractClass> classes_vec = contract_db.get_contract_classes();
    std::vector<std::pair<AztecAddress, ContractInstance>> instances_vec = contract_db.get_contract_instances();

    FuzzerSimulationRequest request{
        .ws_data_dir = FuzzerWorldStateManager::get_data_dir(),
        .ws_map_size_kb = FuzzerWorldStateManager::get_map_size_kb(),
        .tx = tx,
        .globals = globals,
        .contract_classes = std::move(classes_vec),
        .contract_instances = std::move(instances_vec),
        .public_data_writes = public_data_writes,
        .note_hashes = note_hashes,
        .protocol_contracts = protocol_contracts,
    };

    auto [buffer, size] = msgpack_encode_buffer(request);
    std::string result = base64_encode(buffer, size);
    delete[] buffer;
    return result;
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

SimulatorResult CppSimulator::simulate(
    fuzzer::FuzzerWorldStateManager& ws_mgr,
    fuzzer::FuzzerContractDB& contract_db,
    const Tx& tx,
    const GlobalVariables& globals,
    [[maybe_unused]] const std::vector<bb::crypto::merkle_tree::PublicDataLeafValue>& public_data_writes,
    [[maybe_unused]] const std::vector<FF>& note_hashes,
    const ProtocolContracts& protocol_contracts)
{
    // Note: public_data_writes and note_hashes are already applied to C++ world state in setup_fuzzer_state

    const PublicSimulatorConfig config{
        .skip_fee_enforcement = false,
        .collect_call_metadata = true,
        .collect_public_inputs = true,
        .collection_limits = {
            .max_returndata_size_in_fields = MAX_RETURN_DATA_SIZE_IN_FIELDS,
        },
    };

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
        for (const auto& metadata : result.call_stack_metadata) {
            // Only collect outputs from APP_LOGIC phase (matches TypeScript getAppLogicReturnValues())
            if (metadata.phase == CoarseTransactionPhase::APP_LOGIC) {
                for (const auto& output : metadata.output) {
                    values.push_back(output);
                }
            }
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

SimulatorResult JsSimulator::simulate(
    [[maybe_unused]] fuzzer::FuzzerWorldStateManager& ws_mgr,
    fuzzer::FuzzerContractDB& contract_db,
    const Tx& tx,
    const GlobalVariables& globals,
    const std::vector<bb::crypto::merkle_tree::PublicDataLeafValue>& public_data_writes,
    const std::vector<FF>& note_hashes,
    const ProtocolContracts& protocol_contracts)
{
    std::string serialized =
        serialize_simulation_request(tx, globals, contract_db, public_data_writes, note_hashes, protocol_contracts);

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

    // Parse with msg_pack
    auto res_buffer = base64_decode(response);
    SimulatorResult result;
    result = msgpack::unpack(res_buffer.data(), res_buffer.size()).get().convert(result);
    return result;
}

bool compare_simulator_results(SimulatorResult& result1, SimulatorResult& result2)
{
    // Since the simulator results are interchangeable between TS and C++, we limit the return data size for comparison
    // todo(ilyas): we ideally specify one param as the TS result and truncate only that one
    if (result1.output.size() > MAX_RETURN_DATA_SIZE_IN_FIELDS) {
        result1.output.resize(MAX_RETURN_DATA_SIZE_IN_FIELDS);
    }
    if (result2.output.size() > MAX_RETURN_DATA_SIZE_IN_FIELDS) {
        result2.output.resize(MAX_RETURN_DATA_SIZE_IN_FIELDS);
    }

    return result1.reverted == result2.reverted && result1.output == result2.output &&
           result1.end_tree_snapshots == result2.end_tree_snapshots;
}

// Creates a default transaction that the single app logic enqueued call can be inserted into
Tx create_default_tx(const AztecAddress& contract_address,
                     const AztecAddress& sender_address,
                     const std::vector<FF>& calldata,
                     [[maybe_unused]] const FF& transaction_fee,
                     bool is_static_call,
                     const Gas& gas_limit)
{
    return Tx{
        .hash = TRANSACTION_HASH,
        .gas_settings = GasSettings{
            .gas_limits = gas_limit,
            .max_fees_per_gas = GasFees{ .fee_per_da_gas = FEE_PER_DA_GAS, .fee_per_l2_gas = FEE_PER_L2_GAS },
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
                    .calldata_hash = compute_calldata_hash(calldata),
                },
                .calldata = calldata,
            },
        },
        .teardown_enqueued_call = TEARDOWN_ENQUEUED_CALLS,
        .gas_used_by_private = GAS_USED_BY_PRIVATE,
        .fee_payer = sender_address,
    };
}
