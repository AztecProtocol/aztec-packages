// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "keccak_constraint.hpp"
#include "barretenberg/stdlib/hash/keccak/keccak.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "round.hpp"

namespace acir_format {

template <typename Builder> void create_keccak_permutations(Builder& builder, const Keccakf1600& constraint)
{
    using field_ct = bb::stdlib::field_t<Builder>;

    // Create the array containing the permuted state
    std::array<field_ct, bb::stdlib::keccak<Builder>::NUM_KECCAK_LANES> state;

    // Get the witness assignment for each witness index
    // Write the witness assignment to the byte_array
    for (size_t i = 0; i < constraint.state.size(); ++i) {
        state[i] = to_field_ct(constraint.state[i], builder);
    }

    std::array<field_ct, 25> output_state = bb::stdlib::keccak<Builder>::permutation_opcode(state, &builder);

    for (size_t i = 0; i < output_state.size(); ++i) {
        builder.assert_equal(output_state[i].normalize().witness_index, constraint.result[i]);
    }
}
template void create_keccak_permutations<bb::UltraCircuitBuilder>(bb::UltraCircuitBuilder& builder,
                                                                  const Keccakf1600& constraint);

template void create_keccak_permutations<bb::MegaCircuitBuilder>(bb::MegaCircuitBuilder& builder,
                                                                 const Keccakf1600& constraint);

} // namespace acir_format
