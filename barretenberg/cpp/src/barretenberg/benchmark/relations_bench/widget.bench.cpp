#include "barretenberg/benchmark/honk_bench/benchmark_utilities.hpp"
#include "barretenberg/honk/flavor/goblin_ultra.hpp"
#include "barretenberg/honk/flavor/ultra.hpp"
#include "barretenberg/plonk/composer/standard_composer.hpp"
#include "barretenberg/plonk/composer/ultra_composer.hpp"
#include "barretenberg/plonk/proof_system/widgets/transition_widgets/plookup_auxiliary_widget.hpp"
#include <benchmark/benchmark.h>

namespace {
auto& engine = numeric::random::get_debug_engine();
}

namespace proof_system::plonk {

struct BasicPlonkKeyAndTranscript {
    std::shared_ptr<proving_key> proving_key;
    transcript::StandardTranscript transcript;
};

BasicPlonkKeyAndTranscript get_plonk_key_and_transcript()
{
    barretenberg::srs::init_crs_factory("../srs_db/ignition");
    auto inner_composer = plonk::UltraComposer();
    auto builder = typename plonk::UltraComposer::CircuitBuilder();
    bench_utils::generate_basic_arithmetic_circuit(builder, 80);
    auto inner_prover = inner_composer.create_prover(builder);
    auto inner_proof = inner_prover.construct_proof();

    return { inner_composer.circuit_proving_key, inner_prover.transcript };
}

template <typename Flavor, typename Widget> void execute_widget(::benchmark::State& state)
{
    BasicPlonkKeyAndTranscript data = get_plonk_key_and_transcript();
    Widget widget(data.proving_key);
    for (auto _ : state) {
        for (int i = 0; i < 1000; i++) {
            widget.compute_quotient_contribution(barretenberg::fr::random_element(), data.transcript);
        }
    }
}
void plookup_auxiliary_kernel(::benchmark::State& state) noexcept
{
    BasicPlonkKeyAndTranscript data = get_plonk_key_and_transcript();

    using FFTGetter = ProverPlookupAuxiliaryWidget<ultra_settings>::FFTGetter;
    using FFTKernel = ProverPlookupAuxiliaryWidget<ultra_settings>::FFTKernel;

    auto polynomials = FFTGetter::get_polynomials(data.proving_key.get(), FFTKernel::get_required_polynomial_ids());
    auto challenges = FFTGetter::get_challenges(
        data.transcript, barretenberg::fr::random_element(), FFTKernel::quotient_required_challenges);

    for (auto _ : state) {
        for (int j = 0; j < 1000; j++) {
            widget::containers::coefficient_array<barretenberg::fr> linear_terms;
            FFTKernel::compute_linear_terms(polynomials, challenges, linear_terms, 0);
            auto sum_of_linear_terms = FFTKernel::sum_linear_terms(polynomials, challenges, linear_terms, 0);

            auto& quotient_term = data.proving_key->quotient_polynomial_parts[0][0];
            quotient_term += sum_of_linear_terms;
            FFTKernel::compute_non_linear_terms(polynomials, challenges, quotient_term, 0);
        }
    }
}
BENCHMARK(plookup_auxiliary_kernel);

// void plookup_auxiliary_widget(::benchmark::State& state) noexcept
//{
//     execute_widget<honk::flavor::Ultra, ProverPlookupAuxiliaryWidget<ultra_settings>>(state);
// }
// BENCHMARK(plookup_auxiliary_widget);

} // namespace proof_system::plonk
