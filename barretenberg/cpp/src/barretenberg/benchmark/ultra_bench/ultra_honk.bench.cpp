#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/ultra_bench/mock_circuits.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

using namespace benchmark;
using namespace bb;

/**
 * @brief Generate test circuit with a specific target gate count (not power of 2)
 */
static void generate_basic_arithmetic_circuit_with_target_gates(UltraCircuitBuilder& builder, size_t target_gate_count)
{
    stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>::add_default(builder);

    stdlib::field_t a(stdlib::witness_t(&builder, fr::random_element()));
    stdlib::field_t b(stdlib::witness_t(&builder, fr::random_element()));
    stdlib::field_t c(&builder);

    const size_t GATE_COUNT_BUFFER = 1000;
    size_t current_gates = builder.get_num_finalized_gates_inefficient(/*ensure_nonzero=*/false);

    if (target_gate_count <= current_gates + GATE_COUNT_BUFFER) {
        throw_or_abort("Target gate count is too low.");
    }

    size_t passes = (target_gate_count - current_gates - GATE_COUNT_BUFFER) / 4;

    for (size_t i = 0; i < passes; ++i) {
        c = a + b;
        c = a * c;
        a = b * b;
        b = c * c;
    }
}

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
 * @brief Benchmark: Construction of a Ultra Honk proof with gates just below 2^20
 */
static void construct_proof_ultrahonk_just_below_2_20(State& state) noexcept
{
    size_t num_gates = (1 << 20) - 1; // 2^20 - 1 = 1,048,575 gates
    bb::mock_circuits::construct_proof_with_specified_num_iterations<UltraProver>(
        state, &generate_basic_arithmetic_circuit_with_target_gates, num_gates);
}

/**
 * @brief Benchmark: Construction of a Ultra Honk proof with gates just above 2^20
 */
static void construct_proof_ultrahonk_just_above_2_20(State& state) noexcept
{
    size_t num_gates = (1 << 20) + 1; // 2^20 + 1 = 1,048,577 gates
    bb::mock_circuits::construct_proof_with_specified_num_iterations<UltraProver>(
        state, &generate_basic_arithmetic_circuit_with_target_gates, num_gates);
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

BENCHMARK(construct_proof_ultrahonk_just_below_2_20)->Unit(kMillisecond);
BENCHMARK(construct_proof_ultrahonk_just_above_2_20)->Unit(kMillisecond);

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
