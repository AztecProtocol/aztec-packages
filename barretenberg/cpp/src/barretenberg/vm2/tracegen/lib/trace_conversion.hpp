#pragma once

#include <optional>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/full_row.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

std::optional<ColumnAndShifts> shift_column(Column c);
// This is expensive. Only use in debugging and testing.
AvmFullRow<FF> get_full_row(const TraceContainer& trace, uint32_t row);

} // namespace bb::avm2::tracegen