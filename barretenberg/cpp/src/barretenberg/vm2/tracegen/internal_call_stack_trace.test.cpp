#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/internal_call_stack_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using testing::ElementsAre;
using testing::Field;

using R = TestTraceContainer::Row;

TEST(InternalCallStack, TraceGenerationSnapshot)
{
    TestTraceContainer trace;
    InternalCallStackBuilder builder;

    builder.process({ {
                          .context_id = 1,
                          .entered_call_id = 2,
                          .id = 1,
                          .return_id = 0,
                          .return_pc = 5,
                      },
                      {
                          .context_id = 1,
                          .entered_call_id = 3,
                          .id = 2,
                          .return_id = 1,
                          .return_pc = 10,
                      } },
                    trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Only one row.
                    AllOf(ROW_FIELD_EQ(internal_call_stack_id, 1),
                          ROW_FIELD_EQ(internal_call_stack_entered_call_id, 2),
                          ROW_FIELD_EQ(internal_call_stack_id, 1),
                          ROW_FIELD_EQ(internal_call_stack_return_id, 0),
                          ROW_FIELD_EQ(internal_call_stack_return_pc, 5)),
                    AllOf(ROW_FIELD_EQ(internal_call_stack_id, 2),
                          ROW_FIELD_EQ(internal_call_stack_entered_call_id, 3),
                          ROW_FIELD_EQ(internal_call_stack_id, 2),
                          ROW_FIELD_EQ(internal_call_stack_return_id, 1),
                          ROW_FIELD_EQ(internal_call_stack_return_pc, 10))));
}

} // namespace
} // namespace bb::avm2::tracegen
