#include <benchmark/benchmark.h>

#include "barretenberg/benchmark/ultra_bench/mock_proofs.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"

namespace bb {

template <typename Composer> class PreparedProver : public benchmark::Fixture {
  public:
    using Flavor = typename Composer::Flavor;
    using Instance = ProverInstance_<Flavor>;
    using Builder = typename Flavor::CircuitBuilder;
    using Instances = ProverInstances_<Flavor, 2>;
    using FoldingProver = ProtoGalaxyProver_<Instances>;
    using VerificationKey = typename Flavor::VerificationKey;

    std::shared_ptr<Instance> instance_1;
    std::shared_ptr<Instance> instance_2;
    FoldingProver folding_prover;

    void SetUp(::benchmark::State& state) override
    {
        bb::srs::init_crs_factory("../srs_db/ignition");
        size_t log_circuit_size = static_cast<size_t>(state.range(0));
        size_t circuit_size = 1 << log_circuit_size;
        size_t num_public_inputs = 0;
        Composer composer;

        const auto prepare_instance = [&](std::shared_ptr<Instance>& instance) {
            instance = std::make_shared<Instance>(log_circuit_size, 0);
            instance->verification_key = std::make_shared<VerificationKey>(circuit_size, num_public_inputs);
            instance->instance_size = circuit_size;
            instance->log_instance_size = log_circuit_size;
        };

        prepare_instance(instance_1);
        prepare_instance(instance_2);

        composer.compute_commitment_key(circuit_size);
        folding_prover = composer.create_folding_prover({ instance_1, instance_2 });

        // prepare the prover state
        folding_prover.state.accumulator = instance_1;
        folding_prover.state.deltas.resize(log_circuit_size);
        std::fill_n(folding_prover.state.deltas.begin(), log_circuit_size, 0);
        folding_prover.state.perturbator = Flavor::Polynomial::random(1 << log_circuit_size);
        folding_prover.transcript = Flavor::Transcript::prover_init_empty();
        folding_prover.preparation_round();
    }
};

BENCHMARK_TEMPLATE_DEFINE_F(PreparedProver, bench_preparation, UltraComposer)(benchmark::State& state)
{
    for (auto _ : state) {
        folding_prover.preparation_round();
    }
};

BENCHMARK_REGISTER_F(PreparedProver, bench_preparation)->DenseRange(14, 18);

// void bench_round_ultra(::benchmark::State& state, void (*F)(ProtoGalaxyProver_<ProverInstances_<UltraFlavor, 2>>&))
// {
//     _bench_round<UltraComposer>(state, F);
// }

// void bench_round_goblin_ultra(::benchmark::State& state,
//                               void (*F)(ProtoGalaxyProver_<ProverInstances_<GoblinUltraFlavor, 2>>&))
// {
//     _bench_round<GoblinUltraComposer>(state, F);
// }

// BENCHMARK_CAPTURE(bench_round_ultra, preparation, [](auto& prover) { prover.preparation_round(); })
//     -> DenseRange(14, 20) -> Unit(kMillisecond);
// BENCHMARK_CAPTURE(bench_round_ultra, perturbator, [](auto& prover) { prover.perturbator_round(); })
//     -> DenseRange(14, 20) -> Unit(kMillisecond);
// BENCHMARK_CAPTURE(bench_round_ultra, combiner_quotient, [](auto& prover) { prover.combiner_quotient_round(); })
//     -> DenseRange(14, 20) -> Unit(kMillisecond);
// BENCHMARK_CAPTURE(bench_round_ultra, accumulator_update, [](auto& prover) { prover.accumulator_update_round(); })
//     -> DenseRange(14, 20) -> Unit(kMillisecond);

// BENCHMARK_CAPTURE(bench_round_goblin_ultra, preparation, [](auto& prover) { prover.preparation_round(); })
//     -> DenseRange(14, 20) -> Unit(kMillisecond);
// BENCHMARK_CAPTURE(bench_round_goblin_ultra, perturbator, [](auto& prover) { prover.perturbator_round(); })
//     -> DenseRange(14, 20) -> Unit(kMillisecond);
// BENCHMARK_CAPTURE(bench_round_goblin_ultra, combiner_quotient, [](auto& prover) { prover.combiner_quotient_round();
// })
//     -> DenseRange(14, 20) -> Unit(kMillisecond);
// BENCHMARK_CAPTURE(bench_round_goblin_ultra, accumulator_update, [](auto& prover) { prover.accumulator_update_round();
// })
//     -> DenseRange(14, 20) -> Unit(kMillisecond);

} // namespace bb

BENCHMARK_MAIN();
