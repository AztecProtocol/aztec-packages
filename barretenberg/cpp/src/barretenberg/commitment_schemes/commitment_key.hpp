// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [Sergei], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

/**
 * @brief Provides interfaces for different 'CommitmentKey' classes.
 */

#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/ref_span.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/ecc/scalar_multiplication/webgpu_msm_hook.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/srs/factories/crs_factory.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <limits>
#include <memory>
#include <string_view>

namespace bb {
/**
 * @brief CommitmentKey object over a pairing group 𝔾₁.
 *
 * @details Commitments are computed as C = [p(x)] = ∑ᵢ aᵢ⋅Gᵢ where Gᵢ is the i-th element of the SRS. For BN254,
 * the SRS is given as a list of 𝔾₁ points { [xʲ]₁ }ⱼ where 'x' is unknown. For Grumpkin, they are random points. The
 * SRS stored in the commitment key is after applying the pippenger_point_table thus being double the size of what is
 * loaded from path.
 */
template <class Curve> class CommitmentKey {

    using Fr = typename Curve::ScalarField;
    using Commitment = typename Curve::AffineElement;

  protected:
    std::shared_ptr<srs::factories::Crs<Curve>> srs;

  public:
    size_t srs_size;

    CommitmentKey() = default;

    static constexpr size_t round_up_to_even(size_t n) { return (n + 1) & ~size_t{ 1 }; }

    /**
     * @brief Construct a new Kate Commitment Key object from existing SRS
     *
     * @param num_points Number of points needed for commitments. Always rounded up to the next even
     * value so that callers which need one extra SRS point (e.g. sparse masking polynomials that
     * round their top pair up to an even index) always fit.
     */
    CommitmentKey(const size_t num_points)
        : srs(srs::get_crs_factory<Curve>()->get_crs(round_up_to_even(num_points)))
        , srs_size(round_up_to_even(num_points))
    {}
    /**
     * @brief Checks the commitment key is properly initialized.
     *
     * @return bool
     */
    bool initialized() const { return srs != nullptr; }

    std::span<Commitment> get_monomial_points() const { return srs->get_monomial_points(); }
    size_t get_monomial_size() const { return srs->get_monomial_size(); }

    /**
     * @brief Uses the ProverSRS to create a commitment to p(X)
     *
     * @param polynomial a univariate polynomial p(X) = ∑ᵢ aᵢ⋅Xⁱ
     * @return Commitment computed as C = [p(x)] = ∑ᵢ aᵢ⋅Gᵢ
     */
    Commitment commit(PolynomialSpan<const Fr> polynomial, bool has_duplicates_hint = false) const
    {
        BB_BENCH_NAME("CommitmentKey::commit");
        std::span<const Commitment> point_table = get_monomial_points();
        size_t consumed_srs = polynomial.start_index + polynomial.size();
        if (consumed_srs > get_monomial_size()) {
            throw_or_abort(format("Attempting to commit to a polynomial that needs ",
                                  consumed_srs,
                                  " points with an SRS of size ",
                                  get_monomial_size()));
        }
        return scalar_multiplication::pippenger_unsafe<Curve>(polynomial, point_table, has_duplicates_hint);
    };
    /**
     * @brief Batch commitment to multiple polynomials
     * @details Uses batch_multi_scalar_mul for more efficient processing when committing to multiple polynomials.
     *          The input polynomials are not const because batch_mul modifies them and then restores them back.
     *
     * @param polynomials vector of polynomial spans to commit to
     * @param has_duplicates_hints optional per-polynomial hints (parallel to polynomials):
     *        a non-zero entry opts that polynomial's MSM into the dedup pre-pass.
     * @return std::vector<Commitment> vector of commitments, one for each polynomial
     */
    std::vector<Commitment> batch_commit(RefSpan<Polynomial<Fr>> polynomials,
                                         std::span<const uint32_t> dedup_infos = {}) const
    {
        BB_BENCH_NAME("CommitmentKey::batch_commit");

        std::vector<PolynomialSpan<Fr>> scalar_spans;
        scalar_spans.reserve(polynomials.size());

        for (auto& polynomial : polynomials) {
            const size_t consumed_srs = polynomial.start_index() + polynomial.size();
            if (consumed_srs > get_monomial_size()) {
                throw_or_abort(format("Attempting to commit to a polynomial that needs ",
                                      consumed_srs,
                                      " points with an SRS of size ",
                                      get_monomial_size()));
            }
            scalar_spans.emplace_back(polynomial.start_index(), polynomial.coeffs());
        }

#ifdef BBERG_WEBGPU_MSM_HOOK
        // Register the full monomial-points SRS with the GPU hook so every commit
        // (a subspan starting at polynomial.start_index()) routes as a prefix-with-
        // offset of one uploaded pool, instead of re-shipping the SRS per MSM.
        // Idempotent — the hook only uploads on the first registration of a session.
        if constexpr (std::is_same_v<Curve, curve::BN254>) {
            const auto monomial = get_monomial_points();
            scalar_multiplication::webgpu_register_full_srs_bn254(monomial.data(), monomial.size());
        }
#endif

        auto results = scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(
            get_monomial_points(), scalar_spans, /*handle_edge_cases=*/false, dedup_infos);
        return std::vector<Commitment>(results.begin(), results.end());
    };

    // helper builder struct for constructing a batch to commit at once
    struct CommitBatch {
        CommitmentKey* key;
        RefVector<Polynomial<Fr>> wires;
        std::vector<std::string> labels;
        // Per-poly dedup channel (parallel to wires): 0 = off, 1 = hinted with no
        // estimate, k >= 2 = hinted with a measured duplicate count of k.
        std::vector<uint32_t> dedup_infos;

        std::vector<Commitment> commit_and_send_to_verifier(auto transcript)
        {
            std::vector<Commitment> commitments = key->batch_commit(wires, dedup_infos);
            for (size_t i = 0; i < commitments.size(); ++i) {
                transcript->send_to_verifier(labels[i], commitments[i]);
            }
            return commitments;
        }

        void add_to_batch(Polynomial<Fr>& poly,
                          const std::string& label,
                          bool has_duplicates_hint = false,
                          uint32_t measured_duplicate_count = 0)
        {
            wires.push_back(poly);
            labels.push_back(label);
            dedup_infos.push_back(has_duplicates_hint ? std::max<uint32_t>(1, measured_duplicate_count)
                                                      : uint32_t{ 0 });
        }
    };

    CommitBatch start_batch() { return CommitBatch{ this, {}, {} }; }
};

} // namespace bb
