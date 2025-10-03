#include "barretenberg/vm2/simulation/gadgets/data_copy.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_data_copy.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/gt_event.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_gt.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_field_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/calldata_trace.hpp"
#include "barretenberg/vm2/tracegen/data_copy_trace.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using namespace simulation;
using ::testing::Return;
using ::testing::ReturnRef;
using ::testing::StrictMock;
using tracegen::DataCopyTraceBuilder;
using tracegen::ExecutionTraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using data_copy = bb::avm2::data_copy<FF>;

class DataCopyConstrainingBuilderTest : public ::testing::Test {
  protected:
    DataCopyConstrainingBuilderTest() { EXPECT_CALL(context, get_memory).WillRepeatedly(ReturnRef(mem)); }

    ExecutionIdManager execution_id_manager = ExecutionIdManager(0);
    EventEmitter<RangeCheckEvent> range_check_event_emitter;
    RangeCheck range_check = RangeCheck(range_check_event_emitter);
    EventEmitter<GreaterThanEvent> gt_event_emitter;
    StrictMock<MockFieldGreaterThan> mock_field_gt;
    GreaterThan gt = GreaterThan(mock_field_gt, range_check, gt_event_emitter);
    EventEmitter<DataCopyEvent> event_emitter;
    DataCopy copy_data = DataCopy(execution_id_manager, gt, event_emitter);
    StrictMock<MockContext> context;

    MemoryStore mem;

    TestTraceContainer trace;
    uint32_t dst_addr = 0; // Destination address in memory for the data.
    const std::vector<FF> data = { 1, 2, 3, 4, 5, 6, 7, 8 };
};

class NestedCdConstrainingBuilderTest : public DataCopyConstrainingBuilderTest {
  protected:
    NestedCdConstrainingBuilderTest()
    {
        // Set up parent context
        EXPECT_CALL(context, has_parent).WillRepeatedly(Return(true));
        EXPECT_CALL(context, get_parent_id).WillRepeatedly(Return(1));
        EXPECT_CALL(context, get_context_id).WillRepeatedly(Return(2));
        EXPECT_CALL(context, get_parent_cd_size).WillRepeatedly(Return(data.size()));
        EXPECT_CALL(context, get_parent_cd_addr).WillRepeatedly(Return(0));
    }
};

TEST_F(NestedCdConstrainingBuilderTest, CdZeroCopy)
{
    uint32_t copy_size = 0;
    uint32_t cd_offset = 0; // Offset into calldata

    EXPECT_CALL(context, get_calldata(cd_offset, copy_size)).WillOnce(::testing::Return(std::vector<FF>{}));

    copy_data.cd_copy(context, copy_size, cd_offset, dst_addr);

    tracegen::DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    tracegen::GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_interaction<DataCopyTraceBuilder,
                      lookup_data_copy_max_read_index_gt_settings,
                      lookup_data_copy_offset_gt_max_read_index_settings,
                      lookup_data_copy_check_src_addr_in_range_settings,
                      lookup_data_copy_check_dst_addr_in_range_settings>(trace);
}

TEST_F(NestedCdConstrainingBuilderTest, SimpleNestedCdCopy)
{
    uint32_t copy_size = static_cast<uint32_t>(data.size());
    uint32_t cd_offset = 0; // Offset into calldata

    EXPECT_CALL(context, get_calldata(cd_offset, copy_size)).WillOnce(Return(data));

    copy_data.cd_copy(context, copy_size, cd_offset, dst_addr);

    DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    tracegen::GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_interaction<DataCopyTraceBuilder,
                      lookup_data_copy_max_read_index_gt_settings,
                      lookup_data_copy_offset_gt_max_read_index_settings,
                      lookup_data_copy_check_src_addr_in_range_settings,
                      lookup_data_copy_check_dst_addr_in_range_settings>(trace);
}

TEST_F(NestedCdConstrainingBuilderTest, NestedCdCopyPadded)
{
    uint32_t cd_offset = 0;

    std::vector<FF> result_cd = data;
    ASSERT_LT(result_cd.size(), 10);                              // Ensure we have less than 10 elements  so we can pad
    result_cd.resize(10, 0);                                      // Pad with zeros to 10 elements
    uint32_t copy_size = static_cast<uint32_t>(result_cd.size()); // Request more than available

    EXPECT_CALL(context, get_calldata(cd_offset, copy_size)).WillOnce(Return(result_cd));

    copy_data.cd_copy(context, copy_size, cd_offset, dst_addr);

    DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    tracegen::GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_interaction<DataCopyTraceBuilder,
                      lookup_data_copy_max_read_index_gt_settings,
                      lookup_data_copy_offset_gt_max_read_index_settings,
                      lookup_data_copy_check_src_addr_in_range_settings,
                      lookup_data_copy_check_dst_addr_in_range_settings>(trace);
}

TEST_F(NestedCdConstrainingBuilderTest, NestedCdCopyPartial)
{
    uint32_t offset = 3;
    uint32_t size = 4;

    // Starting at offset = 3
    std::vector<FF> result_cd = { data.begin() + offset, data.begin() + offset + size };

    EXPECT_CALL(context, get_calldata(offset, size)).WillOnce(Return(result_cd));

    copy_data.cd_copy(context, size, offset, dst_addr);

    DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    tracegen::GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_interaction<DataCopyTraceBuilder,
                      lookup_data_copy_max_read_index_gt_settings,
                      lookup_data_copy_offset_gt_max_read_index_settings,
                      lookup_data_copy_check_src_addr_in_range_settings,
                      lookup_data_copy_check_dst_addr_in_range_settings>(trace);
}

TEST_F(NestedCdConstrainingBuilderTest, OutofRangeError)
{
    uint32_t offset = 10; // Offset beyond the size of calldata
    uint32_t size = 4;

    uint32_t big_dst_addr = AVM_HIGHEST_MEM_ADDRESS - 1;
    EXPECT_THROW_WITH_MESSAGE(copy_data.cd_copy(context, size, offset, big_dst_addr), "Error during CD/RD copy");

    DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    tracegen::GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_interaction<DataCopyTraceBuilder,
                      lookup_data_copy_max_read_index_gt_settings,
                      lookup_data_copy_offset_gt_max_read_index_settings,
                      lookup_data_copy_check_src_addr_in_range_settings,
                      lookup_data_copy_check_dst_addr_in_range_settings>(trace);
}

class EnqueuedCdConstrainingBuilderTest : public DataCopyConstrainingBuilderTest {
  protected:
    EnqueuedCdConstrainingBuilderTest()
    {
        // Set up for enqueued call
        EXPECT_CALL(context, has_parent).WillRepeatedly(Return(false));
        EXPECT_CALL(context, get_parent_id).WillRepeatedly(Return(0));
        EXPECT_CALL(context, get_context_id).WillRepeatedly(Return(1));
        EXPECT_CALL(context, get_parent_cd_size).WillRepeatedly(Return(data.size()));
        EXPECT_CALL(context, get_parent_cd_addr).WillRepeatedly(Return(0));

        // Build Calldata Column
        tracegen::CalldataTraceBuilder calldata_builder;
        CalldataEvent cd_event = {
            .context_id = 1,
            .calldata_size = static_cast<uint32_t>(data.size()),
            .calldata = data,
        };
        calldata_builder.process_retrieval({ cd_event }, trace);
    }
};

TEST_F(EnqueuedCdConstrainingBuilderTest, CdZeroCopy)
{
    uint32_t copy_size = 0;
    uint32_t cd_offset = 0; // Offset into calldata

    EXPECT_CALL(context, get_calldata(cd_offset, copy_size)).WillOnce(::testing::Return(std::vector<FF>{}));

    copy_data.cd_copy(context, copy_size, cd_offset, dst_addr);

    tracegen::DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    tracegen::GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_all_interactions<DataCopyTraceBuilder>(trace);
}

TEST_F(EnqueuedCdConstrainingBuilderTest, SimpleEnqueuedCdCopy)
{
    auto copy_size = static_cast<uint32_t>(data.size());
    uint32_t cd_offset = 0;

    EXPECT_CALL(context, get_calldata(cd_offset, copy_size)).WillOnce(Return(data));

    copy_data.cd_copy(context, copy_size, cd_offset, dst_addr);

    DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    tracegen::GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_all_interactions<DataCopyTraceBuilder>(trace);
}

TEST_F(EnqueuedCdConstrainingBuilderTest, EnqueuedCallCdCopyPadding)
{
    uint32_t cd_offset = 0;
    std::vector<FF> result_cd = data;
    ASSERT_LT(result_cd.size(), 10);                          // Ensure we have less than 10 elements  so we can pad
    result_cd.resize(10, 0);                                  // Pad with zeros to 10 elements
    auto copy_size = static_cast<uint32_t>(result_cd.size()); // Request more than available

    EXPECT_CALL(context, get_calldata(cd_offset, copy_size)).WillOnce(Return(result_cd));

    copy_data.cd_copy(context, copy_size, cd_offset, dst_addr);

    DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    tracegen::GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_all_interactions<DataCopyTraceBuilder>(trace);
}

TEST_F(EnqueuedCdConstrainingBuilderTest, EnqueuedCallCdCopyPartial)
{
    uint32_t offset = 3;
    uint32_t size = 4;

    // Starting at offset = 3
    std::vector<FF> result_cd = { data.begin() + offset, data.begin() + offset + size };

    EXPECT_CALL(context, get_calldata(offset, size)).WillOnce(Return(result_cd));

    copy_data.cd_copy(context, size, offset, dst_addr);

    DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    tracegen::GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_all_interactions<DataCopyTraceBuilder>(trace);
}

class EnqueuedEmptyCdConstrainingBuilderTest : public DataCopyConstrainingBuilderTest {
  protected:
    EnqueuedEmptyCdConstrainingBuilderTest()
    {
        // Set up for enqueued call
        EXPECT_CALL(context, has_parent).WillRepeatedly(Return(false));
        EXPECT_CALL(context, get_parent_id).WillRepeatedly(Return(0));
        EXPECT_CALL(context, get_context_id).WillRepeatedly(Return(1));
        EXPECT_CALL(context, get_parent_cd_size).WillRepeatedly(Return(0));
        EXPECT_CALL(context, get_parent_cd_addr).WillRepeatedly(Return(0));

        // Build Calldata Column
        tracegen::CalldataTraceBuilder calldata_builder;
        CalldataEvent cd_event = {
            .context_id = 1,
            .calldata_size = 0,
            .calldata = {},
        };
        calldata_builder.process_retrieval({ cd_event }, trace);
    }
};

TEST_F(EnqueuedEmptyCdConstrainingBuilderTest, CdZeroCopy)
{
    uint32_t copy_size = 0;
    uint32_t cd_offset = 0; // Offset into calldata

    EXPECT_CALL(context, get_calldata(cd_offset, copy_size)).WillOnce(::testing::Return(std::vector<FF>{}));

    copy_data.cd_copy(context, copy_size, cd_offset, dst_addr);

    tracegen::DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    tracegen::GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_all_interactions<DataCopyTraceBuilder>(trace);
}

TEST_F(EnqueuedEmptyCdConstrainingBuilderTest, SimpleEnqueuedCdCopy)
{
    uint32_t copy_size = 4;
    uint32_t cd_offset = 0;

    EXPECT_CALL(context, get_calldata(cd_offset, copy_size)).WillOnce(Return(std::vector<FF>{ 0, 0, 0, 0 }));

    copy_data.cd_copy(context, copy_size, cd_offset, dst_addr);

    DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    tracegen::GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_all_interactions<DataCopyTraceBuilder>(trace);
}

TEST_F(EnqueuedEmptyCdConstrainingBuilderTest, EnqueuedCallCdCopyPadding)
{
    uint32_t cd_offset = 0;
    std::vector<FF> result_cd = {};
    result_cd.resize(10, 0);                                  // Pad with zeros to 10 elements
    auto copy_size = static_cast<uint32_t>(result_cd.size()); // Request more than available

    EXPECT_CALL(context, get_calldata(cd_offset, copy_size)).WillOnce(Return(result_cd));

    copy_data.cd_copy(context, copy_size, cd_offset, dst_addr);

    DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    tracegen::GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_all_interactions<DataCopyTraceBuilder>(trace);
}

/////////////////////////////////////////////
// DataCopy Tests with Execution Permutation
/////////////////////////////////////////////

TEST(DataCopyWithExecutionPerm, CdCopy)
{
    // Current Context
    uint32_t context_id = 2;
    uint32_t cd_offset = 3;
    uint32_t copy_size = 4;
    MemoryAddress dst_addr = 0xdeadbeef; // Destination address in memory for the data.
    // Parent Context
    uint32_t parent_context_id = 99;    // Parent context ID
    uint32_t parent_cd_addr = 0xc0ffee; // Parent calldata address in memory.
    const std::vector<FF> data = { 8, 7, 6, 5, 4, 3, 2, 1 };

    // Set up Memory
    MemoryStore mem(static_cast<uint16_t>(context_id));

    // Execution clk is 0 for this test
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillOnce(Return(0));

    // Mock current context
    StrictMock<MockContext> context;
    EXPECT_CALL(context, get_memory).WillRepeatedly(ReturnRef(mem));
    EXPECT_CALL(context, get_parent_cd_size).WillRepeatedly(Return(data.size()));
    EXPECT_CALL(context, has_parent).WillRepeatedly(Return(true));
    EXPECT_CALL(context, get_parent_cd_addr).WillRepeatedly(Return(parent_cd_addr));
    EXPECT_CALL(context, get_calldata(cd_offset, copy_size))
        .WillRepeatedly(::testing::Invoke([&data, cd_offset, copy_size]() {
            // Return a slice of data from the calldata
            return std::vector<FF>(data.begin() + cd_offset, data.begin() + cd_offset + copy_size);
        }));
    EXPECT_CALL(context, get_context_id).WillRepeatedly(Return(context_id));
    EXPECT_CALL(context, get_parent_id).WillRepeatedly(Return(parent_context_id));

    PureGreaterThan gt;

    EventEmitter<DataCopyEvent> event_emitter;
    DataCopy copy_data = DataCopy(execution_id_manager, gt, event_emitter);
    // Set up execution trace
    TestTraceContainer trace({
        {
            { C::precomputed_first_row, 1 },
            { C::execution_sel, 1 },
            { C::execution_context_id, context_id },
            { C::execution_parent_id, parent_context_id },
            { C::execution_sel_execute_calldata_copy, 1 },
            { C::execution_register_0_, copy_size },
            { C::execution_register_1_, cd_offset },
            { C::execution_rop_2_, dst_addr },
            { C::execution_sel_opcode_error, 0 },
            { C::execution_parent_calldata_addr, parent_cd_addr },
            { C::execution_parent_calldata_size, static_cast<uint32_t>(data.size()) },
        },
    });

    copy_data.cd_copy(context, copy_size, cd_offset, dst_addr);

    DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_interaction<ExecutionTraceBuilder,
                      perm_data_copy_dispatch_cd_copy_settings,
                      perm_data_copy_dispatch_rd_copy_settings>(trace);
}

class NestedRdConstrainingBuilderTest : public DataCopyConstrainingBuilderTest {
  protected:
    NestedRdConstrainingBuilderTest()
    {
        // Set up parent context
        EXPECT_CALL(context, has_parent).WillRepeatedly(Return(true));
        EXPECT_CALL(context, get_last_child_id).WillRepeatedly(Return(2));
        EXPECT_CALL(context, get_context_id).WillRepeatedly(Return(2));
        EXPECT_CALL(context, get_last_rd_size).WillRepeatedly(Return(data.size()));
        EXPECT_CALL(context, get_last_rd_addr).WillRepeatedly(Return(0));
    }
};

TEST_F(NestedRdConstrainingBuilderTest, RdZeroCopy)
{
    uint32_t copy_size = 0;
    uint32_t rd_offset = 0; // Offset into calldata

    EXPECT_CALL(context, get_returndata(rd_offset, copy_size)).WillOnce(::testing::Return(std::vector<FF>{}));

    copy_data.rd_copy(context, copy_size, rd_offset, dst_addr);

    tracegen::DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    tracegen::GreaterThanTraceBuilder gt_builder;
    gt_builder.process(gt_event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_all_interactions<DataCopyTraceBuilder>(trace);
}

TEST(DataCopyWithExecutionPerm, RdCopy)
{
    // Current Context
    uint32_t context_id = 2;
    uint32_t rd_offset = 3;
    uint32_t copy_size = 4;
    MemoryAddress dst_addr = 0xdeadbeef; // Destination address in memory for the data.
    // Child Context
    uint32_t child_context_id = 1;          // Child context ID
    MemoryAddress child_rd_addr = 0xc0ffee; // Child returndata address in memory.
    const std::vector<FF> data = { 1, 2, 3, 4, 5, 6, 7, 8 };

    // Set up Memory
    MemoryStore mem;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillOnce(Return(0));
    StrictMock<MockContext> context;
    EXPECT_CALL(context, get_memory).WillRepeatedly(ReturnRef(mem));
    EXPECT_CALL(context, get_last_rd_size).WillRepeatedly(Return(data.size()));
    EXPECT_CALL(context, has_parent).WillRepeatedly(Return(true));
    EXPECT_CALL(context, get_last_rd_addr).WillRepeatedly(Return(child_rd_addr));
    EXPECT_CALL(context, get_returndata(rd_offset, copy_size))
        .WillRepeatedly(::testing::Invoke([&data, rd_offset, copy_size]() {
            // Return a slice of data from the calldata
            return std::vector<FF>(data.begin() + rd_offset, data.begin() + rd_offset + copy_size);
        }));
    EXPECT_CALL(context, get_last_child_id).WillRepeatedly(Return(child_context_id));
    EXPECT_CALL(context, get_context_id).WillRepeatedly(Return(context_id));

    PureGreaterThan gt;

    EventEmitter<DataCopyEvent> event_emitter;
    DataCopy copy_data = DataCopy(execution_id_manager, gt, event_emitter);
    // Set up execution trace
    TestTraceContainer trace({
        {
            { C::precomputed_first_row, 1 },
            { C::execution_sel, 1 },
            { C::execution_context_id, context_id },
            { C::execution_last_child_id, child_context_id },
            { C::execution_sel_execute_returndata_copy, 1 },
            { C::execution_register_0_, copy_size },
            { C::execution_register_1_, rd_offset },
            { C::execution_rop_2_, dst_addr },
            { C::execution_sel_opcode_error, 0 },
            { C::execution_last_child_returndata_addr, child_rd_addr },
            { C::execution_last_child_returndata_size, static_cast<uint32_t>(data.size()) },
        },
    });

    copy_data.rd_copy(context, copy_size, rd_offset, dst_addr);

    DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_interaction<ExecutionTraceBuilder,
                      perm_data_copy_dispatch_cd_copy_settings,
                      perm_data_copy_dispatch_rd_copy_settings>(trace);
}

TEST(DataCopyWithExecutionPerm, ErrorPropagation)
{
    // Current Context
    uint32_t context_id = 2;
    uint32_t rd_offset = 10;
    uint32_t copy_size = 4;
    MemoryAddress big_dst_addr = AVM_HIGHEST_MEM_ADDRESS - 1;

    // Child context
    uint32_t child_context_id = 3;     // Child context ID
    uint32_t child_rd_addr = 0xc0ffee; // Last child returndata address in memory.
    uint32_t child_data_size = 10;     // Size of the last child returndata.

    MemoryStore mem;
    StrictMock<MockContext> context;
    EXPECT_CALL(context, get_memory).WillRepeatedly(ReturnRef(mem));
    EXPECT_CALL(context, get_last_rd_size).WillRepeatedly(Return(child_data_size));
    EXPECT_CALL(context, has_parent).WillRepeatedly(Return(true));
    EXPECT_CALL(context, get_last_rd_addr).WillRepeatedly(Return(child_rd_addr));
    EXPECT_CALL(context, get_context_id).WillRepeatedly(Return(context_id));
    EXPECT_CALL(context, get_last_child_id).WillRepeatedly(Return(child_context_id));

    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillOnce(Return(0));

    PureGreaterThan gt;

    EventEmitter<DataCopyEvent> event_emitter;
    DataCopy copy_data = DataCopy(execution_id_manager, gt, event_emitter);

    TestTraceContainer trace({
        {
            { C::precomputed_first_row, 1 },
            { C::execution_sel, 1 },
            { C::execution_context_id, context_id },
            { C::execution_last_child_id, child_context_id },
            { C::execution_sel_execute_returndata_copy, 1 },
            { C::execution_register_0_, copy_size },
            { C::execution_register_1_, rd_offset },
            { C::execution_rop_2_, big_dst_addr },
            { C::execution_sel_opcode_error, 1 }, // Error flag is on
            { C::execution_last_child_returndata_addr, child_rd_addr },
            { C::execution_last_child_returndata_size, child_data_size },
        },
    });

    EXPECT_THROW_WITH_MESSAGE(copy_data.rd_copy(context, copy_size, rd_offset, big_dst_addr),
                              "Error during CD/RD copy");

    DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_interaction<ExecutionTraceBuilder,
                      perm_data_copy_dispatch_cd_copy_settings,
                      perm_data_copy_dispatch_rd_copy_settings>(trace);
}

} // namespace
} // namespace bb::avm2::constraining
