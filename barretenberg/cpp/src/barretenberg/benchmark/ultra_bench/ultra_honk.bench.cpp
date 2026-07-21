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

/**
 * @brief Benchmark: Ultra Honk proof of a single poseidon2 hash over a vector of state.range(0) elements.
 */
static void construct_proof_ultrahonk_poseidon2_hash(State& state) noexcept
{
    const auto num_inputs = static_cast<size_t>(state.range(0));

    UltraCircuitBuilder builder;
    bb::generate_poseidon2_hash_test_circuit<UltraCircuitBuilder>(builder, num_inputs);
    auto instance = std::make_shared<ProverInstance_<UltraFlavor>>(builder);
    info("construct_proof_ultrahonk_poseidon2_hash: num_inputs=",
         num_inputs,
         ", actual_gates=",
         builder.num_gates(),
         ", dyadic_size=",
         instance->dyadic_size());

    bb::mock_circuits::construct_proof_with_specified_num_iterations<UltraProver>(
        state, &bb::generate_poseidon2_hash_test_circuit<UltraCircuitBuilder>, num_inputs);
}

// Define benchmarks
// Sweep input sizes so dyadic domain ranges 2^15..2^19 (Ultra: ~25 gates/input).
BENCHMARK(construct_proof_ultrahonk_poseidon2_hash)
    ->Arg(750)
    ->Arg(1500)
    ->Arg(3000)
    ->Arg(6000)
    ->Arg(12000)
    ->Arg(50000)
    ->Unit(kMillisecond);

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

/**
 * @brief Benchmark: Non-ZK proof where the gate count is 2^n + 10%, causing dyadic size to round up to 2^(n+1).
 * This gives ~55% trace utilization — measures the cost of padding waste.
 */
static void construct_proof_ultrahonk_sparse(State& state) noexcept
{
    auto log2_of_gates = static_cast<size_t>(state.range(0));
    size_t target_gates = (1UL << log2_of_gates) + (1UL << log2_of_gates) / 10;
    bb::mock_circuits::construct_proof_with_specified_num_iterations<UltraProver>(
        state,
        &bb::mock_circuits::generate_basic_arithmetic_circuit_with_target_gates<UltraCircuitBuilder>,
        target_gates);
}

/**
 * @brief Benchmark: ZK proof where the gate count is 2^n + 10%, causing dyadic size to round up to 2^(n+1).
 */
static void construct_proof_ultrahonk_zk_sparse(State& state) noexcept
{
    auto log2_of_gates = static_cast<size_t>(state.range(0));
    size_t target_gates = (1UL << log2_of_gates) + (1UL << log2_of_gates) / 10;
    bb::mock_circuits::construct_proof_with_specified_num_iterations<UltraZKProver>(
        state,
        &bb::mock_circuits::generate_basic_arithmetic_circuit_with_target_gates<UltraCircuitBuilder>,
        target_gates);
}

BENCHMARK(construct_proof_ultrahonk_sparse)->DenseRange(15, 20)->Unit(kMillisecond);

BENCHMARK(construct_proof_ultrahonk_zk_sparse)->DenseRange(15, 20)->Unit(kMillisecond);

BENCHMARK(construct_proof_ultrahonk_1M_gates_dyadic_2_20)->Unit(kMillisecond);
BENCHMARK(construct_proof_ultrahonk_1M_gates_dyadic_2_21)->Unit(kMillisecond);

int main(int argc, char** argv)
{
#if !defined(__wasm__) || defined(ENABLE_WASM_BENCH)
    // Enable BB_BENCH profiling
    bb::detail::use_bb_bench = true;
#endif

    // Run benchmarks
    ::benchmark::Initialize(&argc, argv);
    if (::benchmark::ReportUnrecognizedArguments(argc, argv))
        return 1;
    ::benchmark::RunSpecifiedBenchmarks();
    ::benchmark::Shutdown();

#if !defined(__wasm__) || defined(ENABLE_WASM_BENCH)
    // Print detailed profiling stats
    std::cout << "\n=== Detailed BB_BENCH Profiling Stats ===\n";
    bb::detail::GLOBAL_BENCH_STATS.print_aggregate_counts_hierarchical(std::cout);
#endif

    return 0;
}
