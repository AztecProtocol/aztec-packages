#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/ultra_bench/mock_circuits.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/ultra_honk/multi_mega_prover.hpp"

using namespace benchmark;
using namespace bb;

namespace {

void mega_prover(State& state) noexcept
{
    auto log2_of_gates = static_cast<size_t>(state.range(0));
    bb::mock_circuits::construct_proof_with_specified_num_iterations<MegaProver>(
        state, &bb::mock_circuits::generate_basic_arithmetic_circuit<MegaCircuitBuilder>, log2_of_gates);
}

void multi_mega_prover(State& state) noexcept
{
    auto log2_of_gates = static_cast<size_t>(state.range(0));
    bb::mock_circuits::construct_proof_with_specified_num_iterations<MultiMegaProver>(
        state, &bb::mock_circuits::generate_basic_arithmetic_circuit<MegaCircuitBuilder>, log2_of_gates);
}

} // namespace

BENCHMARK(mega_prover)->DenseRange(16, 19)->Unit(kMillisecond);
BENCHMARK(multi_mega_prover)->DenseRange(16, 19)->Unit(kMillisecond);

int main(int argc, char** argv)
{
    bb::detail::use_bb_bench = true;

    ::benchmark::Initialize(&argc, argv);
    if (::benchmark::ReportUnrecognizedArguments(argc, argv))
        return 1;
    ::benchmark::RunSpecifiedBenchmarks();
    ::benchmark::Shutdown();

    std::cout << "\n=== BB_BENCH Phase Breakdown ===\n";
    bb::detail::GLOBAL_BENCH_STATS.print_aggregate_counts_hierarchical(std::cout);

    return 0;
}
