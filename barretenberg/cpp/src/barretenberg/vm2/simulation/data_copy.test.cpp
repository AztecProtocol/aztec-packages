#include "barretenberg/vm2/simulation/data_copy.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/data_copy_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/testing/mock_bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"

using ::testing::_;
using ::testing::AllOf;
using ::testing::ElementsAre;
using ::testing::NiceMock;
using ::testing::Return;
using ::testing::ReturnRef;
using ::testing::SizeIs;

namespace bb::avm2::simulation {
namespace {

TEST(AvmSimulationDataCopyTest, CdCopyAll)
{
    MemoryStore mem;
    NiceMock<MockContext> context;
    NiceMock<MockBytecodeManager> bytecode_manager;
    EventEmitter<DataCopyEvent> event_emitter;

    DataCopy data_copy(event_emitter);

    std::vector<FF> calldata = { 1, 2, 3, 4, 5, 6, 7, 8 };
    uint32_t parent_cd_addr = 100;
    uint32_t parent_cd_size = static_cast<uint32_t>(calldata.size());
    uint32_t cd_copy_size = 8;
    uint32_t cd_offset = 0;

    EXPECT_CALL(context, get_memory()).WillRepeatedly(ReturnRef(mem));
    EXPECT_CALL(context, get_calldata(cd_offset, cd_copy_size)).WillOnce(Return(calldata));

    EXPECT_CALL(bytecode_manager, get_bytecode_id()).WillRepeatedly(Return(1));
    EXPECT_CALL(context, get_bytecode_manager()).WillRepeatedly(ReturnRef(bytecode_manager));
    EXPECT_CALL(context, get_context_id()).WillRepeatedly(Return(1));
    EXPECT_CALL(context, get_parent_id()).WillRepeatedly(Return(0));
    EXPECT_CALL(context, get_parent_cd_addr()).WillRepeatedly(Return(parent_cd_addr));
    EXPECT_CALL(context, get_parent_cd_size()).WillRepeatedly(Return(parent_cd_size));
    EXPECT_CALL(context, has_parent()).WillRepeatedly(Return(true));

    // Load up parent context
    for (uint32_t i = 0; i < parent_cd_size; ++i) {
        mem.set(parent_cd_addr + i, MemoryValue::from(calldata[i]));
    }

    uint32_t dst_addr = 0;
    data_copy.cd_copy(context, cd_copy_size, cd_offset, dst_addr);

    // // This should write the values 1 to 8 to the memory starting at dst_addr = 0
    std::vector<FF> calldata_in_memory;
    for (uint32_t i = 0; i < 8; ++i) {
        auto c = mem.get(dst_addr + i);
        calldata_in_memory.emplace_back(c.as_ff());
    }
    EXPECT_THAT(calldata_in_memory, ElementsAre(1, 2, 3, 4, 5, 6, 7, 8));
}

} // namespace
} // namespace bb::avm2::simulation
