#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/honk_bench/benchmark_utilities.hpp"
#include "barretenberg/honk/composer/ultra_composer.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"

using namespace benchmark;
using namespace proof_system::plonk;

namespace ultra_honk_bench {

using UltraBuilder = proof_system::UltraCircuitBuilder;
using UltraHonk = proof_system::honk::UltraComposer;

// Number of times to perform operation of interest in the benchmark circuits, e.g. # of hashes to perform
constexpr size_t MIN_NUM_ITERATIONS = bench_utils::BenchParams::MIN_NUM_ITERATIONS;
constexpr size_t MAX_NUM_ITERATIONS = bench_utils::BenchParams::MAX_NUM_ITERATIONS;

/**
 * @brief Benchmark: Construction of a Ultra Honk proof for a circuit determined by the provided circuit function
 */
void construct_proof_ultra(State& state, void (*test_circuit_function)(UltraBuilder&, size_t)) noexcept
{
    auto num_iterations = static_cast<size_t>(state.range(0));
    bench_utils::construct_proof_with_specified_num_iterations<UltraHonk>(state, test_circuit_function, num_iterations);
}

// Define benchmarks
BENCHMARK_CAPTURE(construct_proof_ultra, sha256, &bench_utils::generate_sha256_test_circuit<UltraBuilder>)
    ->DenseRange(MIN_NUM_ITERATIONS, MAX_NUM_ITERATIONS)
    ->Unit(::benchmark::kMillisecond);
BENCHMARK_CAPTURE(construct_proof_ultra, keccak, &bench_utils::generate_keccak_test_circuit<UltraBuilder>)
    ->DenseRange(MIN_NUM_ITERATIONS, MAX_NUM_ITERATIONS)
    ->Unit(::benchmark::kMillisecond);
BENCHMARK_CAPTURE(construct_proof_ultra,
                  ecdsa_verification,
                  &bench_utils::generate_ecdsa_verification_test_circuit<UltraBuilder>)
    ->DenseRange(MIN_NUM_ITERATIONS, MAX_NUM_ITERATIONS)
    ->Unit(::benchmark::kMillisecond);
BENCHMARK_CAPTURE(construct_proof_ultra,
                  merkle_membership,
                  &bench_utils::generate_merkle_membership_test_circuit<UltraBuilder>)
    ->DenseRange(MIN_NUM_ITERATIONS, MAX_NUM_ITERATIONS)
    ->Unit(::benchmark::kMillisecond);

BENCHMARK_CAPTURE(construct_proof_ultra,
                  power_of_2_circuits,
                  &bench_utils::generate_basic_arithmetic_circuit<UltraBuilder>)
    ->DenseRange(13, 18)
    ->Unit(::benchmark::kMillisecond);

} // namespace ultra_honk_bench