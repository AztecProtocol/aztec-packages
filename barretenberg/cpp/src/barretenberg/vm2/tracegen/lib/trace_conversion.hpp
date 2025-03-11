#pragma once

#include <optional>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/full_row.hpp"

namespace bb::avm2::tracegen {

bool is_shift(ColumnAndShifts c);
std::optional<ColumnAndShifts> shift_column(Column c);
std::optional<Column> unshift_column(ColumnAndShifts c);
// This is expensive. Only use in debugging and testing.
AvmFullRow<FF> get_full_row(const class TraceContainer& trace, uint32_t row);

} // namespace bb::avm2::tracegen
