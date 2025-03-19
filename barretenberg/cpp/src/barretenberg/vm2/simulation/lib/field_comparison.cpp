#include "barretenberg/vm2/simulation/lib/field_comparison.hpp"

namespace bb::avm2::simulation {

const uint256_t TWO_POW_128 = uint256_t{ 1 } << 128;

FFDecomposition decompose(const uint256_t& x)
{
    uint128_t lo = static_cast<uint128_t>(x % TWO_POW_128);
    uint128_t hi = static_cast<uint128_t>(x >> 128);
    return { lo, hi };
}

LimbsComparisonWitness limb_gt_witness(const FFDecomposition& a, const FFDecomposition& b, bool allow_eq)
{
    bool borrow = allow_eq ? (a.lo < b.lo) : (a.lo <= b.lo);
    // No need to add borrow * TWO_POW_128 since uint128_t will wrap in the way we need
    uint128_t x_lo = a.lo - b.lo - (allow_eq ? 0 : 1);
    uint128_t x_hi = a.hi - b.hi - (borrow ? 1 : 0);
    return { x_lo, x_hi, borrow };
}

} // namespace bb::avm2::simulation
