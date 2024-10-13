#include <benchmark/benchmark.h>

#include "barretenberg/common/op_count_google_bench.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover_internal.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/decider_keys.hpp"
#include "barretenberg/ultra_honk/decider_proving_key.hpp"

using namespace benchmark;

namespace bb {

using Flavor = MegaFlavor;
using FF = typename Flavor::FF;

void vector_of_evaluations(State& state) noexcept
{
    using RelationEvaluations = typename Flavor::TupleOfArraysOfValues;

    for (auto _ : state) {
        std::vector<RelationEvaluations> evals(1 << state.range(0));
        DoNotOptimize(evals);
    }
}

void compute_row_evaluations(State& state) noexcept
{
    using Fun = ProtogalaxyProverInternal<DeciderProvingKeys_<Flavor, 2>>;
    using Polys = Flavor::ProverPolynomials;
    using Alphas = Flavor::RelationSeparator;
    using Params = RelationParameters<FF>;

    const size_t dyadic_size = 1 << state.range(0);
    Polys polys(dyadic_size);
    Alphas alphas;
    auto params = Params::get_random();

    for (auto _ : state) {
        auto result = Fun::compute_row_evaluations(polys, alphas, params);
        DoNotOptimize(result);
    }
}

// Fold one proving key into an accumulator.
void fold_k(State& state) noexcept
{
    static constexpr size_t k{ 1 };

    using DeciderProvingKey = DeciderProvingKey_<Flavor>;
    using ProtogalaxyProver = ProtogalaxyProver_<DeciderProvingKeys_<Flavor, k + 1>>;
    using Builder = typename Flavor::CircuitBuilder;

    bb::srs::init_crs_factory("../srs_db/ignition");

    auto log2_num_gates = static_cast<size_t>(state.range(0));

    const auto construct_key = [&]() {
        Builder builder;
        MockCircuits::construct_arithmetic_circuit(builder, log2_num_gates);
        return std::make_shared<DeciderProvingKey>(builder);
    };
    std::vector<std::shared_ptr<DeciderProvingKey>> decider_pks;
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/938): Parallelize this loop
    for (size_t i = 0; i < k + 1; ++i) {
        decider_pks.emplace_back(construct_key());
    }

    ProtogalaxyProver folding_prover(decider_pks);

    for (auto _ : state) {
        BB_REPORT_OP_COUNT_IN_BENCH(state);
        auto proof = folding_prover.prove();
    }
}

BENCHMARK(vector_of_evaluations)->DenseRange(15, 21)->Unit(kMillisecond)->Iterations(1);
BENCHMARK(compute_row_evaluations)->DenseRange(15, 21)->Unit(kMillisecond);
// We stick to just k=1 for compile-time reasons.
BENCHMARK(fold_k)->/* vary the circuit size */ DenseRange(14, 20)->Unit(kMillisecond);

} // namespace bb

BENCHMARK_MAIN();
