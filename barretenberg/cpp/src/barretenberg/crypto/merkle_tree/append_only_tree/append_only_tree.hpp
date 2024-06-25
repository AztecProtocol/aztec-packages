#pragma once
#include "../hash_path.hpp"
#include "../node_store//tree_meta.hpp"
#include "../types.hpp"
#include "barretenberg/common/thread_pool.hpp"
#include <functional>
#include <iostream>
#include <memory>
#include <utility>

namespace bb::crypto::merkle_tree {

using namespace bb;

/**
 * @brief Implements a simple append-only merkle tree
 * Accepts template argument of the type of store backing the tree and the hashing policy
 *
 */
template <typename Store, typename HashingPolicy> class AppendOnlyTree {
  public:
    using append_completion_callback = std::function<void(bb::fr, index_t)>;
    using meta_data_callback = std::function<void(const std::string&, uint32_t, const index_t&, const bb::fr&)>;
    using hash_path_callback = std::function<void(const fr_hash_path&)>;
    using commit_callback = std::function<void()>;
    using rollback_callback = std::function<void()>;

    AppendOnlyTree(Store& store, ThreadPool& workers);
    AppendOnlyTree(AppendOnlyTree const& other) = delete;
    AppendOnlyTree(AppendOnlyTree&& other) = delete;
    AppendOnlyTree& operator=(AppendOnlyTree const& other) = delete;
    AppendOnlyTree& operator=(AppendOnlyTree const&& other) = delete;
    virtual ~AppendOnlyTree() = default;

    /**
     * @brief Adds a single value to the end of the tree
     */
    virtual void add_value(const fr& value, const append_completion_callback& on_completion);

    /**
     * @brief Adds the given set of values to the end of the tree
     */
    virtual void add_values(const std::vector<fr>& values, const append_completion_callback& on_completion);

    /**
     * @brief Returns the hash path from the leaf at the given index to the root
     */
    void get_hash_path(const index_t& index, const hash_path_callback& on_completion, bool includeUncommitted) const;

    void get_meta_data(bool includeUncommitted, const meta_data_callback& on_completion);

    void commit(const commit_callback& on_completion);
    void rollback(const rollback_callback& on_completion);

  protected:
    using ReadTransaction = typename Store::ReadTransaction;
    using ReadTransactionPtr = typename Store::ReadTransactionPtr;
    fr get_element_or_zero(uint32_t level, const index_t& index, ReadTransaction& tx, bool includeUncommitted) const;

    void write_node(uint32_t level, const index_t& index, const fr& value);
    std::pair<bool, fr> read_node(uint32_t level,
                                  const index_t& index,
                                  ReadTransaction& tx,
                                  bool includeUncommitted) const;

    Store& store_;
    uint32_t depth_;
    std::string name_;
    std::vector<fr> zero_hashes_;
    ThreadPool& workers_;
};

template <typename Store, typename HashingPolicy>
AppendOnlyTree<Store, HashingPolicy>::AppendOnlyTree(Store& store, ThreadPool& workers)
    : store_(store)
    , workers_(workers)
{
    index_t stored_size = 0;
    bb::fr stored_root = fr::zero();
    {
        ReadTransactionPtr tx = store_.createReadTransaction();
        store_.get_full_meta(stored_size, stored_root, name_, depth_, *tx, false);
    }
    zero_hashes_.resize(depth_ + 1);

    // Create the zero hashes for the tree
    auto current = HashingPolicy::zero_hash();
    for (size_t i = depth_; i > 0; --i) {
        zero_hashes_[i] = current;
        current = HashingPolicy::hash_pair(current, current);
    }
    zero_hashes_[0] = current;

    if (stored_size == 0) {
        store_.put_meta(0, current);
        store_.commit();
    }
}

template <typename Store, typename HashingPolicy>
void AppendOnlyTree<Store, HashingPolicy>::get_meta_data(bool includeUncommitted,
                                                         const meta_data_callback& on_completion)
{
    auto job = [=]() {
        index_t size = 0;
        bb::fr root = fr::zero();
        {
            ReadTransactionPtr tx = store_.createReadTransaction();
            store_.get_meta(size, root, *tx, includeUncommitted);
        }
        on_completion(name_, depth_, size, root);
    };
    workers_.enqueue(job);
}

template <typename Store, typename HashingPolicy>
void AppendOnlyTree<Store, HashingPolicy>::get_hash_path(const index_t& index,
                                                         const hash_path_callback& on_completion,
                                                         bool includeUncommitted) const
{
    auto job = [=]() {
        fr_hash_path path;
        index_t current_index = index;
        {
            ReadTransactionPtr tx = store_.createReadTransaction();

            for (uint32_t level = depth_; level > 0; --level) {
                bool is_right = static_cast<bool>(current_index & 0x01);
                fr right_value = is_right ? get_element_or_zero(level, current_index, *tx, includeUncommitted)
                                          : get_element_or_zero(level, current_index + 1, *tx, includeUncommitted);
                fr left_value = is_right ? get_element_or_zero(level, current_index - 1, *tx, includeUncommitted)
                                         : get_element_or_zero(level, current_index, *tx, includeUncommitted);
                path.emplace_back(left_value, right_value);
                current_index >>= 1;
            }
        }
        on_completion(path);
    };
    workers_.enqueue(job);
}

template <typename Store, typename HashingPolicy>
void AppendOnlyTree<Store, HashingPolicy>::add_value(const fr& value, const append_completion_callback& on_completion)
{
    add_values(std::vector<fr>{ value }, on_completion);
}

template <typename Store, typename HashingPolicy>
void AppendOnlyTree<Store, HashingPolicy>::add_values(const std::vector<fr>& values,
                                                      const append_completion_callback& on_completion)
{
    uint32_t start_level = depth_;
    std::shared_ptr<std::vector<fr>> hashes = std::make_shared<std::vector<fr>>(values);

    auto append_op = [=]() -> void {
        bb::fr new_root = fr::zero();
        index_t new_size = 0;
        {
            typename Store::ReadTransactionPtr tx = store_.createReadTransaction();
            index_t start_size;
            bb::fr root;
            store_.get_meta(start_size, root, *tx, true);
            index_t index = start_size;
            uint32_t level = start_level;
            uint32_t number_to_insert = static_cast<uint32_t>(values.size());
            std::vector<fr>& hashes_local = *hashes;
            // Add the values at the leaf nodes of the tree
            for (uint32_t i = 0; i < number_to_insert; ++i) {
                write_node(level, index + i, hashes_local[i]);
            }

            // Hash the values as a sub tree and insert them
            while (number_to_insert > 1) {
                number_to_insert >>= 1;
                index >>= 1;
                --level;
                for (uint32_t i = 0; i < number_to_insert; ++i) {
                    hashes_local[i] = HashingPolicy::hash_pair(hashes_local[i * 2], hashes_local[i * 2 + 1]);
                    write_node(level, index + i, hashes_local[i]);
                }
            }

            // Hash from the root of the sub-tree to the root of the overall tree
            fr new_hash = hashes_local[0];
            while (level > 0) {
                bool is_right = static_cast<bool>(index & 0x01);
                fr left_hash = is_right ? get_element_or_zero(level, index - 1, *tx, true) : new_hash;
                fr right_hash = is_right ? new_hash : get_element_or_zero(level, index + 1, *tx, true);
                new_hash = HashingPolicy::hash_pair(left_hash, right_hash);
                index >>= 1;
                --level;
                if (level > 0) {
                    write_node(level, index, new_hash);
                }
            }
            new_size = start_size + values.size();
            new_root = new_hash;
            store_.put_meta(new_size, new_root);
        }
        on_completion(new_root, new_size);
    };
    workers_.enqueue(append_op);
}

template <typename Store, typename HashingPolicy>
fr AppendOnlyTree<Store, HashingPolicy>::get_element_or_zero(uint32_t level,
                                                             const index_t& index,
                                                             ReadTransaction& tx,
                                                             bool includeUncommitted) const
{
    const std::pair<bool, fr> read_data = read_node(level, index, tx, includeUncommitted);
    if (read_data.first) {
        return read_data.second;
    }
    ASSERT(level > 0 && level < zero_hashes_.size());
    return zero_hashes_[level];
}

template <typename Store, typename HashingPolicy>
void AppendOnlyTree<Store, HashingPolicy>::write_node(uint32_t level, const index_t& index, const fr& value)
{
    std::vector<uint8_t> buf;
    write(buf, value);
    store_.put_node(level, index, buf);
}

template <typename Store, typename HashingPolicy>
std::pair<bool, fr> AppendOnlyTree<Store, HashingPolicy>::read_node(uint32_t level,
                                                                    const index_t& index,
                                                                    ReadTransaction& tx,
                                                                    bool includeUncommitted) const
{
    std::vector<uint8_t> buf;
    bool available = store_.get_node(level, index, buf, tx, includeUncommitted);
    if (!available) {
        return std::make_pair(false, fr::zero());
    }
    fr value = from_buffer<fr>(buf, 0);
    return std::make_pair(true, value);
}

template <typename Store, typename HashingPolicy>
void AppendOnlyTree<Store, HashingPolicy>::commit(const commit_callback& on_completion)
{
    auto job = [=]() {
        store_.commit();
        on_completion();
    };
    workers_.enqueue(job);
}

template <typename Store, typename HashingPolicy>
void AppendOnlyTree<Store, HashingPolicy>::rollback(const rollback_callback& on_completion)
{
    auto job = [=]() {
        store_.rollback();
        on_completion();
    };
    workers_.enqueue(job);
}

} // namespace bb::crypto::merkle_tree