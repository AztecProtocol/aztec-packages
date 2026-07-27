// Mode 2: GZero s_vec rounds folded into full_verify orchestrator; thin wrapper test.

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_full_verify_verification.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_test_config.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_recursion_test_helpers.hpp"

#include <gtest/gtest.h>

using namespace bb;
using namespace honk_recursion_test_helpers;
using namespace rollup_honk_test_helpers;
using namespace RollupHonkIpaAccumulateValidation;
using namespace RollupHonkIpaFullVerifyValidation;

class RollupHonkGZeroSVecValidationTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(RollupHonkGZeroSVecValidationTests, ValidateGZeroSVecViaFullVerifyOrchestrator)
{
    constexpr size_t IPA_LOG_N = rollup_honk_test_config::TEST_IPA_LOG_N;

    auto ctx = setup_fast_ipa_accumulated_full_verify_context<IPA_LOG_N>(0);
    const BlockCursor after_accumulate = block_cursor_from_snapshot(
        recursion_helpers::BlockSnapshot::capture(ctx.builder()));

    using FastIPA = bb::IPA<GrumpkinCurve, IPA_LOG_N>;
    const auto vk = make_grumpkin_ipa_verifier_key<IPA_LOG_N>(ctx.builder());
    auto transcript = make_accumulated_ipa_transcript(ctx.builder(), ctx.accumulated_proof);
    ASSERT_TRUE(FastIPA::full_verify_recursive(vk, ctx.accumulated_claim, transcript));

    auto full_verify = validate_ipa_full_verify(ctx.builder(), after_accumulate, IPA_LOG_N);
    EXPECT_TRUE(full_verify.claim_hash_ok);
    EXPECT_TRUE(full_verify.generator_challenge_ok);
    EXPECT_TRUE(full_verify.transcript_rounds_ok);
    EXPECT_TRUE(full_verify.reduce_finish_msm_ok);
    EXPECT_TRUE(full_verify.gzero_svec_ok);
    EXPECT_TRUE(full_verify.batch_mul_check_ok);
    EXPECT_TRUE(full_verify.aggregate_ok);
    EXPECT_TRUE(full_verify.squeeze_count_ok);
    EXPECT_TRUE(full_verify.cursors_at_end_ok);
    EXPECT_TRUE(full_verify.is_valid);
}
