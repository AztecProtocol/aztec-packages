#include "barretenberg/avm_fuzzer/fuzz_lib/simulator.hpp"
#include <thread>

#include <cstdint>
#include <vector>

#include "barretenberg/avm_fuzzer/common/interfaces/dbs.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
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

using bb::avm2::GlobalVariables;
using namespace bb::avm2;
using namespace bb::avm2::simulation;
using namespace bb::avm2::fuzzer;

constexpr auto MAX_RETURN_DATA_SIZE_IN_FIELDS = 1024;

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

    // Run against a fresh copy of the genesis-seeded in-memory merkle DB so the simulation's tree
    // mutations don't leak into later simulations of the same transaction.
    simulation::MemoryMerkleDB merkle_db = ws_mgr.get_memory_merkle_db();
    AvmSimulationHelper helper;
    TxSimulationResult result =
        helper.simulate_fast_internal(contract_db, merkle_db, config, tx, globals, protocol_contracts);
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
                 .end_tree_snapshots = result.public_inputs->end_tree_snapshots,
                 .public_tx_effect = result.public_tx_effect };
    }
    return { .reverted = reverted, .output = values, .public_tx_effect = result.public_tx_effect };
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
