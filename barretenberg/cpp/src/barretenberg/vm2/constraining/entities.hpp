#pragma once

#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2 {

// This helper lets us access entities by column.
// It is critical to achieve performance when calculating lookup inverses.
// See https://github.com/AztecProtocol/aztec-packages/pull/11605 for more details.
template <typename Entities> auto& get_entity_by_column(Entities& entities, ColumnAndShifts c)
{
    // A statically constructed pointer to members of the class, indexed by column.
    // This should only be created once per Entities class.
    static std::array<typename Entities::DataType(Entities::*), NUM_COLUMNS_WITH_SHIFTS> col_ptrs = {
        AVM2_ALL_ENTITIES_E(&Entities::)
    };
    return (entities.*col_ptrs[static_cast<size_t>(c)]);
}

} // namespace bb::avm2
