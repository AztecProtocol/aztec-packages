#include "barretenberg/vm2/simulation/bitwise.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {
namespace {

using simulation::Bitwise;
using BitwiseTestParams = std::tuple<MemoryValue, MemoryValue, MemoryValue>;

////////////////////////////////
// Bitwise Operation Test Cases
////////////////////////////////
const std::vector<BitwiseTestParams> test_cases_and = {
    { MemoryValue::from<uint1_t>(1), MemoryValue::from<uint1_t>(1), MemoryValue::from<uint1_t>(1) },
    { MemoryValue::from<uint8_t>(0xAB), MemoryValue::from<uint8_t>(0x5F), MemoryValue::from<uint8_t>(0x0B) },
    { MemoryValue::from<uint16_t>(0xF0F0), MemoryValue::from<uint16_t>(0x3C3C), MemoryValue::from<uint16_t>(0x3030) },
    {
        MemoryValue::from<uint32_t>(0xDEADBEEF),
        MemoryValue::from<uint32_t>(0x12345678),
        MemoryValue::from<uint32_t>(0x12241668),
    },
    {
        MemoryValue::from<uint64_t>(0xCAFEBABEDEADBEEF),
        MemoryValue::from<uint64_t>(0x1234567890ABCDEF),
        MemoryValue::from<uint64_t>(0x234123890A98CEF),
    },
    {
        MemoryValue::from<uint128_t>((static_cast<uint128_t>(0xFEDCBA9876543210ULL) << 64) | 0x0123456789ABCDEFULL),
        MemoryValue::from<uint128_t>((static_cast<uint128_t>(0x1111111111111111ULL) << 64) | 0x2222222222222222ULL),
        MemoryValue::from<uint128_t>((static_cast<uint128_t>(1157442765409226768ULL) << 64) | 9570295239278626ULL),
    }
};

const std::vector<BitwiseTestParams> test_cases_or = {
    { MemoryValue::from<uint1_t>(0), MemoryValue::from<uint1_t>(0), MemoryValue::from<uint1_t>(0) },
    { MemoryValue::from<uint8_t>(0xAB), MemoryValue::from<uint8_t>(0x5F), MemoryValue::from<uint8_t>(0xFF) },
    { MemoryValue::from<uint16_t>(0xF0F0), MemoryValue::from<uint16_t>(0x3C3C), MemoryValue::from<uint16_t>(0xFCFC) },
    {
        MemoryValue::from<uint32_t>(0xDEADBEEF),
        MemoryValue::from<uint32_t>(0x12345678),
        MemoryValue::from<uint32_t>(0xDEBDFEFF),
    },
    {
        MemoryValue::from<uint64_t>(0xCAFEBABEDEADBEEF),
        MemoryValue::from<uint64_t>(0x1234567890ABCDEF),
        MemoryValue::from<uint64_t>(0xDAFEFEFEDEAFFFEF),
    },
    {
        MemoryValue::from<uint128_t>((static_cast<uint128_t>(0xFEDCBA9876543210ULL) << 64) | 0x0123456789ABCDEFULL),
        MemoryValue::from<uint128_t>((static_cast<uint128_t>(0x1111111111111111ULL) << 64) | 0x2222222222222222ULL),
        MemoryValue::from<uint128_t>((static_cast<uint128_t>(0xFFDDBB9977553311ULL) << 64) | 0x23236767ABABEFEFULL),
    }
};

const std::vector<BitwiseTestParams> tests_cases_xor = {
    { MemoryValue::from<uint1_t>(0), MemoryValue::from<uint1_t>(0), MemoryValue::from<uint1_t>(0) },
    { MemoryValue::from<uint8_t>(0xAB), MemoryValue::from<uint8_t>(0x5F), MemoryValue::from<uint8_t>(0xF4) },
    { MemoryValue::from<uint16_t>(0xF0F0), MemoryValue::from<uint16_t>(0x3C3C), MemoryValue::from<uint16_t>(0xCCCC) },
    {
        MemoryValue::from<uint32_t>(0xDEADBEEF),
        MemoryValue::from<uint32_t>(0x12345678),
        MemoryValue::from<uint32_t>(0xCC99E897),
    },
    {
        MemoryValue::from<uint64_t>(0xCAFEBABEDEADBEEF),
        MemoryValue::from<uint64_t>(0x1234567890ABCDEF),
        MemoryValue::from<uint64_t>(0xD8CAECC64E067300),
    },
    {
        MemoryValue::from<uint128_t>((static_cast<uint128_t>(0xFEDCBA9876543210ULL) << 64) | 0x0123456789ABCDEFULL),
        MemoryValue::from<uint128_t>((static_cast<uint128_t>(0x1111111111111111ULL) << 64) | 0x2222222222222222ULL),
        MemoryValue::from<uint128_t>((static_cast<uint128_t>(0xEFCDAB8967452301ULL) << 64) | 0x23016745AB89EFCDULL),
    }
};

////////////////////////////////
// Test Classes + Fixtures
////////////////////////////////
class BitwiseSimulationTest : public testing::Test {
  protected:
    BitwiseSimulationTest() = default;

    EventEmitter<simulation::BitwiseEvent> event_emitter;
    Bitwise bitwise = Bitwise(event_emitter);
};

TEST_F(BitwiseSimulationTest, ErrorTagFF)
{
    MemoryValue a = MemoryValue::from_tag(ValueTag::FF, 1);
    MemoryValue b = MemoryValue::from_tag(ValueTag::U8, 1); // This can be any tag

    EXPECT_THROW(bitwise.and_op(a, b), BitwiseException);
    EXPECT_THROW(bitwise.or_op(a, b), BitwiseException);
    EXPECT_THROW(bitwise.xor_op(a, b), BitwiseException);
}

TEST_F(BitwiseSimulationTest, ErrorTagMismatch)
{
    MemoryValue a = MemoryValue::from_tag(ValueTag::U8, 1);
    MemoryValue b = MemoryValue::from_tag(ValueTag::U16, 1); // Different tags

    EXPECT_THROW(bitwise.and_op(a, b), BitwiseException);
    EXPECT_THROW(bitwise.or_op(a, b), BitwiseException);
    EXPECT_THROW(bitwise.xor_op(a, b), BitwiseException);
}

class BitwiseAndSimulationTest : public BitwiseSimulationTest, public testing::WithParamInterface<BitwiseTestParams> {};
INSTANTIATE_TEST_SUITE_P(SimpleTestSuite, BitwiseAndSimulationTest, testing::ValuesIn(test_cases_and));
class BitwiseOrSimulationTest : public BitwiseSimulationTest, public testing::WithParamInterface<BitwiseTestParams> {};
INSTANTIATE_TEST_SUITE_P(SimpleTestSuite, BitwiseOrSimulationTest, testing::ValuesIn(test_cases_or));
class BitwiseXorSimulationTest : public BitwiseSimulationTest, public testing::WithParamInterface<BitwiseTestParams> {};
INSTANTIATE_TEST_SUITE_P(SimpleTestSuite, BitwiseXorSimulationTest, testing::ValuesIn(tests_cases_xor));

TEST_P(BitwiseAndSimulationTest, SimpleAnd)
{
    EventEmitter<simulation::BitwiseEvent> event_emitter;
    Bitwise bitwise(event_emitter);

    auto [a, b, expected] = GetParam();
    MemoryValue c = bitwise.and_op(a, b);
    EXPECT_EQ(c, expected);
}

TEST_P(BitwiseOrSimulationTest, SimpleOr)
{
    EventEmitter<simulation::BitwiseEvent> event_emitter;
    Bitwise bitwise(event_emitter);

    auto [a, b, expected] = GetParam();
    MemoryValue c = bitwise.or_op(a, b);
    EXPECT_EQ(c, expected);
}

TEST_P(BitwiseXorSimulationTest, SimpleXor)
{
    EventEmitter<simulation::BitwiseEvent> event_emitter;
    Bitwise bitwise(event_emitter);

    auto [a, b, expected] = GetParam();
    MemoryValue c = bitwise.xor_op(a, b);
    EXPECT_EQ(c, expected);
}

} // namespace
} // namespace bb::avm2::simulation
