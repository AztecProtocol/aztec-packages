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

// Internal gate data for poseidon2 internal round
template <typename FF> struct poseidon2_internal_gate_ {
    uint32_t a;
    uint32_t b;
    uint32_t c;
    uint32_t d;
    size_t round_idx;
};

// Double internal round gate: processes two consecutive internal rounds per row.
// Wires: a = state[0] at round 2i, b = state[0] at round 2i+1, c = state[2] at round 2i, d = state[3] at round 2i.
// state[1] is reconstructed inside the relation from the M_I first-row equation.
template <typename FF> struct poseidon2_double_internal_gate_ {
    uint32_t a;            // state[0] at even round
    uint32_t b;            // state[0] at odd round (= v_0 after even round)
    uint32_t c;            // state[2] at even round
    uint32_t d;            // state[3] at even round
    size_t round_idx_even; // index of even round (for round constant lookup)
    size_t round_idx_odd;  // index of odd round
    size_t round_idx_next; // index of the next pair's even round (for s1_next reconstruction; unused on terminal)
    bool is_terminal;      // true on the last compressed row (successor is external-encoded)
};

// Entry transition gate: standard-encoded state at round `round_idx` whose successor is the first
// compressed double-internal row. The relation forces the successor's w_r (= intermediate_s0) to
// equal D_1 (s_0 + c)^5 + s_1 + s_2 + s_3, where c = c_{round_idx} is stored in q_1.
// Wires: a = s_0, b = s_1, c = s_2, d = s_3.
template <typename FF> struct poseidon2_transition_entry_gate_ {
    uint32_t a;       // s_0
    uint32_t b;       // s_1
    uint32_t c;       // s_2
    uint32_t d;       // s_3
    size_t round_idx; // index of the first internal round (used to look up c for q_1)
};
} // namespace bb
