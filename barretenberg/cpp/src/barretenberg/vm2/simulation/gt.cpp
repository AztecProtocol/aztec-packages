#include "barretenberg/vm2/simulation/gt.hpp"

namespace bb::avm2::simulation {

bool GreaterThan::gt(const FF& a, const FF& b)
{
    return field_gt.ff_gt(a, b);
}
bool GreaterThan::gt(const uint128_t& a, const uint128_t& b)
{
    // Implement actual circuit logic
    bool res = a > b;
    events.emit({
        .a = a,
        .b = b,
        .result = res,
    });
    return res;
}

} // namespace bb::avm2::simulation
