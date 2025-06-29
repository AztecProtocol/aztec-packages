#include "barretenberg/vm2/simulation/data_copy.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/data_copy_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/testing/mock_bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"

namespace bb::avm2::simulation {
namespace {

using ::testing::_;
using ::testing::ElementsAre;
using ::testing::NiceMock;
using ::testing::Return;
using ::testing::ReturnRef;
using ::testing::StrictMock;

class DataCopySimulationTest : public ::testing::Test {
  protected:
    DataCopySimulationTest()
    {
        ON_CALL(context, get_memory).WillByDefault(ReturnRef(mem));

        // Standard EventEmitter Expectations
        EXPECT_CALL(context, get_memory());
        EXPECT_CALL(execution_id_manager, get_execution_id());
        EXPECT_CALL(context, get_context_id());

        // Range check calls
        EXPECT_CALL(range_check, assert_range(_, 32)).Times(4); // we expect to do 4 range checks during a data copy
    }

    MemoryStore mem;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockContext> context;
    EventEmitter<DataCopyEvent> event_emitter;
    DataCopy data_copy = DataCopy(execution_id_manager, range_check, event_emitter);

    uint32_t dst_addr = 0; // Destination address in memory for the copied returndata.
};

class NestedCdCopySimulationTest : public DataCopySimulationTest {
  protected:
    NestedCdCopySimulationTest()
    {
        // Load up parent context
        for (uint32_t i = 0; i < parent_cd_size; ++i) {
            mem.set(parent_cd_addr + i, MemoryValue::from(calldata[i]));
        }
        EXPECT_CALL(context, get_parent_cd_addr()).Times(2);
        EXPECT_CALL(context, get_parent_cd_size()).WillRepeatedly(Return(parent_cd_size));
        EXPECT_CALL(context, get_parent_id());
        EXPECT_CALL(context, has_parent()).Times(2).WillRepeatedly(Return(true));
    }

    std::vector<FF> calldata = { 1, 2, 3, 4, 5, 6, 7, 8 };
    uint32_t parent_cd_addr = 100; // Address where the parent calldata is stored.
    uint32_t parent_cd_size = static_cast<uint32_t>(calldata.size());
    uint32_t cd_offset = 0;
};

TEST_F(NestedCdCopySimulationTest, CdZero)
{
    // Copy zero calldata from the parent context to memory
    uint32_t cd_copy_size = 0;
    uint32_t cd_offset = 0;

    EXPECT_CALL(context, get_calldata(cd_offset, cd_copy_size))
        .WillOnce(Return(std::vector<FF>{})); // Should return empty vector

    data_copy.cd_copy(context, cd_copy_size, cd_offset, dst_addr);

    auto c = mem.get(dst_addr);
    EXPECT_TRUE(c.as_ff().is_zero());
}

TEST_F(NestedCdCopySimulationTest, CdCopyAll)
{
    // Copy all calldata from the parent context to memory
    uint32_t cd_copy_size = static_cast<uint32_t>(calldata.size());

    EXPECT_CALL(context, get_calldata(cd_offset, cd_copy_size)).WillOnce(Return(calldata));

    uint32_t dst_addr = 0;
    data_copy.cd_copy(context, cd_copy_size, cd_offset, dst_addr);

    // This should write all the calldata values
    std::vector<FF> calldata_in_memory;
    for (uint32_t i = 0; i < cd_copy_size; ++i) {
        auto c = mem.get(dst_addr + i);
        calldata_in_memory.emplace_back(c.as_ff());
    }
    EXPECT_THAT(calldata_in_memory, ElementsAre(1, 2, 3, 4, 5, 6, 7, 8));
}

TEST_F(NestedCdCopySimulationTest, CdCopyPartial)
{
    // Copy come calldata from the parent context to memory
    uint32_t cd_copy_size = 2;

    EXPECT_CALL(context, get_calldata(cd_offset, cd_copy_size))
        .WillOnce(Return(std::vector<FF>{ 1, 2 })); // Only copy first two values

    data_copy.cd_copy(context, cd_copy_size, cd_offset, dst_addr);

    // This should write all the calldata values
    std::vector<FF> calldata_in_memory;
    for (uint32_t i = 0; i < cd_copy_size; ++i) {
        auto c = mem.get(dst_addr + i);
        calldata_in_memory.emplace_back(c.as_ff());
    }
    EXPECT_THAT(calldata_in_memory, ElementsAre(1, 2));
}

TEST_F(NestedCdCopySimulationTest, CdFullWithPadding)
{
    // Copy some calldata from the parent context to memory, but with padding
    uint32_t cd_copy_size = 10; // Request more than available

    std::vector<FF> expected_calldata = { 1, 2, 3, 4, 5, 6, 7, 8, 0, 0 }; // Should pad with zeros
    EXPECT_CALL(context, get_calldata(cd_offset, cd_copy_size)).WillOnce(Return(expected_calldata));

    data_copy.cd_copy(context, cd_copy_size, cd_offset, dst_addr);

    // This should write all the calldata values and pad the rest with zeros
    std::vector<FF> calldata_in_memory;
    for (uint32_t i = 0; i < cd_copy_size; ++i) {
        auto c = mem.get(dst_addr + i);
        calldata_in_memory.emplace_back(c.as_ff());
    }
    EXPECT_THAT(calldata_in_memory, ElementsAre(1, 2, 3, 4, 5, 6, 7, 8, 0, 0));
}

TEST_F(NestedCdCopySimulationTest, CdPartialWithPadding)
{
    // Copy some calldata from the parent context to memory, but with padding
    uint32_t cd_copy_size = 4; // Request more than available
    uint32_t cd_offset = 6;    // Offset into calldata

    std::vector<FF> expected_calldata = { 7, 8, 0, 0 }; // Should pad with zeros

    EXPECT_CALL(context, get_calldata(cd_offset, cd_copy_size)).WillOnce(Return(expected_calldata));

    data_copy.cd_copy(context, cd_copy_size, cd_offset, dst_addr);

    // This should write all the calldata values and pad the rest with zeros
    std::vector<FF> calldata_in_memory;
    for (uint32_t i = 0; i < cd_copy_size; ++i) {
        auto c = mem.get(dst_addr + i);
        calldata_in_memory.emplace_back(c.as_ff());
    }
    EXPECT_THAT(calldata_in_memory, ElementsAre(7, 8, 0, 0));
}

class RdCopySimulationTest : public DataCopySimulationTest {
  protected:
    RdCopySimulationTest()
    {
        // Set up the parent context address
        EXPECT_CALL(context, get_last_rd_addr()).Times(2);
        EXPECT_CALL(context, get_last_rd_size()).WillRepeatedly(Return(parent_rd_size));
        EXPECT_CALL(context, get_child_context())
            .WillOnce(ReturnRef(*child_context));      // Mock the child context to be used in the test.
        EXPECT_CALL(*child_context, get_context_id()); // Mock child context ID.
        EXPECT_CALL(context, has_parent()).WillRepeatedly(Return(true));
    }
    std::vector<FF> returndata = { 9, 10, 11, 12 }; // Example returndata to be copied.
    uint32_t parent_rd_size = static_cast<uint32_t>(returndata.size());
    std::unique_ptr<NiceMock<MockContext>> child_context =
        std::make_unique<NiceMock<MockContext>>(); // Mock child context.

    uint32_t parent_rd_addr = 200; // Address where the parent returndata is stored.
};

TEST_F(RdCopySimulationTest, RdZero)
{
    // Copy zero returndata from the last executed context to memory
    uint32_t rd_copy_size = 0;
    uint32_t rd_offset = 0;

    EXPECT_CALL(context, get_returndata(rd_offset, rd_copy_size))
        .WillOnce(Return(std::vector<FF>{})); // Should return empty vector

    data_copy.rd_copy(context, rd_copy_size, rd_offset, dst_addr);

    auto c = mem.get(dst_addr);
    EXPECT_TRUE(c.as_ff().is_zero());
}

TEST_F(RdCopySimulationTest, RdCopyAll)
{
    // Copy all returndata from the last executed context to memory
    uint32_t rd_copy_size = static_cast<uint32_t>(returndata.size());
    uint32_t rd_offset = 0;

    EXPECT_CALL(context, get_returndata(rd_offset, rd_copy_size)).WillOnce(Return(returndata));

    data_copy.rd_copy(context, rd_copy_size, rd_offset, dst_addr);

    // This should write all the returndata values
    std::vector<FF> returndata_in_memory;
    for (uint32_t i = 0; i < rd_copy_size; ++i) {
        auto c = mem.get(dst_addr + i);
        returndata_in_memory.emplace_back(c.as_ff());
    }
    EXPECT_THAT(returndata_in_memory, ElementsAre(9, 10, 11, 12));
}

TEST_F(RdCopySimulationTest, RdCopyPartial)
{
    // Copy some returndata from the last executed context to memory
    uint32_t rd_copy_size = 2;
    uint32_t rd_offset = 1; // Start copying from second element

    EXPECT_CALL(context, get_returndata(rd_offset, rd_copy_size))
        .WillOnce(Return(std::vector<FF>{ 10, 11 })); // Only copy second and third values

    data_copy.rd_copy(context, rd_copy_size, rd_offset, dst_addr);

    // This should write the selected returndata values
    std::vector<FF> returndata_in_memory;
    for (uint32_t i = 0; i < rd_copy_size; ++i) {
        auto c = mem.get(dst_addr + i);
        returndata_in_memory.emplace_back(c.as_ff());
    }
    EXPECT_THAT(returndata_in_memory, ElementsAre(10, 11));
}

TEST_F(RdCopySimulationTest, RdFullWithPadding)
{
    // Copy some returndata from the last executed context to memory, but with padding
    uint32_t rd_copy_size = 10; // Request more than available
    uint32_t rd_offset = 0;     // Start copying from first element

    std::vector<FF> expected_returndata = { 9, 10, 11, 12, 0, 0, 0, 0, 0, 0 }; // Should pad with zeros
    EXPECT_CALL(context, get_returndata(rd_offset, rd_copy_size)).WillOnce(Return(expected_returndata));

    data_copy.rd_copy(context, rd_copy_size, rd_offset, dst_addr);

    // This should write all the returndata values and pad the rest with zeros
    std::vector<FF> returndata_in_memory;
    for (uint32_t i = 0; i < rd_copy_size; ++i) {
        auto c = mem.get(dst_addr + i);
        returndata_in_memory.emplace_back(c.as_ff());
    }
    EXPECT_THAT(returndata_in_memory, ElementsAre(9, 10, 11, 12, 0, 0, 0, 0, 0, 0));
}

TEST_F(RdCopySimulationTest, RdPartialWithPadding)
{
    // Copy some returndata from the last executed context to memory, but with padding
    uint32_t rd_copy_size = 4; // Request more than available
    uint32_t rd_offset = 2;    // Start copying from third element

    std::vector<FF> expected_returndata = { 11, 12, 0, 0 }; // Should pad with zeros

    EXPECT_CALL(context, get_returndata(rd_offset, rd_copy_size)).WillOnce(Return(expected_returndata));

    data_copy.rd_copy(context, rd_copy_size, rd_offset, dst_addr);

    // This should write all the returndata values and pad the rest with zeros
    std::vector<FF> returndata_in_memory;
    for (uint32_t i = 0; i < rd_copy_size; ++i) {
        auto c = mem.get(dst_addr + i);
        returndata_in_memory.emplace_back(c.as_ff());
    }
    EXPECT_THAT(returndata_in_memory, ElementsAre(11, 12, 0, 0));
}

} // namespace
} // namespace bb::avm2::simulation
