#include "barretenberg/vm2/testing/public_tx_simulation_tester.hpp"

#include <filesystem>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/crypto/merkle_tree/fixtures.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"
#include "barretenberg/vm2/simulation_helper.hpp"

namespace bb::avm2::testing {

namespace {

using Poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
using bb::crypto::merkle_tree::NullifierLeafValue;
using bb::crypto::merkle_tree::PublicDataLeafValue;
using world_state::MerkleTreeId;
using world_state::WorldState;
using world_state::WorldStateRevision;

// A balance large enough to cover the fee for any test transaction.
const FF FEE_PAYER_BALANCE = FF(uint256_t(1) << 100);

// WorldState is neither copyable nor movable (it holds a mutex), so it must be constructed
// directly into the owning unique_ptr.
std::unique_ptr<WorldState> make_world_state(const std::string& data_dir)
{
    const std::unordered_map<MerkleTreeId, uint32_t> tree_heights{
        { MerkleTreeId::NULLIFIER_TREE, NULLIFIER_TREE_HEIGHT },
        { MerkleTreeId::NOTE_HASH_TREE, NOTE_HASH_TREE_HEIGHT },
        { MerkleTreeId::PUBLIC_DATA_TREE, PUBLIC_DATA_TREE_HEIGHT },
        { MerkleTreeId::L1_TO_L2_MESSAGE_TREE, L1_TO_L2_MSG_TREE_HEIGHT },
        { MerkleTreeId::ARCHIVE, ARCHIVE_HEIGHT },
    };
    const std::unordered_map<MerkleTreeId, index_t> tree_prefill{
        { MerkleTreeId::NULLIFIER_TREE, 128 },
        { MerkleTreeId::PUBLIC_DATA_TREE, 128 },
    };
    return std::make_unique<WorldState>(/*thread_pool_size=*/1,
                                        data_dir,
                                        /*map_size_kb=*/10240,
                                        tree_heights,
                                        tree_prefill,
                                        /*initial_header_generator_point=*/DOM_SEP__BLOCK_HEADER_HASH);
}

} // namespace

////////////////////////////////
/// TestContractDB
////////////////////////////////

std::optional<ContractInstance> TestContractDB::get_contract_instance(const AztecAddress& address) const
{
    auto it = contract_instances.find(address);
    return it == contract_instances.end() ? std::nullopt : std::make_optional(it->second);
}

std::optional<ContractClass> TestContractDB::get_contract_class(const ContractClassId& class_id) const
{
    auto it = contract_classes.find(class_id);
    if (it == contract_classes.end()) {
        return std::nullopt;
    }
    const auto& klass = it->second;
    return ContractClass{
        .id = klass.id,
        .artifact_hash = klass.artifact_hash,
        .private_functions_root = klass.private_functions_root,
        .packed_bytecode = klass.packed_bytecode,
    };
}

std::optional<FF> TestContractDB::get_bytecode_commitment(const ContractClassId& class_id) const
{
    auto it = contract_classes.find(class_id);
    return it == contract_classes.end() ? std::nullopt : std::make_optional(it->second.public_bytecode_commitment);
}

std::optional<std::string> TestContractDB::get_debug_function_name(const AztecAddress&, const FunctionSelector&) const
{
    return std::nullopt;
}

void TestContractDB::add_contracts(const ContractDeploymentData&)
{
    // Not used: tests deploy directly via add_contract_class / add_contract_instance.
}

void TestContractDB::add_contract_class(const ContractClassWithCommitment& contract_class)
{
    contract_classes.insert({ contract_class.id, contract_class });
}

void TestContractDB::add_contract_instance(const AztecAddress& address, const ContractInstance& instance)
{
    contract_instances.insert({ address, instance });
}

void TestContractDB::create_checkpoint()
{
    checkpoints.push(Checkpoint{ .contract_classes = contract_classes, .contract_instances = contract_instances });
}

void TestContractDB::commit_checkpoint()
{
    if (!checkpoints.empty()) {
        checkpoints.pop();
    }
}

void TestContractDB::revert_checkpoint()
{
    if (!checkpoints.empty()) {
        contract_classes = std::move(checkpoints.top().contract_classes);
        contract_instances = std::move(checkpoints.top().contract_instances);
        checkpoints.pop();
    }
}

////////////////////////////////
/// PublicTxSimulationTester
////////////////////////////////

AztecAddress PublicTxSimulationTester::default_sender()
{
    return AztecAddress(100);
}

PublicSimulatorConfig PublicTxSimulationTester::default_config()
{
    return PublicSimulatorConfig{
        .skip_fee_enforcement = false,
        .collect_call_metadata = true,
    };
}

PublicTxSimulationTester::PublicTxSimulationTester()
    : data_dir(crypto::merkle_tree::random_temp_directory())
{
    std::filesystem::create_directories(data_dir);
    ws = make_world_state(data_dir);
    fork_id = ws->create_fork(std::nullopt);
}

PublicTxSimulationTester::~PublicTxSimulationTester()
{
    ws.reset();
    std::error_code ec;
    std::filesystem::remove_all(data_dir, ec);
}

WorldStateRevision PublicTxSimulationTester::current_revision() const
{
    return WorldStateRevision{ .forkId = fork_id, .includeUncommitted = true };
}

DeployedContract PublicTxSimulationTester::deploy_contract(std::span<const uint8_t> bytecode, const FF& salt)
{
    std::vector<uint8_t> bytecode_vec(bytecode.begin(), bytecode.end());

    const FF commitment = simulation::compute_public_bytecode_commitment(bytecode_vec);
    const FF class_id = simulation::compute_contract_class_id(/*artifact_hash=*/0, /*private_fn_root=*/0, commitment);

    ContractClassWithCommitment contract_class{
        .id = class_id,
        .artifact_hash = 0,
        .private_functions_root = 0,
        .packed_bytecode = bytecode_vec,
        .public_bytecode_commitment = commitment,
    };
    ContractInstance instance{
        .salt = salt,
        .deployer = default_sender(),
        .current_contract_class_id = class_id,
        .original_contract_class_id = class_id,
        .initialization_hash = 0,
        .immutables_hash = 0,
        .public_keys =
            PublicKeys{
                .nullifier_key_hash = 0,
                .incoming_viewing_key = AffinePoint::one(),
                .outgoing_viewing_key_hash = 0,
                .tagging_key_hash = 0,
                .message_signing_key_hash = 0,
                .fallback_key_hash = 0,
            },
    };
    const AztecAddress address = simulation::compute_contract_address(instance);

    contract_db_.add_contract_class(contract_class);
    contract_db_.add_contract_instance(address, instance);

    // Insert the deployment nullifier so the simulator can resolve this (non-protocol) contract.
    const NullifierLeafValue deployment_nullifier =
        simulation::unconstrained_silo_nullifier(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS, address);
    ws->insert_indexed_leaves<NullifierLeafValue>(MerkleTreeId::NULLIFIER_TREE, { deployment_nullifier }, fork_id);

    return DeployedContract{ .address = address, .contract_class = contract_class, .instance = instance };
}

void PublicTxSimulationTester::set_public_storage(const AztecAddress& address, const FF& slot, const FF& value)
{
    const FF leaf_slot = Poseidon2::hash({ DOM_SEP__PUBLIC_LEAF_SLOT, address, slot });
    ws->update_public_data(PublicDataLeafValue(leaf_slot, value), fork_id);
}

void PublicTxSimulationTester::insert_siloed_nullifier(const FF& siloed_nullifier)
{
    ws->insert_indexed_leaves<NullifierLeafValue>(
        MerkleTreeId::NULLIFIER_TREE, { NullifierLeafValue(siloed_nullifier) }, fork_id);
}

void PublicTxSimulationTester::append_note_hash(const FF& note_hash)
{
    ws->append_leaves<FF>(MerkleTreeId::NOTE_HASH_TREE, { note_hash }, fork_id);
}

void PublicTxSimulationTester::append_l1_to_l2_message(const FF& message)
{
    ws->append_leaves<FF>(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, { message }, fork_id);
}

void PublicTxSimulationTester::fund_fee_payer(const AztecAddress& fee_payer)
{
    if (fee_payer.is_zero()) {
        return;
    }
    const FF fee_juice_balance_slot =
        Poseidon2::hash({ DOM_SEP__PUBLIC_STORAGE_MAP_SLOT, FEE_JUICE_BALANCES_SLOT, fee_payer });
    const FF leaf_slot = Poseidon2::hash({ DOM_SEP__PUBLIC_LEAF_SLOT, FF(FEE_JUICE_ADDRESS), fee_juice_balance_slot });
    ws->update_public_data(PublicDataLeafValue(leaf_slot, FEE_PAYER_BALANCE), fork_id);
}

TxSimulationResult PublicTxSimulationTester::simulate_tx(const std::vector<TestEnqueuedCall>& app_calls,
                                                         const PublicSimulatorConfig& config)
{
    const AztecAddress fee_payer = default_sender();
    fund_fee_payer(fee_payer);

    std::vector<PublicCallRequestWithCalldata> app_logic_enqueued_calls;
    app_logic_enqueued_calls.reserve(app_calls.size());
    for (const auto& call : app_calls) {
        app_logic_enqueued_calls.push_back(PublicCallRequestWithCalldata{
            .request =
                PublicCallRequest{
                    .msg_sender = default_sender(),
                    .contract_address = call.contract_address,
                    .is_static_call = call.is_static_call,
                    .calldata_hash = simulation::compute_calldata_hash(call.calldata),
                },
            .calldata = call.calldata,
        });
    }

    // A unique first nullifier per tx, needed for note-nonce computation.
    const FF first_nullifier =
        FF(uint256_t("0x00000000000000000000000000000000000000000000000000000000deadbeef")) + FF(tx_count);
    tx_count++;

    const GlobalVariables globals{
        .chain_id = 1,
        .version = 1,
        .block_number = 1,
        .slot_number = 1,
        .timestamp = 1000000,
        .coinbase = 0,
        .fee_recipient = 0,
        .gas_fees = GasFees{ .fee_per_da_gas = 1, .fee_per_l2_gas = 1 },
    };

    Tx tx{
        .hash = "0xtest",
        .gas_settings =
            GasSettings{
                .gas_limits = Gas{ .l2_gas = 1000000, .da_gas = 1000000 },
                .teardown_gas_limits = Gas{ .l2_gas = 1000000, .da_gas = 1000000 },
                .max_fees_per_gas = GasFees{ .fee_per_da_gas = 1, .fee_per_l2_gas = 1 },
                .max_priority_fees_per_gas = GasFees{ .fee_per_da_gas = 0, .fee_per_l2_gas = 0 },
            },
        .effective_gas_fees = GasFees{ .fee_per_da_gas = 1, .fee_per_l2_gas = 1 },
        .non_revertible_accumulated_data = AccumulatedData{ .nullifiers = { first_nullifier } },
        .app_logic_enqueued_calls = app_logic_enqueued_calls,
        .gas_used_by_private = Gas{ .l2_gas = PUBLIC_TX_L2_GAS_OVERHEAD, .da_gas = TX_DA_GAS_OVERHEAD },
        .fee_payer = fee_payer,
    };

    const ProtocolContracts protocol_contracts{};

    AvmSimulationHelper helper;
    ws->checkpoint(fork_id);
    try {
        // Hint collection wraps the DBs in hinting proxies and is required to produce proving
        // inputs; the fast path is used otherwise.
        TxSimulationResult result =
            config.collect_hints ? helper.simulate_for_hint_collection(
                                       contract_db_, current_revision(), *ws, config, tx, globals, protocol_contracts)
                                 : helper.simulate_fast_with_existing_ws(
                                       contract_db_, current_revision(), *ws, config, tx, globals, protocol_contracts);
        ws->revert_checkpoint(fork_id);
        return result;
    } catch (...) {
        ws->revert_checkpoint(fork_id);
        throw;
    }
}

} // namespace bb::avm2::testing
