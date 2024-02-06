#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/ultra_bench/mock_proofs.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"

using namespace benchmark;

namespace bb::honk {
using Flavor = flavor::GoblinUltra;
using Polynomial = Flavor::Polynomial;
using Instance = ProverInstance_<Flavor>;
using Instances = ProverInstances_<Flavor, 2>;
using ProtoGalaxyProver = ProtoGalaxyProver_<Instances>;
using Builder = Flavor::CircuitBuilder;

void bench_round(::benchmark::State& state, void (*F)(ProtoGalaxyProver&))
{
    bb::srs::init_crs_factory("../srs_db/ignition");
    auto log2_num_gates = static_cast<size_t>(state.range(0));
    auto composer = GoblinUltraComposer();

    const auto construct_instance = [&]() {
        Builder builder;
        bb::mock_proofs::generate_basic_arithmetic_circuit(builder, log2_num_gates);
        return composer.create_instance(builder);
    };

    std::shared_ptr<Instance> instance_1 = construct_instance();
    std::shared_ptr<Instance> instance_2 = construct_instance();

    auto folding_prover = composer.create_folding_prover({ instance_1, instance_2 });

    // prepare the prover state
    folding_prover.state.accumulator = instance_1;
    folding_prover.state.deltas.resize(log2_num_gates);
    std::fill_n(folding_prover.state.deltas.begin(), log2_num_gates, 0);
    folding_prover.state.perturbator = Polynomial::random(1 << log2_num_gates);
    folding_prover.transcript = Flavor::Transcript::prover_init_empty();
    folding_prover.preparation_round();

    for (auto _ : state) {
        F(folding_prover);
    }
}

BENCHMARK_CAPTURE(bench_round, preparation, [](auto& prover) { prover.preparation_round(); }) -> DenseRange(14, 20)
    -> Unit(kMillisecond);
BENCHMARK_CAPTURE(bench_round, perturbator, [](auto& prover) { prover.perturbator_round(); }) -> DenseRange(14, 20)
    -> Unit(kMillisecond);
BENCHMARK_CAPTURE(bench_round, combiner_quotient, [](auto& prover) { prover.combiner_quotient_round(); })
    -> DenseRange(14, 20) -> Unit(kMillisecond);
BENCHMARK_CAPTURE(bench_round, accumulator_update, [](auto& prover) { prover.accumulator_update_round(); })
    -> DenseRange(14, 20) -> Unit(kMillisecond);
} // namespace bb::honk

BENCHMARK_MAIN();
