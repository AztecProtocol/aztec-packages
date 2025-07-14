// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "witness_constant.hpp"
#include "barretenberg/dsl/acir_format/ecdsa_secp256k1.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

namespace acir_format {

using namespace bb;
using namespace bb::stdlib;

/**
 * @brief Generates a cycle_group point from the inputs, taking care of their witness/constant nature
 *
 * @details If has_valid_witness_assignments is false, then it will assign dummy values representing
 * a point on the curve:
 * - the infinite point if input_infinite is a witness
 * - else, if input_infinite is a constant and false, and input_x and input_y are witnesses:
 *   it will assign G1 if use_g1 is true, else 2*G1
 * It will not assign anything otherwise.
 */
template <typename Builder, typename FF>
bb::stdlib::cycle_group<Builder> to_grumpkin_point(const WitnessOrConstant<FF>& input_x,
                                                   const WitnessOrConstant<FF>& input_y,
                                                   const WitnessOrConstant<FF>& input_infinite,
                                                   bool has_valid_witness_assignments,
                                                   bool use_g1,
                                                   Builder& builder)
{
    auto point_x = to_field_ct(input_x, builder);
    auto point_y = to_field_ct(input_y, builder);
    // We assume input_infinite is boolean, so we do not add a boolean gate
    bool_t infinite(&builder);
    if (!input_infinite.is_constant) {
        infinite.witness_index = input_infinite.index;
        infinite.witness_bool = get_value(input_infinite, builder) == FF::one();
    } else {
        infinite.witness_index = IS_CONSTANT;
        infinite.witness_bool = input_infinite.value == FF::one();
    }

    // When we do not have the witness assignments, we set is_infinite value to true if it is not constant
    // else default values would give a point which is not on the curve and this will fail verification
    if (!has_valid_witness_assignments) {
        if (!input_infinite.is_constant) {
            builder.set_variable(input_infinite.index, fr(1));
        } else if (input_infinite.value == fr::zero() && !(input_x.is_constant || input_y.is_constant)) {
            // else, if is_infinite is false, but the coordinates (x, y) are witness (and not constant)
            // then we set their value to an arbitrary valid curve point (in our case G1).
            auto g1 = bb::grumpkin::g1::affine_one;

            if (use_g1) {
                builder.set_variable(input_x.index, g1.x);
                builder.set_variable(input_y.index, g1.y);
            } else {
                auto g2 = g1 + g1;
                builder.set_variable(input_x.index, g2.x);
                builder.set_variable(input_y.index, g2.y);
            }
        }
    }
    cycle_group<Builder> input_point(point_x, point_y, infinite);
    return input_point;
}

template bb::stdlib::cycle_group<UltraCircuitBuilder> to_grumpkin_point(const WitnessOrConstant<fr>& input_x,
                                                                        const WitnessOrConstant<fr>& input_y,
                                                                        const WitnessOrConstant<fr>& input_infinite,
                                                                        bool has_valid_witness_assignments,
                                                                        bool use_g1,
                                                                        UltraCircuitBuilder& builder);
template bb::stdlib::cycle_group<MegaCircuitBuilder> to_grumpkin_point(const WitnessOrConstant<fr>& input_x,
                                                                       const WitnessOrConstant<fr>& input_y,
                                                                       const WitnessOrConstant<fr>& input_infinite,
                                                                       bool has_valid_witness_assignments,
                                                                       bool use_g1,
                                                                       MegaCircuitBuilder& builder);

/**
 * @brief This function also generates a cycle_group point from the inputs, like to_grumpkin_point(),
 * but it creates and use a witness for each constant input.
 * The assignment of dummy values is the same as in to_grumpkin_point(), except that
 * here the point will always use witness, so the second case (x and y are witness)
 * will always be true.
 */
template <typename Builder, typename FF>
bb::stdlib::cycle_group<Builder> to_witness_grumpkin_point(const WitnessOrConstant<FF>& input_x,
                                                           const WitnessOrConstant<FF>& input_y,
                                                           const WitnessOrConstant<FF>& input_infinite,
                                                           bool has_valid_witness_assignments,
                                                           bool use_g1,
                                                           Builder& builder)
{
    // Creates a Grumpkin point(cycle_group) from WitnessOrConstant inputs by always using
    // witnesses, even if the inputs are constant.
    auto point_x = to_field_ct(input_x, builder);
    if (point_x.is_constant()) {
        point_x.convert_constant_to_fixed_witness(&builder);
    }
    auto point_y = to_field_ct(input_y, builder);
    if (point_y.is_constant()) {
        point_y.convert_constant_to_fixed_witness(&builder);
    }
    // We assume input_infinite is boolean, so we do not add a boolean gate
    bool_t infinite(&builder);
    if (!input_infinite.is_constant) {
        infinite.witness_index = input_infinite.index;
        infinite.witness_bool = get_value(input_infinite, builder) == FF::one();
    } else {
        infinite.witness_index = IS_CONSTANT;
        infinite.witness_bool = input_infinite.value == FF::one();
        infinite.convert_constant_to_fixed_witness(&builder);
    }

    // When we do not have the witness assignments, we set is_infinite value to true if it is not constant
    // else default values would give a point which is not on the curve and this will fail verification
    // If is_infinite is constant and false, and since the created point is using witnesses for the coordinates,
    // we set their value to a valid curve point (in our case G1).
    if (!has_valid_witness_assignments) {
        if (!input_infinite.is_constant) {
            builder.set_variable(input_infinite.index, fr(1));
        } else if (input_infinite.value == fr::zero() && !point_x.is_constant() && !point_x.is_constant()) {

            auto g1 = bb::grumpkin::g1::affine_one;
            if (use_g1) {
                builder.set_variable(point_x.witness_index, g1.x);
                builder.set_variable(point_y.witness_index, g1.y);
            } else {
                auto g2 = g1 + g1;
                builder.set_variable(point_x.witness_index, g2.x);
                builder.set_variable(point_y.witness_index, g2.y);
            }
        }
    }
    cycle_group<Builder> input_point(point_x, point_y, infinite);
    return input_point;
}

template bb::stdlib::cycle_group<UltraCircuitBuilder> to_witness_grumpkin_point(
    const WitnessOrConstant<fr>& input_x,
    const WitnessOrConstant<fr>& input_y,
    const WitnessOrConstant<fr>& input_infinite,
    bool has_valid_witness_assignments,
    bool use_g1,
    UltraCircuitBuilder& builder);
template bb::stdlib::cycle_group<MegaCircuitBuilder> to_witness_grumpkin_point(
    const WitnessOrConstant<fr>& input_x,
    const WitnessOrConstant<fr>& input_y,
    const WitnessOrConstant<fr>& input_infinite,
    bool has_valid_witness_assignments,
    bool use_g1,
    MegaCircuitBuilder& builder);
} // namespace acir_format
