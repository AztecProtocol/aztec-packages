#include "barretenberg/vm2/tracegen/lib/trace_conversion.hpp"

#include <unordered_map>

#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2::tracegen {

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

AvmFullRow<FF> get_full_row(const TraceContainer& trace, uint32_t row)
{
    AvmFullRow<FF> full_row;
    // Write unshifted columns.
    for (size_t col = 0; col < trace.num_columns(); ++col) {
        full_row.get_column(static_cast<ColumnAndShifts>(col)) = trace.get(static_cast<Column>(col), row);
    }
    // Write the shifted values.
    for (const auto& col : TO_BE_SHIFTED_COLUMNS_ARRAY) {
        auto value = trace.get(static_cast<Column>(col), row + 1);
        auto shifted = shift_column(col);
        full_row.get_column(shifted.value()) = value;
    }
    return full_row;
}

} // namespace bb::avm2::tracegen