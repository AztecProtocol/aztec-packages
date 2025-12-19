#pragma once

#include <cstddef>
#include <cstdint>
#include <future>
#include <mutex>
#include <vector>

#include "barretenberg/common/utils.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/common/map_hashes.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

// A key that uniquely identifies a destination table index.
// An index can be shared if both the outer destination selector and the destination columns match.
struct IndexKey {
    Column outer_dst_selector;
    std::vector<ColumnAndShifts> dst_columns;

    bool operator==(const IndexKey&) const = default;
    size_t hash() const { return bb::utils::hash_as_tuple(outer_dst_selector, dst_columns); }
};

// The index type: maps a hash of field element tuples to a row number.
// The actual tuple values are verified during lookup using the TraceContainer.
using DstIndex = unordered_flat_map<size_t, uint32_t>;

// A thread-safe cache for destination table indices.
// Multiple lookup builders targeting the same destination table can share an index,
// avoiding redundant computation and memory usage.
class SharedIndexCache {
  public:
    SharedIndexCache() = default;

    // Non-copyable and non-movable (due to std::mutex).
    SharedIndexCache(const SharedIndexCache&) = delete;
    SharedIndexCache& operator=(const SharedIndexCache&) = delete;
    SharedIndexCache(SharedIndexCache&&) = delete;
    SharedIndexCache& operator=(SharedIndexCache&&) = delete;

    // Get or build an index for the given destination table.
    // If the index already exists or is being built, this will wait for it and return a reference.
    // If the index doesn't exist, the calling thread will build it using the provided build function.
    //
    // Template parameter N is the tuple size (number of destination columns).
    template <size_t N>
    const DstIndex& get_or_build(Column outer_dst_selector,
                                 const std::array<ColumnAndShifts, N>& dst_columns,
                                 const TraceContainer& trace,
                                 std::function<DstIndex(const TraceContainer&)> build_fn)
    {
        IndexKey key{ outer_dst_selector, { dst_columns.begin(), dst_columns.end() } };

        std::unique_lock lock(mutex_);

        auto it = cache_.find(key);
        if (it != cache_.end()) {
            // Index exists or is being built. Release lock before waiting.
            auto future = it->second;
            lock.unlock();
            return *future.get();
        }

        // We are the first to request this index. Create a promise and store the future.
        auto promise = std::make_shared<std::promise<std::shared_ptr<DstIndex>>>();
        cache_[key] = promise->get_future().share();
        lock.unlock();

        // Build the index outside the lock.
        try {
            auto index = std::make_shared<DstIndex>(build_fn(trace));
            promise->set_value(index);
            return *index;
        } catch (...) {
            promise->set_exception(std::current_exception());
            throw;
        }
    }

  private:
    std::mutex mutex_;
    // The cache stores shared futures that resolve to shared pointers to the indices.
    // Using shared_ptr ensures the index outlives all references to it.
    unordered_flat_map<IndexKey, std::shared_future<std::shared_ptr<DstIndex>>> cache_;
};

} // namespace bb::avm2::tracegen
