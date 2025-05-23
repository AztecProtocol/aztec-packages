#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/context_stack_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using testing::ElementsAre;
using testing::Field;

using R = TestTraceContainer::Row;

TEST(ContextStackTraceGenTest, TraceGenerationSnapshot)
{
    TestTraceContainer trace;
    ContextStackTraceBuilder builder;

    builder.process({ {
                        .id = 1,
                        .parent_id = 0,
                        .next_pc = 20,
                        .msg_sender = 30,
                        .contract_addr = 40,
                        .is_static = false,
                    } },
                    trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Only one row.
                    AllOf(ROW_FIELD_EQ(R, context_stack_context_id, 1),
                          ROW_FIELD_EQ(R, context_stack_parent_id, 0),
                          ROW_FIELD_EQ(R, context_stack_next_pc, 20),
                          ROW_FIELD_EQ(R, context_stack_msg_sender, 30),
                          ROW_FIELD_EQ(R, context_stack_contract_address, 40),
                          ROW_FIELD_EQ(R, context_stack_is_static, false))));
}

} // namespace
} // namespace bb::avm2::tracegen
