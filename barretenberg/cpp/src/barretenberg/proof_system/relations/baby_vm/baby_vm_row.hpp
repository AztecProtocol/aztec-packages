#pragma once

namespace proof_system {
template <typename FF> struct BabyVMRow {
    FF scalar;
    FF q_mul;
    FF q_add;
    FF accumulator;
    FF previous_accumulator; // EXERCISE NOTE: this can be removed after we introduce copy constraints
};

} // namespace proof_system