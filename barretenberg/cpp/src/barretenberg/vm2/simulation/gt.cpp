#include "barretenberg/vm2/simulation/gt.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

bool GreaterThan::gt(const FF& a, const FF& b)
{
    return field_gt.ff_gt(a, b);
}
bool GreaterThan::gt(const uint128_t& a, const uint128_t& b)
{
    bool res = a > b;
    uint128_t abs_diff = res ? a - b - 1 : b - a;
    range_check.assert_range(abs_diff, 128);
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
    // Note: not checking a_tag == b_tag here, as I think this is the job of
    // memory-aware methods e.g. the ALU
    if (a.get_tag() == ValueTag::FF) {
        return gt(a_ff, b_ff);
    }
    return gt(static_cast<uint128_t>(a_ff), static_cast<uint128_t>(b_ff));
}

} // namespace bb::avm2::simulation
