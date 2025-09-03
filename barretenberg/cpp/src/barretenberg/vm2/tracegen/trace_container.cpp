#include "barretenberg/vm2/tracegen/trace_container.hpp"

#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2::tracegen {
namespace {

// We need a zero value to return (a reference to) when a value is not found.
static const FF zero = FF::zero();
constexpr auto clk_column = Column::precomputed_clk;

} // namespace

TraceContainer::TraceContainer()
    : trace(std::make_unique<std::array<SparseColumn, NUM_COLUMNS_WITHOUT_SHIFTS>>())
{}

const FF& TraceContainer::get(Column col, uint32_t row) const
{
    auto& column_data = (*trace)[static_cast<size_t>(col)];
    std::shared_lock lock(column_data.mutex);
    const auto it = column_data.rows.find(row);
    return it == column_data.rows.end() ? zero : it->second;
}

const FF& TraceContainer::get_column_or_shift(ColumnAndShifts col, uint32_t row) const
{
    if (is_shift(col)) {
        return get(unshift_column(col).value(), row + 1);
    }
    return get(static_cast<Column>(col), row);
}

void TraceContainer::set(Column col, uint32_t row, const FF& value)
{
    auto& column_data = (*trace)[static_cast<size_t>(col)];
    std::unique_lock lock(column_data.mutex);
    if (!value.is_zero()) {
        column_data.rows.insert_or_assign(row, value);
        column_data.max_row_number = std::max(column_data.max_row_number, static_cast<int64_t>(row));
    } else {
        auto num_erased = column_data.rows.erase(row);
        if (column_data.max_row_number == row && num_erased > 0) {
            // This shouldn't happen often. We delay recalculation of the max row number
            // until someone actually needs it.
            column_data.row_number_dirty = true;
        }
    }
}

void TraceContainer::set(uint32_t row, std::span<const std::pair<Column, FF>> values)
{
    // Fast path for single value (common case)
    if (values.size() == 1) {
        set(values[0].first, row, values[0].second);
        return;
    }

    // Group values by column to minimize mutex acquisitions
    // Use small_vector-like approach with stack allocation for common case
    constexpr size_t STACK_SIZE = 32;
    std::array<std::pair<Column, FF>, STACK_SIZE> stack_buffer;
    std::vector<std::pair<Column, FF>> heap_buffer;

    std::span<std::pair<Column, FF>> sorted_values;

    if (values.size() <= STACK_SIZE) {
        // Use stack allocation for small batches
        for (size_t i = 0; i < values.size(); ++i) {
            stack_buffer[i] = values[i];
        }
        sorted_values = std::span<std::pair<Column, FF>>(stack_buffer.data(), values.size());
    } else {
        // Use heap allocation for large batches
        heap_buffer.reserve(values.size());
        for (const auto& value : values) {
            heap_buffer.push_back(value);
        }
        sorted_values = std::span<std::pair<Column, FF>>(heap_buffer);
    }

    // Sort by column to process each column in one batch and avoid deadlocks
    std::sort(
        sorted_values.begin(), sorted_values.end(), [](const auto& a, const auto& b) { return a.first < b.first; });

    // Process each unique column in batches
    auto& columns = *trace;
    size_t start = 0;

    while (start < sorted_values.size()) {
        Column col = sorted_values[start].first;
        size_t end = start;

        // Find all values for this column
        while (end < sorted_values.size() && sorted_values[end].first == col) {
            ++end;
        }

        // Process this column's values in batch
        auto& column_data = columns[static_cast<size_t>(col)];
        std::unique_lock lock(column_data.mutex);

        for (size_t i = start; i < end; ++i) {
            const FF& value = sorted_values[i].second;
            if (!value.is_zero()) {
                column_data.rows.insert_or_assign(row, value);
                column_data.max_row_number = std::max(column_data.max_row_number, static_cast<int64_t>(row));
            } else {
                auto num_erased = column_data.rows.erase(row);
                if (column_data.max_row_number == row && num_erased > 0) {
                    column_data.row_number_dirty = true;
                }
            }
        }

        start = end;
    }
}

void TraceContainer::reserve_column(Column col, size_t size)
{
    auto& column_data = (*trace)[static_cast<size_t>(col)];
    std::unique_lock lock(column_data.mutex);
    column_data.rows.reserve(size);
}

uint32_t TraceContainer::get_column_rows(Column col) const
{
    auto& column_data = (*trace)[static_cast<size_t>(col)];
    std::unique_lock lock(column_data.mutex);
    if (column_data.row_number_dirty) {
        // Trigger recalculation of max row number.
        auto keys = std::views::keys(column_data.rows);
        const auto it = std::max_element(keys.begin(), keys.end());
        // We use -1 to indicate that the column is empty.
        column_data.max_row_number = it == keys.end() ? -1 : static_cast<int64_t>(*it);
        column_data.row_number_dirty = false;
    }
    return static_cast<uint32_t>(column_data.max_row_number + 1);
}

uint32_t TraceContainer::get_num_rows_without_clk() const
{
    uint32_t max_rows = 0;
    for (size_t col = 0; col < num_columns(); ++col) {
        if (static_cast<Column>(col) != clk_column) {
            max_rows = std::max(max_rows, get_column_rows(static_cast<Column>(col)));
        }
    }
    return max_rows;
}

uint32_t TraceContainer::get_num_rows() const
{
    return std::max(get_column_rows(clk_column), get_num_rows_without_clk());
}

void TraceContainer::visit_column(Column col, const std::function<void(uint32_t, const FF&)>& visitor) const
{
    auto& column_data = (*trace)[static_cast<size_t>(col)];
    std::shared_lock lock(column_data.mutex);
    for (const auto& [row, value] : column_data.rows) {
        visitor(row, value);
    }
}

void TraceContainer::clear_column(Column col)
{
    auto& column_data = (*trace)[static_cast<size_t>(col)];
    std::unique_lock lock(column_data.mutex);
    column_data.rows.clear();
    column_data.max_row_number = 0;
    column_data.row_number_dirty = false;
}

} // namespace bb::avm2::tracegen
