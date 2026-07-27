// Phase 2: ACIR witness → gate discovery for ROOT_ROLLUP_HONK.
//
// Emits root_rollup_honk_witness_gate_map.txt with segment-scoped circuit_build_start anchors.

#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_recursion_test_helpers.hpp"

#include <fstream>
#include <gtest/gtest.h>

using namespace bb;
using namespace cdg;
using namespace honk_recursion_test_helpers;
using namespace rollup_honk_test_helpers;
namespace RollupOink = RollupHonkRecursionValidation::Oink;

class RollupHonkRootWitnessGateDiscoveryTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(RollupHonkRootWitnessGateDiscoveryTests, RootRollupHonkWitnessGateMapArtifact)
{
    auto ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    StaticAnalyzer_<bb::fr, Builder> analyzer(ctx.builder(), false);

    std::ofstream out("root_rollup_honk_witness_gate_map.txt");
    ASSERT_TRUE(out.is_open()) << "Failed to open root_rollup_honk_witness_gate_map.txt";

    write_root_rollup_witness_gate_map_header(out);
    write_root_rollup_opcode_anchor_lines<bb::fr>(out, ctx, 0, analyzer);
    write_root_rollup_opcode_anchor_lines<bb::fr>(out, ctx, 1, analyzer);

    const auto ipa_anchor = discover_root_rollup_ipa_accumulate_segment_anchor(ctx);
    out << "IpaAccumulate\n";
    out << "  segment_start_arith=" << ipa_anchor.circuit_build_start_arith << "\n";
    out << "  baseline_squeeze_count=" << ipa_anchor.baseline_squeeze_count << "\n\n";

    // IPA-tail witness link: build accumulate, then show the opcode proof tails reappear there.
    std::ignore = run_ipa_accumulate_with_proof(ctx);
    StaticAnalyzer_<bb::fr, Builder> link_analyzer(ctx.builder(), false);
    out << "IpaTailWitnessLink\n";
    out << "  ipa_proof_length=" << bb::IPA_PROOF_LENGTH << "\n";
    for (size_t opcode_index = 0; opcode_index < 2; ++opcode_index) {
        const auto link = discover_ipa_tail_witness_link<bb::fr>(ctx, opcode_index, link_analyzer);
        out << "  opcode" << opcode_index << " tail_start=" << link.tail_start_index
            << " witnesses_with_finalize_gates=" << link.witnesses_with_finalize_gates
            << " min_finalize_arith_gate=" << link.min_finalize_arith_gate;
        for (const auto& [blk, n] : link.finalize_gates_per_block) {
            out << " finalize_blk" << blk << "=" << n;
        }
        out << "\n";
    }
    out << "\n";

    out.flush();
    SUCCEED();
}

TEST_F(RollupHonkRootWitnessGateDiscoveryTests, RootRollupOpcode0VkHashAnchorInSegment)
{
    auto ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    StaticAnalyzer_<bb::fr, Builder> analyzer(ctx.builder(), false);

    const auto anchor = discover_root_rollup_opcode_segment_anchor<bb::fr>(ctx, 0, analyzer);
    const size_t segment_start_arith = snapshot_size_at(anchor.segment_start, BLOCK_IDX_ARITHMETIC);

    ASSERT_TRUE(anchor.vk_hash.is_valid);
    EXPECT_GE(segment_start_arith, 0U);
    EXPECT_GE(anchor.circuit_build_start_arith, segment_start_arith);
    EXPECT_LT(anchor.serialization_end_arith, anchor.circuit_build_start_arith);
    EXPECT_GE(anchor.circuit_build_start_poseidon2_ext,
              snapshot_size_at(anchor.segment_start, BLOCK_IDX_POSEIDON2_EXT));

    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(
        ctx.builder(), ctx.builder().blocks.arithmetic, anchor.circuit_build_start_arith, RollupOink::PRE_ETA_ARITH_OP0));
}

TEST_F(RollupHonkRootWitnessGateDiscoveryTests, RootRollupOpcode1VkHashAnchorInSegment)
{
    auto ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    StaticAnalyzer_<bb::fr, Builder> analyzer(ctx.builder(), false);

    const size_t min_arith = snapshot_size_at(ctx.after_opcode0, BLOCK_IDX_ARITHMETIC);
    std::set<size_t> consumed;
    for (size_t sq : recursion_helpers::find_all_transcript_squeeze_gates(ctx.builder())) {
        if (sq < min_arith) {
            consumed.insert(sq);
        }
    }
    const auto oink = recursion_helpers::oink_challenges(
        ctx.builder(), recursion_helpers::find_all_transcript_squeeze_gates(ctx.builder()), consumed);
    ASSERT_TRUE(oink.valid);
    std::vector<size_t> oink_sq(oink.squeeze_gate_indices.begin(), oink.squeeze_gate_indices.end());
    std::sort(oink_sq.begin(), oink_sq.end());
    const size_t arith_start = oink_sq[0] + 1 - RollupOink::PRE_ETA_ARITH_OP1.gate_count;
    SCOPED_TRACE("consumed=" + std::to_string(consumed.size()) + " arith_start=" + std::to_string(arith_start) +
                 " min=" + std::to_string(min_arith) + " eta=" + std::to_string(oink_sq[0]));

    const auto anchor = discover_root_rollup_opcode_segment_anchor<bb::fr>(ctx, 1, analyzer);
    const size_t segment_start_arith = snapshot_size_at(anchor.segment_start, BLOCK_IDX_ARITHMETIC);

    ASSERT_TRUE(anchor.vk_hash.is_valid);
    EXPECT_GT(segment_start_arith, 0U);
    EXPECT_GE(anchor.circuit_build_start_arith, segment_start_arith);
    EXPECT_LT(anchor.serialization_end_arith, anchor.circuit_build_start_arith);

    const auto opcode0 = discover_root_rollup_opcode_segment_anchor<bb::fr>(ctx, 0, analyzer);
    ASSERT_TRUE(opcode0.vk_hash.is_valid);
    EXPECT_GT(anchor.circuit_build_start_arith, opcode0.vk_hash.arith_end);

    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(
        ctx.builder(), ctx.builder().blocks.arithmetic, anchor.circuit_build_start_arith, RollupOink::PRE_ETA_ARITH_OP1));
}

TEST_F(RollupHonkRootWitnessGateDiscoveryTests, RootRollupOpcode0KeyHashPoseidonLinkedGates)
{
    auto ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    StaticAnalyzer_<bb::fr, Builder> analyzer(ctx.builder(), false);
    const auto& constraint = ctx.program.constraints.honk_recursion_constraints[0];

    const uint32_t key_hash_real = ctx.builder().real_variable_index[constraint.key_hash];
    auto external_gates = recursion_helpers::collect_real_witness_gates_in_block<bb::fr>(
        ctx.builder(), analyzer, key_hash_real, ctx.builder().blocks.poseidon2_external);

    EXPECT_FALSE(external_gates.empty());
    for (size_t gate_idx : external_gates) {
        EXPECT_LT(gate_idx, ctx.builder().blocks.poseidon2_external.size());
    }
}

TEST_F(RollupHonkRootWitnessGateDiscoveryTests, RootRollupIpaAccumulateSegmentStartAfterOpcodes)
{
    auto ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    const auto ipa = discover_root_rollup_ipa_accumulate_segment_anchor(ctx);
    const size_t after_opcodes_arith = snapshot_size_at(ctx.after_opcodes, BLOCK_IDX_ARITHMETIC);

    EXPECT_EQ(ipa.circuit_build_start_arith, after_opcodes_arith);
    EXPECT_GT(ipa.circuit_build_start_arith, 0U);
    EXPECT_EQ(ipa.baseline_squeeze_count, ctx.baseline_squeeze_count);
    EXPECT_GE(ipa.baseline_squeeze_count, HonkRecursionValidation::TOTAL_SQUEEZE_GATES);
}

TEST_F(RollupHonkRootWitnessGateDiscoveryTests, RootRollupOpcode0AcirVkHashWitnessCheck)
{
    auto ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    StaticAnalyzer_<bb::fr, Builder> analyzer(ctx.builder(), false);
    const auto& constraint = ctx.program.constraints.honk_recursion_constraints[0];
    EXPECT_TRUE(recursion_helpers::validate_vk_hash<bb::fr>(ctx.builder(), analyzer, &constraint));
}

// Phase 2 witness link: the last IPA_PROOF_LENGTH witnesses of each ROOT_ROLLUP_HONK opcode's
// stitched proof are the nested IPA proof. This proves those exact ACIR witnesses are DEFERRED
// through the opcodes (no gates in the opcode region) and reappear in the IPA accumulate stage —
// i.e. opcode output genuinely feeds the IPA finalize mechanism, not just a positional boundary.
TEST_F(RollupHonkRootWitnessGateDiscoveryTests, RootRollupIpaTailWitnessLinksToAccumulate)
{
    auto ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    const size_t after_opcodes_arith = snapshot_size_at(ctx.after_opcodes, BLOCK_IDX_ARITHMETIC);

    // Build the IPA accumulate stage on the same builder so the nested IPA proof witnesses
    // (the opcode proof tails) are actually consumed. full_verify re-witnesses from values,
    // so the ACIR tail links specifically to the accumulate stage.
    std::ignore = run_ipa_accumulate_with_proof(ctx);
    StaticAnalyzer_<bb::fr, Builder> analyzer(ctx.builder(), false);

    const auto link0 = discover_ipa_tail_witness_link<bb::fr>(ctx, 0, analyzer);
    const auto link1 = discover_ipa_tail_witness_link<bb::fr>(ctx, 1, analyzer);

    // Tail size is the production IPA proof length.
    EXPECT_EQ(link0.ipa_tail_size, bb::IPA_PROOF_LENGTH);
    EXPECT_EQ(link1.ipa_tail_size, bb::IPA_PROOF_LENGTH);

    // Every tail witness of both opcodes reappears in the finalize (accumulate) region.
    EXPECT_TRUE(link0.is_valid);
    EXPECT_TRUE(link1.is_valid);
    EXPECT_EQ(link0.witnesses_with_finalize_gates, bb::IPA_PROOF_LENGTH);
    EXPECT_EQ(link1.witnesses_with_finalize_gates, bb::IPA_PROOF_LENGTH);

    // Tail witnesses are pure inputs during the opcodes — deferred, they gate ONLY at finalize.
    EXPECT_TRUE(link0.opcode_gates_per_block.empty());
    EXPECT_TRUE(link1.opcode_gates_per_block.empty());

    // Both link into gates strictly after the opcodes region.
    EXPECT_GT(link0.min_finalize_arith_gate, after_opcodes_arith);
    EXPECT_GT(link1.min_finalize_arith_gate, after_opcodes_arith);

    // Ordering: nested claim 0 is accumulated before nested claim 1, so opcode 0's tail links first.
    EXPECT_LT(link0.min_finalize_arith_gate, link1.min_finalize_arith_gate);
}

TEST_F(RollupHonkRootWitnessGateDiscoveryTests, RootRollupOpcode0VkHashLinksToRollupPreamble)
{
    auto ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    StaticAnalyzer_<bb::fr, Builder> analyzer(ctx.builder(), false);
    const auto anchor = discover_root_rollup_opcode_segment_anchor<bb::fr>(ctx, 0, analyzer);
    ASSERT_TRUE(anchor.vk_hash.is_valid);

    const size_t preamble_start = anchor.circuit_build_start_arith;
    EXPECT_TRUE(recursion_helpers::matches_fingerprint_at(ctx.builder(),
                                                          ctx.builder().blocks.arithmetic,
                                                          preamble_start,
                                                          RollupOink::PREAMBLE_ARITH_OP0));
}
