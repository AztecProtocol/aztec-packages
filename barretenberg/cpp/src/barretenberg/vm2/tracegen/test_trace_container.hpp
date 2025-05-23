#pragma once

#include <vector>

#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class TestTraceContainer : public TraceContainer {
  public:
    using Row = AvmFullRowConstRef;
    static TestTraceContainer from_rows(const std::vector<AvmFullRow>& rows);

    TestTraceContainer() = default;
    virtual ~TestTraceContainer() = default;
    TestTraceContainer(const std::vector<std::vector<std::pair<Column, FF>>>& values);
    // Copy constructor. We allow copying for testing purposes.
    TestTraceContainer(const TestTraceContainer&);

    // Returns a row that can be used for accumulation, etc.
    // You cannot refer to entities by name (e.g., row.column_name) using this type.
    AvmFullRowProxy get_row(uint32_t row) const;
    // Returns a trace in dense format with properly filled in shifted columns.
    // The returned rows are lightweight references to the original trace.
    // Therefore the original trace should outlive the returned rows.
    std::vector<AvmFullRowConstRef> as_rows() const;
};

} // namespace bb::avm2::tracegen
