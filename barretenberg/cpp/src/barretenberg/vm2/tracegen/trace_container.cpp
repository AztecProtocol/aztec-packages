#include "barretenberg/vm2/tracegen/trace_container.hpp"

#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::tracegen {
namespace {

// We need a zero value to return (a reference to) when a value is not found.
static const FF zero = FF::zero();
constexpr auto clk_column = Column::precomputed_clk;

} // namespace

TraceContainer::TraceContainer()
    : trace(std::make_unique<std::array<SparseColumn, NUM_COLUMNS>>())
{}

const FF& TraceContainer::get(Column col, uint32_t row) const
{
    auto& column_data = (*trace)[static_cast<size_t>(col)];
    std::shared_lock lock(column_data.mutex);
    const auto it = column_data.rows.find(row);
    return it == column_data.rows.end() ? zero : it->second;
}

void TraceContainer::set(Column col, uint32_t row, const FF& value)
{
    auto& column_data = (*trace)[static_cast<size_t>(col)];
    std::unique_lock lock(column_data.mutex);
    if (!value.is_zero()) {
        column_data.rows.insert_or_assign(row, value);
        column_data.max_row_number = std::max(column_data.max_row_number, row);
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
    for (const auto& [col, value] : values) {
        set(col, row, value);
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
        column_data.max_row_number = it == keys.end() ? 0 : *it;
        column_data.row_number_dirty = false;
    }
    return column_data.max_row_number + 1;
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