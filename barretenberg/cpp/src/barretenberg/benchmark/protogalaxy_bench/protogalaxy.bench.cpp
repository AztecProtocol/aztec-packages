#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/ultra_bench/benchmark_utilities.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"

using namespace benchmark;
using namespace proof_system;

/**
 * @brief Benchmark: Construction of a Ultra Plonk proof with 2**n gates
 */
static void construct_proof_ultrahonk_power_of_2(State& state) noexcept
{
    auto log2_of_gates = static_cast<size_t>(state.range(0));
    bench_utils::construct_proof_with_specified_num_iterations<honk::UltraComposer>(
        state, &bench_utils::generate_basic_arithmetic_circuit<UltraCircuitBuilder>, log2_of_gates);
}

BENCHMARK(construct_proof_ultrahonk_power_of_2)
    // 2**13 gates to 2**18 gates
    ->DenseRange(13, 18)
    ->Unit(kMillisecond);