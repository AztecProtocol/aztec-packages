#include <cstdlib>
#include <exception>
#include <filesystem>
#include <fstream>
#include <stdexcept>

#include "barretenberg/common/log.hpp"
#include "vm2_contracts/app_tester.hpp"
#include "vm2_contracts/bulk_fixture.hpp"
#include "vm2_contracts/test_executor_metrics.hpp"

// AVM bulk proving benchmark. It fully proves and verifies the single AvmTest bulk_testing tx and
// emits github-action-benchmark metrics to $BENCH_OUTPUT: the simulation metrics (totalDurationMs /
// manaUsed) plus the prover-stage timings, which are read from the `bb::avm2::Stats` registry the AVM
// prover populates (the same mechanism bbapi_avm.cpp uses to surface stats over bb.js).
namespace bb::avm2 {
namespace {

using contracts::AppTester;
using contracts::ProvingMode;
using contracts::TestExecutorMetrics;

// Fails the bench loudly (a benchmark that can't run is a real breakage).
void expect_ok(bool ok)
{
    if (!ok) {
        throw std::runtime_error("bulk proving benchmark scenario reverted / failed");
    }
}

int run()
{
    TestExecutorMetrics metrics("avm/proving");

    // FULL PROVING (not check-circuit). A distinct prefix keeps these metric names from colliding with
    // the apps simulation bench's "AvmTest contract tests" bulk entry.
    AppTester tester(&metrics);
    tester.set_proving_mode(ProvingMode::ProveAndVerify);
    tester.set_metrics_prefix("AVM proven bulk test");
    contracts::bulk_test(tester, expect_ok);

    if (const char* bench_output = std::getenv("BENCH_OUTPUT")) {
        const std::filesystem::path out_path = bench_output;
        if (out_path.has_parent_path()) {
            std::filesystem::create_directories(out_path.parent_path());
        }
        std::ofstream(out_path) << metrics.to_github_action_benchmark_json();
        info("Wrote benchmark output to ", out_path.string());
    }
    info("\n", metrics.to_pretty_string());
    return 0;
}

} // namespace
} // namespace bb::avm2

int main()
{
    try {
        return bb::avm2::run();
    } catch (const std::exception& e) {
        info("AVM bulk proving benchmark failed: ", e.what());
        return 1;
    }
}
