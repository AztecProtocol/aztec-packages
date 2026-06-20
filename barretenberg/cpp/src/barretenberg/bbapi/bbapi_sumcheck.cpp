#include "barretenberg/bbapi/bbapi_sumcheck.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/relations/relation_parameters.hpp"
#include "barretenberg/sumcheck/sumcheck.hpp"
#include "barretenberg/transcript/transcript.hpp"
#include <algorithm>
#include <chrono>

namespace bb::bbapi {

SumcheckBench::Response SumcheckBench::execute(BB_UNUSED BBApiRequest& request) &&
{
    using Flavor = MegaFlavor;
    using FF = Flavor::FF;
    using Polynomial = bb::Polynomial<FF>;

    const size_t d = static_cast<size_t>(log_n);
    const size_t n = size_t{ 1 } << d;

    // Sparsity: `used_rows` (0 or >= n => dense) trims the dyadic zero tail by giving the
    // witness polynomials an end_index of L, which compute_effective_round_size picks up.
    const bool trim = (used_rows != 0 && static_cast<size_t>(used_rows) < n);
    const size_t L = trim ? std::max<size_t>(2, static_cast<size_t>(used_rows)) : n;

    // Per-relation activation: a row is active iff is_active(i, density_bp). Inactive rows
    // get their relation's selector(s) zeroed below so the real skip() fires there — the
    // same row pattern (block prefix / scattered stride) the GPU skips. Mirrors
    // sparsity.ts::rowActive (basis points; values differ from the GPU run but the zero
    // pattern matches, which is all skip()/effective-size depend on).
    const auto density_bp = [&](size_t r) -> uint32_t { return r < densities.size() ? densities[r] : 10000u; };
    const auto is_active = [&](size_t i, uint32_t bp) -> bool {
        if (bp >= 10000u) {
            return true;
        }
        if (bp == 0u) {
            return false;
        }
        if (structure == 0u) { // block: contiguous active prefix [0, round(density*L))
            const size_t band = static_cast<size_t>((static_cast<uint64_t>(bp) * L + 5000u) / 10000u);
            return i < band;
        }
        // scattered: every round(1/density)-th row active (interleaved)
        const size_t period = std::max<size_t>(1, static_cast<size_t>((10000u + bp / 2u) / bp));
        return (i % period) == 0;
    };
    // Zero `p` on the inactive rows of [start_index, L), leaving active rows random.
    const auto zero_inactive = [&](Polynomial& p, uint32_t bp) {
        if (bp >= 10000u) {
            return;
        }
        for (size_t i = p.start_index(); i < L; ++i) {
            if (!is_active(i, bp)) {
                p.at(i) = FF::zero();
            }
        }
    };

    // Random prover polynomials. Witness polynomials are shiftable (start_index 1) so
    // set_shifted() can derive the shifted views; sizing them to L sets end_index = L
    // (the effective round size). Witness data only on [start_index, L).
    typename Flavor::ProverPolynomials polys;
    for (auto& p : polys.get_precomputed()) {
        p = Polynomial(n);
    }
    for (auto& p : polys.get_witness()) {
        p = trim ? Polynomial::shiftable(L, n) : Polynomial::shiftable(n);
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
        for (size_t i = p.start_index(); i < L; ++i) {
            p.at(i) = FF::random_element();
        }
    }

    // Zero each relation's selector(s) on its inactive rows so Relation::skip() fires on
    // the same pattern as the GPU. Relation order matches the WebGPU descriptors
    // (ALL_RELATIONS / sparsity.ts densities): 0 arith, 1 perm, 2 logderiv, 3 delta,
    // 4 elliptic, 5 memory, 6 nnf, 7 ecc, 8 databus, 9..13 poseidon2.
    if (!densities.empty()) {
        zero_inactive(polys.q_arith, density_bp(0));
        // perm skip is (z_perm - z_perm_shift).is_zero(); zeroing z_perm on a contiguous
        // inactive tail makes z_perm[i] == z_perm_shift[i] == 0 there (block structure).
        zero_inactive(polys.z_perm, density_bp(1));
        zero_inactive(polys.q_lookup, density_bp(2));
        zero_inactive(polys.lookup_read_counts, density_bp(2));
        zero_inactive(polys.q_delta_range, density_bp(3));
        zero_inactive(polys.q_elliptic, density_bp(4));
        zero_inactive(polys.q_memory, density_bp(5));
        zero_inactive(polys.q_nnf, density_bp(6));
        zero_inactive(polys.lagrange_ecc_op, density_bp(7));
        zero_inactive(polys.q_busread, density_bp(8));
        zero_inactive(polys.kernel_calldata_read_counts, density_bp(8));
        zero_inactive(polys.first_app_calldata_read_counts, density_bp(8));
        zero_inactive(polys.second_app_calldata_read_counts, density_bp(8));
        zero_inactive(polys.third_app_calldata_read_counts, density_bp(8));
        zero_inactive(polys.return_data_read_counts, density_bp(8));
        zero_inactive(polys.q_poseidon2_external, density_bp(9));
        zero_inactive(polys.q_poseidon2_external_initial, density_bp(10));
        zero_inactive(polys.q_poseidon2_quad_internal, density_bp(11));
        zero_inactive(polys.q_poseidon2_quad_internal_terminal, density_bp(12));
        zero_inactive(polys.q_poseidon2_transition_entry, density_bp(13));
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
