#include <cstddef>
#include <cstdint>
#include <vector>

#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/world_state_reference/memory_merkle_db.hpp"

// Flat C ABI over the in-memory reference world state, for out-of-tree world-state
// implementations that prove conformance against it (e.g. the standalone wsdb service)
// without depending on barretenberg's C++ headers, field type, or build flags. Field
// elements cross as 32 canonical bytes (barretenberg's field serialization); tree ids
// are the bb::world_state::MerkleTreeId values (0 = nullifier, 1 = note hash,
// 2 = public data, 3 = L1-to-L2 message). Passing a tree id a method does not support
// throws, as in the underlying class; conformance drivers must pass valid ids.
namespace {
using bb::world_state::MemoryMerkleDB;
using bb::world_state::MerkleTreeId;
using FF = bb::fr;

MemoryMerkleDB& db(void* handle)
{
    return *static_cast<MemoryMerkleDB*>(handle);
}

MerkleTreeId tree(uint8_t tree_id)
{
    return static_cast<MerkleTreeId>(tree_id);
}
} // namespace

extern "C" {

void* bb_wsref_create(size_t nullifier_tree_prefill, size_t public_data_tree_prefill)
{
    return new MemoryMerkleDB(nullifier_tree_prefill, public_data_tree_prefill);
}

void bb_wsref_destroy(void* handle)
{
    delete static_cast<MemoryMerkleDB*>(handle);
}

// Snapshot of one tree: root as 32 bytes plus the next free leaf index.
void bb_wsref_get_snapshot(void* handle, uint8_t tree_id, uint8_t* out_root, uint64_t* out_next_index)
{
    const auto roots = db(handle).get_tree_roots();
    const bb::world_state::TreeSnapshot* snap = nullptr;
    switch (tree(tree_id)) {
    case MerkleTreeId::NULLIFIER_TREE:
        snap = &roots.nullifier_tree;
        break;
    case MerkleTreeId::NOTE_HASH_TREE:
        snap = &roots.note_hash_tree;
        break;
    case MerkleTreeId::PUBLIC_DATA_TREE:
        snap = &roots.public_data_tree;
        break;
    case MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
        snap = &roots.l1_to_l2_message_tree;
        break;
    default:
        throw_or_abort("bb_wsref_get_snapshot: unsupported tree id");
    }
    FF::serialize_to_buffer(snap->root, out_root);
    *out_next_index = snap->next_available_leaf_index;
}

// Writes the sibling path (leaf to root) as consecutive 32-byte nodes into `out`, which
// must hold tree-height nodes. Returns the node count.
size_t bb_wsref_get_sibling_path(void* handle, uint8_t tree_id, uint64_t leaf_index, uint8_t* out)
{
    const auto path = db(handle).get_sibling_path(tree(tree_id), leaf_index);
    for (size_t i = 0; i < path.size(); ++i) {
        FF::serialize_to_buffer(path[i], out + (i * 32));
    }
    return path.size();
}

void bb_wsref_get_low_indexed_leaf(
    void* handle, uint8_t tree_id, const uint8_t* key, uint8_t* out_is_present, uint64_t* out_index)
{
    const auto response = db(handle).get_low_indexed_leaf(tree(tree_id), FF::serialize_from_buffer(key));
    *out_is_present = response.is_already_present ? 1 : 0;
    *out_index = response.index;
}

void bb_wsref_get_leaf_value(void* handle, uint8_t tree_id, uint64_t leaf_index, uint8_t* out)
{
    FF::serialize_to_buffer(db(handle).get_leaf_value(tree(tree_id), leaf_index), out);
}

void bb_wsref_get_nullifier_preimage(
    void* handle, uint64_t leaf_index, uint8_t* out_nullifier, uint64_t* out_next_index, uint8_t* out_next_key)
{
    const auto preimage = db(handle).get_leaf_preimage_nullifier_tree(leaf_index);
    FF::serialize_to_buffer(preimage.leaf.nullifier, out_nullifier);
    *out_next_index = preimage.nextIndex;
    FF::serialize_to_buffer(preimage.nextKey, out_next_key);
}

void bb_wsref_get_public_data_preimage(void* handle,
                                       uint64_t leaf_index,
                                       uint8_t* out_slot,
                                       uint8_t* out_value,
                                       uint64_t* out_next_index,
                                       uint8_t* out_next_key)
{
    const auto preimage = db(handle).get_leaf_preimage_public_data_tree(leaf_index);
    FF::serialize_to_buffer(preimage.leaf.slot, out_slot);
    FF::serialize_to_buffer(preimage.leaf.value, out_value);
    *out_next_index = preimage.nextIndex;
    FF::serialize_to_buffer(preimage.nextKey, out_next_key);
}

void bb_wsref_insert_nullifier(void* handle, const uint8_t* nullifier)
{
    db(handle).insert_indexed_leaves_nullifier_tree(
        bb::crypto::merkle_tree::NullifierLeafValue(FF::serialize_from_buffer(nullifier)));
}

void bb_wsref_insert_public_data(void* handle, const uint8_t* slot, const uint8_t* value)
{
    db(handle).insert_indexed_leaves_public_data_tree(bb::crypto::merkle_tree::PublicDataLeafValue(
        FF::serialize_from_buffer(slot), FF::serialize_from_buffer(value)));
}

// `leaves` is count*32 canonical bytes.
void bb_wsref_append_leaves(void* handle, uint8_t tree_id, const uint8_t* leaves, size_t count)
{
    std::vector<FF> values;
    values.reserve(count);
    for (size_t i = 0; i < count; ++i) {
        values.push_back(FF::serialize_from_buffer(leaves + (i * 32)));
    }
    db(handle).append_leaves(tree(tree_id), values);
}

void bb_wsref_pad_tree(void* handle, uint8_t tree_id, size_t num_leaves)
{
    db(handle).pad_tree(tree(tree_id), num_leaves);
}

void bb_wsref_create_checkpoint(void* handle)
{
    db(handle).create_checkpoint();
}

void bb_wsref_commit_checkpoint(void* handle)
{
    db(handle).commit_checkpoint();
}

void bb_wsref_revert_checkpoint(void* handle)
{
    db(handle).revert_checkpoint();
}

uint32_t bb_wsref_get_checkpoint_id(void* handle)
{
    return db(handle).get_checkpoint_id();
}

} // extern "C"
