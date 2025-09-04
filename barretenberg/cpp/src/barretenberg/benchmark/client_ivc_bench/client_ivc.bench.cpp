/**
 * @warning These benchmarks use functions that are tested elsewhere to guard against regressions in the benchmark.
 * Please do not anything that is untested.
 */

#include <benchmark/benchmark.h>

#include "barretenberg/client_ivc/test_bench_shared.hpp"
#include "barretenberg/common/google_bb_bench.hpp"

using namespace benchmark;
using namespace bb;

namespace {

/**
 * @brief Benchmark suite for the aztec client PG-Goblin IVC scheme
 */
class ClientIVCBench : public benchmark::Fixture {
  public:
    // Number of function circuits to accumulate (based on Zac's target numbers)
    static constexpr size_t NUM_ITERATIONS_MEDIUM_COMPLEXITY = 5;

    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    }
};

/**
 * @brief Benchmark only the verification work for the PG-Goblin IVC protocol
 */
BENCHMARK_DEFINE_F(ClientIVCBench, VerificationOnly)(benchmark::State& state)
{
    size_t NUM_APP_CIRCUITS = 1;
    auto precomputed_vks = precompute_vks(NUM_APP_CIRCUITS);
    auto [proof, vk] = accumulate_and_prove_ivc_with_precomputed_vks(NUM_APP_CIRCUITS, precomputed_vks);

    for (auto _ : state) {
        benchmark::DoNotOptimize(ClientIVC::verify(proof, vk));
    }
}

/**
 * @brief Benchmark the prover work for the full PG-Goblin IVC protocol
 */
BENCHMARK_DEFINE_F(ClientIVCBench, Full)(benchmark::State& state)
{
    size_t NUM_APP_CIRCUITS = static_cast<size_t>(state.range(0));
    auto precomputed_vks = precompute_vks(NUM_APP_CIRCUITS);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        accumulate_and_prove_ivc_with_precomputed_vks(NUM_APP_CIRCUITS, precomputed_vks);
    }
}

#define ARGS Arg(ClientIVCBench::NUM_ITERATIONS_MEDIUM_COMPLEXITY)->Arg(2)

BENCHMARK_REGISTER_F(ClientIVCBench, Full)->Unit(benchmark::kMillisecond)->ARGS;
BENCHMARK_REGISTER_F(ClientIVCBench, VerificationOnly)->Unit(benchmark::kMillisecond);

} // namespace

BENCHMARK_MAIN();
