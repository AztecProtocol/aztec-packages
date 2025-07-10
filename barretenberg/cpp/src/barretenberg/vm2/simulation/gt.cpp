#include "barretenberg/vm2/simulation/gt.hpp"

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

} // namespace bb::avm2::simulation
