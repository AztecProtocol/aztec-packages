#include "barretenberg/vm2/simulation/data_copy.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/lookups_data_copy.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/range_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/calldata_trace.hpp"
#include "barretenberg/vm2/tracegen/data_copy_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using namespace simulation;
using ::testing::NiceMock;
using tracegen::DataCopyTraceBuilder;
using tracegen::TestTraceContainer;

using FF = AvmFlavorSettings::FF;
using C = Column;
using data_copy = bb::avm2::data_copy<FF>;

class DataCopyConstrainingBuilderTest : public ::testing::Test {
  protected:
    DataCopyConstrainingBuilderTest()
    {
        ON_CALL(context, get_memory).WillByDefault(::testing::ReturnRef(mem));
        ON_CALL(context, get_parent_cd_size).WillByDefault(::testing::Return(data.size()));
        ON_CALL(context, get_parent_cd_addr).WillByDefault(::testing::Return(0));
        ON_CALL(context, get_last_rd_addr).WillByDefault(::testing::Return(0));
        ON_CALL(context, get_last_rd_size).WillByDefault(::testing::Return(data.size()));
    }

    ExecutionIdManager execution_id_manager = ExecutionIdManager(0);
    EventEmitter<RangeCheckEvent> range_check_event_emitter;
    RangeCheck range_check = RangeCheck(range_check_event_emitter);
    EventEmitter<DataCopyEvent> event_emitter;
    DataCopy copy_data = DataCopy(execution_id_manager, range_check, event_emitter);
    NiceMock<MockContext> context;
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
        ON_CALL(context, has_parent).WillByDefault(::testing::Return(true));
        ON_CALL(context, get_parent_id).WillByDefault(::testing::Return(1));
        ON_CALL(context, get_context_id).WillByDefault(::testing::Return(2));
    }
};

TEST_F(NestedCdConstrainingBuilderTest, SimpleNestedCdCopy)
{
    uint32_t copy_size = static_cast<uint32_t>(data.size());
    uint32_t cd_offset = 0; // Offset into calldata

    ON_CALL(context, get_calldata(cd_offset, copy_size)).WillByDefault(::testing::Return(data)); // Mock calldata

    copy_data.cd_copy(context, copy_size, cd_offset, dst_addr);

    tracegen::DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    tracegen::RangeCheckTraceBuilder range_check_builder;
    range_check_builder.process(range_check_event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_interaction<DataCopyTraceBuilder,
                      lookup_data_copy_range_read_settings,
                      lookup_data_copy_range_write_settings,
                      lookup_data_copy_range_reads_left_settings,
                      lookup_data_copy_range_max_read_size_diff_settings>(trace);
}

TEST_F(NestedCdConstrainingBuilderTest, NestedCdCopyPadded)
{
    uint32_t cd_offset = 0;

    std::vector<FF> result_cd = data;
    ASSERT_LT(result_cd.size(), 10);                              // Ensure we have less than 10 elements  so we can pad
    result_cd.resize(10, 0);                                      // Pad with zeros to 10 elements
    uint32_t copy_size = static_cast<uint32_t>(result_cd.size()); // Request more than available

    ON_CALL(context, get_calldata(cd_offset, copy_size)).WillByDefault(::testing::Return(result_cd));

    copy_data.cd_copy(context, copy_size, cd_offset, dst_addr);

    tracegen::DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    tracegen::RangeCheckTraceBuilder range_check_builder;
    range_check_builder.process(range_check_event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_interaction<DataCopyTraceBuilder,
                      lookup_data_copy_range_read_settings,
                      lookup_data_copy_range_write_settings,
                      lookup_data_copy_range_reads_left_settings,
                      lookup_data_copy_range_max_read_size_diff_settings>(trace);
}

TEST_F(NestedCdConstrainingBuilderTest, NestedCdCopyPartial)
{
    uint32_t offset = 3;
    uint32_t size = 4;

    // Starting at offset = 3
    std::vector<FF> result_cd = { data.begin() + offset, data.begin() + offset + size };

    ON_CALL(context, get_calldata(offset, size)).WillByDefault(::testing::Return(result_cd));

    copy_data.cd_copy(context, size, offset, dst_addr);

    tracegen::DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    tracegen::RangeCheckTraceBuilder range_check_builder;
    range_check_builder.process(range_check_event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_interaction<DataCopyTraceBuilder,
                      lookup_data_copy_range_read_settings,
                      lookup_data_copy_range_write_settings,
                      lookup_data_copy_range_reads_left_settings,
                      lookup_data_copy_range_max_read_size_diff_settings>(trace);
}

TEST_F(NestedCdConstrainingBuilderTest, OutofRangeError)
{
    uint32_t offset = 10; // Offset beyond the size of calldata
    uint32_t size = 4;

    // Expect an empty vector since the offset is out of range
    ON_CALL(context, get_calldata(offset, size)).WillByDefault(::testing::Return(std::vector<FF>{}));

    uint32_t big_dst_addr = AVM_HIGHEST_MEM_ADDRESS - 1;
    EXPECT_THROW_WITH_MESSAGE(copy_data.cd_copy(context, size, offset, big_dst_addr), "Error during CD/RD copy");

    tracegen::DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    tracegen::RangeCheckTraceBuilder range_check_builder;
    range_check_builder.process(range_check_event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_interaction<DataCopyTraceBuilder,
                      lookup_data_copy_range_read_settings,
                      lookup_data_copy_range_write_settings,
                      lookup_data_copy_range_reads_left_settings,
                      lookup_data_copy_range_max_read_size_diff_settings>(trace);
}

class EnqueuedCdConstrainingBuilderTest : public DataCopyConstrainingBuilderTest {
  protected:
    EnqueuedCdConstrainingBuilderTest()
    {
        // Set up for enqueued call
        ON_CALL(context, has_parent).WillByDefault(::testing::Return(false));
        ON_CALL(context, get_parent_id).WillByDefault(::testing::Return(0));
        ON_CALL(context, get_context_id).WillByDefault(::testing::Return(1));

        // Build Calldata Column
        tracegen::CalldataTraceBuilder calldata_builder;
        CalldataEvent cd_event = {
            .context_id = 1,
            .calldata_length = static_cast<uint32_t>(data.size()),
            .calldata = data,
        };
        calldata_builder.process_retrieval({ cd_event }, trace);
    }
};

TEST_F(EnqueuedCdConstrainingBuilderTest, SimpleEnqueuedCdCopy)
{
    auto copy_size = static_cast<uint32_t>(data.size());
    uint32_t cd_offset = 0;

    ON_CALL(context, get_calldata(cd_offset, copy_size)).WillByDefault(::testing::Return(data));

    copy_data.cd_copy(context, copy_size, cd_offset, dst_addr);

    tracegen::DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    tracegen::RangeCheckTraceBuilder range_check_builder;
    range_check_builder.process(range_check_event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_interaction<DataCopyTraceBuilder,
                      lookup_data_copy_range_read_settings,
                      lookup_data_copy_range_write_settings,
                      lookup_data_copy_range_reads_left_settings,
                      lookup_data_copy_range_max_read_size_diff_settings,
                      lookup_data_copy_col_read_settings>(trace);
}

TEST_F(EnqueuedCdConstrainingBuilderTest, EnqueuedCallCdCopyPadding)
{
    uint32_t cd_offset = 0;
    std::vector<FF> result_cd = data;
    ASSERT_LT(result_cd.size(), 10);                          // Ensure we have less than 10 elements  so we can pad
    result_cd.resize(10, 0);                                  // Pad with zeros to 10 elements
    auto copy_size = static_cast<uint32_t>(result_cd.size()); // Request more than available

    ON_CALL(context, get_calldata(cd_offset, copy_size)).WillByDefault(::testing::Return(result_cd));

    copy_data.cd_copy(context, copy_size, cd_offset, dst_addr);

    tracegen::DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    tracegen::RangeCheckTraceBuilder range_check_builder;
    range_check_builder.process(range_check_event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_interaction<DataCopyTraceBuilder,
                      lookup_data_copy_range_read_settings,
                      lookup_data_copy_range_write_settings,
                      lookup_data_copy_range_reads_left_settings,
                      lookup_data_copy_range_max_read_size_diff_settings,
                      lookup_data_copy_col_read_settings>(trace);
}

TEST_F(EnqueuedCdConstrainingBuilderTest, EnqueuedCallCdCopyPartial)
{
    uint32_t offset = 3;
    uint32_t size = 4;

    // Starting at offset = 3
    std::vector<FF> result_cd = { data.begin() + offset, data.begin() + offset + size };

    ON_CALL(context, get_calldata(offset, size)).WillByDefault(::testing::Return(result_cd));

    copy_data.cd_copy(context, size, offset, dst_addr);

    tracegen::DataCopyTraceBuilder builder;
    builder.process(event_emitter.dump_events(), trace);

    tracegen::RangeCheckTraceBuilder range_check_builder;
    range_check_builder.process(range_check_event_emitter.dump_events(), trace);

    check_relation<data_copy>(trace);
    check_interaction<DataCopyTraceBuilder,
                      lookup_data_copy_range_read_settings,
                      lookup_data_copy_range_write_settings,
                      lookup_data_copy_range_reads_left_settings,
                      lookup_data_copy_range_max_read_size_diff_settings,
                      lookup_data_copy_col_read_settings>(trace);
}
} // namespace
} // namespace bb::avm2::constraining
