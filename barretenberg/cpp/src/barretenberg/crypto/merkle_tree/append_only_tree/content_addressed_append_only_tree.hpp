#pragma once
#include "../hash_path.hpp"
#include "../node_store//tree_meta.hpp"
#include "../response.hpp"
#include "../types.hpp"
#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/lmdb_store/lmdb_tree_store.hpp"
#include "barretenberg/numeric/bitop/pow.hpp"
#include <cstddef>
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
    using AppendCompletionCallback = std::function<void(const TypedResponse<AddDataResponse>&)>;
    using MetaDataCallback = std::function<void(const TypedResponse<TreeMetaResponse>&)>;
    using HashPathCallback = std::function<void(const TypedResponse<GetSiblingPathResponse>&)>;
    using FindLeafCallback = std::function<void(const TypedResponse<FindLeafIndexResponse>&)>;
    using GetLeafCallback = std::function<void(const TypedResponse<GetLeafResponse>&)>;
    using CommitCallback = std::function<void(const Response&)>;
    using RollbackCallback = std::function<void(const Response&)>;

    // Only construct from provided store and thread pool, no copies or moves
    ContentAddressedAppendOnlyTree(Store& store, ThreadPool& workers);
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
    void get_subtree_sibling_path(index_t leaf_index,
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
     * @param on_completion Callback to be called on completion
     */
    // void get_initial_meta_data(const MetaDataCallback& on_completion) const;

    /**
     * @brief Returns the leaf value at the provided index
     * @param index The index of the leaf to be retrieved
     * @param includeUncommitted Whether to include uncommitted changes
     * @param on_completion Callback to be called on completion
     */
    void get_leaf(const index_t& index, bool includeUncommitted, const GetLeafCallback& completion) const;

    /**
     * @brief Returns the index of the provided leaf in the tree
     */
    void find_leaf_index(const fr& leaf, bool includeUncommitted, const FindLeafCallback& on_completion) const;

    /**
     * @brief Returns the index of the provided leaf in the tree only if it exists after the index value provided
     */
    void find_leaf_index_from(const fr& leaf,
                              index_t start_index,
                              bool includeUncommitted,
                              const FindLeafCallback& on_completion) const;

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

  protected:
    using ReadTransaction = typename Store::ReadTransaction;
    using ReadTransactionPtr = typename Store::ReadTransactionPtr;

    using OptionalSiblingPath = std::vector<std::optional<fr>>;

    fr_sibling_path optional_sibling_path_to_full_sibling_path(const OptionalSiblingPath& optionalPath) const;

    // fr get_element_or_zero(uint32_t level, const index_t& index, ReadTransaction& tx, bool includeUncommitted) const;

    // void write_node(uint32_t level, const index_t& index, const fr& value);
    // std::pair<bool, fr> read_node(uint32_t level,
    //                               const index_t& index,
    //                               ReadTransaction& tx,
    //                               bool includeUncommitted) const;

    void add_values_internal(std::shared_ptr<std::vector<fr>> values,
                             fr& new_root,
                             index_t& new_size,
                             bool update_index);

    void add_values_internal(const std::vector<fr>& values,
                             const AppendCompletionCallback& on_completion,
                             bool update_index);

    OptionalSiblingPath get_subtree_sibling_path_internal(index_t leaf_index,
                                                          uint32_t subtree_depth,
                                                          ReadTransaction& tx,
                                                          bool includeUncommitted) const;

    Store& store_;
    uint32_t depth_;
    std::string name_;
    uint64_t max_size_;
    std::vector<fr> zero_hashes_;
    ThreadPool& workers_;
};

template <typename Store, typename HashingPolicy>
ContentAddressedAppendOnlyTree<Store, HashingPolicy>::ContentAddressedAppendOnlyTree(Store& store, ThreadPool& workers)
    : store_(store)
    , workers_(workers)
{
    TreeMeta meta;
    {
        // start by reading the meta data from the backing store
        ReadTransactionPtr tx = store_.create_read_transaction();
        store_.get_meta(meta, *tx, true);
        // store_.get_full_meta(stored_size, stored_root, name_, depth_, *tx, false);
    }
    depth_ = meta.depth;
    name_ = meta.name;
    zero_hashes_.resize(depth_ + 1);

    // Create the zero hashes for the tree
    auto current = HashingPolicy::zero_hash();
    for (size_t i = depth_; i > 0; --i) {
        zero_hashes_[i] = current;
        // std::cout << "Zero hash at level from leaf: " << current << std::endl;
        current = HashingPolicy::hash_pair(current, current);
    }
    zero_hashes_[0] = current;
    // std::cout << "Zero root: " << current << std::endl;

    if (meta.size == 0) {
        // if the tree is empty then we want to write the initial root
        meta.initialRoot = meta.root = current;
        store_.put_meta(meta);
        store_.commit();
        // we also need to store the initial meta, this commits directly
        // store_.put_initial_meta(0, current);
    }
    max_size_ = numeric::pow64(2, depth_);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::get_meta_data(bool includeUncommitted,
                                                                         const MetaDataCallback& on_completion) const
{
    auto job = [=, this]() {
        execute_and_report<TreeMetaResponse>(
            [=, this](TypedResponse<TreeMetaResponse>& response) {
                ReadTransactionPtr tx = store_.create_read_transaction();
                store_.get_meta(response.inner.meta, *tx, includeUncommitted);
            },
            on_completion);
    };
    workers_.enqueue(job);
}

// template <typename Store, typename HashingPolicy>
// void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::get_initial_meta_data(const MetaDataCallback&
// on_completion) const
// {
//     auto job = [=, this]() {
//         execute_and_report<TreeMetaResponse>(
//             [=, this](TypedResponse<TreeMetaResponse>& response) {
//                 ReadTransactionPtr tx = store_.create_read_transaction();
//                 store_.get_initial_meta(response.inner.size, response.inner.root, *tx);
//                 response.inner.depth = depth_;
//             },
//             on_completion);
//     };
//     workers_.enqueue(job);
// }

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::get_sibling_path(const index_t& index,
                                                                            const HashPathCallback& on_completion,
                                                                            bool includeUncommitted) const
{
    auto job = [=, this]() {
        execute_and_report<GetSiblingPathResponse>(
            [=, this](TypedResponse<GetSiblingPathResponse>& response) {
                ReadTransactionPtr tx = store_.create_read_transaction();
                OptionalSiblingPath optional_path =
                    get_subtree_sibling_path_internal(index, 0, *tx, includeUncommitted);
                response.inner.path = optional_sibling_path_to_full_sibling_path(optional_path);
            },
            on_completion);
    };
    workers_.enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::get_subtree_sibling_path(
    const uint32_t subtree_depth, const HashPathCallback& on_completion, bool includeUncommitted) const
{
    auto job = [=, this]() {
        execute_and_report<GetSiblingPathResponse>(
            [=, this](TypedResponse<GetSiblingPathResponse>& response) {
                ReadTransactionPtr tx = store_.create_read_transaction();
                TreeMeta meta;
                store_.get_meta(meta, *tx, includeUncommitted);
                OptionalSiblingPath optional_path =
                    get_subtree_sibling_path_internal(meta.size, subtree_depth, *tx, includeUncommitted);
                response.inner.path = optional_sibling_path_to_full_sibling_path(optional_path);
            },
            on_completion);
    };
    workers_.enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::get_subtree_sibling_path(
    const index_t leaf_index,
    const uint32_t subtree_depth,
    const HashPathCallback& on_completion,
    bool includeUncommitted) const
{
    auto job = [=, this]() {
        execute_and_report<GetSiblingPathResponse>(
            [=, this](TypedResponse<GetSiblingPathResponse>& response) {
                ReadTransactionPtr tx = store_.create_read_transaction();
                OptionalSiblingPath optional_path =
                    get_subtree_sibling_path_internal(leaf_index, subtree_depth, *tx, includeUncommitted);
                response.inner.path = optional_sibling_path_to_full_sibling_path(optional_path);
            },
            on_completion);
    };
    workers_.enqueue(job);
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
ContentAddressedAppendOnlyTree<Store, HashingPolicy>::OptionalSiblingPath ContentAddressedAppendOnlyTree<
    Store,
    HashingPolicy>::get_subtree_sibling_path_internal(const index_t leaf_index,
                                                      const uint32_t subtree_depth,
                                                      ReadTransaction& tx,
                                                      bool includeUncommitted) const
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
    TreeMeta meta;
    store_.get_meta(meta, tx, includeUncommitted);
    bb::fr hash = meta.root;
    // std::cout << "Getting sibling path for root: " << meta.root << std::endl;

    for (uint32_t level = 0; level < depth_ - subtree_depth; ++level) {
        NodePayload nodePayload;
        store_.get_node(hash, nodePayload, tx, includeUncommitted);
        bool is_right = static_cast<bool>(leaf_index & mask);
        // std::cout << "Level: " << level << ", mask: " << mask << ", is right: " << is_right << ", parent: " << hash
        //           << ", left has value: " << nodePayload.left.has_value()
        //           << ", right has value: " << nodePayload.right.has_value() << std::endl;
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
                ReadTransactionPtr tx = store_.create_read_transaction();
                TreeMeta meta;
                store_.get_meta(meta, *tx, includeUncommitted);
                bb::fr hash = meta.root;
                index_t mask = static_cast<index_t>(1) << (depth_ - 1);
                for (uint32_t i = 0; i < depth_; ++i) {

                    // Extract the node data
                    NodePayload nodePayload;
                    bool success = store_.get_node(hash, nodePayload, *tx, includeUncommitted);
                    if (!success) {
                        response.success = false;
                        return;
                    }

                    // Do we need to go right or left
                    bool is_right = static_cast<bool>(leaf_index & mask);
                    mask >>= 1;

                    // If we don't have a child then this leaf isn't present
                    // If we do, then keep going down the tree
                    std::optional<fr> child = is_right ? nodePayload.right : nodePayload.left;
                    if (!child.has_value()) {
                        response.success = false;
                        return;
                    }
                    hash = child.value();
                }

                // if we have arrived here then the leaf is in 'hash'
                response.success = true;
                response.inner.leaf = hash;
            },
            on_completion);
    };
    workers_.enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::find_leaf_index(const fr& leaf,
                                                                           bool includeUncommitted,
                                                                           const FindLeafCallback& on_completion) const
{
    find_leaf_index_from(leaf, 0, includeUncommitted, on_completion);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::find_leaf_index_from(
    const fr& leaf, index_t start_index, bool includeUncommitted, const FindLeafCallback& on_completion) const
{
    auto job = [=, this]() -> void {
        execute_and_report<FindLeafIndexResponse>(
            [=, this](TypedResponse<FindLeafIndexResponse>& response) {
                typename Store::ReadTransactionPtr tx = store_.create_read_transaction();
                std::optional<index_t> leaf_index =
                    store_.find_leaf_index_from(leaf, start_index, *tx, includeUncommitted);
                response.success = leaf_index.has_value();
                if (response.success) {
                    response.inner.leaf_index = leaf_index.value();
                }
            },
            on_completion);
    };
    workers_.enqueue(job);
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
    workers_.enqueue(append_op);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::commit(const CommitCallback& on_completion)
{
    auto job = [=, this]() { execute_and_report([=, this]() { store_.commit(); }, on_completion); };
    workers_.enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::rollback(const RollbackCallback& on_completion)
{
    auto job = [=, this]() { execute_and_report([=, this]() { store_.rollback(); }, on_completion); };
    workers_.enqueue(job);
}

template <typename Store, typename HashingPolicy>
void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::add_values_internal(std::shared_ptr<std::vector<fr>> values,
                                                                               fr& new_root,
                                                                               index_t& new_size,
                                                                               bool update_index)
{

    uint32_t start_level = depth_;
    uint32_t level = start_level;
    std::vector<fr>& hashes_local = *values;
    auto number_to_insert = static_cast<uint32_t>(hashes_local.size());

    typename Store::ReadTransactionPtr tx = store_.create_read_transaction();
    TreeMeta meta;
    store_.get_meta(meta, *tx, true);
    index_t index = meta.size;
    new_size = meta.size + number_to_insert;

    // std::cout << "Here hash local: " << hashes_local[0] << std::endl;

    if (values->empty()) {
        return;
    }

    if (new_size > max_size_) {
        throw std::runtime_error("Tree is full");
    }

    // std::cout << "Here" << std::endl;

    // Add the values at the leaf nodes of the tree
    for (uint32_t i = 0; i < number_to_insert; ++i) {
        // write_node(level, index + i, hashes_local[i]);
        NodePayload payload{ .left = std::nullopt, .right = std::nullopt, .ref = 1 };
        // std::cout << "Writing leaf hash: " << hashes_local[i] << std::endl;
        store_.put_node(hashes_local[i], payload);
    }

    // std::cout << "Here 5" << std::endl;

    // If we have been told to add these leaves to the index then do so now
    if (update_index) {
        for (uint32_t i = 0; i < number_to_insert; ++i) {
            // std::cout << "Updating index " << index + i << " : " << hashes_local[i] << std::endl;
            store_.update_index(index + i, hashes_local[i]);
        }
    }

    // std::cout << "Here 6" << std::endl;

    // Hash the values as a sub tree and insert them
    while (number_to_insert > 1) {
        number_to_insert >>= 1;
        index >>= 1;
        --level;
        std::cout << "To INSERT " << number_to_insert << std::endl;
        for (uint32_t i = 0; i < number_to_insert; ++i) {
            fr left = hashes_local[i * 2];
            fr right = hashes_local[i * 2 + 1];
            hashes_local[i] = HashingPolicy::hash_pair(left, right);
            NodePayload payload{ .left = left, .right = right, .ref = 1 };
            // std::cout << "Left: " << left << ", right: " << right << ", parent: " << hashes_local[i] << std::endl;
            store_.put_node(hashes_local[i], payload);
            // write_node(level, index + i, hashes_local[i]);
        }
    }

    fr new_hash = hashes_local[0];

    std::cout << "LEVEL: " << level << std::endl;

    OptionalSiblingPath optional_sibling_path_to_root =
        get_subtree_sibling_path_internal(meta.size, depth_ - level, *tx, true);
    fr_sibling_path sibling_path_to_root = optional_sibling_path_to_full_sibling_path(optional_sibling_path_to_root);
    size_t sibling_path_index = 0;

    // Hash from the root of the sub-tree to the root of the overall tree

    // std::cout << "Root hash: " << new_hash << std::endl;
    while (level > 0) {
        bool is_right = static_cast<bool>(index & 0x01);
        std::cout << "index: " << index << " sibling path index: " << sibling_path_index << ", is right: " << is_right
                  << std::endl;
        fr left_hash = is_right ? sibling_path_to_root[sibling_path_index] : new_hash;
        fr right_hash = is_right ? new_hash : sibling_path_to_root[sibling_path_index];

        std::optional<fr> left_op = is_right ? optional_sibling_path_to_root[sibling_path_index] : new_hash;
        std::optional<fr> right_op = is_right ? new_hash : optional_sibling_path_to_root[sibling_path_index];

        new_hash = HashingPolicy::hash_pair(left_hash, right_hash);
        std::cout << "Left: " << left_hash << ", right: " << right_hash << ", parent: " << new_hash << std::endl;

        NodePayload payload{ .left = left_op, .right = right_op, .ref = 1 };
        store_.put_node(new_hash, payload);
        index >>= 1;
        --level;
        ++sibling_path_index;
        // if (level > 0) {
        //     write_node(level, index, new_hash);
        // }
    }

    // std::cout << "Here 9" << std::endl;
    new_root = new_hash;
    meta.root = new_hash;
    meta.size = new_size;
    std::cout << "New size: " << meta.size << std::endl;
    store_.put_meta(meta);
}

// Retrieves the value at the given level and index or the 'zero' tree hash if not present
// template <typename Store, typename HashingPolicy>
// fr ContentAddressedAppendOnlyTree<Store, HashingPolicy>::get_element_or_zero(uint32_t level,
//                                                               const index_t& index,
//                                                               ReadTransaction& tx,
//                                                               bool includeUncommitted) const
// {
//     const std::pair<bool, fr> read_data = read_node(level, index, tx, includeUncommitted);
//     if (read_data.first) {
//         return read_data.second;
//     }
//     return zero_hashes_[level];
// }

// template <typename Store, typename HashingPolicy>
// void ContentAddressedAppendOnlyTree<Store, HashingPolicy>::write_node(uint32_t level, const index_t& index, const fr&
// value)
// {
//     std::vector<uint8_t> buf;
//     write(buf, value);
//     store_.put_node(level, index, buf);
// }

// template <typename Store, typename HashingPolicy>
// std::pair<bool, fr> ContentAddressedAppendOnlyTree<Store, HashingPolicy>::read_node(uint32_t level,
//                                                                      const index_t& index,
//                                                                      ReadTransaction& tx,
//                                                                      bool includeUncommitted) const
// {
//     std::vector<uint8_t> buf;
//     bool available = store_.get_node(level, index, buf, tx, includeUncommitted);
//     if (!available) {
//         return std::make_pair(false, fr::zero());
//     }
//     fr value = from_buffer<fr>(buf, 0);
//     return std::make_pair(true, value);
// }

} // namespace bb::crypto::merkle_tree
