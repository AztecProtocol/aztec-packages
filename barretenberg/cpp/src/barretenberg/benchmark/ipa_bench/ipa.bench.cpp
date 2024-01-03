#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include <benchmark/benchmark.h>

using namespace benchmark;
using namespace barretenberg;
using namespace proof_system;
using namespace proof_system::honk::pcs::ipa;
namespace {

void ipa_open(State& state) noexcept
{
    numeric::random::Engine& engine = numeric::random::get_debug_engine();
    using Curve = curve::Grumpkin;
    using Fr = Curve::ScalarField;
    using IPA = IPA<Curve>;
    using OpeningPair = honk::pcs::OpeningPair<Curve>;
    // using OpeningClaim = honk::pcs::OpeningClaim<Curve>;
    using Polynomial = Polynomial<Curve::ScalarField>;
    using CommitmentKey = honk::pcs::CommitmentKey<Curve>;
    std::shared_ptr<barretenberg::srs::factories::CrsFactory<curve::Grumpkin>> crs_factory(
        new barretenberg::srs::factories::FileCrsFactory<curve::Grumpkin>("../srs_db/grumpkin", 1 << 16));
    auto ck = std::make_shared<CommitmentKey>(1 << 16, crs_factory);

    for (auto _ : state) {
        state.PauseTiming();
        // Construct the polynomial
        size_t n = 1 << static_cast<size_t>(state.range(0));
        Polynomial poly(n);
        for (size_t i = 0; i < n; ++i) {
            poly[i] = Fr::random_element(&engine);
        }
        // auto commitment = ck->commit(poly);
        auto x = Fr::random_element(&engine);
        auto eval = poly.evaluate(x);
        const OpeningPair opening_pair = { x, eval };
        // initialize empty prover transcript
        auto prover_transcript = std::make_shared<honk::BaseTranscript>();
        state.ResumeTiming();
        IPA::compute_opening_proof(ck, opening_pair, poly, prover_transcript);
    }
}
} // namespace
BENCHMARK(ipa_open)->Unit(kMillisecond)->DenseRange(10, 16);
BENCHMARK_MAIN();