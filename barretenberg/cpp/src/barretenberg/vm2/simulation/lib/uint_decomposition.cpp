#include "barretenberg/vm2/simulation/lib/uint_decomposition.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"

namespace bb::avm2::simulation {

const uint256_t TWO_POW_128 = uint256_t(1) << 128;
const uint128_t TWO_POW_64 = static_cast<uint128_t>(1) << 64;

U256Decomposition decompose(const uint256_t& x)
{
    uint128_t lo = static_cast<uint128_t>(x % TWO_POW_128);
    uint128_t hi = static_cast<uint128_t>(x >> 128);
    return { lo, hi };
}

U128Decomposition decompose(const uint128_t& x)
{
    uint64_t lo = static_cast<uint64_t>(x % TWO_POW_64);
    uint64_t hi = static_cast<uint64_t>(x >> 64);
    return { lo, hi };
}

} // namespace bb::avm2::simulation
