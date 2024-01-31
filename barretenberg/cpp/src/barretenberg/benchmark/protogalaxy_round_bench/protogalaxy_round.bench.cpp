#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/ultra_bench/mock_proofs.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"

using namespace benchmark;

namespace bb::honk {
using Flavor = flavor::Ultra;
using Instance = ProverInstance_<Flavor>;
using Instances = ProverInstances_<Flavor, 2>;
using ProtoGalaxyProver = ProtoGalaxyProver_<Instances>;
using Builder = Flavor::CircuitBuilder;

static void run_protogalaxy_prover_round(State& state, size_t function_index)
{
    // state.PauseTiming();
    bb::srs::init_crs_factory("../srs_db/ignition");
    auto log2_num_gates = static_cast<size_t>(state.range(0));
    auto composer = UltraComposer();

    const auto construct_instance = [&]() {
        Builder builder;
        bb::mock_proofs::generate_basic_arithmetic_circuit(builder, log2_num_gates);
        return composer.create_instance(builder);
    };

    std::shared_ptr<Instance> instance_1 = construct_instance();
    std::shared_ptr<Instance> instance_2 = construct_instance();

    auto folding_prover = composer.create_folding_prover({ instance_1, instance_2 });
    folding_prover.transcript = Flavor::Transcript::prover_init_empty();
    for (auto _ : state) {
        if (function_index != 0)
            state.PauseTiming();
        folding_prover.preparation_round();
        if (function_index == 0)
            continue;
        if (function_index == 1)
            state.ResumeTiming();
        folding_prover.perturbator_round();
        if (function_index == 1)
            continue;
        if (function_index == 2)
            state.ResumeTiming();
        folding_prover.combiner_quotient_round();
        if (function_index == 2)
            continue;
        if (function_index == 3)
            state.ResumeTiming();
        folding_prover.accumulator_update_round();
        if (function_index == 3)
            continue;
    }
}

BENCHMARK_CAPTURE(run_protogalaxy_prover_round, FoldOnePreparation, 0)
    ->/* vary the circuit size */ DenseRange(14, 20)
    ->Unit(kMillisecond);

BENCHMARK_CAPTURE(run_protogalaxy_prover_round, FoldOnePerturbator, 1)
    ->/* vary the circuit size */ DenseRange(14, 20)
    ->Unit(kMillisecond);

BENCHMARK_CAPTURE(run_protogalaxy_prover_round, FoldOneCombinerQuotient, 2)
    ->/* vary the circuit size */ DenseRange(14, 20)
    ->Unit(kMillisecond);

BENCHMARK_CAPTURE(run_protogalaxy_prover_round, FoldOneAccumulatorUpdate, 3)
    ->/* vary the circuit size */ DenseRange(14, 20)
    ->Unit(kMillisecond);

} // namespace bb::honk

BENCHMARK_MAIN();
