#include "barretenberg/benchmark/honk_bench/benchmark_utilities.hpp"
#include "barretenberg/flavor/goblin_ultra.hpp"
#include "barretenberg/flavor/ultra.hpp"
#include "barretenberg/plonk/composer/standard_composer.hpp"
#include "barretenberg/plonk/composer/ultra_composer.hpp"
#include "barretenberg/plonk/proof_system/widgets/transition_widgets/elliptic_widget.hpp"
#include "barretenberg/plonk/proof_system/widgets/transition_widgets/genperm_sort_widget.hpp"
#include "barretenberg/plonk/proof_system/widgets/transition_widgets/plookup_arithmetic_widget.hpp"
#include "barretenberg/plonk/proof_system/widgets/transition_widgets/plookup_auxiliary_widget.hpp"

namespace {
auto& engine = numeric::random::get_debug_engine();
}

namespace proof_system::plonk {

struct BasicPlonkKeyAndTranscript {
    std::shared_ptr<proving_key> key;
    transcript::StandardTranscript transcript;
};

BasicPlonkKeyAndTranscript get_plonk_key_and_transcript()
{
    barretenberg::srs::init_crs_factory("../srs_db/ignition");
    auto inner_composer = plonk::UltraComposer();
    auto builder = typename plonk::UltraComposer::CircuitBuilder();
    bench_utils::generate_basic_arithmetic_circuit(builder, 80);
    UltraProver inner_prover = inner_composer.create_prover(builder);
    inner_prover.construct_proof();
    return { inner_composer.circuit_proving_key, inner_prover.transcript };
}

template <typename Flavor, typename Widget> void execute_widget(::benchmark::State& state)
{
    BasicPlonkKeyAndTranscript data = get_plonk_key_and_transcript();
    Widget widget(data.key);
    for (auto _ : state) {
        widget.compute_quotient_contribution(barretenberg::fr::random_element(), data.transcript);
    }
}

void plookup_auxiliary_kernel(::benchmark::State& state) noexcept
{
    BasicPlonkKeyAndTranscript data = get_plonk_key_and_transcript();

    using FFTGetter = ProverPlookupAuxiliaryWidget<ultra_settings>::FFTGetter;
    using FFTKernel = ProverPlookupAuxiliaryWidget<ultra_settings>::FFTKernel;

    auto polynomials = FFTGetter::get_polynomials(data.key.get(), FFTKernel::get_required_polynomial_ids());
    auto challenges = FFTGetter::get_challenges(
        data.transcript, barretenberg::fr::random_element(), FFTKernel::quotient_required_challenges);

    for (auto _ : state) {
        // NOTE: this simply calls the following 3 functions it does NOT try to replicate ProverPlookupAuxiliaryWidget
        // logic exactly
        barretenberg::fr result{ 0 };
        FFTKernel::accumulate_contribution(polynomials, challenges, result, 0);
    }
}
BENCHMARK(plookup_auxiliary_kernel);

void plookup_arithmetic_kernel(::benchmark::State& state) noexcept
{
    BasicPlonkKeyAndTranscript data = get_plonk_key_and_transcript();

    using FFTGetter = ProverPlookupArithmeticWidget<ultra_settings>::FFTGetter;
    using FFTKernel = ProverPlookupArithmeticWidget<ultra_settings>::FFTKernel;

    auto polynomials = FFTGetter::get_polynomials(data.key.get(), FFTKernel::get_required_polynomial_ids());
    auto challenges = FFTGetter::get_challenges(
        data.transcript, barretenberg::fr::random_element(), FFTKernel::quotient_required_challenges);

    for (auto _ : state) {
        // NOTE: this simply calls the following 3 functions it does NOT try to replicate ProverPlookupAuxiliaryWidget
        // logic exactly
        barretenberg::fr result{ 0 };
        FFTKernel::accumulate_contribution(polynomials, challenges, result, 0);
    }
}
BENCHMARK(plookup_arithmetic_kernel);

void plookup_elliptic_kernel(::benchmark::State& state) noexcept
{
    BasicPlonkKeyAndTranscript data = get_plonk_key_and_transcript();

    using FFTGetter = ProverEllipticWidget<ultra_settings>::FFTGetter;
    using FFTKernel = ProverEllipticWidget<ultra_settings>::FFTKernel;

    auto polynomials = FFTGetter::get_polynomials(data.key.get(), FFTKernel::get_required_polynomial_ids());
    auto challenges = FFTGetter::get_challenges(
        data.transcript, barretenberg::fr::random_element(), FFTKernel::quotient_required_challenges);

    for (auto _ : state) {
        // NOTE: this simply calls the following 3 functions it does NOT try to replicate ProverPlookupAuxiliaryWidget
        // logic exactly
        barretenberg::fr result{ 0 };
        FFTKernel::accumulate_contribution(polynomials, challenges, result, 0);
    }
}
BENCHMARK(plookup_elliptic_kernel);

void plookup_gen_perm_sort_kernel(::benchmark::State& state) noexcept
{
    BasicPlonkKeyAndTranscript data = get_plonk_key_and_transcript();

    using FFTGetter = ProverGenPermSortWidget<ultra_settings>::FFTGetter;
    using FFTKernel = ProverGenPermSortWidget<ultra_settings>::FFTKernel;

    auto polynomials = FFTGetter::get_polynomials(data.key.get(), FFTKernel::get_required_polynomial_ids());
    auto challenges = FFTGetter::get_challenges(
        data.transcript, barretenberg::fr::random_element(), FFTKernel::quotient_required_challenges);

    for (auto _ : state) {
        // NOTE: this simply calls the following 3 functions it does NOT try to replicate ProverPlookupAuxiliaryWidget
        // logic exactly
        barretenberg::fr result{ 0 };
        FFTKernel::accumulate_contribution(polynomials, challenges, result, 0);
    }
}
BENCHMARK(plookup_gen_perm_sort_kernel);

} // namespace proof_system::plonk
