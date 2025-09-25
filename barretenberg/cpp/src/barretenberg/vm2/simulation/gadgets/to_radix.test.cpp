#include "barretenberg/vm2/simulation/gadgets/to_radix.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/to_radix_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/memory.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_gt.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/testing/macros.hpp"

using ::testing::AllOf;
using ::testing::ElementsAre;
using ::testing::Field;
using ::testing::Return;
using ::testing::SizeIs;
using ::testing::StrictMock;

namespace bb::avm2::simulation {
namespace {

TEST(AvmSimulationToRadixTest, BasicBits)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    ToRadix to_radix(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    auto [bits, truncated] = to_radix.to_le_bits(FF::one(), 254);

    std::vector<bool> expected_result(254, false);
    expected_result[0] = true;

    EXPECT_EQ(bits, expected_result);
    EXPECT_FALSE(truncated);
    EXPECT_THAT(to_radix_event_emitter.dump_events(),
                AllOf(SizeIs(1),
                      ElementsAre(AllOf(Field(&ToRadixEvent::value, FF::one()),
                                        Field(&ToRadixEvent::radix, 2),
                                        Field(&ToRadixEvent::limbs, SizeIs(254))))));
}

TEST(AvmSimulationToRadixTest, ShortBits)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    ToRadix to_radix(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    auto [bits, truncated] = to_radix.to_le_bits(FF::one(), 1);

    std::vector<bool> expected_result = { true };

    EXPECT_EQ(bits, expected_result);
    EXPECT_FALSE(truncated);

    EXPECT_THAT(to_radix_event_emitter.dump_events(),
                AllOf(SizeIs(1), ElementsAre(AllOf(Field(&ToRadixEvent::limbs, SizeIs(1))))));
}

TEST(AvmSimulationToRadixTest, DecomposeOneBitLargeValue)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    ToRadix to_radix(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    auto [bits, truncated] = to_radix.to_le_bits(FF::neg_one(), 1);

    // first bit of p - 1 is zero
    std::vector<bool> expected_result = { false };

    EXPECT_EQ(bits, expected_result);
    EXPECT_TRUE(truncated);

    // 254 limbs are needed to represent p - 1
    EXPECT_THAT(to_radix_event_emitter.dump_events(),
                AllOf(SizeIs(1), ElementsAre(AllOf(Field(&ToRadixEvent::limbs, SizeIs(254))))));
}

TEST(AvmSimulationToRadixTest, BasicRadix)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    ToRadix to_radix(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    auto [limbs, truncated] = to_radix.to_le_radix(FF::one(), 32, 256);

    std::vector<uint8_t> expected_result(32, 0);
    expected_result[0] = 1;

    EXPECT_EQ(limbs, expected_result);
    EXPECT_FALSE(truncated);

    EXPECT_THAT(to_radix_event_emitter.dump_events(),
                AllOf(SizeIs(1),
                      ElementsAre(AllOf(Field(&ToRadixEvent::value, FF::one()),
                                        Field(&ToRadixEvent::radix, 256),
                                        Field(&ToRadixEvent::limbs, SizeIs(32))))));
}

TEST(AvmSimulationToRadixTest, ShortRadix)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    ToRadix to_radix(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    auto [limbs, truncated] = to_radix.to_le_radix(FF::one(), 1, 256);

    std::vector<uint8_t> expected_result = { 1 };

    EXPECT_EQ(limbs, expected_result);
    EXPECT_FALSE(truncated);

    EXPECT_THAT(to_radix_event_emitter.dump_events(),
                AllOf(SizeIs(1), ElementsAre(Field(&ToRadixEvent::limbs, SizeIs(1)))));
}

TEST(AvmSimulationToRadixTest, DecomposeOneRadixLargerValue)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    ToRadix to_radix(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    auto [limbs, truncated] = to_radix.to_le_radix(FF::neg_one(), 1, 256);

    // first byte of p - 1 is zero
    std::vector<uint8_t> expected_result = { 0 };

    EXPECT_EQ(limbs, expected_result);
    EXPECT_TRUE(truncated);

    // 32 limbs are needed to represent p - 1
    EXPECT_THAT(to_radix_event_emitter.dump_events(),
                AllOf(SizeIs(1), ElementsAre(AllOf(Field(&ToRadixEvent::limbs, SizeIs(32))))));
}

TEST(AvmSimulationToRadixTest, DecomposeInDecimal)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    NoopEventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    StrictMock<MockExecutionIdManager> execution_id_manager;
    StrictMock<MockGreaterThan> gt;
    ToRadix to_radix(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    auto [limbs, truncated] = to_radix.to_le_radix(1337, 4, 10);

    std::vector<uint8_t> expected_result = { 7, 3, 3, 1 };

    EXPECT_EQ(limbs, expected_result);
    EXPECT_FALSE(truncated);
}

TEST(AvmSimulationToRadixMemoryTest, BasicTest)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    EventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    MemoryStore memory;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillOnce(Return(0));
    PureGreaterThan gt;
    ToRadix to_radix(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    const FF value = 1337;
    const uint32_t radix = 10;
    const uint32_t num_limbs = 4;
    bool is_output_bits = false; // Output is U8, not U1
    MemoryAddress dst_addr = 0xdeadbeef;

    to_radix.to_be_radix(memory, value, radix, num_limbs, is_output_bits, dst_addr);

    std::vector<uint8_t> output;
    output.reserve(num_limbs);

    for (uint32_t i = 0; i < num_limbs; ++i) {
        output.emplace_back(memory.get(dst_addr + i).as<uint8_t>());
    }

    std::vector<uint8_t> expected_result = { 1, 3, 3, 7 };
    EXPECT_EQ(output, expected_result);
}

TEST(AvmSimulationToRadixMemoryTest, DstOutOfRange)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    EventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    MemoryStore memory;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillOnce(Return(0));
    PureGreaterThan gt;
    ToRadix to_radix(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    const FF value = 1337;
    const uint32_t radix = 10;
    const uint32_t num_limbs = 4;
    bool is_output_bits = false; // Output is U8, not U1
    uint32_t num_writes = num_limbs - 1;
    MemoryAddress dst_addr =
        AVM_HIGHEST_MEM_ADDRESS - num_writes + 1; // This will cause an out-of-bounds at the last write

    EXPECT_THROW(to_radix.to_be_radix(memory, value, radix, num_limbs, is_output_bits, dst_addr), ToRadixException);
}

TEST(AvmSimulationToRadixMemoryTest, InvalidRadixValue)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    EventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    MemoryStore memory;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillOnce(Return(0));
    PureGreaterThan gt;
    ToRadix to_radix(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    const FF value = 1337;
    const uint32_t radix = 1; // Invalid radix
    const uint32_t num_limbs = 4;
    bool is_output_bits = false; // Output is U8, not U1
    MemoryAddress dst_addr = 0xdeadbeef;

    EXPECT_THROW(to_radix.to_be_radix(memory, value, radix, num_limbs, is_output_bits, dst_addr), ToRadixException);
}

TEST(AvmSimulationToRadixMemoryTest, TruncationError)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;
    EventEmitter<ToRadixMemoryEvent> to_radix_mem_event_emitter;

    MemoryStore memory;
    StrictMock<MockExecutionIdManager> execution_id_manager;
    EXPECT_CALL(execution_id_manager, get_execution_id()).WillOnce(Return(0));
    PureGreaterThan gt;
    ToRadix to_radix(execution_id_manager, gt, to_radix_event_emitter, to_radix_mem_event_emitter);

    const FF value = 1337;
    const uint32_t radix = 10;
    const uint32_t num_limbs = 3;
    bool is_output_bits = false; // Output is U8, not U1
    MemoryAddress dst_addr = 0xdeadbeef;

    EXPECT_THROW_WITH_MESSAGE(to_radix.to_be_radix(memory, value, radix, num_limbs, is_output_bits, dst_addr),
                              "Truncation error");

    std::vector<MemoryValue> expected_limbs = {
        MemoryValue::from<uint8_t>(3),
        MemoryValue::from<uint8_t>(3),
        MemoryValue::from<uint8_t>(7),
    };

    EXPECT_THAT(to_radix_mem_event_emitter.dump_events(),
                AllOf(SizeIs(1),
                      ElementsAre(AllOf(Field(&ToRadixMemoryEvent::limbs, expected_limbs),
                                        Field(&ToRadixMemoryEvent::num_limbs, 3)))));
}

} // namespace
} // namespace bb::avm2::simulation
