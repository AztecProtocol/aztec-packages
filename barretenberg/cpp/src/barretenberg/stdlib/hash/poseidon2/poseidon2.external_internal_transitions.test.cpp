// Malicious-prover soundness tests for the external<->internal transitions in the Mega Poseidon2 block.
//
// All five Poseidon2 gate kinds (external, external-initial, quad-internal, terminal, transition-entry)
// share the single `poseidon2` block, so each permutation's rows are contiguous:
//
//   initial | g1 external x4 | transition_entry | quad x13 | terminal | g2 external x4 | output
//
// Contiguity lets the `v_k = w_shift` round relations bind directly across the external<->internal
// boundary, so the only selector-unconstrained row per permutation is the final `output` landing.
//
// Soundness requires every boundary-handoff witness to be pinned by a relation. Each test tampers every
// wire of a boundary row and asserts CircuitChecker rejects the result:
//   - the `transition_entry` state is pinned by the last first-group external round's relation, whose
//     w_shift targets this row;
//   - the first final-group external round (`g2r0`) holds the full standard state at round p_end, pinned
//     by the terminal relation, whose w_shift targets this row;
//   - the final `output` row is pinned by the last external round's relation, whose w_shift targets it.
//
// These wires are shared witnesses. Beyond asserting CircuitChecker rejects the tamper, each test pins
// the failure to the specific producing relation whose w_shift targets the row (via relation_fires), so a
// pass proves that relation -- not merely some incidental constraint -- holds the boundary wire. A
// genuinely free wire would leave the tampered circuit valid and the relation satisfied, failing both
// assertions: an unconstrained boundary wire would let a prover forge the permutation output.

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/circuit_checker/ultra_circuit_checker.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/honk/execution_trace/execution_trace_block.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "barretenberg/relations/poseidon2_external_relation.hpp"
#include "barretenberg/relations/poseidon2_quad_internal_terminal_relation.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

namespace {

class Poseidon2ExternalInternalTransitionsTests : public ::testing::Test {
  public:
    using Builder = MegaCircuitBuilder;
    using FF = MegaFlavor::FF;

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

    static size_t selector_row(const Builder& b, GateKind kind)
    {
        const auto& block = b.blocks.poseidon2;
        for (size_t i = 0; i < block.size(); ++i) {
            if (!read_gate_selector(block, kind, i).is_zero()) {
                return i;
            }
        }
        throw_or_abort("selector not found");
        return 0;
    }

    // First external round of the final group: the first Poseidon2Ext row after the terminal row.
    static size_t final_group_first_external_row(const Builder& b)
    {
        const auto& block = b.blocks.poseidon2;
        const size_t terminal = selector_row(b, GateKind::Poseidon2QuadIntTerminal);
        for (size_t i = terminal + 1; i < block.size(); ++i) {
            if (!read_gate_selector(block, GateKind::Poseidon2Ext, i).is_zero()) {
                return i;
            }
        }
        throw_or_abort("no final-group external row");
        return 0;
    }

    // True iff `Relation` is violated at row `idx` of the `poseidon2` block.
    template <typename Relation> static bool relation_fires(Builder& builder, size_t idx)
    {
        return !UltraCircuitChecker::check_relation_at_row<Relation>(builder, builder.blocks.poseidon2, idx);
    }

    // Tamper `wire` of `tamper_row` and assert both that CircuitChecker rejects the circuit and that the
    // specific pinning `Relation` at `relation_row` -- whose w_shift targets the tampered row -- now fires.
    template <typename Relation>
    static void expect_tamper_rejected(const FF& input, size_t tamper_row, size_t wire, size_t relation_row)
    {
        auto builder = build_honest_permutation(input);
        ASSERT_TRUE(CircuitChecker::check(*builder));
        ASSERT_FALSE(relation_fires<Relation>(*builder, relation_row));

        auto& block = builder->blocks.poseidon2;
        const uint32_t idx = block.wires[wire][tamper_row];
        builder->set_variable(idx, builder->get_variable(idx) + FF(1));

        EXPECT_FALSE(CircuitChecker::check(*builder))
            << "tampering wire " << wire << " of boundary row " << tamper_row << " was NOT rejected";
        EXPECT_TRUE(relation_fires<Relation>(*builder, relation_row))
            << "tampering wire " << wire << " of boundary row " << tamper_row
            << " did not break the pinning relation at row " << relation_row;
    }
};

TEST_F(Poseidon2ExternalInternalTransitionsTests, AllGateKindsShareOneBlock)
{
    auto builder = build_honest_permutation(FF(uint256_t(0x1234ULL)));
    ASSERT_TRUE(CircuitChecker::check(*builder));
    EXPECT_GT(builder->blocks.poseidon2.size(), 0u);
    for (const GateKind kind : { GateKind::Poseidon2Ext,
                                 GateKind::Poseidon2ExtInitial,
                                 GateKind::Poseidon2QuadInt,
                                 GateKind::Poseidon2QuadIntTerminal,
                                 GateKind::Poseidon2TransitionEntry }) {
        EXPECT_NO_THROW(selector_row(*builder, kind)) << "gate kind missing from poseidon2 block";
    }
}

// Boundary 1: the entry handoff. The transition-entry state is pinned by the last first-group external
// round's relation, whose w_shift targets this row; tampering any of its wires must be rejected.
TEST_F(Poseidon2ExternalInternalTransitionsTests, EntryHandoffTamperRejected)
{
    const FF input(uint256_t(0xabcdULL));
    const size_t row = selector_row(*build_honest_permutation(input), GateKind::Poseidon2TransitionEntry);
    // The preceding external round's w_shift targets the entry row, so its relation pins these wires.
    for (size_t wire = 0; wire < Builder::ExecutionTrace::NUM_WIRES; ++wire) {
        expect_tamper_rejected<Poseidon2ExternalRelation<FF>>(input, row, wire, row - 1);
    }
}

// Boundary 2: the exit handoff. The first final-group external round (g2r0) holds the full standard
// state at round p_end, pinned by the terminal relation whose w_shift targets this row; tampering any
// of its wires must be rejected.
TEST_F(Poseidon2ExternalInternalTransitionsTests, ExitHandoffTamperRejected)
{
    const FF input(uint256_t(0xfeedULL));
    auto builder = build_honest_permutation(input);
    const size_t row = final_group_first_external_row(*builder);
    const size_t terminal_row = selector_row(*builder, GateKind::Poseidon2QuadIntTerminal);
    // The terminal relation's w_shift targets g2r0 (out_k == w_*_shift), pinning its full standard state.
    for (size_t wire = 0; wire < Builder::ExecutionTrace::NUM_WIRES; ++wire) {
        expect_tamper_rejected<Poseidon2QuadInternalTerminalRelation<FF>>(input, row, wire, terminal_row);
    }
}

// The only selector-unconstrained row -- the final external round's output landing (last row of the
// block) -- is pinned by that round's relation, whose w_shift targets it.
TEST_F(Poseidon2ExternalInternalTransitionsTests, FinalOutputRowTamperRejected)
{
    const FF input(uint256_t(0xCAFEBABEULL));
    const size_t row = build_honest_permutation(input)->blocks.poseidon2.size() - 1;
    // The last external round's w_shift targets the output row, so its relation pins these wires.
    for (size_t wire = 0; wire < Builder::ExecutionTrace::NUM_WIRES; ++wire) {
        expect_tamper_rejected<Poseidon2ExternalRelation<FF>>(input, row, wire, row - 1);
    }
}

} // namespace
