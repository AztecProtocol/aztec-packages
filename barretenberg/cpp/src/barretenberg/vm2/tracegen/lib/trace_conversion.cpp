#include "barretenberg/vm2/tracegen/lib/trace_conversion.hpp"

#include <unordered_map>
#include <unordered_set>

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

bool is_shift(ColumnAndShifts c)
{
    static std::unordered_set<ColumnAndShifts> shifted_columns = []() {
        std::unordered_set<ColumnAndShifts> shifted_columns;
        for (const auto& col : SHIFTED_COLUMNS_ARRAY) {
            shifted_columns.insert(col);
        }
        return shifted_columns;
    }();
    return shifted_columns.contains(c);
}

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

std::optional<Column> unshift_column(ColumnAndShifts c)
{
    static std::unordered_map<ColumnAndShifts, Column> unshifts = []() {
        std::unordered_map<ColumnAndShifts, Column> unshifts;
        for (size_t i = 0; i < TO_BE_SHIFTED_COLUMNS_ARRAY.size(); ++i) {
            unshifts[SHIFTED_COLUMNS_ARRAY[i]] = TO_BE_SHIFTED_COLUMNS_ARRAY[i];
        }
        return unshifts;
    }();

    auto it = unshifts.find(c);
    return it == unshifts.end() ? std::nullopt : std::make_optional(it->second);
}

AvmFullRow get_full_row(const TraceContainer& trace, uint32_t row)
{
    AvmFullRow full_row;
    // Write unshifted columns.
    for (size_t col = 0; col < trace.num_columns(); ++col) {
        full_row.get(static_cast<ColumnAndShifts>(col)) = trace.get(static_cast<Column>(col), row);
    }
    // Write the shifted values.
    for (const auto& col : TO_BE_SHIFTED_COLUMNS_ARRAY) {
        auto value = trace.get(static_cast<Column>(col), row + 1);
        auto shifted = shift_column(col);
        full_row.get(shifted.value()) = value;
    }
    return full_row;
}

AvmFullRowConstRef get_full_row_ref(const TraceContainer& trace, uint32_t row)
{
    return [&]<size_t... Is>(std::index_sequence<Is...>) {
        return AvmFullRowConstRef{ trace.get_column_or_shift(static_cast<ColumnAndShifts>(Is), row)... };
    }(std::make_index_sequence<NUM_COLUMNS_WITH_SHIFTS>{});
}

} // namespace bb::avm2::tracegen
