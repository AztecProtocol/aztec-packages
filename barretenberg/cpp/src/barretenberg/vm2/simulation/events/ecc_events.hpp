#pragma once

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

struct EccAddEvent {
    EmbeddedCurvePoint p;
    EmbeddedCurvePoint q;
    EmbeddedCurvePoint result;
};

struct ScalarMulIntermediateState {
    /* Accumulated result on this bit of the scalar */
    EmbeddedCurvePoint res;
    /* 2**(bit_idx) * point */
    EmbeddedCurvePoint temp;
    /* current bit of the scalar */
    bool bit;

    bool operator==(const ScalarMulIntermediateState& other) const = default;
};

struct ScalarMulEvent {
    EmbeddedCurvePoint point;
    FF scalar;
    std::vector<ScalarMulIntermediateState> intermediate_states;
    EmbeddedCurvePoint result;

    bool operator==(const ScalarMulEvent& other) const = default;
};

} // namespace bb::avm2::simulation
