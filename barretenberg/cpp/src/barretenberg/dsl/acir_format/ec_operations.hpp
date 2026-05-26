// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke], commit: a48c205d6dcd4338f5b83b4fda18bff6015be07b}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include <cstdint>

namespace acir_format {

/**
 * @brief Constraints for addition of two points on the Grumpkin curve.
 *
 * @details EcAdd constraints have 7 components:
 * - input1_x: x-coordinate of the first input point
 * - input1_y: y-coordinate of the first input point
 * - input2_x: x-coordinate of the second input point
 * - input2_y: y-coordinate of the second input point
 * - predicate: flag indicating whether the constraint is active
 * - result_x: witness index for the x-coordinate of the resulting point
 * - result_y: witness index for the y-coordinate of the resulting point
 *
 * The point at infinity is represented by the coordinates (0, 0). The data related to input1 and input2 can either be
 * given by witnesses or constants. However, x and y coordinates pertaining to the same input must be either all
 * witnesses or all constants.
 */
struct EcAdd {
    WitnessOrConstant<bb::fr> input1_x;
    WitnessOrConstant<bb::fr> input1_y;
    WitnessOrConstant<bb::fr> input2_x;
    WitnessOrConstant<bb::fr> input2_y;
    // Predicate indicating whether the constraint should be disabled:
    // - true: the constraint is valid
    // - false: the constraint is disabled, i.e it must not fail and can return whatever.
    WitnessOrConstant<bb::fr> predicate;
    uint32_t result_x;
    uint32_t result_y;

    friend bool operator==(EcAdd const& lhs, EcAdd const& rhs) = default;
};

template <typename Builder> void create_ec_add_constraint(Builder& builder, const EcAdd& input);
} // namespace acir_format
