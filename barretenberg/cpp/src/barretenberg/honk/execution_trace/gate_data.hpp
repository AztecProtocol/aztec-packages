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

// Bilinear / batched-eq gate (Mega flavors only; see relations/bilinear_or_batched_eq_check_relation.hpp).
// Two row-modes, each populating a different set of wires + selectors:
//   - Bilinear: enforces  q_m·a·b + q_5·a·c + q_l·a + q_r·b + q_o·c + q_4·d + q_c = 0.
//               Wires are (a, b, c, d): two products sharing wire a, on the pairs (a, b) and (a, c), a
//               linear term on each wire, and a constant. Wire d appears only in its linear term.
//   - BatchedEq:     enforces  q_l·a + q_r·b + q_c       = 0  (batched-eq-half-1)
//                    and       q_o·c + q_4·d + q_m       = 0  (batched-eq-half-2).
enum class BilinearBatchedEqMode : uint8_t { Bilinear, BatchedEq };

template <typename FF> struct bilinear_batched_eq_gate_ {
    BilinearBatchedEqMode mode;
    uint32_t a;
    uint32_t b;
    uint32_t c;
    uint32_t d;
    FF q_l;
    FF q_r;
    FF q_o;
    FF q_4;
    FF q_c; // batched-eq-half-1 constant in BatchedEq mode
    FF q_m; // first product (a·b) selector in Bilinear mode; batched-eq-half-2 constant in BatchedEq mode
    FF q_5; // second product (a·c) selector in Bilinear mode; unused (0) in BatchedEq mode
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

// Databus lookup gate: reads value at index from kernel_calldata/returndata
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

// Initial linear layer gate for Poseidon2. Wires hold the raw permutation input; the next row
// holds M_E * input and is consumed by the first external-round gate.
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

// K=4 compressed internal-round gate: processes FOUR consecutive internal rounds per row.
// Wires: a = state[0] at round 4i+0, b = state[0] at round 4i+1,
//        c = state[0] at round 4i+2, d = state[0] at round 4i+3.
// (s_1, s_2, s_3) at row start are reconstructed inside the relation via a 3x3 Vandermonde solve.
//
// Round constants on the row (see Poseidon2QuadInternalRelationImpl):
//   q_l, q_r, q_o, q_4 = c_{4i}, c_{4i+1}, c_{4i+2}, c_{4i+3}   // this quad's 4 S-box constants
//   q_m, q_c, q_5      = c_{4(i+1)}, c_{4(i+1)+1}, c_{4(i+1)+2} // next quad's first 3 constants
//                                                               // (unused on terminal row)
template <typename FF> struct poseidon2_quad_internal_gate_ {
    uint32_t a;             // state[0] at round 4i+0
    uint32_t b;             // state[0] at round 4i+1
    uint32_t c;             // state[0] at round 4i+2
    uint32_t d;             // state[0] at round 4i+3
    size_t round_idx_start; // absolute round_constants index of round 4i (this quad's 1st round)
    size_t next_pair_start; // absolute round_constants index of round 4(i+1) (next quad's 1st round);
                            // ignored when is_terminal = true
    bool is_terminal;       // true on the last compressed row (successor is standard-encoded)
};

// Entry transition gate: standard-encoded state (s_0, s_1, s_2, s_3) at round `round_idx_start`
// whose successor is the first K=4 compressed row. The relation forces the successor's
// w_r_shift, w_o_shift, w_4_shift to state[0] at rounds start+1, start+2, start+3 respectively.
//
// Round constants on the row:
//   q_l, q_r, q_o = c_{start}, c_{start+1}, c_{start+2}   (first 3 internal round constants)
//   q_4, q_m, q_c, q_5 = 0 (unused)
template <typename FF> struct poseidon2_transition_entry_gate_ {
    uint32_t a;             // s_0
    uint32_t b;             // s_1
    uint32_t c;             // s_2
    uint32_t d;             // s_3
    size_t round_idx_start; // absolute round_constants index of the first internal round
};
} // namespace bb
