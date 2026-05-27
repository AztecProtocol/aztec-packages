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
#include "barretenberg/common/ref_span.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/srs/factories/crs_factory.hpp"
#include "barretenberg/srs/global_crs.hpp"

#ifdef BBERG_WEBGPU_MSM_HOOK
#include "barretenberg/common/log.hpp"
#include "barretenberg/ecc/scalar_multiplication/webgpu_msm_hook.hpp"
#include <chrono>
#include <iomanip>
#include <sstream>
#endif

#include <cstddef>
#include <cstdlib>
#include <limits>
#include <memory>
#include <source_location>
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
    Commitment commit(PolynomialSpan<const Fr> polynomial,
                      [[maybe_unused]] std::string_view label = "",
                      [[maybe_unused]] std::source_location loc = std::source_location::current()) const
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
#ifdef BBERG_WEBGPU_MSM_HOOK
        // CSV / WebGPU / distribution mode: route this solo commit through
        // `batch_multi_scalar_mul` as a size-1 batch so the label flows down
        // to per-MSM telemetry.
        //   - csv_mode: solo commit logs [msm-csv-cpu] with the label
        //   - webgpu enabled: solo commit can be delegated to the GPU bridge
        //     (subject to WEBGPU_MSM_THRESHOLD) so big single commits like
        //     `gemini_masking_poly` (n=131_072) actually use the GPU
        //   - distribution mode: [msm-dist] line names the column it came
        //     from, falling back to "<file>:<line>" when the caller didn't
        //     pass a `label` so the unlabelled commit() sites in the prover
        //     (KZG quotient, IPA self-commit, sumcheck round univariates,
        //     masking-tail adjustments, etc.) are still distinguishable in
        //     the CSV.
        // Production path (all three off) keeps the bare pippenger_unsafe to
        // avoid the size-1-batch overhead.
        if constexpr (std::is_same_v<Curve, curve::BN254>) {
            if (scalar_multiplication::msm_csv_mode_enabled() || scalar_multiplication::webgpu_msm_runtime_enabled() ||
                scalar_multiplication::msm_distribution_mode_enabled()) {
                // batch_multi_scalar_mul needs writable scalar spans (the native
                // path temporarily modifies them and restores). Cast away const
                // — pippenger_unsafe also receives a `PolynomialSpan<const Fr>`
                // but downstream affine_pippenger does the same mutate-restore
                // trick, so this is consistent with the existing contract.
                auto* scalars_ptr = const_cast<Fr*>(polynomial.span.data());
                std::span<Fr> scalars_writable{ scalars_ptr, polynomial.size() };
                std::span<const Commitment> points = point_table.subspan(polynomial.start_index);
                std::array<std::span<const Commitment>, 1> p{ points };
                std::array<std::span<Fr>, 1> s{ scalars_writable };
                std::string lbl_str;
                if (!label.empty()) {
                    lbl_str.assign(label.data(), label.size());
                } else {
                    // Derive a stable identifier from the call site so the
                    // distribution-mode CSV pinpoints unlabelled commit()
                    // callers (kzg.hpp, ipa.hpp, sumcheck.hpp, etc.).
                    const char* path = loc.file_name();
                    const char* base = path;
                    for (const char* p2 = path; *p2 != '\0'; ++p2) {
                        if (*p2 == '/') {
                            base = p2 + 1;
                        }
                    }
                    lbl_str = std::string{ base } + ":" + std::to_string(loc.line());
                }
                std::array<std::string, 1> lbls{ lbl_str };
                return scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(p, s, false, lbls)[0];
            }
        }
#endif
        return scalar_multiplication::pippenger_unsafe<Curve>(polynomial, point_table);
    };
    /**
     * @brief Batch commitment to multiple polynomials
     * @details Uses batch_multi_scalar_mul for more efficient processing when committing to multiple polynomials.
     *          The input polynomials are not const because batch_mul modifies them and then restores them back.
     *
     * @param polynomials vector of polynomial spans to commit to
     * @return std::vector<Commitment> vector of commitments, one for each polynomial
     */
    std::vector<Commitment> batch_commit(RefSpan<Polynomial<Fr>> polynomials,
                                         size_t max_batch_size = std::numeric_limits<size_t>::max(),
                                         std::span<const std::string> labels = {}) const
    {
        BB_BENCH_NAME("CommitmentKey::batch_commit");

        // We can only commit max_batch_size at a time
        // This is to prevent excessive memory usage in the pippenger algorithm
        // First batch, create the commitments vector
        std::vector<Commitment> commitments;

        for (size_t i = 0; i < polynomials.size();) {
            // Note: have to be careful how we compute this to not overlow e.g. max_batch_size + 1 would
            size_t batch_size = std::min(max_batch_size, polynomials.size() - i);
            size_t batch_end = i + batch_size;

            // Prepare spans for batch MSM
            std::vector<std::span<const Commitment>> points_spans;
            std::vector<std::span<Fr>> scalar_spans;

            for (auto& polynomial : polynomials.subspan(i, batch_end - i)) {
                size_t consumed_srs = polynomial.start_index() + polynomial.size();
                if (consumed_srs > get_monomial_size()) {
                    throw_or_abort(format("Attempting to commit to a polynomial that needs ",
                                          consumed_srs,
                                          " points with an SRS of size ",
                                          get_monomial_size()));
                }
                std::span<const Commitment> point_table = get_monomial_points().subspan(polynomial.start_index());
                scalar_spans.emplace_back(polynomial.coeffs());
                points_spans.emplace_back(point_table);
            }

#ifdef BBERG_WEBGPU_MSM_HOOK
            // Register the full monomial-points SRS with the GPU hook so every
            // commit (each one a subspan starting at `polynomial.start_index()`)
            // routes as a prefix-with-offset of the same uploaded pool, instead
            // of forcing a per-commit re-upload. Idempotent — the hook only does
            // the upload on the first registration of a session. No-op when the
            // runtime flag is off.
            if constexpr (std::is_same_v<Curve, curve::BN254>) {
                const auto monomial = get_monomial_points();
                scalar_multiplication::webgpu_register_full_srs_bn254(monomial.data(), monomial.size());
            }
#endif
            // Perform batch MSM. Slice labels parallel to the polynomial sub-batch
            // we're processing so the WebGPU bridge can name per-MSM telemetry.
            std::span<const std::string> labels_slice;
            if (!labels.empty() && labels.size() == polynomials.size()) {
                labels_slice = labels.subspan(i, batch_end - i);
            }
            auto results = scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(
                points_spans, scalar_spans, false, labels_slice);
            for (const auto& result : results) {
                commitments.emplace_back(result);
            }
            i += batch_size;
        }
        return commitments;
    };

    // helper builder struct for constructing a batch to commit at once
    struct CommitBatch {
        CommitmentKey* key;
        RefVector<Polynomial<Fr>> wires;
        std::vector<std::string> labels;
        std::vector<const Polynomial<Fr>*> tail_polys; // optional ZK masking tails (parallel to wires)

        std::vector<Commitment> commit_and_send_to_verifier(auto transcript,
                                                            size_t max_batch_size = std::numeric_limits<size_t>::max())
        {
            std::vector<Commitment> commitments = key->batch_commit(wires, max_batch_size, labels);

            // Adjust commitments for wires with masking tails: C' = C_short + commit(tail)
            for (size_t i = 0; i < commitments.size(); ++i) {
                if (i < tail_polys.size() && tail_polys[i] != nullptr && !tail_polys[i]->is_empty()) {
                    commitments[i] = commitments[i] + key->commit(*tail_polys[i]);
                }
                transcript->send_to_verifier(labels[i], commitments[i]);
            }

            return commitments;
        }

        void add_to_batch(Polynomial<Fr>& poly, const std::string& label, const Polynomial<Fr>* tail = nullptr)
        {
            wires.push_back(poly);
            labels.push_back(label);
            tail_polys.push_back(tail);
        }
    };

    CommitBatch start_batch() { return CommitBatch{ this, {}, {} }; }
};

} // namespace bb
