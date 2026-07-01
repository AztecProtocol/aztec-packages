#pragma once

#include <cstddef>
#include <cstdint>
#include <span>
#include <stack>
#include <vector>

#include "barretenberg/aztec/aztec_hash_policy.hpp"
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/sparse_memory_tree.hpp"

namespace bb::avm2::simulation {

/**
 * @brief A full-height, sparse, append-only Merkle tree over a SparseMemoryTree.
 *
 * Used for the note-hash and L1->L2 message trees. Leaves are appended at increasing indices.
 */
template <typename HashingPolicy> class MemoryAppendOnlyTree {
  public:
    explicit MemoryAppendOnlyTree(size_t depth)
        : tree_(depth)
    {}

    void append_leaves(std::span<const FF> leaves)
    {
        for (const auto& leaf : leaves) {
            tree_.update_element(size_, leaf);
            ++size_;
        }
    }

    // Pads the tree with `num_leaves` zero leaves (advancing the size without changing any hashes,
    // since zero leaves collapse to the zero-subtree roots).
    void pad_leaves(size_t num_leaves) { size_ += num_leaves; }

    SiblingPath get_sibling_path(index_t leaf_index) const { return tree_.get_sibling_path(leaf_index); }

    FF get_leaf_value(index_t leaf_index) const { return tree_.get_node(0, leaf_index); }

    AppendOnlyTreeSnapshot get_snapshot() const
    {
        return AppendOnlyTreeSnapshot{ .root = tree_.root(), .next_available_leaf_index = size_ };
    }

  private:
    SparseMemoryTree<HashingPolicy> tree_;
    uint64_t size_ = 0;
};

/**
 * @brief A full-height, sparse, indexed Merkle tree over a SparseMemoryTree.
 *
 * Used for the nullifier and public-data trees. The genesis state matches the WorldState's
 * ContentAddressedIndexedTree: `initial_size` prefill leaves, all LeafType::padding(i) for i in
 * [0, initial_size), linked as an ascending chain. Insert / low-leaf logic mirrors
 * IndexedMemoryTree, but the backing is sparse so it works at full tree height.
 */
template <typename LeafType, typename HashingPolicy> class MemoryIndexedTree {
  public:
    using Leaf = crypto::merkle_tree::IndexedLeaf<LeafType>;

    MemoryIndexedTree(size_t depth, size_t initial_size)
        : tree_(depth)
    {
        BB_ASSERT_GT(initial_size, static_cast<size_t>(1), "Indexed trees must have initial size > 1");
        leaves_.reserve(initial_size);
        for (size_t i = 0; i < initial_size; ++i) {
            leaves_.push_back(Leaf(LeafType::padding(i), /*nextIndex=*/0, /*nextKey=*/0));
        }
        for (size_t i = 0; i < initial_size; ++i) {
            index_t next_index = i == (initial_size - 1) ? 0 : i + 1;
            leaves_[i].nextIndex = next_index;
            leaves_[i].nextKey = leaves_[next_index].leaf.get_key();
            tree_.update_element(i, HashingPolicy::hash(leaves_[i].get_hash_inputs()));
        }
    }

    GetLowIndexedLeafResponse get_low_indexed_leaf(const FF& key) const
    {
        uint256_t key_integer = static_cast<uint256_t>(key);
        uint256_t low_key_integer = 0;
        size_t low_index = 0;
        for (size_t i = 0; i < leaves_.size(); ++i) {
            uint256_t leaf_key_integer = static_cast<uint256_t>(leaves_[i].leaf.get_key());
            if (leaf_key_integer == key_integer) {
                return GetLowIndexedLeafResponse(true, i);
            }
            if (leaf_key_integer < key_integer && leaf_key_integer >= low_key_integer) {
                low_key_integer = leaf_key_integer;
                low_index = i;
            }
        }
        return GetLowIndexedLeafResponse(false, low_index);
    }

    Leaf get_leaf_preimage(index_t leaf_index) const
    {
        BB_ASSERT_LT(leaf_index, leaves_.size(), "Leaf index out of bounds");
        return leaves_[leaf_index];
    }

    FF get_leaf_value(index_t leaf_index) const { return tree_.get_node(0, leaf_index); }

    SiblingPath get_sibling_path(index_t leaf_index) const { return tree_.get_sibling_path(leaf_index); }

    AppendOnlyTreeSnapshot get_snapshot() const
    {
        return AppendOnlyTreeSnapshot{ .root = tree_.root(), .next_available_leaf_index = leaves_.size() };
    }

    SequentialInsertionResult<LeafType> insert_indexed_leaf(const LeafType& leaf_to_insert)
    {
        SequentialInsertionResult<LeafType> result;

        FF key = leaf_to_insert.get_key();
        GetLowIndexedLeafResponse find_low_leaf_result = get_low_indexed_leaf(key);
        Leaf& low_leaf = leaves_[find_low_leaf_result.index];

        result.low_leaf_witness_data.emplace_back(
            low_leaf, find_low_leaf_result.index, tree_.get_sibling_path(find_low_leaf_result.index));

        if (!find_low_leaf_result.is_already_present) {
            Leaf new_indexed_leaf(leaf_to_insert, low_leaf.nextIndex, low_leaf.nextKey);
            index_t insertion_index = leaves_.size();

            low_leaf.nextIndex = insertion_index;
            low_leaf.nextKey = key;
            tree_.update_element(find_low_leaf_result.index, HashingPolicy::hash(low_leaf.get_hash_inputs()));

            leaves_.push_back(new_indexed_leaf);
            tree_.update_element(insertion_index, HashingPolicy::hash(new_indexed_leaf.get_hash_inputs()));

            // The witness captures the leaf state *before* it was written (an empty slot), mirroring
            // ContentAddressedIndexedTree, where the update witness leaf is the original (pre-write) leaf.
            // The sibling path is unaffected by writing this leaf, so reading it after the write is correct.
            result.insertion_witness_data.emplace_back(
                Leaf::empty(), insertion_index, tree_.get_sibling_path(insertion_index));
        } else if (LeafType::is_updateable()) {
            low_leaf = Leaf(leaf_to_insert, low_leaf.nextIndex, low_leaf.nextKey);
            tree_.update_element(find_low_leaf_result.index, HashingPolicy::hash(low_leaf.get_hash_inputs()));
            result.insertion_witness_data.emplace_back(Leaf::empty(), 0, SiblingPath{});
        } else {
            throw std::runtime_error("Leaf is not updateable");
        }

        return result;
    }

    // Appends `num_leaves` empty leaves (used for nullifier-tree padding). Matching the WorldState's
    // batch insertion of empty leaves, an empty leaf hashes to zero (not hash({0,0,0})), so the only
    // observable effect is advancing the tree size; the root is left unchanged.
    void pad_leaves(size_t num_leaves)
    {
        for (size_t i = 0; i < num_leaves; ++i) {
            index_t insertion_index = leaves_.size();
            leaves_.push_back(Leaf::empty());
            tree_.update_element(insertion_index, FF::zero());
        }
    }

  private:
    SparseMemoryTree<HashingPolicy> tree_;
    std::vector<Leaf> leaves_;
};

/**
 * @brief Self-contained in-memory implementation of LowLevelMerkleDBInterface.
 *
 * Replaces the WorldState-backed PureRawMerkleDB used by the AVM differential fuzzer. Holds the four
 * AVM trees (note-hash and L1->L2 message as append-only, nullifier and public-data as indexed) at full
 * protocol height, hashing nodes with the same domain-separated Poseidon2 policies as the WorldState and
 * the AVM tree-check gadgets, so roots and sibling paths are consistent with both.
 *
 * Checkpoints deep-copy the whole tree state onto a stack and restore on revert, mirroring
 * PureRawMerkleDB's checkpoint id semantics.
 */
class MemoryMerkleDB final : public LowLevelMerkleDBInterface {
  public:
    using NullifierTree = MemoryIndexedTree<crypto::merkle_tree::NullifierLeafValue, aztec::NullifierMerkleHashPolicy>;
    using PublicDataTree =
        MemoryIndexedTree<crypto::merkle_tree::PublicDataLeafValue, aztec::PublicDataMerkleHashPolicy>;
    using NoteHashTree = MemoryAppendOnlyTree<aztec::AztecMerkleHashPolicy>;
    using L1ToL2MessageTree = MemoryAppendOnlyTree<aztec::AztecMerkleHashPolicy>;

    // Genesis prefill counts for the indexed trees. These match the values the WorldState is initialized
    // with in the fuzzer (see FuzzerWorldStateManager::initialize).
    static constexpr size_t DEFAULT_NULLIFIER_TREE_PREFILL = 128;
    static constexpr size_t DEFAULT_PUBLIC_DATA_TREE_PREFILL = 128;

    MemoryMerkleDB(size_t nullifier_tree_prefill = DEFAULT_NULLIFIER_TREE_PREFILL,
                   size_t public_data_tree_prefill = DEFAULT_PUBLIC_DATA_TREE_PREFILL);

    TreeSnapshots get_tree_roots() const override;

    SiblingPath get_sibling_path(MerkleTreeId tree_id, index_t leaf_index) const override;
    GetLowIndexedLeafResponse get_low_indexed_leaf(MerkleTreeId tree_id, const FF& value) const override;
    FF get_leaf_value(MerkleTreeId tree_id, index_t leaf_index) const override;
    IndexedLeaf<PublicDataLeafValue> get_leaf_preimage_public_data_tree(index_t leaf_index) const override;
    IndexedLeaf<NullifierLeafValue> get_leaf_preimage_nullifier_tree(index_t leaf_index) const override;

    SequentialInsertionResult<PublicDataLeafValue> insert_indexed_leaves_public_data_tree(
        const PublicDataLeafValue& leaf_value) override;
    SequentialInsertionResult<NullifierLeafValue> insert_indexed_leaves_nullifier_tree(
        const NullifierLeafValue& leaf_value) override;
    void append_leaves(MerkleTreeId tree_id, std::span<const FF> leaves) override;
    void pad_tree(MerkleTreeId tree_id, size_t num_leaves) override;

    void create_checkpoint() override;
    void commit_checkpoint() override;
    void revert_checkpoint() override;
    uint32_t get_checkpoint_id() const override;

  private:
    struct State {
        NullifierTree nullifier_tree;
        PublicDataTree public_data_tree;
        NoteHashTree note_hash_tree;
        L1ToL2MessageTree l1_to_l2_message_tree;
    };

    State state_;
    std::stack<State> checkpoints_;
    // Tracks checkpoint ids the same way PureRawMerkleDB did (push parent_id + 1 on create).
    std::stack<uint32_t> checkpoint_stack_{ { 0 } };
};

} // namespace bb::avm2::simulation
