// Regression tests for the Mega Poseidon2 compressed internal relations and their boundaries.
//
// All five Poseidon2 gate kinds share the single `poseidon2` block, emitted contiguously as
//   initial | g1 external x4 | transition_entry | quad x13 | terminal | g2 external x4 | out
// so rows are located by selector (not by hardcoded index). The compressed block has an entry
// transition row (standard -> compressed) and a terminal row (compressed -> first final-external
// row); both are tied to the surrounding standard-encoded states via shifted wires:
//
//   - Entry  (q_poseidon2_transition_entry):
//       w_r_shift - D_1 (w_l + q_l)^5 - w_r - w_o - w_4 = 0
//     ties the first compressed row's `w_r` (= state[0] one round ahead) to the standard `s_1`
//     at round `rounds_f_begin`.
//
//   - Terminal (q_poseidon2_quad_internal_terminal):
//       out_k - w_{k,shift} = 0 for k in {0, 1, 2, 3}
//     ties the compressed chain's computed state at round `p_end` directly to the first
//     final-external row (the rows are contiguous, so its w_shift lands on the real consumer).
//
// CircuitChecker iterates row-major-then-relation-major and short-circuits on the first
// failing relation. This means a corruption that would in principle break multiple relations
// is reported as breaking the first one the checker reaches; the tests below note the
// expected first-detector where it matters. To pin down which relation a tamper actually
// breaks (rather than relying only on the aggregate `CircuitChecker::check` verdict), each
// test also evaluates the relevant Poseidon2 relation in isolation at the boundary row via
// `relation_fires`, asserting it is satisfied on the honest circuit and violated after the
// tamper.

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/circuit_checker/ultra_circuit_checker.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/honk/execution_trace/execution_trace_block.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "barretenberg/relations/poseidon2_quad_internal_relation.hpp"
#include "barretenberg/relations/poseidon2_quad_internal_terminal_relation.hpp"
#include "barretenberg/relations/poseidon2_transition_entry_relation.hpp"
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

    // Locate the (unique, for a single permutation) row carrying a given gate selector in the
    // merged `poseidon2` block. Rows are interleaved (initial / external / transition / quad /
    // terminal), so tests must find their target by selector rather than by a fixed index.
    static size_t selector_row(const Builder& b, GateKind kind)
    {
        const auto& block = b.blocks.poseidon2;
        for (size_t i = 0; i < block.size(); ++i) {
            if (!read_gate_selector(block, kind, i).is_zero()) {
                return i;
            }
        }
        throw_or_abort("selector not found in poseidon2 block");
        return 0;
    }

    // True iff `Relation` is violated at row `idx` of the `poseidon2` block.
    template <typename Relation> static bool relation_fires(Builder& builder, size_t idx)
    {
        return !UltraCircuitChecker::check_relation_at_row<Relation>(builder, builder.blocks.poseidon2, idx);
    }

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

    auto& quad = builder->blocks.poseidon2;
    const size_t entry_row = selector_row(*builder, GateKind::Poseidon2TransitionEntry);
    // The first interior compressed row is the entry transition's immediate successor.
    const size_t first_interior_row = entry_row + 1;
    ASSERT_FALSE(relation_fires<Poseidon2TransitionEntryRelation<FF>>(*builder, entry_row));

    const uint32_t w_r_idx = quad.w_r()[first_interior_row];
    builder->set_variable(w_r_idx, builder->get_variable(w_r_idx) + FF(1));

    EXPECT_FALSE(CircuitChecker::check(*builder));
    // w_r_shift of the entry row is the first interior row's w_r, so subrelation A_0 breaks.
    EXPECT_TRUE(relation_fires<Poseidon2TransitionEntryRelation<FF>>(*builder, entry_row));
}

// Entry boundary: tampering the entry row's own `w_r` (= standard s_1 at round rounds_f_begin)
// breaks the entry-transition relation as well. `w_r` of the entry row shares its witness index
// with the last first-group external round's output, so modifying it invalidates both the
// external chain (which pins it via w_shift) and the entry relation that reads it.
TEST_F(Poseidon2QuadInternalSoundnessTests, EntryBoundaryRejectsTamperedStateOne)
{
    auto builder = build_honest_permutation(FF(uint256_t(0xabcdULL)));
    ASSERT_TRUE(CircuitChecker::check(*builder));

    auto& quad = builder->blocks.poseidon2;
    const size_t entry_row = selector_row(*builder, GateKind::Poseidon2TransitionEntry);
    ASSERT_FALSE(relation_fires<Poseidon2TransitionEntryRelation<FF>>(*builder, entry_row));

    const uint32_t w_r_idx = quad.w_r()[entry_row];
    builder->set_variable(w_r_idx, builder->get_variable(w_r_idx) + FF(7));

    EXPECT_FALSE(CircuitChecker::check(*builder));
    // The entry relation reads the entry row's own w_r (the standard s_1), so it breaks.
    EXPECT_TRUE(relation_fires<Poseidon2TransitionEntryRelation<FF>>(*builder, entry_row));
}

// Exit boundary: the terminal relation's successor is the first final-external row, which holds
// the full standard state (s_0, s_1, s_2, s_3) at round p_end. Its `w_r` (= state[1]) is bound by
// the terminal subrelation out_1 == w_r_shift. Shifting that witness must be rejected.
TEST_F(Poseidon2QuadInternalSoundnessTests, ExitBoundaryRejectsTamperedStateOne)
{
    auto builder = build_honest_permutation(FF(uint256_t(0xcafebabeULL)));
    ASSERT_TRUE(CircuitChecker::check(*builder));

    auto& quad = builder->blocks.poseidon2;
    const size_t terminal_row = selector_row(*builder, GateKind::Poseidon2QuadIntTerminal);
    const size_t first_final_external_row = terminal_row + 1;
    ASSERT_FALSE(relation_fires<Poseidon2QuadInternalTerminalRelation<FF>>(*builder, terminal_row));

    const uint32_t state1_idx = quad.w_r()[first_final_external_row];
    builder->set_variable(state1_idx, builder->get_variable(state1_idx) + FF(1));

    EXPECT_FALSE(CircuitChecker::check(*builder));
    // The terminal relation's subrelation out_1 == w_r_shift binds this witness, so it breaks.
    EXPECT_TRUE(relation_fires<Poseidon2QuadInternalTerminalRelation<FF>>(*builder, terminal_row));
}

// Interior chain: corrupting any wire on an interior compressed row breaks the chain's
// quad-internal relation locally.
TEST_F(Poseidon2QuadInternalSoundnessTests, InteriorRelationRejectsTamperedWire)
{
    auto builder = build_honest_permutation(FF(uint256_t(0xfeedf00dULL)));
    ASSERT_TRUE(CircuitChecker::check(*builder));

    auto& quad = builder->blocks.poseidon2;
    // Pick some middle interior row (first interior row is the entry transition's successor).
    const size_t interior_row = selector_row(*builder, GateKind::Poseidon2TransitionEntry) + 1 + 5;
    ASSERT_FALSE(relation_fires<Poseidon2QuadInternalRelation<FF>>(*builder, interior_row));

    const uint32_t w_o_idx = quad.w_o()[interior_row];
    builder->set_variable(w_o_idx, builder->get_variable(w_o_idx) + FF(1));

    EXPECT_FALSE(CircuitChecker::check(*builder));
    // The quad-internal relation reads this row's own w_o, so the interior chain breaks here.
    EXPECT_TRUE(relation_fires<Poseidon2QuadInternalRelation<FF>>(*builder, interior_row));
}

// Cross-row encoding test: the interior subrelations A_1, A_2, A_3 compare row i's predicted
// (out_1, out_2, out_3) against row i+1's reconstructed Vandermonde encoding (b_1', b_2',
// b_3'), where b_k' is built from row i+1's lane-0 chain. Tampering an interior row's wire
// perturbs that reconstruction at the *previous* row without touching the previous row's
// own committed wires — exercising the bijectivity-of-V mechanism that lets the relation
// compare uncommitted hidden lanes. The tampered wire is also row i+1's own committed wire,
// so the tamper would also break row i+1's own relation; CircuitChecker may report either
// site, but both are exercising the same Vandermonde-encoding equality.
TEST_F(Poseidon2QuadInternalSoundnessTests, CrossRowVandermondeEncodingMismatchRejected)
{
    auto builder = build_honest_permutation(FF(uint256_t(0xCAFE1234ULL)));
    ASSERT_TRUE(CircuitChecker::check(*builder));

    auto& quad = builder->blocks.poseidon2;
    const size_t row_i_plus_1 = selector_row(*builder, GateKind::Poseidon2TransitionEntry) + 1 + 6;
    const size_t row_i = row_i_plus_1 - 1;
    ASSERT_FALSE(relation_fires<Poseidon2QuadInternalRelation<FF>>(*builder, row_i));

    const uint32_t idx = quad.w_o()[row_i_plus_1];
    builder->set_variable(idx, builder->get_variable(idx) + FF(1));

    EXPECT_FALSE(CircuitChecker::check(*builder));
    // Row i's committed wires are untouched, but row i+1's w_o enters row i's relation as w_o_shift
    // through the Vandermonde RHS reconstruction (b_2', b_3'), so row i's relation fires.
    EXPECT_TRUE(relation_fires<Poseidon2QuadInternalRelation<FF>>(*builder, row_i));
}

} // namespace
