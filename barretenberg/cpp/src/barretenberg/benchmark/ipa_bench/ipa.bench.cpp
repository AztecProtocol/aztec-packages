#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include <benchmark/benchmark.h>

using namespace benchmark;
using namespace bb;

namespace {
using Curve = curve::Grumpkin;
using Fr = Curve::ScalarField;
using Polynomial = Polynomial<Fr>;

constexpr size_t MIN_POLYNOMIAL_DEGREE_LOG2 = 10;
constexpr size_t MAX_POLYNOMIAL_DEGREE_LOG2 = 16;

CommitmentKey<Curve> ck;
VerifierCommitmentKey<Curve> vk;
std::vector<std::shared_ptr<NativeTranscript>> prover_transcripts(MAX_POLYNOMIAL_DEGREE_LOG2 -
                                                                  MIN_POLYNOMIAL_DEGREE_LOG2 + 1);
std::vector<OpeningClaim<Curve>> opening_claims(MAX_POLYNOMIAL_DEGREE_LOG2 - MIN_POLYNOMIAL_DEGREE_LOG2 + 1);
static void DoSetup(const benchmark::State&)
{
    srs::init_file_crs_factory(srs::bb_crs_path());
    ck = CommitmentKey<Curve>(1 << MAX_POLYNOMIAL_DEGREE_LOG2);
    vk = VerifierCommitmentKey<Curve>(1 << MAX_POLYNOMIAL_DEGREE_LOG2, srs::get_grumpkin_crs_factory());
}

void ipa_open(State& state) noexcept
{
    numeric::RNG& engine = numeric::get_debug_randomness();
    for (auto _ : state) {
        state.PauseTiming();
        size_t n = 1 << static_cast<size_t>(state.range(0));
        // Construct the polynomial
        Polynomial poly(n);
        for (size_t i = 0; i < n; ++i) {
            poly.at(i) = Fr::random_element(&engine);
        }
        auto x = Fr::random_element(&engine);
        auto eval = poly.evaluate(x);
        const OpeningPair<Curve> opening_pair = { x, eval };
        const OpeningClaim<Curve> opening_claim{ opening_pair, ck.commit(poly) };
        // initialize empty prover transcript
        auto prover_transcript = std::make_shared<NativeTranscript>();
        state.ResumeTiming();
        // Compute proof
        IPA<Curve>::compute_opening_proof(ck, { poly, opening_pair }, prover_transcript);
        // Store info for verifier
        prover_transcripts[static_cast<size_t>(state.range(0)) - MIN_POLYNOMIAL_DEGREE_LOG2] = prover_transcript;
        opening_claims[static_cast<size_t>(state.range(0)) - MIN_POLYNOMIAL_DEGREE_LOG2] = opening_claim;
    }
}
void ipa_verify(State& state) noexcept
{
    for (auto _ : state) {
        state.PauseTiming();
        // Retrieve proofs
        auto prover_transcript = prover_transcripts[static_cast<size_t>(state.range(0)) - MIN_POLYNOMIAL_DEGREE_LOG2];
        auto opening_claim = opening_claims[static_cast<size_t>(state.range(0)) - MIN_POLYNOMIAL_DEGREE_LOG2];
        // initialize verifier transcript from proof data
        auto verifier_transcript = std::make_shared<NativeTranscript>(prover_transcript->export_proof());

        state.ResumeTiming();
        auto result = IPA<Curve>::reduce_verify(vk, opening_claim, verifier_transcript);
        BB_ASSERT(result);
    }
}

// Batch verification benchmarks: compare N individual verifications vs one batch verification.
// Uses default IPA poly_length (ECCVM size = 2^17) to match real Chonk usage.

// Pre-generated single proof for batch benchmarks (reused N times to avoid expensive setup)
OpeningClaim<Curve> batch_claim;
HonkProof batch_proof_data_single;

static void DoBatchSetup(const benchmark::State&)
{
    srs::init_file_crs_factory(srs::bb_crs_path());
    static constexpr size_t BENCH_POLY_LENGTH = IPA<Curve>::poly_length;
    static bool initialized = false;
    if (initialized) {
        return;
    }
    initialized = true;

    ck = CommitmentKey<Curve>(BENCH_POLY_LENGTH);
    vk = VerifierCommitmentKey<Curve>(BENCH_POLY_LENGTH, srs::get_grumpkin_crs_factory());

    numeric::RNG& engine = numeric::get_debug_randomness();
    Polynomial poly(BENCH_POLY_LENGTH);
    for (size_t j = 0; j < BENCH_POLY_LENGTH; j++) {
        poly.at(j) = Fr::random_element(&engine);
    }
    auto x = Fr::random_element(&engine);
    auto eval = poly.evaluate(x);
    batch_claim = { { x, eval }, ck.commit(poly) };

    auto pt = std::make_shared<NativeTranscript>();
    IPA<Curve>::compute_opening_proof(ck, { poly, { x, eval } }, pt);
    batch_proof_data_single = pt->export_proof();
}

/**
 * @brief Verify N IPA proofs individually (sequential). Baseline for comparison.
 */
void ipa_verify_individual(State& state) noexcept
{
    const size_t num_proofs = static_cast<size_t>(state.range(0));
    for (auto _ : state) {
        state.PauseTiming();
        // Create fresh verifier transcripts from the same proof data
        std::vector<std::shared_ptr<NativeTranscript>> transcripts(num_proofs);
        for (size_t i = 0; i < num_proofs; i++) {
            transcripts[i] = std::make_shared<NativeTranscript>(batch_proof_data_single);
        }
        state.ResumeTiming();

        for (size_t i = 0; i < num_proofs; i++) {
            auto result = IPA<Curve>::reduce_verify(vk, batch_claim, transcripts[i]);
            BB_ASSERT(result);
        }
    }
}

/**
 * @brief Verify N IPA proofs with batched SRS MSM.
 */
void ipa_batch_verify(State& state) noexcept
{
    const size_t num_proofs = static_cast<size_t>(state.range(0));
    for (auto _ : state) {
        state.PauseTiming();
        std::vector<OpeningClaim<Curve>> claims(num_proofs, batch_claim);
        std::vector<std::shared_ptr<NativeTranscript>> transcripts(num_proofs);
        for (size_t i = 0; i < num_proofs; i++) {
            transcripts[i] = std::make_shared<NativeTranscript>(batch_proof_data_single);
        }
        state.ResumeTiming();

        auto result = IPA<Curve>::batch_reduce_verify(vk, claims, transcripts);
        BB_ASSERT(result);
    }
}

} // namespace
BENCHMARK(ipa_open)
    ->Unit(kMillisecond)
    // IPA<Curve> is compile-time fixed to poly_length = 2^CONST_ECCVM_LOG_N; feeding any other
    // size corrupts the heap (the round loop indexes past the witness). Only the fixed size is valid.
    ->Arg(CONST_ECCVM_LOG_N)
    ->Setup(DoSetup);
BENCHMARK(ipa_verify)
    ->Unit(kMillisecond)
    // IPA<Curve> is compile-time fixed to poly_length = 2^CONST_ECCVM_LOG_N; feeding any other
    // size corrupts the heap (the round loop indexes past the witness). Only the fixed size is valid.
    ->Arg(CONST_ECCVM_LOG_N)
    ->Setup(DoSetup);
BENCHMARK(ipa_verify_individual)->Unit(kMillisecond)->Arg(1)->Arg(2)->Arg(4)->Arg(8)->Setup(DoBatchSetup);
BENCHMARK(ipa_batch_verify)->Unit(kMillisecond)->Arg(1)->Arg(2)->Arg(4)->Arg(8)->Setup(DoBatchSetup);
BENCHMARK_MAIN();
