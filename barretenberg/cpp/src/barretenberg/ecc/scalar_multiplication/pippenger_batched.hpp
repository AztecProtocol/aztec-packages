#pragma once

// Implementation fragment included from scalar_multiplication_fast.cpp inside
// bb::scalar_multiplication, after pippenger_round_parallel is defined.

// Multi-MSM_fast driver for `MSM_fast<>::batch_multi_scalar_mul`. The hot path
// (`CommitmentKey::batch_commit` from `commit_to_wires`) batches K MSMs sharing the same
// SRS subspan. We do NOT interleave K MSMs inside a single parallel_for body — that
// K-multiplies the per-thread working set and forces windows_in_batch=1; the single-MSM_fast
// hot path is tuned to fit ~4 MiB in L2 and we want to preserve that. The loop is just
//   for m in 0..K: run single-MSM_fast dispatch for MSM_fast m.
// The only cross-MSM_fast amortisation is the GLV-doubled point set: when every member of a
// shared-SRS-prefix group wants GLV, we double the prefix once into a shared buffer and
// each per-MSM_fast call aliases its prefix instead of doubling its own.
namespace round_parallel_detail {

// One per shared-SRS-prefix group. Membership is keyed on identical
// `point_arrays[m].data()` pointers — that is the actual sharing relation
// `commit_to_wires` exposes. Static-lifetime so the doubled buffer survives
// across calls (typical workloads commit the same SRS prefix repeatedly).
template <typename Curve> struct BatchMsmGlvGroup {
    const typename Curve::AffineElement* base_ptr = nullptr; // SRS prefix pointer
    size_t group_max_n = 0;                                  // max n_input across MSMs in this group
    std::span<typename Curve::AffineElement> doubled;        // length 2 * group_max_n; aliases a prefix of
                                                             // the master-group buffer (computed once for
                                                             // the largest GLV-using group). Layout
                                                             // `[P_0, φP_0, P_1, φP_1, …]` — the first 2*n
                                                             // entries are the per-MSM_fast view for n ≤ Nmax.
    std::vector<size_t> member_msms;                         // indices into `scalar_arrays` of MSMs in this group
};

} // namespace round_parallel_detail

namespace {
// NOLINTNEXTLINE(readability-function-size, readability-function-cognitive-complexity,
// google-readability-function-size)
template <typename Curve>
void pippenger_round_parallel_batched(std::span<std::span<typename Curve::ScalarField>> scalar_arrays,
                                      std::span<std::span<const typename Curve::AffineElement>> point_arrays,
                                      std::vector<typename Curve::Element>& out_results,
                                      std::span<const uint8_t> dedup_hints = {}) noexcept
{
    using AffineElement = typename Curve::AffineElement;
    using ScalarField = typename Curve::ScalarField;
    using BaseField = typename Curve::BaseField;

    BB_BENCH_NAME("MSM_fast::pippenger_round_parallel_batched");

    const size_t K = scalar_arrays.size();
    BB_ASSERT_EQ(point_arrays.size(), K);
    out_results.assign(K, Curve::Group::point_at_infinity);

    auto hint_for = [&](size_t m) noexcept -> bool { return m < dedup_hints.size() && dedup_hints[m] != 0; };

    if (K == 0) {
        return;
    }
    if (K == 1) {
        const size_t n = std::min(scalar_arrays[0].size(), point_arrays[0].size());
        if (n == 0) {
            return;
        }
        PolynomialSpan<const ScalarField> sp(0, std::span<const ScalarField>(scalar_arrays[0].data(), n));
        out_results[0] = pippenger_round_parallel<Curve>(sp, point_arrays[0], hint_for(0));
        return;
    }

    std::vector<size_t> n_input(K);
    for (size_t m = 0; m < K; ++m) {
        n_input[m] = std::min(scalar_arrays[m].size(), point_arrays[m].size());
    }

    // TEMP (investigation): dump per-batch_commit composition (K + per-MSM size and nonzero
    // density) to check whether real chonk batches are size-homogeneous. Gated by env.
    if (std::getenv("BB_MSM_DEBUG_BATCH") != nullptr) {
        std::string parts;
        for (size_t m = 0; m < K; ++m) {
            size_t nz = 0;
            for (size_t i = 0; i < n_input[m]; ++i) {
                if (!scalar_arrays[m][i].is_zero()) {
                    ++nz;
                }
            }
            const size_t pct = n_input[m] == 0 ? 0 : (100 * nz / n_input[m]);
            parts += " n=" + std::to_string(n_input[m]) + "(nz%=" + std::to_string(pct) + ")";
        }
        info("[batch] K=", K, parts);
    }

    // Group MSMs by shared SRS pointer; one shared GLV-doubled buffer per group, sized to
    // group_max_n. group_uses_glv is a per-group bool but the per-MSM_fast internal dispatch keeps
    // each MSM_fast's own GLV decision in case shared doubling is skipped.
    using GlvGroup = round_parallel_detail::BatchMsmGlvGroup<Curve>;
    std::vector<GlvGroup> glv_groups;

    auto find_or_create_group = [&](const AffineElement* base_ptr, size_t n) -> size_t {
        for (size_t g = 0; g < glv_groups.size(); ++g) {
            if (glv_groups[g].base_ptr == base_ptr) {
                glv_groups[g].group_max_n = std::max(glv_groups[g].group_max_n, n);
                return g;
            }
        }
        GlvGroup g{};
        g.base_ptr = base_ptr;
        g.group_max_n = n;
        glv_groups.push_back(std::move(g));
        return glv_groups.size() - 1;
    };

    std::vector<size_t> msm_to_group(K, std::numeric_limits<size_t>::max());
    for (size_t m = 0; m < K; ++m) {
        if (n_input[m] == 0) {
            continue;
        }
        const size_t g = find_or_create_group(point_arrays[m].data(), n_input[m]);
        glv_groups[g].member_msms.push_back(m);
        msm_to_group[m] = g;
    }

    std::vector<bool> group_uses_glv(glv_groups.size(), false);
    for (size_t g = 0; g < glv_groups.size(); ++g) {
        // GLV decision is per-group on group_max_n. Within a group, every MSM_fast has
        // n[m] <= group_max_n; if group_max_n is in the small-N regime, every MSM_fast
        // is too, so they all want GLV. If group_max_n is in the large-N regime,
        // no MSM_fast in the group wants GLV (they'd be slower with it).
        group_uses_glv[g] = glv_groups[g].group_max_n <= round_parallel_detail::GLV_SMALL_N_THRESHOLD;
    }

    // Build ONE shared GLV-doubled buffer covering the union of every GLV-using group's
    // SRS range, then alias each group's `doubled` into a slice of that buffer.
    //
    // Every production / test caller of batch_multi_scalar_mul is `commitment_key.batch_commit`,
    // which constructs each MSM_fast's point span as `get_monomial_points().subspan(start_index)`
    // — sub-spans of a single contiguous `std::vector<AffineElement>` SRS. So in every
    // batch every group's `base_ptr` lives in the same allocation and offsets are
    // necessarily integer multiples of `sizeof(AffineElement)`. The asserts below
    // catch a future caller that violates that contract.
    std::unique_ptr<AffineElement[]> master_doubled_owner; // NOLINT(cppcoreguidelines-avoid-c-arrays)
    {
        BB_BENCH_NAME("MSM_fast::pippenger_round_parallel_batched/glv_double_points");

        const AffineElement* min_base = nullptr;
        for (size_t g = 0; g < glv_groups.size(); ++g) {
            glv_groups[g].doubled = {};
            if (!group_uses_glv[g]) {
                continue;
            }
            if (min_base == nullptr || std::less<const AffineElement*>{}(glv_groups[g].base_ptr, min_base)) {
                min_base = glv_groups[g].base_ptr;
            }
        }

        if (min_base != nullptr) {
            const auto min_addr = reinterpret_cast<uintptr_t>(min_base);
            size_t max_extent_units = 0;
            for (size_t g = 0; g < glv_groups.size(); ++g) {
                if (!group_uses_glv[g]) {
                    continue;
                }
                const auto base_addr = reinterpret_cast<uintptr_t>(glv_groups[g].base_ptr);
                const uintptr_t offset_bytes = base_addr - min_addr;
                BB_ASSERT_EQ(offset_bytes % sizeof(AffineElement),
                             size_t{ 0 },
                             "GLV group base_ptr not aligned to AffineElement boundary "
                             "(point spans must be subranges of a contiguous AffineElement array)");
                const size_t offset_units = offset_bytes / sizeof(AffineElement);
                const size_t end_units = offset_units + glv_groups[g].group_max_n;
                max_extent_units = std::max(max_extent_units, end_units);
            }

            master_doubled_owner = std::make_unique_for_overwrite<AffineElement[]>(
                2 * max_extent_units); // NOLINT(cppcoreguidelines-avoid-c-arrays)
            AffineElement* const master_buf = master_doubled_owner.get();
            const BaseField beta = BaseField::cube_root_of_unity();
            bb::parallel_for(bb::get_num_cpus(), [&](const ThreadChunk& chunk) {
                for (size_t i : chunk.range(max_extent_units)) {
                    master_buf[2 * i] = min_base[i];
                    master_buf[(2 * i) + 1].x = min_base[i].x * beta;
                    master_buf[(2 * i) + 1].y = -min_base[i].y;
                }
            });

            for (size_t g = 0; g < glv_groups.size(); ++g) {
                if (!group_uses_glv[g]) {
                    continue;
                }
                const auto base_addr = reinterpret_cast<uintptr_t>(glv_groups[g].base_ptr);
                const size_t offset_units = (base_addr - min_addr) / sizeof(AffineElement);
                glv_groups[g].doubled =
                    std::span<AffineElement>(master_buf + (2 * offset_units), 2 * glv_groups[g].group_max_n);
            }
        }
    }

    // Shared dynamically-sized arena for all per-MSM_fast internal calls. Sized to the max
    // requirement across the batch so each MSM_fast finds enough space. Single allocation
    // across the batch (vs one per MSM_fast if we passed {} down). Freed at return.
    // dedup_active varies per MSM_fast (gated by per-MSM_fast hint), so the budget query must
    // mirror the predicate used inside pippenger_round_parallel.
    size_t shared_arena_bytes = 0;
    for (size_t m = 0; m < K; ++m) {
        if (n_input[m] == 0) {
            continue;
        }
        const size_t g = msm_to_group[m];
        const bool ext_glv =
            g != std::numeric_limits<size_t>::max() && group_uses_glv[g] && !glv_groups[g].doubled.empty();
        // The internal short-circuits to trivial_msm_threaded for tiny MSMs, so the hint
        // alone is the right arena-sizing predicate (over-sizing for a path that bails
        // is harmless — under-sizing would crash).
        const bool dedup_active_m = hint_for(m);
        const size_t bytes = compute_arena_bytes_for_msm<Curve>(n_input[m], ext_glv, dedup_active_m);
        shared_arena_bytes = std::max(shared_arena_bytes, bytes);
    }
    std::unique_ptr<std::byte[]> shared_arena_owner; // NOLINT(cppcoreguidelines-avoid-c-arrays)
    std::span<std::byte> shared_arena;
    if (shared_arena_bytes > 0) {
        shared_arena_owner =
            std::make_unique_for_overwrite<std::byte[]>(shared_arena_bytes); // NOLINT(cppcoreguidelines-avoid-c-arrays)
        shared_arena = std::span<std::byte>(shared_arena_owner.get(), shared_arena_bytes);
    }

    // Per-MSM_fast dispatch. Each call runs the full single-MSM_fast pipeline (its own from-Mont and
    // to-Mont, schedule, Stage 1-6b). The only batched amortisation we share is the doubled
    // SRS prefix above; the rest of the hot path runs at single-MSM_fast cost.
    for (size_t m = 0; m < K; ++m) {
        const size_t n = n_input[m];
        if (n == 0) {
            continue;
        }
        PolynomialSpan<const ScalarField> sp(0, std::span<const ScalarField>(scalar_arrays[m].data(), n));

        const size_t g = msm_to_group[m];
        std::span<const AffineElement> external_glv;
        if (g != std::numeric_limits<size_t>::max() && group_uses_glv[g]) {
            // `group.doubled` is interleaved `[P_0, φP_0, …]` of length 2*Nmax. The
            // first 2*n entries are exactly the per-MSM_fast `[P_0, φP_0, …, P_{n-1}, φP_{n-1}]`
            // view, regardless of whether n == Nmax (uniform batch) or n < Nmax (ragged).
            external_glv = std::span<const AffineElement>(glv_groups[g].doubled.data(), 2 * n);
        }

        out_results[m] = pippenger_round_parallel<Curve>(sp, point_arrays[m], hint_for(m), external_glv, shared_arena);
    }
}
} // namespace

template <typename Curve>
std::vector<typename Curve::AffineElement> MSM_fast<Curve>::batch_multi_scalar_mul(
    std::span<const typename Curve::AffineElement> points,
    std::span<PolynomialSpan<typename Curve::ScalarField>> scalars,
    bool handle_edge_cases,
    std::span<const uint8_t> dedup_hints) noexcept
{
    BB_BENCH_NAME("MSM_fast::batch_multi_scalar_mul");
    const size_t k = scalars.size();

    // Adapt the new (single shared points span + per-MSM_fast PolynomialSpan scalars) API to
    // the internal dispatcher, which still takes one point sub-span per MSM_fast. Each MSM_fast's
    // sub-span is `points[start_index .. start_index + size)`; the dispatcher's existing
    // GLV-doubled-buffer grouping then deduplicates across MSMs that fall in the same
    // underlying allocation.
    std::vector<std::span<const AffineElement>> point_subspans;
    std::vector<std::span<ScalarField>> scalar_subspans;
    point_subspans.reserve(k);
    scalar_subspans.reserve(k);
    for (size_t i = 0; i < k; ++i) {
        const size_t start_i = scalars[i].start_index;
        BB_ASSERT_LTE(start_i, points.size(), "scalars[m].start_index exceeds shared points span");
        point_subspans.push_back(points.subspan(start_i, points.size() - start_i));
        scalar_subspans.push_back(scalars[i].span);
    }

    auto hint_for = [&](size_t m) noexcept -> bool { return m < dedup_hints.size() && dedup_hints[m] != 0; };

    if (handle_edge_cases) {
        std::vector<AffineElement> results(k);
        for (size_t i = 0; i < k; ++i) {
            const size_t n = std::min(point_subspans[i].size(), scalar_subspans[i].size());
            PolynomialSpan<const ScalarField> scalar_span(0,
                                                          std::span<const ScalarField>(scalar_subspans[i].data(), n));
            results[i] =
                AffineElement(pippenger_fast<Curve>(scalar_span, point_subspans[i], handle_edge_cases, hint_for(i)));
        }
        return results;
    }

    std::vector<typename Curve::Element> per_msm_jac;
    pippenger_round_parallel_batched<Curve>(scalar_subspans, point_subspans, per_msm_jac, dedup_hints);

    std::vector<AffineElement> results(k);
    for (size_t i = 0; i < k; ++i) {
        results[i] = AffineElement(per_msm_jac[i]);
    }
    return results;
}
