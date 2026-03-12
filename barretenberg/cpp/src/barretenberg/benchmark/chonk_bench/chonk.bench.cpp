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
    size_t mega_num_pub_inputs = proof.mega_proof.size() - ChonkProof::HIDING_KERNEL_PROOF_LENGTH_WITHOUT_PUBLIC_INPUTS;

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
 * @brief Benchmark batch verification of N Chonk proofs (single SRS MSM).
 */
BENCHMARK_DEFINE_F(ChonkBench, BatchVerify)(benchmark::State& state)
{
    const size_t num_proofs = static_cast<size_t>(state.range(0));
    auto precomputed_vks = precompute_vks(1);

    // Generate a single proof and reuse it N times
    auto [proof, vk_and_hash] = accumulate_and_prove_with_precomputed_vks(1, precomputed_vks);
    std::vector<ChonkBatchVerifier::Input> inputs(num_proofs);
    for (size_t i = 0; i < num_proofs; i++) {
        inputs[i] = { proof, vk_and_hash };
    }

    for (auto _ : state) {
        benchmark::DoNotOptimize(ChonkBatchVerifier::verify(inputs));
    }
}

#define ARGS Arg(ChonkBench::NUM_ITERATIONS_MEDIUM_COMPLEXITY)->Arg(2)

BENCHMARK_REGISTER_F(ChonkBench, Full)->Unit(benchmark::kMillisecond)->ARGS;
BENCHMARK_REGISTER_F(ChonkBench, VerificationOnly)->Unit(benchmark::kMillisecond);
BENCHMARK_REGISTER_F(ChonkBench, ProofCompress)->Unit(benchmark::kMillisecond);
BENCHMARK_REGISTER_F(ChonkBench, ProofDecompress)->Unit(benchmark::kMillisecond);
BENCHMARK_REGISTER_F(ChonkBench, VerifyIndividual)->Unit(benchmark::kMillisecond)->Arg(1)->Arg(2)->Arg(4)->Arg(8);
BENCHMARK_REGISTER_F(ChonkBench, BatchVerify)->Unit(benchmark::kMillisecond)->Arg(1)->Arg(2)->Arg(4)->Arg(8);

} // namespace

BENCHMARK_MAIN();
