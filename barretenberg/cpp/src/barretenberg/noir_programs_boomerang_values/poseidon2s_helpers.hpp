#pragma once
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include <array>
#include <optional>
#include <utility>
#include <vector>

namespace poseidon2_helpers {
template <typename T, typename... Args> bool all_equal(const T& first, const Args&... rest)
{
    return ((first == rest) && ...);
}

enum GateIndex : size_t {
    tmp1 = 0, // tmp1 = s0 + s1 + 2*s3
    tmp2 = 1, // tmp2 = s2 + 2*s1 + s3
    v2 = 2,   // v2   = tmp2 + 4*s0 + 4*s1
    v1 = 3,   // v1   = v2 + tmp1
    v4 = 4,   // v4   = tmp1 + 4*s2 + 4*s3
    v3 = 5,   // v3   = v4 + tmp2
};

enum WireIndex : size_t {
    w_l = 0,
    w_r = 1,
    w_o = 2,
    w_4 = 3,
};

// ============================================================================
// Poseidon2 round validation helpers
// ============================================================================

using Params = bb::crypto::Poseidon2Bn254ScalarFieldParams;
static constexpr size_t NUM_MATRIX_MUL_GATES = 6;

/**
 * @brief Validate external Poseidon2 rounds in poseidon2_external block.
 *
 * External rounds apply S-box to all 4 state elements and use full round constants (q_1-q_4).
 * Each gate stores input state in wires; output state is in next row's wires.
 *
 * @param ext_block Reference to poseidon2_external block
 * @param state Current state (4 wire indices). Updated in-place to output state after last round.
 * @param start_idx Gate index in ext_block where rounds begin
 * @param num_rounds Number of external rounds to validate
 * @param round_offset Offset into Poseidon2 round constants table
 * @return true if all rounds are valid
 */
template <typename FF, typename Block>
bool validate_external_rounds(
    Block& ext_block, std::array<uint32_t, 4>& state, size_t start_idx, size_t num_rounds, size_t round_offset)
{
    for (size_t round = 0; round < num_rounds; ++round) {
        size_t gate_idx = start_idx + round;
        size_t round_idx = round_offset + round;

        bool correct = ext_block.w_l()[gate_idx] == state[0] && ext_block.w_r()[gate_idx] == state[1] &&
                       ext_block.w_o()[gate_idx] == state[2] && ext_block.w_4()[gate_idx] == state[3] &&
                       ext_block.q_1()[gate_idx] == Params::round_constants[round_idx][0] &&
                       ext_block.q_2()[gate_idx] == Params::round_constants[round_idx][1] &&
                       ext_block.q_3()[gate_idx] == Params::round_constants[round_idx][2] &&
                       ext_block.q_4()[gate_idx] == Params::round_constants[round_idx][3] &&
                       ext_block.gate_selector_for(bb::GateKind::Poseidon2Ext)[gate_idx] == FF::one();

        if (!correct) {
            return false;
        }

        state = { ext_block.w_l()[gate_idx + 1],
                  ext_block.w_r()[gate_idx + 1],
                  ext_block.w_o()[gate_idx + 1],
                  ext_block.w_4()[gate_idx + 1] };
    }
    return true;
}

/**
 * @brief Validate internal Poseidon2 rounds in poseidon2_internal block.
 *
 * Internal rounds apply S-box only to state[0] and use single round constant (q_1).
 *
 * @param int_block Reference to poseidon2_internal block
 * @param state Current state (4 wire indices). Updated in-place to output state after last round.
 * @param start_idx Gate index in int_block where rounds begin
 * @param num_rounds Number of internal rounds to validate
 * @param round_offset Offset into Poseidon2 round constants table
 * @return true if all rounds are valid
 */
template <typename FF, typename Block>
bool validate_internal_rounds(
    Block& int_block, std::array<uint32_t, 4>& state, size_t start_idx, size_t num_rounds, size_t round_offset)
{
    for (size_t round = 0; round < num_rounds; ++round) {
        size_t gate_idx = start_idx + round;
        size_t round_idx = round_offset + round;

        bool correct = int_block.w_l()[gate_idx] == state[0] && int_block.w_r()[gate_idx] == state[1] &&
                       int_block.w_o()[gate_idx] == state[2] && int_block.w_4()[gate_idx] == state[3] &&
                       int_block.q_1()[gate_idx] == Params::round_constants[round_idx][0] &&
                       int_block.gate_selector_for(bb::GateKind::Poseidon2Int)[gate_idx] == FF::one();

        if (!correct) {
            return false;
        }

        state = { int_block.w_l()[gate_idx + 1],
                  int_block.w_r()[gate_idx + 1],
                  int_block.w_o()[gate_idx + 1],
                  int_block.w_4()[gate_idx + 1] };
    }
    return true;
}

/**
 * @brief Validate matrix multiplication layer (6 sequential arithmetic gates).
 *
 * This is the first phase of a Poseidon2 permutation. It applies a linear transformation
 * to the 4-element state via 6 arithmetic gates with known selector patterns.
 *
 * @param builder Circuit builder (for get_variable)
 * @param arith_block Reference to arithmetic block
 * @param state_indices Real variable indices for input state [s0, s1, s2, s3]
 * @param gate_idx Starting gate index in arithmetic block
 * @return Output state {v1_out, v2_out, v3_out, v4_out} if valid, std::nullopt otherwise
 */
template <typename FF, typename CircuitBuilder, typename Block>
std::optional<std::array<uint32_t, 4>> validate_matrix_mul_layer(CircuitBuilder& builder,
                                                                 Block& arith_block,
                                                                 const std::array<uint32_t, 4>& state_indices,
                                                                 size_t gate_idx)
{
    // Bounds check
    if (gate_idx + NUM_MATRIX_MUL_GATES > arith_block.size()) {
        return std::nullopt;
    }

    // Gate 0 structure: w_l=s[0], w_r=s[1], w_o=s[3]
    if (arith_block.w_l()[gate_idx] != state_indices[0] || arith_block.w_r()[gate_idx] != state_indices[1] ||
        arith_block.w_o()[gate_idx] != state_indices[3]) {
        return std::nullopt;
    }

    static const std::vector<FF> expected_selectors{
        FF(1), FF(1), FF(2),  FF(-1), FF(0), FF(1), // gate 0: tmp1 = s[0] + s[1] + 2*s[3]
        FF(1), FF(2), FF(1),  FF(-1), FF(0), FF(1), // gate 1: tmp2 = s[2] + 2*s[1] + s[3]
        FF(1), FF(4), FF(4),  FF(-1), FF(0), FF(1), // gate 2: v2 = tmp2 + 4*s[0] + 4*s[1]
        FF(1), FF(1), FF(-1), FF(0),  FF(0), FF(1), // gate 3: v1 = v2 + tmp1
        FF(1), FF(4), FF(4),  FF(-1), FF(0), FF(1), // gate 4: v4 = tmp1 + 4*s[2] + 4*s[3]
        FF(1), FF(1), FF(-1), FF(0),  FF(0), FF(1)  // gate 5: v3 = v4 + tmp2
    };

    auto& q1 = arith_block.q_1();
    auto& q2 = arith_block.q_2();
    auto& q3 = arith_block.q_3();
    auto& q4 = arith_block.q_4();
    auto& qc = arith_block.q_c();

    std::array<std::array<uint32_t, 4>, NUM_MATRIX_MUL_GATES> wires;
    std::vector<FF> selectors;
    selectors.reserve(6 * NUM_MATRIX_MUL_GATES);

    bool correct = true;
    for (size_t i = 0; i < NUM_MATRIX_MUL_GATES; ++i) {
        size_t g = gate_idx + i;
        wires[i] = { arith_block.w_l()[g], arith_block.w_r()[g], arith_block.w_o()[g], arith_block.w_4()[g] };

        // Equation check: q1*wl + q2*wr + q3*wo + q4*w4 + qc = 0
        std::array<FF, 4> values{ builder.get_variable(arith_block.w_l()[g]),
                                  builder.get_variable(arith_block.w_r()[g]),
                                  builder.get_variable(arith_block.w_o()[g]),
                                  builder.get_variable(arith_block.w_4()[g]) };
        FF equation = q1[g] * values[w_l] + q2[g] * values[w_r] + q3[g] * values[w_o] + q4[g] * values[w_4] + qc[g];
        correct &= equation == FF::zero();

        selectors.emplace_back(q1[g]);
        selectors.emplace_back(q2[g]);
        selectors.emplace_back(q3[g]);
        selectors.emplace_back(q4[g]);
        selectors.emplace_back(arith_block.q_m()[g]);
        selectors.emplace_back(arith_block.gate_selector_for(bb::GateKind::Arith)[g]);
    }

    correct &= (selectors == expected_selectors);

    // Wire connectivity checks
    correct &= all_equal(state_indices[0], wires[tmp1][w_l], wires[v2][w_r]);
    correct &= all_equal(state_indices[1], wires[tmp2][w_r], wires[v2][w_o]);
    correct &= all_equal(state_indices[2], wires[v4][w_r], wires[tmp2][w_l]);
    correct &= all_equal(state_indices[3], wires[tmp1][w_o], wires[tmp2][w_o], wires[v4][w_o]);
    correct &= all_equal(wires[tmp1][w_4], wires[v1][w_r], wires[v4][w_l]);
    correct &= all_equal(wires[tmp2][w_4], wires[v2][w_l], wires[v3][w_r]);
    correct &= all_equal(wires[v2][w_4], wires[v1][w_l]);
    correct &= all_equal(wires[v4][w_4], wires[v3][w_l]);

    if (!correct) {
        return std::nullopt;
    }

    return std::array<uint32_t, 4>{ wires[v1][w_o], wires[v2][w_4], wires[v3][w_o], wires[v4][w_4] };
}

/**
 * @brief Find gate in a block where all 4 wires match the given state.
 *
 * Searches gates of state[0] (via analyzer) in the specified block.
 *
 * @param builder Circuit builder
 * @param analyzer Static analyzer (provides get_variable_gates)
 * @param block Block to search in
 * @param state 4 wire indices to match
 * @return Gate index if found, std::nullopt otherwise
 */
template <typename FF, typename CircuitBuilder, typename Analyzer, typename Block>
std::optional<size_t> find_gate_matching_state(CircuitBuilder& builder,
                                               Analyzer& analyzer,
                                               Block& block,
                                               const std::array<uint32_t, 4>& state)
{
    auto blocks = builder.blocks.get();
    for (const auto& [blk_idx, gate_idx] : analyzer.get_variable_gates(state[0])) {
        if (std::addressof(blocks[blk_idx]) != std::addressof(block)) {
            continue;
        }
        if (block.w_l()[gate_idx] == state[0] && block.w_r()[gate_idx] == state[1] &&
            block.w_o()[gate_idx] == state[2] && block.w_4()[gate_idx] == state[3]) {
            return gate_idx;
        }
    }
    return std::nullopt;
}

/**
 * @brief Validate a full Poseidon2 permutation: matrix_mul → external_half → internal → external_half.
 *
 * Finds gate locations automatically via state wire matching.
 *
 * @param builder Circuit builder
 * @param analyzer Static analyzer
 * @param state Current state (4 wire indices). Updated in-place to final output state.
 * @return true if full permutation is valid
 */
template <typename FF, typename CircuitBuilder, typename Analyzer>
bool validate_poseidon2_permutation(CircuitBuilder& builder, Analyzer& analyzer, std::array<uint32_t, 4>& state)
{
    using Poseidon2Perm = bb::stdlib::Poseidon2Permutation<CircuitBuilder>;
    static constexpr size_t rounds_f_half = Poseidon2Perm::rounds_f / 2;
    static constexpr size_t rounds_p = Poseidon2Perm::rounds_p;

    auto& ext_block = builder.blocks.poseidon2_external;
    auto& int_block = builder.blocks.poseidon2_internal;

    // Step 1: Find and validate first half of external rounds
    auto start_ext = find_gate_matching_state<FF>(builder, analyzer, ext_block, state);
    if (!start_ext || !validate_external_rounds<FF>(ext_block, state, *start_ext, rounds_f_half, 0)) {
        return false;
    }

    // Step 2: Find and validate internal rounds
    auto start_int = find_gate_matching_state<FF>(builder, analyzer, int_block, state);
    if (!start_int || !validate_internal_rounds<FF>(int_block, state, *start_int, rounds_p, rounds_f_half)) {
        return false;
    }

    // Step 3: Find and validate second half of external rounds
    auto start_final = find_gate_matching_state<FF>(builder, analyzer, ext_block, state);
    if (!start_final ||
        !validate_external_rounds<FF>(ext_block, state, *start_final, rounds_f_half, rounds_f_half + rounds_p)) {
        return false;
    }

    return true;
}

} // namespace poseidon2_helpers
