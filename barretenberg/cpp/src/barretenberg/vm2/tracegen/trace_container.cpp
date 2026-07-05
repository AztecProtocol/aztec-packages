#include "barretenberg/vm2/tracegen/trace_container.hpp"

#include <algorithm>
#include <ranges>

#include "barretenberg/common/assert.hpp"
<<<<<<< HEAD
=======
#include "barretenberg/common/compiler_hints.hpp"
>>>>>>> origin/public-v5-next
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/ref_vector.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2::tracegen {
namespace {

// We need a zero value to return (a reference to) when a value is not found.
const FF zero = FF::zero();

// Writes each 64-bit limb of the field with a relaxed atomic store. Each limb is naturally aligned (FF is
// alignas(32), 4x uint64_t), so this lowers to 4 plain `movq` stores on x86-64 — no lock, no libatomic call
// (unlike a whole-field std::atomic_ref<FF>, whose 32 bytes exceed the lock-free width). Lets set() make a
// same-cell concurrent write data-race-free when every writer stores the same value.
inline void store_per_limb(FF& cell, const FF& value)
{
    static_assert(sizeof(FF) == 4 * sizeof(uint64_t));
    for (size_t i = 0; i < 4; ++i) {
        std::atomic_ref<uint64_t>(cell.data[i]).store(value.data[i], std::memory_order_relaxed);
    }
}

} // namespace

TraceContainer::TraceContainer()
    : trace(std::make_unique<std::array<SparseColumn, NUM_COLUMNS_WITHOUT_SHIFTS>>())
{}

const FF& TraceContainer::get(Column col, uint32_t row) const
{
    auto& column_data = (*trace)[static_cast<size_t>(col)];
    const size_t shard_idx = row / INTERVAL_SIZE;
    if (shard_idx >= NUM_SHARDS) {
        return zero;
    }
    ColumnInterval* shard = column_data.slots[shard_idx].load(std::memory_order_acquire);
    if (shard == nullptr) {
        return zero;
    }
    return shard->rows[row % INTERVAL_SIZE];
}

const FF& TraceContainer::get_column_or_shift(ColumnAndShifts col, uint32_t row) const
{
    if (is_shift(col)) {
        return get(unshift_column(col).value(), row + 1);
    }
    return get(static_cast<Column>(col), row);
}

TraceContainer::ColumnInterval& TraceContainer::get_or_create_shard(SparseColumn& column_data, size_t shard_idx)
{
    ColumnInterval* shard = column_data.slots[shard_idx].load(std::memory_order_acquire);
    if (shard != nullptr) {
        return *shard;
    }
    // Slow path: this slot has never been written. Construct a shard and install it with a single CAS.
    // Creators of different shards target different atomics and run fully in parallel with no lock. If we
    // lose the race for this slot (only possible when two chunks share a shard at a boundary), we discard
    // our spare copy and use the winner's.
    auto fresh = std::make_unique<ColumnInterval>();
    ColumnInterval* expected = nullptr;
    if (column_data.slots[shard_idx].compare_exchange_strong(
            expected, fresh.get(), std::memory_order_acq_rel, std::memory_order_acquire)) {
        return *fresh.release();
    }
    return *expected; // CAS failure loaded the winning pointer into `expected` (acquire).
}

<<<<<<< HEAD
void TraceContainer::set(Column col, uint32_t row, const FF& value)
=======
void TraceContainer::set(Column col, uint32_t row, const FF& value, bool use_atomic_limbs)
>>>>>>> origin/public-v5-next
{
    auto& column_data = (*trace)[static_cast<size_t>(col)];
    const size_t shard_idx = row / INTERVAL_SIZE;
    BB_ASSERT_LT(shard_idx, NUM_SHARDS, "row exceeds the maximum trace size");
    const uint32_t offset = row % INTERVAL_SIZE;

    if (!value.is_zero()) {
        // Lock-free: a single atomic load finds the shard (created on first write), then we write our
        // own dense cell directly. Different rows are distinct array elements, so concurrent writers of
        // this column (or even of the same shard, at a chunk boundary) never race and never serialize.
<<<<<<< HEAD
        get_or_create_shard(column_data, shard_idx).rows[offset] = value;
    } else {
        // Zero value: clear if present. We never create a shard (clearing an absent row is a no-op).
        ColumnInterval* shard = column_data.slots[shard_idx].load(std::memory_order_acquire);
        if (shard != nullptr) {
            shard->rows[offset] = FF::zero();
=======
        auto& cell = get_or_create_shard(column_data, shard_idx).rows[offset];
        if (BB_UNLIKELY(use_atomic_limbs)) {
            store_per_limb(cell, value);
        } else {
            cell = value;
        }
    } else {
        // Zero value: clear if present. We never create a shard, so sparse (mostly-zero) columns are not
        // materialized (an unset cell already reads as zero).
        ColumnInterval* shard = column_data.slots[shard_idx].load(std::memory_order_acquire);
        if (shard != nullptr) {
            if (BB_UNLIKELY(use_atomic_limbs)) {
                store_per_limb(shard->rows[offset], zero);
            } else {
                shard->rows[offset] = FF::zero();
            }
>>>>>>> origin/public-v5-next
        }
    }
}

void TraceContainer::set(uint32_t row, std::span<const std::pair<Column, FF>> values)
{
    for (const auto& [col, value] : values) {
        set(col, row, value);
    }
}

void TraceContainer::reserve_column(Column col, size_t size)
{
    if (size == 0) {
        return;
    }
    auto& column_data = (*trace)[static_cast<size_t>(col)];
    const size_t num_shards = std::min((size + INTERVAL_SIZE - 1) / INTERVAL_SIZE, NUM_SHARDS);
    // Each shard's dense row array is full size on creation, so reserving just materializes the shards up
    // front (e.g. for precomputed columns). Lock-free: get_or_create_shard installs each via CAS.
    for (size_t k = 0; k < num_shards; ++k) {
        get_or_create_shard(column_data, k);
    }
}

uint32_t TraceContainer::get_column_rows(Column col) const
{
    // The number of rows is (highest non-zero absolute row + 1). We find it by scanning shards from the
    // top down and, within the first non-empty shard, scanning its rows from the top. Shards are
    // top-dense, so this terminates almost immediately. This is only called after the parallel fill
    // phase, so no lock is needed. Lower shards cannot hold a higher row, so the first hit is the answer.
    auto& column_data = (*trace)[static_cast<size_t>(col)];
    for (size_t k = NUM_SHARDS; k-- > 0;) {
        ColumnInterval* shard_ptr = column_data.slots[k].load(std::memory_order_acquire);
        if (shard_ptr == nullptr) {
            continue;
        }
        const auto& rows = shard_ptr->rows;
        const uint32_t base = static_cast<uint32_t>(k) * INTERVAL_SIZE;
        for (uint32_t off = INTERVAL_SIZE; off-- > 0;) {
            if (!rows[off].is_zero()) {
                return base + off + 1;
            }
        }
    }
    return 0;
}

uint32_t TraceContainer::get_num_witness_rows() const
{
    uint32_t max_rows = 0;
    for (size_t col = WITNESS_START_IDX; col < WITNESS_END_IDX; ++col) {
        max_rows = std::max(max_rows, get_column_rows(static_cast<Column>(col)));
    }
    return max_rows;
}

uint32_t TraceContainer::get_num_rows() const
{
    uint32_t max_rows = 0;
    for (size_t col = 0; col < num_columns(); ++col) {
        max_rows = std::max(max_rows, get_column_rows(static_cast<Column>(col)));
    }
    return max_rows;
}

void TraceContainer::visit_column(Column col, const std::function<void(uint32_t, const FF&)>& visitor) const
{
    auto& column_data = (*trace)[static_cast<size_t>(col)];
    for (size_t k = 0; k < NUM_SHARDS; ++k) {
        ColumnInterval* shard_ptr = column_data.slots[k].load(std::memory_order_acquire);
        if (shard_ptr == nullptr) {
            continue;
        }
        auto& shard = *shard_ptr;
        const uint32_t base = static_cast<uint32_t>(k) * INTERVAL_SIZE;
        for (uint32_t off = 0; off < INTERVAL_SIZE; ++off) {
            if (!shard.rows[off].is_zero()) {
                visitor(base + off, shard.rows[off]);
            }
        }
    }
}

void TraceContainer::invert_columns(std::span<const Column> cols)
{
    for (const auto& col : cols) {
        invert_column(col);
    }
}

void TraceContainer::invert_column(Column col)
{
    RefVector<FF> ff_vector;
    auto& column_data = (*trace)[static_cast<size_t>(col)];
    for (size_t k = 0; k < NUM_SHARDS; ++k) {
        ColumnInterval* shard_ptr = column_data.slots[k].load(std::memory_order_acquire);
        if (shard_ptr == nullptr) {
            continue;
        }
        auto& shard = *shard_ptr;
        for (auto& value : shard.rows) {
            if (!value.is_zero()) {
                ff_vector.push_back(value);
            }
        }
    }
    FF::batch_invert<RefVector<FF>>(ff_vector);
}

void TraceContainer::clear_column(Column col)
{
    // Lock-free: exchange hands each non-null shard pointer to exactly one caller, which frees it.
    auto& column_data = (*trace)[static_cast<size_t>(col)];
    for (size_t k = 0; k < NUM_SHARDS; ++k) {
        delete column_data.slots[k].exchange(nullptr, std::memory_order_acq_rel);
    }
}

} // namespace bb::avm2::tracegen
