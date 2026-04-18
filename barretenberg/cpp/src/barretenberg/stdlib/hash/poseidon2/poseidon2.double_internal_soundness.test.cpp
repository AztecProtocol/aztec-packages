// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Sergei], commit: }
// =====================
//
// Soundness tests for the Poseidon2 double-internal round relation and its boundaries.
//
// The Mega Poseidon2 permutation uses a compressed internal block with an entry transition
// row (standard -> compressed) and a terminal row (compressed -> standard). The transition
// rows are bound to the external block's standard-encoded state via copy constraints, and
// their relations forbid shifting `state[1]` across the boundary:
//
//   - Entry  (q_poseidon2_transition_entry):
//       w_r_shift - D_1 (w_l + q_l)^5 - w_r - w_o - w_4 = 0
//     ties the first compressed row's `w_r` (= v_0 = state[0] one round ahead) to the
//     standard `s_1` at round `rounds_f_begin`.
//
//   - Terminal (q_poseidon2_double_internal_terminal):
//       out_1 - w_r_shift = 0 (and out_{0,2,3} matched directly)
//     ties the compressed chain's computed `state[1]` at round `single_round_start` to the
//     standard `w_r` witness consumed by the single-round internal tail.
//
// These tests verify that tampering with any witness between the two boundaries causes
// `CircuitChecker::check` to reject the circuit. Before the fix, the same tampering was
// undetectable (see git history for the original exploit tests).

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

namespace {

class Poseidon2DoubleInternalSoundnessTests : public ::testing::Test {
  public:
    using Builder = MegaCircuitBuilder;
    using FF = MegaFlavor::FF;
    using P2Params = crypto::Poseidon2Bn254ScalarFieldParams;

    // Double-internal block layout produced by stdlib::Poseidon2Permutation on Mega:
    //   row 0                   : entry transition (standard encoding)
    //   rows 1 .. 26            : interior compressed rows
    //   row 27                  : terminal compressed row
    //   row 28                  : standard transition row (unconstrained, copy-constrained
    //                             to the single-round tail)
    static constexpr size_t dbl_entry_row = 0;
    static constexpr size_t dbl_first_interior_row = 1;

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

// Sanity: a freshly built Poseidon2 circuit passes the checker.
TEST_F(Poseidon2DoubleInternalSoundnessTests, HonestCircuitPassesChecker)
{
    auto builder = build_honest_permutation(FF(uint256_t(0xdeadbeefULL)));
    EXPECT_TRUE(CircuitChecker::check(*builder));
}

// Entry boundary: tampering the first compressed row's `w_r` (= intermediate_s0) breaks the
// entry-transition relation, which enforces
//   w_r_shift = D_1 (s_0 + c)^5 + s_1 + s_2 + s_3
// on the entry row (w_r_shift lives in the first compressed row and is the tampered witness).
TEST_F(Poseidon2DoubleInternalSoundnessTests, EntryBoundaryRejectsTamperedIntermediateS0)
{
    auto builder = build_honest_permutation(FF(uint256_t(0x1234ULL)));
    ASSERT_TRUE(CircuitChecker::check(*builder));

    auto& dbl = builder->blocks.poseidon2_double_internal;
    // Shift the first interior compressed row's w_r (= intermediate_s0) by a nonzero delta.
    const uint32_t w_r_idx = dbl.w_r()[dbl_first_interior_row];
    builder->set_variable(w_r_idx, builder->get_variable(w_r_idx) + FF(1));

    EXPECT_FALSE(CircuitChecker::check(*builder));
}

// Entry boundary: tampering the entry row's `w_r` (= standard s_1 at round rounds_f_begin)
// breaks the entry-transition relation as well. `w_r` of the entry row is copy-constrained
// to the external block's propagate row; modifying it invalidates both the external chain
// and the entry relation.
TEST_F(Poseidon2DoubleInternalSoundnessTests, EntryBoundaryRejectsTamperedStateOne)
{
    auto builder = build_honest_permutation(FF(uint256_t(0xabcdULL)));
    ASSERT_TRUE(CircuitChecker::check(*builder));

    auto& dbl = builder->blocks.poseidon2_double_internal;
    const uint32_t w_r_idx = dbl.w_r()[dbl_entry_row];
    builder->set_variable(w_r_idx, builder->get_variable(w_r_idx) + FF(7));

    EXPECT_FALSE(CircuitChecker::check(*builder));
}

// Exit boundary: the standard transition row (last row of poseidon2_double_internal) holds
// `state[1]` at round p_end in its `w_r`. Shifting that witness breaks the terminal relation,
// which enforces out_1 (computed by the last compressed row) == w_r_shift (the transition row's w_r).
TEST_F(Poseidon2DoubleInternalSoundnessTests, ExitBoundaryRejectsTamperedStateOne)
{
    auto builder = build_honest_permutation(FF(uint256_t(0xcafebabeULL)));
    ASSERT_TRUE(CircuitChecker::check(*builder));

    auto& dbl = builder->blocks.poseidon2_double_internal;
    // Last row of the double-internal block is the standard transition row holding
    // (s_0, s_1, s_2, s_3) at round p_end in standard encoding.
    const size_t dbl_std_transition_row = dbl.size() - 1;
    const uint32_t state1_idx = dbl.w_r()[dbl_std_transition_row];
    builder->set_variable(state1_idx, builder->get_variable(state1_idx) + FF(1));

    EXPECT_FALSE(CircuitChecker::check(*builder));
}

// Interior chain: corrupting any wire on an interior compressed row breaks the chain's
// double-internal relation locally.
TEST_F(Poseidon2DoubleInternalSoundnessTests, InteriorRelationRejectsTamperedWire)
{
    auto builder = build_honest_permutation(FF(uint256_t(0xfeedf00dULL)));
    ASSERT_TRUE(CircuitChecker::check(*builder));

    auto& dbl = builder->blocks.poseidon2_double_internal;
    // Pick some middle interior row.
    const size_t interior_row = dbl_first_interior_row + 5;
    const uint32_t w_o_idx = dbl.w_o()[interior_row];
    builder->set_variable(w_o_idx, builder->get_variable(w_o_idx) + FF(1));

    EXPECT_FALSE(CircuitChecker::check(*builder));
}

} // namespace
