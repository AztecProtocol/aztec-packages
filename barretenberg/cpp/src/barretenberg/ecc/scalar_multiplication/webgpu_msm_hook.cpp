#include "webgpu_msm_hook.hpp"

#ifdef BBERG_WEBGPU_MSM_HOOK

#include <algorithm>
#include <array>
#include <atomic>
#include <cstdint>
#include <iomanip>
#include <sstream>
#include <vector>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/log.hpp"
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

// Distribution-capture mode. See msm_distribution_mode_enabled() for details.
std::atomic<bool> g_msm_distribution_mode{ false };

// Trace mode. See msm_trace_mode_enabled() for details.
std::atomic<bool> g_msm_trace_mode{ false };

// Absolute steady_clock ns of the first `[msm-span]` of the current run, used to
// rebase span timestamps into a prove-relative timeline. 0 means "not yet
// anchored"; the first emit_msm_span CAS-sets it. Re-armed to 0 by
// reset_msm_phase so a reused instance re-anchors at its next run's first MSM.
std::atomic<uint64_t> g_msm_trace_epoch_ns{ 0 };

// Cumulative wall-clock nanoseconds spent in the production MSM dispatch for
// BN254 (the GPU bridge call — which blocks on the full GPU round-trip — or the
// native multi-threaded Pippenger). Accumulated per call in
// MSM::batch_multi_scalar_mul; read back via bb_emit_msm_phase (emits a
// `[msm-phase-total]` log line) so the page can report the exact cumulative
// MSM-phase wall time for a WASM run vs a WebGPU run. Reset per run.
std::atomic<uint64_t> g_msm_phase_ns{ 0 };

// Per-(label, n) block-list: any MSM whose telemetry label matches one of
// these entries is kept on the native Pippenger even when
// `webgpu_msm_runtime_enabled()` is true. An entry with `n == 0` matches that
// label at any size; `n != 0` matches only that exact size. WASM runs
// single-threaded (`NO_MULTITHREADING`) so a plain vector behind no lock is
// sufficient; the setter only fires from JS init.
struct BlocklistEntry {
    std::string label;
    std::size_t n; // 0 → wildcard (any n)
};
std::vector<BlocklistEntry> g_webgpu_msm_blocklist;

// Pippenger window-bit width per n. Mirrors barretenberg/ts/src/msm_webgpu/
// msm_v2.ts:pickC — the table is the bench-msm-v2 sweep optimum on Apple
// Metal. We compute distribution stats at the same `c` the GPU pipeline
// would use so the per-bucket counts reported are exactly the level-0
// counts the pair tree would see if this MSM were delegated.
constexpr uint32_t pick_c_for_distribution(uint32_t n) noexcept
{
    // Round-up logN so n=2^k − 1 maps to k (matches Math.round(Math.log2(n))
    // for sizes the table covers). pickC defaults to 13 outside the table.
    uint32_t logN = 0;
    while ((static_cast<uint64_t>(1) << logN) < n) {
        ++logN;
    }
    // pickC table from msm_v2.ts:501-520:
    //   7-8 → 4, 9 → 5, 10-14 → 8, 15 → 10, 16-17 → 13, 18-20 → 15.
    switch (logN) {
    case 7:
    case 8:
        return 4;
    case 9:
        return 5;
    case 10:
    case 11:
    case 12:
    case 13:
    case 14:
        return 8;
    case 15:
        return 10;
    case 16:
    case 17:
        return 13;
    case 18:
    case 19:
    case 20:
        return 15;
    default:
        return 13;
    }
}

// Read `c` bits at bit-position `lo` of the 256-bit canonical scalar `u`,
// plus the lookback bit at `lo-1` (zero for w==0). Returns the c+1 raw bits
// packed as `(winBits << 1) | lookback`. Equivalent to msm_v2.ts:
// boothDigit's input-extraction step, operating on the 4×u64 limb form so
// each window costs ~5 ALU ops instead of a 256-bit shift.
inline uint32_t read_window_raw(const numeric::uint256_t& u, uint32_t w, uint32_t c) noexcept
{
    const uint32_t lo = w * c;
    const uint32_t word_idx = lo / 64;
    const uint32_t word_shift = lo % 64;
    const uint64_t w0 = (word_idx < 4) ? u.data[word_idx] : 0;
    const uint64_t w1 = (word_idx + 1 < 4) ? u.data[word_idx + 1] : 0;
    // c ≤ 15 so the c-bit window spans at most two u64 words. We always
    // OR-in w1's low bits shifted up by (64 - word_shift); when the window
    // fits entirely inside w0 (word_shift + c ≤ 64), `mask` clears those
    // high bits so w1 doesn't contribute. The branchless form keeps the GPU
    // booth recoder and this host mirror lockstep-comparable.
    uint64_t bits = (w0 >> word_shift);
    if (word_shift != 0) {
        bits |= (w1 << (64u - word_shift));
    }
    const uint32_t winBits = static_cast<uint32_t>(bits) & ((1u << c) - 1u);
    uint32_t lookback = 0;
    if (w > 0) {
        const uint32_t lb = lo - 1;
        const uint64_t wl = (lb / 64 < 4) ? u.data[lb / 64] : 0;
        lookback = static_cast<uint32_t>((wl >> (lb % 64)) & 1u);
    }
    return (winBits << 1) | lookback;
}

// Marshal + ship the first `count` points of g_full_srs_base. Replaces
// any previously-uploaded pool on the JS side (bb_publish_srs_bn254
// destroys the prior MsmV2Pool and rebuilds from the new bytes). Updates
// g_published_srs_{base,count}.
void publish_srs_prefix(uint32_t count) noexcept
{
    using webgpu_marshalling::marshal_points;
    const auto* base_bytes = g_full_srs_base.load(std::memory_order_relaxed);
    const auto* base_pts = reinterpret_cast<const curve::BN254::AffineElement*>(base_bytes);
    std::vector<uint8_t> srs_bytes = marshal_points(std::span<const curve::BN254::AffineElement>(base_pts, count));
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

bool msm_trace_mode_enabled() noexcept
{
    return g_msm_trace_mode.load(std::memory_order_relaxed);
}

void set_msm_trace_mode(bool on) noexcept
{
    g_msm_trace_mode.store(on, std::memory_order_relaxed);
}

void emit_msm_span(
    uint64_t t0_abs_ns, uint64_t t1_abs_ns, size_t count, size_t n_total, std::span<const std::string> labels) noexcept
{
    // Lazily anchor the run's timeline to the first span's start. compare_exchange
    // keeps this correct even if dispatches ever come from more than one thread.
    uint64_t epoch = g_msm_trace_epoch_ns.load(std::memory_order_relaxed);
    if (epoch == 0) {
        uint64_t expected = 0;
        if (g_msm_trace_epoch_ns.compare_exchange_strong(expected, t0_abs_ns, std::memory_order_relaxed)) {
            epoch = t0_abs_ns;
        } else {
            epoch = expected;
        }
    }
    const double t0_us = static_cast<double>(t0_abs_ns - epoch) / 1.0e3;
    const double t1_us = static_cast<double>(t1_abs_ns - epoch) / 1.0e3;
    // Join the batch's labels, bounded so a large batch can't produce a huge line.
    std::string joined;
    for (size_t i = 0; i < labels.size(); ++i) {
        if (i != 0) {
            joined += ',';
        }
        if (joined.size() > 240) {
            joined += "...";
            break;
        }
        joined += labels[i];
    }
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(1) << "t0_us=" << t0_us << " t1_us=" << t1_us << " count=" << count
        << " n=" << n_total << " labels=" << joined;
    info("[msm-span] ", oss.str());
}

bool msm_distribution_mode_enabled() noexcept
{
    return g_msm_distribution_mode.load(std::memory_order_relaxed);
}

void set_msm_distribution_mode(bool on) noexcept
{
    g_msm_distribution_mode.store(on, std::memory_order_relaxed);
}

void msm_phase_add_ns(uint64_t ns) noexcept
{
    g_msm_phase_ns.fetch_add(ns, std::memory_order_relaxed);
}

uint64_t msm_phase_ns() noexcept
{
    return g_msm_phase_ns.load(std::memory_order_relaxed);
}

void reset_msm_phase() noexcept
{
    g_msm_phase_ns.store(0, std::memory_order_relaxed);
    g_msm_trace_epoch_ns.store(0, std::memory_order_relaxed);
}

bool is_label_blocked(std::string_view label, std::size_t n) noexcept
{
    if (g_webgpu_msm_blocklist.empty() || label.empty()) {
        return false;
    }
    for (const auto& entry : g_webgpu_msm_blocklist) {
        if (label != entry.label) {
            continue;
        }
        // Wildcard entry (n == 0) blocks every size; otherwise require an
        // exact size match.
        if (entry.n == 0 || entry.n == n) {
            return true;
        }
    }
    return false;
}

void set_webgpu_msm_blocklist(std::string_view labels_csv) noexcept
{
    g_webgpu_msm_blocklist.clear();
    if (labels_csv.empty()) {
        return;
    }
    std::size_t pos = 0;
    while (pos < labels_csv.size()) {
        const std::size_t comma = labels_csv.find(',', pos);
        const std::size_t end = (comma == std::string_view::npos) ? labels_csv.size() : comma;
        // Trim leading/trailing whitespace.
        std::size_t lo = pos;
        std::size_t hi = end;
        while (lo < hi && (labels_csv[lo] == ' ' || labels_csv[lo] == '\t')) {
            ++lo;
        }
        while (hi > lo && (labels_csv[hi - 1] == ' ' || labels_csv[hi - 1] == '\t')) {
            --hi;
        }
        if (hi > lo) {
            // Split on '@' to peel off an optional size suffix. "LABEL" → n=0
            // (wildcard); "LABEL@123456" → n=123456 (exact-size match only).
            const std::string_view entry = labels_csv.substr(lo, hi - lo);
            const std::size_t at = entry.find('@');
            std::string label;
            std::size_t n = 0;
            if (at == std::string_view::npos) {
                label.assign(entry);
            } else {
                label.assign(entry.substr(0, at));
                const std::string_view nsv = entry.substr(at + 1);
                std::size_t parsed = 0;
                bool any = false;
                for (char ch : nsv) {
                    if (ch < '0' || ch > '9') {
                        // Malformed size suffix — drop the entry rather than
                        // silently wildcarding it, which could mask a typo.
                        any = false;
                        break;
                    }
                    parsed = parsed * 10u + static_cast<std::size_t>(ch - '0');
                    any = true;
                }
                if (!any) {
                    if (comma == std::string_view::npos) {
                        break;
                    }
                    pos = comma + 1;
                    continue;
                }
                n = parsed;
            }
            g_webgpu_msm_blocklist.push_back({ std::move(label), n });
        }
        if (comma == std::string_view::npos) {
            break;
        }
        pos = comma + 1;
    }
}

void emit_msm_distribution(std::span<std::span<curve::BN254::ScalarField>> scalars,
                           std::span<const std::string> labels) noexcept
{
    const size_t batch_size = scalars.size();
    for (size_t i = 0; i < batch_size; ++i) {
        const size_t n = scalars[i].size();
        if (n == 0) {
            continue;
        }
        const uint32_t c = pick_c_for_distribution(static_cast<uint32_t>(n));
        // BN254 scalar field is 254 bits. Top window may straddle bit 254 by
        // a few padding bits; those read as zero — Booth-recoded to bucket 0
        // (the zero-digit slot), which is skipped downstream.
        constexpr uint32_t SCALAR_BITS = 254;
        const uint32_t num_windows = (SCALAR_BITS + c - 1) / c;
        const uint32_t BW = 1u << (c - 1); // signed-Booth bucket index range

        // Per-window per-bucket count grid. Indexed as counts[w * BW + bucket].
        std::vector<uint32_t> counts(static_cast<size_t>(num_windows) * BW, 0u);
        size_t nnz = 0;
        // Scalar magnitude in bits (of the normal-form integer). `maxbits` is
        // the hard bound that decides a safe static `scalarBitLength` for the
        // small-scalar window-count optimisation — it must cover EVERY scalar.
        // `sum_bits` over the nonzero scalars feeds `mean_bits`; a low mean
        // with a high max flags a "mostly-small, few full-width" distribution.
        uint64_t maxbits = 0;
        uint64_t sum_bits = 0;

        for (size_t k = 0; k < n; ++k) {
            const auto u = static_cast<numeric::uint256_t>(scalars[i][k]);
            if (u != 0) {
                ++nnz;
                const uint64_t bits = u.get_msb() + 1;
                if (bits > maxbits) {
                    maxbits = bits;
                }
                sum_bits += bits;
            }
            for (uint32_t w = 0; w < num_windows; ++w) {
                const uint32_t raw = read_window_raw(u, w, c);
                const uint32_t neg = (raw >> c) & 1u;
                const uint32_t negMask = neg ? 0xffffffffu : 0u;
                const uint32_t valMask = (1u << c) - 1u;
                const uint32_t encode = (raw + 1) >> 1;
                const uint32_t bucket = ((encode - neg) ^ negMask) & valMask;
                // `bucket` is in [0, 2^(c-1)]; the +1 case is the high boundary
                // (the maximum positive digit). The encoding folds bucket 2^c
                // back into bucket 2^(c-1) via the sign bit — so all values
                // here fit into BW = 2^(c-1) + 1 slots. Cap defensively to BW
                // (the count grid uses BW slots; rare overflow lands in slot 0
                // which is the skipped zero-digit slot anyway).
                counts[w * BW + (bucket < BW ? bucket : 0u)]++;
            }
        }

        // Aggregate over nonzero buckets EXCLUDING bucket 0 (the zero-digit
        // slot — the pair tree skips it because adding "the zero digit times
        // P" contributes nothing). The pair-tree collision pressure scales
        // with the heaviest *real* bucket, so that's what we report.
        uint32_t maxbucket = 0;
        std::vector<uint32_t> nonzero_counts;
        nonzero_counts.reserve(static_cast<size_t>(num_windows) * (BW - 1));
        uint64_t sum_nonzero = 0;
        for (uint32_t w = 0; w < num_windows; ++w) {
            for (uint32_t b = 1; b < BW; ++b) {
                const uint32_t cnt = counts[w * BW + b];
                if (cnt > 0) {
                    nonzero_counts.push_back(cnt);
                    sum_nonzero += cnt;
                    if (cnt > maxbucket) {
                        maxbucket = cnt;
                    }
                }
            }
        }

        uint32_t p99bucket = 0;
        double mean_nonzero = 0.0;
        if (!nonzero_counts.empty()) {
            // p99 over the population of *nonzero* buckets only. nth_element
            // is O(N) on average; with at most num_windows × BW ≈ 17 × 8192 =
            // 140k entries this is sub-millisecond per MSM.
            const size_t p99idx = static_cast<size_t>(static_cast<double>(nonzero_counts.size()) * 0.99);
            const size_t clamped = p99idx < nonzero_counts.size() ? p99idx : nonzero_counts.size() - 1;
            std::nth_element(nonzero_counts.begin(),
                             nonzero_counts.begin() + static_cast<std::ptrdiff_t>(clamped),
                             nonzero_counts.end());
            p99bucket = nonzero_counts[clamped];
            mean_nonzero = static_cast<double>(sum_nonzero) / static_cast<double>(nonzero_counts.size());
        }

        const double density = n > 0 ? static_cast<double>(nnz) / static_cast<double>(n) : 0.0;
        const double mean_bits = nnz > 0 ? static_cast<double>(sum_bits) / static_cast<double>(nnz) : 0.0;
        const std::string lbl = (labels.size() == batch_size) ? labels[i] : std::string("?");

        std::ostringstream odensity;
        odensity << std::fixed << std::setprecision(6) << density;
        std::ostringstream omean;
        omean << std::fixed << std::setprecision(2) << mean_nonzero;
        std::ostringstream omeanbits;
        omeanbits << std::fixed << std::setprecision(2) << mean_bits;

        info("[msm-dist] name=",
             lbl,
             " n=",
             n,
             " nnz=",
             nnz,
             " density=",
             odensity.str(),
             " c=",
             c,
             " maxbits=",
             maxbits,
             " mean_bits=",
             omeanbits.str(),
             " maxbucket=",
             maxbucket,
             " p99bucket=",
             p99bucket,
             " mean_nonzero_bucket=",
             omean.str());
    }
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
        size_t result_index; // index into `results`
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
        const std::string lbl = (have_labels && !labels[i].empty()) ? labels[i] : std::string("?");
        if (n == 0) {
            results[i] = curve::BN254::AffineElement::infinity();
            continue;
        }
        if (!webgpu_msm_should_delegate(n)) {
            std::array<std::span<const curve::BN254::AffineElement>, 1> p{ points[i].subspan(0, n) };
            std::array<std::span<curve::BN254::ScalarField>, 1> s{ scalars[i] };
            results[i] = legacy::MSM<curve::BN254>::batch_multi_scalar_mul(p, s, false)[0];
            info("[msm-route] name=", lbl, " n=", n, " route=cpu reason=below-threshold");
            continue;
        }
        // Per-(label, n) block-list: kept on CPU either because the pair-tree
        // contract has the least margin for that column (selectors / 0-1
        // counters where every scalar lands in one bucket — see
        // /tmp/zac-webgpu/chonk-delegate-eligible.md) or because the GPU is a
        // wash against the batched WASM Pippenger at that specific size (see
        // /tmp/zac-webgpu/chonk-msm-cpu-vs-gpu-report.md).
        if (have_labels && is_label_blocked(labels[i], n)) {
            std::array<std::span<const curve::BN254::AffineElement>, 1> p{ points[i].subspan(0, n) };
            std::array<std::span<curve::BN254::ScalarField>, 1> s{ scalars[i] };
            results[i] = legacy::MSM<curve::BN254>::batch_multi_scalar_mul(p, s, false)[0];
            info("[msm-route] name=", lbl, " n=", n, " route=cpu reason=blocked");
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
            info("[msm-route] name=", lbl, " n=", n, " route=gpu reason=off-srs-solo");
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
        info("[msm-route] name=", lbl, " n=", n, " route=gpu reason=srs-prefix-batch");
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
                labels_packed.insert(
                    labels_packed.end(), lbl.begin(), lbl.begin() + static_cast<std::string::difference_type>(lbl_len));
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

// Per-MSM scalar-distribution mode. When set, every `MSM::batch_multi_scalar_mul`
// call emits a `[msm-dist] name=X n=Y nnz=Z density=D c=C maxbucket=M
// p99bucket=P mean_nonzero_bucket=Mn` log line per MSM — used to classify
// columns by scalar sparsity / bucket-collision pressure before deciding
// which polynomials are safe to delegate to the WebGPU pair-tree pipeline.
// Purely additive: leaves the actual MSM execution path unchanged (results
// are computed normally; this only adds a log line per MSM). Off by default.
WASM_EXPORT void bb_set_msm_distribution_mode(uint8_t on)
{
    bb::scalar_multiplication::set_msm_distribution_mode(on != 0);
}

// Per-MSM trace mode. When set, every production `MSM::batch_multi_scalar_mul`
// dispatch emits a `[msm-span] t0_us=… t1_us=… count=… n=… labels=…` line — a
// prove-relative wall-clock timeline of the WASM MSM phase that the chonk-webgpu
// page turns into a Perfetto trace. Off by default; enable for one traced run.
WASM_EXPORT void bb_set_msm_trace_mode(uint8_t on)
{
    bb::scalar_multiplication::set_msm_trace_mode(on != 0);
}

// Per-label block-list of MSMs that must stay on the native CPU Pippenger even
// when WebGPU is on. `labels_csv` is a comma-separated list of label names
// (matched exactly against the per-MSM telemetry name). Passing an empty
// string clears the block-list. Default: empty (no blocking).
//
// Layout: `labels_csv` is a null-terminated ASCII C-string in WASM heap memory,
// e.g. "LOOKUP_READ_TAGS,LOOKUP_READ_COUNTS,VK_PRECOMPUTED_POLY". The JS side
// allocates the string in the WASM heap and passes the pointer.
WASM_EXPORT void bb_set_webgpu_msm_blocklist(const char* labels_csv)
{
    if (labels_csv == nullptr) {
        bb::scalar_multiplication::set_webgpu_msm_blocklist({});
        return;
    }
    bb::scalar_multiplication::set_webgpu_msm_blocklist(std::string_view{ labels_csv });
}

// Cumulative MSM-phase wall-clock accounting. Reset before a prove, then call
// bb_emit_msm_phase after it: the latter logs `[msm-phase-total] ms=<ms>`, which
// JS captures via the logger callback. This is the exact cumulative time spent
// in BN254 MSMs for the run (GPU bridge round-trips when WebGPU is on, native
// Pippenger when off) — the apples-to-apples WASM-vs-GPU MSM-phase number.
WASM_EXPORT void bb_reset_msm_phase()
{
    bb::scalar_multiplication::reset_msm_phase();
}

WASM_EXPORT void bb_emit_msm_phase()
{
    const uint64_t ns = bb::scalar_multiplication::msm_phase_ns();
    std::ostringstream oss;
    oss << std::fixed << std::setprecision(3) << (static_cast<double>(ns) / 1.0e6);
    info("[msm-phase-total] ms=", oss.str());
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
    using MSM = bb::scalar_multiplication::legacy::MSM<Curve>;
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
    const Curve::AffineElement aff = MSM::batch_multi_scalar_mul(points_batch, scalars_batch, false)[0];
    if (num_threads != 0) {
        bb::set_parallel_for_concurrency(saved_concurrency);
    }

    if (!aff.is_point_at_infinity()) {
        marshalling::write_uint256_le(&result[0], static_cast<bb::numeric::uint256_t>(aff.x));
        marshalling::write_uint256_le(&result[32], static_cast<bb::numeric::uint256_t>(aff.y));
    }
}

// ---------------------------------------------------------------------------
// True-batch native Pippenger harness exports.
//
// The single-MSM `bb_native_pippenger_bn254_run` wraps `batch_multi_scalar_mul_native`
// with batch_size = 1. The Chonk W_L/W_R/W_O and translator range-constraint
// batches go through that same `batch_multi_scalar_mul_native` but with B
// MSMs in one call — the native implementation distributes work across all
// B × n point/scalar pairs in a single `parallel_for`, amortizing the
// per-MSM Pippenger setup over the whole batch. Calling _run B times in a
// row serializes those setups, so the WebGPU dev page was comparing the
// wrong WASM path. These _batch_* exports take ONE shared n-point vector
// plus B scalar vectors and call `batch_multi_scalar_mul_native` with B
// spans, which is the apples-to-apples target for `BatchMsmV2`.
namespace {
std::vector<bb::curve::BN254::AffineElement> g_bench_batch_points;
// Flat B × n scalars buffer; sliced into B spans at run() time.
std::vector<bb::curve::BN254::ScalarField> g_bench_batch_scalars;
uint32_t g_bench_batch_size = 0;
uint32_t g_bench_batch_n = 0;
} // namespace

// Load one shared n-point vector plus a flat B × n scalar vector. The C++
// side does not duplicate the points span — all B MSMs reference the same
// in-memory vector, so memory cost is O(n) for points + O(B·n) for scalars
// independent of how many distinct MSMs share that point set.
//
// Layout of `scalars_concat`: B × n × 32 LE bytes, slot 0 first.
WASM_EXPORT void bb_native_pippenger_bn254_batch_load(const uint8_t* points,
                                                      uint32_t n,
                                                      const uint8_t* scalars_concat,
                                                      uint32_t batch_size)
{
    using Curve = bb::curve::BN254;
    namespace marshalling = bb::scalar_multiplication::webgpu_marshalling;

    g_bench_batch_points = std::vector<Curve::AffineElement>{};
    g_bench_batch_scalars = std::vector<Curve::ScalarField>{};
    g_bench_batch_points.resize(n);
    g_bench_batch_scalars.resize(static_cast<size_t>(n) * batch_size);
    g_bench_batch_n = n;
    g_bench_batch_size = batch_size;
    for (uint32_t i = 0; i < n; ++i) {
        g_bench_batch_points[i] = marshalling::read_affine_le(&points[i * 64]);
    }
    const size_t total_scalars = static_cast<size_t>(n) * batch_size;
    for (size_t i = 0; i < total_scalars; ++i) {
        g_bench_batch_scalars[i] = Curve::ScalarField(marshalling::read_uint256_le(&scalars_concat[i * 32]));
    }
}

// Run `batch_multi_scalar_mul_native` with B spans pointing at slices of the
// shared scalar buffer. Writes B × 64 LE result bytes (slot 0 first).
WASM_EXPORT void bb_native_pippenger_bn254_batch_run(uint32_t num_threads, uint8_t* results_out)
{
    using Curve = bb::curve::BN254;
    using MSM = bb::scalar_multiplication::legacy::MSM<Curve>;
    namespace marshalling = bb::scalar_multiplication::webgpu_marshalling;

    const uint32_t B = g_bench_batch_size;
    const uint32_t n = g_bench_batch_n;
    std::memset(results_out, 0, static_cast<size_t>(B) * 64);
    if (B == 0 || n == 0 || g_bench_batch_scalars.empty()) {
        return;
    }

    const size_t saved_concurrency = bb::get_num_cpus();
    if (num_threads != 0) {
        bb::set_parallel_for_concurrency(num_threads);
    }

    // Build B point spans (all identical, pointing at the shared g_bench_batch_points)
    // and B scalar spans (each a non-overlapping slice of g_bench_batch_scalars).
    std::vector<std::span<const Curve::AffineElement>> points_batch(B);
    std::vector<std::span<Curve::ScalarField>> scalars_batch(B);
    const std::span<const Curve::AffineElement> shared_points(g_bench_batch_points);
    for (uint32_t b = 0; b < B; ++b) {
        points_batch[b] = shared_points;
        scalars_batch[b] = std::span<Curve::ScalarField>(g_bench_batch_scalars.data() + static_cast<size_t>(b) * n, n);
    }
    const std::vector<Curve::AffineElement> affs = MSM::batch_multi_scalar_mul(points_batch, scalars_batch, false);

    if (num_threads != 0) {
        bb::set_parallel_for_concurrency(saved_concurrency);
    }

    for (uint32_t b = 0; b < B; ++b) {
        if (!affs[b].is_point_at_infinity()) {
            marshalling::write_uint256_le(&results_out[b * 64], static_cast<bb::numeric::uint256_t>(affs[b].x));
            marshalling::write_uint256_le(&results_out[b * 64 + 32], static_cast<bb::numeric::uint256_t>(affs[b].y));
        }
    }
}

#endif // BBERG_WEBGPU_MSM_HOOK
