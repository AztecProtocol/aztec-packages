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
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/common/google_bb_bench.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
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
 * @brief Benchmark reduce_to_ipa_claim only (all non-IPA verification: MegaZK + databus + Goblin).
 * This is the per-proof cost in the batch pipeline (parallelized across cores).
 */
BENCHMARK_DEFINE_F(ChonkBench, ReduceToIPAClaim)(benchmark::State& state)
{
    auto precomputed_vks = precompute_vks(1);
    auto [proof, vk_and_hash] = accumulate_and_prove_with_precomputed_vks(1, precomputed_vks);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        ChonkNativeVerifier verifier(vk_and_hash);
        benchmark::DoNotOptimize(verifier.reduce_to_ipa_claim(proof));
    }
}

/**
 * @brief Benchmark a single IPA reduce_verify (the MSM-heavy part).
 * This isolates the IPA cost that gets amortized by batching.
 */
BENCHMARK_DEFINE_F(ChonkBench, IPAVerifySingle)(benchmark::State& state)
{
    auto precomputed_vks = precompute_vks(1);
    auto [proof, vk_and_hash] = accumulate_and_prove_with_precomputed_vks(1, precomputed_vks);

    ChonkNativeVerifier verifier(vk_and_hash);
    auto reduction = verifier.reduce_to_ipa_claim(proof);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        auto ipa_transcript = std::make_shared<NativeTranscript>(reduction.ipa_proof);
        auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
        benchmark::DoNotOptimize(IPA<curve::Grumpkin>::reduce_verify(ipa_vk, reduction.ipa_claim, ipa_transcript));
    }
}

/**
 * @brief Benchmark batch IPA verification only (batch_reduce_verify with N cached claims).
 * Measures the batched MSM cost that replaces N individual IPA verifications.
 */
BENCHMARK_DEFINE_F(ChonkBench, BatchIPAOnly)(benchmark::State& state)
{
    const size_t num_proofs = static_cast<size_t>(state.range(0));
    auto precomputed_vks = precompute_vks(1);
    auto [proof, vk_and_hash] = accumulate_and_prove_with_precomputed_vks(1, precomputed_vks);

    // Pre-compute N IPA claims
    std::vector<OpeningClaim<curve::Grumpkin>> claims;
    std::vector<HonkProof> ipa_proofs;
    claims.reserve(num_proofs);
    ipa_proofs.reserve(num_proofs);
    for (size_t i = 0; i < num_proofs; i++) {
        ChonkNativeVerifier v(vk_and_hash);
        auto reduction = v.reduce_to_ipa_claim(proof);
        claims.push_back(std::move(reduction.ipa_claim));
        ipa_proofs.push_back(std::move(reduction.ipa_proof));
    }

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        std::vector<std::shared_ptr<NativeTranscript>> transcripts;
        transcripts.reserve(num_proofs);
        for (size_t i = 0; i < num_proofs; i++) {
            transcripts.push_back(std::make_shared<NativeTranscript>(ipa_proofs[i]));
        }
        auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
        benchmark::DoNotOptimize(IPA<curve::Grumpkin>::batch_reduce_verify(ipa_vk, claims, transcripts));
    }
}

/**
 * @brief Benchmark the async batch verifier service with parameterized proof count and core count.
 * Args: range(0) = num_proofs, range(1) = num_cores
 */
BENCHMARK_DEFINE_F(ChonkBench, BatchVerifyService)(benchmark::State& state)
{
    const size_t num_proofs = static_cast<size_t>(state.range(0));
    const uint32_t num_cores = static_cast<uint32_t>(state.range(1));
    auto precomputed_vks = precompute_vks(1);

    auto [proof, vk_and_hash] = accumulate_and_prove_with_precomputed_vks(1, precomputed_vks);

    for (auto _ : state) {
        std::mutex mtx;
        std::condition_variable cv;
        std::vector<VerifyResult> results;
        results.reserve(num_proofs);

        ChonkBatchVerifier verifier;
        verifier.start({ vk_and_hash },
                       num_cores,
                       /*batch_size=*/8,
                       [&](VerifyResult r) {
                           std::lock_guard lock(mtx);
                           results.push_back(std::move(r));
                           cv.notify_one();
                       });

        for (size_t i = 0; i < num_proofs; i++) {
            verifier.enqueue(VerifyRequest{ .request_id = i, .vk_index = 0, .proof = proof });
        }

        {
            std::unique_lock lock(mtx);
            cv.wait(lock, [&] { return results.size() >= num_proofs; });
        }
        verifier.stop();

        benchmark::DoNotOptimize(results);
    }
}

#define ARGS Arg(ChonkBench::NUM_ITERATIONS_MEDIUM_COMPLEXITY)->Arg(2)

BENCHMARK_REGISTER_F(ChonkBench, Full)->Unit(benchmark::kMillisecond)->ARGS;
BENCHMARK_REGISTER_F(ChonkBench, VerificationOnly)->Unit(benchmark::kMillisecond);
BENCHMARK_REGISTER_F(ChonkBench, ProofCompress)->Unit(benchmark::kMillisecond);
BENCHMARK_REGISTER_F(ChonkBench, ProofDecompress)->Unit(benchmark::kMillisecond);
BENCHMARK_REGISTER_F(ChonkBench, ReduceToIPAClaim)->Unit(benchmark::kMillisecond);
BENCHMARK_REGISTER_F(ChonkBench, IPAVerifySingle)->Unit(benchmark::kMillisecond);
BENCHMARK_REGISTER_F(ChonkBench, VerifyIndividual)->Unit(benchmark::kMillisecond)->Arg(1)->Arg(2)->Arg(4)->Arg(8);
BENCHMARK_REGISTER_F(ChonkBench, BatchIPAOnly)
    ->Unit(benchmark::kMillisecond)
    ->Arg(1)
    ->Arg(2)
    ->Arg(4)
    ->Arg(8)
    ->Arg(16)
    ->Arg(32)
    ->Arg(64)
    ->Arg(120);
// BatchVerifyService: 120 proofs × {4, 8, 12} cores
BENCHMARK_REGISTER_F(ChonkBench, BatchVerifyService)
    ->Unit(benchmark::kMillisecond)
    ->Args({ 120, 4 })
    ->Args({ 120, 8 })
    ->Args({ 120, 12 });

} // namespace

BENCHMARK_MAIN();
