#include "webgpu_msm_hook.hpp"

#ifdef BBERG_WEBGPU_MSM_HOOK

#include <array>
#include <atomic>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/common/wasm_export.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "msm_split_planner.hpp"
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

// Monotonic per-MSM sequence for CSV-mode unique labels. Reset to 0 whenever csv
// mode is (re)enabled so the CPU pass and the GPU pass — which run the same
// deterministic sequence of commits — assign the SAME seq to the same MSM, letting
// the report join them by `<label>#<seq>`.
std::atomic<uint64_t> g_msm_seq{ 0 };

// Oracle routing. A per-seq route mask (1 = dispatch this MSM to the GPU), set
// from JS via bb_set_webgpu_route_mask before proving. When enabled, each MSM's
// delegation decision is mask[seq] instead of the size predicate, so a run can
// dispatch exactly the MSMs an offline per-MSM CPU-vs-GPU oracle selected. seq is
// assigned in the same deterministic order csv-mode uses, so the mask built from a
// csv run lines up with the prove.
std::vector<uint8_t> g_route_mask;
std::atomic<bool> g_oracle_route_mode{ false };

// Batch-size-aware delegation (experiment knob, set from JS via
// bb_set_webgpu_batch_delegate). When a batch_multi_scalar_mul call holds at least
// g_batch_delegate_k MSMs, the per-MSM delegation threshold drops to
// g_small_threshold so the small MSMs join the GPU union — which saturates the GPU
// on batched small MSMs (MULTI_MSM_PERF.md) where one-at-a-time would starve it.
// Default k = UINT32_MAX (never triggers) ⇒ behaviour is exactly the compile-time
// `webgpu_msm_threshold` until JS opts in.
std::atomic<uint32_t> g_batch_delegate_k{ UINT32_MAX };
std::atomic<uint32_t> g_small_threshold{ static_cast<uint32_t>(webgpu_msm_threshold) };

// Calibrated CPU/GPU cost model (CPU_GPU_WORKSHARE_PLAN.md). When enabled (set
// from JS via bb_set_msm_split_model after calibration), per-MSM delegation
// routes by predicted cost — GPU iff t_gpu(n) < t_cpu(nnz) — instead of the size
// gate, so dense large MSMs go to the GPU and sparse ones stay on the CPU (the
// −40% oracle in MSM_CPU_VS_GPU_REPORT.md). Default off ⇒ size-gate behaviour.
// Set once before proving (release on the flag); readers acquire the flag.
std::atomic<bool> g_split_model_enabled{ false };
MsmCostModel g_split_model{};

// CPU/GPU work-sharing (CPU_GPU_WORKSHARE_PLAN.md §4b). When enabled (from JS via
// bb_set_msm_worksharing_enabled), the batch hook kicks off the GPU dispatch
// asynchronously (bb_external_batch_msm_bn254_start) and runs the CPU-routed MSMs
// concurrently before awaiting, so makespan is max(C, G) instead of C + G. Default
// off ⇒ the original blocking dispatch. Safe only with the shared (threaded) WASM
// memory the prover uses — see the _start/_await import note in the header.
std::atomic<bool> g_worksharing_enabled{ false };

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
    if (on) {
        g_msm_seq.store(0, std::memory_order_relaxed);
    }
}

uint64_t next_msm_seq() noexcept
{
    return g_msm_seq.fetch_add(1, std::memory_order_relaxed);
}

bool webgpu_oracle_route_mode_enabled() noexcept
{
    return g_oracle_route_mode.load(std::memory_order_relaxed);
}

void advance_msm_seq(uint64_t n) noexcept
{
    g_msm_seq.fetch_add(n, std::memory_order_relaxed);
}

// Helper that lives at the namespace scope so the WASM_EXPORT setter below
// (declared at file scope) can qualified-call it. The atomic itself stays
// in the anonymous namespace; only the setter is exposed.
void set_webgpu_msm_enabled(bool on) noexcept
{
    g_webgpu_msm_enabled.store(on, std::memory_order_relaxed);
}

void set_webgpu_batch_delegate(uint32_t k, uint32_t small_threshold) noexcept
{
    g_batch_delegate_k.store(k, std::memory_order_relaxed);
    g_small_threshold.store(small_threshold, std::memory_order_relaxed);
}

void set_msm_split_model(const MsmCostModel& model, bool enabled) noexcept
{
    g_split_model = model;
    g_split_model_enabled.store(enabled, std::memory_order_release);
}

void set_msm_worksharing_enabled(bool enabled) noexcept
{
    g_worksharing_enabled.store(enabled, std::memory_order_release);
}

// Per-MSM cost-model routing: GPU iff predicted t_gpu(n) < t_cpu(nnz). Returns
// false (⇒ the caller keeps the MSM on the CPU) when the model is disabled or the
// runtime gate is off. Skips the O(n) non-zero scan when the GPU loses even at
// full density (nnz = n), so sparse-but-large MSMs cost only one cheap compare.
bool route_to_gpu_by_model(std::size_t n, std::span<const curve::BN254::ScalarField> scalars) noexcept
{
    if (!g_split_model_enabled.load(std::memory_order_acquire) || !webgpu_msm_runtime_enabled() || n == 0) {
        return false;
    }
    const MsmCostModel& m = g_split_model;
    const double t_gpu = m.gpu_time_solo(n);
    if (t_gpu >= m.cpu_time(n)) {
        return false; // GPU loses even at full density — no need to count non-zeros
    }
    uint64_t nnz = 0;
    for (const auto& s : scalars) {
        if (!s.is_zero()) {
            ++nnz;
        }
    }
    return t_gpu < m.cpu_time(nnz);
}

void webgpu_route_clear() noexcept
{
    g_route_mask.clear();
    g_msm_seq.store(0, std::memory_order_relaxed);
}

void webgpu_route_add(uint32_t seq) noexcept
{
    if (seq >= g_route_mask.size()) {
        g_route_mask.resize(seq + 1u, 0);
    }
    g_route_mask[seq] = 1;
}

void webgpu_route_enable(uint8_t on) noexcept
{
    g_oracle_route_mode.store(on != 0, std::memory_order_relaxed);
    g_msm_seq.store(0, std::memory_order_relaxed);
    uint32_t to_gpu = 0;
    for (uint8_t b : g_route_mask) {
        to_gpu += (b != 0) ? 1u : 0u;
    }
    info("[oracle-route] enabled=", static_cast<int>(on), " routing ", to_gpu, "/", static_cast<uint32_t>(g_route_mask.size()), " MSMs -> GPU");
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
    using webgpu_marshalling::finish_and_combine_windows;
    using webgpu_marshalling::marshal_points;
    using webgpu_marshalling::marshal_scalars;

    const size_t batch_size = points.size();
    std::vector<curve::BN254::AffineElement> results;
    results.reserve(batch_size);

    // Batch-size-aware delegation: a call with enough MSMs drops the per-MSM
    // threshold so the small ones join the GPU union (saturation win). Default
    // disabled (g_batch_delegate_k = UINT32_MAX). The decision is per-call: all
    // MSMs in this batch use the same `eff_threshold`.
    const size_t eff_threshold = batch_size >= g_batch_delegate_k.load(std::memory_order_relaxed)
        ? static_cast<size_t>(g_small_threshold.load(std::memory_order_relaxed))
        : webgpu_msm_threshold;
    const auto should_delegate = [&](size_t n) noexcept {
        return webgpu_msm_runtime_enabled() && n >= eff_threshold;
    };

    // Per-MSM route decision, computed once so the SRS-growth pass and the main
    // dispatch loop agree. Oracle mode routes by the per-seq mask (seq assigned in
    // csv-mode's deterministic MSM order); otherwise by the size predicate.
    const bool oracle_route = g_oracle_route_mode.load(std::memory_order_relaxed);
    std::vector<uint8_t> route(batch_size, 0);
    for (size_t i = 0; i < batch_size; ++i) {
        const size_t n = scalars[i].size();
        bool go;
        if (oracle_route) {
            const size_t seq = static_cast<size_t>(next_msm_seq());
            go = n > 0 && seq < g_route_mask.size() && g_route_mask[seq] != 0;
        } else if (g_split_model_enabled.load(std::memory_order_acquire)) {
            // Calibrated routing: GPU only when the model predicts it's faster
            // for this MSM's density. Replaces the size gate.
            go = route_to_gpu_by_model(n, scalars[i]);
        } else {
            go = should_delegate(n);
        }
        route[i] = static_cast<uint8_t>(go);
    }

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
            if (n == 0 || route[i] == 0) {
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
    // Early-exit staged partials per window: the halving reduce ships at most
    // 1 + log2(stride) carries; 16 covers every finisher-cap setting.
    constexpr uint32_t MAX_PARTIALS = 16;
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
    // CPU-routed MSMs, deferred so they can overlap the GPU batch (work-sharing).
    std::vector<size_t> cpu_items;

    for (size_t i = 0; i < batch_size; ++i) {
        const size_t n = scalars[i].size();
        if (n == 0) {
            results[i] = curve::BN254::AffineElement::infinity();
            continue;
        }
        if (route[i] == 0) {
            // Below-threshold / un-routed: defer to the native single MSM, run
            // after the GPU batch is kicked off so the two overlap. `MSM::msm` is
            // hook-free (the delegation is only in this batch facade), so it does
            // not recurse into the bridge.
            cpu_items.push_back(i);
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
            // Sized for either result shape: legacy per-window affine roots
            // (64 B each) or early-exit staged Jacobian partials (96 B ×
            // MAX_PARTIALS per window). Which one arrived is in the meta.
            std::vector<uint8_t> result_bytes(static_cast<size_t>(MAX_WINDOWS) * MAX_PARTIALS * 96);
            const uint32_t meta = bb_external_msm_bn254(
                points_bytes.data(), scalars_bytes.data(), static_cast<uint32_t>(n), result_bytes.data(), 0);
            const uint32_t partials = meta >> 24;
            const uint32_t num_windows = (meta >> 16) & 0xffu;
            const uint32_t c = meta & 0xffffu;
            BB_ASSERT(num_windows <= MAX_WINDOWS, "webgpu MSM: num_windows exceeds the 64-window result buffer");
            BB_ASSERT(partials <= MAX_PARTIALS, "webgpu MSM: partials_per_window exceeds MAX_PARTIALS");
            results[i] = partials == 0 ? combine_windows(result_bytes.data(), num_windows, c)
                                       : finish_and_combine_windows(result_bytes.data(), num_windows, partials, c);
            continue;
        }
        const uint32_t srs_offset = static_cast<uint32_t>(static_cast<std::size_t>(pts - srs_base) / POINT_BYTES);
        batch_items.push_back({ i,
                                static_cast<uint32_t>(n),
                                srs_offset,
                                static_cast<uint32_t>(total_scalars_bytes),
                                static_cast<uint32_t>(total_results_bytes) });
        total_scalars_bytes += n * 32;
        // Over-allocate for either result shape (legacy 64 B roots or
        // early-exit 96 B × MAX_PARTIALS staged partials per window); the
        // per-MSM shape lives in the returned meta.
        total_results_bytes += static_cast<size_t>(MAX_WINDOWS) * MAX_PARTIALS * 96;
    }

    // Pack descriptors + scalars contiguously. Hoisted out of the dispatch branch
    // so it precedes the async `_start` (the host reads these buffers); the vectors
    // live to function scope, staying valid while the host reads them concurrently
    // with the CPU work below.
    constexpr std::size_t DESC_WORDS = 5;
    std::vector<uint32_t> descriptors;
    std::vector<uint8_t> scalars_packed;
    std::vector<uint8_t> results_packed;
    std::vector<uint32_t> meta;
    // Labels packed as [u8 len, len bytes ASCII] per MSM, in batch_items order.
    std::vector<uint8_t> labels_packed;
    if (!batch_items.empty()) {
        descriptors.resize(batch_items.size() * DESC_WORDS);
        scalars_packed.resize(total_scalars_bytes);
        results_packed.resize(total_results_bytes);
        meta.resize(batch_items.size() * 2);
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
    }
    const uint8_t* labels_arg = have_labels ? labels_packed.data() : nullptr;

    // Work-sharing (CPU_GPU_WORKSHARE_PLAN.md §4b): kick off the GPU batch
    // asynchronously so the deferred CPU MSMs run concurrently on the worker pool.
    // Default off ⇒ the GPU batch is dispatched with the blocking call AFTER the
    // CPU work, which is the original serial behaviour.
    const bool worksharing = g_worksharing_enabled.load(std::memory_order_acquire) && !batch_items.empty();
    if (worksharing) {
        bb_external_batch_msm_bn254_start(static_cast<uint32_t>(batch_items.size()),
                                          reinterpret_cast<const uint8_t*>(descriptors.data()),
                                          scalars_packed.data(),
                                          results_packed.data(),
                                          reinterpret_cast<uint8_t*>(meta.data()),
                                          labels_arg);
    }

    // Deferred CPU-routed MSMs — overlap the GPU when work-sharing is on.
    for (const size_t i : cpu_items) {
        const size_t n = scalars[i].size();
        results[i] = MSM<curve::BN254>::msm(
            points[i].subspan(0, n), PolynomialSpan<const curve::BN254::ScalarField>{ 0, scalars[i] }, false);
    }

    if (!batch_items.empty()) {
        if (worksharing) {
            bb_external_batch_msm_bn254_await();
        } else {
            bb_external_batch_msm_bn254(static_cast<uint32_t>(batch_items.size()),
                                        reinterpret_cast<const uint8_t*>(descriptors.data()),
                                        scalars_packed.data(),
                                        results_packed.data(),
                                        reinterpret_cast<uint8_t*>(meta.data()),
                                        labels_arg);
        }
        // Finish (early-exit staged partials) and/or Horner-combine each
        // MSM's window sums. meta[k*2] packs (partials << 16) | num_windows;
        // partials == 0 is the legacy finished-roots shape.
        for (size_t k = 0; k < batch_items.size(); ++k) {
            const auto& it = batch_items[k];
            const uint32_t partials = meta[k * 2 + 0] >> 16;
            const uint32_t num_windows = meta[k * 2 + 0] & 0xffffu;
            const uint32_t c = meta[k * 2 + 1];
            BB_ASSERT(num_windows <= MAX_WINDOWS, "webgpu batch MSM: num_windows exceeds the 64-window result buffer");
            BB_ASSERT(partials <= MAX_PARTIALS, "webgpu batch MSM: partials_per_window exceeds MAX_PARTIALS");
            results[it.result_index] =
                partials == 0
                    ? combine_windows(results_packed.data() + it.result_byte_off, num_windows, c)
                    : finish_and_combine_windows(results_packed.data() + it.result_byte_off, num_windows, partials, c);
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

// Push the calibrated CPU/GPU cost model from JS (after `calibrateMsmEngine`).
// coeffs_le is 5 little-endian f64 (ms units):
//   [cpu_a_per_nnz, cpu_b_fixed, gpu_a_per_point, gpu_b_floor, gpu_b_union]
// enabled != 0 turns on cost-model routing (GPU iff t_gpu(n) < t_cpu(nnz),
// CPU_GPU_WORKSHARE_PLAN.md §3); 0 restores the size gate. gpu_b_union > 0 marks
// the union floor as valid (used by the batch overlap planner).
WASM_EXPORT void bb_set_msm_split_model(const uint8_t* coeffs_le, uint32_t enabled)
{
    std::array<double, 5> c{};
    std::memcpy(c.data(), coeffs_le, sizeof(c));
    bb::scalar_multiplication::MsmCostModel model;
    model.cpu_a_per_nnz = c[0];
    model.cpu_b_fixed = c[1];
    model.gpu_a_per_point = c[2];
    model.gpu_b_floor = c[3];
    model.gpu_b_union = c[4];
    model.gpu_b_union_valid = c[4] > 0.0;
    bb::scalar_multiplication::set_msm_split_model(model, enabled != 0);
}

// Enable/disable CPU/GPU work-sharing overlap (CPU_GPU_WORKSHARE_PLAN.md §4b):
// the batch hook dispatches the GPU asynchronously and runs the CPU-routed MSMs
// concurrently. Requires a bridge that provides the `_start`/`_await` imports.
// Default off (the blocking, serial dispatch). on != 0 enables.
WASM_EXPORT void bb_set_msm_worksharing_enabled(uint8_t on)
{
    bb::scalar_multiplication::set_msm_worksharing_enabled(on != 0);
}

// Per-MSM CSV-measurement mode. When set, `MSM::batch_multi_scalar_mul` runs
// every MSM solo + times each + emits a `[msm-csv-cpu] name=X n=Y cpu_ms=Z`
// log line. Used by the bench harness to build a per-MSM (named) CSV table.
// Off by default; turn it on once at the start of a measurement run.
WASM_EXPORT void bb_set_msm_csv_mode(uint8_t on)
{
    bb::scalar_multiplication::set_msm_csv_mode(on != 0);
}

// Batch-size-aware delegation knob (experiment). For a batch_multi_scalar_mul call
// with >= k MSMs, MSMs of size >= small_threshold are delegated to the GPU (instead
// of the default 2^14), so the union batches the small ones. k = UINT32_MAX (the
// default) disables it. Set once from JS before proving.
WASM_EXPORT void bb_set_webgpu_batch_delegate(uint32_t k, uint32_t small_threshold)
{
    bb::scalar_multiplication::set_webgpu_batch_delegate(k, small_threshold);
}

// Oracle routing: build a per-seq route set with clear()+add(seq)*, then enable(1).
// seq counts every MSM in deterministic commit order from 0 (reset on clear/enable),
// matching csv-mode labels — so adding the seqs from a per-MSM CSV routes exactly
// that set to the GPU. enable(0) restores the size predicate.
WASM_EXPORT void bb_webgpu_route_clear()
{
    bb::scalar_multiplication::webgpu_route_clear();
}

WASM_EXPORT void bb_webgpu_route_add(uint32_t seq)
{
    bb::scalar_multiplication::webgpu_route_add(seq);
}

WASM_EXPORT void bb_webgpu_route_enable(uint8_t on)
{
    bb::scalar_multiplication::webgpu_route_enable(on);
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

// Early-exit finishing harness: ONE call that performs the per-window
// finishing sum over the GPU's staged Jacobian partials (raw Montgomery
// limbs, z == 0 absent) AND the cross-window Horner combine, writing the
// affine result (LE non-Montgomery x + y, (0,0) = infinity) to `result`.
// The production path runs the same finish_and_combine_windows inside the
// bb_external_msm hook; this export lets the dev page golden-test the
// early-exit readback bytes through the identical native code.
WASM_EXPORT void bb_webgpu_finish_combine_bn254(
    const uint8_t* staged, uint32_t num_windows, uint32_t partials_per_window, uint32_t c, uint8_t* result)
{
    namespace marshalling = bb::scalar_multiplication::webgpu_marshalling;
    const auto aff =
        bb::scalar_multiplication::webgpu_marshalling::finish_and_combine_windows(staged, num_windows, partials_per_window, c);
    const std::vector<uint8_t> bytes =
        marshalling::marshal_points(std::span<const bb::curve::BN254::AffineElement>(&aff, 1));
    std::memcpy(result, bytes.data(), 64);
}

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
    // `MSM::msm` is hook-free (the bridge delegation is only in the batch
    // facade), so this times the in-tree Pippenger in isolation even when the
    // WebGPU runtime flag is on.
    const Curve::AffineElement aff =
        MSM::msm(points_span, bb::PolynomialSpan<const Curve::ScalarField>{ 0, scalars_span }, false);
    if (num_threads != 0) {
        bb::set_parallel_for_concurrency(saved_concurrency);
    }

    if (!aff.is_point_at_infinity()) {
        marshalling::write_uint256_le(&result[0], static_cast<bb::numeric::uint256_t>(aff.x));
        marshalling::write_uint256_le(&result[32], static_cast<bb::numeric::uint256_t>(aff.y));
    }
}

#endif // BBERG_WEBGPU_MSM_HOOK
