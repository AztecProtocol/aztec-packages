#pragma once

#include <algorithm>
#include <array>
#include <cstddef>
#include <functional>
#include <memory>
#include <shared_mutex>
#include <span>
#include <unordered_map>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/tracegen/lib/trace_conversion.hpp"

namespace bb::avm2::tracegen {

// This container is thread-safe.
// Contention can only happen when concurrently accessing the same column.
class TraceContainer {
  public:
    TraceContainer();

    const FF& get(Column col, uint32_t row) const;
    template <size_t N> std::array<FF, N> get_multiple(const std::array<ColumnAndShifts, N>& cols, uint32_t row) const
    {
        std::array<FF, N> result;
        for (size_t i = 0; i < N; ++i) {
            if (!is_shift(cols[i])) {
                result[i] = get(static_cast<Column>(cols[i]), row);
            } else {
                Column unshifted_col = unshift_column(cols[i]).value();
                result[i] = get(unshifted_col, row + 1);
            }
        }
        return result;
    }
    // Extended version of get that works with shifted columns. More expensive.
    const FF& get_column_or_shift(ColumnAndShifts col, uint32_t row) const;

    void set(Column col, uint32_t row, const FF& value);
    // Bulk setting for a given row.
    void set(uint32_t row, std::span<const std::pair<Column, FF>> values);
    // Reserve column size. Useful for precomputed columns.
    void reserve_column(Column col, size_t size);

    // Visits non-zero values in a column.
    void visit_column(Column col, const std::function<void(uint32_t, const FF&)>& visitor) const;
    // Returns the number of rows in a column. That is, the maximum non-zero row index + 1.
    uint32_t get_column_rows(Column col) const;
    // Maximum number of rows in any column.
    uint32_t get_num_rows() const;
    // Maximum number of rows in any column (ignoring clk which is always 2^21).
    uint32_t get_num_rows_without_clk() const;
    // Number of columns (without shifts).
    static constexpr size_t num_columns() { return NUM_COLUMNS_WITHOUT_SHIFTS; }

    // Free column memory.
    void clear_column(Column col);

  private:
    // We use a mutex per column to allow for concurrent writes.
    // Observe that therefore concurrent write access to different columns is cheap.
    struct SparseColumn {
        std::shared_mutex mutex;
        int64_t max_row_number = -1; // We use -1 to indicate that the column is empty.
        bool row_number_dirty;       // Needs recalculation.
        // Future memory optimization notes: we can do the same trick as in Operand.
        // That is, store a variant with a unique_ptr. However, we should benchmark this.
        // (see serialization.hpp).
        unordered_flat_map<uint32_t, FF> rows;
    };
    // We store the trace as a sparse matrix.
    // We use a unique_ptr to allocate the array in the heap vs the stack.
    // Even if the _content_ of each unordered_map is always heap-allocated, if we have 3k columns
    // we could unnecessarily put strain on the stack with sizeof(unordered_map) * 3k bytes.
    std::unique_ptr<std::array<SparseColumn, NUM_COLUMNS_WITHOUT_SHIFTS>> trace;
};

} // namespace bb::avm2::tracegen
