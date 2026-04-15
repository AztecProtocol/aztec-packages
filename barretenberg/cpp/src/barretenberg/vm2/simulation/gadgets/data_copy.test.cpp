#include "barretenberg/vm2/simulation/gadgets/data_copy.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/data_copy_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_gt.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"

namespace bb::avm2::simulation {
namespace {

using ::testing::ElementsAre;
using ::testing::Return;
using ::testing::ReturnRef;
using ::testing::StrictMock;

class DataCopySimulationTest : public ::testing::Test {
  protected:
    DataCopySimulationTest()
    {
        ON_CALL(context, get_memory()).WillByDefault(ReturnRef(mem));

        // Standard EventEmitter Expectations
        EXPECT_CALL(context, get_memory());
        EXPECT_CALL(execution_id_manager, get_execution_id());
        EXPECT_CALL(context, get_context_id());
    }

    MemoryStore mem;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    PureGreaterThan gt;
    StrictMock<MockContext> context;
    EventEmitter<DataCopyEvent> event_emitter;
    DataCopy data_copy = DataCopy(execution_id_manager, gt, event_emitter);

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
        EXPECT_CALL(context, get_parent_cd_addr()).WillRepeatedly(Return(parent_cd_addr));
        EXPECT_CALL(context, get_parent_cd_size()).WillRepeatedly(Return(parent_cd_size));
        EXPECT_CALL(context, get_parent_id());
        EXPECT_CALL(context, has_parent()).WillRepeatedly(Return(true));
    }

    std::vector<MemoryValue> calldata = { MemoryValue::from<FF>(1), MemoryValue::from<FF>(2), MemoryValue::from<FF>(3),
                                          MemoryValue::from<FF>(4), MemoryValue::from<FF>(5), MemoryValue::from<FF>(6),
                                          MemoryValue::from<FF>(7), MemoryValue::from<FF>(8) };
    uint32_t parent_cd_addr = 100; // Address where the parent calldata is stored.
    uint32_t parent_cd_size = static_cast<uint32_t>(calldata.size());
    uint32_t cd_offset = 0;
};

TEST_F(NestedCdCopySimulationTest, CdZero)
{
    // Copy zero calldata from the parent context to memory
    uint32_t cd_copy_size = 0;
    uint32_t cd_offset = 0;

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
        .WillOnce(Return(std::vector<MemoryValue>{ MemoryValue::from<FF>(1),
                                                   MemoryValue::from<FF>(2) })); // Only copy first two values

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
    // effective_reads = min(0+10, 8) - 0 = 8 (clamped by src_data_size, not memory)
    uint32_t effective_reads = parent_cd_size;

    EXPECT_CALL(context, get_calldata(cd_offset, effective_reads)).WillOnce(Return(calldata));

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
    // effective_reads = min(6+4, 8) - 6 = 2
    uint32_t effective_reads = 2;

    std::vector<MemoryValue> expected_calldata = {
        MemoryValue::from<FF>(7),
        MemoryValue::from<FF>(8),
    };

    EXPECT_CALL(context, get_calldata(cd_offset, effective_reads)).WillOnce(Return(expected_calldata));

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
        EXPECT_CALL(context, get_last_rd_addr()).WillRepeatedly(Return(child_rd_addr));
        EXPECT_CALL(context, get_last_rd_size()).WillRepeatedly(Return(child_rd_size));
        EXPECT_CALL(context, get_last_child_id()).WillRepeatedly(Return(child_context_id));
        EXPECT_CALL(context, has_parent()).WillRepeatedly(Return(true));
        EXPECT_CALL(context, get_last_child_id()).WillRepeatedly(Return(2));
    }
    std::vector<MemoryValue> returndata = {
        MemoryValue::from<FF>(9), MemoryValue::from<FF>(10), MemoryValue::from<FF>(11), MemoryValue::from<FF>(12)
    }; // Example returndata to be copied.
    uint32_t child_rd_size = static_cast<uint32_t>(returndata.size());
    uint32_t child_rd_addr = 200; // Address where the parent returndata is stored.
    uint32_t child_context_id = 2;
};

TEST_F(RdCopySimulationTest, RdZero)
{
    // Copy zero returndata from the last executed context to memory
    uint32_t rd_copy_size = 0;
    uint32_t rd_offset = 0;

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
        .WillOnce(Return(std::vector<MemoryValue>{ MemoryValue::from<FF>(10),
                                                   MemoryValue::from<FF>(11) })); // Only copy second and third values

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
    // effective_reads = min(0+10, 4) - 0 = 4
    uint32_t effective_reads = child_rd_size;

    EXPECT_CALL(context, get_returndata(rd_offset, effective_reads)).WillOnce(Return(returndata));

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
    // effective_reads = min(2+4, 4) - 2 = 2
    uint32_t effective_reads = 2;

    std::vector<MemoryValue> expected_returndata = {
        MemoryValue::from<FF>(11),
        MemoryValue::from<FF>(12),
    };

    EXPECT_CALL(context, get_returndata(rd_offset, effective_reads)).WillOnce(Return(expected_returndata));

    data_copy.rd_copy(context, rd_copy_size, rd_offset, dst_addr);

    // This should write all the returndata values and pad the rest with zeros
    std::vector<FF> returndata_in_memory;
    for (uint32_t i = 0; i < rd_copy_size; ++i) {
        auto c = mem.get(dst_addr + i);
        returndata_in_memory.emplace_back(c.as_ff());
    }
    EXPECT_THAT(returndata_in_memory, ElementsAre(11, 12, 0, 0));
}

// Test that src out of range does NOT throw — reads are clamped and padded with zeros.
class SrcOutOfRangeCdCopySimulationTest : public DataCopySimulationTest {
  protected:
    SrcOutOfRangeCdCopySimulationTest()
    {
        // Place calldata at near the end of the memory space so reads exceed AVM_MEMORY_SIZE.
        for (uint32_t i = 0; i < parent_cd_size_in_range; ++i) {
            mem.set(parent_cd_addr + i, MemoryValue::from(calldata[i]));
        }
        EXPECT_CALL(context, get_parent_cd_addr()).WillRepeatedly(Return(parent_cd_addr));
        EXPECT_CALL(context, get_parent_cd_size()).WillRepeatedly(Return(parent_cd_size));
        EXPECT_CALL(context, get_parent_id());
        EXPECT_CALL(context, has_parent()).WillRepeatedly(Return(true));
    }

    std::vector<MemoryValue> calldata = { MemoryValue::from<FF>(1),
                                          MemoryValue::from<FF>(2),
                                          MemoryValue::from<FF>(3) };
    // src_addr is 3 slots before AVM_MEMORY_SIZE, but src_data_size is 8 (exceeds memory).
    uint32_t parent_cd_addr = AVM_HIGHEST_MEM_ADDRESS - 2; // 3 valid slots before end
    uint32_t parent_cd_size = 8;                           // Claims 8 elements but only 3 fit in memory
    uint32_t parent_cd_size_in_range = 3;                  // Only 3 actually fit
};

TEST_F(SrcOutOfRangeCdCopySimulationTest, SrcOutOfRangeClampedWithPadding)
{
    uint32_t cd_copy_size = 5;
    uint32_t cd_offset = 0;
    // read_index_upper_bound = min(0+5, 8) = 5
    // read_addr_upper_bound = parent_cd_addr + 5 > AVM_MEMORY_SIZE (since parent_cd_addr = AVM_HIGHEST_MEM_ADDRESS-2)
    // clamped = AVM_MEMORY_SIZE - parent_cd_addr = 3
    // effective_reads = 3 - 0 = 3
    uint32_t effective_reads = 3;

    EXPECT_CALL(context, get_calldata(cd_offset, effective_reads)).WillOnce(Return(calldata));

    // Should NOT throw — src out of range is not an error.
    data_copy.cd_copy(context, cd_copy_size, cd_offset, dst_addr);

    std::vector<FF> result;
    for (uint32_t i = 0; i < cd_copy_size; ++i) {
        result.emplace_back(mem.get(dst_addr + i).as_ff());
    }
    // 3 values from memory, 2 zeros from padding
    EXPECT_THAT(result, ElementsAre(1, 2, 3, 0, 0));
}

class SrcOutOfRangeRdCopySimulationTest : public DataCopySimulationTest {
  protected:
    SrcOutOfRangeRdCopySimulationTest()
    {
        EXPECT_CALL(context, get_last_rd_addr()).WillRepeatedly(Return(child_rd_addr));
        EXPECT_CALL(context, get_last_rd_size()).WillRepeatedly(Return(child_rd_size));
        EXPECT_CALL(context, get_last_child_id()).WillRepeatedly(Return(2));
        EXPECT_CALL(context, has_parent()).WillRepeatedly(Return(true));
    }

    std::vector<MemoryValue> returndata = { MemoryValue::from<FF>(10), MemoryValue::from<FF>(20) };
    uint32_t child_rd_addr = AVM_HIGHEST_MEM_ADDRESS - 1; // 2 valid slots before end
    uint32_t child_rd_size = 6;                           // Claims 6 but only 2 fit
};

TEST_F(SrcOutOfRangeRdCopySimulationTest, SrcOutOfRangeClampedWithPadding)
{
    uint32_t rd_copy_size = 4;
    uint32_t rd_offset = 0;
    // read_index_upper_bound = min(0+4, 6) = 4
    // read_addr_upper_bound = child_rd_addr + 4 > AVM_MEMORY_SIZE
    // clamped = AVM_MEMORY_SIZE - child_rd_addr = 2
    // effective_reads = 2 - 0 = 2
    uint32_t effective_reads = 2;

    EXPECT_CALL(context, get_returndata(rd_offset, effective_reads)).WillOnce(Return(returndata));

    // Should NOT throw
    data_copy.rd_copy(context, rd_copy_size, rd_offset, dst_addr);

    std::vector<FF> result;
    for (uint32_t i = 0; i < rd_copy_size; ++i) {
        result.emplace_back(mem.get(dst_addr + i).as_ff());
    }
    EXPECT_THAT(result, ElementsAre(10, 20, 0, 0));
}

// Src out-of-range with non-zero offset: offset interacts correctly with clamping.
TEST_F(SrcOutOfRangeCdCopySimulationTest, SrcOutOfRangeWithOffset)
{
    uint32_t cd_copy_size = 4;
    uint32_t cd_offset = 1;
    // read_index_upper_bound = min(1+4, 8) = 5
    // read_addr_upper_bound = parent_cd_addr + 5 > AVM_MEMORY_SIZE
    // clamped = AVM_MEMORY_SIZE - parent_cd_addr = 3
    // effective_reads = 3 - 1 = 2
    uint32_t effective_reads = 2;

    std::vector<MemoryValue> expected = { MemoryValue::from<FF>(2), MemoryValue::from<FF>(3) };
    EXPECT_CALL(context, get_calldata(cd_offset, effective_reads)).WillOnce(Return(expected));

    data_copy.cd_copy(context, cd_copy_size, cd_offset, dst_addr);

    std::vector<FF> result;
    for (uint32_t i = 0; i < cd_copy_size; ++i) {
        result.emplace_back(mem.get(dst_addr + i).as_ff());
    }
    // 2 values from memory, 2 zeros from padding
    EXPECT_THAT(result, ElementsAre(2, 3, 0, 0));
}

// Src out-of-range where clamped < offset: all rows are padding (sel_has_reads = 0).
TEST_F(SrcOutOfRangeRdCopySimulationTest, SrcOutOfRangeClampedBelowOffset)
{
    uint32_t rd_copy_size = 3;
    uint32_t rd_offset = 5;
    // read_index_upper_bound = min(5+3, 6) = 6
    // read_addr_upper_bound = child_rd_addr + 6 > AVM_MEMORY_SIZE
    // clamped = AVM_MEMORY_SIZE - child_rd_addr = 2
    // clamped(2) < offset(5), so reads_left = 0, all padding

    // No get_returndata call expected — all padding
    data_copy.rd_copy(context, rd_copy_size, rd_offset, dst_addr);

    std::vector<FF> result;
    for (uint32_t i = 0; i < rd_copy_size; ++i) {
        result.emplace_back(mem.get(dst_addr + i).as_ff());
    }
    EXPECT_THAT(result, ElementsAre(0, 0, 0));
}

} // namespace
} // namespace bb::avm2::simulation
