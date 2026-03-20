/**
 * @warning These benchmarks use functions that are tested elsewhere to guard against regressions in the benchmark.
 * Please do not anything that is untested.
 */

#include <benchmark/benchmark.h>
#include <chrono>

#include "barretenberg/chonk/chonk_batch_verifier.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/chonk/proof_compression.hpp"
#include "barretenberg/chonk/test_bench_shared.hpp"
#include "barretenberg/common/google_bb_bench.hpp"
#include "barretenberg/honk/proof_length.hpp"

using namespace benchmark;
using namespace bb;

namespace {

/**
 * @brief Benchmark suite for the aztec Chonk scheme
 */
class ChonkBench : public benchmark::Fixture {
  public:
    // Number of function circuits to accumulate (based on Zac's target numbers)
    static constexpr size_t NUM_ITERATIONS_MEDIUM_COMPLEXITY = 5;

    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    }
};

/**
 * @brief Benchmark only the verification work for the IVC protocol
 */
BENCHMARK_DEFINE_F(ChonkBench, VerificationOnly)(benchmark::State& state)
{
    size_t NUM_APP_CIRCUITS = 1;
    auto precomputed_vks = precompute_vks(NUM_APP_CIRCUITS);
    auto [proof, vk_and_hash] = accumulate_and_prove_with_precomputed_vks(NUM_APP_CIRCUITS, precomputed_vks);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        ChonkNativeVerifier verifier(vk_and_hash);
        benchmark::DoNotOptimize(verifier.verify(proof));
    }
}

/**
 * @brief Benchmark the prover work for the full IVC protocol
 */
BENCHMARK_DEFINE_F(ChonkBench, Full)(benchmark::State& state)
{
    size_t NUM_APP_CIRCUITS = static_cast<size_t>(state.range(0));
    auto precomputed_vks = precompute_vks(NUM_APP_CIRCUITS);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        accumulate_and_prove_with_precomputed_vks(NUM_APP_CIRCUITS, precomputed_vks);
    }
}

/**
 * @brief Benchmark proof compression (prover-side cost)
 */
BENCHMARK_DEFINE_F(ChonkBench, ProofCompress)(benchmark::State& state)
{
    size_t NUM_APP_CIRCUITS = 1;
    auto precomputed_vks = precompute_vks(NUM_APP_CIRCUITS);
    auto [proof, vk_and_hash] = accumulate_and_prove_with_precomputed_vks(NUM_APP_CIRCUITS, precomputed_vks);

    for (auto _ : state) {
        benchmark::DoNotOptimize(ProofCompressor::compress_chonk_proof(proof));
    }
}

/**
 * @brief Benchmark proof decompression (verifier-side cost)
 */
BENCHMARK_DEFINE_F(ChonkBench, ProofDecompress)(benchmark::State& state)
{
    size_t NUM_APP_CIRCUITS = 1;
    auto precomputed_vks = precompute_vks(NUM_APP_CIRCUITS);
    auto [proof, vk_and_hash] = accumulate_and_prove_with_precomputed_vks(NUM_APP_CIRCUITS, precomputed_vks);

    auto compressed = ProofCompressor::compress_chonk_proof(proof);
    size_t mega_num_pub_inputs =
        proof.hiding_oink_proof.size() - ProofLength::Oink<MegaZKFlavor>::LENGTH_WITHOUT_PUB_INPUTS;

    for (auto _ : state) {
        benchmark::DoNotOptimize(ProofCompressor::decompress_chonk_proof(compressed, mega_num_pub_inputs));
    }
}

/**
 * @brief Benchmark N individual Chonk verifications (sequential). Baseline for batch comparison.
 */
BENCHMARK_DEFINE_F(ChonkBench, VerifyIndividual)(benchmark::State& state)
{
    const size_t num_proofs = static_cast<size_t>(state.range(0));
    auto precomputed_vks = precompute_vks(1);

    // Generate a single proof and reuse it N times
    auto [proof, vk_and_hash] = accumulate_and_prove_with_precomputed_vks(1, precomputed_vks);

    for (auto _ : state) {
        for (size_t i = 0; i < num_proofs; i++) {
            ChonkNativeVerifier verifier(vk_and_hash);
            benchmark::DoNotOptimize(verifier.verify(proof));
        }
    }
}

/**
 * @brief Benchmark batch verification with phase breakdown (reduce vs IPA MSM).
 * range(0) = batch_size, range(1) = num_cores.
 * Reports: wall time, plus custom counters for reduce_ms and ipa_ms from C++ VerifyResult fields.
 */
BENCHMARK_DEFINE_F(ChonkBench, BatchVerify)(benchmark::State& state)
{
    const auto batch_size = static_cast<uint32_t>(state.range(0));
    const auto num_cores = static_cast<uint32_t>(state.range(1));
    auto precomputed_vks = precompute_vks(1);
    auto [proof, vk_and_hash] = accumulate_and_prove_with_precomputed_vks(1, precomputed_vks);

    double total_reduce_ms = 0;
    double total_ipa_ms = 0;
    size_t result_count = 0;

    for (auto _ : state) {
        std::vector<VerifyResult> results;
        std::mutex results_mutex;
        std::condition_variable results_cv;

        ChonkBatchVerifier verifier;
        verifier.start({ vk_and_hash }, num_cores, batch_size, [&](VerifyResult r) {
            std::lock_guard lock(results_mutex);
            results.push_back(std::move(r));
            results_cv.notify_one();
        });

        for (uint32_t i = 0; i < batch_size; ++i) {
            verifier.enqueue(VerifyRequest{
                .request_id = i, .vk_index = 0, .proof = proof // copy each time
            });
        }

        {
            std::unique_lock lock(results_mutex);
            results_cv.wait(lock, [&] { return results.size() >= batch_size; });
        }
        verifier.stop();

        // Accumulate phase timings
        for (const auto& r : results) {
            total_reduce_ms += r.reduce_ms;
            total_ipa_ms += r.ipa_ms;
            result_count++;
        }
    }

    // Report phase breakdown as custom counters
    if (result_count > 0) {
        state.counters["avg_reduce_ms"] = total_reduce_ms / static_cast<double>(result_count);
        state.counters["ipa_ms"] = total_ipa_ms / static_cast<double>(result_count);
    }
}

#define ARGS Arg(ChonkBench::NUM_ITERATIONS_MEDIUM_COMPLEXITY)->Arg(2)

BENCHMARK_REGISTER_F(ChonkBench, Full)->Unit(benchmark::kMillisecond)->ARGS;
BENCHMARK_REGISTER_F(ChonkBench, VerificationOnly)->Unit(benchmark::kMillisecond);
BENCHMARK_REGISTER_F(ChonkBench, ProofCompress)->Unit(benchmark::kMillisecond);
BENCHMARK_REGISTER_F(ChonkBench, ProofDecompress)->Unit(benchmark::kMillisecond);
BENCHMARK_REGISTER_F(ChonkBench, VerifyIndividual)->Unit(benchmark::kMillisecond)->Arg(1)->Arg(2)->Arg(4)->Arg(8);
// BatchVerify: sweep batch_size x cores
// clang-format off
BENCHMARK_REGISTER_F(ChonkBench, BatchVerify)->Unit(benchmark::kMillisecond)
    ->Args({1, 1})->Args({1, 2})->Args({1, 4})->Args({1, 6})->Args({1, 8})
    ->Args({4, 1})->Args({4, 2})->Args({4, 4})->Args({4, 6})->Args({4, 8})
    ->Args({8, 1})->Args({8, 2})->Args({8, 4})->Args({8, 6})->Args({8, 8})
    ->Args({16, 1})->Args({16, 2})->Args({16, 4})->Args({16, 6})->Args({16, 8})
    ->Iterations(1);
// clang-format on

} // namespace

BENCHMARK_MAIN();
