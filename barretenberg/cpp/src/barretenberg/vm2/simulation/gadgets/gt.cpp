#include "barretenberg/vm2/simulation/gadgets/gt.hpp"

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

bool GreaterThan::gt(const FF& a, const FF& b)
{
    return field_gt.ff_gt(a, b);
}

bool GreaterThan::gt(const uint128_t& a, const uint128_t& b)
{
    bool res = a > b;
    const uint128_t abs_diff = res ? a - b - 1 : b - a;
    const uint8_t num_bits_bound = static_cast<uint8_t>(uint256_t::from_uint128(abs_diff).get_msb() + 1);
    const uint8_t num_bits_bound_16 = ((num_bits_bound - 1) / 16 + 1) * 16; // round up to multiple of 16
    range_check.assert_range(abs_diff, num_bits_bound_16);
    events.emit({
        .a = a,
        .b = b,
        .result = res,
    });
    return res;
}

bool GreaterThan::gt(const MemoryValue& a, const MemoryValue& b)
{
    FF a_ff = a.as_ff();
    FF b_ff = b.as_ff();
    if (a.get_tag() == ValueTag::FF) {
        return gt(a_ff, b_ff);
    }
    // It is a precondition that the memory value is <= 128 bits.
    assert(get_tag_bits(a.get_tag()) <= get_tag_bits(ValueTag::U128));
    assert(get_tag_bits(b.get_tag()) <= get_tag_bits(ValueTag::U128));
    return gt(static_cast<uint128_t>(a_ff), static_cast<uint128_t>(b_ff));
}

} // namespace bb::avm2::simulation
