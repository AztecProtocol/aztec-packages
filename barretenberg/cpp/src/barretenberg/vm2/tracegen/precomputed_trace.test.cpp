#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/public_inputs_trace.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"
#include "barretenberg/vm2/tracegen_helper.hpp"

#include <cstddef>
#include <gtest/gtest.h>

#include "barretenberg/vm2/generated/columns.hpp"

namespace bb::avm2::tracegen {
namespace {

TEST(PrecomputedTraceTest, AllColumnSizesWithinLimit)
{
    PublicInputsTraceBuilder public_inputs_builder;
    TraceContainer trace = AvmTraceGenHelper().generate_precomputed_columns();
    public_inputs_builder.process_public_inputs_aux_precomputed(trace);

    size_t max_rows = 0;
    for (size_t i = 0; i < TraceContainer::num_columns(); i++) {
        const auto col = static_cast<Column>(i);
        const uint32_t rows = trace.get_column_rows(col);
        if (rows > 0) {
            EXPECT_LE(rows, PRECOMPUTED_TRACE_SIZE)
                << "precomputed column " << i << " has " << rows << " rows, exceeds " << PRECOMPUTED_TRACE_SIZE;
            max_rows = std::max(max_rows, static_cast<size_t>(rows));
        }
    }
    EXPECT_EQ(max_rows, PRECOMPUTED_TRACE_SIZE)
        << "max rows is " << max_rows << ", expected " << PRECOMPUTED_TRACE_SIZE;
}

} // namespace
} // namespace bb::avm2::tracegen
