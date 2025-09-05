// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include <array>
#include <cstddef>
#include <cstdint>

#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace bb::stdlib {

/**
 * @brief Circuit form of Poseidon2 permutation from https://eprint.iacr.org/2023/323.
 * @details The permutation consists of one initial linear layer, then a set of external rounds, a set of internal
 * rounds, and a set of external rounds.
 *
 * Note that except for the inital linear layer, we compute the round results natively and record them into Poseidon2
 * custom gates. This allows us to heavily reduce the number of arithmetic gates, that would have been otherwise
 * required to perform expensive non-linear S-box operations in-circuit.
 *
 * The external rounds are constrained via `Poseidon2ExternalRelationImpl`.
 * The internal rounds are constrained via `Poseidon2InternalRelationImpl`.
 *
 */
template <typename Builder> class Poseidon2Permutation {
  public:
    using Params = crypto::Poseidon2Bn254ScalarFieldParams;
    using NativePermutation = crypto::Poseidon2Permutation<Params>;
    // t = sponge permutation size (in field elements)
    // t = rate + capacity
    // capacity = 1 field element
    // rate = number of field elements that can be compressed per permutation
    static constexpr size_t t = Params::t;
    // number of full sbox rounds
    static constexpr size_t rounds_f = Params::rounds_f;
    // number of partial sbox rounds
    static constexpr size_t rounds_p = Params::rounds_p;
    static constexpr size_t NUM_ROUNDS = Params::rounds_f + Params::rounds_p;

    using FF = typename Params::FF;
    using State = std::array<field_t<Builder>, t>;
    using NativeState = std::array<FF, t>;

    using RoundConstants = std::array<FF, t>;
    using RoundConstantsContainer = std::array<RoundConstants, NUM_ROUNDS>;
    static constexpr RoundConstantsContainer round_constants = Params::round_constants;

    /**
     * @brief Circuit form of Poseidon2 permutation from https://eprint.iacr.org/2023/323.
     * @details The permutation consists of one initial linear layer, then a set of external rounds, a set of internal
     * rounds, and a set of external rounds.
     * @param builder
     * @param input
     * @return State
     */
    static State permutation(Builder* builder, const State& input);

    /**
     * @brief In-circuit method to efficiently multiply the inital state by the external matrix \f$ M_E \f$. Uses 6
     * aritmetic gates.
     */
    static void matrix_multiplication_external(State& state);

    /**
     * @brief  The result of applying a round of Poseidon2 is stored in the next row and is accessed by Poseidon2
     * Internal and External Relations via the shifts mechanism. Note that it does not activate any selectors since it
     * only serves to store the values. See `Poseidon2ExternalRelationImpl` and `Poseidon2InternalRelationImpl` docs.
     *
     * @param builder
     * @param state an array of `t` field_t elements
     * @param block Either `poseidon2_external` or `poseidon2_internal` block of the Execution Trace
     */
    static void propagate_current_state_to_next_row(Builder* builder, const State& state, auto& block)
    {
        builder->create_dummy_gate(block,
                                   state[0].get_witness_index(),
                                   state[1].get_witness_index(),
                                   state[2].get_witness_index(),
                                   state[3].get_witness_index());
    };
};

} // namespace bb::stdlib
