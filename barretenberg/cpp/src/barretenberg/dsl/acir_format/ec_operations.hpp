// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>

namespace acir_format {

/**
 * @brief Constraints for addition of two points on the Grumpkin curve.
 *
 * @details EcAdd constraints have 10 components:
 * - input1_x: x-coordinate of the first input point
 * - input1_y: y-coordinate of the first input point
 * - input1_infinite: flag indicating if the first input point is the point at infinity
 * - input2_x: x-coordinate of the second input point
 * - input2_y: y-coordinate of the second input point
 * - input2_infinite: flag indicating if the second input point is the point at infinity
 * - predicate: flag indicating whether the constraint is active
 * - result_x: witness index for the x-coordinate of the resulting point
 * - result_y: witness index for the y-coordinate of the resulting point
 * - result_infinite: witness index for the flag indicating if the result is the point at infinity
 *
 * The data related to input1 and input2 can either be given by witnesses or constants. However, x and y coordinates
 * pertaining to the same input must be either all witnesses or all constants.
 */
struct EcAdd {
    WitnessOrConstant<bb::fr> input1_x;
    WitnessOrConstant<bb::fr> input1_y;
    WitnessOrConstant<bb::fr> input1_infinite;
    WitnessOrConstant<bb::fr> input2_x;
    WitnessOrConstant<bb::fr> input2_y;
    WitnessOrConstant<bb::fr> input2_infinite;
    // Predicate indicating whether the constraint should be disabled:
    // - true: the constraint is valid
    // - false: the constraint is disabled, i.e it must not fail and can return whatever.
    WitnessOrConstant<bb::fr> predicate;
    uint32_t result_x;
    uint32_t result_y;
    uint32_t result_infinite;

    // for serialization, update with any new fields
    MSGPACK_FIELDS(input1_x,
                   input1_y,
                   input1_infinite,
                   input2_x,
                   input2_y,
                   input2_infinite,
                   predicate,
                   result_x,
                   result_y,
                   result_infinite);
    friend bool operator==(EcAdd const& lhs, EcAdd const& rhs) = default;
};

template <typename Builder>
void create_ec_add_constraint(Builder& builder, const EcAdd& input, bool has_valid_witness_assignments);
} // namespace acir_format
