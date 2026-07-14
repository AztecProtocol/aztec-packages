#include "barretenberg/vm2/tracegen/sha256_trace.hpp"

#include <algorithm>
#include <cstddef>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/generated/relations/lookups_sha256.hpp"
#include "barretenberg/vm2/generated/relations/lookups_sha256_mem.hpp"

namespace bb::avm2::tracegen {

using C = Column;

namespace {

constexpr FF TAG_U32_AS_FF = FF(static_cast<uint8_t>(MemoryTag::U32));

// Precomputed inverses for values 0..65. Covers:
// - rounds_remaining inverses: FF(64 - i) for i in [0, 63], i.e., values 1..64
// - input_rounds_rem inverses: values 1..16
// Index 0 maps to FF(0) which is not invertible; batch_invert leaves it as 0.
const std::array<FF, 65> PRECOMPUTED_INVERSES = []() {
    std::array<FF, 65> inverses;
    for (size_t i = 0; i < 65; i++) {
        inverses[i] = FF(i);
    }
    FF::batch_invert(inverses);
    return inverses;
}();

// These are some useful groupings of columns for the SHA256 trace that we will iterate over.
constexpr std::array<C, 8> STATE_COLS = {
    C::sha256_a, C::sha256_b, C::sha256_c, C::sha256_d, C::sha256_e, C::sha256_f, C::sha256_g, C::sha256_h,
};

constexpr std::array<C, 8> INIT_STATE_COLS = {
    C::sha256_init_a, C::sha256_init_b, C::sha256_init_c, C::sha256_init_d,
    C::sha256_init_e, C::sha256_init_f, C::sha256_init_g, C::sha256_init_h,
};

constexpr std::array<C, 16> W_COLS = {
    C::sha256_helper_w0,  C::sha256_helper_w1,  C::sha256_helper_w2,  C::sha256_helper_w3,
    C::sha256_helper_w4,  C::sha256_helper_w5,  C::sha256_helper_w6,  C::sha256_helper_w7,
    C::sha256_helper_w8,  C::sha256_helper_w9,  C::sha256_helper_w10, C::sha256_helper_w11,
    C::sha256_helper_w12, C::sha256_helper_w13, C::sha256_helper_w14, C::sha256_helper_w15,
};

constexpr std::array<C, 16> OUTPUT_COLS = {
    C::sha256_output_a_lhs, C::sha256_output_a_rhs, C::sha256_output_b_lhs, C::sha256_output_b_rhs,
    C::sha256_output_c_lhs, C::sha256_output_c_rhs, C::sha256_output_d_lhs, C::sha256_output_d_rhs,
    C::sha256_output_e_lhs, C::sha256_output_e_rhs, C::sha256_output_f_lhs, C::sha256_output_f_rhs,
    C::sha256_output_g_lhs, C::sha256_output_g_rhs, C::sha256_output_h_lhs, C::sha256_output_h_rhs,
};

constexpr std::array<uint32_t, 64> ROUND_CONSTANTS = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
};

}; // namespace

/**
 * @brief Set the 16 message-schedule helper columns (w0..w15) at the current row.
 * @param prev_w_helpers The 16 previous w helper values for this round.
 * @param trace The trace container to populate.
 */
void Sha256TraceBuilder::set_helper_cols(const std::array<uint32_t, 16>& prev_w_helpers, TraceContainer& trace) const
{
    for (size_t i = 0; i < 16; i++) {
        trace.set(row, { { { W_COLS[i], prev_w_helpers[i] } } });
    }
}

/**
 * @brief Set the 8 round-state columns (a..h) at the current row.
 * @param state The 8 state values for this round.
 * @param trace The trace container to populate.
 */
void Sha256TraceBuilder::set_state_cols(const std::array<uint32_t, 8>& state, TraceContainer& trace) const
{
    for (size_t i = 0; i < 8; i++) {
        trace.set(row, { { { STATE_COLS[i], state[i] } } });
    }
}

/**
 * @brief Set the 8 initial-state columns (init_a..init_h) at the current row.
 * @param init_state The 8 initial hash state values (propagated unchanged across all rows).
 * @param trace The trace container to populate.
 */
void Sha256TraceBuilder::set_init_state_cols(const std::array<uint32_t, 8>& init_state, TraceContainer& trace) const
{
    for (size_t i = 0; i < 8; i++) {
        trace.set(row, { { { INIT_STATE_COLS[i], init_state[i] } } });
    }
}

/**
 * @brief Decompose a value into high and low limbs at a given bit position and write them to the trace.
 * @param a The value to decompose.
 * @param b The bit position at which to split (low limb has b bits).
 * @param col_lhs The column for the high limb (a >> b).
 * @param col_rhs The column for the low limb (a & (2^b - 1)).
 * @param trace The trace container to populate.
 * @pre b must satisfy b < 64. A value >= 64 would cause undefined behavior per the C++ standard
 *      for 64-bit operands (a >> b and 1 << b). This is an internal helper; all callers pass
 *      either fixed SHA-256 rotation/shift amounts (2, 3, 6, 7, 10, 11, 13, 17, 18, 19, 22, 25)
 *      or the literal 32 for modular reduction, so this precondition is always satisfied.
 */
void Sha256TraceBuilder::into_limbs_with_witness(
    uint64_t a, const uint8_t b, C col_lhs, C col_rhs, TraceContainer& trace) const
{
    uint32_t a_lhs = static_cast<uint32_t>(a >> b);
    uint32_t a_rhs = static_cast<uint32_t>(a) & static_cast<uint32_t>((static_cast<uint64_t>(1) << b) - 1);
    trace.set(row, { { { col_lhs, a_lhs }, { col_rhs, a_rhs } } });
}

/**
 * @brief Perform a 32-bit right rotation and insert the result and rhs limb into the trace.
 *
 * Only the rotation result and the low limb (rhs) are written. The high limb (lhs) is
 * algebraically eliminated in PIL via the combined rotation constraint:
 *   X = Y * 2^a - rhs * (2^32 - 1)
 *
 * @param val The 32-bit value to rotate.
 * @param shift The number of bits to rotate right.
 * @param col_result The column for the rotation result.
 * @param col_rhs The column for the low limb of the decomposition (range-checked in PIL).
 * @param trace The trace container to populate.
 * @return The rotated 32-bit value.
 * @pre shift must satisfy 0 < shift < 32. A shift >= 32 causes undefined behavior per the
 *      C++ standard for 32-bit operands. A shift == 0 also causes undefined behavior because
 *      the reconstruction `val << (32 - shift)` becomes a left shift by 32. This is an internal
 *      helper; all callers use fixed SHA-256 rotation amounts (2, 6, 7, 11, 13, 17, 18, 19,
 *      22, 25), so this precondition is always satisfied.
 */
uint32_t Sha256TraceBuilder::ror_with_witness(
    const uint32_t val, const uint8_t shift, C col_result, C col_rhs, TraceContainer& trace) const
{
    uint32_t result = (val >> shift) | (val << (32U - shift));
    uint32_t rhs = val & ((static_cast<uint32_t>(1) << shift) - 1);
    trace.set(row, { { { col_result, result }, { col_rhs, rhs } } });
    return result;
}

/**
 * @brief Perform a 32-bit right shift and insert the limb decomposition into the trace.
 *
 * The shift result is the high limb (col_lhs = val >> shift), written by into_limbs_with_witness.
 *
 * @param val The 32-bit value to shift.
 * @param shift The number of bits to shift right.
 * @param col_lhs The column for the high limb of the decomposition (shift result).
 * @param col_rhs The column for the low limb of the decomposition (discarded bits).
 * @param trace The trace container to populate.
 * @return The shifted 32-bit value.
 * @pre shift must satisfy shift < 32. A shift >= 32 would cause undefined behavior per the
 *      C++ standard for 32-bit operands. This is an internal helper; all callers use fixed
 *      SHA-256 shift amounts (3, 10), so this precondition is always satisfied.
 */
uint32_t Sha256TraceBuilder::shr_with_witness(
    const uint32_t val, const uint8_t shift, C col_lhs, C col_rhs, TraceContainer& trace) const
{
    auto result = val >> shift;
    into_limbs_with_witness(val, shift, col_lhs, col_rhs, trace);
    return result;
}

/**
 * @brief Compute the message schedule word w[j] for a non-input round and insert witness data into the trace.
 *
 * Implements w[j] = w[j-16] + s0 + w[j-7] + s1 where s0 and s1 are computed from rotations
 * and shifts of previous w values, with all intermediate results recorded as trace columns.
 *
 * @param prev_w_helpers The 16 most recent w values (sliding window), indexed 0..15.
 * @param trace The trace container to populate.
 * @return The computed w value for this round (reduced modulo 2^32).
 */
uint32_t Sha256TraceBuilder::compute_w_with_witness(const std::array<uint32_t, 16>& prev_w_helpers,
                                                    TraceContainer& trace) const
{

    // Computing w[j] := w[j-16] + s0 + w[j-7] + s1

    // Step (1) s0 := ror(w[i - 15], 7) ^ ror(w[i - 15], 18) ^ (w[i - 15] >> 3);
    // Compute ror(w[i - 15], 7)
    uint32_t rot_7 = ror_with_witness(prev_w_helpers[1], 7, C::sha256_w_15_rotr_7, C::sha256_rhs_w_7, trace);
    trace.set(C::sha256_rng_chk_7, row, 7);
    // Compute ror(w[i - 15], 18)
    uint32_t rot_18 = ror_with_witness(prev_w_helpers[1], 18, C::sha256_w_15_rotr_18, C::sha256_rhs_w_18, trace);
    trace.set(C::sha256_rng_chk_18, row, 18);
    // Compute (w[i - 15] >> 3)
    uint32_t shift_3 = shr_with_witness(prev_w_helpers[1], 3, C::sha256_lhs_w_3, C::sha256_rhs_w_3, trace);
    trace.set(C::sha256_rng_chk_3, row, 3);

    // Compute ror(w[i - 15], 7) ^ ror(w[i - 15], 18)
    trace.set(C::sha256_w_15_rotr_7_xor_w_15_rotr_18, row, rot_7 ^ rot_18);
    // Compute s0;
    uint32_t w_s_0 = rot_7 ^ rot_18 ^ shift_3;
    trace.set(C::sha256_w_s_0, row, w_s_0);

    // Step (2) s1 := ror(w[i - 2], 17) ^ ror(w[i - 2], 19) ^ (w[i - 2] >> 10);
    // Compute ror(w[i - 2], 17)
    uint32_t rot_17 = ror_with_witness(prev_w_helpers[14], 17, C::sha256_w_2_rotr_17, C::sha256_rhs_w_17, trace);
    trace.set(C::sha256_rng_chk_17, row, 17);
    // Compute ror(wi - 2, 19)
    uint32_t rot_19 = ror_with_witness(prev_w_helpers[14], 19, C::sha256_w_2_rotr_19, C::sha256_rhs_w_19, trace);
    trace.set(C::sha256_rng_chk_19, row, 19);
    // Compute (w[i - 2] >> 10)
    uint32_t shift_10 = shr_with_witness(prev_w_helpers[14], 10, C::sha256_lhs_w_10, C::sha256_rhs_w_10, trace);
    trace.set(C::sha256_rng_chk_10, row, 10);

    // Compute ror(w[i - 2], 17) ^ ror(w[i - 2], 19)
    trace.set(C::sha256_w_2_rotr_17_xor_w_2_rotr_19, row, rot_17 ^ rot_19);
    // Compute s1;
    uint32_t w_s_1 = rot_17 ^ rot_19 ^ shift_10;
    trace.set(C::sha256_w_s_1, row, w_s_1);

    // Compute w:= w[0] + s0 + w[9] + s1
    // The computation of w can overflow 32 bits so we need to use a 64-bit integer and perform modulo reduction
    uint64_t computed_w = static_cast<uint64_t>(prev_w_helpers[0]) + static_cast<uint64_t>(w_s_0) +
                          static_cast<uint64_t>(prev_w_helpers[9]) + static_cast<uint64_t>(w_s_1);

    into_limbs_with_witness(computed_w, 32, C::sha256_computed_w_lhs, C::sha256_computed_w_rhs, trace);
    return static_cast<uint32_t>(computed_w);
}

/**
 * @brief Perform one round of the SHA-256 compression function and insert all witness data into the trace.
 *
 * Computes S0, S1, ch, maj, temp1, temp2, and the updated state for a single SHA-256 round.
 * All intermediate values (rotations, bitwise ops, modular additions) are written to the trace.
 *
 * @param state The 8-element state array [a, b, c, d, e, f, g, h] at the start of this round.
 * @param round_w The message schedule word w[i] for this round.
 * @param round_constant The SHA-256 round constant k[i] for this round.
 * @param trace The trace container to populate.
 * @return The updated 8-element state array after this round.
 */
std::array<uint32_t, 8> Sha256TraceBuilder::compute_compression_with_witness(const std::array<uint32_t, 8>& state,
                                                                             uint32_t round_w,
                                                                             uint32_t round_constant,
                                                                             TraceContainer& trace) const
{

    // Apply SHA-256 compression function to the message schedule
    // Compute S1 := ror(e, 6U) ^ ror(e, 11U) ^ ror(e, 25U);
    // Compute ror(e, 6)
    uint32_t rot_6 = ror_with_witness(state[4], 6, C::sha256_e_rotr_6, C::sha256_rhs_e_6, trace);
    trace.set(C::sha256_rng_chk_6, row, 6);
    // Compute ror(e, 11)
    uint32_t rot_11 = ror_with_witness(state[4], 11, C::sha256_e_rotr_11, C::sha256_rhs_e_11, trace);
    trace.set(C::sha256_rng_chk_11, row, 11);
    // Compute ror(e, 25)
    uint32_t rot_25 = ror_with_witness(state[4], 25, C::sha256_e_rotr_25, C::sha256_rhs_e_25, trace);
    trace.set(C::sha256_rng_chk_25, row, 25);

    // Compute ror(e, 6) ^ ror(e, 11)
    trace.set(C::sha256_e_rotr_6_xor_e_rotr_11, row, rot_6 ^ rot_11);
    // Compute S1, this can't overflow but we expand to uint64_t for later use
    uint64_t S1 = rot_6 ^ rot_11 ^ rot_25;
    trace.set(C::sha256_s_1, row, S1);

    // Compute ch := (e & f) ^ (~e & g);
    // Compute ~e
    uint32_t not_e = ~state[4];
    trace.set(C::sha256_not_e, row, not_e);
    // Compute e & f
    uint32_t e_and_f = state[4] & state[5];
    trace.set(C::sha256_e_and_f, row, e_and_f);
    // Compute ~e & g
    uint32_t not_e_and_g = not_e & state[6];
    trace.set(C::sha256_not_e_and_g, row, not_e_and_g);
    // Compute (e & f) ^ (~e & g),this can't overflow but we expand to uint64_t for later use
    uint64_t ch = e_and_f ^ not_e_and_g;
    trace.set(C::sha256_ch, row, ch);

    // Compute S0 := ror(a, 2U) ^ ror(a, 13U) ^ ror(a, 22U);
    // Compute ror(a, 2)
    uint32_t rot_2 = ror_with_witness(state[0], 2, C::sha256_a_rotr_2, C::sha256_rhs_a_2, trace);
    trace.set(C::sha256_rng_chk_2, row, 2);
    // Compute ror(a, 13)
    uint32_t rot_13 = ror_with_witness(state[0], 13, C::sha256_a_rotr_13, C::sha256_rhs_a_13, trace);
    trace.set(C::sha256_rng_chk_13, row, 13);
    // Compute ror(a, 22)
    uint32_t rot_22 = ror_with_witness(state[0], 22, C::sha256_a_rotr_22, C::sha256_rhs_a_22, trace);
    trace.set(C::sha256_rng_chk_22, row, 22);

    // Compute ror(a, 2) ^ ror(a, 13)
    trace.set(C::sha256_a_rotr_2_xor_a_rotr_13, row, rot_2 ^ rot_13);
    // Compute S0, this can't overflow but we expand to uint64_t for later use
    uint64_t S0 = rot_2 ^ rot_13 ^ rot_22;
    trace.set(C::sha256_s_0, row, S0);

    // Compute Maj := (a & b) ^ (a & c) ^ (b & c);
    // Compute a & b
    uint32_t a_and_b = state[0] & state[1];
    trace.set(C::sha256_a_and_b, row, a_and_b);
    // Compute a & c
    uint32_t a_and_c = state[0] & state[2];
    trace.set(C::sha256_a_and_c, row, a_and_c);
    // Compute b & c
    uint32_t b_and_c = state[1] & state[2];
    trace.set(C::sha256_b_and_c, row, b_and_c);
    // Compute (a & b) ^ (a & c)
    trace.set(C::sha256_a_and_b_xor_a_and_c, row, a_and_b ^ a_and_c);
    // Compute Maj, this is expanded to uint64_t to detect later overflows
    uint64_t maj = a_and_b ^ a_and_c ^ b_and_c;
    trace.set(C::sha256_maj, row, maj);

    // Compute temp values, these need be 64-bit integers and performed modulo 2^32
    uint64_t temp1 = static_cast<uint64_t>(state[7]) + S1 + ch + static_cast<uint64_t>(round_constant) +
                     static_cast<uint64_t>(round_w);
    uint64_t temp2 = S0 + maj;
    uint64_t next_a = temp1 + temp2;
    into_limbs_with_witness(next_a, 32, C::sha256_next_a_lhs, C::sha256_next_a_rhs, trace);
    trace.set(C::sha256_round_constant, row, round_constant);
    uint32_t a = static_cast<uint32_t>(next_a);

    // Additions can overflow 32 bits so we perform modulo reduction
    uint64_t next_e = static_cast<uint64_t>(state[3]) + temp1;
    into_limbs_with_witness(next_e, 32, C::sha256_next_e_lhs, C::sha256_next_e_rhs, trace);
    uint32_t e = static_cast<uint32_t>(next_e);

    return {
        a,        /*a = temp1 + temp2*/
        state[0], /*b = a*/
        state[1], /*c = b*/
        state[2], /*d = c*/
        e,        /*e = d + temp1*/
        state[4], /*f = e*/
        state[5], /*g = f*/
        state[6], /*h = g*/
    };
}

/**
 * @brief Compute the final SHA-256 output (init_state + final_round_state mod 2^32) and write to the trace.
 * @param out_state The 8-element state array after the final (64th) compression round.
 * @param init_state The 8-element initial hash state before compression.
 * @param trace The trace container to populate with the output limb decompositions.
 */
void Sha256TraceBuilder::compute_sha256_output(const std::array<uint32_t, 8>& out_state,
                                               const std::array<uint32_t, 8>& init_state,
                                               TraceContainer& trace) const
{
    uint32_t counter = 0;
    for (const auto& [init, state] : zip_view(init_state, out_state)) {
        uint64_t output = static_cast<uint64_t>(init) + static_cast<uint64_t>(state);
        into_limbs_with_witness(output, 32, OUTPUT_COLS[counter], OUTPUT_COLS[counter + 1], trace);
        counter += 2;
    }
}

/**
 * @brief Process the SHA-256 compression events and populate the relevant columns in the trace.
 *
 * Events are emitted in the following flavors:
 * - Normal execution: state has 8 valid U32 elements, input has 16 valid U32 elements,
 *   output contains the computed compression result. Produces 65 rows (64 rounds + 1 final).
 * - Address out-of-range error: one or more of state/input/output address ranges exceed the
 *   maximum memory address. Produces 1 row with error flags set.
 * - Invalid state tag error: at least one state element has a non-U32 tag. State is fully
 *   loaded but invalid. Produces 1 row with batched tag check and error flags.
 * - Invalid input tag error: state is valid but an input element has a non-U32 tag. Input
 *   contains elements up to and including the first invalid one. Produces rows for each
 *   input element loaded (up to 16), with error flags propagated.
 *
 * @param events Container of Sha256CompressionEvent to process.
 * @param trace The trace container to populate.
 */
void Sha256TraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::Sha256CompressionEvent>::Container& events,
    TraceContainer& trace)
{
    // row is a class member and is initialized to 1 (we use shifted columns) in the constructor.

    for (const auto& event : events) {

        /////////////////////////////////////////////////////
        // Memory Components of SHA-256 Compression Function
        /////////////////////////////////////////////////////
        // Upcast addresses to uint64_t to avoid overflow issues
        uint64_t state_addr = static_cast<uint64_t>(event.state_addr);
        uint64_t input_addr = static_cast<uint64_t>(event.input_addr);
        uint64_t output_addr = static_cast<uint64_t>(event.output_addr);

        uint64_t max_state_addr = state_addr + 7;   // State is 8 elements
        uint64_t max_input_addr = input_addr + 15;  // Input is 16 elements
        uint64_t max_output_addr = output_addr + 7; // Output is 8 elements

        // These are unconditional values that must always be set at the start
        trace.set(row,
                  { {
                      { C::sha256_sel, 1 },
                      { C::sha256_start, 1 },
                      { C::sha256_execution_clk, event.execution_clk },
                      { C::sha256_space_id, event.space_id },
                      { C::sha256_u32_tag, TAG_U32_AS_FF },
                      // Operand Addresses
                      { C::sha256_state_addr, state_addr },
                      { C::sha256_input_addr, input_addr },
                      { C::sha256_output_addr, output_addr },
                      // Helpers
                      { C::sha256_max_mem_addr, AVM_HIGHEST_MEM_ADDRESS },
                      { C::sha256_max_state_addr, max_state_addr },
                      { C::sha256_max_input_addr, max_input_addr },
                      { C::sha256_max_output_addr, max_output_addr },
                      { C::sha256_input_rounds_rem, 16 }, // Number of inputs
                      { C::sha256_input_rounds_rem_inv, PRECOMPUTED_INVERSES[16] },
                      { C::sha256_sel_is_input_round, 1 },
                      { C::sha256_rounds_remaining, 64 }, // Number of Sha256 Rounds
                  } });

        //////////////////////////////////////
        // Error Handling - Memory Out of Range
        //////////////////////////////////////
        bool state_out_of_range = max_state_addr > AVM_HIGHEST_MEM_ADDRESS;
        bool input_out_of_range = max_input_addr > AVM_HIGHEST_MEM_ADDRESS;
        bool output_out_of_range = max_output_addr > AVM_HIGHEST_MEM_ADDRESS;

        bool out_of_range_err = output_out_of_range || input_out_of_range || state_out_of_range;
        if (out_of_range_err) {
            trace.set(row,
                      { {
                          // Error flags
                          { C::sha256_sel_state_out_of_range_err, state_out_of_range ? 1 : 0 },
                          { C::sha256_sel_input_out_of_range_err, input_out_of_range ? 1 : 0 },
                          { C::sha256_sel_output_out_of_range_err, output_out_of_range ? 1 : 0 },
                          { C::sha256_mem_out_of_range_err, 1 },
                          { C::sha256_err, 1 }, // Set the error flag
                          { C::sha256_end, 1 }, // End is set on error
                      } });
            row++;
            continue; // Skip to the next event if we have an out of range error
        }

        //////////////////////////////////////
        // Load Initial State from Memory
        //////////////////////////////////////
        // If we get here we are safe to load the memory, we need to split this up between the parallel and sequential
        // loading. State is loaded in parallel, whilst inputs are loaded sequential.

        // Since we treat them as separate temporality groups, if there is an error in the state loading, we will not
        // load the input
        trace.set(row,
                  { {
                      // State Loading Selectors
                      { C::sha256_sel_mem_state_or_output, 1 },
                      // State Addresses
                      { C::sha256_memory_address_0_, state_addr },
                      { C::sha256_memory_address_1_, state_addr + 1 },
                      { C::sha256_memory_address_2_, state_addr + 2 },
                      { C::sha256_memory_address_3_, state_addr + 3 },
                      { C::sha256_memory_address_4_, state_addr + 4 },
                      { C::sha256_memory_address_5_, state_addr + 5 },
                      { C::sha256_memory_address_6_, state_addr + 6 },
                      { C::sha256_memory_address_7_, state_addr + 7 },
                      // State Values
                      { C::sha256_memory_register_0_, event.state[0].as_ff() },
                      { C::sha256_memory_register_1_, event.state[1].as_ff() },
                      { C::sha256_memory_register_2_, event.state[2].as_ff() },
                      { C::sha256_memory_register_3_, event.state[3].as_ff() },
                      { C::sha256_memory_register_4_, event.state[4].as_ff() },
                      { C::sha256_memory_register_5_, event.state[5].as_ff() },
                      { C::sha256_memory_register_6_, event.state[6].as_ff() },
                      { C::sha256_memory_register_7_, event.state[7].as_ff() },
                      // Values need to match initial state of sha256 compression
                      { C::sha256_init_a, event.state[0].as_ff() },
                      { C::sha256_init_b, event.state[1].as_ff() },
                      { C::sha256_init_c, event.state[2].as_ff() },
                      { C::sha256_init_d, event.state[3].as_ff() },
                      { C::sha256_init_e, event.state[4].as_ff() },
                      { C::sha256_init_f, event.state[5].as_ff() },
                      { C::sha256_init_g, event.state[6].as_ff() },
                      { C::sha256_init_h, event.state[7].as_ff() },
                      // State Memory Tags
                      { C::sha256_memory_tag_0_, static_cast<uint8_t>(event.state[0].get_tag()) },
                      { C::sha256_memory_tag_1_, static_cast<uint8_t>(event.state[1].get_tag()) },
                      { C::sha256_memory_tag_2_, static_cast<uint8_t>(event.state[2].get_tag()) },
                      { C::sha256_memory_tag_3_, static_cast<uint8_t>(event.state[3].get_tag()) },
                      { C::sha256_memory_tag_4_, static_cast<uint8_t>(event.state[4].get_tag()) },
                      { C::sha256_memory_tag_5_, static_cast<uint8_t>(event.state[5].get_tag()) },
                      { C::sha256_memory_tag_6_, static_cast<uint8_t>(event.state[6].get_tag()) },
                      { C::sha256_memory_tag_7_, static_cast<uint8_t>(event.state[7].get_tag()) },
                  } });

        //////////////////////////////////////
        // Check for Tag Errors in State
        //////////////////////////////////////
        bool invalid_state_tag_err = std::ranges::any_of(
            event.state, [](const MemoryValue& state) { return state.get_tag() != MemoryTag::U32; });

        if (invalid_state_tag_err) {
            // This is the more efficient batched tag check we perform in the circuit
            FF batched_tag_check = 0;
            // Batch the state tag checks
            for (uint32_t i = 0; i < event.state.size(); i++) {
                // Compute the batched tag check step by step to match the circuit implementation
                FF mem_tag = FF(static_cast<uint8_t>(event.state[i].get_tag()));
                FF state_tag_diff = mem_tag - TAG_U32_AS_FF;
                FF exponent = FF(1 << (i * 3)); // exponent is 1, 8, 64, 512, ...
                batched_tag_check += state_tag_diff * exponent;
            }
            trace.set(row,
                      { {
                          { C::sha256_sel_invalid_state_tag_err, 1 },
                          // Inline inversion (not batched): this is an error path that should not often occur in
                          // production. Guaranteed non-zero (so inversion is safe) since we have an invalid tag.
                          { C::sha256_batch_tag_inv, batched_tag_check.invert() },
                          { C::sha256_end, 1 },
                          { C::sha256_err, 1 }, // Set the error flag
                      } });

            row++;
            continue; // Skip to the next event if we have an invalid state tag error
        }

        /////////////////////////////////////////////
        // Load Hash inputs and check for tag errors
        ////////////////////////////////////////////
        // The inputs vector is expected to 16 elements and each element is expected to be a 32-bit value
        // If during simulation we encounter an invalid tag, it will have been the last element we retrieved
        // before we threw an error - so it will be the last element in the input vector.
        // Therefore, it is just sufficient to check the tag of the last element
        BB_ASSERT(!event.input.empty(), "SHA256 input cannot be empty");
        bool invalid_input_tag_err = event.input.back().get_tag() != MemoryTag::U32;

        // Note that if we encountered an invalid tag error, the row that loaded the invalid tag needs to contain
        // sel_invalid_input_ROW_tag_err. And all the rows before need to contain sel_invalid_input_tag_err.
        // The former is used to constrain the specific error, while the latter is used to propagate the error
        // to the start row (to communicate back to execution) and to turn off any computation constraints.
        for (uint32_t i = 0; i < event.input.size(); i++) {
            const uint32_t input_rounds_rem = 16 - i;
            FF input_rounds_rem_inv = PRECOMPUTED_INVERSES[input_rounds_rem];

            const MemoryValue& round_input = event.input[i];
            FF input_tag = FF(static_cast<uint8_t>(round_input.get_tag()));
            FF input_tag_diff = input_tag - TAG_U32_AS_FF;
            // Inline inversion (not batched): this is an error path that should not often occur in production.
            FF input_tag_diff_inv = input_tag_diff == 0 ? 0 : input_tag_diff.invert();

            bool is_last = (i == event.input.size() - 1);
            trace.set(row + i,
                      { {
                          { C::sha256_sel, 1 },
                          // Propagated Fields
                          { C::sha256_execution_clk, event.execution_clk },
                          { C::sha256_space_id, event.space_id },
                          { C::sha256_output_addr, output_addr },
                          { C::sha256_sel_is_input_round, 1 },
                          { C::sha256_u32_tag, TAG_U32_AS_FF },
                          { C::sha256_sel_read_input_from_memory, 1 },
                          // Input Rounds Control Flow
                          { C::sha256_input_rounds_rem, input_rounds_rem },
                          { C::sha256_input_rounds_rem_inv, input_rounds_rem_inv },
                          { C::sha256_input_addr, input_addr + i },
                          { C::sha256_input, round_input.as_ff() },
                          { C::sha256_input_tag, input_tag },
                          { C::sha256_input_tag_diff_inv, input_tag_diff_inv },
                          // Set input value
                          { C::sha256_w, round_input.as_ff() },
                          // Error Columns
                          // Propagated tag error columns
                          { C::sha256_sel_invalid_input_tag_err, invalid_input_tag_err ? 1 : 0 },
                          // Invalid Row Tag Error Columns
                          { C::sha256_sel_invalid_input_row_tag_err, (is_last && invalid_input_tag_err) ? 1 : 0 },
                          { C::sha256_err, invalid_input_tag_err ? 1 : 0 },
                          { C::sha256_end, (is_last && invalid_input_tag_err) ? 1 : 0 },
                      } });
        }

        if (invalid_input_tag_err) {
            // We need to increment the row counter for the next event (since we may have added rows for input loading)
            row += static_cast<uint32_t>(event.input.size());
            continue;
        }

        // If we get to this point, we are safe to proceed with the SHA-256 compression function
        // and we won't encounter any more errors

        /////////////////////////////////////////
        // Execute SHA-256 Compression Function
        /////////////////////////////////////////
        std::array<uint32_t, 8> state;
        std::ranges::transform(event.state.begin(), event.state.end(), state.begin(), [](const MemoryValue& val) {
            return val.as<uint32_t>();
        });

        std::array<uint32_t, 16> prev_w_helpers;
        std::ranges::transform(event.input.begin(),
                               event.input.end(),
                               prev_w_helpers.begin(),
                               [](const MemoryValue& val) { return val.as<uint32_t>(); });
        std::array<uint32_t, 8> round_state = state;

        // Each event results in 65 rows in the trace.
        // 64 rows for the 64 rounds of the SHA-256 compression function
        // 1 row for the final state

        // Begin the rounds loop
        for (size_t i = 0; i < 64; i++) {
            // Detect if we are still using the inputs for values of w
            bool is_an_input_round = i < 16;
            // Used to check we non-zero rounds remaining
            FF inv = PRECOMPUTED_INVERSES[64 - i];
            uint32_t round_w =
                is_an_input_round ? event.input[i].as<uint32_t>() : compute_w_with_witness(prev_w_helpers, trace);
            // For input_addr: during input rounds (0-15), it increments by 1 each row.
            // After input rounds (16-63), it stays constant at input_addr + 16.
            // This satisfies CONTINUITY_INPUT_ADDR: input_addr' = input_addr + sel_is_input_round
            uint64_t round_input_addr = is_an_input_round ? (input_addr + i) : (input_addr + 16);
            trace.set(row,
                      { {
                          { C::sha256_sel, 1 },
                          // Propagated Fields
                          { C::sha256_execution_clk, event.execution_clk },
                          { C::sha256_space_id, event.space_id },
                          { C::sha256_output_addr, output_addr },
                          { C::sha256_input_addr, round_input_addr },
                          { C::sha256_u32_tag, TAG_U32_AS_FF },
                          { C::sha256_rng_chk_32, 32 },
                          // For round selectors
                          { C::sha256_xor_op_id, AVM_BITWISE_XOR_OP_ID },
                          { C::sha256_and_op_id, AVM_BITWISE_AND_OP_ID },
                          { C::sha256_perform_round, 1 },
                          { C::sha256_round_count, i },
                          { C::sha256_rounds_remaining, 64 - i },
                          { C::sha256_rounds_remaining_inv, inv },
                          { C::sha256_w, round_w },
                          { C::sha256_sel_compute_w, is_an_input_round ? 0 : 1 },
                      } });
            // Set the init state columns - propagated down
            set_init_state_cols(state, trace);
            // Set the state columns
            set_state_cols(round_state, trace);
            // Set the round columns
            set_helper_cols(prev_w_helpers, trace);

            // Apply SHA-256 compression function to the message schedule and update the state
            round_state = compute_compression_with_witness(round_state, round_w, ROUND_CONSTANTS[i], trace);

            // Update the prev_w_helpers, we shift all the values to the left and add the new round_w to
            // the end
            for (size_t j = 0; j < 15; j++) {
                prev_w_helpers[j] = prev_w_helpers[j + 1];
            }
            prev_w_helpers[15] = round_w;

            row++;
        }

        // Set the final row
        // input_addr stays constant at input_addr + 16 (satisfies CONTINUITY_INPUT_ADDR from row 63)
        trace.set(row,
                  { {
                      { C::sha256_sel, 1 },
                      { C::sha256_end, 1 },
                      { C::sha256_last, 1 },
                      { C::sha256_round_count, 64 },
                      { C::sha256_input_addr, input_addr + 16 },
                  } });

        // Set the init state columns - propagated down
        set_init_state_cols(state, trace);
        // Set the state column
        set_state_cols(round_state, trace);
        // Set the round columns
        set_helper_cols(prev_w_helpers, trace);
        // Compute the output from the final round state
        compute_sha256_output(round_state, state, trace);

        /////////////////////////////////////////
        // Write output memory
        /////////////////////////////////////////
        trace.set(row,
                  { {
                      // Memory Fields
                      { C::sha256_execution_clk, event.execution_clk },
                      { C::sha256_space_id, event.space_id },
                      { C::sha256_sel_mem_state_or_output, 1 },
                      { C::sha256_rw, 1 }, // Writing output
                      { C::sha256_u32_tag, TAG_U32_AS_FF },
                      { C::sha256_rng_chk_32, 32 },
                      { C::sha256_output_addr, output_addr },
                      // Output Addresses
                      { C::sha256_memory_address_0_, output_addr },
                      { C::sha256_memory_address_1_, output_addr + 1 },
                      { C::sha256_memory_address_2_, output_addr + 2 },
                      { C::sha256_memory_address_3_, output_addr + 3 },
                      { C::sha256_memory_address_4_, output_addr + 4 },
                      { C::sha256_memory_address_5_, output_addr + 5 },
                      { C::sha256_memory_address_6_, output_addr + 6 },
                      { C::sha256_memory_address_7_, output_addr + 7 },
                      // Output Values
                      // The addition round_state[i] + state[i] is performed modulo 2^32.
                      { C::sha256_memory_register_0_, round_state[0] + state[0] },
                      { C::sha256_memory_register_1_, round_state[1] + state[1] },
                      { C::sha256_memory_register_2_, round_state[2] + state[2] },
                      { C::sha256_memory_register_3_, round_state[3] + state[3] },
                      { C::sha256_memory_register_4_, round_state[4] + state[4] },
                      { C::sha256_memory_register_5_, round_state[5] + state[5] },
                      { C::sha256_memory_register_6_, round_state[6] + state[6] },
                      { C::sha256_memory_register_7_, round_state[7] + state[7] },
                      // Output Memory Tags
                      { C::sha256_memory_tag_0_, TAG_U32_AS_FF },
                      { C::sha256_memory_tag_1_, TAG_U32_AS_FF },
                      { C::sha256_memory_tag_2_, TAG_U32_AS_FF },
                      { C::sha256_memory_tag_3_, TAG_U32_AS_FF },
                      { C::sha256_memory_tag_4_, TAG_U32_AS_FF },
                      { C::sha256_memory_tag_5_, TAG_U32_AS_FF },
                      { C::sha256_memory_tag_6_, TAG_U32_AS_FF },
                      { C::sha256_memory_tag_7_, TAG_U32_AS_FF },
                  } });

        row++;
    }
}

const InteractionDefinition Sha256TraceBuilder::interactions =
    InteractionDefinition()
        .add<InteractionType::LookupIntoIndexedByRow, lookup_sha256_round_constant_settings>()
        // GT Interactions
        .add<InteractionType::LookupGeneric, lookup_sha256_mem_check_state_addr_in_range_settings>(C::gt_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_mem_check_input_addr_in_range_settings>(C::gt_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_mem_check_output_addr_in_range_settings>(C::gt_sel)
        // Bitwise operations
        .add<InteractionType::LookupGeneric, lookup_sha256_w_s_0_xor_0_settings>(C::bitwise_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_w_s_0_xor_1_settings>(C::bitwise_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_w_s_1_xor_0_settings>(C::bitwise_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_w_s_1_xor_1_settings>(C::bitwise_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_s_1_xor_0_settings>(C::bitwise_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_s_1_xor_1_settings>(C::bitwise_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_ch_and_0_settings>(C::bitwise_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_ch_and_1_settings>(C::bitwise_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_ch_xor_settings>(C::bitwise_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_s_0_xor_0_settings>(C::bitwise_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_s_0_xor_1_settings>(C::bitwise_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_maj_and_0_settings>(C::bitwise_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_maj_and_1_settings>(C::bitwise_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_maj_and_2_settings>(C::bitwise_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_maj_xor_0_settings>(C::bitwise_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_maj_xor_1_settings>(C::bitwise_sel)
        // Range checks for Rotations and Shifts
        .add<InteractionType::LookupGeneric, lookup_sha256_range_rhs_w_7_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_range_rhs_w_18_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_range_rhs_w_3_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_range_rhs_w_17_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_range_rhs_w_19_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_range_rhs_w_10_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_range_rhs_e_6_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_range_rhs_e_11_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_range_rhs_e_25_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_range_rhs_a_2_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_range_rhs_a_13_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_range_rhs_a_22_settings>(C::range_check_sel)
        // Modulo-add rhs is 32-bit range_check; lhs uses range-8 precomputed lookups (w/next_a/next_e)
        // or boolean PIL constraints (output_*_lhs).
        .add<InteractionType::LookupIntoIndexedByRow, lookup_sha256_range_comp_w_lhs_settings>()
        .add<InteractionType::LookupGeneric, lookup_sha256_range_comp_w_rhs_settings>(C::range_check_sel)
        .add<InteractionType::LookupIntoIndexedByRow, lookup_sha256_range_comp_next_a_lhs_settings>()
        .add<InteractionType::LookupGeneric, lookup_sha256_range_comp_next_a_rhs_settings>(C::range_check_sel)
        .add<InteractionType::LookupIntoIndexedByRow, lookup_sha256_range_comp_next_e_lhs_settings>()
        .add<InteractionType::LookupGeneric, lookup_sha256_range_comp_next_e_rhs_settings>(C::range_check_sel)
        // Output rhs range_check; output_*_lhs is constrained as boolean directly in PIL.
        .add<InteractionType::LookupGeneric, lookup_sha256_range_comp_a_rhs_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_range_comp_b_rhs_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_range_comp_c_rhs_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_range_comp_d_rhs_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_range_comp_e_rhs_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_range_comp_f_rhs_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_range_comp_g_rhs_settings>(C::range_check_sel)
        .add<InteractionType::LookupGeneric, lookup_sha256_range_comp_h_rhs_settings>(C::range_check_sel);

} // namespace bb::avm2::tracegen
