#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/ultra_bench/mock_circuits.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

using namespace benchmark;
using namespace bb;

/**
 * @brief Benchmark: Construction of a Ultra Honk proof for a circuit determined by the provided circuit function
 */
static void construct_proof_megahonk(State& state, void (*test_circuit_function)(MegaCircuitBuilder&, size_t)) noexcept
{
    size_t num_iterations = 10; // 10x the circuit
    bb::mock_circuits::construct_proof_with_specified_num_iterations<MegaProver>(
        state, test_circuit_function, num_iterations);
}

/**
 * @brief Benchmark: Construction of a Ultra Honk proof with 2**n gates
 */
static void construct_proof_megahonk_power_of_2(State& state) noexcept
{
    auto log2_of_gates = static_cast<size_t>(state.range(0));
    bb::mock_circuits::construct_proof_with_specified_num_iterations<MegaProver>(
        state, &bb::mock_circuits::generate_basic_arithmetic_circuit<MegaCircuitBuilder>, log2_of_gates);
}

static void get_row_power_of_2(State& state) noexcept
{
    auto log2_of_gates = static_cast<size_t>(state.range(0));
    size_t gates = 1 << log2_of_gates;
    MegaFlavor::ProverPolynomials polynomials;
    for (auto& poly : polynomials.get_all()) {
        poly = bb::Polynomial<bb::fr>(gates);
    }
    for (auto _ : state) {
        for (size_t i = 0; i < gates; i++) {
            benchmark::DoNotOptimize(polynomials.get_row(i));
        }
    }
}

/**
 * @brief Benchmark: Mega Honk proof of a single poseidon2 hash over a vector of state.range(0) elements.
 */
static void construct_proof_megahonk_poseidon2_hash(State& state) noexcept
{
    const auto num_inputs = static_cast<size_t>(state.range(0));

    MegaCircuitBuilder builder;
    bb::generate_poseidon2_hash_test_circuit<MegaCircuitBuilder>(builder, num_inputs);
    auto instance = std::make_shared<ProverInstance_<MegaFlavor>>(builder);
    info("construct_proof_megahonk_poseidon2_hash: num_inputs=",
         num_inputs,
         ", actual_gates=",
         builder.num_gates(),
         ", dyadic_size=",
         instance->dyadic_size());

    bb::mock_circuits::construct_proof_with_specified_num_iterations<MegaProver>(
        state, &bb::generate_poseidon2_hash_test_circuit<MegaCircuitBuilder>, num_inputs);
}

// Define benchmarks
// Sweep input sizes so dyadic domain ranges 2^15..2^19 (Mega: ~12 gates/input).
BENCHMARK(construct_proof_megahonk_poseidon2_hash)
    ->Arg(1500)
    ->Arg(3000)
    ->Arg(6000)
    ->Arg(12000)
    ->Arg(24000)
    ->Arg(50000)
    ->Unit(kMillisecond);

// This exists due to an issue where get_row was blowing up in time
BENCHMARK_CAPTURE(construct_proof_megahonk, sha256, &generate_sha256_test_circuit<MegaCircuitBuilder>)
    ->Unit(kMillisecond);
BENCHMARK_CAPTURE(construct_proof_megahonk,
                  ecdsa_verification,
                  &stdlib::generate_ecdsa_verification_test_circuit<MegaCircuitBuilder>)
    ->Unit(kMillisecond);

BENCHMARK(get_row_power_of_2)
    // 2**15 gates to 2**20 gates
    ->DenseRange(15, 20)
    ->Unit(kMillisecond);

BENCHMARK(construct_proof_megahonk_power_of_2)
    // 2**15 gates to 2**20 gates
    ->DenseRange(15, 20)
    ->Unit(kMillisecond);

int main(int argc, char** argv)
{
#if !defined(__wasm__) || defined(ENABLE_WASM_BENCH)
    bb::detail::use_bb_bench = true;
#endif

    ::benchmark::Initialize(&argc, argv);
    if (::benchmark::ReportUnrecognizedArguments(argc, argv))
        return 1;
    ::benchmark::RunSpecifiedBenchmarks();
    ::benchmark::Shutdown();

#if !defined(__wasm__) || defined(ENABLE_WASM_BENCH)
    std::cout << "\n=== Detailed BB_BENCH Profiling Stats ===\n";
    bb::detail::GLOBAL_BENCH_STATS.print_aggregate_counts_hierarchical(std::cout);
#endif

    return 0;
}
