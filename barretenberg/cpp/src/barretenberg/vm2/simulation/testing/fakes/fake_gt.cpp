#include "barretenberg/vm2/simulation/testing/fakes/fake_gt.hpp"

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"

namespace bb::avm2::simulation {

bool FakeGreaterThan::gt(const FF& a, const FF& b)
{
    return static_cast<uint256_t>(a) > static_cast<uint256_t>(b);
}

bool FakeGreaterThan::gt(const uint128_t& a, const uint128_t& b)
{
    return a > b;
}

bool FakeGreaterThan::gt(const MemoryValue& a, const MemoryValue& b)
{
    // < and <= implemented on MemoryValue
    return b <= a;
}

} // namespace bb::avm2::simulation
