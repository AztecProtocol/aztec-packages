#include "barretenberg/vm2/simulation/to_radix.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/to_radix_event.hpp"

using ::testing::AllOf;
using ::testing::ElementsAre;
using ::testing::Field;
using ::testing::Return;
using ::testing::SizeIs;

namespace bb::avm2::simulation {
namespace {

TEST(AvmSimulationToRadixTest, BasicBits)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadix to_radix(to_radix_event_emitter);

    auto bits = to_radix.to_le_bits(FF::one(), 254);

    std::vector<bool> expected_result(254, false);
    expected_result[0] = true;

    EXPECT_EQ(bits, expected_result);

    EXPECT_THAT(to_radix_event_emitter.dump_events(),
                AllOf(SizeIs(1),
                      ElementsAre(AllOf(Field(&ToRadixEvent::value, FF::one()),
                                        Field(&ToRadixEvent::radix, 2),
                                        Field(&ToRadixEvent::limbs, SizeIs(254))))));
}

TEST(AvmSimulationToRadixTest, ShortBits)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadix to_radix(to_radix_event_emitter);

    auto bits = to_radix.to_le_bits(FF::one(), 1);

    std::vector<bool> expected_result = { true };

    EXPECT_EQ(bits, expected_result);

    EXPECT_THAT(to_radix_event_emitter.dump_events(),
                AllOf(SizeIs(1), ElementsAre(AllOf(Field(&ToRadixEvent::limbs, SizeIs(1))))));
}

TEST(AvmSimulationToRadixTest, DecomposeOneBitLargeValue)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadix to_radix(to_radix_event_emitter);

    auto bits = to_radix.to_le_bits(FF::neg_one(), 1);

    // first bit of p - 1 is zero
    std::vector<bool> expected_result = { false };

    EXPECT_EQ(bits, expected_result);

    // 254 limbs are needed to represent p - 1
    EXPECT_THAT(to_radix_event_emitter.dump_events(),
                AllOf(SizeIs(1), ElementsAre(AllOf(Field(&ToRadixEvent::limbs, SizeIs(254))))));
}

TEST(AvmSimulationToRadixTest, BasicRadix)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadix to_radix(to_radix_event_emitter);

    auto limbs = to_radix.to_le_radix(FF::one(), 32, 256);

    std::vector<uint8_t> expected_result(32, 0);
    expected_result[0] = 1;

    EXPECT_EQ(limbs, expected_result);

    EXPECT_THAT(to_radix_event_emitter.dump_events(),
                AllOf(SizeIs(1),
                      ElementsAre(AllOf(Field(&ToRadixEvent::value, FF::one()),
                                        Field(&ToRadixEvent::radix, 256),
                                        Field(&ToRadixEvent::limbs, SizeIs(32))))));
}

TEST(AvmSimulationToRadixTest, ShortRadix)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadix to_radix(to_radix_event_emitter);

    auto limbs = to_radix.to_le_radix(FF::one(), 1, 256);

    std::vector<uint8_t> expected_result = { 1 };

    EXPECT_EQ(limbs, expected_result);

    EXPECT_THAT(to_radix_event_emitter.dump_events(),
                AllOf(SizeIs(1), ElementsAre(Field(&ToRadixEvent::limbs, SizeIs(1)))));
}

TEST(AvmSimulationToRadixTest, DecomposeOneRadixLargerValue)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadix to_radix(to_radix_event_emitter);

    auto limbs = to_radix.to_le_radix(FF::neg_one(), 1, 256);

    // first byte of p - 1 is zero
    std::vector<uint8_t> expected_result = { 0 };

    EXPECT_EQ(limbs, expected_result);

    // 32 limbs are needed to represent p - 1
    EXPECT_THAT(to_radix_event_emitter.dump_events(),
                AllOf(SizeIs(1), ElementsAre(AllOf(Field(&ToRadixEvent::limbs, SizeIs(32))))));
}

TEST(AvmSimulationToRadixTest, DecomposeInDecimal)
{
    EventEmitter<ToRadixEvent> to_radix_event_emitter;

    ToRadix to_radix(to_radix_event_emitter);

    auto limbs = to_radix.to_le_radix(1337, 4, 10);

    std::vector<uint8_t> expected_result = { 7, 3, 3, 1 };

    EXPECT_EQ(limbs, expected_result);
}

} // namespace
} // namespace bb::avm2::simulation
