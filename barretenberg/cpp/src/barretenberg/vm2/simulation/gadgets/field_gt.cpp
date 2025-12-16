#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/lib/uint_decomposition.hpp"

namespace bb::avm2::simulation {

namespace {

LimbsComparisonWitness limb_gt_witness(const U256Decomposition& a, const U256Decomposition& b, bool allow_eq)
{
    bool borrow = allow_eq ? (a.lo < b.lo) : (a.lo <= b.lo);
    // No need to add borrow * TWO_POW_128 since uint128_t will wrap in the way we need
    uint128_t x_lo = a.lo - b.lo - (allow_eq ? 0 : 1);
    uint128_t x_hi = a.hi - b.hi - (borrow ? 1 : 0);
    return { x_lo, x_hi, borrow };
}

LimbsComparisonWitness canonical_decomposition(const U256Decomposition& x_limbs, RangeCheckInterface& range_check)
{
    static auto p_limbs = decompose(FF::modulus);

    range_check.assert_range(x_limbs.lo, 128);
    range_check.assert_range(x_limbs.hi, 128);

    auto p_sub_x_witness = limb_gt_witness(p_limbs, x_limbs, false);
    range_check.assert_range(p_sub_x_witness.lo, 128);
    range_check.assert_range(p_sub_x_witness.hi, 128);

    return p_sub_x_witness;
}

} // namespace

bool FieldGreaterThan::ff_gt(const FF& a, const FF& b)
{
    const uint256_t a_integer(a);
    const uint256_t b_integer(b);
    const auto a_limbs = decompose(a_integer);
    const auto b_limbs = decompose(b_integer);

    const auto p_sub_a_witness = canonical_decomposition(a_limbs, range_check);
    const auto p_sub_b_witness = canonical_decomposition(b_limbs, range_check);

    const bool result = a_integer > b_integer;

    const auto res_witness =
        result ? limb_gt_witness(a_limbs, b_limbs, false) : limb_gt_witness(b_limbs, a_limbs, true);
    range_check.assert_range(res_witness.lo, 128);
    range_check.assert_range(res_witness.hi, 128);

    events.emit({
        .operation = FieldGreaterOperation::GREATER_THAN,
        .a = a,
        .b = b,
        .a_limbs = a_limbs,
        .p_sub_a_witness = p_sub_a_witness,
        .b_limbs = b_limbs,
        .p_sub_b_witness = p_sub_b_witness,
        .res_witness = res_witness,
        .gt_result = result,
    });
    return result;
}

U256Decomposition FieldGreaterThan::canon_dec(const FF& a)
{
    const auto a_limbs = decompose(static_cast<uint256_t>(a));
    const auto p_sub_a_witness = canonical_decomposition(a_limbs, range_check);

    events.emit({
        .operation = FieldGreaterOperation::CANONICAL_DECOMPOSITION,
        .a = a,
        .a_limbs = a_limbs,
        .p_sub_a_witness = p_sub_a_witness,
    });

    return a_limbs;
}

} // namespace bb::avm2::simulation
