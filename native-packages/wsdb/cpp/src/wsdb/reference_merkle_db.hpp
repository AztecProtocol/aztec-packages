#pragma once

#include "common/aztec_constants.hpp"
#include "field/field_element.hpp"
#include "merkle_tree/indexed_leaf.hpp"
#include "merkle_tree/merkle_tree_id.hpp"
#include "merkle_tree/response.hpp"
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <vector>

// Flat C ABI into barretenberg's in-memory reference world state (defined in
// libbarretenberg.a, world_state_reference/memory_merkle_db_capi.cpp). The reference is
// the conformance spec for the AVM-facing tree semantics: roots, sibling paths, low-leaf
// lookups, indexed-leaf preimages and checkpointing. Field elements cross as 32 canonical
// bytes; tree ids are the shared MerkleTreeId values.
extern "C" {
void* bb_wsref_create(size_t nullifier_tree_prefill, size_t public_data_tree_prefill);
void bb_wsref_destroy(void* handle);
void bb_wsref_get_snapshot(void* handle, uint8_t tree_id, uint8_t* out_root, uint64_t* out_next_index);
size_t bb_wsref_get_sibling_path(void* handle, uint8_t tree_id, uint64_t leaf_index, uint8_t* out);
void bb_wsref_get_low_indexed_leaf(
    void* handle, uint8_t tree_id, const uint8_t* key, uint8_t* out_is_present, uint64_t* out_index);
void bb_wsref_get_leaf_value(void* handle, uint8_t tree_id, uint64_t leaf_index, uint8_t* out);
void bb_wsref_get_nullifier_preimage(
    void* handle, uint64_t leaf_index, uint8_t* out_nullifier, uint64_t* out_next_index, uint8_t* out_next_key);
void bb_wsref_get_public_data_preimage(void* handle,
                                       uint64_t leaf_index,
                                       uint8_t* out_slot,
                                       uint8_t* out_value,
                                       uint64_t* out_next_index,
                                       uint8_t* out_next_key);
void bb_wsref_insert_nullifier(void* handle, const uint8_t* nullifier);
void bb_wsref_insert_public_data(void* handle, const uint8_t* slot, const uint8_t* value);
void bb_wsref_append_leaves(void* handle, uint8_t tree_id, const uint8_t* leaves, size_t count);
void bb_wsref_pad_tree(void* handle, uint8_t tree_id, size_t num_leaves);
void bb_wsref_create_checkpoint(void* handle);
void bb_wsref_commit_checkpoint(void* handle);
void bb_wsref_revert_checkpoint(void* handle);
uint32_t bb_wsref_get_checkpoint_id(void* handle);
}

namespace azteclabs::wsdb {

/**
 * @brief RAII wrapper over barretenberg's reference merkle DB, in wsdb's own types.
 *
 * Used by the conformance test to drive the reference and this package's WorldState
 * through identical operations and compare results, without compiling any barretenberg
 * headers (field elements cross the C ABI as 32 canonical bytes, which is FieldElement's
 * own representation).
 */
class ReferenceMerkleDB {
  public:
    struct Snapshot {
        fr root;
        uint64_t next_available_leaf_index = 0;
        bool operator==(const Snapshot&) const = default;
    };

    ReferenceMerkleDB(size_t nullifier_tree_prefill, size_t public_data_tree_prefill)
        : handle_(bb_wsref_create(nullifier_tree_prefill, public_data_tree_prefill))
    {}
    ~ReferenceMerkleDB() { bb_wsref_destroy(handle_); }
    ReferenceMerkleDB(const ReferenceMerkleDB&) = delete;
    ReferenceMerkleDB& operator=(const ReferenceMerkleDB&) = delete;

    Snapshot get_snapshot(merkle_tree::MerkleTreeId tree_id) const
    {
        Snapshot snapshot;
        bb_wsref_get_snapshot(handle_, id(tree_id), snapshot.root.data(), &snapshot.next_available_leaf_index);
        return snapshot;
    }

    merkle_tree::fr_sibling_path get_sibling_path(merkle_tree::MerkleTreeId tree_id, uint64_t leaf_index) const
    {
        std::vector<uint8_t> buffer(static_cast<size_t>(tree_height(tree_id)) * 32);
        size_t count = bb_wsref_get_sibling_path(handle_, id(tree_id), leaf_index, buffer.data());
        merkle_tree::fr_sibling_path path(count);
        for (size_t i = 0; i < count; ++i) {
            std::memcpy(path[i].data(), buffer.data() + (i * 32), 32);
        }
        return path;
    }

    merkle_tree::GetLowIndexedLeafResponse get_low_indexed_leaf(merkle_tree::MerkleTreeId tree_id, const fr& key) const
    {
        uint8_t is_present = 0;
        uint64_t index = 0;
        bb_wsref_get_low_indexed_leaf(handle_, id(tree_id), key.data(), &is_present, &index);
        return { is_present != 0, index };
    }

    fr get_leaf_value(merkle_tree::MerkleTreeId tree_id, uint64_t leaf_index) const
    {
        fr value;
        bb_wsref_get_leaf_value(handle_, id(tree_id), leaf_index, value.data());
        return value;
    }

    merkle_tree::IndexedLeaf<merkle_tree::NullifierLeafValue> get_nullifier_preimage(uint64_t leaf_index) const
    {
        merkle_tree::NullifierLeafValue leaf;
        uint64_t next_index = 0;
        fr next_key;
        bb_wsref_get_nullifier_preimage(handle_, leaf_index, leaf.nullifier.data(), &next_index, next_key.data());
        return { leaf, next_index, next_key };
    }

    merkle_tree::IndexedLeaf<merkle_tree::PublicDataLeafValue> get_public_data_preimage(uint64_t leaf_index) const
    {
        merkle_tree::PublicDataLeafValue leaf;
        uint64_t next_index = 0;
        fr next_key;
        bb_wsref_get_public_data_preimage(
            handle_, leaf_index, leaf.slot.data(), leaf.value.data(), &next_index, next_key.data());
        return { leaf, next_index, next_key };
    }

    void insert_nullifier(const fr& nullifier) { bb_wsref_insert_nullifier(handle_, nullifier.data()); }

    void insert_public_data(const fr& slot, const fr& value)
    {
        bb_wsref_insert_public_data(handle_, slot.data(), value.data());
    }

    void append_leaves(merkle_tree::MerkleTreeId tree_id, const std::vector<fr>& leaves)
    {
        std::vector<uint8_t> buffer(leaves.size() * 32);
        for (size_t i = 0; i < leaves.size(); ++i) {
            std::memcpy(buffer.data() + (i * 32), leaves[i].data(), 32);
        }
        bb_wsref_append_leaves(handle_, id(tree_id), buffer.data(), leaves.size());
    }

    void pad_tree(merkle_tree::MerkleTreeId tree_id, size_t num_leaves)
    {
        bb_wsref_pad_tree(handle_, id(tree_id), num_leaves);
    }

    void create_checkpoint() { bb_wsref_create_checkpoint(handle_); }
    void commit_checkpoint() { bb_wsref_commit_checkpoint(handle_); }
    void revert_checkpoint() { bb_wsref_revert_checkpoint(handle_); }
    uint32_t get_checkpoint_id() const { return bb_wsref_get_checkpoint_id(handle_); }

  private:
    static uint8_t id(merkle_tree::MerkleTreeId tree_id) { return static_cast<uint8_t>(tree_id); }

    static uint32_t tree_height(merkle_tree::MerkleTreeId tree_id)
    {
        switch (tree_id) {
        case merkle_tree::MerkleTreeId::NULLIFIER_TREE:
            return NULLIFIER_TREE_HEIGHT;
        case merkle_tree::MerkleTreeId::NOTE_HASH_TREE:
            return NOTE_HASH_TREE_HEIGHT;
        case merkle_tree::MerkleTreeId::PUBLIC_DATA_TREE:
            return PUBLIC_DATA_TREE_HEIGHT;
        case merkle_tree::MerkleTreeId::L1_TO_L2_MESSAGE_TREE:
            return L1_TO_L2_MSG_TREE_HEIGHT;
        default:
            return 0;
        }
    }

    void* handle_;
};

} // namespace azteclabs::wsdb
