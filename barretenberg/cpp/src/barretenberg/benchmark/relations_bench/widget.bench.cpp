#include "barretenberg/benchmark/honk_bench/benchmark_utilities.hpp"
#include "barretenberg/honk/flavor/goblin_ultra.hpp"
#include "barretenberg/honk/flavor/ultra.hpp"
#include "barretenberg/plonk/composer/ultra_composer.hpp"
#include "barretenberg/plonk/proof_system/widgets/transition_widgets/plookup_auxiliary_widget.hpp"
#include <benchmark/benchmark.h>

namespace {
auto& engine = numeric::random::get_debug_engine();
}

namespace proof_system::plonk {

using FF = barretenberg::fr;

template <typename Flavor, typename Widget> void execute_widget(::benchmark::State& state)
{
    // Generate beta and gamma
    auto inner_composer = plonk::UltraComposer();
    auto builder = typename plonk::UltraComposer::CircuitBuilder();
    bench_utils::generate_basic_arithmetic_circuit(builder, 1);
    auto inner_prover = inner_composer.create_prover(builder);
    auto inner_proof = inner_prover.construct_proof();
    auto inner_verifier = inner_composer.create_verifier(builder);

    const size_t num_inner_public_inputs = builder.get_public_inputs().size();

    transcript::StandardTranscript transcript(inner_proof.proof_data,
                                              plonk::UltraComposer::create_manifest(num_inner_public_inputs),
                                              transcript::HashType::PlookupPedersenBlake3s);

    for (auto _ : state) {
        ProverPlookupAuxiliaryWidget<FF> value;
        value.compute_quotient_contribution(FF::random_element(), transcript);
    }
}

void plookup_auxiliary_widget(::benchmark::State& state) noexcept
{
    execute_widget<honk::flavor::Ultra, ProverPlookupAuxiliaryWidget<FF>>(state);
}
BENCHMARK(plookup_auxiliary_widget);

} // namespace proof_system::plonk
