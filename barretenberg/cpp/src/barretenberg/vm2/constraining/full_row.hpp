#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/constraining/entities.hpp"
#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2 {

// A bulky full row, mostly for testing purposes.
struct AvmFullRow {
    using DataType = FF;
    FF AVM2_ALL_ENTITIES;

    FF& get(ColumnAndShifts col);
    const FF& get(ColumnAndShifts col) const;
};

// A full row made up of references to fields.
// It can be constructed, e.g., from a full row or a trace.
struct AvmFullRowConstRef {
    using DataType = const FF;
    const FF& AVM2_ALL_ENTITIES;

    static AvmFullRowConstRef from_full_row(const AvmFullRow& full_row);
};

} // namespace bb::avm2
