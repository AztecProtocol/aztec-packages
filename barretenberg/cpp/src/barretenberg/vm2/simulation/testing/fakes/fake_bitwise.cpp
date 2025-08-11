#include "barretenberg/vm2/simulation/testing/fakes/fake_bitwise.hpp"

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"

namespace bb::avm2::simulation {

MemoryValue FakeBitwise::and_op(const MemoryValue& a, const MemoryValue& b)
{
    return a & b;
}
MemoryValue FakeBitwise::or_op(const MemoryValue& a, const MemoryValue& b)
{
    return a | b;
}
MemoryValue FakeBitwise::xor_op(const MemoryValue& a, const MemoryValue& b)
{
    return a ^ b;
}

} // namespace bb::avm2::simulation
