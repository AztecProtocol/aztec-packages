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

        const auto prepare_instance =
            [num_public_inputs, circuit_size, log_circuit_size](std::shared_ptr<Instance>& instance) {
                instance = std::make_shared<Instance>(log_circuit_size, 0);
                instance->verification_key = std::make_shared<VerificationKey>(circuit_size, num_public_inputs);
                for (auto& elt : instance->verification_key->get_all()) {
                    elt = Flavor::Commitment::random_element();
                }
                instance->instance_size = circuit_size;
                instance->log_instance_size = log_circuit_size;
            };

        prepare_instance(instance_1);
        prepare_instance(instance_2);

        composer.compute_commitment_key(circuit_size);
        folding_prover = composer.create_folding_prover({ instance_1, instance_2 });

        const auto prepare_prover = [this /* to capture instance_1 */, log_circuit_size](FoldingProver& prover) {
            prover.state.accumulator = instance_1;
            prover.state.deltas.resize(log_circuit_size);
            std::fill_n(prover.state.deltas.begin(), log_circuit_size, 0);
            prover.state.perturbator = Flavor::Polynomial::random(1 << log_circuit_size);
            prover.transcript = Flavor::Transcript::prover_init_empty();
            prover.preparation_round();
        };

        prepare_prover(folding_prover);
    }
};

BENCHMARK_TEMPLATE_DEFINE_F(PreparedProver, preparation_ultra, UltraComposer)(benchmark::State& state)
{
    for (auto _ : state) {
        folding_prover.preparation_round();
    }
};
BENCHMARK_REGISTER_F(PreparedProver, preparation_ultra)->DenseRange(14, 19)->Unit(benchmark::kMillisecond);

BENCHMARK_TEMPLATE_DEFINE_F(PreparedProver, preparation_goblin_ultra, GoblinUltraComposer)(benchmark::State& state)
{
    for (auto _ : state) {
        folding_prover.preparation_round();
    }
};
BENCHMARK_REGISTER_F(PreparedProver, preparation_goblin_ultra)->DenseRange(14, 19)->Unit(benchmark::kMillisecond);

BENCHMARK_TEMPLATE_DEFINE_F(PreparedProver, perturbator_ultra, UltraComposer)(benchmark::State& state)
{
    for (auto _ : state) {
        folding_prover.perturbator_round();
    }
};
BENCHMARK_REGISTER_F(PreparedProver, perturbator_ultra)->DenseRange(14, 19)->Unit(benchmark::kMillisecond);

BENCHMARK_TEMPLATE_DEFINE_F(PreparedProver, perturbator_goblin_ultra, GoblinUltraComposer)(benchmark::State& state)
{
    for (auto _ : state) {
        folding_prover.perturbator_round();
    }
};
BENCHMARK_REGISTER_F(PreparedProver, perturbator_goblin_ultra)->DenseRange(14, 19)->Unit(benchmark::kMillisecond);

BENCHMARK_TEMPLATE_DEFINE_F(PreparedProver, combiner_ultra, UltraComposer)(benchmark::State& state)
{
    for (auto _ : state) {
        folding_prover.combiner_quotient_round();
    }
};
BENCHMARK_REGISTER_F(PreparedProver, combiner_ultra)->DenseRange(14, 19)->Unit(benchmark::kMillisecond);

BENCHMARK_TEMPLATE_DEFINE_F(PreparedProver, combiner_goblin_ultra, GoblinUltraComposer)(benchmark::State& state)
{
    for (auto _ : state) {
        folding_prover.combiner_quotient_round();
    }
};
BENCHMARK_REGISTER_F(PreparedProver, combiner_goblin_ultra)->DenseRange(14, 19)->Unit(benchmark::kMillisecond);

BENCHMARK_TEMPLATE_DEFINE_F(PreparedProver, accumulator_update_ultra, UltraComposer)(benchmark::State& state)
{
    for (auto _ : state) {
        folding_prover.accumulator_update_round();
    }
};
BENCHMARK_REGISTER_F(PreparedProver, accumulator_update_ultra)->DenseRange(14, 19)->Unit(benchmark::kMillisecond);

BENCHMARK_TEMPLATE_DEFINE_F(PreparedProver, accumulator_update_goblin_ultra, GoblinUltraComposer)
(benchmark::State& state)
{
    for (auto _ : state) {
        folding_prover.accumulator_update_round();
    }
};
BENCHMARK_REGISTER_F(PreparedProver, accumulator_update_goblin_ultra)
    ->DenseRange(14, 19)
    ->Unit(benchmark::kMillisecond);

} // namespace bb

BENCHMARK_MAIN();
