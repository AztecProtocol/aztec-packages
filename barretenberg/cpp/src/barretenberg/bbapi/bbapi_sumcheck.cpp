#include "barretenberg/bbapi/bbapi_sumcheck.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include <chrono>

namespace bb::bbapi {

SumcheckBench::Response SumcheckBench::execute(BB_UNUSED BBApiRequest& request) &&
{
    using Flavor = MegaFlavor;
    using FF = Flavor::FF;
    using Polynomial = bb::Polynomial<FF>;

    const size_t d = static_cast<size_t>(log_n);
    const size_t n = size_t{ 1 } << d;

    // Random prover polynomials of size n. Witness polynomials are shiftable
    // (start_index 1) so set_shifted() can derive the shifted views.
    typename Flavor::ProverPolynomials polys;
    for (auto& p : polys.get_precomputed()) {
        p = Polynomial(n);
    }
    for (auto& p : polys.get_witness()) {
        p = Polynomial::shiftable(n);
    }
    for (auto& p : polys.get_shifted()) {
        p = Polynomial(n);
    }
    for (auto& p : polys.get_precomputed()) {
        for (size_t i = 0; i < n; ++i) {
            p.at(i) = FF::random_element();
        }
    }
    for (auto& p : polys.get_witness()) {
        for (size_t i = 1; i < n; ++i) {
            p.at(i) = FF::random_element();
        }
    }
    polys.set_shifted();

    auto transcript = std::make_shared<typename Flavor::Transcript>();
    const FF alpha = FF::random_element();
    std::vector<FF> gate_challenges(d);
    for (auto& g : gate_challenges) {
        g = FF::random_element();
    }
    const RelationParameters<FF> relation_parameters = RelationParameters<FF>::get_random();

    SumcheckProver<Flavor> sumcheck(n, polys, transcript, alpha, gate_challenges, relation_parameters, d);

    const auto t0 = std::chrono::steady_clock::now();
    auto output = sumcheck.prove();
    const auto t1 = std::chrono::steady_clock::now();
    static_cast<void>(output);

    const auto micros = std::chrono::duration_cast<std::chrono::microseconds>(t1 - t0).count();
    return { static_cast<uint64_t>(micros), static_cast<uint32_t>(d) };
}

} // namespace bb::bbapi
