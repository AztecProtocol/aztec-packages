#include "webgpu_msm_hook.hpp"

#ifdef BBERG_WEBGPU_MSM_HOOK

#include <array>
#include <atomic>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/common/wasm_export.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "webgpu_msm_marshalling.hpp"

namespace bb::scalar_multiplication {

namespace {

// Full monomial-points SRS as registered by CommitmentKey. The hook never
// uploads more than `g_full_srs_count` points; the actual uploaded prefix
// (`g_published_srs_count`) grows on demand as larger MSMs arrive. Saves
// the 64 MiB up-front upload that a 2^20 SRS would otherwise cost when
// the prover only ever touches a 88_899-point prefix.
//
// Atomic to be paranoia-safe; in practice the WASM build is single-threaded
// under NO_MULTITHREADING.
std::atomic<const uint8_t*> g_full_srs_base{ nullptr };
std::atomic<uint32_t> g_full_srs_count{ 0 };

// The SRS prefix currently uploaded to the GPU (always [g_full_srs_base,
// g_full_srs_base + g_published_srs_count*POINT_BYTES)).
std::atomic<const uint8_t*> g_published_srs_base{ nullptr };
std::atomic<uint32_t> g_published_srs_count{ 0 };

// Initial upload cap. 2^18 = 262_144 points = ~16 MiB of canonical bytes,
// ~16 MiB of GPU memory after Montgomery conversion. Big enough that real
// commit batches in the canonical Chonk flows (largest seen: ~88_899)
// never trigger a grow, small enough that a session that never crosses
// this threshold pays only the prefix cost.
constexpr uint32_t INITIAL_PUBLISH_COUNT = 1u << 18;

// Runtime gate. Default off — even with BBERG_WEBGPU_MSM_HOOK compiled
// in, the hook stays dormant until JS calls bb_set_webgpu_msm_enabled(1).
// Avoids attempting the bridge import in environments where the bridge
// has not been wired up.
std::atomic<bool> g_webgpu_msm_enabled{ false };

// CSV-measurement mode. When set, MSM::batch_multi_scalar_mul runs every
// MSM SOLO instead of batching across threads, times each one, and emits
// a `[msm-csv-cpu]` log line per MSM (so an external script can merge it
// with the bridge's `[msm]` GPU-timing log into a per-MSM CSV). Off in
// production — turns batched multi-MSM Pippenger into one-MSM-at-a-time
// (much slower) but makes per-MSM CPU timing well-defined.
std::atomic<bool> g_msm_csv_mode{ false };

// Marshal + ship the first `count` points of g_full_srs_base. Replaces
// any previously-uploaded pool on the JS side (bb_publish_srs_bn254
// destroys the prior MsmV2Pool and rebuilds from the new bytes). Updates
// g_published_srs_{base,count}.
void publish_srs_prefix(uint32_t count) noexcept
{
    using webgpu_marshalling::marshal_points;
    const auto* base_bytes = g_full_srs_base.load(std::memory_order_relaxed);
    const auto* base_pts = reinterpret_cast<const curve::BN254::AffineElement*>(base_bytes);
    std::vector<uint8_t> srs_bytes =
        marshal_points(std::span<const curve::BN254::AffineElement>(base_pts, count));
    bb_publish_srs_bn254(srs_bytes.data(), count);
    g_published_srs_base.store(base_bytes, std::memory_order_relaxed);
    g_published_srs_count.store(count, std::memory_order_relaxed);
}

} // namespace

bool webgpu_msm_runtime_enabled() noexcept
{
    return g_webgpu_msm_enabled.load(std::memory_order_relaxed);
}

bool msm_csv_mode_enabled() noexcept
{
    return g_msm_csv_mode.load(std::memory_order_relaxed);
}

void set_msm_csv_mode(bool on) noexcept
{
    g_msm_csv_mode.store(on, std::memory_order_relaxed);
}

// Helper that lives at the namespace scope so the WASM_EXPORT setter below
// (declared at file scope) can qualified-call it. The atomic itself stays
// in the anonymous namespace; only the setter is exposed.
void set_webgpu_msm_enabled(bool on) noexcept
{
    g_webgpu_msm_enabled.store(on, std::memory_order_relaxed);
}

void webgpu_register_full_srs_bn254(const curve::BN254::AffineElement* base, std::size_t count) noexcept
{
    if (!g_webgpu_msm_enabled.load(std::memory_order_relaxed)) {
        return;
    }
    if (count == 0) {
        return;
    }
    const uint8_t* base_bytes = reinterpret_cast<const uint8_t*>(base);
    const uint8_t* prev_full_base = g_full_srs_base.load(std::memory_order_relaxed);
    if (prev_full_base == base_bytes) {
        // Same SRS as already registered — bump the recorded upper bound
        // if the caller now knows a larger count. The published prefix grows
        // lazily inside the dispatcher when a commit actually needs it.
        if (static_cast<uint32_t>(count) > g_full_srs_count.load(std::memory_order_relaxed)) {
            g_full_srs_count.store(static_cast<uint32_t>(count), std::memory_order_relaxed);
        }
        return;
    }
    // First time we see this base (or a different SRS replaced the old one).
    // Record bounds; do the small initial upload — the dispatcher grows it
    // lazily when a commit needs more.
    g_full_srs_base.store(base_bytes, std::memory_order_relaxed);
    g_full_srs_count.store(static_cast<uint32_t>(count), std::memory_order_relaxed);
    const uint32_t initial = std::min(static_cast<uint32_t>(count), INITIAL_PUBLISH_COUNT);
    publish_srs_prefix(initial);
}

std::vector<curve::BN254::AffineElement> batch_multi_scalar_mul_webgpu_bn254(
    std::span<std::span<const curve::BN254::AffineElement>> points,
    std::span<std::span<curve::BN254::ScalarField>> scalars,
    std::span<const std::string> labels) noexcept
{
    const bool have_labels = !labels.empty() && labels.size() == points.size();
    using webgpu_marshalling::combine_windows;
    using webgpu_marshalling::marshal_points;
    using webgpu_marshalling::marshal_scalars;

    const size_t batch_size = points.size();
    std::vector<curve::BN254::AffineElement> results;
    results.reserve(batch_size);

    const uint8_t* srs_base = g_published_srs_base.load(std::memory_order_relaxed);
    uint32_t srs_count = g_published_srs_count.load(std::memory_order_relaxed);
    const uint32_t full_count = g_full_srs_count.load(std::memory_order_relaxed);
    constexpr std::size_t POINT_BYTES = 64;

    // Adaptive SRS upload: walk the batch first to find the largest prefix
    // any commit in it needs (offset + n for in-SRS spans), and grow the
    // published pool if the current prefix is too small. Doubling growth so
    // a session that reaches the SRS top pays only O(log N) re-uploads.
    if (srs_base != nullptr) {
        uint32_t needed_end = srs_count;
        for (size_t i = 0; i < batch_size; ++i) {
            const size_t n = scalars[i].size();
            if (n == 0 || !webgpu_msm_should_delegate(n)) {
                continue;
            }
            const auto* pts = reinterpret_cast<const uint8_t*>(points[i].data());
            if (pts < srs_base) {
                continue; // off-SRS; will be marshalled inline
            }
            const std::size_t byte_off = static_cast<std::size_t>(pts - srs_base);
            if ((byte_off % POINT_BYTES) != 0) {
                continue; // misaligned; off-SRS path below
            }
            const uint32_t off_pts = static_cast<uint32_t>(byte_off / POINT_BYTES);
            if (off_pts >= full_count) {
                continue; // outside registered SRS
            }
            const uint64_t end = static_cast<uint64_t>(off_pts) + n;
            if (end <= full_count && end > needed_end) {
                needed_end = static_cast<uint32_t>(end);
            }
        }
        if (needed_end > srs_count) {
            // Grow doubling, capped by full_count.
            uint32_t new_count = srs_count == 0 ? needed_end : srs_count;
            while (new_count < needed_end) {
                new_count = new_count > full_count / 2 ? full_count : new_count * 2;
            }
            if (new_count > full_count) {
                new_count = full_count;
            }
            publish_srs_prefix(new_count);
            srs_count = new_count;
        }
    }

    // Two-pass strategy. Pass 1 walks the batch: tiny MSMs (< threshold)
    // and off-SRS MSMs are computed inline (native or per-MSM bridge call);
    // every SRS-prefix MSM at or above the threshold is added to the batch
    // descriptor table. Pass 2 fires ONE bb_external_batch_msm_bn254 with
    // the whole table — the host runs everything in a single GPU submit +
    // one mapAsync (eliminates the dominant per-MSM Chrome polling
    // overhead). Pass 3 reads back per-MSM results and Horner-combines.
    constexpr uint32_t MAX_WINDOWS = 64;
    results.resize(batch_size, curve::BN254::AffineElement::infinity());

    struct BatchItem {
        size_t result_index;     // index into `results`
        uint32_t n;
        uint32_t srs_offset;
        uint32_t scalars_byte_off; // offset into the contiguous scalars region
        uint32_t result_byte_off;  // offset into the contiguous results region
    };
    std::vector<BatchItem> batch_items;
    batch_items.reserve(batch_size);
    std::size_t total_scalars_bytes = 0;
    std::size_t total_results_bytes = 0;

    for (size_t i = 0; i < batch_size; ++i) {
        const size_t n = scalars[i].size();
        if (n == 0) {
            results[i] = curve::BN254::AffineElement::infinity();
            continue;
        }
        if (!webgpu_msm_should_delegate(n)) {
            std::array<std::span<const curve::BN254::AffineElement>, 1> p{ points[i].subspan(0, n) };
            std::array<std::span<curve::BN254::ScalarField>, 1> s{ scalars[i] };
            results[i] = MSM<curve::BN254>::batch_multi_scalar_mul_native(p, s, false)[0];
            continue;
        }
        // SRS-prefix detection (range check, byte-aligned).
        const auto* pts = reinterpret_cast<const uint8_t*>(points[i].data());
        const bool is_srs_prefix = srs_base != nullptr && pts >= srs_base &&
                                   pts + n * POINT_BYTES <= srs_base + static_cast<size_t>(srs_count) * POINT_BYTES &&
                                   (static_cast<size_t>(pts - srs_base) % POINT_BYTES) == 0;
        if (!is_srs_prefix) {
            // Off-SRS MSM: keep the legacy per-MSM bridge call. Rare once
            // CommitmentKey has registered the monomial-points SRS.
            std::vector<uint8_t> points_bytes = marshal_points(points[i].subspan(0, n));
            std::vector<uint8_t> scalars_bytes = marshal_scalars(scalars[i]);
            uint8_t result_bytes[MAX_WINDOWS * 64];
            const uint32_t meta = bb_external_msm_bn254(
                points_bytes.data(), scalars_bytes.data(), static_cast<uint32_t>(n), result_bytes, 0);
            const uint32_t num_windows = meta >> 16;
            const uint32_t c = meta & 0xffffu;
            BB_ASSERT(num_windows <= MAX_WINDOWS, "webgpu MSM: num_windows exceeds the 64-window result buffer");
            results[i] = combine_windows(result_bytes, num_windows, c);
            continue;
        }
        const uint32_t srs_offset = static_cast<uint32_t>(static_cast<std::size_t>(pts - srs_base) / POINT_BYTES);
        batch_items.push_back({ i,
                                static_cast<uint32_t>(n),
                                srs_offset,
                                static_cast<uint32_t>(total_scalars_bytes),
                                static_cast<uint32_t>(total_results_bytes) });
        total_scalars_bytes += n * 32;
        total_results_bytes += MAX_WINDOWS * 64; // over-allocate; per-MSM
                                                 // num_windows lives in meta
    }

    if (!batch_items.empty()) {
        // Pack descriptors + scalars contiguously, allocate result + meta
        // regions, and dispatch the single batched bridge call.
        constexpr std::size_t DESC_WORDS = 5;
        std::vector<uint32_t> descriptors(batch_items.size() * DESC_WORDS);
        std::vector<uint8_t> scalars_packed(total_scalars_bytes);
        std::vector<uint8_t> results_packed(total_results_bytes);
        std::vector<uint32_t> meta(batch_items.size() * 2);
        // Labels packed as [u8 len, len bytes ASCII] per MSM, in
        // batch_items order. Empty when no labels were passed in.
        std::vector<uint8_t> labels_packed;
        if (have_labels) {
            std::size_t labels_bytes = 0;
            for (const auto& it : batch_items) {
                const std::string& lbl = labels[it.result_index];
                labels_bytes += 1 + std::min<std::size_t>(255, lbl.size());
            }
            labels_packed.reserve(labels_bytes);
        }
        for (size_t k = 0; k < batch_items.size(); ++k) {
            const auto& it = batch_items[k];
            descriptors[k * DESC_WORDS + 0] = it.n;
            descriptors[k * DESC_WORDS + 1] = it.srs_offset;
            descriptors[k * DESC_WORDS + 2] = it.scalars_byte_off;
            descriptors[k * DESC_WORDS + 3] = it.result_byte_off;
            descriptors[k * DESC_WORDS + 4] = 0; // reserved
            // Marshal this MSM's scalars into the contiguous region. Same
            // canonical LE non-Montgomery encoding marshal_scalars uses for
            // the single-MSM path.
            std::vector<uint8_t> sbytes = marshal_scalars(scalars[it.result_index]);
            std::memcpy(scalars_packed.data() + it.scalars_byte_off, sbytes.data(), it.n * 32);
            if (have_labels) {
                const std::string& lbl = labels[it.result_index];
                const std::size_t lbl_len = std::min<std::size_t>(255, lbl.size());
                labels_packed.push_back(static_cast<uint8_t>(lbl_len));
                labels_packed.insert(labels_packed.end(),
                                     lbl.begin(),
                                     lbl.begin() + static_cast<std::string::difference_type>(lbl_len));
            }
        }
        bb_external_batch_msm_bn254(static_cast<uint32_t>(batch_items.size()),
                                    reinterpret_cast<const uint8_t*>(descriptors.data()),
                                    scalars_packed.data(),
                                    results_packed.data(),
                                    reinterpret_cast<uint8_t*>(meta.data()),
                                    have_labels ? labels_packed.data() : nullptr);
        // Horner-combine each MSM's windowSums.
        for (size_t k = 0; k < batch_items.size(); ++k) {
            const auto& it = batch_items[k];
            const uint32_t num_windows = meta[k * 2 + 0];
            const uint32_t c = meta[k * 2 + 1];
            BB_ASSERT(num_windows <= MAX_WINDOWS, "webgpu batch MSM: num_windows exceeds the 64-window result buffer");
            results[it.result_index] = combine_windows(results_packed.data() + it.result_byte_off, num_windows, c);
        }
    }

    return results;
}

} // namespace bb::scalar_multiplication

// ---------------------------------------------------------------------------
// Runtime on/off setter. Called from JS during init: when the WebGPU bridge
// is installed and ready (setupWebGpuMsmBridge in barretenberg/ts/src/msm_webgpu),
// JS flips the flag to 1; otherwise it stays 0 and the hook never tries to
// route calls into the (uninstalled) bridge import. on != 0 enables, 0 disables.

WASM_EXPORT void bb_set_webgpu_msm_enabled(uint8_t on)
{
    bb::scalar_multiplication::set_webgpu_msm_enabled(on != 0);
}

// Per-MSM CSV-measurement mode. When set, `MSM::batch_multi_scalar_mul` runs
// every MSM solo + times each + emits a `[msm-csv-cpu] name=X n=Y cpu_ms=Z`
// log line. Used by the bench harness to build a per-MSM (named) CSV table.
// Off by default; turn it on once at the start of a measurement run.
WASM_EXPORT void bb_set_msm_csv_mode(uint8_t on)
{
    bb::scalar_multiplication::set_msm_csv_mode(on != 0);
}

// ---------------------------------------------------------------------------
// In-browser comparison harness exports.
//
// The dev page (barretenberg/ts/dev/msm-webgpu) benchmarks the in-tree
// Pippenger against the WebGPU MSM. To measure compute and not marshalling,
// the path is split like MsmV2's prepare/run:
//
//   bb_native_pippenger_bn254_load(points, scalars, n)
//     Decode the n × 64 LE point bytes and n × 32 LE scalar bytes into
//     AffineElement / ScalarField vectors held in module state. UNTIMED.
//   bb_native_pippenger_bn254_run(num_threads, result)
//     Run batch_multi_scalar_mul_native over the loaded vectors and write the
//     64-byte LE affine result. The TIMED call — pure Pippenger compute, no
//     input-structure population.
//
// Layout (matches webgpu_msm_marshalling.hpp and the JS dev page; LE, NOT
// Montgomery): points n × 64 `[x[32]||y[32]]`, scalars n × 32 (Fr), result
// 64 `[x[32]||y[32]]`. `num_threads == 0` keeps the runtime default; non-zero
// temporarily overrides the global concurrency for the call.
// batch_multi_scalar_mul_native is the in-tree affine Pippenger that bypasses
// the BBERG_WEBGPU_MSM_HOOK delegation — see bb_native_pippenger_bn254_run.
namespace {
std::vector<bb::curve::BN254::AffineElement> g_bench_points;
std::vector<bb::curve::BN254::ScalarField> g_bench_scalars;
} // namespace

WASM_EXPORT void bb_native_pippenger_bn254_load(const uint8_t* points, const uint8_t* scalars, uint32_t n)
{
    using Curve = bb::curve::BN254;
    namespace marshalling = bb::scalar_multiplication::webgpu_marshalling;

    // Free the previous size's vectors before allocating this size's. A sweep
    // calls _load for a growing sequence of n; resizing in place would
    // reallocate while still holding the old buffer, transiently doubling the
    // resident input memory in the WASM heap.
    g_bench_points = std::vector<Curve::AffineElement>{};
    g_bench_scalars = std::vector<Curve::ScalarField>{};
    g_bench_points.resize(n);
    g_bench_scalars.resize(n);
    for (uint32_t i = 0; i < n; ++i) {
        g_bench_points[i] = marshalling::read_affine_le(&points[i * 64]);
    }
    for (uint32_t i = 0; i < n; ++i) {
        g_bench_scalars[i] = Curve::ScalarField(marshalling::read_uint256_le(&scalars[i * 32]));
    }
}

WASM_EXPORT void bb_native_pippenger_bn254_run(uint32_t num_threads, uint8_t* result)
{
    using Curve = bb::curve::BN254;
    using MSM = bb::scalar_multiplication::MSM<Curve>;
    namespace marshalling = bb::scalar_multiplication::webgpu_marshalling;

    std::memset(result, 0, 64);
    if (g_bench_scalars.empty()) {
        return;
    }

    const size_t saved_concurrency = bb::get_num_cpus();
    if (num_threads != 0) {
        bb::set_parallel_for_concurrency(num_threads);
    }
    // batch_multi_scalar_mul_native — the in-tree multithreaded affine Pippenger
    // (handle_edge_cases = false: assumes linearly independent points). This is
    // the exact algorithm pippenger_unsafe runs, but it bypasses the
    // BBERG_WEBGPU_MSM_HOOK delegation. pippenger_unsafe -> MSM::msm ->
    // batch_multi_scalar_mul would route a BN254 MSM into the WebGPU bridge when
    // the runtime flag is on (see bb_set_webgpu_msm_enabled), which this
    // comparison harness deliberately leaves off — its purpose is to time the
    // native Pippenger in isolation. batch_multi_scalar_mul_native exists for
    // exactly this dev-harness use (see its declaration in
    // scalar_multiplication.hpp). It restores the scalars to Montgomery form
    // before returning, so repeated runs over the same loaded g_bench_scalars
    // are safe.
    const std::span<const Curve::AffineElement> points_span(g_bench_points);
    const std::span<Curve::ScalarField> scalars_span(g_bench_scalars);
    std::array<std::span<const Curve::AffineElement>, 1> points_batch{ points_span };
    std::array<std::span<Curve::ScalarField>, 1> scalars_batch{ scalars_span };
    const Curve::AffineElement aff = MSM::batch_multi_scalar_mul_native(points_batch, scalars_batch, false)[0];
    if (num_threads != 0) {
        bb::set_parallel_for_concurrency(saved_concurrency);
    }

    if (!aff.is_point_at_infinity()) {
        marshalling::write_uint256_le(&result[0], static_cast<bb::numeric::uint256_t>(aff.x));
        marshalling::write_uint256_le(&result[32], static_cast<bb::numeric::uint256_t>(aff.y));
    }
}

// ---------------------------------------------------------------------------
// CPU completion of a partially-reduced bucket reduction (dense-packed input).
//
// The WebGPU MSM's per-window bucket reduction runs a fixed schedule of levels
// (suffix-add / tree-add / double). The starved tail of that schedule has
// little parallelism, so it can be cheaper to stop the GPU at a cutoff level
// and finish the remaining levels single-threaded on the CPU. The remaining
// levels only touch a small, data-independent set of slots; the GPU gathers
// exactly those (and strips its Montgomery R) into a dense per-window buffer,
// and the host pre-remaps the remaining schedule into a flat op-list over the
// compact ranks. So this replay is a tight loop over a small contiguous array —
// no stride formulas, no map, no full red_buf allocation.
//
//   num_windows, k_per_window — the gathered working set: k_per_window compact
//                               slots per window, dense[(w*k + r)*64] = the LE
//                               NOT-Montgomery affine (x||y) at compact rank r
//                               of window w; (0,0) = empty.
//   num_ops, ops              — flat op-list, window-independent. Per op 4 u32:
//                               (opcode, dst_rank, src_rank, _); opcode 0 = add
//                               (dst += src), 1 = double (dst = 2·dst). Applied
//                               in order to every window's compact array.
//   root_rank                 — compact rank holding each window's final sum.
//   c                         — window bit width (the per-window 2^c weight in
//                               the window fold).
//   result                    — 64 LE affine: the single final MSM point. The
//                               per-window sums stay live g1 elements and feed
//                               combine_windows here — no per-window serialise
//                               or normalise. In production the result is a live
//                               element for the proving step; the 64-byte readout
//                               exists only for the JS bench cross-check.
//
// g1::element add/dbl are infinity-safe, so the present/absent/copy cases fall
// out for free. The op-list preserves the schedule's parallel-safe ordering.
WASM_EXPORT void bb_msm_complete_reduce(uint32_t num_windows,
                                        uint32_t k_per_window,
                                        const uint8_t* dense,
                                        uint32_t num_ops,
                                        const uint32_t* ops,
                                        uint32_t root_rank,
                                        uint32_t c,
                                        uint8_t* result)
{
    using Curve = bb::curve::BN254;
    using Element = Curve::Element;
    namespace marshalling = bb::scalar_multiplication::webgpu_marshalling;

    const size_t total = static_cast<size_t>(num_windows) * k_per_window;
    std::vector<Element> s(total);
    for (size_t i = 0; i < total; ++i) {
        s[i] = Element{ marshalling::read_affine_le(&dense[i * 64]) };
    }

    std::vector<Element> window_sums(num_windows);
    for (uint32_t w = 0; w < num_windows; ++w) {
        const size_t base = static_cast<size_t>(w) * k_per_window;
        for (uint32_t o = 0; o < num_ops; ++o) {
            const uint32_t opcode = ops[o * 4 + 0];
            const uint32_t dst = ops[o * 4 + 1];
            if (opcode == 1u) {
                s[base + dst].self_dbl();
            } else {
                s[base + dst] += s[base + ops[o * 4 + 2]];
            }
        }
        window_sums[w] = s[base + root_rank];
    }

    // Window doublings + fold to the single final MSM point — the same native
    // bb::g1 Horner as the production GPU path's combine_windows (this hook,
    // lines ~235/301), fed the live per-window elements directly. The output is
    // the MSM point the proving step consumes; it never leaves C++ in prod (the
    // 64-byte readout below exists only for the JS bench cross-check).
    const Curve::AffineElement final_pt = marshalling::combine_windows(window_sums, c);
    if (final_pt.is_point_at_infinity()) {
        std::memset(result, 0, 64);
    } else {
        marshalling::write_uint256_le(&result[0], static_cast<bb::numeric::uint256_t>(final_pt.x));
        marshalling::write_uint256_le(&result[32], static_cast<bb::numeric::uint256_t>(final_pt.y));
    }
}

#endif // BBERG_WEBGPU_MSM_HOOK
