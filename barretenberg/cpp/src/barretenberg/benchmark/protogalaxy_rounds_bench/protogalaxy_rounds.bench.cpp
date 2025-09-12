#include <benchmark/benchmark.h>

#include "barretenberg/protogalaxy/protogalaxy_prover.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/decider_keys.hpp"

using namespace benchmark;

namespace bb {

using Flavor = MegaFlavor;

void _bench_round(::benchmark::State& state, void (*F)(ProtogalaxyProver_<Flavor>&))
{
    using Builder = typename Flavor::CircuitBuilder;
    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using DeciderVerificationKey = DeciderVerificationKey_<Flavor>;
    using ProtogalaxyProver = ProtogalaxyProver_<Flavor>;

    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    auto log2_num_gates = static_cast<size_t>(state.range(0));

    const auto construct_key = [&]() {
        Builder builder;
        MockCircuits::construct_arithmetic_circuit(builder, log2_num_gates);
        return std::make_shared<DeciderProvingKey>(builder);
    };

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/938): Parallelize this loop, also extend to more than
    // k=1
    std::shared_ptr<DeciderProvingKey> decider_pk_1 = construct_key();
    auto honk_vk_1 = std::make_shared<Flavor::VerificationKey>(decider_pk_1->get_precomputed());
    auto decider_vk_1 = std::make_shared<DeciderVerificationKey>(honk_vk_1);
    std::shared_ptr<DeciderProvingKey> decider_pk_2 = construct_key();
    auto honk_vk_2 = std::make_shared<Flavor::VerificationKey>(decider_pk_2->get_precomputed());
    auto decider_vk_2 = std::make_shared<DeciderVerificationKey>(honk_vk_2);
    std::shared_ptr<typename ProtogalaxyProver::Transcript> transcript =
        std::make_shared<typename ProtogalaxyProver::Transcript>();

    ProtogalaxyProver folding_prover({ decider_pk_1, decider_pk_2 }, { decider_vk_1, decider_vk_2 }, transcript);

    // prepare the prover state
    folding_prover.accumulator = decider_pk_1;
    folding_prover.deltas.resize(log2_num_gates);
    std::fill_n(folding_prover.deltas.begin(), log2_num_gates, 0);
    folding_prover.perturbator = Flavor::Polynomial::random(1 << log2_num_gates);
    folding_prover.transcript = Flavor::Transcript::prover_init_empty();
    folding_prover.run_oink_prover_on_each_incomplete_key();

    for (auto _ : state) {
        F(folding_prover);
    }
}

void bench_round_mega(::benchmark::State& state, void (*F)(ProtogalaxyProver_<MegaFlavor>&))
{
    _bench_round(state, F);
}

BENCHMARK_CAPTURE(bench_round_mega, oink, [](auto& prover) { prover.run_oink_prover_on_each_incomplete_key(); })
    -> DenseRange(14, 20) -> Unit(kMillisecond);
BENCHMARK_CAPTURE(bench_round_mega, perturbator, [](auto& prover) { prover.perturbator_round(prover.accumulator); })
    -> DenseRange(14, 20) -> Unit(kMillisecond);
BENCHMARK_CAPTURE(bench_round_mega, combiner_quotient, [](auto& prover) {
    prover.combiner_quotient_round(prover.accumulator->gate_challenges, prover.deltas, prover.keys_to_fold);
}) -> DenseRange(14, 20) -> Unit(kMillisecond);
BENCHMARK_CAPTURE(bench_round_mega, fold, [](auto& prover) {
    prover.update_target_sum_and_fold(prover.keys_to_fold,
                                      prover.combiner_quotient,
                                      prover.alphas,
                                      prover.relation_parameters,
                                      prover.perturbator_evaluation);
}) -> DenseRange(14, 20) -> Unit(kMillisecond);

} // namespace bb

BENCHMARK_MAIN();
