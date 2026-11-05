// CPU emulation of the batched GPU MSM core: implements msm_batch_emul from
// msm_core.hpp as a real bucket-based (Pippenger-style) batched MSM, executing the shared kernel
// functions from msm_kernels_impl.hpp over an emulated grid of blocks and threads, honouring
// CoreConfig::emulated_block_size. Single-threaded: it spawns no threads anywhere. Needs nothing
// beyond the C++ standard library (the -pthread flag used to build this file is a link
// requirement of the test harness, not evidence of threading here).
//
// Algorithm, per call: scalars are scanned once to find the highest bit used anywhere in the
// call and the total count of non-zero scalars (this scan is itself O(total work items), so it
// scales with the input, not with the batch's shape). CoreConfig::window_bits either names an
// explicit window width -- validated against the supported range below, with an out-of-range
// value aborting the process before any result is produced -- or, when it is 0, a width is
// picked automatically from the batch's average non-zero scalars per column. The number of
// windows is then derived from the highest bit actually used, so a batch of narrow scalars never
// touches the higher windows at all, regardless of window_bits. The core then runs one pass per
// window over the batch's flattened work items (one shared grid, not one per column): a zero
// scalar is skipped before any digit is extracted (no bucket work for it, in any window); a
// non-zero scalar's digit for that window selects a per-column bucket that the item's point is
// folded into. Once a window's pass is done, each column's buckets for that window are reduced
// into that window's contribution (kernels::reduce_window_buckets); once every window is done,
// each column's per-window contributions are combined into its final point
// (kernels::combine_window_contributions) and finalized to affine.
#include "msm_kernels_impl.hpp"

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <vector>

namespace bb::gpu_msm {

namespace {

// Supported explicit window_bits range. 0 is not in this range -- it means "pick one
// automatically" -- and is handled before this range is consulted. Any explicit value outside
// [kMinWindowBits, kMaxWindowBits] is a caller mistake and is rejected loudly (see
// fail_window_bits below) rather than silently clamped or allowed to produce a wrong result.
constexpr uint32_t kMinWindowBits = 2;
constexpr uint32_t kMaxWindowBits = 16;

// Aborts the process, after naming window_bits on stderr, unconditionally (not via assert(), so
// this still fires when the caller's build defines NDEBUG).
[[noreturn]] void fail_window_bits(uint32_t window_bits)
{
    std::fprintf(stderr,
                 "msm_batch_emul: unsupported window_bits=%u (supported: 0 to pick automatically, "
                 "or an explicit value in %u..%u)\n",
                 window_bits,
                 kMinWindowBits,
                 kMaxWindowBits);
    std::fflush(stderr);
    std::abort();
}

// Picks a window width from the batch's shape when the caller asks for automatic selection
// (window_bits == 0): wider windows pay off when columns are long (fewer windows needed to cover
// the scalars actually used, at the cost of a per-column, per-window bucket array proportional to
// 2^window_bits), narrower windows pay off when there are many short columns sharing one batch
// (so that per-column bucket bookkeeping does not dominate the batch's real work). The heuristic
// below is the largest power of two not exceeding the batch's average non-zero scalar count per
// column, clamped to the supported range.
uint32_t auto_select_window_bits(uint64_t total_nonzero, uint64_t num_columns)
{
    const uint64_t denom = (num_columns == 0) ? 1 : num_columns;
    const uint64_t avg = total_nonzero / denom;
    uint32_t bits = 0;
    uint64_t probe = 1;
    while (probe <= avg && bits < 63) {
        probe <<= 1;
        bits++;
    }
    if (bits < kMinWindowBits) {
        bits = kMinWindowBits;
    }
    if (bits > kMaxWindowBits) {
        bits = kMaxWindowBits;
    }
    return bits;
}

uint32_t resolve_window_bits(uint32_t requested, uint64_t total_nonzero, uint64_t num_columns)
{
    if (requested == 0) {
        return auto_select_window_bits(total_nonzero, num_columns);
    }
    if (requested < kMinWindowBits || requested > kMaxWindowBits) {
        fail_window_bits(requested);
    }
    return requested;
}

} // namespace

namespace {

template <class F>
std::vector<AffinePoint> msm_batch_emul_impl(std::span<const AffinePoint> points,
                                             std::span<const Column> columns,
                                             const CoreConfig& config)
{
    const uint64_t num_columns = columns.size();

    // Reject an out-of-range explicit window_bits before doing anything else: no bucket work,
    // and no result, is produced in that case.
    if (config.window_bits != 0 && (config.window_bits < kMinWindowBits || config.window_bits > kMaxWindowBits)) {
        fail_window_bits(config.window_bits);
    }

    // Prefix sums of column sizes: offsets[i] is the first global work index belonging to
    // column i, offsets[num_columns] is the total work-item count for this call. A column of
    // size 0 contributes no work items.
    std::vector<uint64_t> offsets(static_cast<size_t>(num_columns) + 1, 0);
    for (uint64_t i = 0; i < num_columns; i++) {
        offsets[static_cast<size_t>(i) + 1] = offsets[static_cast<size_t>(i)] + columns[static_cast<size_t>(i)].size;
    }
    const uint64_t work_items = offsets[static_cast<size_t>(num_columns)];

    // Single scan over every scalar in the call: the highest bit used anywhere (bounds the
    // number of windows -- narrow scalars touch fewer windows, regardless of window_bits) and
    // the count of non-zero scalars (consulted only when window_bits == 0). This scan is
    // O(work_items), the same order as the rest of this function.
    int max_bit = -1;
    uint64_t total_nonzero = 0;
    for (uint64_t c = 0; c < num_columns; c++) {
        const Column& column = columns[static_cast<size_t>(c)];
        for (uint64_t j = 0; j < column.size; j++) {
            const U256& s = column.scalars[static_cast<size_t>(j)];
            if (kernels::is_zero(s)) {
                continue;
            }
            total_nonzero++;
            const int hb = kernels::highest_set_bit(s);
            if (hb > max_bit) {
                max_bit = hb;
            }
        }
    }

    const uint32_t window_bits = resolve_window_bits(config.window_bits, total_nonzero, num_columns);
    const uint32_t num_windows = (max_bit < 0) ? 0 : static_cast<uint32_t>(max_bit / static_cast<int>(window_bits)) + 1;
    const uint32_t num_buckets = 1u << window_bits;

    // CoreConfig::emulated_block_size == 0 is a caller mistake, silently clamped to 1 rather
    // than changing the answer or crashing (in particular, never a division by zero below).
    const uint32_t threads_per_block = (config.emulated_block_size == 0) ? 1u : config.emulated_block_size;

    uint64_t block_count = 0;
    if (work_items != 0) {
        block_count =
            (work_items + static_cast<uint64_t>(threads_per_block) - 1) / static_cast<uint64_t>(threads_per_block);
    }

    std::vector<AffinePoint> results(static_cast<size_t>(num_columns));

    if (num_windows == 0) {
        // No scalar anywhere in this call is non-zero: every column's result is infinity, and no
        // bucket work -- not even one window's worth -- is needed to know that.
        for (auto& r : results) {
            r = AffinePoint{ U256{}, U256{}, true };
        }
        return results;
    }

    // Bucket storage for one window at a time, shared by every column and re-cleared between
    // windows: num_columns * num_buckets JacobianPoints. This is the batch's one shared
    // bucket-accumulation pass -- its iteration count (below) is driven by work_items (the
    // batch's total non-zero-scalar work, since zero scalars are skipped before any bucket
    // touch) times num_windows, never by num_columns times the longest column's size.
    std::vector<kernels::JacobianPoint> buckets(static_cast<size_t>(num_columns) * num_buckets);
    std::vector<kernels::JacobianPoint> contributions(static_cast<size_t>(num_columns) * num_windows,
                                                      kernels::jac_identity<F>());

    const uint32_t segment_log2 = kernels::reduce_segment_log2(window_bits);
    const uint32_t num_segments = kernels::reduce_segment_count(num_buckets, segment_log2);
    std::vector<kernels::JacobianPoint> segment_totals(static_cast<size_t>(num_columns) * num_segments);
    std::vector<kernels::JacobianPoint> segment_runnings(static_cast<size_t>(num_columns) * num_segments);

    for (uint32_t w = 0; w < num_windows; w++) {
        for (auto& b : buckets) {
            b = kernels::jac_identity<F>();
        }

        // Grid loop over this window's work items: one work item per (column, scalar-index)
        // pair, with the block/thread shape derived from threads_per_block and work_items, same
        // as every other grid in this file. All per-thread field/point arithmetic is performed by
        // calling functions defined in msm_kernels_impl.hpp.
        uint64_t col = 0; // monotonically non-decreasing as work_index increases through the loop.
        for (uint64_t block = 0; block < block_count; block++) {
            const uint64_t block_start = block * static_cast<uint64_t>(threads_per_block);
            const uint64_t remaining = work_items - block_start;
            const uint64_t threads_this_block = (static_cast<uint64_t>(threads_per_block) < remaining)
                                                    ? static_cast<uint64_t>(threads_per_block)
                                                    : remaining;
            for (uint64_t thread = 0; thread < threads_this_block; thread++) {
                const uint64_t work_index = block_start + thread;
                while (col + 1 < offsets.size() && offsets[static_cast<size_t>(col) + 1] <= work_index) {
                    col++;
                }
                const Column& column = columns[static_cast<size_t>(col)];
                const uint64_t local_index = work_index - offsets[static_cast<size_t>(col)];
                const U256& scalar = column.scalars[static_cast<size_t>(local_index)];
                if (kernels::is_zero(scalar)) {
                    continue; // Zero scalars never reach digit extraction or a bucket, in any window.
                }
                const uint32_t digit = kernels::scalar_window_digit(scalar, w, window_bits);
                if (digit == 0) {
                    continue; // This window's digit is zero: contributes nothing to any bucket.
                }
                const AffinePoint& point = points[static_cast<size_t>(column.start + local_index)];
                if (point.infinity) {
                    continue; // The point at infinity contributes nothing regardless of digit.
                }
                kernels::JacobianPoint& bucket = buckets[static_cast<size_t>(col) * num_buckets + digit];
                bucket = kernels::kernel_accumulate<F>(bucket, kernels::kernel_bucket_term<F>(point));
            }
        }

        // Reduce this window's buckets into each column's contribution for this window: one work
        // item per (column, segment), then one per column to combine its segments, matching the
        // two device kernels.
        for (uint64_t c = 0; c < num_columns; c++) {
            for (uint32_t s = 0; s < num_segments; s++) {
                const size_t slot = static_cast<size_t>(c) * num_segments + s;
                segment_totals[slot] = kernels::reduce_bucket_segment<F>(&buckets[static_cast<size_t>(c) * num_buckets],
                                                                         num_buckets,
                                                                         segment_log2,
                                                                         s,
                                                                         &segment_runnings[slot]);
            }
            contributions[static_cast<size_t>(c) * num_windows + w] =
                kernels::combine_segment_reductions<F>(&segment_totals[static_cast<size_t>(c) * num_segments],
                                                       &segment_runnings[static_cast<size_t>(c) * num_segments],
                                                       num_segments,
                                                       segment_log2);
        }
    }

    // Finalisation grid: one work item per column, combining its per-window contributions and
    // converting the result into the canonical affine point (handling the point-at-infinity
    // case). This pass's grid shape is derived the same way (from threads_per_block and its own
    // work-item count, the number of columns) but is a separate pass from the per-window grid
    // loop above.
    uint64_t finalize_block_count = 0;
    if (num_columns != 0) {
        finalize_block_count =
            (num_columns + static_cast<uint64_t>(threads_per_block) - 1) / static_cast<uint64_t>(threads_per_block);
    }
    for (uint64_t block = 0; block < finalize_block_count; block++) {
        const uint64_t block_start = block * static_cast<uint64_t>(threads_per_block);
        const uint64_t remaining = num_columns - block_start;
        const uint64_t threads_this_block = (static_cast<uint64_t>(threads_per_block) < remaining)
                                                ? static_cast<uint64_t>(threads_per_block)
                                                : remaining;
        for (uint64_t thread = 0; thread < threads_this_block; thread++) {
            const uint64_t idx = block_start + thread;
            const kernels::JacobianPoint acc = kernels::combine_window_contributions<F>(
                &contributions[static_cast<size_t>(idx) * num_windows], num_windows, window_bits);
            results[static_cast<size_t>(idx)] = kernels::kernel_finalize<F>(acc);
        }
    }
    return results;
}

} // namespace

std::vector<AffinePoint> msm_batch_emul(std::span<const AffinePoint> points,
                                        std::span<const Column> columns,
                                        const CoreConfig& config)
{
    switch (config.curve) {
    case Curve::Bn254:
        return msm_batch_emul_impl<kernels::Bn254BaseField>(points, columns, config);
    case Curve::Grumpkin:
        return msm_batch_emul_impl<kernels::GrumpkinBaseField>(points, columns, config);
    }
    std::fprintf(stderr, "msm_batch_emul: unknown curve %u\n", static_cast<unsigned>(config.curve));
    std::fflush(stderr);
    std::abort();
}

} // namespace bb::gpu_msm
