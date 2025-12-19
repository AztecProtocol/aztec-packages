#include "barretenberg/avm_fuzzer/common/interfaces/dbs.hpp"

#include <cstdint>
#include <vector>

#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

using namespace bb::avm2::simulation;
using Poseidon2 = bb::crypto::Poseidon2<bb::crypto::Poseidon2Bn254ScalarFieldParams>;
using namespace bb::crypto::merkle_tree;
using namespace bb::world_state;

// TODO(ilyas): implement other methods as needed
namespace bb::avm2::fuzzer {

TreeSnapshots FuzzerLowLevelDB::get_tree_roots() const
{
    return {
        .l1_to_l2_message_tree = { .root = FF(0), .next_available_leaf_index = 0 },
        .note_hash_tree = { .root = FF(0), .next_available_leaf_index = next_available_note_hash_index },
        .nullifier_tree = { .root = FF(0), .next_available_leaf_index = next_available_nullifier_index },
        .public_data_tree = { .root = FF(0), .next_available_leaf_index = next_available_public_data_index },
    };
}

SiblingPath FuzzerLowLevelDB::get_sibling_path([[maybe_unused]] MerkleTreeId tree_id,
                                               [[maybe_unused]] index_t leaf_index) const
{
    throw_or_abort("FuzzerLowLevelDB::get_sibling_path not implemented");
}

std::pair<FF, index_t> FuzzerLowLevelDB::get_indexed_low_leaf_helper(
    const std::vector<std::pair<FF, index_t>>& value_sorted_leaves, const FF& value) const
{
    for (size_t i = 0; i < value_sorted_leaves.size(); ++i) {
        if (value_sorted_leaves[i].first == value) {
            return value_sorted_leaves[i];
        }
        if (value_sorted_leaves[i].first > value) {
            return value_sorted_leaves[i - 1];
        }
    }
    // If we reach here, the value is larger than any leaf in the tree, return the last leaf
    return value_sorted_leaves.back();
}

GetLowIndexedLeafResponse FuzzerLowLevelDB::get_low_indexed_leaf(MerkleTreeId tree_id, const FF& value) const
{
    switch (tree_id) {
    case MerkleTreeId::NULLIFIER_TREE: {
        auto [low_value, low_index] = get_indexed_low_leaf_helper(nullifier_values, value);
        return GetLowIndexedLeafResponse(low_value == value, low_index);
        break;
    }
    case MerkleTreeId::PUBLIC_DATA_TREE: {
        auto [low_value, low_index] = get_indexed_low_leaf_helper(public_data_slots, value);
        return GetLowIndexedLeafResponse(low_value == value, low_index);
        break;
    }
    default:
        break;
    }
    return GetLowIndexedLeafResponse(false, 0);
}
FF FuzzerLowLevelDB::get_leaf_value(MerkleTreeId tree_id, index_t leaf_index) const
{
    switch (tree_id) {
    case MerkleTreeId::NULLIFIER_TREE:
        return nullifier_leaves.at(leaf_index).nullifier;
    case MerkleTreeId::PUBLIC_DATA_TREE:
        return public_data_leaves.at(leaf_index).value;
    case MerkleTreeId::NOTE_HASH_TREE:
        return note_hash_leaves.at(leaf_index);
    default:
        break;
    }
    return FF(0);
}
simulation::IndexedLeaf<PublicDataLeafValue> FuzzerLowLevelDB::get_leaf_preimage_public_data_tree(
    index_t leaf_index) const
{
    PublicDataLeafValue leaf_value = public_data_leaves.at(leaf_index);
    std::pair<FF, index_t> value_index_pair = { leaf_value.value, leaf_index };
    // Find index in public_data_slots
    auto it = std::ranges::find_if(
        public_data_slots.begin(), public_data_slots.end(), [&value_index_pair](const std::pair<FF, index_t>& pair) {
            return pair.second == value_index_pair.second;
        });
    if (it == public_data_slots.end()) {
        throw_or_abort("FuzzerLowLevelDB::get_leaf_preimage_public_data_tree: leaf not found in public_data_slots");
    }
    it++; // Now iterator is at the next element
    if (it == public_data_slots.end()) {
        // If this is the last leaf, return with index 0
        return simulation::IndexedLeaf<PublicDataLeafValue>(leaf_value, 0, 0);
    }
    auto [next_value, next_index] = *it;
    return bb::crypto::merkle_tree::IndexedLeaf<PublicDataLeafValue>(leaf_value, next_index, next_value);
}

simulation::IndexedLeaf<NullifierLeafValue> FuzzerLowLevelDB::get_leaf_preimage_nullifier_tree(index_t leaf_index) const
{
    auto leaf_value = nullifier_leaves.at(leaf_index);
    std::pair<FF, index_t> value_index_pair = { leaf_value.nullifier, leaf_index };
    // Find index in nullifiers_values
    auto it = std::ranges::find_if(
        nullifier_values.begin(), nullifier_values.end(), [&value_index_pair](const std::pair<FF, index_t>& pair) {
            return pair.second == value_index_pair.second;
        });
    if (it == nullifier_values.end()) {
        throw_or_abort("FuzzerLowLevelDB::get_leaf_preimage_nullifier_tree: leaf not found in nullifier_values");
    }

    it++; // Now iterator is at the next element

    if (it == nullifier_values.end()) {
        // If this is the last leaf, return with index 0
        return simulation::IndexedLeaf<NullifierLeafValue>(leaf_value, 0, 0);
    }
    auto [next_value, next_index] = *it;
    return simulation::IndexedLeaf<NullifierLeafValue>(leaf_value, next_index, next_value);
}

simulation::SequentialInsertionResult<PublicDataLeafValue> FuzzerLowLevelDB::insert_indexed_leaves_public_data_tree(
    const PublicDataLeafValue& leaf_value)
{
    // Add to map
    public_data_leaves[next_available_public_data_index] = leaf_value;
    // Add to sorted vector
    public_data_slots.push_back({ leaf_value.slot, next_available_public_data_index });
    // Sort vector
    std::ranges::sort(
        public_data_slots.begin(),
        public_data_slots.end(),
        [](const std::pair<FF, index_t>& a, const std::pair<FF, index_t>& b) { return a.first < b.first; });

    // Increment next available index
    next_available_public_data_index++;
    // Don't return any witness data for now, as it's not used for pure calls.
    return {};
}

simulation::SequentialInsertionResult<NullifierLeafValue> FuzzerLowLevelDB::insert_indexed_leaves_nullifier_tree(
    const NullifierLeafValue& leaf_value)
{
    // Add to map
    nullifier_leaves[next_available_nullifier_index] = leaf_value;
    // Add to sorted vector
    nullifier_values.push_back({ leaf_value.nullifier, next_available_nullifier_index });
    // Sort vector
    std::ranges::sort(
        nullifier_values.begin(),
        nullifier_values.end(),
        [](const std::pair<FF, index_t>& a, const std::pair<FF, index_t>& b) { return a.first < b.first; });

    // Increment next available index
    next_available_nullifier_index++;
    // Don't return any witness data for now, as it's not used for pure calls.
    return {};
}

void FuzzerLowLevelDB::append_leaves([[maybe_unused]] MerkleTreeId tree_id, std::span<const FF> leaves)
{
    note_hash_leaves.insert(note_hash_leaves.end(), leaves.begin(), leaves.end());
    next_available_note_hash_index += leaves.size();
}
void FuzzerLowLevelDB::pad_tree([[maybe_unused]] MerkleTreeId tree_id, [[maybe_unused]] size_t num_leaves) {}

void FuzzerLowLevelDB::create_checkpoint() {}
void FuzzerLowLevelDB::commit_checkpoint() {}
void FuzzerLowLevelDB::revert_checkpoint() {}
uint32_t FuzzerLowLevelDB::get_checkpoint_id() const
{
    return 0;
}

// Helper to insert a contract address into the nullifier tree
void FuzzerLowLevelDB::insert_contract_address(const AztecAddress& contract_address)
{
    auto contract_nullifier =
        simulation::unconstrained_silo_nullifier(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS, contract_address);
    insert_indexed_leaves_nullifier_tree(contract_nullifier);
}

////////////////////////////////
/// ContractDBInterface methods
////////////////////////////////
std::optional<ContractInstance> FuzzerContractDB::get_contract_instance(const AztecAddress& address) const
{
    if (!contract_instances.contains(address)) {
        return std::nullopt;
    }
    return contract_instances.at(address);
}

std::optional<ContractClass> FuzzerContractDB::get_contract_class(const ContractClassId& class_id) const
{
    if (!contract_classes.contains(class_id)) {
        return std::nullopt;
    }
    return contract_classes.at(class_id);
}

std::optional<FF> FuzzerContractDB::get_bytecode_commitment(const ContractClassId& class_id) const
{
    // Return 0 might be an issue, in the pure bytecode manager we cache based on this value
    // This might cause different classes to be treated as the same if they return 0 here.
    // For now we just return the class_id as it should be as unique as the bytecode commitment
    if (!contract_classes.contains(class_id)) {
        return std::nullopt;
    }
    return class_id;
}
std::optional<std::string> FuzzerContractDB::get_debug_function_name(
    [[maybe_unused]] const AztecAddress& address, [[maybe_unused]] const FunctionSelector& selector) const
{
    return std::nullopt;
}

void FuzzerContractDB::add_contracts(const ContractDeploymentData& contract_deployment_data)
{
    // Extract ContractClasses
    for (const auto& log : contract_deployment_data.contract_class_logs) {
        ContractClass klass = from_logs(log);
        contract_classes[klass.id] = klass;
    }

    // Extract ContractInstances
    for (const auto& log : contract_deployment_data.private_logs) {
        ContractInstance instance = from_logs(log);
        AztecAddress contract_address = log.fields[2];
        contract_instances[contract_address] = instance;
    }
}

void FuzzerContractDB::add_contract_class(const ContractClassId& class_id, const ContractClass& contract_class)
{
    contract_classes[class_id] = contract_class;
    contract_classes_vector.push_back(contract_class);
}

void FuzzerContractDB::add_contract_instance(const AztecAddress& address, const ContractInstance& contract_instance)
{
    contract_instances[address] = contract_instance;
    contract_instances_vector.push_back({ address, contract_instance });
}

// Based on fromLogs in yarn-project/protocol-contracts/src/class-registry/contract_class_published_event.ts
ContractClass FuzzerContractDB::from_logs(const ContractClassLog& log) const
{
    // todo(ilyas): difference between log.emitted_length and log.fields.fields.length?
    size_t offset = 1; // Tag field is at index 0 and we skip it
    auto class_id = log.fields.fields[offset++];
    [[maybe_unused]] auto version = static_cast<uint32_t>(log.fields.fields[offset++]);
    auto artifact_hash = log.fields.fields[offset++];
    auto private_functions_root = log.fields.fields[offset++];
    // The remainder is packed_bytecode, the first element is the length
    auto packed_bytecode_len = static_cast<uint32_t>(log.fields.fields[offset++]);
    std::vector<uint8_t> packed_bytecode;
    packed_bytecode.reserve(packed_bytecode_len);
    for (size_t i = 0; i < packed_bytecode_len; ++i) {
        // todo(ilyas): check that the bufferFromFields function in TS skips the first byte of each field's buffer
        // (since it expects it to be zero?)
        std::vector<uint8_t> f = to_buffer(log.fields.fields[offset + i]);
        packed_bytecode.insert(packed_bytecode.end(), f.begin() + 1, f.end());
    }

    return ContractClass{
        .id = class_id,
        .artifact_hash = artifact_hash,
        .private_functions_root = private_functions_root,
        .packed_bytecode = packed_bytecode,
    };
}

// Base on fromLogs in yarn-project/protocol-contracts/src/instance-registry/contract_instance_published_event.ts
ContractInstance FuzzerContractDB::from_logs(const PrivateLog& log) const
{
    // We skip the following fields:
    // - tag (index 0)
    // - version (index 1)
    // - contract address (index 2)
    size_t offset = 3;
    FF salt = log.fields[offset++];
    FF contract_class_id = log.fields[offset++];
    FF initialization_hash = log.fields[offset++];
    PublicKeys public_keys = {
        .nullifier_key = { log.fields[offset++], log.fields[offset++] },
        .incoming_viewing_key = { log.fields[offset++], log.fields[offset++] },
        .outgoing_viewing_key = { log.fields[offset++], log.fields[offset++] },
        .tagging_key = { log.fields[offset++], log.fields[offset++] },
    };
    auto deployer = AztecAddress(log.fields[offset++]);
    return ContractInstance{
        .salt = salt,
        .deployer = deployer,
        .current_contract_class_id = contract_class_id,
        .original_contract_class_id = contract_class_id,
        .initialization_hash = initialization_hash,
        .public_keys = public_keys,
    };
}

void FuzzerContractDB::create_checkpoint()
{
    checkpoints.push(Checkpoint{
        .contract_classes = contract_classes,
        .contract_instances = contract_instances,
    });
}

void FuzzerContractDB::commit_checkpoint()
{
    if (!checkpoints.empty()) {
        checkpoints.pop();
    }
}

void FuzzerContractDB::revert_checkpoint()
{
    if (!checkpoints.empty()) {
        contract_classes = std::move(checkpoints.top().contract_classes);
        contract_instances = std::move(checkpoints.top().contract_instances);
        checkpoints.pop();
    }
}

////////////////////////////////////
/// FuzzerWorldStateManager methods
////////////////////////////////////

// Static instance definition
FuzzerWorldStateManager* FuzzerWorldStateManager::instance = nullptr;

void FuzzerWorldStateManager::initialize_world_state()
{
    std::unordered_map<simulation::MerkleTreeId, uint32_t> tree_heights{
        { simulation::MerkleTreeId::NULLIFIER_TREE, NULLIFIER_TREE_HEIGHT },
        { simulation::MerkleTreeId::NOTE_HASH_TREE, NOTE_HASH_TREE_HEIGHT },
        { simulation::MerkleTreeId::PUBLIC_DATA_TREE, PUBLIC_DATA_TREE_HEIGHT },
        { simulation::MerkleTreeId::L1_TO_L2_MESSAGE_TREE, L1_TO_L2_MSG_TREE_HEIGHT },
        { simulation::MerkleTreeId::ARCHIVE, ARCHIVE_HEIGHT },
    };
    std::unordered_map<simulation::MerkleTreeId, index_t> tree_prefill{
        { simulation::MerkleTreeId::NULLIFIER_TREE, 128 },
        { simulation::MerkleTreeId::PUBLIC_DATA_TREE, 128 },
    };
    uint32_t initial_header_generator_point = 28; // GeneratorIndex.BLOCK_HASH
    ws = std::make_unique<world_state::WorldState>(
        /*thread_pool_size=*/4, DATA_DIR, MAP_SIZE_KB, tree_heights, tree_prefill, initial_header_generator_point);

    fork_ids.push(ws->create_fork(std::nullopt));
}

WorldStateRevision FuzzerWorldStateManager::get_current_revision() const
{
    return WorldStateRevision{ .forkId = fork_ids.top(), .blockNumber = 0, .includeUncommitted = true };
}

WorldStateRevision FuzzerWorldStateManager::fork()
{
    auto fork_id = ws->create_fork(std::nullopt);
    fork_ids.push(fork_id);
    return WorldStateRevision{ .forkId = fork_id, .blockNumber = 0, .includeUncommitted = true };
}
void FuzzerWorldStateManager::reset_world_state()
{
    // We keep the initial fork, so pop until only one remains
    while (fork_ids.size() != 1) {
        ws->delete_fork(fork_ids.top());
        fork_ids.pop();
    }
}
void FuzzerWorldStateManager::register_contract_address(const AztecAddress& contract_address)
{
    NullifierLeafValue contract_nullifier =
        unconstrained_silo_nullifier(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS, contract_address);
    auto fork_id = fork_ids.top();
    ws->insert_indexed_leaves<NullifierLeafValue>(MerkleTreeId::NULLIFIER_TREE, { contract_nullifier }, fork_id);
}

void FuzzerWorldStateManager::write_fee_payer_balance(const AztecAddress& fee_payer, const FF& balance)
{
    if (fee_payer == 0) {
        return;
    }
    FF fee_juice_balance_slot = Poseidon2::hash({ FEE_JUICE_BALANCES_SLOT, fee_payer });
    FF leaf_slot =
        Poseidon2::hash({ GENERATOR_INDEX__PUBLIC_LEAF_INDEX, FF(FEE_JUICE_ADDRESS), fee_juice_balance_slot });

    // Write to public data tree using current fork
    auto fork_id = fork_ids.top();
    ws->update_public_data(PublicDataLeafValue(leaf_slot, balance), fork_id);
}

} // namespace bb::avm2::fuzzer
