#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/lib/uint_decomposition.hpp"

namespace bb::avm2::simulation {

namespace {

// Unconstrained. Gives witness values for a > b (or a >= b if allow_eq is true).
// The approach is that to prove that two range-constrained numbers x, y (e.g., to 20 bits each) are such that x > y,
// you prove that x - y - 1 does not underflow. That is, you prove that x - y - 1 still fits in 20 bits.
// So, your witness value (for a later range check) will be x - y - 1, for each pair of limbs.
// The >= case is handled with a borrow flag.
LimbsComparisonWitness limb_gt_or_gte_witness_(const U256Decomposition& a, const U256Decomposition& b, bool allow_eq)
{
    bool borrow = allow_eq ? (a.lo < b.lo) : (a.lo <= b.lo);
    // No need to add borrow * TWO_POW_128 since uint128_t will wrap in the way we need
    uint128_t x_lo = a.lo - b.lo - (allow_eq ? 0 : 1);
    uint128_t x_hi = a.hi - b.hi - (borrow ? 1 : 0);
    return { x_lo, x_hi, borrow };
}

// Unconstrained.
inline LimbsComparisonWitness limb_gt_witness(const U256Decomposition& a, const U256Decomposition& b)
{
    return limb_gt_or_gte_witness_(a, b, false);
}

// Unconstrained.
inline LimbsComparisonWitness limb_gte_witness(const U256Decomposition& a, const U256Decomposition& b)
{
    return limb_gt_or_gte_witness_(a, b, true);
}

/**
 * @brief Constrains that the limbs are 128-bit and that, when recombined, they are strictly less than the modulus.
 *
 * @param x_limbs The decomposition of the field element into 128-bit limbs.
 * @param range_check The range check to be used for asserting limb bit sizes.
 * @return LimbsComparisonWitness Witness values for the constraint check (modulus_limbs - x_limbs).
 */
LimbsComparisonWitness canonical_decomposition(const U256Decomposition& x_limbs, RangeCheckInterface& range_check)
{
    range_check.assert_range(x_limbs.lo, 128);
    range_check.assert_range(x_limbs.hi, 128);

    static U256Decomposition p_limbs = decompose_256(FF::modulus);
    const LimbsComparisonWitness p_sub_x_witness = limb_gt_witness(p_limbs, x_limbs);

    range_check.assert_range(p_sub_x_witness.lo, 128);
    range_check.assert_range(p_sub_x_witness.hi, 128);

    return p_sub_x_witness;
}

} // namespace

/**
 * @brief Computes the result of a > b (in a constrained way).
 *
 * @param a The first field element.
 * @param b The second field element.
 * @return bool True if a > b, false otherwise.
 */
bool FieldGreaterThan::ff_gt(const FF& a, const FF& b)
{
    const uint256_t a_integer(a);
    const uint256_t b_integer(b);

    // This result would be enough for fast simulation, but we need to do a lot more for the circuit.
    const bool result_a_gt_b = a_integer > b_integer;

    const U256Decomposition a_limbs = decompose_256(a_integer);
    const U256Decomposition b_limbs = decompose_256(b_integer);

    // These decompositions are constrained.
    const LimbsComparisonWitness p_sub_a_witness = canonical_decomposition(a_limbs, range_check);
    const LimbsComparisonWitness p_sub_b_witness = canonical_decomposition(b_limbs, range_check);

    // We will either be proving that a > b or that b >= a.
    const LimbsComparisonWitness res_witness =
        result_a_gt_b ? limb_gt_witness(a_limbs, b_limbs) : limb_gte_witness(b_limbs, a_limbs);
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
        .gt_result = result_a_gt_b,
    });

    return result_a_gt_b;
}

/**
 * @brief Decomposes the provided field element into 128-bit limbs (in a constrained way).
 *
 * @param a The field element to be decomposed.
 * @return U256Decomposition The decomposition of the field element into 128-bit limbs.
 */
U256Decomposition FieldGreaterThan::canon_dec(const FF& a)
{
    const U256Decomposition a_limbs = decompose_256(static_cast<uint256_t>(a));
    const LimbsComparisonWitness p_sub_a_witness = canonical_decomposition(a_limbs, range_check);

    events.emit({
        .operation = FieldGreaterOperation::CANONICAL_DECOMPOSITION,
        .a = a,
        .a_limbs = a_limbs,
        .p_sub_a_witness = p_sub_a_witness,
    });

    return a_limbs;
}

} // namespace bb::avm2::simulation
