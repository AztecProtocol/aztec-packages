#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/ultra_bench/mock_circuits.hpp"
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
    MegaFlavor::ProverPolynomials polynomials{ gates };
    for (auto _ : state) {
        for (size_t i = 0; i < gates; i++) {
            benchmark::DoNotOptimize(polynomials.get_row(i));
        }
    }
}

// Define benchmarks

// This exists due to an issue where get_row was blowing up in time
BENCHMARK_CAPTURE(construct_proof_megahonk, sha256, &stdlib::generate_sha256_test_circuit<MegaCircuitBuilder>)
    ->Unit(kMillisecond);
BENCHMARK_CAPTURE(construct_proof_megahonk, keccak, &stdlib::generate_keccak_test_circuit<MegaCircuitBuilder>)
    ->Unit(kMillisecond);
BENCHMARK_CAPTURE(construct_proof_megahonk,
                  ecdsa_verification,
                  &stdlib::generate_ecdsa_verification_test_circuit<MegaCircuitBuilder>)
    ->Unit(kMillisecond);
BENCHMARK_CAPTURE(construct_proof_megahonk,
                  merkle_membership,
                  &stdlib::generate_merkle_membership_test_circuit<MegaCircuitBuilder>)
    ->Unit(kMillisecond);

BENCHMARK(get_row_power_of_2)
    // 2**15 gates to 2**20 gates
    ->DenseRange(15, 20)
    ->Unit(kMillisecond);

BENCHMARK(construct_proof_megahonk_power_of_2)
    // 2**15 gates to 2**20 gates
    ->DenseRange(15, 20)
    ->Unit(kMillisecond);

BENCHMARK_MAIN();
