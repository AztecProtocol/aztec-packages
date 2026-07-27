// Mode 1 (Discovery): ROOT_ROLLUP_HONK fast IPA (log_n=12) per-round FunctionFingerprint dump.
//
// Emits root_rollup_honk_ipa_fast_rounds_analysis.txt with separator lines between IPA rounds.
// Build with rollup_honk_recursion_validation_fast_ipa_tests (BB_ROLLUP_HONK_TEST_IPA_LOG_N=12).

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_test_config.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_recursion_test_helpers.hpp"

#include <fstream>
#include <gtest/gtest.h>
#include <sstream>

using namespace bb;
using namespace honk_recursion_test_helpers;
using namespace rollup_honk_test_helpers;

class RollupHonkFastIpaRoundDumpTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(RollupHonkFastIpaRoundDumpTests, RootRollupHonkFastIpaRoundFingerPrintDump)
{
    constexpr size_t IPA_LOG_N = rollup_honk_test_config::TEST_IPA_LOG_N;
    static_assert(IPA_LOG_N == 12, "Fast IPA round dump expects TEST_IPA_LOG_N=12");

    auto ctx = setup_fast_ipa_accumulated_full_verify_context<IPA_LOG_N>(0);
    ASSERT_TRUE(ctx.acir.output.is_root_rollup);

    std::ofstream out("root_rollup_honk_ipa_fast_rounds_analysis.txt");
    ASSERT_TRUE(out.is_open()) << "Failed to open root_rollup_honk_ipa_fast_rounds_analysis.txt";

    std::ostringstream header_extra;
    header_extra << "# ROOT_ROLLUP_HONK fast IPA build: log_n=" << IPA_LOG_N << " (production=" << bb::CONST_ECCVM_LOG_N
                 << ")\n"
                 << "# IPA proof length=" << rollup_honk_test_config::TEST_IPA_PROOF_LENGTH << "\n"
                 << "# Path: ACIR ROOT_ROLLUP opcodes -> fast IPA accumulate -> full_verify_recursive stepped by round\n"
                 << "# Separator lines delimit transcript rounds and G_zero s_vec rounds\n";

    dump_analysis_header(out,
                         "ROOT_ROLLUP_HONK Fast IPA — Per-Round FunctionFingerprint Analysis",
                         "accumulated IPA claim -> full_verify_recursive (log_n=12)",
                         static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N),
                         header_extra.str().c_str());

    out << "After IPA::accumulate baseline\n";
    const auto after_accumulate = recursion_helpers::BlockSnapshot::capture(ctx.builder());
    dump_total_block_counts(out, after_accumulate, "Block totals after accumulate:");
    out << "  ipa_log_n=" << IPA_LOG_N << "\n\n";

    const auto after_full_verify = dump_root_rollup_ipa_full_verify_staged_rounds<IPA_LOG_N>(
        out, ctx.builder(), ctx.accumulated_claim, ctx.accumulated_proof, after_accumulate);

    out.flush();
    EXPECT_GT(total_block_delta(after_accumulate, after_full_verify), 0U);
}

#ifdef BB_ROLLUP_HONK_FAST_IPA_BUILD
TEST_F(RollupHonkFastIpaRoundDumpTests, FastIpaBuildUsesConfiguredLogN)
{
    EXPECT_TRUE(rollup_honk_test_config::FAST_IPA_BUILD);
    EXPECT_EQ(rollup_honk_test_config::TEST_IPA_LOG_N, 12U);
}
#endif
