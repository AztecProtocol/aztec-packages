#include "barretenberg/vm/avm/trace/gadgets/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"

namespace bb::avm_trace {
using Poseidon2 = crypto::Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams>;

std::vector<AvmPoseidon2TraceBuilder::Poseidon2TraceEntry> AvmPoseidon2TraceBuilder::finalize()
{
    return std::move(poseidon2_trace);
}

void AvmPoseidon2TraceBuilder::reset()
{
    poseidon2_trace.clear();
    poseidon2_trace.shrink_to_fit(); // Reclaim memory.
}

AvmPoseidon2TraceBuilder::Poseidon2TraceEntry gen_poseidon_perm_entry(const std::array<FF, 4>& input, uint32_t clk)
{
    // Currently we commit to intermediate round values, changes to codegen might reduce the number of committed polys

    // This is lifted from bb::poeidon2, we need to extract the intermediate round values here.
    using State = std::array<FF, 4>;
    std::array<State, Poseidon2::NUM_ROUNDS> interm_round_vals;
    State current_state(input);

    // Apply 1st linear layer
    Poseidon2::matrix_multiplication_external(current_state);
    std::array<FF, 4> first_ext = current_state;
    // First set of external rounds
    constexpr size_t rounds_f_beginning = Poseidon2::rounds_f / 2;
    for (size_t i = 0; i < rounds_f_beginning; ++i) {
        Poseidon2::add_round_constants(current_state, Poseidon2::round_constants[i]);
        Poseidon2::apply_sbox(current_state);
        Poseidon2::matrix_multiplication_external(current_state);
        // Store end of round state
        interm_round_vals[i] = current_state;
    }

    // Internal rounds
    const size_t p_end = rounds_f_beginning + Poseidon2::rounds_p;
    for (size_t i = rounds_f_beginning; i < p_end; ++i) {
        current_state[0] += Poseidon2::round_constants[i][0];
        Poseidon2::apply_single_sbox(current_state[0]);
        Poseidon2::matrix_multiplication_internal(current_state);
        // Store end of round state
        interm_round_vals[i] = current_state;
    }

    // Remaining external rounds
    for (size_t i = p_end; i < Poseidon2::NUM_ROUNDS; ++i) {
        Poseidon2::add_round_constants(current_state, Poseidon2::round_constants[i]);
        Poseidon2::apply_sbox(current_state);
        Poseidon2::matrix_multiplication_external(current_state);
        // Store end of round state
        interm_round_vals[i] = current_state;
    }

    // Current state is the output
    return AvmPoseidon2TraceBuilder::Poseidon2TraceEntry{
        .clk = clk,
        .input = input,
        .output = current_state,
        .first_ext = first_ext,
        .interm_round_vals = interm_round_vals,
    };
}

std::array<FF, 4> AvmPoseidon2TraceBuilder::poseidon2_permutation(
    std::array<FF, 4> const& input, uint32_t space_id, uint32_t clk, uint32_t input_addr, uint32_t output_addr)
{
    auto entry = gen_poseidon_perm_entry(input, clk);
    entry.input_addr = input_addr;
    entry.output_addr = output_addr;
    entry.is_mem_op = true;
    entry.space_id = space_id;
    poseidon2_trace.push_back(entry);

    return entry.output;
}

FF AvmPoseidon2TraceBuilder::poseidon2_hash(std::vector<FF> input, uint32_t clk, Poseidon2Caller caller)
{
    using Poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
    FF output = Poseidon2::hash(input);
    // Add the full hash trace event
    poseidon2_hash_trace.push_back(Poseidon2FullTraceEntry{
        .clk = clk,
        .input = input,
        .output = output,
        .input_length = input.size(),
        .caller = caller,
    });
    const FF iv = (static_cast<uint256_t>(input.size()) << 64);
    std::array<FF, 4> input_array = { 0, 0, 0, iv };

    size_t padded_size = 3 * ((input.size() + 2) / 3);
    input.resize(padded_size, FF::zero());
    for (size_t i = 0; i < input.size(); i += 3) {
        input_array[0] += input[i];
        input_array[1] += input[i + 1];
        input_array[2] += input[i + 2];

        auto entry_idx = clk + (i / 3);
        auto entry = gen_poseidon_perm_entry(input_array, static_cast<uint32_t>(entry_idx));
        entry.is_immediate = true;
        poseidon2_trace.push_back(entry);
        input_array = entry.output;
    }
    return output;
}

void AvmPoseidon2TraceBuilder::finalize_full(std::vector<AvmFullRow<FF>>& main_trace)
{
    size_t main_trace_counter = 0;

    for (const auto& src : poseidon2_hash_trace) {
        size_t padded_size = 3 * ((src.input_length + 2) / 3);
        auto num_rounds = padded_size / 3;
        auto num_rounds_rem = num_rounds - 1;
        // Get the permutation event associated with the first round of the full hash
        auto perm_event = std::find_if(
            poseidon2_trace.begin(), poseidon2_trace.end(), [src](auto const& entry) { return entry.clk == src.clk; });
        ASSERT(perm_event != poseidon2_trace.end()); // "Could not find corresponding permutation event"

        for (size_t j = 0; j < num_rounds; j++) {
            auto& dest = main_trace.at(main_trace_counter++);
            dest.poseidon2_full_input_len = src.input_length;
            dest.poseidon2_full_sel_poseidon = FF::one();
            dest.poseidon2_full_clk = src.clk + j;
            dest.poseidon2_full_input_0 = 3 * j < src.input.size() ? src.input[3 * j] : FF::zero();
            dest.poseidon2_full_input_1 = 3 * j + 1 < src.input.size() ? src.input[3 * j + 1] : FF::zero();
            dest.poseidon2_full_input_2 = 3 * j + 2 < src.input.size() ? src.input[3 * j + 2] : FF::zero();
            dest.poseidon2_full_output = src.output;
            dest.poseidon2_full_num_perm_rounds_rem = num_rounds_rem;
            dest.poseidon2_full_padding = padded_size - src.input_length;
            dest.poseidon2_full_num_perm_rounds_rem_inv = num_rounds_rem == 0 ? 0 : FF(num_rounds_rem).invert();

            dest.poseidon2_full_a_0 = perm_event->input[0];
            dest.poseidon2_full_a_1 = perm_event->input[1];
            dest.poseidon2_full_a_2 = perm_event->input[2];
            dest.poseidon2_full_a_3 = perm_event->input[3];
            dest.poseidon2_full_b_0 = perm_event->output[0];
            dest.poseidon2_full_b_1 = perm_event->output[1];
            dest.poseidon2_full_b_2 = perm_event->output[2];
            dest.poseidon2_full_b_3 = perm_event->output[3];

            if (j == 0) {
                dest.poseidon2_full_start_poseidon = FF::one();
            }
            if (num_rounds_rem == 0) {
                dest.poseidon2_full_end_poseidon = FF::one();
            } else {
                dest.poseidon2_full_execute_poseidon_perm = FF::one();
                num_rounds_rem--;
            }

            switch (src.caller) {
            case Poseidon2Caller::SILO:
            case Poseidon2Caller::NONE:
            case Poseidon2Caller::BYTECODE_HASHING:
                break;
            case Poseidon2Caller::MERKLE_TREE: {
                dest.poseidon2_full_sel_merkle_tree = FF::one();
                break;
            }
            }
            // Careful - we assume here that the permutation events are in order
            perm_event++;
        }
    }
}
} // namespace bb::avm_trace
