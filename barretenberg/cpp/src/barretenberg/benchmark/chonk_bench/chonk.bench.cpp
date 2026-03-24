/**
 * @warning These benchmarks use functions that are tested elsewhere to guard against regressions in the benchmark.
 * Please do not anything that is untested.
 */

#include <benchmark/benchmark.h>
#include <chrono>

#include "barretenberg/api/file_io.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/chonk/proof_compression.hpp"
#include "barretenberg/chonk/test_bench_shared.hpp"
#include "barretenberg/common/google_bb_bench.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/srs/global_crs.hpp"

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

#define ARGS Arg(ChonkBench::NUM_ITERATIONS_MEDIUM_COMPLEXITY)->Arg(2)

BENCHMARK_REGISTER_F(ChonkBench, Full)->Unit(benchmark::kMillisecond)->ARGS;
BENCHMARK_REGISTER_F(ChonkBench, VerificationOnly)->Unit(benchmark::kMillisecond);
BENCHMARK_REGISTER_F(ChonkBench, ProofCompress)->Unit(benchmark::kMillisecond);
BENCHMARK_REGISTER_F(ChonkBench, ProofDecompress)->Unit(benchmark::kMillisecond);
BENCHMARK_REGISTER_F(ChonkBench, VerifyIndividual)->Unit(benchmark::kMillisecond)->Arg(1)->Arg(2)->Arg(4)->Arg(8);

/**
 * @brief Benchmark BN254 G1 point decompression (used by SRS compressed download)
 */
void bn254_point_decompression(benchmark::State& state)
{
    constexpr size_t NUM_POINTS = 1 << 17; // 131072 — typical circuit size

    // Read compressed points from disk (32 bytes each, big-endian uint256_t)
    auto compressed_buf = read_file(bb::srs::bb_crs_path() / "bn254_g1_compressed.dat", NUM_POINTS * sizeof(uint256_t));
    std::vector<uint256_t> compressed(NUM_POINTS);
    for (size_t i = 0; i < NUM_POINTS; ++i) {
        compressed[i] = from_buffer<uint256_t>(compressed_buf, i * sizeof(uint256_t));
    }

    for (auto _ : state) {
        std::vector<g1::affine_element> points(NUM_POINTS);
        parallel_for([&](ThreadChunk chunk) {
            for (auto i : chunk.range(NUM_POINTS)) {
                points[i] = g1::affine_element::from_compressed(compressed[i]);
            }
        });
        benchmark::DoNotOptimize(points);
    }
}
BENCHMARK(bn254_point_decompression)->Unit(benchmark::kMillisecond);

} // namespace

BENCHMARK_MAIN();
