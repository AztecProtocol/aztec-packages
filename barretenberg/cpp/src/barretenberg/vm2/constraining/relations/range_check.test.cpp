#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cmath>
#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/range_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using tracegen::RangeCheckTraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using range_check = bb::avm2::range_check<FF>;

TEST(RangeCheckConstrainingTest, EmptyRow)
{
    check_relation<range_check>(testing::empty_trace());
}

TEST(RangeCheckConstrainingTest, IsLteMutuallyExclusive)
{
    TestTraceContainer trace({
        { { C::range_check_sel, 1 }, { C::range_check_is_lte_u32, 1 } },
    });

    check_relation<range_check>(trace, range_check::SR_IS_LTE_MUTUALLY_EXCLUSIVE);
}

TEST(RangeCheckConstrainingTest, NegativeIsLteMutuallyExclusive)
{
    TestTraceContainer trace({
        // Negative test, only one is_lte flag should be high
        { { C::range_check_sel, 1 }, { C::range_check_is_lte_u32, 1 }, { C::range_check_is_lte_u112, 1 } },
    });

    EXPECT_THROW_WITH_MESSAGE(check_relation<range_check>(trace, range_check::SR_IS_LTE_MUTUALLY_EXCLUSIVE),
                              "IS_LTE_MUTUALLY_EXCLUSIVE");
}

TEST(RangeCheckConstrainingTest, CheckRecomposition)
{
    uint128_t value = 0x3FFFFFFFD;
    uint256_t value_u256 = uint256_t::from_uint128(value);

    uint16_t u16_r0 = 0xFFFD;                 // value & 0xFFFF;
    uint16_t u16_r1 = 0xFFFF;                 // (value >> 16) & 0xFFFF;
    uint16_t dynamic_slice_register = 0x0003; // (value >> 32) & 0xFFFF;

    TestTraceContainer trace({ {
        { C::range_check_sel, 1 },
        { C::range_check_value, value_u256 },
        { C::range_check_is_lte_u48, 1 },
        { C::range_check_u16_r0, u16_r0 },
        { C::range_check_u16_r1, u16_r1 },
        { C::range_check_u16_r7, dynamic_slice_register },
    } });

    check_relation<range_check>(trace, range_check::SR_CHECK_RECOMPOSITION);
}

TEST(RangeCheckConstrainingTest, NegativeCheckRecomposition)
{
    uint128_t value = 0x3FFFFFFFD;
    // Add 1 to the value to create a "bad" value that doesn't match recomposition
    uint256_t bad_value = uint256_t::from_uint128(value + 1);

    uint16_t u16_r0 = value & 0xFFFF;
    uint16_t u16_r1 = (value >> 16) & 0xFFFF;
    uint16_t dynamic_slice_register = (value >> 32) & 0xFFFF;

    TestTraceContainer trace({ {
        { C::range_check_sel, 1 },
        { C::range_check_value, bad_value },
        { C::range_check_is_lte_u48, 1 },
        { C::range_check_u16_r0, u16_r0 },
        { C::range_check_u16_r1, u16_r1 },
        { C::range_check_u16_r7, dynamic_slice_register },
    } });

    EXPECT_THROW_WITH_MESSAGE(check_relation<range_check>(trace, range_check::SR_CHECK_RECOMPOSITION),
                              "CHECK_RECOMPOSITION");
}

TEST(RangeCheckConstrainingTest, Full)
{
    uint8_t num_bits = 34;
    uint8_t non_dynamic_bits = 32;
    uint8_t dynamic_bits = num_bits - non_dynamic_bits;

    // Choose a value that has num_bits
    uint128_t value = (static_cast<uint128_t>(1) << num_bits) - 3;
    uint256_t value_u256 = uint256_t::from_uint128(value);

    uint16_t u16_r0 = value & 0xFFFF;
    uint16_t u16_r1 = (value >> 16) & 0xFFFF;
    uint16_t dynamic_slice_register = (value >> 32) & 0xFFFF;

    uint16_t dynamic_bits_pow_2 = static_cast<uint16_t>(1 << dynamic_bits);
    uint16_t dynamic_diff = static_cast<uint16_t>(dynamic_bits_pow_2 - dynamic_slice_register - 1);

    TestTraceContainer trace({ {
        { C::range_check_sel, 1 },
        { C::range_check_value, value_u256 },
        { C::range_check_rng_chk_bits, num_bits },
        { C::range_check_is_lte_u48, 1 },
        { C::range_check_u16_r0, u16_r0 },
        { C::range_check_u16_r1, u16_r1 },
        { C::range_check_u16_r7, dynamic_slice_register },
        { C::range_check_dyn_rng_chk_bits, dynamic_bits },
        { C::range_check_dyn_rng_chk_pow_2, dynamic_bits_pow_2 },
        { C::range_check_dyn_diff, dynamic_diff },
        // Enable 16 bit range lookup for each regular (non-dynamic) register being used.
        { C::range_check_sel_r0_16_bit_rng_lookup, 1 },
        { C::range_check_sel_r1_16_bit_rng_lookup, 1 },
    } });

    check_relation<range_check>(trace);
}

TEST(RangeCheckConstrainingTest, NegativeMissingLookup)
{
    uint8_t num_bits = 34;
    uint8_t non_dynamic_bits = 32;
    uint8_t dynamic_bits = num_bits - non_dynamic_bits;

    // Choose a value that has num_bits
    uint128_t value = (static_cast<uint128_t>(1) << num_bits) - 3;
    uint256_t value_u256 = uint256_t::from_uint128(value);

    uint16_t u16_r0 = value & 0xFFFF;
    uint16_t u16_r1 = (value >> 16) & 0xFFFF;
    uint16_t dynamic_slice_register = (value >> 32) & 0xFFFF;

    uint16_t dynamic_bits_pow_2 = static_cast<uint16_t>(1 << dynamic_bits);
    uint16_t dynamic_diff = static_cast<uint16_t>(dynamic_bits_pow_2 - dynamic_slice_register - 1);

    TestTraceContainer trace({ {
        { C::range_check_sel, 1 },
        { C::range_check_value, value_u256 },
        { C::range_check_rng_chk_bits, num_bits },
        { C::range_check_is_lte_u48, 1 },
        { C::range_check_u16_r0, u16_r0 },
        { C::range_check_u16_r1, u16_r1 },
        { C::range_check_u16_r7, dynamic_slice_register },
        { C::range_check_dyn_rng_chk_bits, dynamic_bits },
        { C::range_check_dyn_rng_chk_pow_2, dynamic_bits_pow_2 },
        { C::range_check_dyn_diff, dynamic_diff },
        // Enable 16 bit range lookup for each regular (non-dynamic) register being used.
        { C::range_check_sel_r0_16_bit_rng_lookup, 1 },
        { C::range_check_sel_r1_16_bit_rng_lookup, 0 }, // BAD! SHOULD BE 1
    } });

    EXPECT_THROW_WITH_MESSAGE(check_relation<range_check>(trace), "Relation range_check");
}

TEST(RangeCheckConstrainingTest, WithTracegen)
{
    TestTraceContainer trace;
    RangeCheckTraceBuilder builder;

    builder.process(
        {
            { .value = 0, .num_bits = 0 },
            { .value = 0, .num_bits = 1 },
            { .value = 0, .num_bits = 16 },
            { .value = 2, .num_bits = 2 },
            { .value = 255, .num_bits = 8 },
            { .value = 1 << 16, .num_bits = 17 },
            { .value = 1 << 18, .num_bits = 32 },
            { .value = static_cast<uint128_t>(1) << 66, .num_bits = 67 },
            { .value = 1024, .num_bits = 109 },
            { .value = 1, .num_bits = 128 },
            { .value = 0xFFFFFFFFFFFFFFFF, .num_bits = 128 },
            { .value = 0x1FFF, .num_bits = 13 },
        },
        trace);

    check_relation<range_check>(trace);
}

TEST(RangeCheckConstrainingTest, NegativeWithTracegen)
{
    TestTraceContainer trace;
    RangeCheckTraceBuilder builder;

    builder.process(
        {
            { .value = 1, .num_bits = 0 },
            { .value = 2, .num_bits = 1 },
            { .value = 255, .num_bits = 7 },
            { .value = 1 << 16, .num_bits = 16 },
            { .value = 1 << 18, .num_bits = 18 },
            { .value = static_cast<uint128_t>(1) << 66, .num_bits = 66 },
            { .value = 1024, .num_bits = 9 },
            { .value = 1, .num_bits = 0 },
            { .value = 0xFFFFFFFFFFFFFFFF, .num_bits = 127 },
            { .value = 0x1FFF, .num_bits = 12 },
        },
        trace);

    EXPECT_THROW_WITH_MESSAGE(check_relation<range_check>(trace), "Relation range_check");
}

} // namespace
} // namespace bb::avm2::constraining
