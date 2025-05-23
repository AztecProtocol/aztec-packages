#include "barretenberg/vm2/simulation/lib/u256_decomposition.hpp"

namespace bb::avm2::simulation {

const uint256_t TWO_POW_128 = uint256_t(1) << 128;

U256Decomposition decompose(const uint256_t& x)
{
    uint128_t lo = static_cast<uint128_t>(x % TWO_POW_128);
    uint128_t hi = static_cast<uint128_t>(x >> 128);
    return { lo, hi };
}

} // namespace bb::avm2::simulation
