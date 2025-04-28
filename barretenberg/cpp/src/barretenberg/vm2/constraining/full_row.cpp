#include "barretenberg/vm2/constraining/full_row.hpp"

namespace bb::avm2 {

FF& AvmFullRow::get(ColumnAndShifts col)
{
    return get_entity_by_column(*this, col);
}
const FF& AvmFullRow::get(ColumnAndShifts col) const
{
    return get_entity_by_column(*this, col);
}

AvmFullRowConstRef AvmFullRowConstRef::from_full_row(const AvmFullRow& full_row)
{
    return { AVM2_ALL_ENTITIES_E(full_row.) };
}

} // namespace bb::avm2
