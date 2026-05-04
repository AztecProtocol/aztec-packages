// Regression tests for the Mega Poseidon2 quad-internal layout and boundary soundness.
//
// The Mega Poseidon2 permutation uses a compressed internal block with an entry transition
// row (standard -> compressed) and a terminal row (compressed -> standard). The transition
// rows are tied to the surrounding standard-encoded states via copy constraints and shifted
// wires:
//
//   - Entry  (q_poseidon2_transition_entry):
//       w_r_shift - D_1 (w_l + q_l)^5 - w_r - w_o - w_4 = 0
//     ties the first compressed row's `w_r` (= v_0 = state[0] one round ahead) to the
//     standard `s_1` at round `rounds_f_begin`.
//
//   - Terminal (q_poseidon2_quad_internal_terminal):
//       out_k - w_{k,shift} = 0 for k in {0, 1, 2, 3}
//     ties the compressed chain's computed state at round `p_end` to the selector-unconstrained
//     standard bridge row consumed by the final external rounds via shared witness indices.
//
// These tests verify representative malicious prover edits at the entry boundary, interior
// compressed chain, and exit boundary.

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

namespace {

class Poseidon2QuadInternalSoundnessTests : public ::testing::Test {
  public:
    using Builder = MegaCircuitBuilder;
    using FF = MegaFlavor::FF;
    // Quad-internal block layout produced by stdlib::Poseidon2Permutation on Mega:
    //   row 0        : entry transition (standard encoding)
    //   rows 1 .. 13 : interior compressed rows
    //   row 14       : terminal compressed row
    //   row 15       : standard transition row (selector-unconstrained, copy-constrained to final external rounds)
    static constexpr size_t quad_entry_row = 0;
    static constexpr size_t quad_first_interior_row = 1;

    // Build an honest Poseidon2 circuit: hashes a single fixed field element through the
    // `Poseidon2Permutation::permutation` call used by the stdlib.
    static std::unique_ptr<Builder> build_honest_permutation(const FF& input_value)
    {
        auto builder = std::make_unique<Builder>(std::make_shared<ECCOpQueue>(), /*is_write_vk_mode=*/true);
        using State = stdlib::Poseidon2Permutation<Builder>::State;
        State input{
            stdlib::field_t<Builder>(stdlib::witness_t<Builder>(builder.get(), input_value)),
            stdlib::field_t<Builder>(stdlib::witness_t<Builder>(builder.get(), FF::zero())),
            stdlib::field_t<Builder>(stdlib::witness_t<Builder>(builder.get(), FF::zero())),
            stdlib::field_t<Builder>(stdlib::witness_t<Builder>(builder.get(), FF::zero())),
        };
        (void)stdlib::Poseidon2Permutation<Builder>::permutation(builder.get(), input);
        return builder;
    }
};

TEST_F(Poseidon2QuadInternalSoundnessTests, DoesNotMaterializeUnusedNonTerminalStateLimbs)
{
    auto builder = std::make_unique<Builder>(std::make_shared<ECCOpQueue>(), /*is_write_vk_mode=*/true);
    const size_t initial_num_variables = builder->get_num_variables();

    using State = stdlib::Poseidon2Permutation<Builder>::State;
    State input{
        stdlib::field_t<Builder>(stdlib::witness_t<Builder>(builder.get(), FF(uint256_t(0xdeadbeefULL)))),
        stdlib::field_t<Builder>(stdlib::witness_t<Builder>(builder.get(), FF::zero())),
        stdlib::field_t<Builder>(stdlib::witness_t<Builder>(builder.get(), FF::zero())),
        stdlib::field_t<Builder>(stdlib::witness_t<Builder>(builder.get(), FF::zero())),
    };
    (void)stdlib::Poseidon2Permutation<Builder>::permutation(builder.get(), input);

    // Initial input witnesses + initial-linear-layer output + first-half external-round outputs +
    // compressed internal witnesses + final-half external-round outputs.
    //
    // The non-terminal compressed rows only need state[0] at the next row; state[1..3] are derived by
    // the relation and are not materialized until the terminal row bridges back to standard encoding.
    constexpr size_t input_witnesses = 4;
    constexpr size_t initial_external_output_witnesses = 4;
    constexpr size_t external_output_witnesses = 8 * 4;
    constexpr size_t compressed_intermediate_witnesses = 14 * 3;
    constexpr size_t compressed_next_state_zero_witnesses = 14;
    constexpr size_t compressed_terminal_standard_limbs = 3;
    constexpr size_t expected_num_variables = input_witnesses + initial_external_output_witnesses +
                                              external_output_witnesses + compressed_intermediate_witnesses +
                                              compressed_next_state_zero_witnesses + compressed_terminal_standard_limbs;

    EXPECT_EQ(builder->get_num_variables() - initial_num_variables, expected_num_variables);
    EXPECT_TRUE(CircuitChecker::check(*builder));
}

// Entry boundary: tampering the first compressed row's `w_r` (= intermediate_s0) breaks the
// entry-transition relation, which enforces
//   w_r_shift = D_1 (s_0 + c)^5 + s_1 + s_2 + s_3
// on the entry row (w_r_shift lives in the first compressed row and is the tampered witness).
TEST_F(Poseidon2QuadInternalSoundnessTests, EntryBoundaryRejectsTamperedIntermediateS0)
{
    auto builder = build_honest_permutation(FF(uint256_t(0x1234ULL)));
    ASSERT_TRUE(CircuitChecker::check(*builder));

    auto& quad = builder->blocks.poseidon2_quad_internal;
    // Shift the first interior compressed row's w_r (= intermediate_s0) by a nonzero delta.
    const uint32_t w_r_idx = quad.w_r()[quad_first_interior_row];
    builder->set_variable(w_r_idx, builder->get_variable(w_r_idx) + FF(1));

    EXPECT_FALSE(CircuitChecker::check(*builder));
}

// Entry boundary: tampering the entry row's `w_r` (= standard s_1 at round rounds_f_begin)
// breaks the entry-transition relation as well. `w_r` of the entry row is copy-constrained
// to the external block's propagate row; modifying it invalidates both the external chain
// and the entry relation.
TEST_F(Poseidon2QuadInternalSoundnessTests, EntryBoundaryRejectsTamperedStateOne)
{
    auto builder = build_honest_permutation(FF(uint256_t(0xabcdULL)));
    ASSERT_TRUE(CircuitChecker::check(*builder));

    auto& quad = builder->blocks.poseidon2_quad_internal;
    const uint32_t w_r_idx = quad.w_r()[quad_entry_row];
    builder->set_variable(w_r_idx, builder->get_variable(w_r_idx) + FF(7));

    EXPECT_FALSE(CircuitChecker::check(*builder));
}

// Exit boundary: the standard bridge row (last row of poseidon2_quad_internal) holds `state[1]`
// at round p_end in its `w_r`. Shifting that witness breaks the terminal relation, which enforces
// out_1 (computed by the last compressed row) == w_r_shift (the bridge row's w_r).
TEST_F(Poseidon2QuadInternalSoundnessTests, ExitBoundaryRejectsTamperedStateOne)
{
    auto builder = build_honest_permutation(FF(uint256_t(0xcafebabeULL)));
    ASSERT_TRUE(CircuitChecker::check(*builder));

    auto& quad = builder->blocks.poseidon2_quad_internal;
    // Last row of the quad-internal block is the standard transition row holding
    // (s_0, s_1, s_2, s_3) at round p_end in standard encoding.
    const size_t quad_std_transition_row = quad.size() - 1;
    const uint32_t state1_idx = quad.w_r()[quad_std_transition_row];
    builder->set_variable(state1_idx, builder->get_variable(state1_idx) + FF(1));

    EXPECT_FALSE(CircuitChecker::check(*builder));
}

// Interior chain: corrupting any wire on an interior compressed row breaks the chain's
// quad-internal relation locally.
TEST_F(Poseidon2QuadInternalSoundnessTests, InteriorRelationRejectsTamperedWire)
{
    auto builder = build_honest_permutation(FF(uint256_t(0xfeedf00dULL)));
    ASSERT_TRUE(CircuitChecker::check(*builder));

    auto& quad = builder->blocks.poseidon2_quad_internal;
    // Pick some middle interior row.
    const size_t interior_row = quad_first_interior_row + 5;
    const uint32_t w_o_idx = quad.w_o()[interior_row];
    builder->set_variable(w_o_idx, builder->get_variable(w_o_idx) + FF(1));

    EXPECT_FALSE(CircuitChecker::check(*builder));
}

} // namespace
