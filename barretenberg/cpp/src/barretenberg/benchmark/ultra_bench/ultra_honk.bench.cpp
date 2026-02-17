#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/ultra_bench/mock_circuits.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

using namespace benchmark;
using namespace bb;

/**
 * @brief Benchmark: Construction of a Ultra Honk proof for a circuit determined by the provided circuit function
 */
static void construct_proof_ultrahonk(State& state,
                                      void (*test_circuit_function)(UltraCircuitBuilder&, size_t)) noexcept
{
    size_t num_iterations = 10; // 10x the circuit
    bb::mock_circuits::construct_proof_with_specified_num_iterations<UltraProver>(
        state, test_circuit_function, num_iterations);
}

/**
 * @brief Benchmark: Construction of a Ultra Honk proof with 2**n gates
 */
static void construct_proof_ultrahonk_power_of_2(State& state) noexcept
{
    auto log2_of_gates = static_cast<size_t>(state.range(0));
    bb::mock_circuits::construct_proof_with_specified_num_iterations<UltraProver>(
        state, &bb::mock_circuits::generate_basic_arithmetic_circuit<UltraCircuitBuilder>, log2_of_gates);
}

/**
 * @brief Benchmark: Construction of a Ultra Honk ZK proof with 2**n gates
 */
static void construct_proof_ultrahonk_zk_power_of_2(State& state) noexcept
{
    auto log2_of_gates = static_cast<size_t>(state.range(0));
    bb::mock_circuits::construct_proof_with_specified_num_iterations<UltraZKProver>(
        state, &bb::mock_circuits::generate_basic_arithmetic_circuit<UltraCircuitBuilder>, log2_of_gates);
}

/**
 * @brief Benchmark: Ultra Honk proof with ~1M gates that rounds to dyadic circuit size 2^20
 * Actual gates: ~1,047,000 → Dyadic size: 2^20 = 1,048,576
 */
static void construct_proof_ultrahonk_1M_gates_dyadic_2_20(State& state) noexcept
{
    // Target just below 2^20 so that after finalization it rounds to exactly 2^20
    size_t num_gates = (1 << 20) - 1000; // ~1,047,576 gates

    // Verify actual dyadic size
    UltraCircuitBuilder builder;
    bb::mock_circuits::generate_basic_arithmetic_circuit_with_target_gates<UltraCircuitBuilder>(builder, num_gates);
    auto instance = std::make_shared<ProverInstance_<UltraFlavor>>(builder);
    size_t dyadic_size = instance->dyadic_size();
    info("construct_proof_ultrahonk_1M_gates_dyadic_2_20: requested=",
         num_gates,
         ", actual_gates=",
         builder.num_gates(),
         ", dyadic_size=",
         dyadic_size);

    bb::mock_circuits::construct_proof_with_specified_num_iterations<UltraProver>(
        state, &bb::mock_circuits::generate_basic_arithmetic_circuit_with_target_gates<UltraCircuitBuilder>, num_gates);
}

/**
 * @brief Benchmark: Ultra Honk proof with ~1M gates that rounds to dyadic circuit size 2^21
 * Actual gates: ~1,050,000 → Dyadic size: 2^21 = 2,097,152
 */
static void construct_proof_ultrahonk_1M_gates_dyadic_2_21(State& state) noexcept
{
    // Target above 2^20 so that after finalization it rounds to 2^21
    size_t num_gates = (1 << 20) + 1000; // ~1,049,576 gates

    // Verify actual dyadic size
    UltraCircuitBuilder builder;
    bb::mock_circuits::generate_basic_arithmetic_circuit_with_target_gates<UltraCircuitBuilder>(builder, num_gates);
    auto instance = std::make_shared<ProverInstance_<UltraFlavor>>(builder);
    size_t dyadic_size = instance->dyadic_size();
    info("construct_proof_ultrahonk_1M_gates_dyadic_2_21: requested=",
         num_gates,
         ", actual_gates=",
         builder.num_gates(),
         ", dyadic_size=",
         dyadic_size);

    bb::mock_circuits::construct_proof_with_specified_num_iterations<UltraProver>(
        state, &bb::mock_circuits::generate_basic_arithmetic_circuit_with_target_gates<UltraCircuitBuilder>, num_gates);
}

// Define benchmarks
BENCHMARK_CAPTURE(construct_proof_ultrahonk, sha256, &generate_sha256_test_circuit<UltraCircuitBuilder>)
    ->Unit(kMillisecond);
BENCHMARK_CAPTURE(construct_proof_ultrahonk,
                  ecdsa_verification,
                  &stdlib::generate_ecdsa_verification_test_circuit<UltraCircuitBuilder>)
    ->Unit(kMillisecond);

BENCHMARK(construct_proof_ultrahonk_power_of_2)
    // 2**15 gates to 2**20 gates
    ->DenseRange(15, 20)
    ->Unit(kMillisecond);

BENCHMARK(construct_proof_ultrahonk_zk_power_of_2)
    // 2**15 gates to 2**20 gates
    ->DenseRange(15, 20)
    ->Unit(kMillisecond);

BENCHMARK(construct_proof_ultrahonk_1M_gates_dyadic_2_20)->Unit(kMillisecond);
BENCHMARK(construct_proof_ultrahonk_1M_gates_dyadic_2_21)->Unit(kMillisecond);

int main(int argc, char** argv)
{
    // Enable BB_BENCH profiling
    bb::detail::use_bb_bench = true;

    // Run benchmarks
    ::benchmark::Initialize(&argc, argv);
    if (::benchmark::ReportUnrecognizedArguments(argc, argv))
        return 1;
    ::benchmark::RunSpecifiedBenchmarks();
    ::benchmark::Shutdown();

    // Print detailed profiling stats
    std::cout << "\n=== Detailed BB_BENCH Profiling Stats ===\n";
    bb::detail::GLOBAL_BENCH_STATS.print_aggregate_counts_hierarchical(std::cout);

    return 0;
}
