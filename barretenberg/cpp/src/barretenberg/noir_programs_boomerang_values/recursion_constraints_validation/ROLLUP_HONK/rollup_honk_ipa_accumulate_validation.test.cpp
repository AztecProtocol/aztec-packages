// Boomerang discovery and validation tests for ROOT_ROLLUP_HONK IPA::accumulate.
//
// Discovery emits root_rollup_honk_ipa_accumulate_analysis.txt.
// Validation uses pinned fingerprints in rollup_honk_ipa_accumulate_verification.hpp.

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_accumulate_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_recursion_test_helpers.hpp"

#include <fstream>
#include <gtest/gtest.h>
#include <memory>
#include <tuple>

using namespace bb;
using namespace honk_recursion_test_helpers;
using namespace rollup_honk_test_helpers;
using namespace RollupHonkIpaAccumulateValidation;

class RollupHonkIpaAccumulateTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

struct IpaAccumulateSteppedCircuit {
    RootRollupIpaDiscoveryContext discovery;
    IpaVerifierAccumulator acc0{};
    IpaVerifierAccumulator acc1{};
    bb::OpeningClaim<GrumpkinCurve> accumulated_claim{};

    explicit IpaAccumulateSteppedCircuit(size_t num_acir_pub_inputs = 0)
        : discovery(setup_root_rollup_ipa_discovery(num_acir_pub_inputs, /*use_valid_proof=*/true))
    {
        auto transcript_0 = make_nested_ipa_transcript(discovery.output.nested_ipa_proofs[0]);
        auto transcript_1 = make_nested_ipa_transcript(discovery.output.nested_ipa_proofs[1]);

        run_ipa_reduce_verify_claim_hash(discovery.output.nested_ipa_claims[0], transcript_0);
        acc0 = run_ipa_reduce_verify_body(discovery.output.nested_ipa_claims[0], transcript_0);

        run_ipa_reduce_verify_claim_hash(discovery.output.nested_ipa_claims[1], transcript_1);
        acc1 = run_ipa_reduce_verify_body(discovery.output.nested_ipa_claims[1], transcript_1);

        accumulated_claim = run_ipa_accumulation_glue(acc0, acc1);
    }
};

TEST_F(RollupHonkIpaAccumulateTests, RootRollupHonkIpaAccumulateFunctionAnalysis)
{
    RootRollupIpaDiscoveryContext fresh_ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    auto fresh_transcript_0 = make_nested_ipa_transcript(fresh_ctx.output.nested_ipa_proofs[0]);
    auto fresh_transcript_1 = make_nested_ipa_transcript(fresh_ctx.output.nested_ipa_proofs[1]);

    std::ofstream out("root_rollup_honk_ipa_accumulate_analysis.txt");
    ASSERT_TRUE(out.is_open()) << "Failed to open root_rollup_honk_ipa_accumulate_analysis.txt";

    dump_analysis_header(out,
                         "ROOT_ROLLUP_HONK IPA Accumulate — Step Analysis",
                         "2× ROLLUP_HONK opcodes -> IPA::accumulate (before full_verify_recursive)",
                         static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N),
                         "# Stages mirror perform_IPA_accumulation for two nested claims\n"
                         "# Native compute_opening_proof in accumulate is off-circuit (0 gates)\n");

    out << "After opcodes baseline\n";
    dump_total_block_counts(out, fresh_ctx.after_opcodes, "Block totals after 2× recursion opcodes:");
    dump_opcode_gate_counts(out, fresh_ctx.gates_per_opcode, "Gates per recursion opcode:");
    out << "  baseline_squeeze_count=" << fresh_ctx.baseline_squeeze_count << "\n\n";

    auto snap = fresh_ctx.after_opcodes;

    auto snap_before = snap;
    run_ipa_reduce_verify_claim_hash(fresh_ctx.output.nested_ipa_claims[0], fresh_transcript_0);
    auto snap_after_claim_hash_0 = recursion_helpers::BlockSnapshot::capture(fresh_ctx.builder());
    dump_step_fingerprints(out, fresh_ctx.builder(), snap_before, snap_after_claim_hash_0, "ReduceVerify_Nested0_ClaimHash");
    snap = snap_after_claim_hash_0;

    snap_before = snap;
    const auto acc0 = run_ipa_reduce_verify_body(fresh_ctx.output.nested_ipa_claims[0], fresh_transcript_0);
    auto snap_after_reduce_0 = recursion_helpers::BlockSnapshot::capture(fresh_ctx.builder());
    dump_step_fingerprints(out, fresh_ctx.builder(), snap_before, snap_after_reduce_0, "ReduceVerify_Nested0_Body");
    snap = snap_after_reduce_0;

    snap_before = snap;
    run_ipa_reduce_verify_claim_hash(fresh_ctx.output.nested_ipa_claims[1], fresh_transcript_1);
    auto snap_after_claim_hash_1 = recursion_helpers::BlockSnapshot::capture(fresh_ctx.builder());
    dump_step_fingerprints(out, fresh_ctx.builder(), snap_before, snap_after_claim_hash_1, "ReduceVerify_Nested1_ClaimHash");
    snap = snap_after_claim_hash_1;

    snap_before = snap;
    const auto acc1 = run_ipa_reduce_verify_body(fresh_ctx.output.nested_ipa_claims[1], fresh_transcript_1);
    auto snap_after_reduce_1 = recursion_helpers::BlockSnapshot::capture(fresh_ctx.builder());
    dump_step_fingerprints(out, fresh_ctx.builder(), snap_before, snap_after_reduce_1, "ReduceVerify_Nested1_Body");
    snap = snap_after_reduce_1;

    snap_before = snap;
    const auto accumulated_claim = run_ipa_accumulation_glue(acc0, acc1);
    auto snap_after_glue = recursion_helpers::BlockSnapshot::capture(fresh_ctx.builder());
    dump_step_fingerprints(out, fresh_ctx.builder(), snap_before, snap_after_glue, "AccumulationGlue");
    snap = snap_after_glue;

    out << "\nIpaAccumulate (stepped total)\n";
    dump_step_fingerprints(out, fresh_ctx.builder(), fresh_ctx.after_opcodes, snap_after_glue, "IpaAccumulate");

    out << "\n";
    dump_ipa_squeeze_region(out, fresh_ctx.builder(), fresh_ctx.baseline_squeeze_count);

    RootRollupIpaDiscoveryContext mono_ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    const auto mono_before = recursion_helpers::BlockSnapshot::capture(mono_ctx.builder());
    run_ipa_accumulate_monolithic(mono_ctx);
    const auto mono_after = recursion_helpers::BlockSnapshot::capture(mono_ctx.builder());

    out << "\nMonolithic IPA::accumulate cross-check\n";
    dump_step_fingerprints(out, mono_ctx.builder(), mono_before, mono_after, "IpaAccumulate_Monolithic");
    for (const auto& [block_idx, block_name] : IPA_ANALYSIS_BLOCKS) {
        const size_t stepped_delta =
            snapshot_size_at(snap_after_glue, block_idx) - snapshot_size_at(fresh_ctx.after_opcodes, block_idx);
        const size_t mono_delta = snapshot_size_at(mono_after, block_idx) - snapshot_size_at(mono_before, block_idx);
        out << "  block[" << block_idx << "] " << block_name << " stepped=" << stepped_delta << " mono=" << mono_delta
            << "\n";
        EXPECT_EQ(stepped_delta, mono_delta) << block_name << " stepped vs monolithic mismatch";
    }
    out.flush();

    EXPECT_EQ(total_block_delta(fresh_ctx.after_opcodes, snap_after_glue), total_block_delta(mono_before, mono_after));
    EXPECT_GT(total_block_delta(fresh_ctx.after_opcodes, snap_after_glue), 0U);
    EXPECT_GT(recursion_helpers::find_all_transcript_squeeze_gates(fresh_ctx.builder()).size(),
              fresh_ctx.baseline_squeeze_count + 30U);
    std::ignore = accumulated_claim;
}

TEST_F(RollupHonkIpaAccumulateTests, ValidateIpaAccumulate)
{
    IpaAccumulateSteppedCircuit stepped;
    auto result = validate_ipa_accumulate(stepped.discovery.builder(), stepped.discovery.after_opcodes);
    EXPECT_TRUE(result.nested0_claim_hash_ok);
    EXPECT_TRUE(result.nested0_body_ok);
    EXPECT_TRUE(result.nested1_claim_hash_ok);
    EXPECT_TRUE(result.nested1_body_ok);
    EXPECT_TRUE(result.accumulation_glue_ok);
    EXPECT_TRUE(result.aggregate_ok);
    EXPECT_TRUE(result.squeeze_count_ok);
    EXPECT_TRUE(result.is_valid);
}

TEST_F(RollupHonkIpaAccumulateTests, ValidateNested0ClaimHash)
{
    RootRollupIpaDiscoveryContext ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    auto transcript_0 = make_nested_ipa_transcript(ctx.output.nested_ipa_proofs[0]);
    run_ipa_reduce_verify_claim_hash(ctx.output.nested_ipa_claims[0], transcript_0);

    const BlockCursor baseline = block_cursor_from_snapshot(ctx.after_opcodes);
    auto result = validate_nested0_claim_hash(ctx.builder(), baseline);
    EXPECT_TRUE(result.is_valid);
}

TEST_F(RollupHonkIpaAccumulateTests, ValidateNested0Body)
{
    RootRollupIpaDiscoveryContext ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    auto transcript_0 = make_nested_ipa_transcript(ctx.output.nested_ipa_proofs[0]);
    run_ipa_reduce_verify_claim_hash(ctx.output.nested_ipa_claims[0], transcript_0);
    run_ipa_reduce_verify_body(ctx.output.nested_ipa_claims[0], transcript_0);

    BlockCursor cursor = block_cursor_from_snapshot(ctx.after_opcodes);
    cursor.arith += NESTED0_CLAIM_HASH_ARITH.gate_count;
    auto result = validate_nested0_body(ctx.builder(), cursor);
    EXPECT_TRUE(result.is_valid);
}

TEST_F(RollupHonkIpaAccumulateTests, ValidateNested1ClaimHash)
{
    RootRollupIpaDiscoveryContext ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    auto transcript_0 = make_nested_ipa_transcript(ctx.output.nested_ipa_proofs[0]);
    auto transcript_1 = make_nested_ipa_transcript(ctx.output.nested_ipa_proofs[1]);

    run_ipa_reduce_verify_claim_hash(ctx.output.nested_ipa_claims[0], transcript_0);
    run_ipa_reduce_verify_body(ctx.output.nested_ipa_claims[0], transcript_0);
    run_ipa_reduce_verify_claim_hash(ctx.output.nested_ipa_claims[1], transcript_1);

    BlockCursor cursor = block_cursor_from_snapshot(ctx.after_opcodes);
    cursor.arith += NESTED0_CLAIM_HASH_ARITH.gate_count + NESTED0_BODY_ARITH.gate_count;
    cursor.elliptic += NESTED0_BODY_ELLIPTIC.gate_count;
    cursor.memory += NESTED0_BODY_MEMORY.gate_count;
    cursor.nnf += NESTED0_BODY_NNF.gate_count;
    cursor.poseidon2_ext += NESTED0_BODY_POSEIDON2_EXT.gate_count;
    cursor.poseidon2_int += NESTED0_BODY_POSEIDON2_INT.gate_count;

    auto result = validate_nested1_claim_hash(ctx.builder(), cursor);
    EXPECT_TRUE(result.is_valid);
}

TEST_F(RollupHonkIpaAccumulateTests, ValidateAccumulationGlue)
{
    IpaAccumulateSteppedCircuit stepped;
    BlockCursor cursor = block_cursor_from_snapshot(stepped.discovery.after_opcodes);
    cursor.arith += NESTED0_CLAIM_HASH_ARITH.gate_count + NESTED0_BODY_ARITH.gate_count + NESTED1_CLAIM_HASH_ARITH.gate_count
                    + NESTED1_BODY_ARITH.gate_count;
    cursor.elliptic += NESTED0_BODY_ELLIPTIC.gate_count + NESTED1_BODY_ELLIPTIC.gate_count;
    cursor.memory += NESTED0_BODY_MEMORY.gate_count + NESTED1_BODY_MEMORY.gate_count;
    cursor.nnf += NESTED0_BODY_NNF.gate_count + NESTED1_BODY_NNF.gate_count;
    cursor.poseidon2_ext += NESTED0_BODY_POSEIDON2_EXT.gate_count + NESTED1_BODY_POSEIDON2_EXT.gate_count;
    cursor.poseidon2_int += NESTED0_BODY_POSEIDON2_INT.gate_count + NESTED1_BODY_POSEIDON2_INT.gate_count;

    auto result = validate_accumulation_glue(stepped.discovery.builder(), cursor);
    EXPECT_TRUE(result.is_valid);
}

TEST_F(RollupHonkIpaAccumulateTests, ValidateIpaAccumulateMonolithicPath)
{
    RootRollupIpaDiscoveryContext ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    run_ipa_accumulate_monolithic(ctx);
    auto result = validate_ipa_accumulate(ctx.builder(), ctx.after_opcodes);
    EXPECT_TRUE(result.is_valid);
}
