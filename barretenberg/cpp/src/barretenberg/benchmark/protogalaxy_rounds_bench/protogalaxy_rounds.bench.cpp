#include <benchmark/benchmark.h>

#include "barretenberg/protogalaxy/protogalaxy_prover.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/sumcheck/instance/instances.hpp"

using namespace benchmark;

namespace bb {

template <typename Flavor>
void _bench_round(::benchmark::State& state, void (*F)(ProtoGalaxyProver_<ProverInstances_<Flavor, 2>>&))
{
    using Builder = typename Flavor::CircuitBuilder;
    using ProverInstance = ProverInstance_<Flavor>;
    using Instances = ProverInstances_<Flavor, 2>;
    using ProtoGalaxyProver = ProtoGalaxyProver_<Instances>;

    bb::srs::init_crs_factory("../srs_db/ignition");
    auto log2_num_gates = static_cast<size_t>(state.range(0));

    const auto construct_instance = [&]() {
        Builder builder;
        MockCircuits::construct_arithmetic_circuit(builder, log2_num_gates);
        return std::make_shared<ProverInstance>(builder);
    };

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/938): Parallelize this loop, also extend to more than
    // k=1
    std::shared_ptr<ProverInstance> prover_instance_1 = construct_instance();
    std::shared_ptr<ProverInstance> prover_instance_2 = construct_instance();

    ProtoGalaxyProver folding_prover({ prover_instance_1, prover_instance_2 });

    // prepare the prover state
    folding_prover.state.accumulator = prover_instance_1;
    folding_prover.state.deltas.resize(log2_num_gates);
    std::fill_n(folding_prover.state.deltas.begin(), log2_num_gates, 0);
    folding_prover.state.perturbator = Flavor::Polynomial::random(1 << log2_num_gates);
    folding_prover.transcript = Flavor::Transcript::prover_init_empty();
    folding_prover.preparation_round();

    for (auto _ : state) {
        F(folding_prover);
    }
}

void bench_round_mega(::benchmark::State& state, void (*F)(ProtoGalaxyProver_<ProverInstances_<MegaFlavor, 2>>&))
{
    _bench_round<MegaFlavor>(state, F);
}

BENCHMARK_CAPTURE(bench_round_mega, preparation, [](auto& prover) { prover.preparation_round(); }) -> DenseRange(14, 20)
    -> Unit(kMillisecond);
BENCHMARK_CAPTURE(bench_round_mega, perturbator, [](auto& prover) { prover.perturbator_round(); }) -> DenseRange(14, 20)
    -> Unit(kMillisecond);
BENCHMARK_CAPTURE(bench_round_mega, combiner_quotient, [](auto& prover) { prover.combiner_quotient_round(); })
    -> DenseRange(14, 20) -> Unit(kMillisecond);
BENCHMARK_CAPTURE(bench_round_mega, accumulator_update, [](auto& prover) { prover.accumulator_update_round(); })
    -> DenseRange(14, 20) -> Unit(kMillisecond);

} // namespace bb

BENCHMARK_MAIN();
