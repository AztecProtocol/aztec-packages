#pragma once

// Implementation fragment included from scalar_multiplication_fast.cpp inside
// bb::scalar_multiplication.

// Trivial-N fallback. For small n the Pippenger scaffolding (digit extraction, bucket
// scratch allocation, parallel_for dispatch, GLV split, etc.) costs many times more
// than running a Straus-style simultaneous double-and-add in Jacobian. Delegates to
// `Element::straus_msm`, which on endomorphism curves builds a per-point WNAF lookup
// table and amortises ~128 doublings across all N inputs (vs N×128 for naive
// per-point operator*). Robust to all edge cases (zero scalars, points at infinity)
// so this also covers `handle_edge_cases=true` for trivially small N. The single
// Jacobian→affine inversion at the caller boundary (when `MSM_fast<>::msm` constructs an
// `AffineElement` from the returned `Element`) is the only inversion paid.
template <typename Curve>
typename Curve::Element trivial_msm(PolynomialSpan<const typename Curve::ScalarField> scalars_span,
                                    std::span<const typename Curve::AffineElement> all_points) noexcept
{
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using ScalarField = typename Curve::ScalarField;

    const size_t n = scalars_span.size();
    if (n == 0) {
        return Curve::Group::point_at_infinity;
    }
    BB_ASSERT_GTE(all_points.size(), scalars_span.start_index + n);
    std::span<const AffineElement> points_view(&all_points[scalars_span.start_index], n);
    std::span<const ScalarField> scalars_view(scalars_span.span.data(), n);
    return Element::straus_msm(points_view, scalars_view);
}

/**
 * @brief Multi-threaded straus_msm driver for very-small MSMs.
 *
 * Splits the input across `bb::parallel_for` workers and runs `Element::straus_msm` on
 * each slice. Zero-scalar entries are compacted out before dispatch (callers reach this
 * function precisely when n_active << n, so straus_msm shouldn't burn time on dead pairs).
 * Running on the shared `bb::parallel_for` pool keeps per-call dispatch cheap.
 */
template <typename Curve>
typename Curve::Element trivial_msm_threaded(PolynomialSpan<const typename Curve::ScalarField> scalars_span,
                                             std::span<const typename Curve::AffineElement> all_points,
                                             size_t max_threads) noexcept
{
    using Element = typename Curve::Element;
    using AffineElement = typename Curve::AffineElement;
    using ScalarField = typename Curve::ScalarField;
    const size_t n = scalars_span.size();
    if (n == 0) {
        return Curve::Group::point_at_infinity;
    }
    BB_ASSERT_GTE(all_points.size(), scalars_span.start_index + n);

    // Strip zero-scalar entries before dispatching to straus_msm. straus_msm has
    // non-trivial per-scalar fixed cost (per-window bias decode + bucket scatter), and
    // when this function fires from the n_active-based fallback in
    // pippenger_round_parallel the input span often contains many zeros (the
    // dispatch fired precisely because n_active << n). Compacting once up front saves
    // straus_msm one pass over the dead entries on every worker slice.
    std::vector<ScalarField> compact_scalars;
    std::vector<AffineElement> compact_points;
    compact_scalars.reserve(n);
    compact_points.reserve(n);
    const ScalarField* src_scalars = scalars_span.span.data();
    const AffineElement* src_points = all_points.data() + scalars_span.start_index;
    for (size_t i = 0; i < n; ++i) {
        if (!src_scalars[i].is_zero()) {
            compact_scalars.push_back(src_scalars[i]);
            compact_points.push_back(src_points[i]);
        }
    }
    const size_t n_active = compact_scalars.size();
    if (n_active == 0) {
        return Curve::Group::point_at_infinity;
    }

    // One task per OS worker, not lmul-oversubscribed — straus_msm slices have
    // non-trivial fixed cost so dynamic-claim averaging isn't worth the extra
    // dispatch tax at the trivial-MSM_fast sizes this function handles. A caller's
    // max_threads cap (or `bb::get_num_cpus() <= 1`, the chonk-batch-verifier
    // serial gate) routes through the `<= 1` early-return below, keeping capped
    // calls off the thread pool entirely.
    const size_t pool_threads = max_threads == 0 ? bb::get_num_cpus() : std::min(max_threads, bb::get_num_cpus());
    const size_t num_threads = std::min(n_active, pool_threads);
    if (num_threads <= 1) {
        std::span<const AffineElement> pts(compact_points.data(), n_active);
        std::span<const ScalarField> scs(compact_scalars.data(), n_active);
        return Element::straus_msm(pts, scs);
    }

    // Each worker runs `Element::straus_msm` over its slice. Note that straus_msm
    // accepts Montgomery-form scalars (it converts internally), so callers must pass
    // Montgomery-form scalars on entry to this function.
    std::vector<Element> partials(num_threads, Curve::Group::point_at_infinity);
    bb::parallel_for(num_threads, [&](size_t tid) {
        const size_t lo = (tid * n_active) / num_threads;
        const size_t hi = ((tid + 1) * n_active) / num_threads;
        const size_t slice_n = hi - lo;
        if (slice_n == 0) {
            return;
        }
        std::span<const AffineElement> pts(compact_points.data() + lo, slice_n);
        std::span<const ScalarField> scs(compact_scalars.data() + lo, slice_n);
        partials[tid] = Element::straus_msm(pts, scs);
    });
    Element total_result = partials[0];
    for (size_t t = 1; t < num_threads; ++t) {
        total_result += partials[t];
    }
    return total_result;
}
