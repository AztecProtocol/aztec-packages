#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using testing::ElementsAre;
using testing::Field;

using R = TestTraceContainer::Row;

TEST(RangeCheckTraceGenTest, RangeCheckLte16Bit)
{
    TestTraceContainer trace;
    RangeCheckTraceBuilder builder;

    uint8_t num_bits = 7;
    uint8_t dynamic_bits = 7;

    // Choose a value that has num_bits
    uint128_t value = (static_cast<uint128_t>(1) << num_bits) - 3;
    uint256_t value_u256 = uint256_t::from_uint128(value);

    // <= 16 bits means that the only register used is the dynamic slice
    uint16_t dynamic_slice_register = value & 0xFFFF;

    uint16_t dynamic_bits_pow_2 = static_cast<uint16_t>(1 << dynamic_bits);
    uint16_t dynamic_diff = static_cast<uint16_t>(dynamic_bits_pow_2 - dynamic_slice_register - 1);

    builder.process({ { .value = value, .num_bits = num_bits } }, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Only one row.
                    AllOf(Field(&R::range_check_sel, 1),
                          Field(&R::range_check_value, value_u256),
                          Field(&R::range_check_rng_chk_bits, FF(num_bits)),
                          Field(&R::range_check_is_lte_u16, 1),
                          Field(&R::range_check_u16_r7, dynamic_slice_register),
                          Field(&R::range_check_dyn_rng_chk_bits, dynamic_bits),
                          Field(&R::range_check_dyn_rng_chk_pow_2, dynamic_bits_pow_2),
                          Field(&R::range_check_dyn_diff, dynamic_diff))));
}

TEST(RangeCheckTraceGenTest, RangeCheckLte48Bit)
{
    TestTraceContainer trace;
    RangeCheckTraceBuilder builder;

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

    builder.process({ { .value = value, .num_bits = num_bits } }, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Only one row.
                    AllOf(Field(&R::range_check_sel, 1),
                          Field(&R::range_check_value, value_u256),
                          Field(&R::range_check_rng_chk_bits, num_bits),
                          Field(&R::range_check_is_lte_u48, 1),
                          Field(&R::range_check_u16_r0, u16_r0),
                          Field(&R::range_check_u16_r1, u16_r1),
                          Field(&R::range_check_u16_r7, dynamic_slice_register),
                          Field(&R::range_check_dyn_rng_chk_bits, dynamic_bits),
                          Field(&R::range_check_dyn_rng_chk_pow_2, dynamic_bits_pow_2),
                          Field(&R::range_check_dyn_diff, dynamic_diff),

                          Field(&R::range_check_sel_r0_16_bit_rng_lookup, 1),
                          Field(&R::range_check_sel_r1_16_bit_rng_lookup, 1))));
}

TEST(RangeCheckTraceGenTest, RangeCheckLte128Bit)
{
    TestTraceContainer trace;
    RangeCheckTraceBuilder builder;

    uint8_t num_bits = 128;
    uint8_t non_dynamic_bits = 112;
    uint8_t dynamic_bits = num_bits - non_dynamic_bits;

    // Choose a value that has num_bits
    uint128_t value = static_cast<uint128_t>((static_cast<uint256_t>(1) << (num_bits)) - 3);
    uint256_t value_u256 = uint256_t::from_uint128(value);

    uint16_t u16_r0 = value & 0xFFFF;
    uint16_t u16_r1 = (value >> 16) & 0xFFFF;
    uint16_t u16_r2 = (value >> 32) & 0xFFFF;
    uint16_t u16_r3 = (value >> 48) & 0xFFFF;
    uint16_t u16_r4 = (value >> 64) & 0xFFFF;
    uint16_t u16_r5 = (value >> 80) & 0xFFFF;
    uint16_t u16_r6 = (value >> 96) & 0xFFFF;
    uint16_t dynamic_slice_register = (value >> 112) & 0xFFFF;

    uint32_t dynamic_bits_pow_2 = static_cast<uint32_t>(1 << dynamic_bits);
    uint16_t dynamic_diff = static_cast<uint16_t>(dynamic_bits_pow_2 - dynamic_slice_register - 1);

    builder.process({ { .value = value, .num_bits = num_bits } }, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Only one row.
                    AllOf(Field(&R::range_check_sel, 1),
                          Field(&R::range_check_value, value_u256),
                          Field(&R::range_check_rng_chk_bits, num_bits),
                          Field(&R::range_check_is_lte_u128, 1),
                          Field(&R::range_check_u16_r0, u16_r0),
                          Field(&R::range_check_u16_r1, u16_r1),
                          Field(&R::range_check_u16_r2, u16_r2),
                          Field(&R::range_check_u16_r3, u16_r3),
                          Field(&R::range_check_u16_r4, u16_r4),
                          Field(&R::range_check_u16_r5, u16_r5),
                          Field(&R::range_check_u16_r6, u16_r6),
                          Field(&R::range_check_u16_r7, dynamic_slice_register),
                          Field(&R::range_check_dyn_rng_chk_bits, dynamic_bits),
                          Field(&R::range_check_dyn_rng_chk_pow_2, dynamic_bits_pow_2),
                          Field(&R::range_check_dyn_diff, dynamic_diff),

                          Field(&R::range_check_sel_r0_16_bit_rng_lookup, 1),
                          Field(&R::range_check_sel_r1_16_bit_rng_lookup, 1),
                          Field(&R::range_check_sel_r2_16_bit_rng_lookup, 1),
                          Field(&R::range_check_sel_r3_16_bit_rng_lookup, 1),
                          Field(&R::range_check_sel_r4_16_bit_rng_lookup, 1),
                          Field(&R::range_check_sel_r5_16_bit_rng_lookup, 1),
                          Field(&R::range_check_sel_r6_16_bit_rng_lookup, 1))));
}
} // namespace
} // namespace bb::avm2::tracegen
