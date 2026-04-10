/**
 * @brief Benchmarks for the split Chonk scheme: proving Chonk_B + Chonk_G instead of one large ChonkProof.
 *
 * @details The split approach replaces a single ChonkProof (~1330 FE) with two smaller proofs
 * (Chonk_B ~477 FE + Chonk_G ~480 FE + IPA 64 FE ≈ 1021 FE) that are much cheaper to verify
 * recursively. This benchmark measures the client-side cost of split proving.
 */
#include <benchmark/benchmark.h>

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/chonk/split/split_chonk_prover.hpp"
#include "barretenberg/chonk/split/split_chonk_verifier.hpp"
#include "barretenberg/common/google_bb_bench.hpp"

using namespace benchmark;
using namespace bb;

namespace {

class SplitChonkBench : public benchmark::Fixture {
  public:
    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    }
};

/**
 * @brief Benchmark the split proving: IVC accumulation + split proof generation.
 */
BENCHMARK_DEFINE_F(SplitChonkBench, SplitProving)(benchmark::State& state)
{
    size_t NUM_APP_CIRCUITS = 1;

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);

        // IVC accumulation
        PrivateFunctionExecutionMockCircuitProducer circuit_producer(NUM_APP_CIRCUITS);
        const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
        Chonk ivc{ NUM_CIRCUITS };

        for (size_t i = 0; i < NUM_CIRCUITS; ++i) {
            auto circuit = circuit_producer.create_next_circuit(ivc);
            auto vk = PrivateFunctionExecutionMockCircuitProducer::get_verification_key(circuit);
            ivc.accumulate(circuit, vk);
        }

        // Split proving
        auto split_proof = SplitChonkProver::prove(ivc);

        // Report sizes
        state.counters["chonk_b_proof_FE"] = static_cast<double>(split_proof.chonk_b_proof.size());
        state.counters["chonk_g_proof_FE"] = static_cast<double>(split_proof.chonk_g_proof.size());
        state.counters["ipa_proof_FE"] = static_cast<double>(split_proof.ipa_proof.size());
        state.counters["total_FE"] = static_cast<double>(split_proof.total_proof_size());
    }
}

/**
 * @brief Benchmark split verification (verifying both proofs).
 */
BENCHMARK_DEFINE_F(SplitChonkBench, SplitVerification)(benchmark::State& state)
{
    size_t NUM_APP_CIRCUITS = 1;

    // Pre-generate split proof
    PrivateFunctionExecutionMockCircuitProducer circuit_producer(NUM_APP_CIRCUITS);
    const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
    Chonk ivc{ NUM_CIRCUITS };

    for (size_t i = 0; i < NUM_CIRCUITS; ++i) {
        auto circuit = circuit_producer.create_next_circuit(ivc);
        auto vk = PrivateFunctionExecutionMockCircuitProducer::get_verification_key(circuit);
        ivc.accumulate(circuit, vk);
    }

    auto split_proof = SplitChonkProver::prove(ivc);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        auto result = SplitChonkVerifier::verify_split_proof(split_proof);
        benchmark::DoNotOptimize(result.all_checks_passed);
    }
}

BENCHMARK_REGISTER_F(SplitChonkBench, SplitProving)->Unit(benchmark::kMillisecond);
BENCHMARK_REGISTER_F(SplitChonkBench, SplitVerification)->Unit(benchmark::kMillisecond);

} // namespace

BENCHMARK_MAIN();
