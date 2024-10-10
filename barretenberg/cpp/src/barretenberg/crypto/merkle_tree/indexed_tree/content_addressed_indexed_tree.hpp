#pragma once
#include "../hash.hpp"
#include "../hash_path.hpp"
#include "../signal.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/crypto/merkle_tree/append_only_tree/content_addressed_append_only_tree.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/cached_content_addressed_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/tree_meta.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "indexed_leaf.hpp"
#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <exception>
#include <functional>
#include <iostream>
#include <memory>
#include <mutex>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

namespace bb::crypto::merkle_tree {

/**
 * @brief Implements a parallelised batch insertion indexed tree
 * Accepts template argument of the type of store backing the tree, the type of store containing the leaves and the
 * hashing policy
 * All public methods are asynchronous unless marked otherwise
 */
template <typename Store, typename HashingPolicy>
class ContentAddressedIndexedTree : public ContentAddressedAppendOnlyTree<Store, HashingPolicy> {
  public:
    using StoreType = Store;

    // The public methods accept these function types as asynchronous callbacks
    using LeafValueType = typename Store::LeafType;
    using IndexedLeafValueType = typename Store::IndexedLeafValueType;
    using AddCompletionCallbackWithWitness =
        std::function<void(const TypedResponse<AddIndexedDataResponse<LeafValueType>>&)>;
    using AddCompletionCallback = std::function<void(const TypedResponse<AddDataResponse>&)>;
    using LeafCallback = std::function<void(const TypedResponse<GetIndexedLeafResponse<LeafValueType>>&)>;
    using FindLowLeafCallback = std::function<void(const TypedResponse<GetLowIndexedLeafResponse>&)>;

    ContentAddressedIndexedTree(std::unique_ptr<Store> store,
                                std::shared_ptr<ThreadPool> workers,
                                index_t initial_size);
    ContentAddressedIndexedTree(ContentAddressedIndexedTree const& other) = delete;
    ContentAddressedIndexedTree(ContentAddressedIndexedTree&& other) = delete;
    ~ContentAddressedIndexedTree() = default;
    ContentAddressedIndexedTree& operator=(const ContentAddressedIndexedTree& other) = delete;
    ContentAddressedIndexedTree& operator=(ContentAddressedIndexedTree&& other) = delete;

    /**
     * @brief Adds or updates a single values in the tree (updates not currently supported)
     */
    void add_or_update_value(const LeafValueType& value, const AddCompletionCallbackWithWitness& completion);

    /**
     * @brief Adds or updates the given set of values in the tree (updates not currently supported)
     * @param values The values to be added or updated
     * @param completion The callback to be triggered once the values have been added
     */
    void add_or_update_values(const std::vector<LeafValueType>& values,
                              const AddCompletionCallbackWithWitness& completion);

    /**
     * @brief Adds or updates the given set of values in the tree
     * @param values The values to be added or updated
     * @param subtree_depth The height of the subtree to be inserted.
     * @param completion The callback to be triggered once the values have been added
     */
    void add_or_update_values(const std::vector<LeafValueType>& values,
                              uint32_t subtree_depth,
                              const AddCompletionCallbackWithWitness& completion);

    /**
     * @brief Adds or updates a single values in the tree (updates not currently supported)
     */
    void add_or_update_value(const LeafValueType& value, const AddCompletionCallback& completion);

    /**
     * @brief Adds or updates the given set of values in the tree
     * @param values The values to be added or updated
     * @param completion The callback to be triggered once the values have been added
     */
    void add_or_update_values(const std::vector<LeafValueType>& values, const AddCompletionCallback& completion);

    /**
     * @brief Adds or updates the given set of values in the tree (updates not currently supported)
     * @param values The values to be added or updated
     * @param subtree_depth The height of the subtree to be inserted.
     * @param completion The callback to be triggered once the values have been added
     */
    void add_or_update_values(const std::vector<LeafValueType>& values,
                              uint32_t subtree_depth,
                              const AddCompletionCallback& completion);

    void get_leaf(const index_t& index, bool includeUncommitted, const LeafCallback& completion) const;

    /**
     * @brief Find the index of the provided leaf value if it exists
     */
    void find_leaf_index(
        const LeafValueType& leaf,
        bool includeUncommitted,
        const ContentAddressedAppendOnlyTree<Store, HashingPolicy>::FindLeafCallback& on_completion) const;

    /**
     * @brief Find the index of the provided leaf value if it exists, only considers indexed beyond the value provided
     */
    void find_leaf_index_from(
        const LeafValueType& leaf,
        index_t start_index,
        bool includeUncommitted,
        const ContentAddressedAppendOnlyTree<Store, HashingPolicy>::FindLeafCallback& on_completion) const;

    /**
     * @brief Find the leaf with the value immediately lower then the value provided
     */
    void find_low_leaf(const fr& leaf_key, bool includeUncommitted, const FindLowLeafCallback& on_completion) const;

    void get_leaf(const index_t& index,
                  const index_t& blockNumber,
                  bool includeUncommitted,
                  const LeafCallback& completion) const;

    /**
     * @brief Find the index of the provided leaf value if it exists
     */
    void find_leaf_index(
        const LeafValueType& leaf,
        const index_t& blockNumber,
        bool includeUncommitted,
        const ContentAddressedAppendOnlyTree<Store, HashingPolicy>::FindLeafCallback& on_completion) const;

    /**
     * @brief Find the index of the provided leaf value if it exists, only considers indexed beyond the value provided
     */
    void find_leaf_index_from(
        const LeafValueType& leaf,
        const index_t& blockNumber,
        index_t start_index,
        bool includeUncommitted,
        const ContentAddressedAppendOnlyTree<Store, HashingPolicy>::FindLeafCallback& on_completion) const;

    /**
     * @brief Find the leaf with the value immediately lower then the value provided
     */
    void find_low_leaf(const fr& leaf_key,
                       const index_t& blockNumber,
                       bool includeUncommitted,
                       const FindLowLeafCallback& on_completion) const;

    using ContentAddressedAppendOnlyTree<Store, HashingPolicy>::get_sibling_path;

  private:
    using typename ContentAddressedAppendOnlyTree<Store, HashingPolicy>::AppendCompletionCallback;
    using ReadTransaction = typename Store::ReadTransaction;
    using ReadTransactionPtr = typename Store::ReadTransactionPtr;

    struct Status {
        std::atomic_bool success{ true };
        std::string message;

        void set_failure(const std::string& msg)
        {
            if (success.exchange(false)) {
                message = msg;
            }
        }
    };

    struct LeafInsertion {
        index_t low_leaf_index;
        IndexedLeafValueType low_leaf, original_low_leaf;
    };

    void update_leaf_and_hash_to_root(const index_t& index,
                                      const IndexedLeafValueType& leaf,
                                      Signal& leader,
                                      Signal& follower,
                                      fr_sibling_path& previous_sibling_path);

    std::pair<bool, fr> sparse_batch_update(const index_t& start_index,
                                            const index_t& num_leaves_to_be_inserted,
                                            const uint32_t& root_level,
                                            const std::vector<LeafInsertion>& insertions);

    void sparse_batch_update(const std::vector<std::pair<index_t, fr>>& hashes_at_level, uint32_t level);

    /**
     * @brief Adds or updates the given set of values in the tree
     * @param values The values to be added or updated
     * @param subtree_depth The height of the subtree to be inserted.
     * @param completion The callback to be triggered once the values have been added
     * @param capture_witness Whether or not we should capture the low-leaf witnesses
     */
    void add_or_update_values_internal(const std::vector<LeafValueType>& values,
                                       uint32_t subtree_depth,
                                       const AddCompletionCallbackWithWitness& completion,
                                       bool capture_witness);

    struct InsertionGenerationResponse {
        std::shared_ptr<std::vector<LeafInsertion>> insertions;
        std::shared_ptr<std::vector<IndexedLeafValueType>> indexed_leaves;
        index_t highest_index;
    };

    using InsertionGenerationCallback = std::function<void(const TypedResponse<InsertionGenerationResponse>&)>;
    void generate_insertions(const std::shared_ptr<std::vector<std::pair<LeafValueType, index_t>>>& values_to_be_sorted,
                             const InsertionGenerationCallback& completion);

    struct InsertionCompletionResponse {
        std::shared_ptr<std::vector<LowLeafWitnessData<LeafValueType>>> low_leaf_witness_data;
    };

    using InsertionCompletionCallback = std::function<void(const TypedResponse<InsertionCompletionResponse>&)>;
    void perform_insertions(size_t total_leaves,
                            std::shared_ptr<std::vector<LeafInsertion>> insertions,
                            const InsertionCompletionCallback& completion);
    void perform_insertions_without_witness(index_t highest_index,
                                            std::shared_ptr<std::vector<LeafInsertion>> insertions,
                                            const InsertionCompletionCallback& completion);

    struct HashGenerationResponse {
        std::shared_ptr<std::vector<fr>> hashes;
    };

    using HashGenerationCallback = std::function<void(const TypedResponse<HashGenerationResponse>&)>;
    void generate_hashes_for_appending(std::shared_ptr<std::vector<IndexedLeafValueType>> leaves_to_hash,
                                       const HashGenerationCallback& completion);

    using ContentAddressedAppendOnlyTree<Store, HashingPolicy>::add_value;
    using ContentAddressedAppendOnlyTree<Store, HashingPolicy>::add_values;
    using ContentAddressedAppendOnlyTree<Store, HashingPolicy>::add_values_internal;
    using ContentAddressedAppendOnlyTree<Store, HashingPolicy>::find_leaf_hash;

    using ContentAddressedAppendOnlyTree<Store, HashingPolicy>::store_;
    using ContentAddressedAppendOnlyTree<Store, HashingPolicy>::zero_hashes_;
    using ContentAddressedAppendOnlyTree<Store, HashingPolicy>::depth_;
    using ContentAddressedAppendOnlyTree<Store, HashingPolicy>::workers_;
    using ContentAddressedAppendOnlyTree<Store, HashingPolicy>::max_size_;
};

template <typename Store, typename HashingPolicy>
ContentAddressedIndexedTree<Store, HashingPolicy>::ContentAddressedIndexedTree(std::unique_ptr<Store> store,
                                                                               std::shared_ptr<ThreadPool> workers,
                                                                               index_t initial_size)
    : ContentAddressedAppendOnlyTree<Store, HashingPolicy>(std::move(store), workers)
{
    if (initial_size < 2) {
        throw std::runtime_error("Indexed trees must have initial size > 1");
    }
    zero_hashes_.resize(depth_ + 1);

    // Create the zero hashes for the tree
    // Indexed_LeafType zero_leaf{ 0, 0, 0 };
    auto current = fr::zero();
    for (uint32_t i = depth_; i > 0; --i) {
        zero_hashes_[i] = current;
        current = HashingPolicy::hash_pair(current, current);
    }
    zero_hashes_[0] = current;

    TreeMeta meta;
    {
        ReadTransactionPtr tx = store_->create_read_transaction();
        store_->get_meta(meta, *tx, false);
    }

    // if the tree already contains leaves then it's been initialised in the past
    if (meta.size > 0) {
        return;
    }

    std::vector<IndexedLeafValueType> appended_leaves;
    std::vector<bb::fr> appended_hashes;
    // Inserts the initial set of leaves as a chain in incrementing value order
    for (uint32_t i = 0; i < initial_size; ++i) {
        // Insert the zero leaf to the `leaves` and also to the tree at index 0.
        bool last = i == (initial_size - 1);
        IndexedLeafValueType initial_leaf =
            IndexedLeafValueType(LeafValueType::padding(i), last ? 0 : i + 1, last ? 0 : i + 1);
        fr leaf_hash = HashingPolicy::hash(initial_leaf.get_hash_inputs());
        appended_leaves.push_back(initial_leaf);
        appended_hashes.push_back(leaf_hash);
        store_->set_leaf_key_at_index(i, initial_leaf);
        store_->put_leaf_by_hash(leaf_hash, initial_leaf);
    }
    store_->put_leaf_by_hash(0, IndexedLeafValueType::empty());

    TypedResponse<AddDataResponse> result;
    Signal signal(1);
    AppendCompletionCallback completion = [&](const TypedResponse<AddDataResponse>& _result) -> void {
        result = _result;
        signal.signal_level(0);
    };
    ContentAddressedAppendOnlyTree<Store, HashingPolicy>::add_values_internal(appended_hashes, completion, false);
    signal.wait_for_level(0);
    if (!result.success) {
        throw std::runtime_error("Failed to initialise tree: " + result.message);
    }
    {
        ReadTransactionPtr tx = store_->create_read_transaction();
        store_->get_meta(meta, *tx, true);
    }
    meta.initialRoot = result.inner.root;
    meta.initialSize = result.inner.size;
    store_->put_meta(meta);
    store_->commit(false);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::get_leaf(const index_t& index,
                                                                 bool includeUncommitted,
                                                                 const LeafCallback& completion) const
{
    auto job = [=, this]() {
        execute_and_report<GetIndexedLeafResponse<LeafValueType>>(
            [=, this](TypedResponse<GetIndexedLeafResponse<LeafValueType>>& response) {
                ReadTransactionPtr tx = store_->create_read_transaction();
                RequestContext requestContext;
                requestContext.includeUncommitted = includeUncommitted;
                requestContext.root = store_->get_current_root(*tx, includeUncommitted);
                std::optional<fr> leaf_hash = find_leaf_hash(index, requestContext, *tx);
                if (!leaf_hash.has_value()) {
                    response.success = false;
                    return;
                }
                std::optional<IndexedLeafValueType> leaf =
                    store_->get_leaf_by_hash(leaf_hash.value(), *tx, includeUncommitted);
                if (!leaf.has_value()) {
                    response.success = false;
                    return;
                }
                response.success = true;
                response.inner.indexed_leaf = leaf.value();
            },
            completion);
    };
    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::get_leaf(const index_t& index,
                                                                 const index_t& blockNumber,
                                                                 bool includeUncommitted,
                                                                 const LeafCallback& completion) const
{
    auto job = [=, this]() {
        execute_and_report<GetIndexedLeafResponse<LeafValueType>>(
            [=, this](TypedResponse<GetIndexedLeafResponse<LeafValueType>>& response) {
                ReadTransactionPtr tx = store_->create_read_transaction();
                BlockPayload blockData;
                if (!store_->get_block_data(blockNumber, blockData, *tx)) {
                    throw std::runtime_error("Data for block unavailable");
                }
                RequestContext requestContext;
                requestContext.blockNumber = blockNumber;
                requestContext.includeUncommitted = includeUncommitted;
                requestContext.root = blockData.root;
                std::optional<fr> leaf_hash = find_leaf_hash(index, requestContext, *tx);
                if (!leaf_hash.has_value()) {
                    response.success = false;
                    return;
                }
                std::optional<IndexedLeafValueType> leaf =
                    store_->get_leaf_by_hash(leaf_hash.value(), *tx, includeUncommitted);
                if (!leaf.has_value()) {
                    response.success = false;
                    return;
                }
                response.success = true;
                response.inner.indexed_leaf = leaf.value();
            },
            completion);
    };
    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::find_leaf_index(
    const LeafValueType& leaf,
    bool includeUncommitted,
    const ContentAddressedAppendOnlyTree<Store, HashingPolicy>::FindLeafCallback& on_completion) const
{
    find_leaf_index_from(leaf, 0, includeUncommitted, on_completion);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::find_leaf_index(
    const LeafValueType& leaf,
    const index_t& blockNumber,
    bool includeUncommitted,
    const ContentAddressedAppendOnlyTree<Store, HashingPolicy>::FindLeafCallback& on_completion) const
{
    find_leaf_index_from(leaf, blockNumber, 0, includeUncommitted, on_completion);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::find_leaf_index_from(
    const LeafValueType& leaf,
    index_t start_index,
    bool includeUncommitted,
    const ContentAddressedAppendOnlyTree<Store, HashingPolicy>::FindLeafCallback& on_completion) const
{
    auto job = [=, this]() -> void {
        execute_and_report<FindLeafIndexResponse>(
            [=, this](TypedResponse<FindLeafIndexResponse>& response) {
                typename Store::ReadTransactionPtr tx = store_->create_read_transaction();
                RequestContext requestContext;
                requestContext.includeUncommitted = includeUncommitted;
                requestContext.root = store_->get_current_root(*tx, includeUncommitted);
                std::optional<index_t> leaf_index =
                    store_->find_leaf_index_from(leaf, start_index, requestContext, *tx, includeUncommitted);
                response.success = leaf_index.has_value();
                if (response.success) {
                    response.inner.leaf_index = leaf_index.value();
                }
            },
            on_completion);
    };
    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::find_leaf_index_from(
    const LeafValueType& leaf,
    const index_t& blockNumber,
    index_t start_index,
    bool includeUncommitted,
    const ContentAddressedAppendOnlyTree<Store, HashingPolicy>::FindLeafCallback& on_completion) const
{
    auto job = [=, this]() -> void {
        execute_and_report<FindLeafIndexResponse>(
            [=, this](TypedResponse<FindLeafIndexResponse>& response) {
                typename Store::ReadTransactionPtr tx = store_->create_read_transaction();
                BlockPayload blockData;
                if (!store_->get_block_data(blockNumber, blockData, *tx)) {
                    throw std::runtime_error("Data for block unavailable");
                }
                RequestContext requestContext;
                requestContext.blockNumber = blockNumber;
                requestContext.includeUncommitted = includeUncommitted;
                requestContext.root = blockData.root;
                std::optional<index_t> leaf_index =
                    store_->find_leaf_index_from(leaf, start_index, requestContext, *tx, includeUncommitted);
                response.success = leaf_index.has_value();
                if (response.success) {
                    response.inner.leaf_index = leaf_index.value();
                }
            },
            on_completion);
    };
    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::find_low_leaf(const fr& leaf_key,
                                                                      bool includeUncommitted,
                                                                      const FindLowLeafCallback& on_completion) const
{
    auto job = [=, this]() {
        execute_and_report<GetLowIndexedLeafResponse>(
            [=, this](TypedResponse<GetLowIndexedLeafResponse>& response) {
                typename Store::ReadTransactionPtr tx = store_->create_read_transaction();
                RequestContext requestContext;
                requestContext.includeUncommitted = includeUncommitted;
                requestContext.root = store_->get_current_root(*tx, includeUncommitted);
                std::pair<bool, index_t> result = store_->find_low_value(leaf_key, requestContext, *tx);
                response.inner.index = result.second;
                response.inner.is_already_present = result.first;
            },
            on_completion);
    };

    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::find_low_leaf(const fr& leaf_key,
                                                                      const index_t& blockNumber,
                                                                      bool includeUncommitted,
                                                                      const FindLowLeafCallback& on_completion) const
{
    auto job = [=, this]() {
        execute_and_report<GetLowIndexedLeafResponse>(
            [=, this](TypedResponse<GetLowIndexedLeafResponse>& response) {
                typename Store::ReadTransactionPtr tx = store_->create_read_transaction();
                BlockPayload blockData;
                if (!store_->get_block_data(blockNumber, blockData, *tx)) {
                    throw std::runtime_error("Data for block unavailable");
                }
                RequestContext requestContext;
                requestContext.blockNumber = blockNumber;
                requestContext.includeUncommitted = includeUncommitted;
                requestContext.root = blockData.root;
                std::pair<bool, index_t> result = store_->find_low_value(leaf_key, requestContext, *tx);
                response.inner.index = result.second;
                response.inner.is_already_present = result.first;
            },
            on_completion);
    };

    workers_->enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::add_or_update_value(
    const LeafValueType& value, const AddCompletionCallbackWithWitness& completion)
{
    add_or_update_values(std::vector<LeafValueType>{ value }, 1, completion);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::add_or_update_value(const LeafValueType& value,
                                                                            const AddCompletionCallback& completion)
{
    add_or_update_values(std::vector<LeafValueType>{ value }, 1, completion);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::add_or_update_values(
    const std::vector<LeafValueType>& values, const AddCompletionCallbackWithWitness& completion)
{
    add_or_update_values(values, 0, completion);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::add_or_update_values(const std::vector<LeafValueType>& values,
                                                                             const AddCompletionCallback& completion)
{
    add_or_update_values(values, 0, completion);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::add_or_update_values(
    const std::vector<LeafValueType>& values,
    const uint32_t subtree_depth,
    const AddCompletionCallbackWithWitness& completion)
{
    add_or_update_values_internal(values, subtree_depth, completion, true);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::add_or_update_values(const std::vector<LeafValueType>& values,
                                                                             const uint32_t subtree_depth,
                                                                             const AddCompletionCallback& completion)
{
    auto final_completion = [=](const TypedResponse<AddIndexedDataResponse<LeafValueType>>& add_data_response) {
        TypedResponse<AddDataResponse> response;
        response.success = add_data_response.success;
        response.message = add_data_response.message;
        if (add_data_response.success) {
            response.inner = add_data_response.inner.add_data_result;
        }
        // Trigger the client's provided callback
        completion(response);
    };
    add_or_update_values_internal(values, subtree_depth, final_completion, false);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::add_or_update_values_internal(
    const std::vector<LeafValueType>& values,
    const uint32_t subtree_depth,
    const AddCompletionCallbackWithWitness& completion,
    bool capture_witness)
{
    // We first take a copy of the leaf values and their locations within the set given to us
    std::shared_ptr<std::vector<std::pair<LeafValueType, size_t>>> values_to_be_sorted =
        std::make_shared<std::vector<std::pair<LeafValueType, size_t>>>(values.size());
    for (size_t i = 0; i < values.size(); ++i) {
        (*values_to_be_sorted)[i] = std::make_pair(values[i], i);
    }

    // This is to collect some state from the asynchronous operations we are about to perform
    struct IntermediateResults {
        // new hashes that will be appended to the tree
        std::shared_ptr<std::vector<fr>> hashes_to_append;
        // info about the low leaves that have been updated
        std::shared_ptr<std::vector<LowLeafWitnessData<LeafValueType>>> low_leaf_witness_data;
        fr_sibling_path subtree_path;
        std::atomic<uint32_t> count;
        Status status;

        // We set to 2 here as we will kick off the 2 main async operations concurrently and we need to trakc thri
        // completion
        IntermediateResults()
            : count(2)
        {
            // Default to success, set to false on error
            status.success = true;
        };
    };
    std::shared_ptr<IntermediateResults> results = std::make_shared<IntermediateResults>();

    auto on_error = [=](const std::string& message) {
        try {
            TypedResponse<AddIndexedDataResponse<LeafValueType>> response;
            response.success = false;
            response.message = message;
            completion(response);
        } catch (std::exception&) {
        }
    };

    // This is the final callback triggered once the leaves have been appended to the tree
    auto final_completion = [=](const TypedResponse<AddDataResponse>& add_data_response) {
        TypedResponse<AddIndexedDataResponse<LeafValueType>> response;
        response.success = add_data_response.success;
        response.message = add_data_response.message;
        if (add_data_response.success) {
            if (capture_witness) {
                response.inner.subtree_path = std::move(results->subtree_path);
                response.inner.sorted_leaves = std::move(values_to_be_sorted);
                response.inner.low_leaf_witness_data = std::move(results->low_leaf_witness_data);
            }
            response.inner.add_data_result = std::move(add_data_response.inner);
        }
        // Trigger the client's provided callback
        completion(response);
    };

    auto sibling_path_completion = [=, this](const TypedResponse<GetSiblingPathResponse>& response) {
        if (!response.success) {
            results->status.set_failure(response.message);
        } else {
            if (capture_witness) {
                results->subtree_path = std::move(response.inner.path);
            }
            ContentAddressedAppendOnlyTree<Store, HashingPolicy>::add_values_internal(
                (*results->hashes_to_append), final_completion, false);
        }
    };

    // This signals the completion of the appended hash generation
    // If the low leaf updates are also completed then we will append the leaves
    HashGenerationCallback hash_completion = [=, this](const TypedResponse<HashGenerationResponse>& hashes_response) {
        if (!hashes_response.success) {
            results->status.set_failure(hashes_response.message);
        } else {
            results->hashes_to_append = hashes_response.inner.hashes;
        }

        if (results->count.fetch_sub(1) == 1) {
            if (!results->status.success) {
                on_error(results->status.message);
                return;
            }
            if (capture_witness) {
                ContentAddressedAppendOnlyTree<Store, HashingPolicy>::get_subtree_sibling_path(
                    subtree_depth, sibling_path_completion, true);
                return;
            }
            TypedResponse<GetSiblingPathResponse> response;
            response.success = true;
            sibling_path_completion(response);
        }
    };

    // This signals the completion of the low leaf updates
    // If the append hash generation has also copleted then the hashes can be appended
    InsertionCompletionCallback insertion_completion =
        [=, this](const TypedResponse<InsertionCompletionResponse>& insertion_response) {
            if (!insertion_response.success) {
                results->status.set_failure(insertion_response.message);
            } else if (capture_witness) {
                results->low_leaf_witness_data = insertion_response.inner.low_leaf_witness_data;
            }

            if (results->count.fetch_sub(1) == 1) {
                if (!results->status.success) {
                    on_error(results->status.message);
                    return;
                }
                if (capture_witness) {
                    ContentAddressedAppendOnlyTree<Store, HashingPolicy>::get_subtree_sibling_path(
                        subtree_depth, sibling_path_completion, true);
                    return;
                }
                TypedResponse<GetSiblingPathResponse> response;
                response.success = true;

                sibling_path_completion(response);
            }
        };

    // This signals the completion of the insertion data generation
    // Here we will enqueue both the generation of the appended hashes and the low leaf updates (insertions)
    InsertionGenerationCallback insertion_generation_completed =
        [=, this](const TypedResponse<InsertionGenerationResponse>& insertion_response) {
            if (!insertion_response.success) {
                on_error(insertion_response.message);
                return;
            }
            workers_->enqueue([=, this]() {
                generate_hashes_for_appending(insertion_response.inner.indexed_leaves, hash_completion);
            });
            if (capture_witness) {
                perform_insertions(values.size(), insertion_response.inner.insertions, insertion_completion);
                return;
            }
            perform_insertions_without_witness(
                insertion_response.inner.highest_index, insertion_response.inner.insertions, insertion_completion);
        };

    // We start by enqueueing the insertion data generation
    workers_->enqueue([=, this]() { generate_insertions(values_to_be_sorted, insertion_generation_completed); });
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::perform_insertions(
    size_t total_leaves,
    std::shared_ptr<std::vector<LeafInsertion>> insertions,
    const InsertionCompletionCallback& completion)
{
    auto low_leaf_witness_data = std::make_shared<std::vector<LowLeafWitnessData<LeafValueType>>>(
        total_leaves,
        LowLeafWitnessData<LeafValueType>{ IndexedLeafValueType::empty(), 0, fr_sibling_path(depth_, fr::zero()) });

    // early return, no insertions to perform
    if (insertions->size() == 0) {
        TypedResponse<InsertionCompletionResponse> response;
        response.success = true;
        response.inner.low_leaf_witness_data = low_leaf_witness_data;
        completion(response);
        return;
    }

    // We now kick off multiple workers to perform the low leaf updates
    // We create set of signals to coordinate the workers as the move up the tree
    // We don';t want toflood the provided thread pool with jobs that can't be processed so we throttle the rate
    // at which jobs are added to the thread pool. This enables other trees to utilise the same pool
    std::shared_ptr<std::vector<Signal>> signals = std::make_shared<std::vector<Signal>>();
    std::shared_ptr<Status> status = std::make_shared<Status>();
    // The first signal is set to 0. This ensures the first worker up the tree is not impeded
    signals->emplace_back(0);
    // Workers will follow their leaders up the tree, being triggered by the signal in front of them
    for (size_t i = 0; i < insertions->size(); ++i) {
        signals->emplace_back(uint32_t(1 + depth_));
    }

    {
        struct EnqueuedOps {
            // This queue is to be accessed under the following mutex
            std::queue<std::function<void()>> operations;
            std::mutex enqueueMutex;

            void enqueue_next(ThreadPool& workers)
            {
                std::unique_lock lock(enqueueMutex);
                if (operations.empty()) {
                    return;
                }
                auto nextOp = operations.front();
                operations.pop();
                workers.enqueue(nextOp);
            }

            void enqueue_initial(ThreadPool& workers, size_t numJobs)
            {
                std::unique_lock lock(enqueueMutex);
                for (size_t i = 0; i < numJobs && !operations.empty(); ++i) {
                    auto nextOp = operations.front();
                    operations.pop();
                    workers.enqueue(nextOp);
                }
            }

            void add_job(std::function<void()>& job) { operations.push(job); }
        };

        std::shared_ptr<EnqueuedOps> enqueuedOperations = std::make_shared<EnqueuedOps>();

        for (uint32_t i = 0; i < insertions->size(); ++i) {
            std::function<void()> op = [=, this]() {
                LeafInsertion& insertion = (*insertions)[i];
                Signal& leaderSignal = (*signals)[i];
                Signal& followerSignal = (*signals)[i + 1];
                try {
                    auto& current_witness_data = low_leaf_witness_data->at(i);
                    current_witness_data.leaf = insertion.original_low_leaf;
                    current_witness_data.index = insertion.low_leaf_index;
                    current_witness_data.path.clear();

                    update_leaf_and_hash_to_root(insertion.low_leaf_index,
                                                 insertion.low_leaf,
                                                 leaderSignal,
                                                 followerSignal,
                                                 current_witness_data.path);
                } catch (std::exception& e) {
                    status->set_failure(e.what());
                    // ensure that any followers are not blocked by our failure
                    followerSignal.signal_level(0);
                }

                {
                    // If there are more jobs then push another onto the thread pool
                    enqueuedOperations->enqueue_next(*workers_);
                }

                if (i == insertions->size() - 1) {
                    TypedResponse<InsertionCompletionResponse> response;
                    response.success = status->success;
                    response.message = status->message;
                    if (response.success) {
                        response.inner.low_leaf_witness_data = low_leaf_witness_data;
                    }
                    completion(response);
                }
            };
            enqueuedOperations->add_job(op);
        }

        {
            // Kick off an initial set of jobs, capped at the depth of the tree or the size of the thread pool,
            // whichever is lower
            size_t initialSize = std::min(workers_->num_threads(), static_cast<size_t>(depth_));
            enqueuedOperations->enqueue_initial(*workers_, initialSize);
        }
    }
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::perform_insertions_without_witness(
    index_t highest_index,
    std::shared_ptr<std::vector<LeafInsertion>> insertions,
    const InsertionCompletionCallback& completion)
{
    // early return, no insertions to perform
    if (insertions->size() == 0) {
        TypedResponse<InsertionCompletionResponse> response;
        response.success = true;
        completion(response);
        return;
    }

    std::shared_ptr<Status> status = std::make_shared<Status>();

    uint32_t p = static_cast<uint32_t>(std::log2(highest_index + 1)) + 1;
    index_t span = static_cast<uint32_t>(std::pow(2, p));
    uint64_t numBatches = workers_->num_threads();
    index_t batchSize = span / numBatches;
    batchSize = std::max(batchSize, 1UL);
    index_t startIndex = 0;
    p = static_cast<uint32_t>(std::log2(batchSize));
    uint32_t rootLevel = depth_ - p;

    struct BatchInsertResults {
        std::atomic_uint32_t count;
        std::vector<std::pair<bool, fr>> roots;

        BatchInsertResults(uint32_t init)
            : count(init)
            , roots(init, std::make_pair(false, fr::zero()))
        {}
    };
    std::shared_ptr<BatchInsertResults> opCount = std::make_shared<BatchInsertResults>(numBatches);

    for (uint32_t i = 0; i < numBatches; ++i) {
        std::function<void()> op = [=, this]() {
            try {
                bool withinRange = startIndex <= highest_index;
                if (withinRange) {
                    opCount->roots[i] = sparse_batch_update(startIndex, batchSize, rootLevel, *insertions);
                }
            } catch (std::exception& e) {
                status->set_failure(e.what());
            }

            if (opCount->count.fetch_sub(1) == 1) {
                std::vector<std::pair<index_t, fr>> hashes_at_level;
                for (size_t i = 0; i < opCount->roots.size(); i++) {
                    if (opCount->roots[i].first) {
                        hashes_at_level.push_back(std::make_pair(i, opCount->roots[i].second));
                    }
                }
                sparse_batch_update(hashes_at_level, rootLevel);

                TypedResponse<InsertionCompletionResponse> response;
                response.success = true;
                completion(response);
            }
        };
        startIndex += batchSize;
        workers_->enqueue(op);
    }
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::generate_hashes_for_appending(
    std::shared_ptr<std::vector<IndexedLeafValueType>> leaves_to_hash, const HashGenerationCallback& completion)
{
    execute_and_report<HashGenerationResponse>(
        [=, this](TypedResponse<HashGenerationResponse>& response) {
            response.inner.hashes = std::make_shared<std::vector<fr>>(leaves_to_hash->size(), 0);
            std::vector<IndexedLeafValueType>& leaves = *leaves_to_hash;
            for (uint32_t i = 0; i < leaves.size(); ++i) {
                IndexedLeafValueType& leaf = leaves[i];
                fr hash = leaf.is_empty() ? 0 : HashingPolicy::hash(leaf.get_hash_inputs());
                (*response.inner.hashes)[i] = hash;
                store_->put_leaf_by_hash(hash, leaf);
            }
        },
        completion);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::generate_insertions(
    const std::shared_ptr<std::vector<std::pair<LeafValueType, index_t>>>& values_to_be_sorted,
    const InsertionGenerationCallback& on_completion)
{
    execute_and_report<InsertionGenerationResponse>(
        [=, this](TypedResponse<InsertionGenerationResponse>& response) {
            // The first thing we do is sort the values into descending order but maintain knowledge of their
            // orignal order
            struct {
                bool operator()(std::pair<LeafValueType, index_t>& a, std::pair<LeafValueType, index_t>& b) const
                {
                    uint256_t aValue = a.first.get_key();
                    uint256_t bValue = b.first.get_key();
                    return aValue == bValue ? a.second < b.second : aValue > bValue;
                }
            } comp;
            std::sort(values_to_be_sorted->begin(), values_to_be_sorted->end(), comp);

            std::vector<std::pair<LeafValueType, index_t>>& values = *values_to_be_sorted;

            // std::cout << "Generating insertions " << std::endl;

            // Now that we have the sorted values we need to identify the leaves that need updating.
            // This is performed sequentially and is stored in this 'leaf_insertion' struct
            response.inner.highest_index = 0;
            response.inner.insertions = std::make_shared<std::vector<LeafInsertion>>();
            response.inner.insertions->reserve(values.size());
            response.inner.indexed_leaves =
                std::make_shared<std::vector<IndexedLeafValueType>>(values.size(), IndexedLeafValueType::empty());
            index_t num_leaves_to_be_inserted = values.size();
            std::set<uint256_t> unique_values;

            {
                ReadTransactionPtr tx = store_->create_read_transaction();
                TreeMeta meta;
                store_->get_meta(meta, *tx, true);
                RequestContext requestContext;
                requestContext.includeUncommitted = true;
                //  Ensure that the tree is not going to be overfilled
                index_t new_total_size = num_leaves_to_be_inserted + meta.size;
                if (new_total_size > max_size_) {
                    throw std::runtime_error("Tree is full");
                }
                for (size_t i = 0; i < values.size(); ++i) {
                    std::pair<LeafValueType, size_t>& value_pair = values[i];
                    size_t index_into_appended_leaves = value_pair.second;
                    index_t index_of_new_leaf = static_cast<index_t>(index_into_appended_leaves) + meta.size;
                    if (value_pair.first.is_empty()) {
                        continue;
                    }
                    fr value = value_pair.first.get_key();
                    auto it = unique_values.insert(value);
                    if (!it.second) {
                        throw std::runtime_error("Duplicate key not allowed in same batch");
                    }

                    // This gives us the leaf that need updating
                    index_t low_leaf_index = 0;
                    bool is_already_present = false;

                    requestContext.root = store_->get_current_root(*tx, true);
                    std::tie(is_already_present, low_leaf_index) =
                        store_->find_low_value(value_pair.first.get_key(), requestContext, *tx);
                    // std::cout << "Found low leaf index " << low_leaf_index << std::endl;

                    // Try and retrieve the leaf pre-image from the cache first.
                    // If unsuccessful, derive from the tree and hash based lookup
                    std::optional<IndexedLeafValueType> optional_low_leaf =
                        store_->get_cached_leaf_by_index(low_leaf_index);
                    IndexedLeafValueType low_leaf;

                    if (optional_low_leaf.has_value()) {
                        low_leaf = optional_low_leaf.value();
                        // std::cout << "Found cached low leaf at index: " << low_leaf_index << " : " << low_leaf
                        //           << std::endl;
                    } else {
                        // std::cout << "Looking for leaf at index " << low_leaf_index << std::endl;
                        std::optional<fr> low_leaf_hash = find_leaf_hash(low_leaf_index, requestContext, *tx, true);

                        if (!low_leaf_hash.has_value()) {
                            // std::cout << "Failed to find low leaf" << std::endl;
                            throw std::runtime_error("Failed to find low leaf");
                        }
                        // std::cout << "Low leaf hash " << low_leaf_hash.value() << std::endl;

                        std::optional<IndexedLeafValueType> low_leaf_option =
                            store_->get_leaf_by_hash(low_leaf_hash.value(), *tx, true);

                        if (!low_leaf_option.has_value()) {
                            // std::cout << "No pre-image" << std::endl;
                            throw std::runtime_error("Failed to find pre-image for low leaf");
                        }
                        // std::cout << "Low leaf pre-image " << low_leaf_option.value() << std::endl;
                        low_leaf = low_leaf_option.value();
                    }

                    LeafInsertion insertion = {
                        .low_leaf_index = low_leaf_index,
                        .low_leaf = IndexedLeafValueType::empty(),
                        .original_low_leaf = low_leaf,
                    };

                    // Capture the index and original value of the 'low' leaf

                    if (!is_already_present) {
                        // Update the current leaf to point it to the new leaf
                        IndexedLeafValueType new_leaf =
                            IndexedLeafValueType(value_pair.first, low_leaf.nextIndex, low_leaf.nextValue);

                        low_leaf.nextIndex = index_of_new_leaf;
                        low_leaf.nextValue = value;
                        store_->set_leaf_key_at_index(index_of_new_leaf, new_leaf);

                        // std::cout << "NEW LEAf TO BE INSERTED at index: " << index_of_new_leaf << " : " << new_leaf
                        //           << std::endl;

                        store_->put_cached_leaf_by_index(low_leaf_index, low_leaf);
                        // leaves_pre[low_leaf_index] = low_leaf;
                        insertion.low_leaf = low_leaf;

                        // Update the set of leaves to append
                        (*response.inner.indexed_leaves)[index_into_appended_leaves] = new_leaf;
                    } else if (IndexedLeafValueType::is_updateable()) {
                        // Update the current leaf's value, don't change it's link
                        IndexedLeafValueType replacement_leaf =
                            IndexedLeafValueType(value_pair.first, low_leaf.nextIndex, low_leaf.nextValue);
                        IndexedLeafValueType empty_leaf = IndexedLeafValueType::empty();
                        // don't update the index for this empty leaf
                        store_->set_leaf_key_at_index(index_of_new_leaf, empty_leaf);
                        store_->put_cached_leaf_by_index(low_leaf_index, replacement_leaf);
                        insertion.low_leaf = replacement_leaf;
                        // The set of appended leaves already has an empty leaf in the slot at index
                        // 'index_into_appended_leaves'
                    } else {
                        throw std::runtime_error("IndexedLeafValue is not updateable");
                    }
                    response.inner.highest_index = std::max(response.inner.highest_index, low_leaf_index);

                    response.inner.insertions->push_back(insertion);
                }
            }
        },
        on_completion);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::update_leaf_and_hash_to_root(
    const index_t& leaf_index,
    const IndexedLeafValueType& leaf,
    Signal& leader,
    Signal& follower,
    fr_sibling_path& previous_sibling_path)
{
    auto get_optional_node = [&](uint32_t level, index_t index) -> std::optional<fr> {
        fr value = fr::zero();
        // std::cout << "Getting node at " << level << " : " << index << std::endl;
        bool success = store_->get_cached_node_by_index(level, index, value);
        return success ? std::optional<fr>(value) : std::nullopt;
    };
    // We are a worker at a specific leaf index.
    // We are going to move up the tree and at each node/level:
    // 1. Wait for the level above to become 'signalled' as clear for us to write into
    // 2. Read the node and it's sibling
    // 3. Write the new node value
    index_t index = leaf_index;
    uint32_t level = depth_;
    fr new_hash = HashingPolicy::hash(leaf.get_hash_inputs());

    // Wait until we see that our leader has cleared 'depth_ - 1' (i.e. the level above the leaves that we are about
    // to write into) this ensures that our leader is not still reading the leaves
    uint32_t leader_level = depth_ - 1;
    leader.wait_for_level(leader_level);

    // Write the new leaf hash in place
    store_->put_cached_node_by_index(level, index, new_hash);
    // std::cout << "Writing leaf hash: " << new_hash << " at index " << index << std::endl;
    store_->put_leaf_by_hash(new_hash, leaf);
    // std::cout << "Writing level: " << level << std::endl;
    store_->put_node_by_hash(new_hash, { .left = std::nullopt, .right = std::nullopt, .ref = 1 });
    // Signal that this level has been written
    follower.signal_level(level);

    while (level > 0) {
        if (level > 1) {
            // Level is > 1. Therefore we need to wait for our leader to have written to the level above meaning we
            // can read from it
            leader_level = level - 1;
            leader.wait_for_level(leader_level);
        }

        // Now that we have extracted the hash path from the row above
        // we can compute the new hash at that level and write it
        bool is_right = static_cast<bool>(index & 0x01);
        std::optional<fr> new_right_option = is_right ? new_hash : get_optional_node(level, index + 1);
        std::optional<fr> new_left_option = is_right ? get_optional_node(level, index - 1) : new_hash;
        fr new_right_value = new_right_option.has_value() ? new_right_option.value() : zero_hashes_[level];
        fr new_left_value = new_left_option.has_value() ? new_left_option.value() : zero_hashes_[level];

        previous_sibling_path.emplace_back(is_right ? new_left_value : new_right_value);
        new_hash = HashingPolicy::hash_pair(new_left_value, new_right_value);
        index >>= 1;
        --level;
        if (level > 0) {
            // Before we write we need to ensure that our leader has already written to the row above it
            // otherwise it could still be reading from this level
            leader_level = level - 1;
            leader.wait_for_level(leader_level);
        }

        // Write this node and signal that it is done
        store_->put_cached_node_by_index(level, index, new_hash);
        store_->put_node_by_hash(new_hash, { .left = new_left_option, .right = new_right_option, .ref = 1 });
        // if (level == 0) {
        // std::cout << "NEW VALUE AT LEVEL " << level << " : " << new_hash << " LEFT: " << new_left_value
        //           << " RIGHT: " << new_right_value << std::endl;
        // }

        follower.signal_level(level);
    }
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::sparse_batch_update(
    const std::vector<std::pair<index_t, fr>>& hashes_at_level, uint32_t level)
{
    auto get_optional_node = [&](uint32_t level, index_t index) -> std::optional<fr> {
        fr value = fr::zero();

        bool success = store_->get_cached_node_by_index(level, index, value);
        // std::cout << "Getting node at " << level << " : " << index << " success " << success << std::endl;
        return success ? std::optional<fr>(value) : std::nullopt;
    };
    std::vector<index_t> indices;
    indices.reserve(hashes_at_level.size());
    std::unordered_map<index_t, fr> hashes;
    // grab the hashes
    for (size_t i = 0; i < hashes_at_level.size(); ++i) {
        index_t index = hashes_at_level[i].first;
        fr hash = hashes_at_level[i].second;
        hashes[index] = hash;
        indices.push_back(index);
        // std::cout << "index " << index << " hash " << hash << std::endl;
    }
    std::unordered_set<index_t> unique_indices;
    while (level > 0) {
        std::vector<index_t> next_indices;
        std::unordered_map<index_t, fr> next_hashes;
        for (size_t i = 0; i < indices.size(); ++i) {
            index_t index = indices[i];
            index_t parent_index = index >> 1;
            auto it = unique_indices.insert(parent_index);
            if (!it.second) {
                continue;
            }
            next_indices.push_back(parent_index);
            bool is_right = static_cast<bool>(index & 0x01);
            fr new_hash = hashes[index];
            std::optional<fr> new_right_option = is_right ? new_hash : get_optional_node(level, index + 1);
            std::optional<fr> new_left_option = is_right ? get_optional_node(level, index - 1) : new_hash;
            fr new_right_value = new_right_option.has_value() ? new_right_option.value() : zero_hashes_[level];
            fr new_left_value = new_left_option.has_value() ? new_left_option.value() : zero_hashes_[level];

            new_hash = HashingPolicy::hash_pair(new_left_value, new_right_value);
            store_->put_cached_node_by_index(level - 1, parent_index, new_hash);
            store_->put_node_by_hash(new_hash, { .left = new_left_option, .right = new_right_option, .ref = 1 });
            next_hashes[parent_index] = new_hash;
        }
        indices = std::move(next_indices);
        hashes = std::move(next_hashes);
        unique_indices.clear();
        --level;
    }
}

template <typename Store, typename HashingPolicy>
std::pair<bool, fr> ContentAddressedIndexedTree<Store, HashingPolicy>::sparse_batch_update(
    const index_t& start_index,
    const index_t& num_leaves_to_be_inserted,
    const uint32_t& root_level,
    const std::vector<LeafInsertion>& insertions)
{
    auto get_optional_node = [&](uint32_t level, index_t index) -> std::optional<fr> {
        fr value = fr::zero();
        // std::cout << "Getting node at " << level << " : " << index << std::endl;
        bool success = store_->get_cached_node_by_index(level, index, value);
        return success ? std::optional<fr>(value) : std::nullopt;
    };

    uint32_t level = depth_;

    std::vector<index_t> indices;
    indices.reserve(insertions.size());

    fr new_hash = fr::zero();

    std::unordered_set<index_t> unique_indices;
    std::unordered_map<index_t, fr> hashes;
    index_t end_index = start_index + num_leaves_to_be_inserted;
    // Insert the leaves
    for (size_t i = 0; i < insertions.size(); ++i) {

        const LeafInsertion& insertion = insertions[i];
        if (insertion.low_leaf_index < start_index || insertion.low_leaf_index >= end_index) {
            continue;
        }

        // one of our leaves
        new_hash = HashingPolicy::hash(insertion.low_leaf.get_hash_inputs());

        // std::cout << "Hashing leaf at level " << level << " index " << insertion.low_leaf_index << " batch start "
        //           << start_index << " hash " << leaf_hash << std::endl;

        // Write the new leaf hash in place
        store_->put_cached_node_by_index(level, insertion.low_leaf_index, new_hash);
        // std::cout << "Writing leaf hash: " << new_hash << " at index " << index << std::endl;
        store_->put_leaf_by_hash(new_hash, insertion.low_leaf);
        // std::cout << "Writing level: " << level << std::endl;
        store_->put_node_by_hash(new_hash, { .left = std::nullopt, .right = std::nullopt, .ref = 1 });
        indices.push_back(insertion.low_leaf_index);
        hashes[insertion.low_leaf_index] = new_hash;
        // std::cout << "Leaf " << new_hash << " at index " << insertion.low_leaf_index << std::endl;
    }

    if (indices.empty()) {
        return std::make_pair(false, fr::zero());
    }

    while (level > root_level) {
        std::vector<index_t> next_indices;
        std::unordered_map<index_t, fr> next_hashes;
        for (size_t i = 0; i < indices.size(); ++i) {
            index_t index = indices[i];
            index_t parent_index = index >> 1;
            auto it = unique_indices.insert(parent_index);
            if (!it.second) {
                continue;
            }
            next_indices.push_back(parent_index);
            bool is_right = static_cast<bool>(index & 0x01);
            new_hash = hashes[index];
            std::optional<fr> new_right_option = is_right ? new_hash : get_optional_node(level, index + 1);
            std::optional<fr> new_left_option = is_right ? get_optional_node(level, index - 1) : new_hash;
            fr new_right_value = new_right_option.has_value() ? new_right_option.value() : zero_hashes_[level];
            fr new_left_value = new_left_option.has_value() ? new_left_option.value() : zero_hashes_[level];

            new_hash = HashingPolicy::hash_pair(new_left_value, new_right_value);
            store_->put_cached_node_by_index(level - 1, parent_index, new_hash);
            store_->put_node_by_hash(new_hash, { .left = new_left_option, .right = new_right_option, .ref = 1 });
            next_hashes[parent_index] = new_hash;
            // std::cout << "Created parent hash at level " << level - 1 << " index " << parent_index << " hash "
            //           << new_hash << " left " << new_left_value << " right " << new_right_value << std::endl;
        }
        indices = std::move(next_indices);
        hashes = std::move(next_hashes);
        unique_indices.clear();
        --level;
    }
    // std::cout << "Returning hash " << new_hash << std::endl;
    return std::make_pair(true, new_hash);
}

} // namespace bb::crypto::merkle_tree
