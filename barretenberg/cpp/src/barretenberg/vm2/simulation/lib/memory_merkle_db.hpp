#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

#include "barretenberg/crypto/merkle_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/world_state_reference/memory_merkle_db.hpp"

namespace bb::avm2::simulation {

/**
 * @brief AVM adapter over the vm2-free reference world state (bb::world_state::MemoryMerkleDB).
 *
 * Implements the AVM's LowLevelMerkleDBInterface by forwarding to the reference DB. The only translation
 * is get_tree_roots(): the reference returns a plain bb::world_state::TreeRoots, which this maps onto the
 * AVM's column-serialisable TreeSnapshots (whose set_snapshot_in_cols helper stays in vm2). Every other
 * method returns shared crypto/merkle_tree types and forwards 1:1.
 *
 * Copyable (the reference DB is copyable); consumers copy a seeded instance per transaction so the seed is
 * preserved across simulations.
 */
class MemoryMerkleDB final : public LowLevelMerkleDBInterface {
  public:
    static constexpr size_t DEFAULT_NULLIFIER_TREE_PREFILL =
        world_state::MemoryMerkleDB::DEFAULT_NULLIFIER_TREE_PREFILL;
    static constexpr size_t DEFAULT_PUBLIC_DATA_TREE_PREFILL =
        world_state::MemoryMerkleDB::DEFAULT_PUBLIC_DATA_TREE_PREFILL;

    MemoryMerkleDB(size_t nullifier_tree_prefill = DEFAULT_NULLIFIER_TREE_PREFILL,
                   size_t public_data_tree_prefill = DEFAULT_PUBLIC_DATA_TREE_PREFILL)
        : inner_(nullifier_tree_prefill, public_data_tree_prefill)
    {}

    // Wraps an existing reference DB (copying its state), so a seeded genesis can be adapted for the AVM.
    MemoryMerkleDB(const world_state::MemoryMerkleDB& inner)
        : inner_(inner)
    {}

    TreeSnapshots get_tree_roots() const override;

    SiblingPath get_sibling_path(MerkleTreeId tree_id, index_t leaf_index) const override
    {
        return inner_.get_sibling_path(tree_id, leaf_index);
    }
    GetLowIndexedLeafResponse get_low_indexed_leaf(MerkleTreeId tree_id, const FF& value) const override
    {
        return inner_.get_low_indexed_leaf(tree_id, value);
    }
    FF get_leaf_value(MerkleTreeId tree_id, index_t leaf_index) const override
    {
        return inner_.get_leaf_value(tree_id, leaf_index);
    }
    IndexedLeaf<PublicDataLeafValue> get_leaf_preimage_public_data_tree(index_t leaf_index) const override
    {
        return inner_.get_leaf_preimage_public_data_tree(leaf_index);
    }
    IndexedLeaf<NullifierLeafValue> get_leaf_preimage_nullifier_tree(index_t leaf_index) const override
    {
        return inner_.get_leaf_preimage_nullifier_tree(leaf_index);
    }

    SequentialInsertionResult<PublicDataLeafValue> insert_indexed_leaves_public_data_tree(
        const PublicDataLeafValue& leaf_value) override
    {
        return inner_.insert_indexed_leaves_public_data_tree(leaf_value);
    }
    SequentialInsertionResult<NullifierLeafValue> insert_indexed_leaves_nullifier_tree(
        const NullifierLeafValue& leaf_value) override
    {
        return inner_.insert_indexed_leaves_nullifier_tree(leaf_value);
    }
    void append_leaves(MerkleTreeId tree_id, std::span<const FF> leaves) override
    {
        inner_.append_leaves(tree_id, leaves);
    }
    void pad_tree(MerkleTreeId tree_id, size_t num_leaves) override { inner_.pad_tree(tree_id, num_leaves); }

    void create_checkpoint() override { inner_.create_checkpoint(); }
    void commit_checkpoint() override { inner_.commit_checkpoint(); }
    void revert_checkpoint() override { inner_.revert_checkpoint(); }
    uint32_t get_checkpoint_id() const override { return inner_.get_checkpoint_id(); }

  private:
    world_state::MemoryMerkleDB inner_;
};

} // namespace bb::avm2::simulation
