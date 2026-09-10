#include "keccak_constraint.hpp"
#include "barretenberg/stdlib/hash/keccak/keccak.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"

namespace acir_format {

template <typename Builder> void create_keccak_permutations_constraints(Builder& builder, const Keccakf1600& constraint)
{
    using field_ct = bb::stdlib::field_t<Builder>;

    // Create the array containing the permuted state
    std::array<field_ct, bb::stdlib::keccak<Builder>::NUM_KECCAK_LANES> state;

    // Write the witness assignment to the state
    for (size_t i = 0; i < constraint.state.size(); ++i) {
        state[i] = to_field_ct(constraint.state[i], builder);
    }

    std::array<field_ct, bb::stdlib::keccak<Builder>::NUM_KECCAK_LANES> output_state =
        bb::stdlib::keccak<Builder>::permutation_opcode(state, &builder);

    for (size_t i = 0; i < output_state.size(); ++i) {
        output_state[i].assert_equal(field_ct::from_witness_index(&builder, constraint.result[i]));
    }
}

template void create_keccak_permutations_constraints<bb::UltraCircuitBuilder>(bb::UltraCircuitBuilder& builder,
                                                                              const Keccakf1600& constraint);

// Plookup-backed: only the arithmetizations that keep the lookup gate.
#define INSTANTIATE_CREATE_KECCAK_PERMUTATIONS_CONSTRAINTS(Builder)                                                    \
    template void create_keccak_permutations_constraints<Builder>(Builder&, const Keccakf1600& constraint);
INSTANTIATE_FOR_EACH_MEGA_BUILDER_WITH_LOOKUP(INSTANTIATE_CREATE_KECCAK_PERMUTATIONS_CONSTRAINTS)
#undef INSTANTIATE_CREATE_KECCAK_PERMUTATIONS_CONSTRAINTS

} // namespace acir_format
