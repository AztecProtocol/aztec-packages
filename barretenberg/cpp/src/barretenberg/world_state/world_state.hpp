#pragma once

#include "barretenberg/crypto/merkle_tree/append_only_tree/append_only_tree.hpp"
#include "barretenberg/crypto/merkle_tree/hash.hpp"
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_tree.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_environment.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_store.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/cached_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/tree_meta.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/signal.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/world_state/tree_with_store.hpp"
#include "barretenberg/world_state/types.hpp"
#include <algorithm>
#include <exception>
#include <iterator>
#include <optional>
#include <stdexcept>
#include <type_traits>
#include <unordered_map>
#include <variant>

namespace bb::world_state {

using crypto::merkle_tree::index_t;

using HashPolicy = crypto::merkle_tree::Poseidon2HashPolicy;

using FrStore = crypto::merkle_tree::CachedTreeStore<crypto::merkle_tree::LMDBStore, fr>;
using FrTree = crypto::merkle_tree::AppendOnlyTree<FrStore, HashPolicy>;

using NullifierStore =
    crypto::merkle_tree::CachedTreeStore<crypto::merkle_tree::LMDBStore, crypto::merkle_tree::NullifierLeafValue>;
using NullifierTree = crypto::merkle_tree::IndexedTree<NullifierStore, HashPolicy>;

using PublicDataStore =
    crypto::merkle_tree::CachedTreeStore<crypto::merkle_tree::LMDBStore, crypto::merkle_tree::PublicDataLeafValue>;
using PublicDataTree = crypto::merkle_tree::IndexedTree<PublicDataStore, HashPolicy>;

using Tree = std::variant<TreeWithStore<FrTree>, TreeWithStore<NullifierTree>, TreeWithStore<PublicDataTree>>;

template <typename LeafValueType> struct BatchInsertionResult {
    std::vector<crypto::merkle_tree::LowLeafWitnessData<LeafValueType>> low_leaf_witness_data;
    std::vector<std::pair<LeafValueType, size_t>> sorted_leaves;
    crypto::merkle_tree::fr_sibling_path subtree_path;

    MSGPACK_FIELDS(low_leaf_witness_data, sorted_leaves, subtree_path);
};

const uint NULLIFIER_TREE_HEIGHT = 20;
const uint NOTE_HASH_TREE_HEIGHT = 32;
const uint PUBLIC_DATA_TREE_HEIGHT = 40;
const uint L1_TO_L2_MSG_TREE_HEIGHT = 16;
const uint ARCHIVE_TREE_HEIGHT = 16;

class WorldState {
  public:
    WorldState(uint threads, const std::string& data_dir, uint map_size_kb);

    /**
     * @brief Get tree metadata for a particular tree
     *
     * @param revision The revision to query
     * @param tree_id The ID of the tree
     * @return TreeInfo
     */
    crypto::merkle_tree::TreeMetaResponse get_tree_info(WorldStateRevision revision, MerkleTreeId tree_id) const;

    /**
     * @brief Gets the state reference for all the trees in the world state
     *
     * @param revision The revision to query
     * @return StateReference
     */
    StateReference get_state_reference(WorldStateRevision revision) const;

    /**
     * @brief Get the sibling path object for a leaf in a tree
     *
     * @param revision The revision to query
     * @param tree_id The ID of the tree
     * @param leaf_index The index of the leaf
     * @return crypto::merkle_tree::fr_sibling_path
     */
    crypto::merkle_tree::fr_sibling_path get_sibling_path(WorldStateRevision revision,
                                                          MerkleTreeId tree_id,
                                                          index_t leaf_index) const;

    /**
     * @brief Get the leaf preimage object
     *
     * @tparam T the type of the leaf. Either NullifierLeafValue, PublicDataLeafValue
     * @param revision The revision to query
     * @param tree_id The ID of the tree
     * @param leaf_index The index of the leaf
     * @return std::optional<T> The IndexedLeaf object or nullopt if the leaf does not exist
     */
    template <typename T>
    std::optional<crypto::merkle_tree::IndexedLeaf<T>> get_indexed_leaf(WorldStateRevision revision,
                                                                        MerkleTreeId tree_id,
                                                                        index_t leaf_index) const;

    /**
     * @brief Gets the value of a leaf in a tree
     *
     * @tparam T the type of the leaf. Either bb::fr, NullifierLeafValue, PublicDataLeafValue
     * @param revision The revision to query
     * @param tree_id The ID of the tree
     * @param leaf_index The index of the leaf
     * @return std::optional<T> The value of the leaf or nullopt if the leaf does not exist
     */
    template <typename T>
    std::optional<T> get_leaf(WorldStateRevision revision, MerkleTreeId tree_id, index_t leaf_index) const;

    /**
     * @brief Finds the leaf that would have its nextIdx/nextValue fields modified if the target leaf were to be
     * inserted into the tree. If the vlaue already exists in the tree, the leaf with the same value is returned.
     *
     * @param revision The revision to query
     * @param tree_id The ID of the tree
     * @param leaf_key The leaf to find the predecessor of
     * @return PredecessorInfo
     */
    std::pair<bool, index_t> find_low_leaf_index(WorldStateRevision revision, MerkleTreeId tree_id, fr leaf_key) const;

    /**
     * @brief Finds the index of a leaf in a tree
     *
     * @param revision The revision to query
     * @param tree_id The ID of the tree
     * @param leaf The leaf to find
     * @param start_index The index to start searching from
     * @return std::optional<index_t>
     */
    template <typename T>
    std::optional<index_t> find_leaf_index(WorldStateRevision revision,
                                           MerkleTreeId tree_id,
                                           const T& leaf,
                                           index_t start_index = 0) const;

    /**
     * @brief Appends a set of leaves to an existing Merkle Tree.
     *
     * @tparam T The type of the leaves.
     * @param tree_id The ID of the Merkle Tree.
     * @param leaves The leaves to append.
     */
    template <typename T> void append_leaves(MerkleTreeId tree_id, const std::vector<T>& leaves);

    /**
     * @brief Batch inserts a set of leaves into an indexed Merkle Tree.
     *
     * @tparam T The type of the leaves.
     * @param tree_id The ID of the Merkle Tree.
     * @param leaves The leaves to insert.
     * @return BatchInsertionResult<T>
     */
    template <typename T>
    BatchInsertionResult<T> batch_insert_indexed_leaves(MerkleTreeId tree_id,
                                                        const std::vector<T>& leaves,
                                                        uint32_t subtree_depth);

    /**
     * @brief Updates a leaf in an existing Merkle Tree.
     *
     * @param new_value The new value of the leaf.
     */
    void update_public_data(const crypto::merkle_tree::PublicDataLeafValue& new_value);

    /**
     * @brief Commits the current state of the world state.
     */
    void commit();

    /**
     * @brief Rolls back any uncommitted changes made to the world state.
     */
    void rollback();

    /**
     * @brief Synchronizes the world state with a new block.
     *
     * @param block The block to synchronize with.
     */
    bool sync_block(StateReference& block_state_ref,
                    fr block_hash,
                    const std::vector<bb::fr>& notes,
                    const std::vector<bb::fr>& l1_to_l2_messages,
                    const std::vector<crypto::merkle_tree::NullifierLeafValue>& nullifiers,
                    const std::vector<std::vector<crypto::merkle_tree::PublicDataLeafValue>>& public_writes);

  private:
    std::unique_ptr<crypto::merkle_tree::LMDBEnvironment> _lmdb_env;
    std::unordered_map<MerkleTreeId, Tree> _trees;
    bb::ThreadPool _workers;
    // Guards state reference access, flagged as mutable as used in otherwise const methods
    mutable std::mutex state_ref_mutex;

    TreeStateReference get_tree_snapshot(MerkleTreeId id);

    static bool include_uncommitted(WorldStateRevision rev);
    static bool block_state_matches_world_state(const StateReference& block_state_ref,
                                                const StateReference& tree_state_ref);
};

template <typename T>
std::optional<crypto::merkle_tree::IndexedLeaf<T>> WorldState::get_indexed_leaf(const WorldStateRevision rev,
                                                                                MerkleTreeId id,
                                                                                index_t leaf) const
{
    using namespace crypto::merkle_tree;
    using Store = CachedTreeStore<LMDBStore, T>;
    using Tree = IndexedTree<Store, HashPolicy>;

    if (auto* const wrapper = std::get_if<TreeWithStore<Tree>>(&_trees.at(id))) {
        std::optional<IndexedLeaf<T>> value;
        Signal signal;
        auto callback = [&](const TypedResponse<GetIndexedLeafResponse<T>>& response) {
            if (response.inner.indexed_leaf.has_value()) {
                value = response.inner.indexed_leaf;
            }

            signal.signal_level(0);
        };

        wrapper->tree->get_leaf(leaf, include_uncommitted(rev), callback);
        signal.wait_for_level();

        return value;
    }

    throw std::runtime_error("Invalid tree type");
}

template <typename T>
std::optional<T> WorldState::get_leaf(const WorldStateRevision revision, MerkleTreeId tree_id, index_t leaf_index) const
{
    using namespace crypto::merkle_tree;

    bool uncommitted = include_uncommitted(revision);
    std::optional<T> leaf;
    Signal signal;
    if constexpr (std::is_same_v<bb::fr, T>) {
        const auto& wrapper = std::get<TreeWithStore<FrTree>>(_trees.at(tree_id));
        wrapper.tree->get_leaf(leaf_index, uncommitted, [&signal, &leaf](const TypedResponse<GetLeafResponse>& resp) {
            if (resp.inner.leaf.has_value()) {
                leaf = resp.inner.leaf.value();
            }
            signal.signal_level();
        });
    } else {
        using Store = CachedTreeStore<LMDBStore, T>;
        using Tree = IndexedTree<Store, HashPolicy>;

        auto& wrapper = std::get<TreeWithStore<Tree>>(_trees.at(tree_id));
        wrapper.tree->get_leaf(
            leaf_index, uncommitted, [&signal, &leaf](const TypedResponse<GetIndexedLeafResponse<T>>& resp) {
                if (resp.inner.indexed_leaf.has_value()) {
                    leaf = resp.inner.indexed_leaf.value().value;
                }
                signal.signal_level();
            });
    }

    signal.wait_for_level();
    return leaf;
}

template <typename T>
std::optional<index_t> WorldState::find_leaf_index(const WorldStateRevision rev,
                                                   MerkleTreeId id,
                                                   const T& leaf,
                                                   index_t start_index) const
{
    using namespace crypto::merkle_tree;
    bool uncommitted = include_uncommitted(rev);
    std::optional<index_t> index;

    Signal signal;
    auto callback = [&](const TypedResponse<FindLeafIndexResponse>& response) {
        if (response.success) {
            index = response.inner.leaf_index;
        }
        signal.signal_level(0);
    };
    if constexpr (std::is_same_v<bb::fr, T>) {
        const auto& wrapper = std::get<TreeWithStore<FrTree>>(_trees.at(id));
        wrapper.tree->find_leaf_index_from(leaf, start_index, uncommitted, callback);
    } else {
        using Store = CachedTreeStore<LMDBStore, T>;
        using Tree = IndexedTree<Store, HashPolicy>;

        auto& wrapper = std::get<TreeWithStore<Tree>>(_trees.at(id));
        wrapper.tree->find_leaf_index_from(leaf, start_index, uncommitted, callback);
    }

    signal.wait_for_level(0);
    return index;
}

template <typename T> void WorldState::append_leaves(MerkleTreeId id, const std::vector<T>& leaves)
{
    using namespace crypto::merkle_tree;

    Signal signal;

    bool success = false;
    auto callback = [&signal, &success](const auto& resp) {
        success = resp.success;
        signal.signal_level(0);
    };

    if constexpr (std::is_same_v<bb::fr, T>) {
        auto& wrapper = std::get<TreeWithStore<FrTree>>(_trees.at(id));
        wrapper.tree->add_values(leaves, callback);
    } else {
        using Store = CachedTreeStore<LMDBStore, T>;
        using Tree = IndexedTree<Store, HashPolicy>;
        auto& wrapper = std::get<TreeWithStore<Tree>>(_trees.at(id));
        wrapper.tree->add_or_update_values(leaves, 0, callback);
    }

    signal.wait_for_level(0);

    if (!success) {
        throw std::runtime_error("Failed to append leaves");
    }
}

template <typename T>
BatchInsertionResult<T> WorldState::batch_insert_indexed_leaves(MerkleTreeId id,
                                                                const std::vector<T>& leaves,
                                                                uint32_t subtree_depth)
{
    using namespace crypto::merkle_tree;
    using Store = CachedTreeStore<LMDBStore, T>;
    using Tree = IndexedTree<Store, HashPolicy>;

    Signal signal;
    BatchInsertionResult<T> result;
    const auto& wrapper = std::get<TreeWithStore<Tree>>(_trees.at(id));
    bool success = false;
    std::string error_msg;

    wrapper.tree->add_or_update_values(
        leaves, subtree_depth, [&](const TypedResponse<AddIndexedDataResponse<T>>& response) {
            success = response.success;
            if (!response.success) {
                error_msg = response.message;
                return;
            }

            result.low_leaf_witness_data.reserve(response.inner.low_leaf_witness_data->size());
            std::copy(response.inner.low_leaf_witness_data->begin(),
                      response.inner.low_leaf_witness_data->end(),
                      std::back_inserter(result.low_leaf_witness_data));

            result.sorted_leaves.reserve(response.inner.sorted_leaves->size());
            std::copy(response.inner.sorted_leaves->begin(),
                      response.inner.sorted_leaves->end(),
                      std::back_inserter(result.sorted_leaves));

            result.subtree_path = response.inner.subtree_path;

            signal.signal_level(0);
        });

    signal.wait_for_level();

    if (!success) {
        throw std::runtime_error(error_msg);
    }

    return result;
}
} // namespace bb::world_state

MSGPACK_ADD_ENUM(bb::world_state::MerkleTreeId)
