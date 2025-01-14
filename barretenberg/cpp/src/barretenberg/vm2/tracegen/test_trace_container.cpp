#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

std::optional<ColumnAndShifts> shift_column(Column c)
{
    static std::unordered_map<Column, ColumnAndShifts> shifts = []() {
        std::unordered_map<Column, ColumnAndShifts> shifts;
        for (size_t i = 0; i < TO_BE_SHIFTED_COLUMNS_ARRAY.size(); ++i) {
            shifts[TO_BE_SHIFTED_COLUMNS_ARRAY[i]] = SHIFTED_COLUMNS_ARRAY[i];
        }
        return shifts;
    }();

    auto it = shifts.find(c);
    return it == shifts.end() ? std::nullopt : std::make_optional(it->second);
}

} // namespace

TestTraceContainer::RowTraceContainer TestTraceContainer::as_rows() const
{
    // Find the maximum size of any column.
    const uint32_t max_rows = get_num_rows();

    RowTraceContainer full_row_trace(max_rows);
    // Write the values.
    for (size_t col = 0; col < num_columns(); ++col) {
        visit_column(static_cast<Column>(col), [&](size_t row, const FF& value) {
            full_row_trace[row].get_column(static_cast<ColumnAndShifts>(col)) = value;
        });
    }

    // Write the shifted values.
    for (const auto& col : TO_BE_SHIFTED_COLUMNS_ARRAY) {
        visit_column(col, [&](size_t row, const FF& value) {
            if (row == 0) {
                return;
            }
            auto shifted = shift_column(col);
            full_row_trace[row - 1].get_column(shifted.value()) = value;
        });
    }

    return full_row_trace;
}

} // namespace bb::avm2::tracegen