#pragma once

namespace proof_system {
template <typename FF> struct BabyVMRow {
    FF w_l;
    FF w_r;
    FF w_o;
    FF q_mul;
    FF q_add;
};
} // namespace proof_system