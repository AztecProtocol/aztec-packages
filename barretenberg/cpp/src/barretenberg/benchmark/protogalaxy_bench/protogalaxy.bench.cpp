#include <benchmark/benchmark.h>

#include "barretenberg/common/google_bb_bench.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover_internal.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/prover_instance.hpp"

using namespace benchmark;

namespace bb {

using Flavor = MegaFlavor;
using FF = typename Flavor::FF;

void vector_of_evaluations(State& state) noexcept
{
    using RelationEvaluations = decltype(create_tuple_of_arrays_of_values<typename Flavor::Relations>());

    for (auto _ : state) {
        std::vector<RelationEvaluations> evals(1 << state.range(0));
        DoNotOptimize(evals);
    }
}

void compute_row_evaluations(State& state) noexcept
{
    using PGInternal = ProtogalaxyProverInternal<ProverInstance_<Flavor>>;
    using Polys = Flavor::ProverPolynomials;
    using Alphas = Flavor::SubrelationSeparators;
    using Params = RelationParameters<FF>;

    const size_t dyadic_size = 1 << state.range(0);
    Polys polys(dyadic_size);
    Alphas alphas;
    auto params = Params::get_random();

    for (auto _ : state) {
        PGInternal pg_internal;
        auto result = pg_internal.compute_row_evaluations(polys, alphas, params);
        DoNotOptimize(result);
    }
}

// Fold one instance into an accumulator.
void fold(State& state) noexcept
{

    using ProverInstance = ProverInstance_<Flavor>;
    using VerifierInstance = VerifierInstance_<Flavor>;
    using ProtogalaxyProver = ProtogalaxyProver_<Flavor>;
    using Builder = typename Flavor::CircuitBuilder;

    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

    auto log2_num_gates = static_cast<size_t>(state.range(0));

    const auto construct_inst = [&]() {
        Builder builder;
        MockCircuits::construct_arithmetic_circuit(builder, log2_num_gates);
        return std::make_shared<ProverInstance>(builder);
    };
    std::array<std::shared_ptr<ProverInstance>, NUM_INSTANCES> prover_insts;
    std::array<std::shared_ptr<VerifierInstance>, NUM_INSTANCES> verifier_insts;
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/938): Parallelize this loop
    for (size_t i = 0; i < NUM_INSTANCES; ++i) {
        std::shared_ptr<ProverInstance> prover_inst = construct_inst();
        auto honk_vk = std::make_shared<Flavor::VerificationKey>(prover_inst->get_precomputed());
        std::shared_ptr<VerifierInstance> verifier_inst = std::make_shared<VerifierInstance>(honk_vk);
        prover_insts[i] = prover_inst;
        verifier_insts[i] = verifier_inst;
    }
    std::shared_ptr<typename ProtogalaxyProver::Transcript> transcript =
        std::make_shared<typename ProtogalaxyProver::Transcript>();

    ProtogalaxyProver folding_prover(prover_insts, verifier_insts, transcript);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        auto proof = folding_prover.prove();
    }
}

BENCHMARK(vector_of_evaluations)->DenseRange(15, 21)->Unit(kMillisecond)->Iterations(1);
BENCHMARK(compute_row_evaluations)->DenseRange(15, 21)->Unit(kMillisecond);
// We stick to just k=1 for compile-time reasons.
BENCHMARK(fold)->/* vary the circuit size */ DenseRange(14, 20)->Unit(kMillisecond);

} // namespace bb

BENCHMARK_MAIN();
