#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/tracegen/lib/trace_conversion.hpp"

namespace bb::avm2::tracegen {

TestTraceContainer::TestTraceContainer(const TestTraceContainer& other)
{
    for (size_t i = 0; i < num_columns(); ++i) {
        const auto column = static_cast<Column>(i);
        other.visit_column(column, [this, column](uint32_t row, const auto& value) { set(column, row, value); });
    }
}

TestTraceContainer::TestTraceContainer(const std::vector<std::vector<std::pair<Column, FF>>>& values)
{
    for (uint32_t row = 0; row < values.size(); ++row) {
        set(row, values[row]);
    }
}

TestTraceContainer TestTraceContainer::from_rows(const std::vector<AvmFullRow>& rows)
{
    TestTraceContainer container;
    for (uint32_t row = 0; row < rows.size(); ++row) {
        const auto& full_row = rows[row];
        for (size_t i = 0; i < container.num_columns(); ++i) {
            const auto column = static_cast<Column>(i);
            container.set(column, row, full_row.get(static_cast<ColumnAndShifts>(column)));
        }
    }
    return container;
}

AvmFullRowProxy TestTraceContainer::get_row(uint32_t row) const
{
    return { row, *this };
}

std::vector<AvmFullRowConstRef> TestTraceContainer::as_rows() const
{
    uint32_t max_rows = get_num_rows();
    std::vector<AvmFullRowConstRef> full_row_trace;
    full_row_trace.reserve(max_rows);
    for (uint32_t i = 0; i < max_rows; ++i) {
        full_row_trace.push_back(get_full_row_ref(*this, i));
    }
    return full_row_trace;
}

} // namespace bb::avm2::tracegen
