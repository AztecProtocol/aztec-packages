#include "barretenberg/vm2/simulation/field_gt.hpp"

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

bool FieldGreaterThan::ff_gt(const FF& a, const FF& b)
{
    bool result = static_cast<uint256_t>(a) > static_cast<uint256_t>(b);
    events.emit({ .a = a, .b = b });
    return result;
}

} // namespace bb::avm2::simulation
