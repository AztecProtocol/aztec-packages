#include "barretenberg/avm_fuzzer/fuzz_lib/contract_db_proxy.hpp"

#include "barretenberg/avm_fuzzer/common/interfaces/dbs.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/control_flow.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/simulator.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

using namespace bb::avm2::fuzzer;

// Temp Helper function to create a default contract class from bytecode
ContractClass create_default_class(const std::vector<uint8_t>& bytecode)
{
    // This isn't strictly needed for pure simulation, but if we want to re-use inputs in proving we need valid
    // commitment
    auto bytecode_commitment = simulation::compute_public_bytecode_commitment(bytecode);
    auto class_id =
        simulation::compute_contract_class_id(/*artifact_hash=*/0, /*private_fn_root=*/0, bytecode_commitment);
    return ContractClass{
        .id = class_id,
        .artifact_hash = 0,
        .private_functions_root = 0,
        .packed_bytecode = bytecode,
    };
}

// Temp Helper function to create a default contract instance from a class ID
ContractInstance create_default_instance(const ContractClassId& class_id)
{
    return ContractInstance{
        .salt = 0,
        .deployer = MSG_SENDER,
        .current_contract_class_id = class_id,
        .original_contract_class_id = class_id,
        .initialization_hash = 0,
        .public_keys = PublicKeys{},
    };
}

// Temp Helper function to compute contract address from instance
AztecAddress compute_contract_address(const ContractInstance& instance)
{
    // This isn't strictly needed for pure simulation, but if we want to re-use inputs in proving we need valid
    // addresses
    return simulation::compute_contract_address(instance);
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

namespace bb::avm2::fuzzer {

ContractDBProxy* ContractDBProxy::instance = nullptr;

ContractDBProxy::ContractDBProxy()
{
    contract_db = new FuzzerContractDB();
}

ContractDBProxy* ContractDBProxy::get_instance()
{
    if (instance == nullptr) {
        instance = new ContractDBProxy();
    }
    return instance;
}

FF ContractDBProxy::register_contract_from_bytecode(const std::vector<uint8_t>& bytecode)
{
    if (instance == nullptr) {
        instance = new ContractDBProxy();
    }
    auto default_class = create_default_class(bytecode);
    auto default_instance = create_default_instance(default_class.id);
    auto contract_address = simulation::compute_contract_address(default_instance);
    instance->contract_db->add_contract_class(default_class.id, default_class);
    instance->contract_db->add_contract_instance(contract_address, default_instance);
    instance->registered_contract_addresses.push_back(contract_address);

    FuzzerWorldStateManager::getInstance()->register_contract_address(contract_address);
    return contract_address;
}

FF ContractDBProxy::get_function_address(size_t index)
{
    if (instance == nullptr) {
        instance = new ContractDBProxy();
    }
    if (instance->registered_contract_addresses.size() < 1) {
        return FF::zero();
    }
    return instance->registered_contract_addresses[index % (instance->registered_contract_addresses.size())];
}

void ContractDBProxy::reset_instance()
{
    if (instance != nullptr) {
        delete instance;
        instance = new ContractDBProxy();
    }
}
} // namespace bb::avm2::fuzzer
