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

TestTraceContainer TestTraceContainer::from_rows(const RowTraceContainer& rows)
{
    TestTraceContainer container;
    for (uint32_t row = 0; row < rows.size(); ++row) {
        const auto& full_row = rows[row];
        for (size_t i = 0; i < container.num_columns(); ++i) {
            const auto column = static_cast<Column>(i);
            container.set(column, row, full_row.get_column(static_cast<ColumnAndShifts>(column)));
        }
    }
    return container;
}

TestTraceContainer::RowTraceContainer TestTraceContainer::as_rows() const
{
    const uint32_t max_rows = get_num_rows();
    RowTraceContainer full_row_trace(max_rows);
    for (uint32_t i = 0; i < max_rows; ++i) {
        full_row_trace[i] = get_full_row(*this, i);
    }
    return full_row_trace;
}

} // namespace bb::avm2::tracegen