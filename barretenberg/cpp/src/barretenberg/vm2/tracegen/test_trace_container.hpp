#pragma once

#include <unordered_map>
#include <vector>

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/full_row.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class TestTraceContainer : public TraceContainer {
  public:
    using Row = AvmFullRow<FF>;
    using RowTraceContainer = std::vector<Row>;

    TestTraceContainer() = default;
    TestTraceContainer(const std::vector<std::vector<std::pair<Column, FF>>>& values)
    {
        for (uint32_t row = 0; row < values.size(); ++row) {
            set(row, values[row]);
        }
    }

    // Returns a trace in dense format with properly filled in shifted columns.
    RowTraceContainer as_rows() const;
};

} // namespace bb::avm2::tracegen