#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2 {

FF& AvmFullRow::get(ColumnAndShifts col)
{
    return get_entity_by_column(*this, col);
}
const FF& AvmFullRow::get(ColumnAndShifts col) const
{
    return get_entity_by_column(*this, col);
}

const FF& AvmFullRowProxy::get(ColumnAndShifts col) const
{
    return trace.get_column_or_shift(col, row_index);
}

} // namespace bb::avm2
