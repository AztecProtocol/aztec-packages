#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/ultra_bench/mock_circuits.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

using namespace benchmark;
using namespace bb;

// MegaZKFlavor is the hiding-kernel flavor: it constrains neither lookup nor non-native-field gates (nor
// elliptic or memory), so only circuits legal for that arithmetization can be benchmarked here. Its builder
// type enforces this -- a plookup- or bigfield-backed body does not compile.
using HidingKernelBuilder = MegaZKFlavor::CircuitBuilder;

/**
 * @brief Benchmark: Construction of a Ultra Honk proof for a circuit determined by the provided circuit function
 */
static void construct_proof_megahonk_zk(State& state,
                                        void (*test_circuit_function)(HidingKernelBuilder&, size_t)) noexcept
{
    size_t num_iterations = 10; // 10x the circuit
    bb::mock_circuits::construct_proof_with_specified_num_iterations<MegaZKProver>(
        state, test_circuit_function, num_iterations);
}

/**
 * @brief Benchmark: Construction of a Ultra Honk proof with 2**n gates
 */
static void construct_proof_megahonk_power_of_2_zk(State& state) noexcept
{
    auto log2_of_gates = static_cast<size_t>(state.range(0));
    bb::mock_circuits::construct_proof_with_specified_num_iterations<MegaZKProver>(
        state, &bb::mock_circuits::generate_basic_arithmetic_circuit<HidingKernelBuilder>, log2_of_gates);
}

// Define benchmarks

// Poseidon2 hashing, which is what a hiding kernel is actually made of. The sha256 and ecdsa circuits
// benchmarked for the full MegaFlavor (mega_honk.bench.cpp) have no counterpart here: they are built from
// lookup and non-native-field gates, which this flavor does not constrain.
BENCHMARK_CAPTURE(construct_proof_megahonk_zk, poseidon2, &generate_poseidon2_chain_test_circuit<HidingKernelBuilder>)
    ->Unit(kMillisecond);

BENCHMARK(construct_proof_megahonk_power_of_2_zk)
    // 2**15 gates to 2**20 gates
    ->DenseRange(15, 20)
    ->Unit(kMillisecond);

BENCHMARK_MAIN();
