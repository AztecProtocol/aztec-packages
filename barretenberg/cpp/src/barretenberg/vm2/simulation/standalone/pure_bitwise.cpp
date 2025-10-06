#include "barretenberg/vm2/simulation/standalone/pure_bitwise.hpp"

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"

namespace bb::avm2::simulation {

MemoryValue PureBitwise::and_op(const MemoryValue& a, const MemoryValue& b)
{
    return a & b;
}
MemoryValue PureBitwise::or_op(const MemoryValue& a, const MemoryValue& b)
{
    return a | b;
}
MemoryValue PureBitwise::xor_op(const MemoryValue& a, const MemoryValue& b)
{
    return a ^ b;
}

} // namespace bb::avm2::simulation
