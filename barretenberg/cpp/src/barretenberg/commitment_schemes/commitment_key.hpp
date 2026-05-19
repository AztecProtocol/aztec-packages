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

    struct DedupTraceStats {
        size_t zero_count = 0;
        size_t duplicate_groups = 0;
        size_t duplicate_members = 0;
        size_t duplicate_excess = 0;
    };

    static bool dedup_trace_enabled() { return std::getenv("BB_COMMITMENT_DEDUP_TRACE") != nullptr; }

    static DedupTraceStats compute_dedup_trace_stats(std::span<const Fr> coefficients)
    {
        DedupTraceStats stats;
        std::vector<std::array<uint64_t, 4>> nonzero_values;
        nonzero_values.reserve(coefficients.size());
        for (const auto& coefficient : coefficients) {
            if (coefficient.is_zero()) {
                ++stats.zero_count;
                continue;
            }
            nonzero_values.push_back(
                { coefficient.data[0], coefficient.data[1], coefficient.data[2], coefficient.data[3] });
        }
        std::sort(nonzero_values.begin(), nonzero_values.end());
        for (size_t i = 0; i < nonzero_values.size();) {
            size_t j = i + 1;
            while (j < nonzero_values.size() && nonzero_values[j] == nonzero_values[i]) {
                ++j;
            }
            const size_t group_size = j - i;
            if (group_size > 1) {
                ++stats.duplicate_groups;
                stats.duplicate_members += group_size;
                stats.duplicate_excess += group_size - 1;
            }
            i = j;
        }
        return stats;
    }

    static void trace_commitment_dedup_candidate(std::string_view label,
                                                 size_t batch_index,
                                                 size_t start_index,
                                                 std::span<const Fr> coefficients,
                                                 bool has_duplicates_hint,
                                                 bool include_stats)
    {
        if (!include_stats) {
            info("BB_COMMITMENT_DEDUP_TRACE {\"curve\":\"",
                 Curve::name,
                 "\",\"label\":\"",
                 label,
                 "\",\"batch_index\":",
                 batch_index,
                 ",\"start_index\":",
                 start_index,
                 ",\"size\":",
                 coefficients.size(),
                 ",\"dedup_hint\":",
                 has_duplicates_hint ? "true" : "false",
                 "}");
            return;
        }
        const DedupTraceStats stats = compute_dedup_trace_stats(coefficients);
        info("BB_COMMITMENT_DEDUP_TRACE {\"curve\":\"",
             Curve::name,
             "\",\"label\":\"",
             label,
             "\",\"batch_index\":",
             batch_index,
             ",\"start_index\":",
             start_index,
             ",\"size\":",
             coefficients.size(),
             ",\"dedup_hint\":",
             has_duplicates_hint ? "true" : "false",
             ",\"zero_count\":",
             stats.zero_count,
             ",\"duplicate_groups\":",
             stats.duplicate_groups,
             ",\"duplicate_members\":",
             stats.duplicate_members,
             ",\"duplicate_excess\":",
             stats.duplicate_excess,
             "}");
    }

  protected:
    std::shared_ptr<srs::factories::Crs<Curve>> srs;

  public:
    size_t srs_size;

    CommitmentKey() = default;

    /**
     * @brief Construct a new Kate Commitment Key object from existing SRS
     *
     * @param num_points Number of points needed for commitments
     */
    CommitmentKey(const size_t num_points)
        : srs(srs::get_crs_factory<Curve>()->get_crs(num_points))
        , srs_size(num_points)
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
        if (dedup_trace_enabled()) {
            trace_commitment_dedup_candidate(
                "<single>", 0, polynomial.start_index, polynomial.span, has_duplicates_hint, has_duplicates_hint);
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
                                         std::span<const uint8_t> has_duplicates_hints = {}) const
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

        auto results = scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(
            get_monomial_points(), scalar_spans, /*handle_edge_cases=*/false, has_duplicates_hints);
        return std::vector<Commitment>(results.begin(), results.end());
    };

    // helper builder struct for constructing a batch to commit at once
    struct CommitBatch {
        CommitmentKey* key;
        RefVector<Polynomial<Fr>> wires;
        std::vector<std::string> labels;
        std::vector<const Polynomial<Fr>*> tail_polys; // optional ZK masking tails (parallel to wires)
        std::vector<uint8_t> has_duplicates_hints;     // per-poly dedup opt-in (parallel to wires)

        std::vector<Commitment> commit_and_send_to_verifier(auto transcript)
        {
            if (CommitmentKey::dedup_trace_enabled()) {
                for (size_t i = 0; i < wires.size(); ++i) {
                    const bool has_hint = i < has_duplicates_hints.size() && has_duplicates_hints[i] != 0;
                    CommitmentKey::trace_commitment_dedup_candidate(
                        labels[i], i, wires[i].start_index(), wires[i].coeffs(), has_hint, has_hint);
                }
            }
            std::vector<Commitment> commitments = key->batch_commit(wires, has_duplicates_hints);

            // Adjust commitments for wires with masking tails: C' = C_short + commit(tail)
            for (size_t i = 0; i < commitments.size(); ++i) {
                if (i < tail_polys.size() && tail_polys[i] != nullptr && !tail_polys[i]->is_empty()) {
                    commitments[i] = commitments[i] + key->commit(*tail_polys[i]);
                }
                transcript->send_to_verifier(labels[i], commitments[i]);
            }

            return commitments;
        }

        void add_to_batch(Polynomial<Fr>& poly,
                          const std::string& label,
                          const Polynomial<Fr>* tail = nullptr,
                          bool has_duplicates_hint = false)
        {
            wires.push_back(poly);
            labels.push_back(label);
            tail_polys.push_back(tail);
            has_duplicates_hints.push_back(has_duplicates_hint ? uint8_t{ 1 } : uint8_t{ 0 });
        }
    };

    CommitBatch start_batch() { return CommitBatch{ this, {}, {} }; }
};

} // namespace bb
