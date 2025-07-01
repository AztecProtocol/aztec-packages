#pragma once

#include <optional>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2::tracegen {

bool is_shift(ColumnAndShifts c);
std::optional<ColumnAndShifts> shift_column(Column c);
std::optional<Column> unshift_column(ColumnAndShifts c);
// This is expensive. Only use in debugging and testing.
AvmFullRow get_full_row(const class TraceContainer& trace, uint32_t row);
AvmFullRowConstRef get_full_row_ref(const class TraceContainer& trace, uint32_t row);

} // namespace bb::avm2::tracegen
