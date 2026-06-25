#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <memory>
#include <span>
#include <utility>
#include <vector>

#include "barretenberg/common/tuple.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2::tracegen {

// Thread-safety contract.
//
// This container supports concurrent get/set during the parallel tracegen fill phase, *as long as the
// caller never lets two threads touch the same cell (column, row) with at least one of them writing*.
// Under that contract the following are all race-free and never serialize against each other:
//   - writes to different columns (independent storage);
//   - writes to different rows of the same column, even when those rows fall in the same shard (e.g.
//     two chunks that meet at a shard boundary) — distinct rows are distinct objects;
//   - concurrent first writes that race to create the same shard — the shard is installed with a single
//     compare-and-swap, so it is created at most once (the loser frees its spare copy).
//
// What is NOT protected, and what the caller must therefore guarantee never happens concurrently:
//   - two writes to the same (column, row), or a read and a write of the same (column, row). There is
//     no per-cell synchronization, so this is a data race (undefined behavior). Tracegen satisfies the
//     contract because it never writes a given cell from two threads, and every read of a column
//     happens in a later, barrier-separated phase.
//   - get/set concurrent with reserve_column, clear_column, invert_column, or the destructor on the
//     same column. Those operations mutate or free the shard table and assume the parallel fill phase
//     for that column has already joined.
//
// Design. Each column is partitioned into fixed-size row intervals ("shards") of INTERVAL_SIZE rows.
// The per-column shard table is a fixed-size array of atomic pointers indexed by shard (row /
// INTERVAL_SIZE), so the hot get/set path finds its shard with a single lock-free atomic load; that
// path takes no per-column or per-shard lock, so concurrent writers of a column never serialize. A
// shard is created at most once with a lock-free compare-and-swap: a writer that finds a null slot
// constructs a shard and atomically installs it only if the slot is still null, so creators of
// different shards never serialize. Each shard holds its rows in a dense, fixed-size array, so once a
// shard exists, a write is a plain store to a fixed address.
class TraceContainer {
  public:
    // Number of rows owned by a single shard, and the unit of lazy allocation. Writes to different rows
    // never serialize regardless of shard, so this does not affect write parallelism; it only sets how
    // finely columns are allocated and the (rare) granularity at which two chunks can race to create the
    // same shard. Chunked tracegen sizes its chunks as a multiple of this value (and ideally aligns to
    // it) so that concurrent chunks touch disjoint shards. Smaller => less memory wasted in
    // sparsely-filled regions, at the cost of a larger shard table (more atomic slots) and more shard
    // allocations per column.
    static constexpr uint32_t INTERVAL_SIZE = 1u << 11;
    // Number of shards in a column's (fixed-size) shard table. The trace never exceeds the circuit size,
    // so this bounds the shard index. INTERVAL_SIZE divides MAX_AVM_TRACE_SIZE evenly.
    static constexpr size_t NUM_SHARDS = MAX_AVM_TRACE_SIZE / INTERVAL_SIZE;

    TraceContainer();

    const FF& get(Column col, uint32_t row) const;
    // Returns a tuple of const references to the values in the specified columns.
    template <size_t N> auto get_multiple(const std::array<ColumnAndShifts, N>& cols, uint32_t row) const
    {
        return [&]<size_t... Is>(std::index_sequence<Is...>) {
            return flat_tuple::forward_as_tuple(get_column_or_shift(cols[Is], row)...);
        }(std::make_index_sequence<N>{});
    }
    // Extended version of get that works with shifted columns. More expensive.
    const FF& get_column_or_shift(ColumnAndShifts col, uint32_t row) const;

    void set(Column col, uint32_t row, const FF& value);
    // Bulk setting for a given row.
    void set(uint32_t row, std::span<const std::pair<Column, FF>> values);
    // Reserve column size. Useful for precomputed columns.
    void reserve_column(Column col, size_t size);

    // Visits non-zero values in a column. The visit order is unspecified.
    void visit_column(Column col, const std::function<void(uint32_t, const FF&)>& visitor) const;
    // Returns the number of rows in a column. That is, the maximum non-zero row index + 1.
    uint32_t get_column_rows(Column col) const;
    // Maximum number of rows in any column.
    uint32_t get_num_rows() const;
    // Maximum number of rows in any witness column (no precomputed columns).
    uint32_t get_num_witness_rows() const;
    // Number of columns (without shifts).
    static constexpr size_t num_columns() { return NUM_COLUMNS_WITHOUT_SHIFTS; }

    // Batch inverts a set of columns. Not thread-safe.
    void invert_columns(std::span<const Column> cols);

    // Free column memory. Not thread-safe.
    void clear_column(Column col);

  private:
    // A contiguous range of rows [k*INTERVAL_SIZE, (k+1)*INTERVAL_SIZE) within a column.
    // Rows are stored densely: rows[row % INTERVAL_SIZE] holds the value for that absolute row,
    // with zero meaning "absent" (an unset cell reads as zero anyway). Shards are top-dense — once a
    // shard exists it tends to fill — so a flat array beats a hash map: no hashing/rehashing, sequential
    // cache-friendly writes, stable element addresses, and less memory than the map's key + load-factor
    // overhead.
    //
    // Concurrency: there is no per-shard lock. The array is fixed-size and never reallocates, so
    // concurrent writes to different rows of this shard touch distinct objects and are race-free by the
    // C++ memory model, including when two chunks meet at a shard boundary. Same-cell concurrency is the
    // caller's responsibility (see the thread-safety contract on TraceContainer). The row count is derived
    // lazily by scanning (see get_column_rows), avoiding any per-write bookkeeping.
    //
    // NOTE: the {} initializer on rows is required. FF's default constructor is trivial, so it zeroes
    // only under value-initialization; a plain `std::array<FF, INTERVAL_SIZE> rows;` would leave garbage,
    // breaking the "unset cell reads as zero" invariant.
    struct ColumnInterval {
        std::array<FF, INTERVAL_SIZE> rows{};
    };
    // A column is a fixed-size table of lazily-created shards (index = row / INTERVAL_SIZE), held inline
    // as atomic pointers. The hot get/set path reads a slot with a single relaxed/acquire atomic load and
    // never takes a lock, so concurrent writers of the same column do not serialize. A shard is created
    // at most once: a writer that finds a null slot constructs one and installs it with a compare-and-swap,
    // keeping it only if the slot was still null. Slots are never cleared concurrently with get/set
    // (clear_column and the destructor run after the parallel fill phase).
    struct SparseColumn {
        SparseColumn() = default;
        ~SparseColumn()
        {
            for (size_t k = 0; k < NUM_SHARDS; ++k) {
                delete slots[k].load(std::memory_order_relaxed);
            }
        }
        SparseColumn(const SparseColumn&) = delete;
        SparseColumn& operator=(const SparseColumn&) = delete;

        // The {} zero-initializes every slot to nullptr (std::atomic value-initializes its value in C++20).
        std::array<std::atomic<ColumnInterval*>, NUM_SHARDS> slots{};
    };
    // We store the trace as a sparse matrix. Each SparseColumn holds its shard table inline, so
    // sizeof(SparseColumn) is ~NUM_SHARDS atomic pointers; with ~3k columns the whole array is tens of
    // MB, so we heap-allocate it via unique_ptr rather than placing it on the stack.
    std::unique_ptr<std::array<SparseColumn, NUM_COLUMNS_WITHOUT_SHIFTS>> trace;

    // Returns the shard owning shard_idx, creating it (once, via a lock-free compare-and-swap) if absent.
    static ColumnInterval& get_or_create_shard(SparseColumn& column_data, size_t shard_idx);
    // Not thread-safe.
    void invert_column(Column col);
};

} // namespace bb::avm2::tracegen
