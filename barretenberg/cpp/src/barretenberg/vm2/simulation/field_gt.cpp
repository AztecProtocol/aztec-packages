#include "barretenberg/vm2/simulation/field_gt.hpp"

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

bool FieldGreaterThan::ff_gt(const FF& a, const FF& b)
{
    static auto p_limbs = decompose(FF::modulus);

    uint256_t a_integer = static_cast<uint256_t>(a);
    uint256_t b_integer = static_cast<uint256_t>(b);

    bool result = a_integer > b_integer;

    auto a_limbs = decompose(a_integer);
    range_check.assert_range(a_limbs.lo, 128);
    range_check.assert_range(a_limbs.hi, 128);

    auto p_sub_a_witness = limb_gt_witness(p_limbs, a_limbs, false);
    range_check.assert_range(p_sub_a_witness.lo, 128);
    range_check.assert_range(p_sub_a_witness.hi, 128);

    auto b_limbs = decompose(b_integer);
    range_check.assert_range(b_limbs.lo, 128);
    range_check.assert_range(b_limbs.hi, 128);

    auto p_sub_b_witness = limb_gt_witness(p_limbs, b_limbs, false);
    range_check.assert_range(p_sub_b_witness.lo, 128);
    range_check.assert_range(p_sub_b_witness.hi, 128);

    auto res_witness = result ? limb_gt_witness(a_limbs, b_limbs, false) : limb_gt_witness(b_limbs, a_limbs, true);
    range_check.assert_range(res_witness.lo, 128);
    range_check.assert_range(res_witness.hi, 128);

    events.emit({
        .a = a,
        .b = b,
        .a_limbs = a_limbs,
        .p_sub_a_witness = p_sub_a_witness,
        .b_limbs = b_limbs,
        .p_sub_b_witness = p_sub_b_witness,
        .res_witness = res_witness,
        .result = result,
    });
    return result;
}

} // namespace bb::avm2::simulation
