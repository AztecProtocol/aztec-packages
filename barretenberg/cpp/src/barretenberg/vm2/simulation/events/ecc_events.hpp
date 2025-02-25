#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

struct EccAddEvent {
    AffinePoint p;
    AffinePoint q;
    AffinePoint result;
};

struct ScalarMulIntermediateState {
    /* Accumulated result on this bit of the scalar */
    AffinePoint res;
    /* 2**(bit_idx) * point */
    AffinePoint temp;
    /* current bit of the scalar */
    bool bit;
};

struct ScalarMulEvent {
    AffinePoint point;
    FF scalar;
    std::vector<ScalarMulIntermediateState> intermediate_states;
    AffinePoint result;
};

} // namespace bb::avm2::simulation
