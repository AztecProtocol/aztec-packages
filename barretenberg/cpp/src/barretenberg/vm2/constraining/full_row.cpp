#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2 {
namespace {

template <typename Entities> auto& get_entity_by_column(Entities& entities, ColumnAndShifts c)
{
    // A statically constructed pointer to members of the class, indexed by column.
    // This should only be created once per Entities class.
    static std::array<typename Entities::DataType(Entities::*), NUM_COLUMNS_WITH_SHIFTS> col_ptrs = {
        AVM2_ALL_ENTITIES_E(&Entities::)
    };
    return (entities.*col_ptrs[static_cast<size_t>(c)]);
}

} // namespace

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
