#include <benchmark/benchmark.h>

#include "barretenberg/common/op_count_google_bench.hpp"
#include "barretenberg/protogalaxy/protogalaxy_prover.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/sumcheck/instance/instances.hpp"
#include "barretenberg/sumcheck/instance/prover_instance.hpp"

using namespace benchmark;

namespace bb {

// Fold one proving key into an accumulator.
template <typename Flavor, size_t k> void fold_k(State& state) noexcept
{
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

// We stick to just k=1 for compile-time reasons.
BENCHMARK(fold_k<MegaFlavor, 1>)->/* vary the circuit size */ DenseRange(14, 20)->Unit(kMillisecond);

} // namespace bb

BENCHMARK_MAIN();
