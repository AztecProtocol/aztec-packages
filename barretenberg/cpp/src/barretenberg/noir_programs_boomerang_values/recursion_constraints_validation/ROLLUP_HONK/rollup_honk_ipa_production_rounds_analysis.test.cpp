// Mode 1 (Discovery): ROOT_ROLLUP_HONK production IPA (log_n=15) per-round FunctionFingerprint dump.
//
// Emits root_rollup_honk_ipa_production_rounds_analysis.txt — covers transcript rounds 12-14
// missing from the fast log_n=12 artifact.

#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_ipa_test_config.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_validation/ROLLUP_HONK/rollup_honk_recursion_test_helpers.hpp"

#include <fstream>
#include <gtest/gtest.h>
#include <sstream>

using namespace bb;
using namespace honk_recursion_test_helpers;
using namespace rollup_honk_test_helpers;

class RollupHonkProductionIpaRoundDumpTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(RollupHonkProductionIpaRoundDumpTests, RootRollupHonkProductionIpaRoundFingerPrintDump)
{
    constexpr size_t IPA_LOG_N = rollup_honk_test_config::PRODUCTION_IPA_LOG_N;
    static_assert(IPA_LOG_N == bb::CONST_ECCVM_LOG_N, "Production dump expects CONST_ECCVM_LOG_N");

    auto ctx = setup_root_rollup_ipa_discovery(0, /*use_valid_proof=*/true);
    ASSERT_TRUE(ctx.output.is_root_rollup);
    const auto accumulated = run_ipa_accumulate_with_proof(ctx);
    const auto after_accumulate = recursion_helpers::BlockSnapshot::capture(ctx.builder());

    std::ofstream out("root_rollup_honk_ipa_production_rounds_analysis.txt");
    ASSERT_TRUE(out.is_open()) << "Failed to open root_rollup_honk_ipa_production_rounds_analysis.txt";

    std::ostringstream header_extra;
    header_extra << "# ROOT_ROLLUP_HONK production IPA build: log_n=" << IPA_LOG_N << "\n"
                 << "# Path: ACIR opcodes -> IPA::accumulate (nested claims) -> full_verify_recursive stepped by round\n"
                 << "# Complements root_rollup_honk_ipa_fast_rounds_analysis.txt (log_n=12)\n";

    dump_analysis_header(out,
                         "ROOT_ROLLUP_HONK Production IPA — Per-Round FunctionFingerprint Analysis",
                         "accumulated IPA claim -> full_verify_recursive (log_n=15)",
                         static_cast<size_t>(NativeFlavor::VIRTUAL_LOG_N),
                         header_extra.str().c_str());

    out << "After IPA::accumulate baseline\n";
    dump_total_block_counts(out, after_accumulate, "Block totals after accumulate:");
    out << "  ipa_log_n=" << IPA_LOG_N << "\n\n";

    const auto after_full_verify = dump_root_rollup_ipa_full_verify_staged_rounds<IPA_LOG_N>(
        out, ctx.builder(), accumulated.claim, accumulated.proof, after_accumulate);

    out.flush();
    EXPECT_GT(total_block_delta(after_accumulate, after_full_verify), 0U);
}
