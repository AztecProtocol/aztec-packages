// Mode 2: stepped IPA full_verify validation (fast IPA log_n=12).

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_finalize_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_test_config.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_recursion_test_helpers.hpp"

#include <gtest/gtest.h>

using namespace bb;
using namespace honk_recursion_test_helpers;
using namespace rollup_honk_test_helpers;
using namespace RollupHonkIpaAccumulateValidation;
using namespace RollupHonkIpaFullVerifyValidation;
using namespace RollupHonkIpaFinalizeValidation;
using namespace RollupHonkRootOpcodesValidation;

class RollupHonkIpaFullVerifyFastValidationTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(RollupHonkIpaFullVerifyFastValidationTests, ValidateIpaFullVerifySteppedFastLogN)
{
    constexpr size_t IPA_LOG_N = rollup_honk_test_config::TEST_IPA_LOG_N;
    static_assert(IPA_LOG_N == 12, "Stepped full verify validation expects log_n=12");

    auto ctx = setup_fast_ipa_accumulated_full_verify_context<IPA_LOG_N>(0);
    Builder& builder = ctx.builder();

    const BlockCursor after_accumulate = RollupHonkIpaAccumulateValidation::block_cursor_from_snapshot(
        recursion_helpers::BlockSnapshot::capture(builder));

    using FastIPA = bb::IPA<GrumpkinCurve, IPA_LOG_N>;
    const auto vk = make_grumpkin_ipa_verifier_key<IPA_LOG_N>(builder);
    auto transcript = make_accumulated_ipa_transcript(builder, ctx.accumulated_proof);
    ASSERT_TRUE(FastIPA::full_verify_recursive(vk, ctx.accumulated_claim, transcript));

    auto result = validate_ipa_full_verify(builder, after_accumulate, IPA_LOG_N);
    EXPECT_TRUE(result.claim_hash_ok);
    EXPECT_TRUE(result.generator_challenge_ok);
    EXPECT_TRUE(result.transcript_rounds_ok);
    EXPECT_TRUE(result.reduce_finish_msm_ok);
    EXPECT_TRUE(result.gzero_svec_ok);
    EXPECT_TRUE(result.batch_mul_check_ok);
    EXPECT_TRUE(result.aggregate_ok);
    EXPECT_TRUE(result.squeeze_count_ok) << "squeeze_count="
                                         << recursion_helpers::find_all_transcript_squeeze_gates(builder).size();
    EXPECT_TRUE(result.cursors_at_end_ok);
    EXPECT_TRUE(result.is_valid);
}

TEST_F(RollupHonkIpaFullVerifyFastValidationTests, ValidateRootRollupOpcodes)
{
    auto ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(ctx.builder(), false);
    BlockCursor cursor = RollupHonkIpaAccumulateValidation::block_cursor_from_snapshot(ctx.before_opcodes);
    auto result = RollupHonkRootOpcodesValidation::validate_root_rollup_opcodes<bb::fr>(
        ctx.builder(),
        analyzer,
        ctx.program.constraints.honk_recursion_constraints[0],
        ctx.program.constraints.honk_recursion_constraints[1],
        cursor,
        ctx.after_opcodes);
    EXPECT_TRUE(result.opcode0_ok);
    EXPECT_TRUE(result.opcode1_ok);
    EXPECT_TRUE(result.aggregate_ok);
    EXPECT_TRUE(result.cursors_at_end_ok);
    EXPECT_TRUE(result.entry_anchors_ok);
    EXPECT_TRUE(result.is_valid);
}

// Negative: proves the witness cross-check (`entry_anchors_ok`) is not vacuously true. Feeds a
// constraint whose key[3] (the VkDeserialize anchor witness) has been swapped for key_hash --
// per `RootRollupVkDeserializeValidationTests.NonKeyWitnessesAreOutsideRegion`, key_hash has NO
// arithmetic gate inside the VkDeserialize region, so `validate_vk_deserialize_region` (and thus
// `entry_anchors_ok`) must fail to discover a region at all. No circuit gates are touched -- only
// the constraint struct copy passed into the validator -- so opcode0_ok/aggregate_ok/etc, which
// scan the real (untouched) gates, must remain true, proving this check is genuinely independent.
TEST_F(RollupHonkIpaFullVerifyFastValidationTests, ValidateRootRollupOpcodesRejectsBadEntryAnchorWitness)
{
    auto ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(ctx.builder(), false);
    BlockCursor cursor = RollupHonkIpaAccumulateValidation::block_cursor_from_snapshot(ctx.before_opcodes);

    auto tampered_constraint0 = ctx.program.constraints.honk_recursion_constraints[0];
    ASSERT_GT(tampered_constraint0.key.size(), 3U);
    tampered_constraint0.key[3] = tampered_constraint0.key_hash;

    auto result = RollupHonkRootOpcodesValidation::validate_root_rollup_opcodes<bb::fr>(
        ctx.builder(),
        analyzer,
        tampered_constraint0,
        ctx.program.constraints.honk_recursion_constraints[1],
        cursor,
        ctx.after_opcodes);
    EXPECT_TRUE(result.opcode0_ok);
    EXPECT_TRUE(result.opcode1_ok);
    EXPECT_TRUE(result.aggregate_ok);
    EXPECT_TRUE(result.cursors_at_end_ok);
    EXPECT_FALSE(result.entry_anchors_ok);
    EXPECT_FALSE(result.is_valid);
}

TEST_F(RollupHonkIpaFullVerifyFastValidationTests, ValidateRootRollupIpaFinalizeFastLogN)
{
    constexpr size_t IPA_LOG_N = rollup_honk_test_config::TEST_IPA_LOG_N;
    auto ctx = setup_fast_ipa_accumulated_full_verify_context<IPA_LOG_N>(0);
    const BlockCursor after_accumulate =
        RollupHonkIpaAccumulateValidation::block_cursor_from_snapshot(
            recursion_helpers::BlockSnapshot::capture(ctx.builder()));

    using FastIPA = bb::IPA<GrumpkinCurve, IPA_LOG_N>;
    const auto vk = make_grumpkin_ipa_verifier_key<IPA_LOG_N>(ctx.builder());
    auto transcript = make_accumulated_ipa_transcript(ctx.builder(), ctx.accumulated_proof);
    ASSERT_TRUE(FastIPA::full_verify_recursive(vk, ctx.accumulated_claim, transcript));
    run_root_default_io_finalize(ctx.builder(), ctx.acir.output);

    cdg::StaticAnalyzer_<bb::fr, Builder> analyzer(ctx.acir.builder(), false);
    auto result = validate_root_rollup_ipa_finalize<bb::fr>(
        ctx.acir.builder(),
        analyzer,
        ctx.acir.program.constraints.honk_recursion_constraints[0],
        ctx.acir.program.constraints.honk_recursion_constraints[1],
        ctx.acir.before_opcodes,
        ctx.acir.after_opcodes,
        IPA_LOG_N,
        /*validate_opcodes=*/true,
        &after_accumulate);
    EXPECT_TRUE(result.opcodes.is_valid);
    EXPECT_TRUE(result.full_verify.is_valid);
    EXPECT_TRUE(result.full_verify.gzero_svec_ok);
    EXPECT_TRUE(result.default_io.is_valid);
    EXPECT_TRUE(result.is_valid);
}
