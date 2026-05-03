// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <cstdint>

namespace bb {

// 3-wire addition gate: a*a_scaling + b*b_scaling + c*c_scaling + const_scaling = 0
template <typename FF> struct add_triple_ {
    uint32_t a;
    uint32_t b;
    uint32_t c;
    FF a_scaling;
    FF b_scaling;
    FF c_scaling;
    FF const_scaling;
};

// 4-wire addition gate: a*a_scaling + b*b_scaling + c*c_scaling + d*d_scaling + const_scaling = 0
template <typename FF> struct add_quad_ {
    uint32_t a;
    uint32_t b;
    uint32_t c;
    uint32_t d;
    FF a_scaling;
    FF b_scaling;
    FF c_scaling;
    FF d_scaling;
    FF const_scaling;
};

// 4-wire mul-add gate: a*b*mul_scaling + a*a_scaling + b*b_scaling + c*c_scaling + d*d_scaling + const_scaling = 0
template <typename FF> struct mul_quad_ {
    uint32_t a;
    uint32_t b;
    uint32_t c;
    uint32_t d;
    FF mul_scaling;
    FF a_scaling;
    FF b_scaling;
    FF c_scaling;
    FF d_scaling;
    FF const_scaling;
};

// Arithmetic gate with standard selector naming: q_m*a*b + q_l*a + q_r*b + q_o*c + q_c = 0
template <typename FF> struct arithmetic_triple_ {
    uint32_t a;
    uint32_t b;
    uint32_t c;
    FF q_m;
    FF q_l;
    FF q_r;
    FF q_o;
    FF q_c;

    friend bool operator==(arithmetic_triple_<FF> const& lhs, arithmetic_triple_<FF> const& rhs) = default;
};

using arithmetic_triple = arithmetic_triple_<bb::fr>;

// Goblin ECCVM operation: stores op type, point coordinates (split into limbs), and scalar
struct ecc_op_tuple {
    uint32_t op;
    uint32_t x_lo;
    uint32_t x_hi;
    uint32_t y_lo;
    uint32_t y_hi;
    uint32_t z_1;
    uint32_t z_2;
    bool return_is_infinity;
};

// Embedded curve point addition/subtraction: (x1, y1) ± (x2, y2) = (x3, y3)
struct ecc_add_gate_ {
    uint32_t x1;
    uint32_t y1;
    uint32_t x2;
    uint32_t y2;
    uint32_t x3;
    uint32_t y3;
    bool is_addition; // else, subtraction
};

// Embedded curve point doubling: 2 * (x1, y1) = (x3, y3)
template <typename FF> struct ecc_dbl_gate_ {
    uint32_t x1;
    uint32_t y1;
    uint32_t x3;
    uint32_t y3;
};

// Databus lookup gate: reads value at index from calldata/returndata
template <typename FF> struct databus_lookup_gate_ {
    uint32_t index;
    uint32_t value;
};

// External gate data for poseidon2 external round
template <typename FF> struct poseidon2_external_gate_ {
    uint32_t a;
    uint32_t b;
    uint32_t c;
    uint32_t d;
    size_t round_idx;
};

// Initial linear layer gate for Poseidon2 (Mega only). Wires hold the raw permutation input;
// the next row holds M_E * input and is consumed by the first external round (compressed) gate.
template <typename FF> struct poseidon2_initial_external_gate_ {
    uint32_t a;
    uint32_t b;
    uint32_t c;
    uint32_t d;
};

// Internal gate data for poseidon2 internal round
template <typename FF> struct poseidon2_internal_gate_ {
    uint32_t a;
    uint32_t b;
    uint32_t c;
    uint32_t d;
    size_t round_idx;
};

// Compressed external gate (Mega only): two external rounds per row.
// Wires a..d hold the standard 4-wide state at round 2k. The auxiliary fr values
// p2_w_5..p2_w_8 hold the full state at round 2k+1.
template <typename FF> struct poseidon2_external_compressed_gate_ {
    uint32_t a;
    uint32_t b;
    uint32_t c;
    uint32_t d;
    FF p2_w_5_value;
    FF p2_w_6_value;
    FF p2_w_7_value;
    FF p2_w_8_value;
    size_t round_idx_start; // even-indexed external round; this row covers rounds [start, start+1]
};

// Transition-entry gate (Mega K=8): bridges standard external output to the K=8 compressed
// internal block. Wires hold the standard 4-wide state (s_0, s_1, s_2, s_3) at the start of the
// internal rounds. Aux wires are zero on this row.
template <typename FF> struct poseidon2_transition_entry_k8_gate_ {
    uint32_t a;
    uint32_t b;
    uint32_t c;
    uint32_t d;
    size_t round_idx_start; // first internal round index (used to fetch round constants)
};

// K=8 compressed internal-round gate (Mega): eight internal rounds per row.
// Wires a..d hold s_0 at rounds [start, start+1, start+2, start+3]. The auxiliary fr values
// p2_w_5..p2_w_8 hold s_0 at rounds [start+4, start+5, start+6, start+7].
template <typename FF> struct poseidon2_k8_internal_gate_ {
    uint32_t a;
    uint32_t b;
    uint32_t c;
    uint32_t d;
    FF p2_w_5_value;
    FF p2_w_6_value;
    FF p2_w_7_value;
    FF p2_w_8_value;
    size_t round_idx_start; // first internal round index of this row's K=8 sweep
    bool is_terminal;       // true on the last K=8 row of a permutation (skips shift-side check)
};
} // namespace bb
