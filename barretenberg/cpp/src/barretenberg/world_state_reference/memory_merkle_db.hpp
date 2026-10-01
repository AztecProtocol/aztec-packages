#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <span>
#include <stack>
#include <string>
#include <vector>

#include "barretenberg/aztec/aztec_hash_policy.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/world_state_reference/merkle_tree_id.hpp"
#include "barretenberg/world_state_reference/sparse_memory_tree.hpp"

namespace bb::world_state {

// crypto/merkle_tree vocabulary the reference trees are built on (aliased for brevity). These were
// previously reached through vm2's db.hpp; the reference references them directly to stay vm2-free.
using crypto::merkle_tree::GetLowIndexedLeafResponse;
using crypto::merkle_tree::IndexedLeaf;
using crypto::merkle_tree::NullifierLeafValue;
using crypto::merkle_tree::PublicDataLeafValue;
using crypto::merkle_tree::SequentialInsertionResult;
using numeric::uint256_t;
using SiblingPath = crypto::merkle_tree::fr_sibling_path;

/**
 * @brief Plain per-tree state descriptor (root + next free leaf index).
 *
 * Store-agnostic. The AVM's column-serialisable `bb::avm2::AppendOnlyTreeSnapshot` / `TreeSnapshots`
 * (vm2/common/aztec_types.hpp) are separate types; the vm2 adapter maps these onto them.
 */
struct TreeSnapshot {
    FF root = 0;
    uint64_t next_available_leaf_index = 0;
    bool operator==(const TreeSnapshot& other) const = default;
};

struct TreeRoots {
    TreeSnapshot l1_to_l2_message_tree;
    TreeSnapshot note_hash_tree;
    TreeSnapshot nullifier_tree;
    TreeSnapshot public_data_tree;
    bool operator==(const TreeRoots& other) const = default;
};

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

    TreeSnapshot get_snapshot() const
    {
        return TreeSnapshot{ .root = tree_.root(), .next_available_leaf_index = size_ };
    }

  private:
    SparseMemoryTree<HashingPolicy> tree_;
    uint64_t size_ = 0;
};

/**
 * @brief A full-height, sparse, indexed Merkle tree over a SparseMemoryTree.
 *
 * Used for the nullifier and public-data trees. The genesis state matches the WorldState's
 * ContentAddressedIndexedTree: `initial_size` prefill leaves, LeafType::padding(i) for the first
 * initial_size - prefilled.size() of them followed by `prefilled`, linked as an ascending chain.
 * Insert / low-leaf logic mirrors IndexedMemoryTree, but the backing is sparse so it works at full
 * tree height.
 */
template <typename LeafType, typename HashingPolicy> class MemoryIndexedTree {
  public:
    using Leaf = crypto::merkle_tree::IndexedLeaf<LeafType>;

    /**
     * @brief Why `prefilled` cannot seed a tree of `initial_size` leaves, or nullopt when it can.
     * @details The prefill must fit, and its keys must be strictly increasing and above the
     * padding keys, since the genesis leaves form one ascending chain.
     */
    static std::optional<std::string> check_prefill(size_t initial_size, std::span<const LeafType> prefilled)
    {
        if (initial_size < 2) {
            return "Indexed trees must have initial size > 1";
        }
        if (prefilled.size() > initial_size) {
            return "Number of prefilled values can't be more than initial size";
        }
        size_t num_padding = initial_size - prefilled.size();
        uint256_t previous =
            num_padding > 0 ? static_cast<uint256_t>(LeafType::padding(num_padding - 1).get_key()) : uint256_t(0);
        for (size_t i = 0; i < prefilled.size(); ++i) {
            uint256_t key = static_cast<uint256_t>(prefilled[i].get_key());
            if ((i > 0 || num_padding > 0) && key <= previous) {
                return i == 0 ? "Prefilled values must not be the same as the default values"
                              : "Prefilled values must be unique and sorted";
            }
            previous = key;
        }
        return std::nullopt;
    }

    MemoryIndexedTree(size_t depth, size_t initial_size, std::span<const LeafType> prefilled = {})
        : tree_(depth)
    {
        auto problem = check_prefill(initial_size, prefilled);
        BB_ASSERT(!problem.has_value(), problem.value_or(""));
        size_t num_padding = initial_size - prefilled.size();
        leaves_.reserve(initial_size);
        for (size_t i = 0; i < num_padding; ++i) {
            leaves_.push_back(Leaf(LeafType::padding(i), /*nextIndex=*/0, /*nextKey=*/0));
        }
        for (const auto& value : prefilled) {
            leaves_.push_back(Leaf(value, /*nextIndex=*/0, /*nextKey=*/0));
        }
        for (size_t i = 0; i < initial_size; ++i) {
            index_t next_index = i == (initial_size - 1) ? 0 : i + 1;
            leaves_[i].nextIndex = next_index;
            leaves_[i].nextKey = leaves_[static_cast<size_t>(next_index)].leaf.get_key();
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
        return leaves_[static_cast<size_t>(leaf_index)];
    }

    FF get_leaf_value(index_t leaf_index) const { return tree_.get_node(0, leaf_index); }

    SiblingPath get_sibling_path(index_t leaf_index) const { return tree_.get_sibling_path(leaf_index); }

    TreeSnapshot get_snapshot() const
    {
        return TreeSnapshot{ .root = tree_.root(), .next_available_leaf_index = leaves_.size() };
    }

    SequentialInsertionResult<LeafType> insert_indexed_leaf(const LeafType& leaf_to_insert)
    {
        SequentialInsertionResult<LeafType> result;

        FF key = leaf_to_insert.get_key();
        GetLowIndexedLeafResponse find_low_leaf_result = get_low_indexed_leaf(key);
        Leaf& low_leaf = leaves_[static_cast<size_t>(find_low_leaf_result.index)];

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
            throw_or_abort("Leaf is not updateable");
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
 * @brief Self-contained in-memory reference world state (four AVM trees).
 *
 * Holds the four AVM trees (note-hash and L1->L2 message as append-only, nullifier and public-data as
 * indexed) at full protocol height, hashing nodes with the same domain-separated Poseidon2 policies as
 * the WorldState and the AVM tree-check gadgets, so roots and sibling paths are consistent with both.
 * It is vm2-free: it exposes its own tight method surface; the AVM's `LowLevelMerkleDBInterface` is
 * satisfied by a thin adapter in vm2 that wraps this class.
 *
 * Checkpoints deep-copy the whole tree state onto a stack and restore on revert, mirroring
 * PureRawMerkleDB's checkpoint id semantics.
 */
class MemoryMerkleDB {
  public:
    using NullifierTree = MemoryIndexedTree<crypto::merkle_tree::NullifierLeafValue, aztec::NullifierMerkleHashPolicy>;
    using PublicDataTree =
        MemoryIndexedTree<crypto::merkle_tree::PublicDataLeafValue, aztec::PublicDataMerkleHashPolicy>;
    using NoteHashTree = MemoryAppendOnlyTree<aztec::AztecMerkleHashPolicy>;
    using L1ToL2MessageTree = MemoryAppendOnlyTree<aztec::AztecMerkleHashPolicy>;

    // Genesis prefill counts for the indexed trees. These match the values the WorldState is initialized
    // with in the fuzzer.
    static constexpr size_t DEFAULT_NULLIFIER_TREE_PREFILL = 128;
    static constexpr size_t DEFAULT_PUBLIC_DATA_TREE_PREFILL = 128;

    MemoryMerkleDB(size_t nullifier_tree_prefill = DEFAULT_NULLIFIER_TREE_PREFILL,
                   size_t public_data_tree_prefill = DEFAULT_PUBLIC_DATA_TREE_PREFILL,
                   std::span<const NullifierLeafValue> prefilled_nullifiers = {},
                   std::span<const PublicDataLeafValue> prefilled_public_data = {});

    TreeRoots get_tree_roots() const;

    SiblingPath get_sibling_path(MerkleTreeId tree_id, index_t leaf_index) const;
    GetLowIndexedLeafResponse get_low_indexed_leaf(MerkleTreeId tree_id, const FF& value) const;
    FF get_leaf_value(MerkleTreeId tree_id, index_t leaf_index) const;
    IndexedLeaf<PublicDataLeafValue> get_leaf_preimage_public_data_tree(index_t leaf_index) const;
    IndexedLeaf<NullifierLeafValue> get_leaf_preimage_nullifier_tree(index_t leaf_index) const;

    SequentialInsertionResult<PublicDataLeafValue> insert_indexed_leaves_public_data_tree(
        const PublicDataLeafValue& leaf_value);
    SequentialInsertionResult<NullifierLeafValue> insert_indexed_leaves_nullifier_tree(
        const NullifierLeafValue& leaf_value);
    void append_leaves(MerkleTreeId tree_id, std::span<const FF> leaves);
    void pad_tree(MerkleTreeId tree_id, size_t num_leaves);

    void create_checkpoint();
    void commit_checkpoint();
    void revert_checkpoint();
    uint32_t get_checkpoint_id() const;

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

} // namespace bb::world_state
