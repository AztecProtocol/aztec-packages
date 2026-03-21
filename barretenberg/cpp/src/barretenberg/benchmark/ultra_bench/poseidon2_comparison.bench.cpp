#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/ultra_bench/mock_circuits.hpp"
#include "barretenberg/flavor/poseidon2_single_row_flavor.hpp"
#include "barretenberg/stdlib/hash/poseidon2/poseidon2.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

using namespace benchmark;
using namespace bb;

using Poseidon2SingleRowProver = UltraProver_<Poseidon2SingleRowFlavor>;

// ==================== Circuit builders ====================

/**
 * @brief Build a circuit with N Poseidon2 hashes using the standard multi-row approach (64 gates/hash).
 */
static void generate_mega_poseidon2_circuit(MegaCircuitBuilder& builder, size_t num_hashes)
{
    stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>::add_default(builder);
    for (size_t i = 0; i < num_hashes; i++) {
        auto a = stdlib::field_t(stdlib::witness_t(&builder, fr::random_element()));
        auto b = stdlib::field_t(stdlib::witness_t(&builder, fr::random_element()));
        stdlib::poseidon2<MegaCircuitBuilder>::hash({ a, b });
    }
}

/**
 * @brief Build a circuit with N Poseidon2 hashes using the single-row approach (1 gate/hash).
 */
static void generate_single_row_poseidon2_circuit(MegaCircuitBuilder& builder, size_t num_hashes)
{
    stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>::add_default(builder);
    for (size_t i = 0; i < num_hashes; i++) {
        std::array<fr, 4> input = {
            fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element()
        };
        builder.create_poseidon2_single_row_gate(input);
    }
}

// ==================== Benchmarks ====================

static void mega_poseidon2_prove(State& state) noexcept
{
    auto num_hashes = static_cast<size_t>(state.range(0));
    bb::mock_circuits::construct_proof_with_specified_num_iterations<MegaProver>(
        state, &generate_mega_poseidon2_circuit, num_hashes);
}

static void single_row_poseidon2_prove(State& state) noexcept
{
    auto num_hashes = static_cast<size_t>(state.range(0));
    bb::mock_circuits::construct_proof_with_specified_num_iterations<Poseidon2SingleRowProver>(
        state, &generate_single_row_poseidon2_circuit, num_hashes);
}

BENCHMARK(mega_poseidon2_prove)->Arg(100)->Arg(1000)->Arg(10000)->Unit(kMillisecond);
BENCHMARK(single_row_poseidon2_prove)->Arg(100)->Arg(1000)->Arg(10000)->Unit(kMillisecond);

BENCHMARK_MAIN();
