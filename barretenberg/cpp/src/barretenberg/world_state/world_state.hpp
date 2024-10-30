#pragma once

#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/crypto/merkle_tree/append_only_tree/content_addressed_append_only_tree.hpp"
#include "barretenberg/crypto/merkle_tree/hash.hpp"
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/content_addressed_indexed_tree.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_environment.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/cached_content_addressed_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/tree_meta.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/signal.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/world_state/fork.hpp"
#include "barretenberg/world_state/tree_with_store.hpp"
#include "barretenberg/world_state/types.hpp"
#include "barretenberg/world_state/world_state_stores.hpp"
#include "barretenberg/world_state_napi/message.hpp"
#include <algorithm>
#include <cstdint>
#include <exception>
#include <iterator>
#include <memory>
#include <optional>
#include <stdexcept>
#include <type_traits>
#include <unordered_map>
#include <variant>

namespace bb::world_state {

using crypto::merkle_tree::index_t;

template <typename LeafValueType> struct BatchInsertionResult {
    std::vector<crypto::merkle_tree::LowLeafWitnessData<LeafValueType>> low_leaf_witness_data;
    std::vector<std::pair<LeafValueType, size_t>> sorted_leaves;
    crypto::merkle_tree::fr_sibling_path subtree_path;

    MSGPACK_FIELDS(low_leaf_witness_data, sorted_leaves, subtree_path);
};

/**
 * @brief Holds the Merkle trees responsible for storing the state of the Aztec protocol.
 *
 * @note This class makes no checks against the rollup address being used. It is the responsibility of the caller to
 * erase the underlying data directory if the rollup address changes _before_ opening the database.
 */
class WorldState {
  public:
    WorldState(uint64_t thread_pool_size,
               const std::string& data_dir,
               uint64_t map_size,
               const std::unordered_map<MerkleTreeId, uint32_t>& tree_heights,
               const std::unordered_map<MerkleTreeId, index_t>& tree_prefill,
               uint32_t initial_header_generator_point);

    WorldState(uint64_t thread_pool_size,
               const std::string& data_dir,
               const std::unordered_map<MerkleTreeId, uint64_t>& map_size,
               const std::unordered_map<MerkleTreeId, uint32_t>& tree_heights,
               const std::unordered_map<MerkleTreeId, index_t>& tree_prefill,
               uint32_t initial_header_generator_point);

    /**
     * @brief Get tree metadata for a particular tree
     *
     * @param revision The revision to query
     * @param tree_id The ID of the tree
     * @return TreeInfo
     */
    crypto::merkle_tree::TreeMetaResponse get_tree_info(const WorldStateRevision& revision, MerkleTreeId tree_id) const;

    /**
     * @brief Gets the state reference for all the trees in the world state
     *
     * @param revision The revision to query
     * @return StateReference
     */
    StateReference get_state_reference(const WorldStateRevision& revision) const;

    /**
     * @brief Gets the initial state reference for all the trees in the world state
     *
     * @return StateReference
     */
    StateReference get_initial_state_reference() const;

    /**
     * @brief Get the sibling path object for a leaf in a tree
     *
     * @param revision The revision to query
     * @param tree_id The ID of the tree
     * @param leaf_index The index of the leaf
     * @return crypto::merkle_tree::fr_sibling_path
     */
    crypto::merkle_tree::fr_sibling_path get_sibling_path(const WorldStateRevision& revision,
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
    std::optional<crypto::merkle_tree::IndexedLeaf<T>> get_indexed_leaf(const WorldStateRevision& revision,
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
    std::optional<T> get_leaf(const WorldStateRevision& revision, MerkleTreeId tree_id, index_t leaf_index) const;

    /**
     * @brief Finds the leaf that would have its nextIdx/nextValue fields modified if the target leaf were to be
     * inserted into the tree. If the vlaue already exists in the tree, the leaf with the same value is returned.
     *
     * @param revision The revision to query
     * @param tree_id The ID of the tree
     * @param leaf_key The leaf to find the predecessor of
     * @return PredecessorInfo
     */
    crypto::merkle_tree::GetLowIndexedLeafResponse find_low_leaf_index(const WorldStateRevision& revision,
                                                                       MerkleTreeId tree_id,
                                                                       const bb::fr& leaf_key) const;

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
    std::optional<index_t> find_leaf_index(const WorldStateRevision& revision,
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
    template <typename T>
    void append_leaves(MerkleTreeId tree_id, const std::vector<T>& leaves, Fork::Id fork_id = CANONICAL_FORK_ID);

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
                                                        uint32_t subtree_depth,
                                                        Fork::Id fork_id = CANONICAL_FORK_ID);

    /**
     * @brief Updates a leaf in an existing Merkle Tree.
     *
     * @param new_value The new value of the leaf.
     */
    void update_public_data(const crypto::merkle_tree::PublicDataLeafValue& new_value,
                            Fork::Id fork_id = CANONICAL_FORK_ID);

    /**
     * @brief Updates the archive tree with a new block.
     *
     * @param block_state_ref The state reference of the block.
     * @param block_hash The hash of the block.
     * @param fork_id The fork ID to update.
     */
    void update_archive(const StateReference& block_state_ref,
                        const bb::fr& block_header_hash,
                        Fork::Id fork_id = CANONICAL_FORK_ID);

    /**
     * @brief Commits the current state of the world state.
     */
    bool commit();

    /**
     * @brief Rolls back any uncommitted changes made to the world state.
     */
    void rollback();

    uint64_t create_fork(const std::optional<index_t>& blockNumber);
    void delete_fork(const uint64_t& forkId);

    WorldStateStatus set_finalised_blocks(const index_t& toBlockNumber);
    WorldStateStatus unwind_blocks(const index_t& toBlockNumber);
    WorldStateStatus remove_historical_blocks(const index_t& toBlockNumber);

    void get_status(WorldStateStatus& status) const;
    WorldStateStatus sync_block(
        const StateReference& block_state_ref,
        const bb::fr& block_header_hash,
        const std::vector<bb::fr>& notes,
        const std::vector<bb::fr>& l1_to_l2_messages,
        const std::vector<crypto::merkle_tree::NullifierLeafValue>& nullifiers,
        const std::vector<std::vector<crypto::merkle_tree::PublicDataLeafValue>>& public_writes);

  private:
    std::shared_ptr<bb::ThreadPool> _workers;
    WorldStateStores::Ptr _persistentStores;

    std::unordered_map<MerkleTreeId, uint32_t> _tree_heights;
    std::unordered_map<MerkleTreeId, index_t> _initial_tree_size;
    mutable std::mutex mtx;
    std::unordered_map<uint64_t, Fork::SharedPtr> _forks;
    uint64_t _forkId = 0;
    uint32_t _initial_header_generator_point;

    TreeStateReference get_tree_snapshot(MerkleTreeId id);
    void create_canonical_fork(const std::string& dataDir,
                               const std::unordered_map<MerkleTreeId, uint64_t>& dbSize,
                               uint64_t maxReaders);

    Fork::SharedPtr retrieve_fork(const uint64_t& forkId) const;
    Fork::SharedPtr create_new_fork(const index_t& blockNumber);
    void remove_forks_for_block(const index_t& blockNumber);

    bool unwind_block(const index_t& blockNumber);
    bool remove_historical_block(const index_t& blockNumber);
    bool set_finalised_block(const index_t& blockNumber);

    static bool block_state_matches_world_state(const StateReference& block_state_ref,
                                                const StateReference& tree_state_ref);

    bool is_archive_tip(const WorldStateRevision& revision, const bb::fr& block_header_hash) const;

    bool is_same_state_reference(const WorldStateRevision& revision, const StateReference& state_ref) const;
    static bb::fr compute_initial_archive(const StateReference& initial_state_ref, uint32_t generator_point);

    static StateReference get_state_reference(const WorldStateRevision& revision,
                                              Fork::SharedPtr fork,
                                              bool initial_state = false);
};

template <typename T>
std::optional<crypto::merkle_tree::IndexedLeaf<T>> WorldState::get_indexed_leaf(const WorldStateRevision& rev,
                                                                                MerkleTreeId id,
                                                                                index_t leaf) const
{
    using Store = ContentAddressedCachedTreeStore<T>;
    using Tree = ContentAddressedIndexedTree<Store, HashPolicy>;

    Fork::SharedPtr fork = retrieve_fork(rev.forkId);

    if (auto* const wrapper = std::get_if<TreeWithStore<Tree>>(&fork->_trees.at(id))) {
        std::optional<IndexedLeaf<T>> value;
        Signal signal;
        auto callback = [&](const TypedResponse<GetIndexedLeafResponse<T>>& response) {
            if (response.inner.indexed_leaf.has_value()) {
                value = response.inner.indexed_leaf;
            }

            signal.signal_level(0);
        };

        if (rev.blockNumber) {
            wrapper->tree->get_leaf(leaf, rev.blockNumber, rev.includeUncommitted, callback);
        } else {
            wrapper->tree->get_leaf(leaf, rev.includeUncommitted, callback);
        }
        signal.wait_for_level();

        return value;
    }

    throw std::runtime_error("Invalid tree type");
}

template <typename T>
std::optional<T> WorldState::get_leaf(const WorldStateRevision& revision,
                                      MerkleTreeId tree_id,
                                      index_t leaf_index) const
{
    using namespace crypto::merkle_tree;

    Fork::SharedPtr fork = retrieve_fork(revision.forkId);

    std::optional<T> leaf;
    Signal signal;
    if constexpr (std::is_same_v<bb::fr, T>) {
        const auto& wrapper = std::get<TreeWithStore<FrTree>>(fork->_trees.at(tree_id));
        auto callback = [&signal, &leaf](const TypedResponse<GetLeafResponse>& resp) {
            if (resp.inner.leaf.has_value()) {
                leaf = resp.inner.leaf.value();
            }
            signal.signal_level();
        };

        if (revision.blockNumber) {
            wrapper.tree->get_leaf(leaf_index, revision.blockNumber, revision.includeUncommitted, callback);
        } else {
            wrapper.tree->get_leaf(leaf_index, revision.includeUncommitted, callback);
        }
    } else {
        using Store = ContentAddressedCachedTreeStore<T>;
        using Tree = ContentAddressedIndexedTree<Store, HashPolicy>;

        auto& wrapper = std::get<TreeWithStore<Tree>>(fork->_trees.at(tree_id));
        auto callback = [&signal, &leaf](const TypedResponse<GetIndexedLeafResponse<T>>& resp) {
            if (resp.inner.indexed_leaf.has_value()) {
                leaf = resp.inner.indexed_leaf.value().value;
            }
            signal.signal_level();
        };

        if (revision.blockNumber) {
            wrapper.tree->get_leaf(leaf_index, revision.blockNumber, revision.includeUncommitted, callback);
        } else {
            wrapper.tree->get_leaf(leaf_index, revision.includeUncommitted, callback);
        }
    }

    signal.wait_for_level();
    return leaf;
}

template <typename T>
std::optional<index_t> WorldState::find_leaf_index(const WorldStateRevision& rev,
                                                   MerkleTreeId id,
                                                   const T& leaf,
                                                   index_t start_index) const
{
    using namespace crypto::merkle_tree;
    std::optional<index_t> index;

    Fork::SharedPtr fork = retrieve_fork(rev.forkId);

    Signal signal;
    auto callback = [&](const TypedResponse<FindLeafIndexResponse>& response) {
        if (response.success) {
            index = response.inner.leaf_index;
        }
        signal.signal_level(0);
    };
    if constexpr (std::is_same_v<bb::fr, T>) {
        const auto& wrapper = std::get<TreeWithStore<FrTree>>(fork->_trees.at(id));
        if (rev.blockNumber) {
            wrapper.tree->find_leaf_index_from(leaf, start_index, rev.blockNumber, rev.includeUncommitted, callback);
        } else {
            wrapper.tree->find_leaf_index_from(leaf, start_index, rev.includeUncommitted, callback);
        }

    } else {
        using Store = ContentAddressedCachedTreeStore<T>;
        using Tree = ContentAddressedIndexedTree<Store, HashPolicy>;

        auto& wrapper = std::get<TreeWithStore<Tree>>(fork->_trees.at(id));
        if (rev.blockNumber) {
            wrapper.tree->find_leaf_index_from(leaf, rev.blockNumber, start_index, rev.includeUncommitted, callback);
        } else {
            wrapper.tree->find_leaf_index_from(leaf, start_index, rev.includeUncommitted, callback);
        }
    }

    signal.wait_for_level(0);
    return index;
}

template <typename T> void WorldState::append_leaves(MerkleTreeId id, const std::vector<T>& leaves, Fork::Id fork_id)
{
    using namespace crypto::merkle_tree;

    Fork::SharedPtr fork = retrieve_fork(fork_id);

    Signal signal;

    bool success = true;
    std::string error_msg;

    if constexpr (std::is_same_v<bb::fr, T>) {
        auto& wrapper = std::get<TreeWithStore<FrTree>>(fork->_trees.at(id));
        auto callback = [&](const auto& resp) {
            if (!resp.success) {
                success = false;
                error_msg = resp.message;
            }
            signal.signal_level(0);
        };
        wrapper.tree->add_values(leaves, callback);
    } else {
        using Store = ContentAddressedCachedTreeStore<T>;
        using Tree = ContentAddressedIndexedTree<Store, HashPolicy>;
        auto& wrapper = std::get<TreeWithStore<Tree>>(fork->_trees.at(id));
        typename Tree::AddCompletionCallback callback = [&](const auto& resp) {
            if (!resp.success) {
                success = false;
                error_msg = resp.message;
            }
            signal.signal_level(0);
        };
        wrapper.tree->add_or_update_values(leaves, 0, callback);
    }

    signal.wait_for_level(0);

    if (!success) {
        throw std::runtime_error("Failed to append leaves: " + error_msg);
    }
}

template <typename T>
BatchInsertionResult<T> WorldState::batch_insert_indexed_leaves(MerkleTreeId id,
                                                                const std::vector<T>& leaves,
                                                                uint32_t subtree_depth,
                                                                Fork::Id fork_id)
{
    using namespace crypto::merkle_tree;
    using Store = ContentAddressedCachedTreeStore<T>;
    using Tree = ContentAddressedIndexedTree<Store, HashPolicy>;

    Fork::SharedPtr fork = retrieve_fork(fork_id);

    Signal signal;
    BatchInsertionResult<T> result;
    const auto& wrapper = std::get<TreeWithStore<Tree>>(fork->_trees.at(id));
    bool success = true;
    std::string error_msg;

    wrapper.tree->add_or_update_values(
        leaves, subtree_depth, [&](const TypedResponse<AddIndexedDataResponse<T>>& response) {
            if (response.success) {
                result.low_leaf_witness_data = *response.inner.low_leaf_witness_data;
                result.sorted_leaves = *response.inner.sorted_leaves;
                result.subtree_path = response.inner.subtree_path;
            } else {
                success = false;
                error_msg = response.message;
            }

            signal.signal_level(0);
        });

    signal.wait_for_level();

    if (!success) {
        throw std::runtime_error("Failed to batch insert indexed leaves: " + error_msg);
    }

    return result;
}
} // namespace bb::world_state

MSGPACK_ADD_ENUM(bb::world_state::MerkleTreeId)
