#include "barretenberg/vm2/tracegen/sha256_trace.hpp"

#include <concepts>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <ranges>
#include <stdexcept>

#include "barretenberg/vm2/generated/relations/lookups_sha256.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/sha256_event.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/lib/lookup_into_indexed_by_clk.hpp"
#include "barretenberg/vm2/tracegen/lib/make_jobs.hpp"

namespace bb::avm2::tracegen {

namespace {

// These are some useful groupings of columns for the SHA256 trace that we will iterate over.
constexpr std::array<Column, 8> state_cols = {
    Column::sha256_a, Column::sha256_b, Column::sha256_c, Column::sha256_d,
    Column::sha256_e, Column::sha256_f, Column::sha256_g, Column::sha256_h,
};

constexpr std::array<Column, 8> init_state_cols = {
    Column::sha256_init_a, Column::sha256_init_b, Column::sha256_init_c, Column::sha256_init_d,
    Column::sha256_init_e, Column::sha256_init_f, Column::sha256_init_g, Column::sha256_init_h,
};

constexpr std::array<Column, 16> w_cols = {
    Column::sha256_helper_w0,  Column::sha256_helper_w1,  Column::sha256_helper_w2,  Column::sha256_helper_w3,
    Column::sha256_helper_w4,  Column::sha256_helper_w5,  Column::sha256_helper_w6,  Column::sha256_helper_w7,
    Column::sha256_helper_w8,  Column::sha256_helper_w9,  Column::sha256_helper_w10, Column::sha256_helper_w11,
    Column::sha256_helper_w12, Column::sha256_helper_w13, Column::sha256_helper_w14, Column::sha256_helper_w15,
};

constexpr std::array<Column, 16> output_cols = {
    Column::sha256_output_a_lhs, Column::sha256_output_a_rhs, Column::sha256_output_b_lhs, Column::sha256_output_b_rhs,
    Column::sha256_output_c_lhs, Column::sha256_output_c_rhs, Column::sha256_output_d_lhs, Column::sha256_output_d_rhs,
    Column::sha256_output_e_lhs, Column::sha256_output_e_rhs, Column::sha256_output_f_lhs, Column::sha256_output_f_rhs,
    Column::sha256_output_g_lhs, Column::sha256_output_g_rhs, Column::sha256_output_h_lhs, Column::sha256_output_h_rhs,
};

constexpr std::array<uint32_t, 64> round_constants = {
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

// These are helper functions to iterate and set repetitive columns in the trace.
void Sha256TraceBuilder::set_helper_cols(const std::array<uint32_t, 16>& prev_w_helpers, TraceContainer& trace)
{
    for (size_t i = 0; i < 16; i++) {
        trace.set(row, { { { w_cols[i], prev_w_helpers[i] } } });
    }
}

void Sha256TraceBuilder::set_state_cols(const std::array<uint32_t, 8>& state, TraceContainer& trace)
{
    for (size_t i = 0; i < 8; i++) {
        trace.set(row, { { { state_cols[i], state[i] } } });
    }
}

void Sha256TraceBuilder::set_init_state_cols(const std::array<uint32_t, 8>& init_state, TraceContainer& trace)
{
    for (size_t i = 0; i < 8; i++) {
        trace.set(row, { { { init_state_cols[i], init_state[i] } } });
    }
}

// Decomposes a into two 32-bit values at the bit position b and inserts witness data into the trace.
void Sha256TraceBuilder::into_limbs_with_witness(
    uint64_t a, const uint8_t b, Column c_lhs, Column c_rhs, TraceContainer& trace)
{
    uint32_t a_lhs = static_cast<uint32_t>(a >> b);
    uint32_t a_rhs = static_cast<uint32_t>(a) & static_cast<uint32_t>((static_cast<uint64_t>(1) << b) - 1);
    trace.set(row, { { { c_lhs, a_lhs }, { c_rhs, a_rhs } } });
}

// Performs 32-bit rotation with witness data inserted into the trace.
uint32_t Sha256TraceBuilder::ror_with_witness(
    const uint32_t val, const uint8_t shift, Column c_result, Column c_lhs, Column c_rhs, TraceContainer& trace)
{
    auto result = (val >> (shift & 31U)) | (val << (32U - (shift & 31U)));
    into_limbs_with_witness(val, shift, c_lhs, c_rhs, trace);
    trace.set(c_result, row, result);
    return result;
}

// Performs 32-bit shift right with witness data inserted into the trace.
uint32_t Sha256TraceBuilder::shr_with_witness(
    const uint32_t val, const uint8_t shift, Column c_result, Column c_lhs, Column c_rhs, TraceContainer& trace)
{
    auto result = val >> shift;
    into_limbs_with_witness(val, shift, c_lhs, c_rhs, trace);
    trace.set(c_result, row, result);
    return result;
}

// Computes and returns the message schedule (w) value for that round, and inserts witness data into the trace.
uint32_t Sha256TraceBuilder::compute_w_with_witness(const std::array<uint32_t, 16>& prev_w_helpers,
                                                    TraceContainer& trace)
{
    using C = Column;

    // Computing w[j] := w[j-16] + s0 + w[j-7] + s1

    // Step (1) s0 := ror(w[i - 15], 7) ^ ror(w[i - 15], 18) ^ (w[i - 15] >> 3);
    // Compute ror(w[i - 15], 7)
    uint32_t rot_7 =
        ror_with_witness(prev_w_helpers[1], 7, C::sha256_w_15_rotr_7, C::sha256_lhs_w_7, C::sha256_rhs_w_7, trace);
    // Compute ror(w[i - 15], 18)
    uint32_t rot_18 =
        ror_with_witness(prev_w_helpers[1], 18, C::sha256_w_15_rotr_18, C::sha256_lhs_w_18, C::sha256_rhs_w_18, trace);
    // Compute (w[i - 15] >> 3)
    uint32_t shift_3 =
        shr_with_witness(prev_w_helpers[1], 3, C::sha256_w_15_rshift_3, C::sha256_lhs_w_3, C::sha256_rhs_w_3, trace);

    // Compute ror(w[i - 15], 7) ^ ror(w[i - 15], 18)
    trace.set(C::sha256_w_15_rotr_7_xor_w_15_rotr_18, row, rot_7 ^ rot_18);
    // Compute s0;
    uint32_t w_s_0 = rot_7 ^ rot_18 ^ shift_3;
    trace.set(C::sha256_w_s_0, row, w_s_0);

    // Step (2) s1 := ror(w[i - 2], 17) ^ ror(w[i - 2], 19) ^ (w[i - 2] >> 10);
    // Compute ror(w[i - 2], 17)
    uint32_t rot_17 =
        ror_with_witness(prev_w_helpers[14], 17, C::sha256_w_2_rotr_17, C::sha256_lhs_w_17, C::sha256_rhs_w_17, trace);
    // Compute ror(wi - 2, 19)
    uint32_t rot_19 =
        ror_with_witness(prev_w_helpers[14], 19, C::sha256_w_2_rotr_19, C::sha256_lhs_w_19, C::sha256_rhs_w_19, trace);
    // Compute (w[i - 2] >> 10)
    uint32_t shift_10 = shr_with_witness(
        prev_w_helpers[14], 10, C::sha256_w_2_rshift_10, C::sha256_lhs_w_10, C::sha256_rhs_w_10, trace);

    // Compute ror(w[i - 2], 17) ^ ror(w[i - 2], 19)
    trace.set(C::sha256_w_2_rotr_17_xor_w_2_rotr_19, row, rot_17 ^ rot_19);
    // Compute s1;
    uint32_t w_s_1 = rot_17 ^ rot_19 ^ shift_10;
    trace.set(C::sha256_w_s_1, row, w_s_1);

    // Compute w:= w[0] + s0 + w[9] + s1
    // The computation of w can overflow 32 bits so we need to use a 64-bit integer and perform modulo reduction
    uint64_t computed_w =
        prev_w_helpers[0] + static_cast<uint64_t>(w_s_0) + prev_w_helpers[9] + static_cast<uint64_t>(w_s_1);

    into_limbs_with_witness(computed_w, 32, C::sha256_computed_w_lhs, C::sha256_computed_w_rhs, trace);
    return static_cast<uint32_t>(computed_w);
}

// Perform the SHA-256 compression function for a single round and insert witness data into the trace.
std::array<uint32_t, 8> Sha256TraceBuilder::compute_compression_with_witness(const std::array<uint32_t, 8>& state,
                                                                             uint32_t round_w,
                                                                             uint32_t round_constant,
                                                                             uint32_t row,
                                                                             TraceContainer& trace)
{
    using C = Column;

    // Apply SHA-256 compression function to the message schedule
    // Compute S1 := ror(e, 6U) ^ ror(e, 11U) ^ ror(e, 25U);
    // Compute ror(e, 6)
    uint32_t rot_6 = ror_with_witness(state[4], 6, C::sha256_e_rotr_6, C::sha256_lhs_e_6, C::sha256_rhs_e_6, trace);
    // Compute ror(e, 11)
    uint32_t rot_11 =
        ror_with_witness(state[4], 11, C::sha256_e_rotr_11, C::sha256_lhs_e_11, C::sha256_rhs_e_11, trace);
    // Compute ror(e, 25)
    uint32_t rot_25 =
        ror_with_witness(state[4], 25, C::sha256_e_rotr_25, C::sha256_lhs_e_25, C::sha256_rhs_e_25, trace);

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
    // Compute (e & f) ^ (~e & g)
    uint64_t ch = e_and_f ^ not_e_and_g;
    trace.set(C::sha256_ch, row, ch);

    // Compute S0 := ror(a, 2U) ^ ror(a, 13U) ^ ror(a, 22U);
    // Compute ror(a, 2)
    uint32_t rot_2 = ror_with_witness(state[0], 2, C::sha256_a_rotr_2, C::sha256_lhs_a_2, C::sha256_rhs_a_2, trace);
    // Compute ror(a, 13)
    uint32_t rot_13 =
        ror_with_witness(state[0], 13, C::sha256_a_rotr_13, C::sha256_lhs_a_13, C::sha256_rhs_a_13, trace);
    // Compute ror(a, 22)
    uint32_t rot_22 =
        ror_with_witness(state[0], 22, C::sha256_a_rotr_22, C::sha256_lhs_a_22, C::sha256_rhs_a_22, trace);

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
    uint64_t temp1 = static_cast<uint64_t>(state[7]) + S1 + ch + round_constant + round_w;
    uint64_t temp2 = S0 + maj;
    uint64_t next_a = temp1 + temp2;
    into_limbs_with_witness(next_a, 32, C::sha256_next_a_lhs, C::sha256_next_a_rhs, trace);
    trace.set(C::sha256_round_constant, row, round_constant);
    uint32_t a = static_cast<uint32_t>(next_a);

    // Additions can overflow 32 bits so we perform modulo reduction
    uint64_t next_e = state[3] + temp1;
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

// Computes the final output from the final round state and inserts witness data into the trace.
void Sha256TraceBuilder::compute_sha256_output(const std::array<uint32_t, 8>& out_state,
                                               const std::array<uint32_t, 8>& init_state,
                                               TraceContainer& trace)
{
    uint32_t counter = 0;
    for (const auto& [init, state] : zip_view(init_state, out_state)) {
        uint64_t output = static_cast<uint64_t>(init) + static_cast<uint64_t>(state);
        into_limbs_with_witness(output, 32, output_cols[counter], output_cols[counter + 1], trace);
        counter += 2;
    }
}

void Sha256TraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::Sha256CompressionEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;

    for (const auto& event : events) {
        std::array<uint32_t, 16> prev_w_helpers = event.input;
        std::array<uint32_t, 8> round_state = event.state;

        // Each event results in 65 rows in the trace.
        // 64 rows for the 64 rounds of the SHA-256 compression function
        // 1 row for the final state

        // In the first row we also set up memory addresses and initial state values
        trace.set(row,
                  { {
                      { C::sha256_start, 1 },
                      { C::sha256_input_offset, event.input_addr },
                      { C::sha256_state_offset, event.state_addr },
                      { C::sha256_output_offset, event.output_addr },
                  } });

        // Begin the rounds loop
        for (size_t i = 0; i < 64; i++) {
            // Detect if we are still using the inputs for values of w
            bool is_an_input_round = i < 16;
            // Used to check we non-zero rounds remaining
            FF inv = FF(64 - i).invert();
            trace.set(row,
                      { {
                          { C::sha256_clk, event.execution_clk },
                          { C::sha256_sel, 1 },
                          { C::sha256_xor_sel, 2 },
                          { C::sha256_perform_round, 1 },
                          { C::sha256_is_input_round, is_an_input_round },
                          { C::sha256_round_count, i },
                          { C::sha256_rounds_remaining, 64 - i },
                          { C::sha256_rounds_remaining_inv, inv },
                      } });

            // Computing W
            // TODO: we currently perform the w computation even for the input round
            // This might not be what we want to do when we end up solving the xors (since it will involve lookups)
            uint32_t round_w = compute_w_with_witness(prev_w_helpers, trace);
            // W is set based on if we are still using the input values
            if (is_an_input_round) {
                trace.set(C::sha256_w, row, prev_w_helpers[0]);
                round_w = prev_w_helpers[0];
            } else {
                trace.set(C::sha256_w, row, round_w);
            }

            // Set the init state columns - propagated down
            set_init_state_cols(event.state, trace);
            // Set the state columns
            set_state_cols(round_state, trace);
            // Set the round columns
            set_helper_cols(prev_w_helpers, trace);

            // Apply SHA-256 compression function to the message schedule and update the state
            round_state = compute_compression_with_witness(round_state, round_w, round_constants[i], row, trace);

            // Update the prev_w_helpers, we shift all the values to the left and add the new round_w to
            // the end
            for (size_t j = 0; j < 15; j++) {
                prev_w_helpers[j] = prev_w_helpers[j + 1];
            }
            prev_w_helpers[15] = round_w;

            row++;
        }

        // Set the final row
        trace.set(row,
                  { {
                      { C::sha256_clk, event.execution_clk },
                      { C::sha256_latch, 1 },
                      { C::sha256_sel, 1 },
                      { C::sha256_xor_sel, 2 },
                      { C::sha256_round_count, 64 },
                  } });

        // Set the init state columns - propagated down
        set_init_state_cols(event.state, trace);
        // Set the state column
        set_state_cols(round_state, trace);
        // Set the round columns
        set_helper_cols(prev_w_helpers, trace);
        // Compute the output from the final round state
        compute_sha256_output(round_state, event.state, trace);

        row++;
    }
}

std::vector<std::unique_ptr<InteractionBuilderInterface>> Sha256TraceBuilder::lookup_jobs()
{
    return make_jobs<std::unique_ptr<InteractionBuilderInterface>>(
        std::make_unique<LookupIntoIndexedByClk<lookup_sha256_round_constant_settings>>());
}

} // namespace bb::avm2::tracegen
