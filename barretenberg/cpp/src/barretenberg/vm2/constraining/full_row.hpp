#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/constraining/entities.hpp"
#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2 {
namespace tracegen {
// Forward declaration.
class TraceContainer;
} // namespace tracegen

// A bulky full row, mostly for testing purposes.
struct AvmFullRow {
    using DataType = FF;
    FF AVM2_ALL_ENTITIES;

    FF& get(ColumnAndShifts col);
    const FF& get(ColumnAndShifts col) const;
};

// A full row made up of references to fields.
// Currently only used in tracegen tests via trace.as_rows().
// Getters are not supported (however, they could be added).
struct AvmFullRowConstRef {
    using DataType = const FF;
    const FF& AVM2_ALL_ENTITIES;
};

// A cheap proxy for a full row, which holds just a reference to a trace.
struct AvmFullRowProxy {
    const FF& get(ColumnAndShifts col) const;
    uint32_t row_index;
    const tracegen::TraceContainer& trace;
};

} // namespace bb::avm2
