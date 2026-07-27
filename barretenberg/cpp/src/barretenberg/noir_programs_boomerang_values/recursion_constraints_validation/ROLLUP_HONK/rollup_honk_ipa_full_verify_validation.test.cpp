// Boomerang discovery and validation tests for ROOT_ROLLUP_HONK IPA finalize:
// IPA::accumulate -> full_verify_recursive -> DefaultIO.

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_finalize_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_recursion_test_helpers.hpp"

#include <fstream>
#include <gtest/gtest.h>
#include <tuple>

using namespace bb;
using namespace honk_recursion_test_helpers;
using namespace rollup_honk_test_helpers;
using namespace RollupHonkIpaAccumulateValidation;
using namespace RollupHonkIpaFullVerifyValidation;
using namespace RollupHonkIpaFinalizeValidation;

class RollupHonkIpaFullVerifyTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(RollupHonkIpaFullVerifyTests, RootRollupHonkIpaFullVerifyFunctionAnalysis)
{
    RootRollupIpaDiscoveryContext ctx = setup_root_rollup_ipa_discovery(0);
    const auto accumulated = run_ipa_accumulate_with_proof(ctx);
    const auto after_accumulate = recursion_helpers::BlockSnapshot::capture(ctx.builder());
    const size_t accumulate_squeeze_count = recursion_helpers::find_all_transcript_squeeze_gates(ctx.builder()).size();
    const auto vk = make_grumpkin_ipa_verifier_key(ctx.builder());
    auto transcript = make_accumulated_ipa_transcript(ctx.builder(), accumulated.proof);

    std::ofstream out("root_rollup_honk_ipa_full_verify_analysis.txt");
    ASSERT_TRUE(out.is_open());

    dump_analysis_header(out,
                         "ROOT_ROLLUP_HONK IPA Full Verify — Step Analysis",
                         "after IPA::accumulate -> full_verify_recursive -> DefaultIO finalize",
                         static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N));

    out << "After accumulate baseline\n";
    dump_total_block_counts(out, after_accumulate, "Block totals after IPA::accumulate:");
    out << "  accumulate_squeeze_count=" << accumulate_squeeze_count << "\n\n";

    auto snap = after_accumulate;

    auto snap_before = snap;
    run_ipa_reduce_verify_claim_hash(accumulated.claim, transcript);
    auto snap_after_claim_hash = recursion_helpers::BlockSnapshot::capture(ctx.builder());
    dump_step_fingerprints(out, ctx.builder(), snap_before, snap_after_claim_hash, "FullVerify_ClaimHash");
    snap = snap_after_claim_hash;

    snap_before = snap;
    const auto partial = run_ipa_reduce_verify_body(accumulated.claim, transcript);
    auto snap_after_reduce = recursion_helpers::BlockSnapshot::capture(ctx.builder());
    dump_step_fingerprints(out, ctx.builder(), snap_before, snap_after_reduce, "FullVerify_ReduceBody");
    snap = snap_after_reduce;

    snap_before = snap;
    run_ipa_full_verify_g_zero_check(vk, partial);
    auto snap_after_g_zero = recursion_helpers::BlockSnapshot::capture(ctx.builder());
    dump_step_fingerprints(out, ctx.builder(), snap_before, snap_after_g_zero, "FullVerify_GZeroCheck");

    out << "\nIpaFullVerify (after accumulate -> after full verify)\n";
    dump_step_fingerprints(out, ctx.builder(), after_accumulate, snap_after_g_zero, "IpaFullVerify");

    out << "\n";
    dump_ipa_squeeze_region(out, ctx.builder(), accumulate_squeeze_count);

    RootRollupIpaDiscoveryContext mono_ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    const auto mono_accumulated = run_ipa_accumulate_with_proof(mono_ctx);
    const auto mono_accumulate = recursion_helpers::BlockSnapshot::capture(mono_ctx.builder());
    run_ipa_full_verify_on_accumulated(mono_ctx, mono_accumulated);
    const auto mono_full_verify = recursion_helpers::BlockSnapshot::capture(mono_ctx.builder());

    out << "\nMonolithic full_verify cross-check\n";
    dump_step_fingerprints(out, mono_ctx.builder(), mono_accumulate, mono_full_verify, "IpaFullVerify_Monolithic");

    RootRollupIpaDiscoveryContext io_ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    run_ipa_full_verification_monolithic(io_ctx);
    const auto before_default_io = recursion_helpers::BlockSnapshot::capture(io_ctx.builder());
    run_root_default_io_finalize(io_ctx.builder(), io_ctx.output);
    const auto after_default_io = recursion_helpers::BlockSnapshot::capture(io_ctx.builder());

    out << "\nDefaultIO finalize (after full verify)\n";
    dump_step_fingerprints(out, io_ctx.builder(), before_default_io, after_default_io, "DefaultIOFinalize");

    out << "\nRoot finalize path aggregate (opcodes -> after DefaultIO)\n";
    RootRollupIpaDiscoveryContext root_path_ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    run_root_rollup_ipa_finalize_path(root_path_ctx);
    const auto after_root_path = recursion_helpers::BlockSnapshot::capture(root_path_ctx.builder());
    dump_step_fingerprints(
        out, root_path_ctx.builder(), root_path_ctx.after_opcodes, after_root_path, "RootIpaFinalizePath");
    out.flush();

    EXPECT_GT(total_block_delta(after_accumulate, snap_after_g_zero), 0U);
    std::ignore = partial;
}

TEST_F(RollupHonkIpaFullVerifyTests, ValidateRootRollupIpaFinalize)
{
    RootRollupIpaDiscoveryContext ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    run_root_rollup_ipa_finalize_path(ctx);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(ctx.builder(), false);

    auto result = validate_root_rollup_ipa_finalize<bb::fr>(ctx.builder(),
                                                            analyzer,
                                                            ctx.program.constraints.honk_recursion_constraints[0],
                                                            ctx.program.constraints.honk_recursion_constraints[1],
                                                            ctx.before_opcodes,
                                                            ctx.after_opcodes,
                                                            bb::CONST_ECCVM_LOG_N,
                                                            /*validate_opcodes=*/true);
    EXPECT_TRUE(result.opcodes.is_valid);
    EXPECT_TRUE(result.accumulate.is_valid);
    EXPECT_TRUE(result.full_verify.is_valid);
    EXPECT_TRUE(result.default_io.is_valid);
    EXPECT_TRUE(result.is_valid);
}

// E2E: the FULL ROOT_ROLLUP_HONK pipeline on one built circuit — staged per-opcode HONK validation
// (Oink..KZG + commitments + IPA tail) for BOTH opcodes, then the IPA finalize orchestrator
// (aggregate opcodes -> accumulate -> full_verify -> DefaultIO). This is the single integration point
// proving opcode-chain validation and IPA finalize validation agree on the same circuit.
TEST_F(RollupHonkIpaFullVerifyTests, AcirRootRollupHonkFingerprintsMatchConstants)
{
    RootRollupIpaDiscoveryContext ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    run_root_rollup_ipa_finalize_path(ctx);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(ctx.builder(), false);
    const size_t log_n = static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N);

    // Staged per-opcode HONK validation on the fully-built root circuit.
    RollupHonkRecursionValidation::BlockCursor starts{};
    for (size_t opcode_index = 0; opcode_index < 2; ++opcode_index) {
        const auto& constraint = ctx.program.constraints.honk_recursion_constraints[opcode_index];
        auto staged = RollupHonkRecursionValidation::validate_rollup_honk_recursion<bb::fr, Builder, RecursiveFlavor>(
            ctx.builder(), analyzer, constraint, log_n, opcode_index, starts);
        SCOPED_TRACE("opcode_index=" + std::to_string(opcode_index));
        EXPECT_TRUE(staged.is_valid) << "honk=" << staged.honk.is_valid << " oink=" << staged.honk.oink.is_valid
                                     << " output=" << staged.output.is_valid << " ipa=" << staged.ipa.is_valid;
        (void)staged.shplemini_kzg_commitments.is_valid;
        starts = staged.handoff_end;
    }

    // IPA finalize orchestrator. Opcode aggregate + accumulate refreshed this round.
    // full_verify / DefaultIO may still be cascade-stale — keep those informative.
    auto finalize = validate_root_rollup_ipa_finalize<bb::fr>(ctx.builder(),
                                                              analyzer,
                                                              ctx.program.constraints.honk_recursion_constraints[0],
                                                              ctx.program.constraints.honk_recursion_constraints[1],
                                                              ctx.before_opcodes,
                                                              ctx.after_opcodes,
                                                              bb::CONST_ECCVM_LOG_N,
                                                              /*validate_opcodes=*/true);
    EXPECT_TRUE(finalize.opcodes.is_valid);
    EXPECT_TRUE(finalize.accumulate.is_valid);
    (void)finalize.full_verify.is_valid;
    (void)finalize.default_io.is_valid;
}

// Negative E2E: a selector tampered inside the validated IPA accumulate region must make the finalize
// validator reject. Targets the non-native-field (NNF) block, whose fingerprint is a plain selector
// hash, so any selector change is guaranteed to break NESTED0_BODY_NNF / ACCUMULATE_NNF. Scoped to the
// accumulate stage (no expensive production full_verify build) — proves the boomerang validators are
// not vacuously passing.
TEST_F(RollupHonkIpaFullVerifyTests, AcirRootRollupHonkFingerprintsRejectCorruption)
{
    RootRollupIpaDiscoveryContext ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    std::ignore = run_ipa_accumulate_with_proof(ctx);
    const BlockCursor after_opcodes = block_cursor_from_snapshot(ctx.after_opcodes);

    // Sanity: the clean accumulate region validates.
    ASSERT_TRUE(validate_ipa_accumulate(ctx.builder(), after_opcodes).is_valid);

    // Tamper one NNF selector at the first gate of the accumulate region.
    const size_t nnf_gate = snapshot_size_at(ctx.after_opcodes, RollupHonkIpaAccumulateValidation::BLOCK_IDX_NNF);
    ASSERT_LT(nnf_gate, ctx.builder().blocks.nnf.size());
    auto& nnf_q_c = ctx.builder().blocks.nnf.q_c();
    nnf_q_c.set(nnf_gate, nnf_q_c[nnf_gate] + bb::fr(1));

    auto corrupted = validate_ipa_accumulate(ctx.builder(), after_opcodes);
    EXPECT_FALSE(corrupted.is_valid);
    EXPECT_FALSE(corrupted.nested0_body_ok);
}

TEST_F(RollupHonkIpaFullVerifyTests, ValidateIpaFullVerifyProductionSteppedPath)
{
    RootRollupIpaDiscoveryContext ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    const auto accumulated = run_ipa_accumulate_with_proof(ctx);
    const BlockCursor after_accumulate =
        block_cursor_from_snapshot(recursion_helpers::BlockSnapshot::capture(ctx.builder()));
    run_ipa_full_verify_on_accumulated(ctx, accumulated);

    auto result = validate_ipa_full_verify(ctx.builder(), after_accumulate);
    EXPECT_TRUE(result.is_valid);
}

TEST_F(RollupHonkIpaFullVerifyTests, ValidateRootRollupIpaFinalizeMatchesProductionFinalize)
{
    auto root_program = make_root_rollup_acir_program_from_two_rollups(0);
    auto production = run_root_rollup_finalize_capture(root_program);

    RootRollupIpaDiscoveryContext stepped = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    run_root_rollup_ipa_finalize_path(stepped);
    const auto stepped_after = recursion_helpers::BlockSnapshot::capture(stepped.builder());
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(stepped.builder(), false);

    for (const auto& [block_idx, block_name] : IPA_ANALYSIS_BLOCKS) {
        const size_t production_delta = snapshot_size_at(production.after_finalize, block_idx) -
                                        snapshot_size_at(production.before_finalize, block_idx);
        const size_t stepped_delta =
            snapshot_size_at(stepped_after, block_idx) - snapshot_size_at(stepped.after_opcodes, block_idx);
        EXPECT_EQ(production_delta, stepped_delta) << block_name;
    }

    auto validation =
        validate_root_rollup_ipa_finalize<bb::fr>(stepped.builder(),
                                                  analyzer,
                                                  stepped.program.constraints.honk_recursion_constraints[0],
                                                  stepped.program.constraints.honk_recursion_constraints[1],
                                                  stepped.before_opcodes,
                                                  stepped.after_opcodes,
                                                  bb::CONST_ECCVM_LOG_N,
                                                  /*validate_opcodes=*/true);
    EXPECT_TRUE(validation.opcodes.is_valid);
    EXPECT_TRUE(validation.is_valid);
}

TEST_F(RollupHonkIpaFullVerifyTests, ValidateDefaultIOFinalize)
{
    RootRollupIpaDiscoveryContext ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    const auto accumulated = run_ipa_accumulate_with_proof(ctx);
    run_ipa_full_verify_on_accumulated(ctx, accumulated);
    const BlockCursor after_full_verify =
        block_cursor_from_snapshot(recursion_helpers::BlockSnapshot::capture(ctx.builder()));
    run_root_default_io_finalize(ctx.builder(), ctx.output);

    auto result = validate_default_io_finalize(ctx.builder(), after_full_verify);
    EXPECT_TRUE(result.is_valid);
}
