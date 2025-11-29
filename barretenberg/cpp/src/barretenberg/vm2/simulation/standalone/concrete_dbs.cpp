#include "barretenberg/vm2/simulation/standalone/concrete_dbs.hpp"

#include <algorithm>

#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/interfaces/written_public_data_slots_tree_check.hpp"
#include "barretenberg/vm2/simulation/lib/merkle.hpp"

namespace bb::avm2::simulation {

// Contracts DB - simple passthrough to raw_contract_db.
std::optional<ContractInstance> PureContractDB::get_contract_instance(const AztecAddress& address) const
{
    return raw_contract_db.get_contract_instance(address);
}

std::optional<ContractClass> PureContractDB::get_contract_class(const ContractClassId& class_id) const
{
    return raw_contract_db.get_contract_class(class_id);
}

std::optional<FF> PureContractDB::get_bytecode_commitment(const ContractClassId& class_id) const
{
    // No timing - bytecode commitment is excluded from TS callback profiling.
    return raw_contract_db.get_bytecode_commitment(class_id);
}

std::optional<std::string> PureContractDB::get_debug_function_name(const AztecAddress& address,
                                                                   const FunctionSelector& selector) const
{
    return raw_contract_db.get_debug_function_name(address, selector);
}

void PureContractDB::add_contracts(const ContractDeploymentData& contract_deployment_data)
{
    raw_contract_db.add_contracts(contract_deployment_data);
}

// Merkle DB starts.
TreeStates PureMerkleDB::get_tree_state() const
{
    // No event generated.
    TreeSnapshots tree_snapshots = raw_merkle_db.get_tree_roots();
    TreeCounters tree_counters = tree_counters_stack.top();
    return {
        .note_hash_tree = { .tree = tree_snapshots.note_hash_tree, .counter = tree_counters.note_hash_counter },
        .nullifier_tree = { .tree = tree_snapshots.nullifier_tree, .counter = tree_counters.nullifier_counter },
        .l1_to_l2_message_tree = { .tree = tree_snapshots.l1_to_l2_message_tree,
                                   .counter = tree_counters.l2_to_l1_msg_counter },
        .public_data_tree = { .tree = tree_snapshots.public_data_tree, .counter = written_public_data_slots.size() },
    };
}

FF PureMerkleDB::storage_read(const AztecAddress& contract_address, const FF& slot) const
{
    FF leaf_slot = unconstrained_compute_leaf_slot(contract_address, slot);
    uint256_t leaf_slot_key = static_cast<uint256_t>(leaf_slot);

    // First check pending writes (most recent value wins).
    // We need to check all levels of the stack from top to bottom.
    auto stack_copy = pending_public_data_stack;
    while (!stack_copy.empty()) {
        const auto& pending_map = stack_copy.top();
        auto it = pending_map.find(leaf_slot_key);
        if (it != pending_map.end()) {
            return it->second;
        }
        stack_copy.pop();
    }

    // Fall back to the underlying tree.
    auto [present, index] = raw_merkle_db.get_low_indexed_leaf(MerkleTreeId::PUBLIC_DATA_TREE, leaf_slot);
    if (present) {
        auto preimage = raw_merkle_db.get_leaf_preimage_public_data_tree(index);
        return preimage.leaf.value;
    }

    return 0;
}

void PureMerkleDB::storage_write(const AztecAddress& contract_address,
                                 const FF& slot,
                                 const FF& value,
                                 bool is_protocol_write)
{
    FF leaf_slot = unconstrained_compute_leaf_slot(contract_address, slot);

    // Defer the merkle insertion - just store in pending map.
    pending_public_data_stack.top()[static_cast<uint256_t>(leaf_slot)] = value;

    if (!is_protocol_write) {
        written_public_data_slots.insert(contract_address, slot);
    }
}

bool PureMerkleDB::was_storage_written(const AztecAddress& contract_address, const FF& slot) const
{
    return written_public_data_slots.contains(contract_address, slot);
}

bool PureMerkleDB::nullifier_exists(const AztecAddress& contract_address, const FF& nullifier) const
{
    return nullifier_exists_internal(contract_address, nullifier);
}

bool PureMerkleDB::siloed_nullifier_exists(const FF& nullifier) const
{
    return nullifier_exists_internal(/*contract_address*/ std::nullopt, nullifier);
}

bool PureMerkleDB::nullifier_exists_internal(std::optional<AztecAddress> contract_address, const FF& nullifier) const
{
    FF siloed_nullifier = nullifier;
    if (contract_address.has_value()) {
        siloed_nullifier = unconstrained_silo_nullifier(contract_address.value(), nullifier);
    }

    // First check pending nullifiers.
    if (pending_nullifiers_set.contains(static_cast<uint256_t>(siloed_nullifier))) {
        return true;
    }

    // Fall back to underlying tree.
    auto [present, low_leaf_index_] =
        raw_merkle_db.get_low_indexed_leaf(MerkleTreeId::NULLIFIER_TREE, siloed_nullifier);

    return present;
}

void PureMerkleDB::nullifier_write(const AztecAddress& contract_address, const FF& nullifier)
{
    nullifier_write_internal(contract_address, nullifier);
}

void PureMerkleDB::siloed_nullifier_write(const FF& nullifier)
{
    nullifier_write_internal(/*contract_address*/ std::nullopt, nullifier);
}

void PureMerkleDB::nullifier_write_internal(std::optional<AztecAddress> contract_address, const FF& nullifier)
{
    FF siloed_nullifier = nullifier;
    if (contract_address.has_value()) {
        // Unconstrained siloing to fetch the hint, since the hints are keyed by siloed data.
        // The siloing will later be constrained in the nullifier tree check gadget.
        siloed_nullifier = unconstrained_silo_nullifier(contract_address.value(), nullifier);
    }

    uint256_t siloed_nullifier_key = static_cast<uint256_t>(siloed_nullifier);

    // Check if already in pending set.
    if (pending_nullifiers_set.contains(siloed_nullifier_key)) {
        throw NullifierCollisionException(
            contract_address.has_value() ? format("Attempted to emit duplicate nullifier ",
                                                  nullifier,
                                                  " (contract address: ",
                                                  contract_address.value(),
                                                  ").")
                                         : format("Attempted to emit duplicate siloed nullifier ", nullifier, "."));
    }

    // Check underlying tree.
    auto [present, low_leaf_index_] =
        raw_merkle_db.get_low_indexed_leaf(MerkleTreeId::NULLIFIER_TREE, siloed_nullifier);

    if (present) {
        throw NullifierCollisionException(
            contract_address.has_value() ? format("Attempted to emit duplicate nullifier ",
                                                  nullifier,
                                                  " (contract address: ",
                                                  contract_address.value(),
                                                  ").")
                                         : format("Attempted to emit duplicate siloed nullifier ", nullifier, "."));
    }

    // Defer the merkle insertion - just store in pending vectors and set.
    pending_nullifiers_stack.top().push_back(siloed_nullifier);
    pending_nullifiers_set.insert(siloed_nullifier_key);

    tree_counters_stack.top().nullifier_counter++;
}

bool PureMerkleDB::note_hash_exists(uint64_t leaf_index, const FF& unique_note_hash) const
{
    // Get the base tree size (before any pending note hashes).
    auto tree_info = raw_merkle_db.get_tree_roots().note_hash_tree;
    uint64_t base_tree_size = tree_info.next_available_leaf_index;

    // Check if the leaf_index is within the pending range.
    // We need to count all pending note hashes across the stack.
    uint64_t total_pending = 0;
    auto stack_copy = pending_note_hashes_stack;
    std::vector<FF> all_pending;
    while (!stack_copy.empty()) {
        const auto& pending = stack_copy.top();
        all_pending.insert(all_pending.begin(), pending.begin(), pending.end());
        stack_copy.pop();
    }
    total_pending = all_pending.size();

    if (leaf_index >= base_tree_size && leaf_index < base_tree_size + total_pending) {
        // This index is in our pending range.
        uint64_t pending_index = leaf_index - base_tree_size;
        return (unique_note_hash == all_pending[pending_index]);
    }

    // Fall back to underlying tree.
    auto leaf_value = raw_merkle_db.get_leaf_value(MerkleTreeId::NOTE_HASH_TREE, leaf_index);
    return (unique_note_hash == leaf_value);
}

void PureMerkleDB::note_hash_write(const AztecAddress& contract_address, const FF& note_hash)
{
    uint32_t note_hash_counter = tree_counters_stack.top().note_hash_counter;
    FF siloed_note_hash = unconstrained_silo_note_hash(contract_address, note_hash);
    FF unique_note_hash = unconstrained_make_unique_note_hash(siloed_note_hash, first_nullifier, note_hash_counter);

    // Defer the merkle insertion - just store in pending vector.
    pending_note_hashes_stack.top().push_back(unique_note_hash);

    tree_counters_stack.top().note_hash_counter++;
}

void PureMerkleDB::siloed_note_hash_write(const FF& siloed_note_hash)
{
    uint32_t note_hash_counter = tree_counters_stack.top().note_hash_counter;
    FF unique_note_hash = unconstrained_make_unique_note_hash(siloed_note_hash, first_nullifier, note_hash_counter);

    // Defer the merkle insertion - just store in pending vector.
    pending_note_hashes_stack.top().push_back(unique_note_hash);

    tree_counters_stack.top().note_hash_counter++;
}

void PureMerkleDB::unique_note_hash_write(const FF& unique_note_hash)
{
    // Defer the merkle insertion - just store in pending vector.
    pending_note_hashes_stack.top().push_back(unique_note_hash);

    tree_counters_stack.top().note_hash_counter++;
}

bool PureMerkleDB::l1_to_l2_msg_exists(uint64_t leaf_index, const FF& msg_hash) const
{
    auto leaf_value = raw_merkle_db.get_leaf_value(MerkleTreeId::L1_TO_L2_MESSAGE_TREE, leaf_index);
    return (msg_hash == leaf_value);
}

void PureMerkleDB::pad_trees()
{
    // Flush all pending public data writes.
    // We need to collect from all levels of the stack (bottom to top for correct order).
    auto pd_stack_copy = pending_public_data_stack;
    std::vector<std::unordered_map<uint256_t, FF>> pd_levels;
    while (!pd_stack_copy.empty()) {
        pd_levels.push_back(pd_stack_copy.top());
        pd_stack_copy.pop();
    }
    // Reverse to get bottom-to-top order.
    std::reverse(pd_levels.begin(), pd_levels.end());

    // Merge all levels, later writes overwrite earlier ones.
    std::unordered_map<uint256_t, FF> merged_public_data;
    for (const auto& level : pd_levels) {
        for (const auto& [key, value] : level) {
            merged_public_data[key] = value;
        }
    }

    // Batch insert all public data writes (no padding for public data tree).
    if (!merged_public_data.empty()) {
        std::vector<PublicDataLeafValue> public_data_leaves;
        public_data_leaves.reserve(merged_public_data.size());
        for (const auto& [leaf_slot_key, value] : merged_public_data) {
            public_data_leaves.emplace_back(FF(leaf_slot_key), value);
        }
        raw_merkle_db.batch_insert_indexed_leaves_public_data_tree(public_data_leaves);
    }

    // Collect all pending note hashes from stack.
    auto nh_stack_copy = pending_note_hashes_stack;
    std::vector<FF> all_note_hashes;
    std::vector<std::vector<FF>> nh_levels;
    while (!nh_stack_copy.empty()) {
        nh_levels.push_back(nh_stack_copy.top());
        nh_stack_copy.pop();
    }
    std::reverse(nh_levels.begin(), nh_levels.end());
    for (const auto& level : nh_levels) {
        all_note_hashes.insert(all_note_hashes.end(), level.begin(), level.end());
    }

    // Flush note hashes AND pad in a single tree write.
    size_t note_hash_padding = MAX_NOTE_HASHES_PER_TX - tree_counters_stack.top().note_hash_counter;
    raw_merkle_db.flush_and_pad_note_hash_tree(all_note_hashes, note_hash_padding);

    // Collect all pending nullifiers from stack.
    auto null_stack_copy = pending_nullifiers_stack;
    std::vector<FF> all_nullifiers;
    std::vector<std::vector<FF>> null_levels;
    while (!null_stack_copy.empty()) {
        null_levels.push_back(null_stack_copy.top());
        null_stack_copy.pop();
    }
    std::reverse(null_levels.begin(), null_levels.end());
    for (const auto& level : null_levels) {
        all_nullifiers.insert(all_nullifiers.end(), level.begin(), level.end());
    }

    // Convert to NullifierLeafValues and flush + pad in a single tree write.
    std::vector<NullifierLeafValue> nullifier_leaves;
    nullifier_leaves.reserve(all_nullifiers.size());
    for (const auto& nullifier : all_nullifiers) {
        nullifier_leaves.emplace_back(nullifier);
    }
    size_t nullifier_padding = MAX_NULLIFIERS_PER_TX - tree_counters_stack.top().nullifier_counter;
    raw_merkle_db.flush_and_pad_nullifier_tree(nullifier_leaves, nullifier_padding);
}

void PureMerkleDB::create_checkpoint()
{
    raw_merkle_db.create_checkpoint();
    written_public_data_slots.create_checkpoint();
    tree_counters_stack.push(tree_counters_stack.top());

    // Push new empty levels for pending data.
    pending_note_hashes_stack.push({});
    pending_nullifiers_stack.push({});
    pending_public_data_stack.push({});

    for (auto& listener : checkpoint_listeners) {
        listener->on_checkpoint_created();
    }
}

void PureMerkleDB::commit_checkpoint()
{
    raw_merkle_db.commit_checkpoint();
    written_public_data_slots.commit_checkpoint();
    TreeCounters current_counters = tree_counters_stack.top();
    tree_counters_stack.pop();
    tree_counters_stack.top() = current_counters;

    // Merge pending data from current level into parent level.
    // Note hashes: append current to parent.
    auto current_note_hashes = std::move(pending_note_hashes_stack.top());
    pending_note_hashes_stack.pop();
    pending_note_hashes_stack.top().insert(
        pending_note_hashes_stack.top().end(), current_note_hashes.begin(), current_note_hashes.end());

    // Nullifiers: append current to parent (set remains as-is since we never remove).
    auto current_nullifiers = std::move(pending_nullifiers_stack.top());
    pending_nullifiers_stack.pop();
    pending_nullifiers_stack.top().insert(
        pending_nullifiers_stack.top().end(), current_nullifiers.begin(), current_nullifiers.end());

    // Public data: merge current into parent (current overwrites parent for same keys).
    auto current_public_data = std::move(pending_public_data_stack.top());
    pending_public_data_stack.pop();
    for (const auto& [key, value] : current_public_data) {
        pending_public_data_stack.top()[key] = value;
    }

    for (auto& listener : checkpoint_listeners) {
        listener->on_checkpoint_committed();
    }
}

void PureMerkleDB::revert_checkpoint()
{
    raw_merkle_db.revert_checkpoint();
    written_public_data_slots.revert_checkpoint();
    tree_counters_stack.pop();

    // Discard pending data from current level.
    // Remove nullifiers from the set that were added in the current level.
    const auto& current_nullifiers = pending_nullifiers_stack.top();
    for (const auto& nullifier : current_nullifiers) {
        pending_nullifiers_set.erase(static_cast<uint256_t>(nullifier));
    }
    pending_nullifiers_stack.pop();

    pending_note_hashes_stack.pop();
    pending_public_data_stack.pop();

    for (auto& listener : checkpoint_listeners) {
        listener->on_checkpoint_reverted();
    }
}

uint32_t PureMerkleDB::get_checkpoint_id() const
{
    return raw_merkle_db.get_checkpoint_id();
}

} // namespace bb::avm2::simulation
