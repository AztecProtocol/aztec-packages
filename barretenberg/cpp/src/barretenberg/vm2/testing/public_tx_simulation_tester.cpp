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

// Mirrors the TS constant of the same name (not present in the generated C++ aztec_constants.hpp).
// Paired with MAX_PROCESSABLE_L2_GAS for the tx gas limits.
constexpr uint32_t MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT = 786432;

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
        // Mirror the TS CollectionLimitsConfig defaults so call metadata (calldata/returndata/call
        // stack) is actually captured; without nonzero limits the collector records nothing.
        .collection_limits =
            CollectionLimitsConfig{
                .max_debug_log_memory_reads = DEFAULT_MAX_DEBUG_LOG_MEMORY_READS,
                .max_calldata_size_in_fields = 300,
                .max_returndata_size_in_fields = 300,
                .max_call_stack_depth = 5,
                .max_call_stack_items = 100,
            },
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

DeployedContract PublicTxSimulationTester::deploy_contract(std::span<const uint8_t> bytecode,
                                                           const FF& salt,
                                                           const FF& artifact_hash,
                                                           const FF& private_functions_root,
                                                           const FF& initialization_hash,
                                                           const AztecAddress& deployer)
{
    std::vector<uint8_t> bytecode_vec(bytecode.begin(), bytecode.end());

    const FF commitment = simulation::compute_public_bytecode_commitment(bytecode_vec);
    const FF class_id = simulation::compute_contract_class_id(artifact_hash, private_functions_root, commitment);

    ContractClassWithCommitment contract_class{
        .id = class_id,
        .artifact_hash = artifact_hash,
        .private_functions_root = private_functions_root,
        .packed_bytecode = bytecode_vec,
        .public_bytecode_commitment = commitment,
    };
    ContractInstance instance{
        .salt = salt,
        .deployer = deployer,
        .current_contract_class_id = class_id,
        .original_contract_class_id = class_id,
        .initialization_hash = initialization_hash,
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
    insert_contract_deployment_nullifier(address);

    return DeployedContract{ .address = address, .contract_class = contract_class, .instance = instance };
}

void PublicTxSimulationTester::insert_contract_deployment_nullifier(const AztecAddress& address)
{
    const NullifierLeafValue deployment_nullifier =
        simulation::unconstrained_silo_nullifier(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS, address);
    ws->insert_indexed_leaves<NullifierLeafValue>(MerkleTreeId::NULLIFIER_TREE, { deployment_nullifier }, fork_id);
}

void PublicTxSimulationTester::insert_nullifier(const AztecAddress& contract_address, const FF& nullifier)
{
    const NullifierLeafValue siloed = simulation::unconstrained_silo_nullifier(contract_address, nullifier);
    ws->insert_indexed_leaves<NullifierLeafValue>(MerkleTreeId::NULLIFIER_TREE, { siloed }, fork_id);
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
    return simulate_scenario(TxScenario{ .app_calls = app_calls }, config);
}

TxSimulationResult PublicTxSimulationTester::simulate_tx_with_setup(const std::vector<TestEnqueuedCall>& setup_calls,
                                                                    const std::vector<TestEnqueuedCall>& app_calls,
                                                                    const PublicSimulatorConfig& config)
{
    return simulate_scenario(TxScenario{ .setup_calls = setup_calls, .app_calls = app_calls }, config);
}

TxSimulationResult PublicTxSimulationTester::simulate_tx_as(const AztecAddress& sender,
                                                            const std::vector<TestEnqueuedCall>& app_calls,
                                                            bool commit,
                                                            const PublicSimulatorConfig& config)
{
    return simulate_scenario(TxScenario{ .app_calls = app_calls, .sender = sender, .commit = commit }, config);
}

TxSimulationResult PublicTxSimulationTester::simulate_scenario(const TxScenario& scenario,
                                                               const PublicSimulatorConfig& config)
{
    const AztecAddress sender = scenario.sender.value_or(default_sender());
    const AztecAddress fee_payer = sender;
    fund_fee_payer(fee_payer);

    const auto to_enqueued_call = [&](const TestEnqueuedCall& call) {
        return PublicCallRequestWithCalldata{
            .request =
                PublicCallRequest{
                    .msg_sender = call.msg_sender.value_or(sender),
                    .contract_address = call.contract_address,
                    .is_static_call = call.is_static_call,
                    .calldata_hash = simulation::compute_calldata_hash(call.calldata),
                },
            .calldata = call.calldata,
        };
    };

    std::vector<PublicCallRequestWithCalldata> setup_enqueued_calls;
    setup_enqueued_calls.reserve(scenario.setup_calls.size());
    for (const auto& call : scenario.setup_calls) {
        setup_enqueued_calls.push_back(to_enqueued_call(call));
    }
    std::vector<PublicCallRequestWithCalldata> app_logic_enqueued_calls;
    app_logic_enqueued_calls.reserve(scenario.app_calls.size());
    for (const auto& call : scenario.app_calls) {
        app_logic_enqueued_calls.push_back(to_enqueued_call(call));
    }
    std::optional<PublicCallRequestWithCalldata> teardown_enqueued_call;
    if (scenario.teardown_call.has_value()) {
        teardown_enqueued_call = to_enqueued_call(*scenario.teardown_call);
    }

    // The first nullifier is required for note-nonce computation. Use the scenario's non-revertible
    // nullifiers when provided (their first element is the first nullifier); otherwise supply a unique
    // default. tx_count is bumped regardless to keep the default unique across txs.
    std::vector<FF> non_revertible_nullifiers = scenario.non_revertible_nullifiers;
    if (non_revertible_nullifiers.empty()) {
        non_revertible_nullifiers = {
            FF(uint256_t("0x00000000000000000000000000000000000000000000000000000000deadbeef")) + FF(tx_count)
        };
    }
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

    const Gas app_gas_limits = scenario.gas_limits.value_or(
        Gas{ .l2_gas = MAX_PROCESSABLE_L2_GAS, .da_gas = MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT });

    Tx tx{
        .hash = "0xtest",
        .gas_settings =
            GasSettings{
                // Mirror the TS PublicTxSimulationTester limits (MAX_PROCESSABLE_L2_GAS /
                // MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT). After subtracting the private-portion
                // overhead this leaves AVM_MAX_PROCESSABLE_L2_GAS for app logic, which heavy app
                // tests (e.g. AvmTest bulk_testing) need; a flat 1M is not enough.
                .gas_limits = app_gas_limits,
                .teardown_gas_limits = Gas{ .l2_gas = 1000000, .da_gas = 1000000 },
                .max_fees_per_gas = GasFees{ .fee_per_da_gas = 1, .fee_per_l2_gas = 1 },
                .max_priority_fees_per_gas = GasFees{ .fee_per_da_gas = 0, .fee_per_l2_gas = 0 },
            },
        .effective_gas_fees = GasFees{ .fee_per_da_gas = 1, .fee_per_l2_gas = 1 },
        .non_revertible_accumulated_data = AccumulatedData{ .note_hashes = scenario.non_revertible_note_hashes,
                                                            .nullifiers = non_revertible_nullifiers },
        .revertible_accumulated_data = AccumulatedData{ .note_hashes = scenario.revertible_note_hashes,
                                                        .nullifiers = scenario.revertible_nullifiers,
                                                        .l2_to_l1_messages = scenario.revertible_l2_to_l1_messages },
        .setup_enqueued_calls = setup_enqueued_calls,
        .app_logic_enqueued_calls = app_logic_enqueued_calls,
        .teardown_enqueued_call = teardown_enqueued_call,
        .gas_used_by_private = Gas{ .l2_gas = PUBLIC_TX_L2_GAS_OVERHEAD, .da_gas = TX_DA_GAS_OVERHEAD },
        .fee_payer = fee_payer,
    };
    const bool commit = scenario.commit;

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
        // Commit the tx's state changes to the world state when requested (so subsequent txs observe
        // them); otherwise revert so each tx is isolated.
        if (commit) {
            ws->commit_checkpoint(fork_id);
        } else {
            ws->revert_checkpoint(fork_id);
        }
        return result;
    } catch (...) {
        ws->revert_checkpoint(fork_id);
        throw;
    }
}

} // namespace bb::avm2::testing
