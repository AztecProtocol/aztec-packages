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
    using Poseidon2Params = crypto::Poseidon2Bn254ScalarFieldParams;
    using State = std::array<field_ct, Poseidon2Params::t>;

    ASSERT(constraint.state.size() == constraint.len);
    ASSERT(constraint.result.size() == constraint.len);
    // Get the witness assignment for each witness index
    // Write the witness assignment to the byte_array state
    State state;
    for (size_t i = 0; i < constraint.state.size(); ++i) {
        state[i] = to_field_ct(constraint.state[i], builder);
    }
    State output_state;
    output_state = stdlib::Poseidon2Permutation<Poseidon2Params, Builder>::permutation(&builder, state);
    for (size_t i = 0; i < output_state.size(); ++i) {
        poly_triple assert_equal{
            .a = output_state[i].normalize().witness_index,
            .b = constraint.result[i],
            .c = 0,
            .q_m = 0,
            .q_l = 1,
            .q_r = -1,
            .q_o = 0,
            .q_c = 0,
        };
        builder.create_poly_gate(assert_equal);
    }
}

template void create_poseidon2_permutations<UltraCircuitBuilder>(UltraCircuitBuilder& builder,
                                                                 const Poseidon2Constraint& constraint);

template void create_poseidon2_permutations<MegaCircuitBuilder>(MegaCircuitBuilder& builder,
                                                                const Poseidon2Constraint& constraint);
} // namespace acir_format