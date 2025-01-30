#pragma once
#include "../hash_path.hpp"
#include "../node_store//tree_meta.hpp"
#include "../response.hpp"
#include "../types.hpp"
#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/signal.hpp"
#include "barretenberg/numeric/bitop/pow.hpp"
#include <cstddef>
#include <cstdint>
#include <exception>
#include <functional>
#include <iostream>
#include <memory>
#include <optional>
#include <ostream>
#include <random>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace bb::crypto::merkle_tree {

using namespace bb;

/**
 * @brief Implements a simple append-only merkle tree
 * All methods are asynchronous unless specified as otherwise
 * Accepts template arguments of the type of store backing the tree and the hashing policy
 * Accepts the store as an argument on construction as well as a thread pool instance
 * Asynchronous methods are exeucted on the provided thread pool
 *
 */
template <typename Store, typename HashingPolicy> class ContentAddressedAppendOnlyTree {
  public:
    using StoreType = Store;

    // Asynchronous methods accept these callback function types as arguments
    using AppendCompletionCallback = std::function<void(TypedResponse<AddDataResponse>&)>;
    using MetaDataCallback = std::function<void(TypedResponse<TreeMetaResponse>&)>;
    using HashPathCallback = std::function<void(TypedResponse<GetSiblingPathResponse>&)>;
    using FindLeafCallback = std::function<void(TypedResponse<FindLeafIndexResponse>&)>;
    using GetLeafCallback = std::function<void(TypedResponse<GetLeafResponse>&)>;
    using CommitCallback = std::function<void(TypedResponse<CommitResponse>&)>;
    using RollbackCallback = std::function<void(Response&)>;
    using RemoveHistoricBlockCallback = std::function<void(TypedResponse<RemoveHistoricResponse>&)>;
    using UnwindBlockCallback = std::function<void(TypedResponse<UnwindResponse>&)>;
    using FinaliseBlockCallback = std::function<void(Response&)>;
    using GetBlockForIndexCallback = std::function<void(TypedResponse<BlockForIndexResponse>&)>;

    // Only construct from provided store and thread pool, no copies or moves
    ContentAddressedAppendOnlyTree(std::unique_ptr<Store> store,
                                   std::shared_ptr<ThreadPool> workers,
                                   const std::vector<fr>& initial_values = {});
    ContentAddressedAppendOnlyTree(ContentAddressedAppendOnlyTree const& other) = delete;
    ContentAddressedAppendOnlyTree(ContentAddressedAppendOnlyTree&& other) = delete;
    ContentAddressedAppendOnlyTree& operator=(ContentAddressedAppendOnlyTree const& other) = delete;
    ContentAddressedAppendOnlyTree& operator=(ContentAddressedAppendOnlyTree const&& other) = delete;
    virtual ~ContentAddressedAppendOnlyTree() = default;

    /**
     * @brief Adds a single value to the end of the tree
     * @param value The value to be added
     * @param on_completion Callback to be called on completion
     */
    virtual void add_value(const fr& value, const AppendCompletionCallback& on_completion);

    /**
     * @brief Adds the given set of values to the end of the tree
     * @param values The values to be added
     * @param on_completion Callback to be called on completion
     */
    virtual void add_values(const std::vector<fr>& values, const AppendCompletionCallback& on_completion);

    /**
     * @brief Returns the sibling path from the leaf at the given index to the root
     * @param index The index at which to read the sibling path
     * @param on_completion Callback to be called on completion
     * @param includeUncommitted Whether to include uncommitted changes
     */
    void get_sibling_path(const index_t& index, const HashPathCallback& on_completion, bool includeUncommitted) const;

    /**
     * @brief Returns the sibling path from the leaf at the given index to the root
     * @param index The index at which to read the sibling path
     * @param blockNumber The block number of the tree to use as a reference
     * @param on_completion Callback to be called on completion
     * @param includeUncommitted Whether to include uncommitted changes
     */
    void get_sibling_path(const index_t& index,
                          const block_number_t& blockNumber,
                          const HashPathCallback& on_completion,
                          bool includeUncommitted) const;

    /**
     * @brief Get the subtree sibling path object
     *
     * @param subtree_depth The depth of the subtree
     * @param on_completion Callback to be called on completion
     * @param includeUncommitted Whether to include uncommitted changes
     */
    void get_subtree_sibling_path(uint32_t subtree_depth,
                                  const HashPathCallback& on_completion,
                                  bool includeUncommitted) const;

    /**
     * @brief Get the subtree sibling path object to a leaf
     *
     * @param leaf_index The depth of the subtree
     * @param subtree_depth The depth of the subtree
     * @param on_completion Callback to be called on completion
     * @param includeUncommitted Whether to include uncommitted changes
     */
    void get_subtree_sibling_path(const index_t& leaf_index,
                                  uint32_t subtree_depth,
                                  const HashPathCallback& on_completion,
                                  bool includeUncommitted) const;

    /**
     * @brief Returns the tree meta data
     * @param includeUncommitted Whether to include uncommitted changes
     * @param on_completion Callback to be called on completion
     */
    void get_meta_data(bool includeUncommitted, const MetaDataCallback& on_completion) const;

    /**
     * @brief Returns the tree meta data
     * @param blockNumber The block number of the tree to use as a reference
     * @param includeUncommitted Whether to include uncommitted changes
     * @param on_completion Callback to be called on completion
     */
    void get_meta_data(const block_number_t& blockNumber,
                       bool includeUncommitted,
                       const MetaDataCallback& on_completion) const;

    /**
     * @brief Returns the leaf value at the provided index
     * @param index The index of the leaf to be retrieved
     * @param includeUncommitted Whether to include uncommitted changes
     * @param on_completion Callback to be called on completion
     */
    void get_leaf(const index_t& index, bool includeUncommitted, const GetLeafCallback& completion) const;

    /**
     * @brief Returns the leaf value at the provided index
     * @param index The index of the leaf to be retrieved
     * @param blockNumber The block number of the tree to use as a reference
     * @param includeUncommitted Whether to include uncommitted changes
     * @param on_completion Callback to be called on completion
     */
    void get_leaf(const index_t& index,
                  const block_number_t& blockNumber,
                  bool includeUncommitted,
                  const GetLeafCallback& completion) const;

    /**
     * @brief Returns the index of the provided leaf in the tree
     */
    void find_leaf_indices(const std::vector<typename Store::LeafType>& leaves,
                           bool includeUncommitted,
                           const FindLeafCallback& on_completion) const;

    /**
     * @brief Returns the index of the provided leaf in the tree
     */
    void find_leaf_indices(const std::vector<typename Store::LeafType>& leaves,
                           const block_number_t& blockNumber,
                           bool includeUncommitted,
                           const FindLeafCallback& on_completion) const;

    /**
     * @brief Returns the index of the provided leaf in the tree only if it exists after the index value provided
     */
    void find_leaf_indices_from(const std::vector<typename Store::LeafType>& leaves,
                                const index_t& start_index,
                                bool includeUncommitted,
                                const FindLeafCallback& on_completion) const;

    /**
     * @brief Returns the index of the provided leaf in the tree only if it exists after the index value provided
     */
    void find_leaf_indices_from(const std::vector<typename Store::LeafType>& leaves,
                                const index_t& start_index,
                                const block_number_t& blockNumber,
                                bool includeUncommitted,
                                const FindLeafCallback& on_completion) const;

    /**
     * @brief Returns the block numbers that correspond to the given indices values
     */
    void find_block_numbers(const std::vector<index_t>& indices, const GetBlockForIndexCallback& on_completion) const;

    /**
     * @brief Returns the block numbers that correspond to the given indices values, from the perspective of a
     * historical block number
     */
    void find_block_numbers(const std::vector<index_t>& indices,
                            const block_number_t& blockNumber,
                            const GetBlockForIndexCallback& on_completion) const;

    /**
     * @brief Commit the tree to the backing store
     */
    void commit(const CommitCallback& on_completion);

    /**
     * @brief Rollback the uncommitted changes
     */
    void rollback(const RollbackCallback& on_completion);

    /**
     * @brief Synchronous method to retrieve the depth of the tree
     */
    uint32_t depth() const { return depth_; }

    void remove_historic_block(const block_number_t& blockNumber, const RemoveHistoricBlockCallback& on_completion);

    void unwind_block(const block_number_t& blockNumber, const UnwindBlockCallback& on_completion);

    void finalise_block(const block_number_t& blockNumber, const FinaliseBlockCallback& on_completion);

  protected:
    using ReadTransaction = typename Store::ReadTransaction;
    using ReadTransactionPtr = typename Store::ReadTransactionPtr;

    using OptionalSiblingPath = std::vector<std::optional<fr>>;

    fr_sibling_path optional_sibling_path_to_full_sibling_path(const OptionalSiblingPath& optionalPath) const;

    void add_values_internal(std::shared_ptr<std::vector<fr>> values,
                             fr& new_root,
                             index_t& new_size,
                             bool update_index);

    void add_values_internal(const std::vector<fr>& values,
                             const AppendCompletionCallback& on_completion,
                             bool update_index);

    OptionalSiblingPath get_subtree_sibling_path_internal(const index_t& leaf_index,
                                                          uint32_t subtree_depth,
                                                          const RequestContext& requestContext,
                                                          ReadTransaction& tx) const;

    std::optional<fr> find_leaf_hash(const index_t& leaf_index,
                                     const RequestContext& requestContext,
                                     ReadTransaction& tx,
                                     bool updateNodesByIndexCache = false) const;

    index_t get_batch_insertion_size(const index_t& treeSize, const index_t& remainingAppendSize);

    void add_batch_internal(
        std::vector<fr>& values, fr& new_root, index_t& new_size, bool update_index, ReadTransaction& tx);

    std::unique_ptr<Store> store_;
    uint32_t depth_;
    uint64_t max_size_;
    std::vector<fr> zero_hashes_;
    std::shared_ptr<ThreadPool> workers_;
};

template <typename Store, typename HashingPolicy>
ContentAddressedAppendOnlyTree<Store, HashingPolicy>::ContentAddressedAppendOnlyTree(
    std::unique_ptr<Store> store, std::shared_ptr<ThreadPool> workers, const std::vector<fr>& initial_values)
    : store_(std::move(store))
    , workers_(workers)
{
    TreeMeta meta;
    {
        // start by reading the meta data from the backing store
        ReadTransactionPtr tx = store_->create_read_transaction();
        store_->get_meta(meta, *tx, true);
    }
    depth_ = meta.depth;
    zero_hashes_.resize(depth_ + 1);

    // Create the zero hashes for the tree
    auto current = HashingPolicy::zero_hash();
    for (size_t i = depth_; i > 0; --i) {
        // std::cout << "Zero hash at " << i << " : " << current << std::endl;
        zero_hashes_[i] = current;
        current = HashingPolicy::hash_pair(current, current);
    }
    zero_hashes_[0] = current;
    // std::cout << "Zero root: " << current << std::endl;

    max_size_ = numeric::pow64(2, depth_);
    // if root is non-zero it means the tree has already been initialized
    if (meta.root != fr::zero()) {
        return;
    }

    // if the tree is empty then we want to write some initial state
    meta.initialRoot = meta.root = current;
    meta.initialSize = meta.size = 0;
    store_->put_meta(meta);
    TreeDBStats stats;
    store_->commit(meta, stats, false);

    // if we were given initial values to insert then we do that now
    if (!initial_values.empty()) {
        Signal signal(1);
        TypedResponse<AddDataResponse> result;
        add_values(initial_values, [&](const TypedResponse<AddDataResponse>& resp) {
            result = resp;
            signal.signal_level(0);
        });

        signal.wait_for_level(0);
        if (!result.success) {
            throw std::runtime_error(format("Failed to initialise tree: ", result.message));
        }

        {
            ReadTransactionPtr tx = store_->create_read_transaction();
            store_->get_meta(meta, *tx, true);
        }

        meta.initialRoot = meta.root = result.inner.root;
        meta.initialSize = meta.size = result.inner.size;

        store_->put_meta(meta);
        store_->commit(meta, stats, false);
    }
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::get_meta_data(bool includeUncommitted,
                                                                         const MetaDataCallback& on_completion) const
{
    auto job = [=, this]() {
        execute_and_report<TreeMetaResponse>(
            [=, this](TypedResponse<TreeMetaResponse>& response) {
                ReadTransactionPtr tx = store_->create_read_transaction();
                store_->get_meta(response.inner.meta, *tx, includeUncommitted);
            },
            on_completion);
    };
    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::get_meta_data(const block_number_t& blockNumber,
                                                                         bool includeUncommitted,
                                                                         const MetaDataCallback& on_completion) const
{
    auto job = [=, this]() {
        execute_and_report<TreeMetaResponse>(
            [=, this](TypedResponse<TreeMetaResponse>& response) {
                ReadTransactionPtr tx = store_->create_read_transaction();
                store_->get_meta(response.inner.meta, *tx, includeUncommitted);

                BlockPayload blockData;
                if (!store_->get_block_data(blockNumber, blockData, *tx)) {
                    throw std::runtime_error(
                        format("Unable to get meta data for block ", blockNumber, ", failed to get block data."));
                }

                response.inner.meta.size = blockData.size;
                response.inner.meta.committedSize = blockData.size;
                response.inner.meta.root = blockData.root;
            },
            on_completion);
    };
    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::get_sibling_path(const index_t& index,
                                                                            const HashPathCallback& on_completion,
                                                                            bool includeUncommitted) const
{
    get_subtree_sibling_path(index, 0, on_completion, includeUncommitted);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::get_sibling_path(const index_t& index,
                                                                            const block_number_t& blockNumber,
                                                                            const HashPathCallback& on_completion,
                                                                            bool includeUncommitted) const
{
    auto job = [=, this]() {
        execute_and_report<GetSiblingPathResponse>(
            [=, this](TypedResponse<GetSiblingPathResponse>& response) {
                if (blockNumber == 0) {
                    throw std::runtime_error("Unable to get sibling path at block 0");
                }
                ReadTransactionPtr tx = store_->create_read_transaction();
                BlockPayload blockData;
                if (!store_->get_block_data(blockNumber, blockData, *tx)) {
                    throw std::runtime_error(format("Unable to get sibling path for index ",
                                                    index,
                                                    " at block ",
                                                    blockNumber,
                                                    ", failed to get block data."));
                }

                RequestContext requestContext;
                requestContext.blockNumber = blockNumber;
                requestContext.includeUncommitted = includeUncommitted;
                requestContext.root = blockData.root;
                OptionalSiblingPath optional_path = get_subtree_sibling_path_internal(index, 0, requestContext, *tx);
                response.inner.path = optional_sibling_path_to_full_sibling_path(optional_path);
            },
            on_completion);
    };
    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::find_block_numbers(
    const std::vector<index_t>& indices, const GetBlockForIndexCallback& on_completion) const
{
    auto job = [=, this]() {
        execute_and_report<BlockForIndexResponse>(
            [=, this](TypedResponse<BlockForIndexResponse>& response) {
                response.inner.blockNumbers.reserve(indices.size());
                ReadTransactionPtr tx = store_->create_read_transaction();
                for (index_t index : indices) {
                    std::optional<block_number_t> block = store_->find_block_for_index(index, *tx);
                    response.inner.blockNumbers.emplace_back(block);
                }
            },
            on_completion);
    };
    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::find_block_numbers(
    const std::vector<index_t>& indices,
    const block_number_t& blockNumber,
    const GetBlockForIndexCallback& on_completion) const
{
    auto job = [=, this]() {
        execute_and_report<BlockForIndexResponse>(
            [=, this](TypedResponse<BlockForIndexResponse>& response) {
                response.inner.blockNumbers.reserve(indices.size());
                BlockPayload blockPayload;
                ReadTransactionPtr tx = store_->create_read_transaction();
                if (!store_->get_block_data(blockNumber, blockPayload, *tx)) {
                    throw std::runtime_error(format("Unable to find block numbers for indices for block ",
                                                    blockNumber,
                                                    ", failed to get block data."));
                }
                index_t maxIndex = blockPayload.size;
                for (index_t index : indices) {
                    bool outOfRange = index >= maxIndex;
                    std::optional<block_number_t> block =
                        outOfRange ? std::nullopt : store_->find_block_for_index(index, *tx);
                    response.inner.blockNumbers.emplace_back(block);
                }
            },
            on_completion);
    };
    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::get_subtree_sibling_path(
    uint32_t subtree_depth, const HashPathCallback& on_completion, bool includeUncommitted) const
{
    auto job = [=, this]() {
        execute_and_report<GetSiblingPathResponse>(
            [=, this](TypedResponse<GetSiblingPathResponse>& response) {
                ReadTransactionPtr tx = store_->create_read_transaction();
                TreeMeta meta;
                store_->get_meta(meta, *tx, includeUncommitted);
                RequestContext requestContext;
                requestContext.includeUncommitted = includeUncommitted;
                requestContext.root = store_->get_current_root(*tx, includeUncommitted);
                OptionalSiblingPath optional_path =
                    get_subtree_sibling_path_internal(meta.size, subtree_depth, requestContext, *tx);
                response.inner.path = optional_sibling_path_to_full_sibling_path(optional_path);
            },
            on_completion);
    };
    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::get_subtree_sibling_path(
    const index_t& leaf_index,
    uint32_t subtree_depth,
    const HashPathCallback& on_completion,
    bool includeUncommitted) const
{
    auto job = [=, this]() {
        execute_and_report<GetSiblingPathResponse>(
            [=, this](TypedResponse<GetSiblingPathResponse>& response) {
                ReadTransactionPtr tx = store_->create_read_transaction();
                RequestContext requestContext;
                requestContext.includeUncommitted = includeUncommitted;
                requestContext.root = store_->get_current_root(*tx, includeUncommitted);
                // std::cout << "Current root: " << requestContext.root << std::endl;
                OptionalSiblingPath optional_path =
                    get_subtree_sibling_path_internal(leaf_index, subtree_depth, requestContext, *tx);
                response.inner.path = optional_sibling_path_to_full_sibling_path(optional_path);
            },
            on_completion);
    };
    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
fr_sibling_path ContentAddressedAppendOnlyTree<Store, HashingPolicy>::optional_sibling_path_to_full_sibling_path(
    const ContentAddressedAppendOnlyTree<Store, HashingPolicy>::OptionalSiblingPath& optionalPath) const
{
    if (optionalPath.empty()) {
        return {};
    }
    fr_sibling_path path(optionalPath.size());
    size_t pathIndex = optionalPath.size() - 1;
    for (index_t level = 1; level <= optionalPath.size(); level++) {
        std::optional<fr> op = optionalPath[pathIndex];
        path[pathIndex] = op.has_value() ? op.value() : zero_hashes_[level];
        --pathIndex;
    }
    return path;
}

template <typename Store, typename HashingPolicy>
std::optional<fr> ContentAddressedAppendOnlyTree<Store, HashingPolicy>::find_leaf_hash(
    const index_t& leaf_index,
    const RequestContext& requestContext,
    ReadTransaction& tx,
    bool updateNodesByIndexCache) const
{
    fr hash = requestContext.root;
    // std::cout << "Finding leaf hash for root " << hash << " at index " << leaf_index << std::endl;
    index_t mask = static_cast<index_t>(1) << (depth_ - 1);
    index_t child_index_at_level = 0;
    for (uint32_t i = 0; i < depth_; ++i) {

        // Extract the node data
        NodePayload nodePayload;
        bool success = store_->get_node_by_hash(hash, nodePayload, tx, requestContext.includeUncommitted);
        if (!success) {
            // std::cout << "No root " << hash << std::endl;
            return std::nullopt;
        }
        // std::cout << "Found root at depth " << i << " : " << hash << std::endl;

        // Do we need to go right or left
        bool is_right = static_cast<bool>(leaf_index & mask);
        // std::cout << "Mask " << mask << " depth " << depth_ << std::endl;
        mask >>= 1;

        // If we don't have a child then this leaf isn't present
        // If we do, then keep going down the tree
        std::optional<fr> child = is_right ? nodePayload.right : nodePayload.left;

        if (!child.has_value()) {
            // std::cout << "No child" << std::endl;
            // We still need to update the cache with the sibling. The fact that under us there is an empty subtree
            // doesn't mean that same is happening with our sibling.
            if (updateNodesByIndexCache) {
                child_index_at_level = is_right ? (child_index_at_level * 2) + 1 : (child_index_at_level * 2);
                std::optional<fr> sibling = is_right ? nodePayload.left : nodePayload.right;
                index_t sibling_index_at_level = is_right ? child_index_at_level - 1 : child_index_at_level + 1;
                if (sibling.has_value()) {
                    store_->put_cached_node_by_index(i + 1, sibling_index_at_level, sibling.value(), false);
                }
            }
            return std::nullopt;
        }
        // std::cout << "Found child " << child.value() << std::endl;

        hash = child.value();

        if (!updateNodesByIndexCache) {
            continue;
        }

        child_index_at_level = is_right ? (child_index_at_level * 2) + 1 : (child_index_at_level * 2);
        // std::cout << "Storing child " << i + 1 << " : " << child_index_at_level << " is right " << is_right
        //           << std::endl;
        store_->put_cached_node_by_index(i + 1, child_index_at_level, hash, false);
        std::optional<fr> sibling = is_right ? nodePayload.left : nodePayload.right;
        index_t sibling_index_at_level = is_right ? child_index_at_level - 1 : child_index_at_level + 1;
        if (sibling.has_value()) {
            // std::cout << "Storing sibling " << i + 1 << " : " << sibling_index_at_level << " is right " <<
            // is_right
            //           << std::endl;
            store_->put_cached_node_by_index(i + 1, sibling_index_at_level, sibling.value(), false);
        }
    }

    // if we have arrived here then the leaf is in 'hash'
    return std::optional<fr>(hash);
}

template <typename Store, typename HashingPolicy>
ContentAddressedAppendOnlyTree<Store, HashingPolicy>::OptionalSiblingPath ContentAddressedAppendOnlyTree<
    Store,
    HashingPolicy>::get_subtree_sibling_path_internal(const index_t& leaf_index,
                                                      uint32_t subtree_depth,
                                                      const RequestContext& requestContext,
                                                      ReadTransaction& tx) const
{
    // skip the first levels, all the way to the subtree_root
    OptionalSiblingPath path;
    if (subtree_depth >= depth_) {
        return path;
    }
    path.resize(depth_ - subtree_depth);
    size_t path_index = path.size() - 1;

    index_t mask = index_t(1) << (depth_ - 1);
    // std::cout << "Depth: " << depth_ << ", mask: " << mask << ", sub tree depth: " << subtree_depth
    //           << ", leaf index: " << leaf_index << std::endl;
    fr hash = requestContext.root;
    // std::cout << "Getting sibling path for root: " << hash << std::endl;

    for (uint32_t level = 0; level < depth_ - subtree_depth; ++level) {
        NodePayload nodePayload;
        store_->get_node_by_hash(hash, nodePayload, tx, requestContext.includeUncommitted);
        bool is_right = static_cast<bool>(leaf_index & mask);
        // std::cout << "Level: " << level << ", mask: " << mask << ", is right: " << is_right << ", parent: " << hash
        //           << ", left has value: " << nodePayload.left.has_value()
        //           << ", right has value: " << nodePayload.right.has_value() << std::endl;
        // if (nodePayload.left.has_value()) {
        //     std::cout << "LEFT " << nodePayload.left.value() << std::endl;
        // }
        // if (nodePayload.right.has_value()) {
        //     std::cout << "RIGHT " << nodePayload.right.value() << std::endl;
        // }
        mask >>= 1;
        std::optional<fr> sibling = is_right ? nodePayload.left : nodePayload.right;
        std::optional<fr> child = is_right ? nodePayload.right : nodePayload.left;
        hash = child.has_value() ? child.value() : zero_hashes_[level + 1];
        // fr sib = (sibling.has_value() ? sibling.value() : zero_hashes_[level + 1]);
        // std::cout << "Pushed sibling: " << sib << ", hash: " << hash << ", path index " << path_index << std::endl;
        path[path_index--] = sibling;
    }

    return path;
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::get_leaf(const index_t& leaf_index,
                                                                    bool includeUncommitted,
                                                                    const GetLeafCallback& on_completion) const
{
    auto job = [=, this]() {
        execute_and_report<GetLeafResponse>(
            [=, this](TypedResponse<GetLeafResponse>& response) {
                ReadTransactionPtr tx = store_->create_read_transaction();
                RequestContext requestContext;
                requestContext.includeUncommitted = includeUncommitted;
                requestContext.root = store_->get_current_root(*tx, includeUncommitted);
                std::optional<fr> leaf_hash = find_leaf_hash(leaf_index, requestContext, *tx, false);
                response.success = leaf_hash.has_value();
                if (response.success) {
                    response.inner.leaf = leaf_hash.value();
                } else {
                    response.message = format("Failed to find leaf hash at index ", leaf_index);
                }
            },
            on_completion);
    };
    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::get_leaf(const index_t& leaf_index,
                                                                    const block_number_t& blockNumber,
                                                                    bool includeUncommitted,
                                                                    const GetLeafCallback& on_completion) const
{
    auto job = [=, this]() {
        execute_and_report<GetLeafResponse>(
            [=, this](TypedResponse<GetLeafResponse>& response) {
                if (blockNumber == 0) {
                    throw std::runtime_error("Unable to get leaf at block 0");
                }
                ReadTransactionPtr tx = store_->create_read_transaction();
                BlockPayload blockData;
                if (!store_->get_block_data(blockNumber, blockData, *tx)) {
                    throw std::runtime_error(format("Unable to get leaf at index ",
                                                    leaf_index,
                                                    " for block ",
                                                    blockNumber,
                                                    ", failed to get block data."));
                }
                if (blockData.size < leaf_index) {
                    response.message = format("Unable to get leaf at index ",
                                              leaf_index,
                                              " for block ",
                                              blockNumber,
                                              ", leaf index out of range.");
                    response.success = false;
                    return;
                }
                RequestContext requestContext;
                requestContext.blockNumber = blockNumber;
                requestContext.includeUncommitted = includeUncommitted;
                requestContext.root = blockData.root;
                std::optional<fr> leaf_hash = find_leaf_hash(leaf_index, requestContext, *tx, false);
                response.success = leaf_hash.has_value();
                if (response.success) {
                    response.inner.leaf = leaf_hash.value();
                } else {
                    response.message =
                        format("Failed to find leaf hash at index ", leaf_index, " for block number ", blockNumber);
                }
            },
            on_completion);
    };
    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::find_leaf_indices(
    const std::vector<typename Store::LeafType>& leaves,
    bool includeUncommitted,
    const FindLeafCallback& on_completion) const
{
    find_leaf_indices_from(leaves, 0, includeUncommitted, on_completion);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::find_leaf_indices(
    const std::vector<typename Store::LeafType>& leaves,
    const block_number_t& blockNumber,
    bool includeUncommitted,
    const FindLeafCallback& on_completion) const
{
    find_leaf_indices_from(leaves, 0, blockNumber, includeUncommitted, on_completion);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::find_leaf_indices_from(
    const std::vector<typename Store::LeafType>& leaves,
    const index_t& start_index,
    bool includeUncommitted,
    const FindLeafCallback& on_completion) const
{
    auto job = [=, this]() -> void {
        execute_and_report<FindLeafIndexResponse>(
            [=, this](TypedResponse<FindLeafIndexResponse>& response) {
                response.inner.leaf_indices.reserve(leaves.size());
                ReadTransactionPtr tx = store_->create_read_transaction();

                RequestContext requestContext;
                requestContext.includeUncommitted = includeUncommitted;

                for (const auto& leaf : leaves) {
                    std::optional<index_t> leaf_index =
                        store_->find_leaf_index_from(leaf, start_index, requestContext, *tx);
                    response.inner.leaf_indices.emplace_back(leaf_index);
                }
            },
            on_completion);
    };
    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::find_leaf_indices_from(
    const std::vector<typename Store::LeafType>& leaves,
    const index_t& start_index,
    const block_number_t& blockNumber,
    bool includeUncommitted,
    const FindLeafCallback& on_completion) const
{
    auto job = [=, this]() -> void {
        execute_and_report<FindLeafIndexResponse>(
            [=, this](TypedResponse<FindLeafIndexResponse>& response) {
                response.inner.leaf_indices.reserve(leaves.size());
                if (blockNumber == 0) {
                    throw std::runtime_error("Unable to find leaf index for block number 0");
                }
                ReadTransactionPtr tx = store_->create_read_transaction();
                BlockPayload blockData;
                if (!store_->get_block_data(blockNumber, blockData, *tx)) {
                    throw std::runtime_error(format("Unable to find leaf from index ",
                                                    start_index,
                                                    " for block ",
                                                    blockNumber,
                                                    ", failed to get block data."));
                }

                RequestContext requestContext;
                requestContext.blockNumber = blockNumber;
                requestContext.includeUncommitted = includeUncommitted;
                requestContext.maxIndex = blockData.size;

                for (const auto& leaf : leaves) {
                    std::optional<index_t> leaf_index =
                        store_->find_leaf_index_from(leaf, start_index, requestContext, *tx);
                    response.inner.leaf_indices.emplace_back(leaf_index);
                }
            },
            on_completion);
    };
    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::add_value(const fr& value,
                                                                     const AppendCompletionCallback& on_completion)
{
    add_values(std::vector<fr>{ value }, on_completion);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::add_values(const std::vector<fr>& values,
                                                                      const AppendCompletionCallback& on_completion)
{
    add_values_internal(values, on_completion, true);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::add_values_internal(
    const std::vector<fr>& values, const AppendCompletionCallback& on_completion, bool update_index)
{
    std::shared_ptr<std::vector<fr>> hashes = std::make_shared<std::vector<fr>>(values);
    auto append_op = [=, this]() -> void {
        execute_and_report<AddDataResponse>(
            [=, this](TypedResponse<AddDataResponse>& response) {
                add_values_internal(hashes, response.inner.root, response.inner.size, update_index);
            },
            on_completion);
    };
    workers_->enqueue(append_op);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::commit(const CommitCallback& on_completion)
{
    auto job = [=, this]() {
        execute_and_report<CommitResponse>(
            [=, this](TypedResponse<CommitResponse>& response) {
                store_->commit(response.inner.meta, response.inner.stats);
            },
            on_completion);
    };
    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::rollback(const RollbackCallback& on_completion)
{
    auto job = [=, this]() { execute_and_report([=, this]() { store_->rollback(); }, on_completion); };
    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::remove_historic_block(
    const block_number_t& blockNumber, const RemoveHistoricBlockCallback& on_completion)
{
    auto job = [=, this]() {
        execute_and_report<RemoveHistoricResponse>(
            [=, this](TypedResponse<RemoveHistoricResponse>& response) {
                if (blockNumber == 0) {
                    throw std::runtime_error("Unable to remove historic block 0");
                }
                store_->remove_historical_block(blockNumber, response.inner.meta, response.inner.stats);
            },
            on_completion);
    };
    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::unwind_block(const block_number_t& blockNumber,
                                                                        const UnwindBlockCallback& on_completion)
{
    auto job = [=, this]() {
        execute_and_report<UnwindResponse>(
            [=, this](TypedResponse<UnwindResponse>& response) {
                if (blockNumber == 0) {
                    throw std::runtime_error("Unable to unwind block 0");
                }
                store_->unwind_block(blockNumber, response.inner.meta, response.inner.stats);
            },
            on_completion);
    };
    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::finalise_block(const block_number_t& blockNumber,
                                                                          const FinaliseBlockCallback& on_completion)
{
    auto job = [=, this]() {
        execute_and_report(
            [=, this]() {
                if (blockNumber == 0) {
                    throw std::runtime_error("Unable to finalise block 0");
                }
                store_->advance_finalised_block(blockNumber);
            },
            on_completion);
    };
    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
index_t ContentAddressedAppendOnlyTree<Store, HashingPolicy>::get_batch_insertion_size(
    const index_t& treeSize, const index_t& remainingAppendSize)
{
    index_t minPower2 = 1;
    if (treeSize != 0U) {
        while (!(minPower2 & treeSize)) {
            minPower2 <<= 1;
        }
        if (minPower2 <= remainingAppendSize) {
            return minPower2;
        }
    }
    index_t maxPower2 = 1;
    while (maxPower2 <= remainingAppendSize) {
        maxPower2 <<= 1;
    }
    return maxPower2 >> 1;
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::add_values_internal(std::shared_ptr<std::vector<fr>> values,
                                                                               fr& new_root,
                                                                               index_t& new_size,
                                                                               bool update_index)
{
    ReadTransactionPtr tx = store_->create_read_transaction();
    TreeMeta meta;
    store_->get_meta(meta, *tx, true);
    index_t sizeToAppend = values->size();
    new_size = meta.size;
    index_t batchIndex = 0;
    while (sizeToAppend != 0U) {
        index_t batchSize = get_batch_insertion_size(new_size, sizeToAppend);
        sizeToAppend -= batchSize;
        int64_t start = static_cast<int64_t>(batchIndex);
        int64_t end = static_cast<int64_t>(batchIndex + batchSize);
        std::vector<fr> batch = std::vector<fr>(values->begin() + start, values->begin() + end);
        batchIndex += batchSize;
        add_batch_internal(batch, new_root, new_size, update_index, *tx);
    }
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::add_batch_internal(
    std::vector<fr>& values, fr& new_root, index_t& new_size, bool update_index, ReadTransaction& tx)
{
    uint32_t start_level = depth_;
    uint32_t level = start_level;
    std::vector<fr>& hashes_local = values;
    auto number_to_insert = static_cast<uint32_t>(hashes_local.size());

    TreeMeta meta;
    store_->get_meta(meta, tx, true);
    index_t index = meta.size;
    new_size = meta.size + number_to_insert;

    // std::cout << "Appending new leaves" << std::endl;
    if (values.empty()) {
        return;
    }

    if (new_size > max_size_) {
        throw std::runtime_error(
            format("Unable to append leaves to tree ", meta.name, " new size: ", new_size, " max size: ", max_size_));
    }

    // Add the values at the leaf nodes of the tree
    for (uint32_t i = 0; i < number_to_insert; ++i) {
        // write_node(level, index + i, hashes_local[i]);
        // std::cout << "Writing leaf hash: " << hashes_local[i] << " level " << level << std::endl;
        store_->put_node_by_hash(hashes_local[i], { .left = std::nullopt, .right = std::nullopt, .ref = 1 });
        store_->put_cached_node_by_index(level, i + index, hashes_local[i]);
    }

    // If we have been told to add these leaves to the index then do so now
    if (update_index) {
        for (uint32_t i = 0; i < number_to_insert; ++i) {
            // We don't store indices of zero leaves
            if (hashes_local[i] == fr::zero()) {
                continue;
            }
            // std::cout << "Updating index " << index + i << " : " << hashes_local[i] << std::endl;
            store_->update_index(index + i, hashes_local[i]);
        }
    }

    // Hash the values as a sub tree and insert them
    while (number_to_insert > 1) {
        number_to_insert >>= 1;
        index >>= 1;
        --level;
        // std::cout << "To INSERT " << number_to_insert << std::endl;
        for (uint32_t i = 0; i < number_to_insert; ++i) {
            fr left = hashes_local[i * 2];
            fr right = hashes_local[i * 2 + 1];
            hashes_local[i] = HashingPolicy::hash_pair(left, right);
            // std::cout << "Left: " << left << ", right: " << right << ", parent: " << hashes_local[i] << std::endl;
            store_->put_node_by_hash(hashes_local[i], { .left = left, .right = right, .ref = 1 });
            store_->put_cached_node_by_index(level, index + i, hashes_local[i]);
            // std::cout << "Writing node hash " << hashes_local[i] << " level " << level << " index " << index + i
            //           << std::endl;
        }
    }

    fr new_hash = hashes_local[0];

    // std::cout << "LEVEL: " << level << " hash " << new_hash << std::endl;
    RequestContext requestContext;
    requestContext.includeUncommitted = true;
    requestContext.root = store_->get_current_root(tx, true);
    OptionalSiblingPath optional_sibling_path_to_root =
        get_subtree_sibling_path_internal(meta.size, depth_ - level, requestContext, tx);
    fr_sibling_path sibling_path_to_root = optional_sibling_path_to_full_sibling_path(optional_sibling_path_to_root);
    size_t sibling_path_index = 0;

    // Hash from the root of the sub-tree to the root of the overall tree

    // std::cout << "Root hash: " << new_hash << std::endl;
    while (level > 0) {
        bool is_right = static_cast<bool>(index & 0x01);
        // std::cout << "index: " << index << " sibling path index: " << sibling_path_index << ", is right: " <<
        // is_right
        //           << std::endl;
        fr left_hash = is_right ? sibling_path_to_root[sibling_path_index] : new_hash;
        fr right_hash = is_right ? new_hash : sibling_path_to_root[sibling_path_index];

        std::optional<fr> left_op = is_right ? optional_sibling_path_to_root[sibling_path_index] : new_hash;
        std::optional<fr> right_op = is_right ? new_hash : optional_sibling_path_to_root[sibling_path_index];

        new_hash = HashingPolicy::hash_pair(left_hash, right_hash);
        // std::cout << "Left: " << left_hash << ", right: " << right_hash << ", parent: " << new_hash << std::endl;

        index >>= 1;
        --level;
        ++sibling_path_index;
        store_->put_cached_node_by_index(level, index, new_hash);
        store_->put_node_by_hash(new_hash, { .left = left_op, .right = right_op, .ref = 1 });
        // std::cout << "Writing node hash " << new_hash << " level " << level << " index " << index << std::endl;
    }

    new_root = new_hash;
    meta.root = new_hash;
    meta.size = new_size;
    // std::cout << "New size: " << meta.size << ", root " << meta.root << std::endl;
    store_->put_meta(meta);
}

} // namespace bb::crypto::merkle_tree
