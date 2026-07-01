#include "barretenberg/vm2/simulation/lib/memory_merkle_db.hpp"

#include <stdexcept>
#include <string>

#include "barretenberg/aztec/aztec_constants.hpp"

namespace bb::avm2::simulation {

MemoryMerkleDB::MemoryMerkleDB(size_t nullifier_tree_prefill, size_t public_data_tree_prefill)
    : state_{
        .nullifier_tree = NullifierTree(NULLIFIER_TREE_HEIGHT, nullifier_tree_prefill),
        .public_data_tree = PublicDataTree(PUBLIC_DATA_TREE_HEIGHT, public_data_tree_prefill),
        .note_hash_tree = NoteHashTree(NOTE_HASH_TREE_HEIGHT),
        .l1_to_l2_message_tree = L1ToL2MessageTree(L1_TO_L2_MSG_TREE_HEIGHT),
    }
{}

TreeSnapshots MemoryMerkleDB::get_tree_roots() const
{
    return TreeSnapshots{
        .l1_to_l2_message_tree = state_.l1_to_l2_message_tree.get_snapshot(),
        .note_hash_tree = state_.note_hash_tree.get_snapshot(),
        .nullifier_tree = state_.nullifier_tree.get_snapshot(),
        .public_data_tree = state_.public_data_tree.get_snapshot(),
    };
}

SiblingPath MemoryMerkleDB::get_sibling_path(MerkleTreeId tree_id, index_t leaf_index) const
{
    switch (tree_id) {
    case MerkleTreeId::NULLIFIER_TREE:
        return state_.nullifier_tree.get_sibling_path(leaf_index);
    case MerkleTreeId::PUBLIC_DATA_TREE:
        return state_.public_data_tree.get_sibling_path(leaf_index);
    case MerkleTreeId::NOTE_HASH_TREE:
        return state_.note_hash_tree.get_sibling_path(leaf_index);
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
        return state_.l1_to_l2_message_tree.get_sibling_path(leaf_index);
    default:
        throw std::runtime_error("get_sibling_path: unsupported tree id " +
                                 std::to_string(static_cast<uint64_t>(tree_id)));
    }
}

GetLowIndexedLeafResponse MemoryMerkleDB::get_low_indexed_leaf(MerkleTreeId tree_id, const FF& value) const
{
    switch (tree_id) {
    case MerkleTreeId::NULLIFIER_TREE:
        return state_.nullifier_tree.get_low_indexed_leaf(value);
    case MerkleTreeId::PUBLIC_DATA_TREE:
        return state_.public_data_tree.get_low_indexed_leaf(value);
    default:
        throw std::runtime_error("get_low_indexed_leaf: unsupported tree id " +
                                 std::to_string(static_cast<uint64_t>(tree_id)));
    }
}

FF MemoryMerkleDB::get_leaf_value(MerkleTreeId tree_id, index_t leaf_index) const
{
    switch (tree_id) {
    case MerkleTreeId::NULLIFIER_TREE:
        return state_.nullifier_tree.get_leaf_value(leaf_index);
    case MerkleTreeId::PUBLIC_DATA_TREE:
        return state_.public_data_tree.get_leaf_value(leaf_index);
    case MerkleTreeId::NOTE_HASH_TREE:
        return state_.note_hash_tree.get_leaf_value(leaf_index);
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
        return state_.l1_to_l2_message_tree.get_leaf_value(leaf_index);
    default:
        throw std::runtime_error("get_leaf_value: unsupported tree id " +
                                 std::to_string(static_cast<uint64_t>(tree_id)));
    }
}

IndexedLeaf<PublicDataLeafValue> MemoryMerkleDB::get_leaf_preimage_public_data_tree(index_t leaf_index) const
{
    return state_.public_data_tree.get_leaf_preimage(leaf_index);
}

IndexedLeaf<NullifierLeafValue> MemoryMerkleDB::get_leaf_preimage_nullifier_tree(index_t leaf_index) const
{
    return state_.nullifier_tree.get_leaf_preimage(leaf_index);
}

SequentialInsertionResult<PublicDataLeafValue> MemoryMerkleDB::insert_indexed_leaves_public_data_tree(
    const PublicDataLeafValue& leaf_value)
{
    return state_.public_data_tree.insert_indexed_leaf(leaf_value);
}

SequentialInsertionResult<NullifierLeafValue> MemoryMerkleDB::insert_indexed_leaves_nullifier_tree(
    const NullifierLeafValue& leaf_value)
{
    return state_.nullifier_tree.insert_indexed_leaf(leaf_value);
}

void MemoryMerkleDB::append_leaves(MerkleTreeId tree_id, std::span<const FF> leaves)
{
    switch (tree_id) {
    case MerkleTreeId::NOTE_HASH_TREE:
        state_.note_hash_tree.append_leaves(leaves);
        break;
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
        state_.l1_to_l2_message_tree.append_leaves(leaves);
        break;
    default:
        throw std::runtime_error("append_leaves is only supported for NOTE_HASH_TREE and L1_TO_L2_MESSAGE_TREE");
    }
}

void MemoryMerkleDB::pad_tree(MerkleTreeId tree_id, size_t num_leaves)
{
    switch (tree_id) {
    case MerkleTreeId::NULLIFIER_TREE:
        state_.nullifier_tree.pad_leaves(num_leaves);
        break;
    case MerkleTreeId::NOTE_HASH_TREE:
        state_.note_hash_tree.pad_leaves(num_leaves);
        break;
    default:
        throw std::runtime_error("Padding not supported for tree " + std::to_string(static_cast<uint64_t>(tree_id)));
    }
}

void MemoryMerkleDB::create_checkpoint()
{
    checkpoints_.push(state_);
    // Mirror PureRawMerkleDB's checkpoint-id semantics: push parent_id + 1. This keeps ids
    // deterministic across repeated simulations of the same transaction (the fuzzer runs the fast
    // and hint-collecting simulations against the same DB), which the hinting layer asserts on.
    checkpoint_stack_.push(checkpoint_stack_.top() + 1);
}

void MemoryMerkleDB::commit_checkpoint()
{
    // Keep the current state, discard the saved snapshot.
    checkpoints_.pop();
    checkpoint_stack_.pop();
}

void MemoryMerkleDB::revert_checkpoint()
{
    state_ = checkpoints_.top();
    checkpoints_.pop();
    checkpoint_stack_.pop();
}

uint32_t MemoryMerkleDB::get_checkpoint_id() const
{
    return checkpoint_stack_.top();
}

} // namespace bb::avm2::simulation
