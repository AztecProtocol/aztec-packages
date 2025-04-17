// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

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

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/common/utils.hpp"
#include "barretenberg/crypto/merkle_tree/append_only_tree/content_addressed_append_only_tree.hpp"
#include "barretenberg/crypto/merkle_tree/hash.hpp"
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/cached_content_addressed_tree_store.hpp"
#include "barretenberg/crypto/merkle_tree/node_store/tree_meta.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/signal.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

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
    using AddCompletionCallbackWithWitness = std::function<void(TypedResponse<AddIndexedDataResponse<LeafValueType>>&)>;
    using AddSequentiallyCompletionCallbackWithWitness =
        std::function<void(TypedResponse<AddIndexedDataSequentiallyResponse<LeafValueType>>&)>;
    using AddCompletionCallback = std::function<void(TypedResponse<AddDataResponse>&)>;

    using LeafCallback = std::function<void(TypedResponse<GetIndexedLeafResponse<LeafValueType>>&)>;
    using FindLowLeafCallback = std::function<void(TypedResponse<GetLowIndexedLeafResponse>&)>;

    ContentAddressedIndexedTree(std::unique_ptr<Store> store,
                                std::shared_ptr<ThreadPool> workers,
                                const index_t& initial_size,
                                const std::vector<LeafValueType>& prefilled_values);
    ContentAddressedIndexedTree(std::unique_ptr<Store> store,
                                std::shared_ptr<ThreadPool> workers,
                                const index_t& initial_size)
        : ContentAddressedIndexedTree(std::move(store), workers, initial_size, std::vector<LeafValueType>()){};
    ContentAddressedIndexedTree(ContentAddressedIndexedTree const& other) = delete;
    ContentAddressedIndexedTree(ContentAddressedIndexedTree&& other) = delete;
    ~ContentAddressedIndexedTree() = default;
    ContentAddressedIndexedTree& operator=(const ContentAddressedIndexedTree& other) = delete;
    ContentAddressedIndexedTree& operator=(ContentAddressedIndexedTree&& other) = delete;

    /**
     * @brief Adds or updates a single value in the tree
     */
    void add_or_update_value(const LeafValueType& value, const AddCompletionCallbackWithWitness& completion);

    /**
     * @brief Adds or updates the given set of values in the tree using subtree insertion.
     * @param values The values to be added or updated
     * @param completion The callback to be triggered once the values have been added
     */
    void add_or_update_values(const std::vector<LeafValueType>& values,
                              const AddCompletionCallbackWithWitness& completion);

    /**
     * @brief Adds or updates the given set of values in the tree using subtree insertion.
     * @param values The values to be added or updated
     * @param subtree_depth The height of the subtree to be inserted.
     * @param completion The callback to be triggered once the values have been added
     */
    void add_or_update_values(const std::vector<LeafValueType>& values,
                              uint32_t subtree_depth,
                              const AddCompletionCallbackWithWitness& completion);

    /**
     * @brief Adds or updates a single values in the tree
     */
    void add_or_update_value(const LeafValueType& value, const AddCompletionCallback& completion);

    /**
     * @brief Adds or updates the given set of values in the tree using subtree insertion.
     * @param values The values to be added or updated
     * @param completion The callback to be triggered once the values have been added
     */
    void add_or_update_values(const std::vector<LeafValueType>& values, const AddCompletionCallback& completion);

    /**
     * @brief Adds or updates the given set of values in the tree using subtree insertion.
     * @param values The values to be added or updated
     * @param subtree_depth The height of the subtree to be inserted.
     * @param completion The callback to be triggered once the values have been added
     */
    void add_or_update_values(const std::vector<LeafValueType>& values,
                              uint32_t subtree_depth,
                              const AddCompletionCallback& completion);

    /**
     * @brief Adds or updates the given set of values in the tree one by one, fetching witnesses at every step.
     * @param values The values to be added or updated
     * @param completion The callback to be triggered once the values have been added
     */
    void add_or_update_values_sequentially(const std::vector<LeafValueType>& values,
                                           const AddSequentiallyCompletionCallbackWithWitness& completion);

    /**
     * @brief Adds or updates the given set of values in the tree one by one
     * @param values The values to be added or updated
     * @param completion The callback to be triggered once the values have been added
     */
    void add_or_update_values_sequentially(const std::vector<LeafValueType>& values,
                                           const AddCompletionCallback& completion);

    void get_leaf(const index_t& index, bool includeUncommitted, const LeafCallback& completion) const;

    /**
     * @brief Find the leaf with the value immediately lower then the value provided
     */
    void find_low_leaf(const fr& leaf_key, bool includeUncommitted, const FindLowLeafCallback& on_completion) const;

    void get_leaf(const index_t& index,
                  const block_number_t& blockNumber,
                  bool includeUncommitted,
                  const LeafCallback& completion) const;

    /**
     * @brief Find the leaf with the value immediately lower then the value provided
     */
    void find_low_leaf(const fr& leaf_key,
                       const block_number_t& blockNumber,
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

    struct LeafUpdate {
        index_t leaf_index;
        IndexedLeafValueType updated_leaf, original_leaf;
    };

    void update_leaf_and_hash_to_root(const index_t& index,
                                      const IndexedLeafValueType& leaf,
                                      Signal& leader,
                                      Signal& follower,
                                      fr_sibling_path& previous_sibling_path);

    std::pair<bool, fr> sparse_batch_update(const index_t& start_index,
                                            const index_t& num_leaves_to_be_inserted,
                                            const uint32_t& root_level,
                                            const std::vector<LeafUpdate>& updates);

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

    /**
     * @brief Adds or updates the given set of values in the tree, capturing sequential insertion witnesses
     * @param values The values to be added or updated
     * @param completion The callback to be triggered once the values have been added
     * @param capture_witness Whether or not we should capture the witnesses
     */
    void add_or_update_values_sequentially_internal(const std::vector<LeafValueType>& values,
                                                    const AddSequentiallyCompletionCallbackWithWitness& completion,
                                                    bool capture_witness);

    struct InsertionGenerationResponse {
        std::shared_ptr<std::vector<LeafUpdate>> low_leaf_updates;
        std::shared_ptr<std::vector<IndexedLeafValueType>> leaves_to_append;
        index_t highest_index;
    };

    using InsertionGenerationCallback = std::function<void(const TypedResponse<InsertionGenerationResponse>&)>;
    void generate_insertions(const std::shared_ptr<std::vector<std::pair<LeafValueType, index_t>>>& values_to_be_sorted,
                             const InsertionGenerationCallback& completion);

    struct InsertionUpdates {
        // On insertion, we always update a low leaf. If it's creating a new leaf, we need to update the pointer to
        // point to the new one, if it's an update to an existing leaf, we need to change its payload.
        LeafUpdate low_leaf_update;
        // We don't create new leaves on update
        std::optional<std::pair<IndexedLeafValueType, index_t>> new_leaf;
    };

    struct SequentialInsertionGenerationResponse {
        std::vector<InsertionUpdates> updates_to_perform;
        index_t highest_index;
    };

    using SequentialInsertionGenerationCallback =
        std::function<void(TypedResponse<SequentialInsertionGenerationResponse>&)>;
    void generate_sequential_insertions(const std::vector<LeafValueType>& values,
                                        const SequentialInsertionGenerationCallback& completion);

    struct UpdatesCompletionResponse {
        std::shared_ptr<std::vector<LeafUpdateWitnessData<LeafValueType>>> update_witnesses;
    };

    using UpdatesCompletionCallback = std::function<void(const TypedResponse<UpdatesCompletionResponse>&)>;
    void perform_updates(size_t total_leaves,
                         std::shared_ptr<std::vector<LeafUpdate>> updates,
                         const UpdatesCompletionCallback& completion);
    void perform_updates_without_witness(const index_t& highest_index,
                                         std::shared_ptr<std::vector<LeafUpdate>> updates,
                                         const UpdatesCompletionCallback& completion);

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
ContentAddressedIndexedTree<Store, HashingPolicy>::ContentAddressedIndexedTree(
    std::unique_ptr<Store> store,
    std::shared_ptr<ThreadPool> workers,
    const index_t& initial_size,
    const std::vector<LeafValueType>& prefilled_values)
    : ContentAddressedAppendOnlyTree<Store, HashingPolicy>(std::move(store), workers, {}, false)
{
    if (initial_size < 2) {
        throw std::runtime_error("Indexed trees must have initial size > 1");
    }
    if (prefilled_values.size() > initial_size) {
        throw std::runtime_error("Number of prefilled values can't be more than initial size");
    }
    zero_hashes_.resize(depth_ + 1);

    // Create the zero hashes for the tree
    auto current = fr::zero();
    for (uint32_t i = depth_; i > 0; --i) {
        zero_hashes_[i] = current;
        current = HashingPolicy::hash_pair(current, current);
    }
    zero_hashes_[0] = current;

    TreeMeta meta;
    store_->get_meta(meta);

    // if the tree already contains leaves then it's been initialised in the past
    if (meta.size > 0) {
        return;
    }

    std::vector<IndexedLeafValueType> appended_leaves;
    std::vector<bb::fr> appended_hashes;
    std::vector<LeafValueType> initial_set;
    auto num_default_values = static_cast<uint32_t>(initial_size - prefilled_values.size());
    for (uint32_t i = 0; i < num_default_values; ++i) {
        initial_set.push_back(LeafValueType::padding(i));
    }
    initial_set.insert(initial_set.end(), prefilled_values.begin(), prefilled_values.end());
    for (uint32_t i = num_default_values; i < initial_size; ++i) {
        if (i > 0 && (uint256_t(initial_set[i].get_key()) <= uint256_t(initial_set[i - 1].get_key()))) {
            const auto* msg = i == num_default_values ? "Prefilled values must not be the same as the default values"
                                                      : "Prefilled values must be unique and sorted";
            throw std::runtime_error(msg);
        }
    }
    // Inserts the initial set of leaves as a chain in incrementing value order
    for (uint32_t i = 0; i < initial_size; ++i) {
        uint32_t next_index = i == (initial_size - 1) ? 0 : i + 1;
        auto initial_leaf = IndexedLeafValueType(initial_set[i], next_index, initial_set[next_index].get_key());
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
        throw std::runtime_error(format("Failed to initialise tree: ", result.message));
    }
    store_->get_meta(meta);
    meta.initialRoot = result.inner.root;
    meta.initialSize = result.inner.size;
    store_->put_meta(meta);
    store_->commit_genesis_state();
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
                std::optional<fr> leaf_hash = find_leaf_hash(index, requestContext, *tx, false);
                if (!leaf_hash.has_value()) {
                    response.success = false;
                    response.message = "Failed to find leaf hash for current root";
                    return;
                }
                std::optional<IndexedLeafValueType> leaf =
                    store_->get_leaf_by_hash(leaf_hash.value(), *tx, includeUncommitted);
                if (!leaf.has_value()) {
                    response.success = false;
                    response.message = "Failed to find leaf by it's hash";
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
                                                                 const block_number_t& blockNumber,
                                                                 bool includeUncommitted,
                                                                 const LeafCallback& completion) const
{
    auto job = [=, this]() {
        execute_and_report<GetIndexedLeafResponse<LeafValueType>>(
            [=, this](TypedResponse<GetIndexedLeafResponse<LeafValueType>>& response) {
                if (blockNumber == 0) {
                    throw std::runtime_error("Unable to get leaf for block number 0");
                }
                ReadTransactionPtr tx = store_->create_read_transaction();
                BlockPayload blockData;
                if (!store_->get_block_data(blockNumber, blockData, *tx)) {
                    throw std::runtime_error(format("Unable to get leaf at index ",
                                                    index,
                                                    " for block ",
                                                    blockNumber,
                                                    ", failed to get block data."));
                }
                RequestContext requestContext;
                requestContext.blockNumber = blockNumber;
                requestContext.includeUncommitted = includeUncommitted;
                requestContext.root = blockData.root;
                std::optional<fr> leaf_hash = find_leaf_hash(index, requestContext, *tx, false);
                if (!leaf_hash.has_value()) {
                    response.success = false;
                    response.message = format("Failed to find leaf hash for root of block ", blockNumber);
                    return;
                }
                std::optional<IndexedLeafValueType> leaf =
                    store_->get_leaf_by_hash(leaf_hash.value(), *tx, includeUncommitted);
                if (!leaf.has_value()) {
                    response.success = false;
                    response.message = format("Unable to get leaf at index ", index, " for block ", blockNumber);
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
                                                                      const block_number_t& blockNumber,
                                                                      bool includeUncommitted,
                                                                      const FindLowLeafCallback& on_completion) const
{
    auto job = [=, this]() {
        execute_and_report<GetLowIndexedLeafResponse>(
            [=, this](TypedResponse<GetLowIndexedLeafResponse>& response) {
                if (blockNumber == 0) {
                    throw std::runtime_error("Unable to find low leaf for block 0");
                }
                typename Store::ReadTransactionPtr tx = store_->create_read_transaction();
                BlockPayload blockData;
                if (!store_->get_block_data(blockNumber, blockData, *tx)) {
                    throw std::runtime_error(
                        format("Unable to find low leaf for block ", blockNumber, ", failed to get block data."));
                }
                RequestContext requestContext;
                requestContext.blockNumber = blockNumber;
                requestContext.includeUncommitted = includeUncommitted;
                requestContext.root = blockData.root;
                requestContext.maxIndex = blockData.size;
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
    uint32_t subtree_depth,
    const AddCompletionCallbackWithWitness& completion)
{
    add_or_update_values_internal(values, subtree_depth, completion, true);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::add_or_update_values(const std::vector<LeafValueType>& values,
                                                                             uint32_t subtree_depth,
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
    uint32_t subtree_depth,
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
        std::shared_ptr<std::vector<LeafUpdateWitnessData<LeafValueType>>> low_leaf_witness_data;
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
    UpdatesCompletionCallback updates_completion =
        [=, this](const TypedResponse<UpdatesCompletionResponse>& updates_response) {
            if (!updates_response.success) {
                results->status.set_failure(updates_response.message);
            } else if (capture_witness) {
                results->low_leaf_witness_data = updates_response.inner.update_witnesses;
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
    // Here we will enqueue both the generation of the appended hashes and the low leaf updates
    InsertionGenerationCallback insertion_generation_completed =
        [=, this](const TypedResponse<InsertionGenerationResponse>& insertion_response) {
            if (!insertion_response.success) {
                on_error(insertion_response.message);
                return;
            }
            workers_->enqueue([=, this]() {
                generate_hashes_for_appending(insertion_response.inner.leaves_to_append, hash_completion);
            });
            if (capture_witness) {
                perform_updates(values.size(), insertion_response.inner.low_leaf_updates, updates_completion);
                return;
            }
            perform_updates_without_witness(
                insertion_response.inner.highest_index, insertion_response.inner.low_leaf_updates, updates_completion);
        };

    // We start by enqueueing the insertion data generation
    workers_->enqueue([=, this]() { generate_insertions(values_to_be_sorted, insertion_generation_completed); });
}

// Performs a number of leaf updates in the tree, fetching witnesses for the updates in the order they've been applied,
// with the caveat that all nodes fetched need to be in the cache. Otherwise, they'll be assumed to be empty,
// potentially erasing part of the tree. This function won't fetch nodes from DB.
template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::perform_updates(
    size_t total_leaves, std::shared_ptr<std::vector<LeafUpdate>> updates, const UpdatesCompletionCallback& completion)
{
    auto update_witnesses = std::make_shared<std::vector<LeafUpdateWitnessData<LeafValueType>>>(
        total_leaves,
        LeafUpdateWitnessData<LeafValueType>{ IndexedLeafValueType::empty(), 0, fr_sibling_path(depth_, fr::zero()) });

    // early return, no updates to perform
    if (updates->size() == 0) {
        TypedResponse<UpdatesCompletionResponse> response;
        response.success = true;
        response.inner.update_witnesses = update_witnesses;
        completion(response);
        return;
    }

    // We now kick off multiple workers to perform the low leaf updates
    // We create set of signals to coordinate the workers as the move up the tree
    // We don';t want to flood the provided thread pool with jobs that can't be processed so we throttle the rate
    // at which jobs are added to the thread pool. This enables other trees to utilise the same pool
    // NOTE: Wrapping signals with unique_ptr to make them movable (re: mac build).
    // Feel free to reconsider and make Signal movable.
    auto signals = std::make_shared<std::vector<std::unique_ptr<Signal>>>();
    std::shared_ptr<Status> status = std::make_shared<Status>();
    // The first signal is set to 0. This ensures the first worker up the tree is not impeded
    signals->emplace_back(std::make_unique<Signal>(0));
    // Workers will follow their leaders up the tree, being triggered by the signal in front of them
    for (size_t i = 0; i < updates->size(); ++i) {
        signals->emplace_back(std::make_unique<Signal>(static_cast<uint32_t>(1 + depth_)));
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

        for (uint32_t i = 0; i < updates->size(); ++i) {
            std::function<void()> op = [=, this]() {
                LeafUpdate& update = (*updates)[i];
                Signal& leaderSignal = *(*signals)[i];
                Signal& followerSignal = *(*signals)[i + 1];
                try {
                    auto& current_witness_data = update_witnesses->at(i);
                    current_witness_data.leaf = update.original_leaf;
                    current_witness_data.index = update.leaf_index;
                    current_witness_data.path.clear();

                    update_leaf_and_hash_to_root(update.leaf_index,
                                                 update.updated_leaf,
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

                if (i == updates->size() - 1) {
                    TypedResponse<UpdatesCompletionResponse> response;
                    response.success = status->success;
                    response.message = status->message;
                    if (response.success) {
                        response.inner.update_witnesses = update_witnesses;
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

// Performs a number of leaf updates in the tree, with the caveat that all nodes fetched need to be in the cache
// Otherwise, they'll be assumed to be empty, potentially erasing part of the tree. This function won't fetch nodes from
// DB.
template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::perform_updates_without_witness(
    const index_t& highest_index,
    std::shared_ptr<std::vector<LeafUpdate>> updates,
    const UpdatesCompletionCallback& completion)
{
    // early return, no updates to perform
    if (updates->size() == 0) {
        TypedResponse<UpdatesCompletionResponse> response;
        response.success = true;
        completion(response);
        return;
    }

    std::shared_ptr<Status> status = std::make_shared<Status>();

    auto log2Ceil = [=](uint64_t value) {
        uint64_t log = numeric::get_msb(value);
        uint64_t temp = static_cast<uint64_t>(1) << log;
        return temp == value ? log : log + 1;
    };

    uint64_t indexPower2Ceil = log2Ceil(highest_index + 1);
    index_t span = static_cast<index_t>(std::pow(2UL, indexPower2Ceil));
    uint64_t numBatchesPower2Floor = numeric::get_msb(workers_->num_threads());
    index_t numBatches = static_cast<index_t>(std::pow(2UL, numBatchesPower2Floor));
    index_t batchSize = span / numBatches;
    batchSize = std::max(batchSize, static_cast<index_t>(2));
    index_t startIndex = 0;
    indexPower2Ceil = log2Ceil(batchSize);
    uint32_t rootLevel = depth_ - static_cast<uint32_t>(indexPower2Ceil);

    // std::cout << "HIGHEST INDEX " << highest_index << " SPAN " << span << " NUM BATCHES " << numBatches
    //           << " BATCH SIZE " << batchSize << " NUM THREADS " << workers_->num_threads() << " ROOT LEVEL "
    //           << rootLevel << std::endl;

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
                    opCount->roots[i] = sparse_batch_update(startIndex, batchSize, rootLevel, *updates);
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

                TypedResponse<UpdatesCompletionResponse> response;
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
                fr hash = leaf.is_empty() ? fr::zero() : HashingPolicy::hash(leaf.get_hash_inputs());
                (*response.inner.hashes)[i] = hash;
                store_->put_leaf_by_hash(hash, leaf);
            }
        },
        completion);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::generate_insertions(
    const std::shared_ptr<std::vector<std::pair<LeafValueType, index_t>>>& values_to_be_sorted,
    const InsertionGenerationCallback& completion)
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
            // This is performed sequentially and is stored in this 'leaf_update' struct
            response.inner.highest_index = 0;
            response.inner.low_leaf_updates = std::make_shared<std::vector<LeafUpdate>>();
            response.inner.low_leaf_updates->reserve(values.size());
            response.inner.leaves_to_append =
                std::make_shared<std::vector<IndexedLeafValueType>>(values.size(), IndexedLeafValueType::empty());
            index_t num_leaves_to_be_inserted = values.size();
            std::set<uint256_t> unique_values;

            {
                ReadTransactionPtr tx = store_->create_read_transaction();
                TreeMeta meta;
                store_->get_meta(meta);
                RequestContext requestContext;
                requestContext.includeUncommitted = true;
                //  Ensure that the tree is not going to be overfilled
                index_t new_total_size = num_leaves_to_be_inserted + meta.size;
                if (new_total_size > max_size_) {
                    throw std::runtime_error(format("Unable to insert values into tree ",
                                                    meta.name,
                                                    " new size: ",
                                                    new_total_size,
                                                    " max size: ",
                                                    max_size_));
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
                        throw std::runtime_error(format(
                            "Duplicate key not allowed in same batch, key value: ", value, ", tree: ", meta.name));
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
                            throw std::runtime_error(format("Unable to insert values into tree ",
                                                            meta.name,
                                                            ", failed to find low leaf at index ",
                                                            low_leaf_index,
                                                            ", current size: ",
                                                            meta.size));
                        }
                        // std::cout << "Low leaf hash " << low_leaf_hash.value() << std::endl;

                        std::optional<IndexedLeafValueType> low_leaf_option =
                            store_->get_leaf_by_hash(low_leaf_hash.value(), *tx, true);

                        if (!low_leaf_option.has_value()) {
                            // std::cout << "No pre-image" << std::endl;
                            throw std::runtime_error(format("Unable to insert values into tree ",
                                                            meta.name,
                                                            " failed to get leaf pre-image by hash for index ",
                                                            low_leaf_index));
                        }
                        // std::cout << "Low leaf pre-image " << low_leaf_option.value() << std::endl;
                        low_leaf = low_leaf_option.value();
                    }

                    LeafUpdate low_update = {
                        .leaf_index = low_leaf_index,
                        .updated_leaf = IndexedLeafValueType::empty(),
                        .original_leaf = low_leaf,
                    };

                    // Capture the index and original value of the 'low' leaf

                    if (!is_already_present) {
                        // Update the current leaf to point it to the new leaf
                        IndexedLeafValueType new_leaf =
                            IndexedLeafValueType(value_pair.first, low_leaf.nextIndex, low_leaf.nextKey);

                        low_leaf.nextIndex = index_of_new_leaf;
                        low_leaf.nextKey = value;
                        store_->set_leaf_key_at_index(index_of_new_leaf, new_leaf);

                        // std::cout << "NEW LEAf TO BE INSERTED at index: " << index_of_new_leaf << " : " << new_leaf
                        //           << std::endl;

                        // std::cout << "Low leaf found at index " << low_leaf_index << " index of new leaf "
                        //           << index_of_new_leaf << std::endl;

                        store_->put_cached_leaf_by_index(low_leaf_index, low_leaf);
                        // leaves_pre[low_leaf_index] = low_leaf;
                        low_update.updated_leaf = low_leaf;

                        // Update the set of leaves to append
                        (*response.inner.leaves_to_append)[index_into_appended_leaves] = new_leaf;
                    } else if (IndexedLeafValueType::is_updateable()) {
                        // Update the current leaf's value, don't change it's link
                        IndexedLeafValueType replacement_leaf =
                            IndexedLeafValueType(value_pair.first, low_leaf.nextIndex, low_leaf.nextKey);
                        // IndexedLeafValueType empty_leaf = IndexedLeafValueType::empty();
                        //  don't update the index for this empty leaf
                        // std::cout << "Low leaf updated at index " << low_leaf_index << " index of new leaf "
                        //           << index_of_new_leaf << std::endl;
                        // store_->set_leaf_key_at_index(index_of_new_leaf, empty_leaf);
                        store_->put_cached_leaf_by_index(low_leaf_index, replacement_leaf);
                        low_update.updated_leaf = replacement_leaf;
                        // The set of appended leaves already has an empty leaf in the slot at index
                        // 'index_into_appended_leaves'
                    } else {
                        throw std::runtime_error(format("Unable to insert values into tree ",
                                                        meta.name,
                                                        " leaf type ",
                                                        IndexedLeafValueType::name(),
                                                        " is not updateable and ",
                                                        value_pair.first.get_key(),
                                                        " is already present"));
                    }
                    response.inner.highest_index = std::max(response.inner.highest_index, low_leaf_index);

                    response.inner.low_leaf_updates->push_back(low_update);
                }
            }
        },
        completion);
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
    fr new_hash = leaf.leaf.is_empty() ? fr::zero() : HashingPolicy::hash(leaf.get_hash_inputs());

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
        for (index_t index : indices) {
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
    const std::vector<LeafUpdate>& updates)
{
    auto get_optional_node = [&](uint32_t level, index_t index) -> std::optional<fr> {
        fr value = fr::zero();
        // std::cout << "Getting node at " << level << " : " << index << std::endl;
        bool success = store_->get_cached_node_by_index(level, index, value);
        return success ? std::optional<fr>(value) : std::nullopt;
    };

    uint32_t level = depth_;

    std::vector<index_t> indices;
    indices.reserve(updates.size());

    fr new_hash = fr::zero();

    std::unordered_set<index_t> unique_indices;
    std::unordered_map<index_t, fr> hashes;
    index_t end_index = start_index + num_leaves_to_be_inserted;
    // Insert the leaves
    for (size_t i = 0; i < updates.size(); ++i) {

        const LeafUpdate& update = updates[i];
        if (update.leaf_index < start_index || update.leaf_index >= end_index) {
            continue;
        }

        // one of our leaves
        new_hash = update.updated_leaf.leaf.is_empty() ? fr::zero()
                                                       : HashingPolicy::hash(update.updated_leaf.get_hash_inputs());

        // std::cout << "Hashing leaf at level " << level << " index " << update.leaf_index << " batch start "
        //           << start_index << " hash " << leaf_hash << std::endl;

        // Write the new leaf hash in place
        store_->put_cached_node_by_index(level, update.leaf_index, new_hash);
        // std::cout << "Writing leaf hash: " << new_hash << " at index " << index << std::endl;
        store_->put_leaf_by_hash(new_hash, update.updated_leaf);
        // std::cout << "Writing level: " << level << std::endl;
        store_->put_node_by_hash(new_hash, { .left = std::nullopt, .right = std::nullopt, .ref = 1 });
        indices.push_back(update.leaf_index);
        hashes[update.leaf_index] = new_hash;
        // std::cout << "Leaf " << new_hash << " at index " << update.leaf_index << std::endl;
    }

    if (indices.empty()) {
        return std::make_pair(false, fr::zero());
    }

    while (level > root_level) {
        std::vector<index_t> next_indices;
        std::unordered_map<index_t, fr> next_hashes;
        for (index_t index : indices) {
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

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::add_or_update_values_sequentially(
    const std::vector<LeafValueType>& values, const AddSequentiallyCompletionCallbackWithWitness& completion)
{
    add_or_update_values_sequentially_internal(values, completion, true);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::add_or_update_values_sequentially(
    const std::vector<LeafValueType>& values, const AddCompletionCallback& completion)
{
    auto final_completion =
        [=](const TypedResponse<AddIndexedDataSequentiallyResponse<LeafValueType>>& add_data_response) {
            TypedResponse<AddDataResponse> response;
            response.success = add_data_response.success;
            response.message = add_data_response.message;
            if (add_data_response.success) {
                response.inner = add_data_response.inner.add_data_result;
            }
            // Trigger the client's provided callback
            completion(response);
        };
    add_or_update_values_sequentially_internal(values, final_completion, false);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::add_or_update_values_sequentially_internal(
    const std::vector<LeafValueType>& values,
    const AddSequentiallyCompletionCallbackWithWitness& completion,
    bool capture_witness)
{

    // This struct is used to collect some state from the asynchronous operations we are about to perform
    struct IntermediateResults {
        std::vector<InsertionUpdates> updates_to_perform;
        size_t appended_leaves = 0;
    };
    auto results = std::make_shared<IntermediateResults>();

    auto on_error = [=](const std::string& message) {
        try {
            TypedResponse<AddIndexedDataSequentiallyResponse<LeafValueType>> response;
            response.success = false;
            response.message = message;
            completion(response);
        } catch (std::exception&) {
        }
    };

    // This is the final callback triggered once all the leaves have been inserted in the tree
    auto final_completion = [=, this](const TypedResponse<UpdatesCompletionResponse>& updates_completion_response) {
        TypedResponse<AddIndexedDataSequentiallyResponse<LeafValueType>> response;
        response.success = updates_completion_response.success;
        response.message = updates_completion_response.message;
        if (updates_completion_response.success) {
            {
                TreeMeta meta;
                ReadTransactionPtr tx = store_->create_read_transaction();
                store_->get_meta(meta);

                index_t new_total_size = results->appended_leaves + meta.size;
                meta.size = new_total_size;
                meta.root = store_->get_current_root(*tx, true);

                store_->put_meta(meta);
            }

            if (capture_witness) {
                // Split results->update_witnesses between low_leaf_witness_data and insertion_witness_data
                response.inner.insertion_witness_data =
                    std::make_shared<std::vector<LeafUpdateWitnessData<LeafValueType>>>();
                response.inner.insertion_witness_data->reserve(results->updates_to_perform.size());

                response.inner.low_leaf_witness_data =
                    std::make_shared<std::vector<LeafUpdateWitnessData<LeafValueType>>>();
                response.inner.low_leaf_witness_data->reserve(results->updates_to_perform.size());

                size_t current_witness_index = 0;
                for (size_t i = 0; i < results->updates_to_perform.size(); ++i) {
                    LeafUpdateWitnessData<LeafValueType> low_leaf_witness =
                        updates_completion_response.inner.update_witnesses->at(current_witness_index++);
                    response.inner.low_leaf_witness_data->push_back(low_leaf_witness);

                    // If this update has an insertion, append the real witness
                    if (results->updates_to_perform.at(i).new_leaf.has_value()) {
                        LeafUpdateWitnessData<LeafValueType> insertion_witness =
                            updates_completion_response.inner.update_witnesses->at(current_witness_index++);
                        response.inner.insertion_witness_data->push_back(insertion_witness);
                    } else {
                        // If it's an update, append an empty witness
                        response.inner.insertion_witness_data->push_back(LeafUpdateWitnessData<LeafValueType>(
                            IndexedLeafValueType::empty(), 0, std::vector<fr>(depth_)));
                    }
                }
            }
        }
        // Trigger the client's provided callback
        completion(response);
    };

    // This signals the completion of the insertion data generation
    // Here we'll perform all updates to the tree
    SequentialInsertionGenerationCallback insertion_generation_completed =
        [=, this](TypedResponse<SequentialInsertionGenerationResponse>& insertion_response) {
            if (!insertion_response.success) {
                on_error(insertion_response.message);
                return;
            }

            std::shared_ptr<std::vector<LeafUpdate>> flat_updates = std::make_shared<std::vector<LeafUpdate>>();
            flat_updates->reserve(insertion_response.inner.updates_to_perform.size() * 2);

            for (size_t i = 0; i < insertion_response.inner.updates_to_perform.size(); ++i) {
                InsertionUpdates& insertion_update = insertion_response.inner.updates_to_perform.at(i);
                flat_updates->push_back(insertion_update.low_leaf_update);
                if (insertion_update.new_leaf.has_value()) {
                    results->appended_leaves++;
                    IndexedLeafValueType new_leaf;
                    index_t new_leaf_index = 0;
                    std::tie(new_leaf, new_leaf_index) = insertion_update.new_leaf.value();
                    flat_updates->push_back(LeafUpdate{
                        .leaf_index = new_leaf_index,
                        .updated_leaf = new_leaf,
                        .original_leaf = IndexedLeafValueType::empty(),
                    });
                }
            }
            // We won't use anymore updates_to_perform
            results->updates_to_perform = std::move(insertion_response.inner.updates_to_perform);
            assert(insertion_response.inner.updates_to_perform.size() == 0);
            if (capture_witness) {
                perform_updates(flat_updates->size(), flat_updates, final_completion);
                return;
            }
            perform_updates_without_witness(insertion_response.inner.highest_index, flat_updates, final_completion);
        };

    // Enqueue the insertion data generation
    workers_->enqueue([=, this]() { generate_sequential_insertions(values, insertion_generation_completed); });
}

template <typename Store, typename HashingPolicy>
void ContentAddressedIndexedTree<Store, HashingPolicy>::generate_sequential_insertions(
    const std::vector<LeafValueType>& values, const SequentialInsertionGenerationCallback& completion)
{
    execute_and_report<SequentialInsertionGenerationResponse>(
        [=, this](TypedResponse<SequentialInsertionGenerationResponse>& response) {
            TreeMeta meta;
            ReadTransactionPtr tx = store_->create_read_transaction();
            store_->get_meta(meta);

            RequestContext requestContext;
            requestContext.includeUncommitted = true;
            requestContext.root = store_->get_current_root(*tx, true);
            // Fetch the frontier (non empty nodes to the right) of the tree. This will ensure that perform_updates or
            // perform_updates_without_witness has all the cached nodes it needs to perform the insertions. See comment
            // above those functions.
            if (meta.size > 0) {
                find_leaf_hash(meta.size - 1, requestContext, *tx, true);
            }

            index_t current_size = meta.size;

            for (size_t i = 0; i < values.size(); ++i) {
                const LeafValueType& new_payload = values[i];
                // TODO(Alvaro) - Rethink this. I think it's fine for us to interpret empty values as a regular update
                // (it'd empty out the payload of the zero leaf)
                if (new_payload.is_empty()) {
                    continue;
                }
                fr value = new_payload.get_key();

                // This gives us the leaf that need updating
                index_t low_leaf_index = 0;
                bool is_already_present = false;

                std::tie(is_already_present, low_leaf_index) =
                    store_->find_low_value(new_payload.get_key(), requestContext, *tx);

                // Try and retrieve the leaf pre-image from the cache first.
                // If unsuccessful, derive from the tree and hash based lookup
                std::optional<IndexedLeafValueType> optional_low_leaf =
                    store_->get_cached_leaf_by_index(low_leaf_index);
                IndexedLeafValueType low_leaf;

                if (optional_low_leaf.has_value()) {
                    low_leaf = optional_low_leaf.value();
                } else {
                    std::optional<fr> low_leaf_hash = find_leaf_hash(low_leaf_index, requestContext, *tx, true);

                    if (!low_leaf_hash.has_value()) {
                        throw std::runtime_error(format("Unable to insert values into tree ",
                                                        meta.name,
                                                        ", failed to find low leaf at index ",
                                                        low_leaf_index));
                    }

                    std::optional<IndexedLeafValueType> low_leaf_option =
                        store_->get_leaf_by_hash(low_leaf_hash.value(), *tx, true);

                    if (!low_leaf_option.has_value()) {
                        throw std::runtime_error(format("Unable to insert values into tree ",
                                                        meta.name,
                                                        " failed to get leaf pre-image by hash for index ",
                                                        low_leaf_index));
                    }
                    low_leaf = low_leaf_option.value();
                };

                InsertionUpdates insertion_update = {
                    .low_leaf_update =
                        LeafUpdate{
                            .leaf_index = low_leaf_index,
                            .updated_leaf = IndexedLeafValueType::empty(),
                            .original_leaf = low_leaf,
                        },
                    .new_leaf = std::nullopt,
                };

                if (!is_already_present) {
                    // Update the current leaf to point it to the new leaf
                    IndexedLeafValueType new_leaf =
                        IndexedLeafValueType(new_payload, low_leaf.nextIndex, low_leaf.nextKey);
                    index_t index_of_new_leaf = current_size;
                    low_leaf.nextIndex = index_of_new_leaf;
                    low_leaf.nextKey = value;
                    current_size++;
                    // Cache the new leaf
                    store_->set_leaf_key_at_index(index_of_new_leaf, new_leaf);
                    store_->put_cached_leaf_by_index(index_of_new_leaf, new_leaf);
                    // Update cached low leaf
                    store_->put_cached_leaf_by_index(low_leaf_index, low_leaf);

                    insertion_update.low_leaf_update.updated_leaf = low_leaf;
                    insertion_update.new_leaf = std::pair(new_leaf, index_of_new_leaf);
                } else if (IndexedLeafValueType::is_updateable()) {
                    // Update the current leaf's value, don't change it's link
                    IndexedLeafValueType replacement_leaf =
                        IndexedLeafValueType(new_payload, low_leaf.nextIndex, low_leaf.nextKey);

                    store_->put_cached_leaf_by_index(low_leaf_index, replacement_leaf);
                    insertion_update.low_leaf_update.updated_leaf = replacement_leaf;
                } else {
                    throw std::runtime_error(format("Unable to insert values into tree ",
                                                    meta.name,
                                                    " leaf type ",
                                                    IndexedLeafValueType::name(),
                                                    " is not updateable and ",
                                                    new_payload.get_key(),
                                                    " is already present"));
                }

                response.inner.updates_to_perform.push_back(insertion_update);
            }

            //  Ensure that the tree is not going to be overfilled
            if (current_size > max_size_) {
                throw std::runtime_error(format("Unable to insert values into tree ",
                                                meta.name,
                                                " new size: ",
                                                current_size,
                                                " max size: ",
                                                max_size_));
            }
            // The highest index touched will be current_size - 1
            response.inner.highest_index = current_size - 1;
        },
        completion);
}

} // namespace bb::crypto::merkle_tree
