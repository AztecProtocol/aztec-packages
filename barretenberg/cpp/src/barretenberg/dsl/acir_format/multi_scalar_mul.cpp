// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke], commit: a48c205d6dcd4338f5b83b4fda18bff6015be07b}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "multi_scalar_mul.hpp"
#include "barretenberg/dsl/acir_format/serde/acir.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/honk/execution_trace/gate_data.hpp"
#include "barretenberg/stdlib/primitives/biggroup/biggroup.hpp"
#include "barretenberg/stdlib/primitives/group/cycle_group.hpp"

namespace acir_format {

using namespace bb;

template <typename Builder> struct MsmInputs {
    bb::stdlib::bool_t<Builder> predicate;
    bb::stdlib::cycle_group<Builder> result;
    std::vector<bb::stdlib::cycle_group<Builder>> points;
    std::vector<typename bb::stdlib::cycle_group<Builder>::cycle_scalar> scalars;
};

/**
 * @brief Create constraints for multi-scalar multiplication on the Grumpkin curve.
 *
 * @details We proceed in 2 steps:
 * 1. We reconstruct the Grumpkin points, scalars, and input_result for which we must check
 *    sum(scalars[i] * points[i]) = input_result. The reconstruction handles all cases: has_valid_witness_assignments
 *    equal to false (write_vk scenario) and a witness predicate. If:
 *      - has_valid_witness_assignments is false, then we set all points, scalars, and input_result to dummy values
 *        (generator point and scalar 1)
 *      - the predicate is witness false, we set all input points and scalars to dummy values.
 * 2. We compute the multi-scalar multiplication and check that it agrees with input_result.
 *
 * @note We do not need to enforce in-circuit that input_result is on the curve because we check that input_result is
 * equal to result, which we know is on the curve as it is the result of batch_mul on valid curve points. In the case
 * of predicate equal to witness false, the constraint is supposed to be inactive, so even if input_result is not
 * checked to be on the curve in this case, it is OK.
 *
 * @tparam Builder
 * @param builder
 * @param constraint_input The MSM constraint containing witness indices and constants for points and scalars
 * @param has_valid_witness_assignments Whether valid witnesses are provided (false during VK generation)
 */
template <typename Builder>
void create_multi_scalar_mul_constraint(Builder& builder, const MultiScalarMul& constraint_input)
{
    using cycle_group_ct = stdlib::cycle_group<Builder>;

    // Step 1: Reconstruct inputs (points, scalars, expected result)
    MsmInputs input = reconstruct_msm_inputs(builder, constraint_input);

    // Step 2: Compute result and connect it to the expected result reconstructed from inputs
    auto result = cycle_group_ct::batch_mul(input.points, input.scalars);
    cycle_group_ct to_be_asserted_equal = cycle_group_ct::conditional_assign(input.predicate, input.result, result);
    result.assert_equal(to_be_asserted_equal);
}

/**
 * @brief Reconstruct all inputs for multi-scalar multiplication constraint
 * @details Handles predicate and has_valid_witness_assignments to ensure proper witness values
 * are used during circuit construction and VK generation.
 *
 * @tparam Builder
 * @param builder
 * @param input The MSM constraint containing witness indices and constants
 * @param has_valid_witness_assignments Whether valid witnesses are provided (false during VK generation)
 * @return MsmInputs containing predicate, expected result, points, and scalars
 */
template <typename Builder>
static MsmInputs<Builder> reconstruct_msm_inputs(Builder& builder, const MultiScalarMul& input)
{
    using cycle_group_ct = stdlib::cycle_group<Builder>;
    using cycle_scalar_ct = typename cycle_group_ct::cycle_scalar;
    using field_ct = stdlib::field_t<Builder>;
    using bool_ct = stdlib::bool_t<Builder>;

    bool_ct predicate = bool_ct(to_field_ct(input.predicate, builder));

    // Reconstruct expected result
    field_ct input_result_x = field_ct::from_witness_index(&builder, input.out_point_x);
    field_ct input_result_y = field_ct::from_witness_index(&builder, input.out_point_y);
    bool_ct input_result_infinite = bool_ct(field_ct::from_witness_index(&builder, input.out_point_is_infinite));

    // If no valid witness assignments, set result to generator point to avoid errors during circuit construction
    if (builder.is_write_vk_mode()) {
        builder.set_variable(input_result_x.get_witness_index(), bb::grumpkin::g1::affine_one.x);
        builder.set_variable(input_result_y.get_witness_index(), bb::grumpkin::g1::affine_one.y);
        builder.set_variable(input_result_infinite.get_witness_index(), bb::fr(0));
    }

    // Constrain that the infinity flag is consistent with (0,0) coordinates.
    // Noir represents point at infinity as (0, 0, is_infinite=true).
    bool_ct is_origin = input_result_x.is_zero() && input_result_y.is_zero();
    input_result_infinite.assert_equal(is_origin, "is_infinity flag must be consistent with (0,0) coordinates");

    // Use public constructor which auto-detects infinity from (0,0) coordinates.
    // Note that input_result is computed by Noir and passed to bb via ACIR. Hence, it is always a valid point on
    // Grumpkin, so we don't need to assert on curve.
    cycle_group_ct input_result(input_result_x, input_result_y, /*assert_on_curve=*/false);

    // Reconstruct points and scalars
    std::vector<cycle_group_ct> points;
    std::vector<cycle_scalar_ct> scalars;

    // Ensure that the number of points and scalars are consistent (3 field elements per point, 2 per scalar)
    BB_ASSERT(input.points.size() * 2 == input.scalars.size() * 3, "MultiScalarMul input size mismatch");

    for (size_t i = 0; i < input.points.size(); i += 3) {
        cycle_group_ct input_point =
            to_grumpkin_point(input.points[i], input.points[i + 1], input.points[i + 2], predicate, builder);

        cycle_scalar_ct scalar =
            to_grumpkin_scalar(input.scalars[2 * (i / 3)], input.scalars[2 * (i / 3) + 1], predicate, builder);

        points.push_back(input_point);
        scalars.push_back(scalar);
    }

    return { predicate, input_result, points, scalars };
}

template void create_multi_scalar_mul_constraint<UltraCircuitBuilder>(UltraCircuitBuilder& builder,
                                                                      const MultiScalarMul& input);
template void create_multi_scalar_mul_constraint<MegaCircuitBuilder>(MegaCircuitBuilder& builder,
                                                                     const MultiScalarMul& input);

} // namespace acir_format
