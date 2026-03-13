/**
 * @warning These benchmarks use functions that are tested elsewhere to guard against regressions in the benchmark.
 * Please do not anything that is untested.
 */

#include <benchmark/benchmark.h>
#include <chrono>
#include <cstdlib>
#include <filesystem>

#include "barretenberg/chonk/chonk_batch_verifier.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/chonk/private_execution_steps.hpp"
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
 * @brief Generate a proof from pinned IVC inputs (realistic transaction circuits).
 *
 * Loads ivc-inputs.msgpack from the first flow folder in the given directory,
 * parses and accumulates the circuits, then proves.
 *
 * @param inputs_dir Directory containing flow subfolders, each with ivc-inputs.msgpack
 * @return Proof and VK pair
 */
std::pair<ChonkProof, std::shared_ptr<MegaZKFlavor::VKAndHash>> generate_proof_from_pinned_inputs(
    const std::filesystem::path& inputs_dir)
{
    // Find the first flow folder containing ivc-inputs.msgpack
    for (const auto& entry : std::filesystem::directory_iterator(inputs_dir)) {
        if (!entry.is_directory()) {
            continue;
        }
        auto msgpack_path = entry.path() / "ivc-inputs.msgpack";
        if (!std::filesystem::exists(msgpack_path)) {
            continue;
        }

        info("Loading pinned inputs from: ", msgpack_path.string());
        PrivateExecutionSteps steps;
        steps.parse(PrivateExecutionStepRaw::load_and_decompress(msgpack_path));

        auto ivc = steps.accumulate();
        auto proof = ivc->prove();
        auto vk_and_hash = ivc->get_hiding_kernel_vk_and_hash();
        return { std::move(proof), std::move(vk_and_hash) };
    }

    throw std::runtime_error("No flow folder with ivc-inputs.msgpack found in " + inputs_dir.string());
}

/**
 * @brief Load proof and VK from pinned inputs or fall back to mock circuits.
 */
std::pair<ChonkProof, std::shared_ptr<MegaZKFlavor::VKAndHash>> load_or_mock_proof()
{
    const char* inputs_dir_env = std::getenv("IVC_INPUTS_DIR"); // NOLINT(concurrency-mt-unsafe)
    if (inputs_dir_env != nullptr && std::filesystem::is_directory(inputs_dir_env)) {
        info("Using pinned inputs from: ", inputs_dir_env);
        return generate_proof_from_pinned_inputs(inputs_dir_env);
    }
    info("IVC_INPUTS_DIR not set or invalid, using mock circuits");
    auto precomputed_vks = precompute_vks(1);
    return accumulate_and_prove_with_precomputed_vks(1, precomputed_vks);
}

/**
 * @brief Benchmark the async batch verifier service with parameterized proof count and core count.
 * Args: range(0) = num_proofs, range(1) = num_cores
 *
 * Set IVC_INPUTS_DIR to a directory of pinned inputs (flow subfolders with ivc-inputs.msgpack)
 * to use realistic transaction proofs. Falls back to mock circuits if unset.
 */
BENCHMARK_DEFINE_F(ChonkBench, BatchVerifyService)(benchmark::State& state)
{
    const size_t num_proofs = static_cast<size_t>(state.range(0));
    const uint32_t num_cores = static_cast<uint32_t>(state.range(1));

    auto [proof, vk_and_hash] = load_or_mock_proof();

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

/**
 * @brief Benchmark batch verifier with a mix of valid and invalid proofs (bisection overhead).
 * Args: range(0) = num_proofs, range(1) = num_cores, range(2) = num_bad_proofs
 *
 * Invalid proofs trigger batch IPA failure → bisection fallback → individual IPA re-verify.
 * This measures the worst-case overhead when some proofs in a batch are corrupted.
 */
BENCHMARK_DEFINE_F(ChonkBench, BatchVerifyServiceMixed)(benchmark::State& state)
{
    BB_DISABLE_ASSERTS();

    const size_t num_proofs = static_cast<size_t>(state.range(0));
    const uint32_t num_cores = static_cast<uint32_t>(state.range(1));
    const size_t num_bad = static_cast<size_t>(state.range(2));

    auto [good_proof, vk_and_hash] = load_or_mock_proof();

    // Create a corrupted proof by flipping IPA proof data
    ChonkProof bad_proof = good_proof;
    if (!bad_proof.ipa_proof.empty()) {
        bad_proof.ipa_proof[0] = bad_proof.ipa_proof[0] + bb::fr(1);
    }

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
            // Spread bad proofs evenly: every (num_proofs/num_bad)th proof is bad
            bool is_bad = (num_bad > 0) && (i % (num_proofs / num_bad) == 0) && (i / (num_proofs / num_bad) < num_bad);
            verifier.enqueue(VerifyRequest{ .request_id = i, .vk_index = 0, .proof = is_bad ? bad_proof : good_proof });
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
// BatchVerifyService: 120 proofs × {4, 8, 12, 16} cores (all valid)
BENCHMARK_REGISTER_F(ChonkBench, BatchVerifyService)
    ->Unit(benchmark::kMillisecond)
    ->Args({ 120, 4 })
    ->Args({ 120, 8 })
    ->Args({ 120, 12 })
    ->Args({ 120, 16 });
// BatchVerifyServiceMixed: 120 proofs × 8 cores with {1, 5, 15, 30} bad proofs
BENCHMARK_REGISTER_F(ChonkBench, BatchVerifyServiceMixed)
    ->Unit(benchmark::kMillisecond)
    ->Args({ 120, 8, 1 })
    ->Args({ 120, 8, 5 })
    ->Args({ 120, 8, 15 })
    ->Args({ 120, 8, 30 });

} // namespace

BENCHMARK_MAIN();
