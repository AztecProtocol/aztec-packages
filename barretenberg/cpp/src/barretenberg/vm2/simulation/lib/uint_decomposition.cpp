#include "barretenberg/vm2/simulation/lib/uint_decomposition.hpp"
#include "barretenberg/vm2/common/constants.hpp"

namespace bb::avm2::simulation {

U256Decomposition decompose_256(const uint256_t& x)
{
    uint128_t lo = static_cast<uint128_t>(x & MASK_128);
    uint128_t hi = static_cast<uint128_t>(x >> 128);
    return { lo, hi };
}

U128Decomposition decompose_128(const uint128_t& x)
{
    uint64_t lo = static_cast<uint64_t>(x & MASK_64);
    uint64_t hi = static_cast<uint64_t>(x >> 64);
    return { lo, hi };
}

} // namespace bb::avm2::simulation
