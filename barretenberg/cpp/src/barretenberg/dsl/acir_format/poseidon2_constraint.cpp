// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "poseidon2_constraint.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"

namespace acir_format {

using namespace bb;

template <typename Builder> void create_poseidon2_permutations(Builder& builder, const Poseidon2Constraint& constraint)
{
    using field_ct = stdlib::field_t<Builder>;
    using State = stdlib::Poseidon2Permutation<Builder>::State;

    BB_ASSERT_EQ(constraint.state.size(), 4U);
    BB_ASSERT_EQ(constraint.result.size(), 4U);
    // Get the witness assignment for each witness index
    // Write the witness assignment to the byte array state
    State state;
    for (size_t i = 0; i < constraint.state.size(); ++i) {
        state[i] = to_field_ct(constraint.state[i], builder);
    }
    State output_state;
    output_state = stdlib::Poseidon2Permutation<Builder>::permutation(&builder, state);
    for (size_t i = 0; i < output_state.size(); ++i) {
        output_state[i].assert_equal(field_ct::from_witness_index(&builder, constraint.result[i]));
    }
}

template void create_poseidon2_permutations<UltraCircuitBuilder>(UltraCircuitBuilder& builder,
                                                                 const Poseidon2Constraint& constraint);

template void create_poseidon2_permutations<MegaCircuitBuilder>(MegaCircuitBuilder& builder,
                                                                const Poseidon2Constraint& constraint);
} // namespace acir_format
