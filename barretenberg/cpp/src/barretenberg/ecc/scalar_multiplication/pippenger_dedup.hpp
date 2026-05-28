// Input-scalar dedup pre-pass for the round-parallel Pippenger MSM (Phase A).
//
// Detects clusters of input scalars whose canonical (non-Montgomery) value is identical
// and spans more than one signed-Booth window, then combines each cluster's base points
// into a single (rep, combined_point) pair via a chunked batched-affine tree-reduce.
// Stage 4 then sees a redirect_lookup that rewrites the cluster's schedule entries:
// the rep gets DEDUP_REDIRECT_BIT|extra_idx (fetched from extra_points[]), the rest get
// DEDUP_SKIP_BIT and contribute nothing. This carves out two bits of the 32-bit schedule
// encoding (bit 30 = redirect, bit 29 = skip), which is why this header also owns the
// full schedule-bit encoding constants (the sign bit, the dedup bits, and the index
// mask are all co-defined).
//
// The encoding constants and the `dedup_*` workers are pulled into one file so:
//   * scalar_multiplication.cpp's Stage 4 / Stage 6a schedule readers see the bit
//     constants via this header;
//   * the dedup machinery (Phase A workers, hash table, cluster tree-reduce, redirect
//     finalize) lives as a self-contained module rather than being scattered through
//     the MSM driver. Pure code motion — every function is inline / templated, so the
//     compiler sees identical code at identical call sites and codegen is unchanged.

#pragma once

#include "./pippenger_arena_layout.hpp"

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/compiler_hints.hpp"
#include "barretenberg/common/thread.hpp"

#include <cstddef>
#include <cstdint>
#include <span>
#include <utility>

namespace bb::scalar_multiplication::round_parallel_detail {

// 32-bit schedule-entry encoding. Stage 4 stores only the point sign and scalar index;
// bucket magnitude is recovered from Stage 3's bucket_start ranges in Stage 5/6 because
// the schedule is bucket-contiguous.
//   bit 31: sign bit from the packed signed digit
//   bit 30: dedup redirect — fetch from extra_points[payload]
//   bit 29: dedup skip     — non-rep duplicate, carries no contribution
//   bits 0..28: scalar_idx, or extra_points index when redirect is set
inline constexpr uint32_t SCHEDULE_SIGN_BIT = uint32_t{ 1 } << 31;
inline constexpr uint32_t DEDUP_REDIRECT_BIT = uint32_t{ 1 } << 30;
inline constexpr uint32_t DEDUP_SKIP_BIT = uint32_t{ 1 } << 29;
inline constexpr uint32_t SCHEDULE_INDEX_MASK = DEDUP_SKIP_BIT - 1;
static_assert((SCHEDULE_SIGN_BIT & DEDUP_REDIRECT_BIT) == 0);
static_assert((SCHEDULE_SIGN_BIT & DEDUP_SKIP_BIT) == 0);
static_assert((DEDUP_REDIRECT_BIT & DEDUP_SKIP_BIT) == 0);
static_assert((SCHEDULE_INDEX_MASK & (SCHEDULE_SIGN_BIT | DEDUP_REDIRECT_BIT | DEDUP_SKIP_BIT)) == 0);
static_assert((SCHEDULE_INDEX_MASK | DEDUP_REDIRECT_BIT | DEDUP_SKIP_BIT) == ~SCHEDULE_SIGN_BIT);
inline constexpr uint32_t DEDUP_INVALID_EXTRA = ~uint32_t{ 0 };

[[nodiscard]] inline uint64_t dedup_scalar_fingerprint(const uint64_t* scalar_data) noexcept
{
    return scalar_data[0];
}

[[nodiscard]] inline size_t dedup_fingerprint_slot(uint64_t fingerprint, size_t mask) noexcept
{
    uint64_t h = fingerprint * 0x9E3779B97F4A7C15ULL;
    h ^= h >> 32;
    return static_cast<size_t>(h) & mask;
}

// ===================================================================================
// Input-scalar dedup pre-pass.
// ===================================================================================
//
// For each cluster of input scalars whose canonical value is identical and spans more
// than one bucket window of width c (msb >= c), combine the cluster's base points into
// a single (rep, combined_point) pair so Pippenger only iterates the cluster once
// instead of `cluster_size` times.
//
// Detection: sort an index permutation by `scalars[i].data[0]` (a one-limb predicate;
// equal-value scalars are guaranteed to collide on data[0] so they cluster contiguously
// in the sorted output, with at most a few false-collision PAIRS expected per MSM at
// chonk's scale). Walk runs of equal data[0]; verify each pair with a full memcmp.
//
// Combine: build a flat (cluster_pts, cluster_ids) array with same-cluster entries
// contiguous, then run an in-place tree-reduce that pairs adjacent same-cluster-id
// entries via `batch_affine_add_interleaved` (one inversion per BATCH_CAPACITY pairs)
// until each cluster has a single surviving entry. Avoids the per-cluster Element += /
// AffineElement(cast) round-trip that does one inversion per cluster.
//
// Output: a redirect_lookup[n] mapping scalar_idx → final dedup schedule payload
// (DEDUP_REDIRECT_BIT | extra_idx, DEDUP_SKIP_BIT | scalar_idx, or INVALID = no patch).
// Stage 4b ORs that payload with the preserved sign bit. The underlying canonical scalar
// value is left untouched (`scalars` aliases the caller's polynomial and is restored to
// Mont form on exit; mutating it would corrupt downstream consumers).

template <typename Curve> struct DedupResult {
    std::span<uint32_t> redirect_lookup;                   // size n; INVALID or encoded dedup payload.
                                                           // Allocated from the pippenger arena
                                                           // (no zero-init); filled with INVALID
                                                           // by a parallel_for before Phase A.
    std::span<typename Curve::AffineElement> extra_points; // size DEDUP_MAX_CLUSTERS; arena-allocated.
                                                           // Phase A writes per-cluster aggregates
                                                           // into thread-disjoint cid ranges.
    size_t n_dedup_extras = 0;                             // # extra_points populated by Phase A
};

// In-place batched-affine tree-reduce over (pts[0..len), cluster_ids[0..len)) with
// same-cluster entries contiguous. After return, pts[0..result_len) holds one combined
// point per cluster (paired in cluster-id order); ids[0..result_len) tracks the
// surviving cluster_id at each slot. Caller-provided scratch (`scratch_pts`,
// `pair_dest`, `inversion_scratch`) sized to BATCH_CAPACITY pairs.
template <typename Curve>
inline size_t dedup_tree_reduce_in_place(typename Curve::AffineElement* pts,
                                         uint32_t* ids,
                                         size_t initial_len,
                                         typename Curve::AffineElement* scratch_pts,
                                         uint32_t* pair_dest,
                                         typename Curve::BaseField* inversion_scratch) noexcept
{
    using AffineElement = typename Curve::AffineElement;
    using BaseField = typename Curve::BaseField;

    const auto drain = [&](size_t pair_count) noexcept {
        if (pair_count == 0) {
            return;
        }
        bb::group_elements::batch_affine_add_interleaved<AffineElement, BaseField>(
            scratch_pts, 2 * pair_count, inversion_scratch);
        for (size_t k = 0; k < pair_count; ++k) {
            pts[pair_dest[k]] = scratch_pts[pair_count + k];
        }
    };

    size_t curr_len = initial_len;
    while (true) {
        size_t i = 0;
        size_t next_len = 0;
        size_t pair_count = 0;
        bool made_pair = false;

        while (i < curr_len) {
            if (i + 1 < curr_len && ids[i] == ids[i + 1]) {
                scratch_pts[2 * pair_count] = pts[i];
                scratch_pts[(2 * pair_count) + 1] = pts[i + 1];
                ids[next_len] = ids[i];
                pair_dest[pair_count] = static_cast<uint32_t>(next_len);
                ++next_len;
                ++pair_count;
                i += 2;
                made_pair = true;
                if (pair_count >= BATCH_CAPACITY) {
                    drain(pair_count);
                    pair_count = 0;
                }
            } else {
                pts[next_len] = pts[i];
                ids[next_len] = ids[i];
                ++next_len;
                ++i;
            }
        }
        drain(pair_count);

        if (!made_pair) {
            break;
        }
        curr_len = next_len;
    }
    return curr_len;
}

// Hard caps that bound the worst-case dedup-on memory at ≤ 4 MB above dedup-off, for
// all possible inputs.
//
//   redirect_lookup[n] = 4 n bytes (≤ 2 MB at n = 2^19)
//   extra_points[MAX_CLUSTERS] = 64 × MAX_CLUSTERS bytes
//   per-thread Phase A scratch: bounded by per-thread chunk size + chunk_pts buffer
//
// All phases ≤ 4 MB regardless of input shape. The caps degrade gracefully: when hit
// we leave un-deduped scalars on the standard pippenger path (still correct, just
// less savings).
// `DEDUP_MAX_CLUSTERS`, `DEDUP_MAX_MEMBERS`, and `DEDUP_MAX_CHUNK_MEMBERS` are defined
// in `pippenger_arena_layout.hpp` so the test harness can size the matching slabs.
static_assert(DEDUP_MAX_CLUSTERS <= size_t{ SCHEDULE_INDEX_MASK } + 1,
              "dedup extra-point ids must fit in the schedule payload");

// Per-worker Phase A scratch backed by the pippenger arena. Replaces the prior
// `thread_local std::vector<...>` slabs so process-resident memory after the MSM
// drops back to zero and the per-worker working set is deterministic.
//
// All caps below are *loose upper bounds* — when a runtime population exceeds them,
// the cluster-scan / tree-reduce inner loops already fall through to "leave un-deduped"
// behaviour via `clusters_opened >= cid_max - cid_lo` and the `room` calculation in the
// tree-reduce chunk-fill loop.
template <typename Curve> struct PhaseAScratch {
    // Worst case = every cluster on this worker has exactly one member. Per-worker
    // cluster budget is `DEDUP_MAX_CLUSTERS / num_threads`; `DEDUP_MAX_MEMBERS / num_threads`
    // is a looser, structurally simpler bound. +1 covers the final partition rounding slop.
    std::span<uint32_t> cluster_members;
    // One entry per opened cluster + the initial 0 sentinel pushed at function entry.
    // Cap = (DEDUP_MAX_CLUSTERS / num_threads) + 2 (covers the +1 sentinel and rounding).
    std::span<uint32_t> cluster_offsets;
    // One uint16_t per hash-table slot dirtied since the last bucket; HT_SIZE = 4096 is
    // the structural cap — every slot can at most be dirtied once per bucket.
    std::span<uint16_t> dirty_slots;
    // Per-bucket cluster representative scalar_idx. Current code reserves 32; widening
    // to 256 covers chonk-wire worst cases (mega-buckets) without resizing.
    std::span<uint32_t> bucket_rep;
    // Per-bucket staged (bucket_cid, idx) pairs awaiting cluster emission. Current code
    // reserves 64; widening to 1024 covers the chonk-wire mega-bucket worst case.
    std::span<std::pair<uint32_t, uint32_t>> staged;
    // Tree-reduce per-iteration working sets. Both capped at DEDUP_MAX_CHUNK_MEMBERS=2048;
    // see the constant's definition above.
    std::span<typename Curve::AffineElement> chunk_pts;
    std::span<uint32_t> chunk_ids;
};

// Per-bucket hash-based dedup. Each thread owns a contiguous range of buckets in
// window 0's schedule. For each bucket, we build a tiny open-addressing hash
// table over the long-scalar entries (msb >= c_threshold) — short entries are
// skipped because their dedup savings (W_nz ≈ 1) are zero. Slot selection uses
// a cheap one-limb fingerprint; full 4-limb memcmp still gates every match.
// Hash collisions resolve via linear probing; same-value collisions become cluster matches.
// Replaces the old "std::sort each bucket then run consecutive-pair walk"
// approach: hash is O(K) per bucket vs O(K log K), avoids the 32-byte memcmp
// comparator entirely (one-limb hash on insert, full compare only on fingerprint
// hits), and keeps thread balance uniform because skipping shorts removes the
// mega-bucket bottleneck.
//
// Output: per-thread cluster_members + cluster_offsets feeding a chunked
// batched-affine tree-reduce, plus encoded redirect_lookup writes
// (rep -> DEDUP_REDIRECT_BIT | cid, non_rep -> DEDUP_SKIP_BIT | idx).
// The thread's cid space is the disjoint per-thread sub-range [cid_lo, cid_max).
template <typename Curve>
size_t dedup_phase_a_worker_hash(const uint32_t* schedule_w0,
                                 const size_t* w0_bucket_start,
                                 size_t b_lo,
                                 size_t b_hi,
                                 std::span<const typename Curve::ScalarField> scalars,
                                 std::span<const typename Curve::AffineElement> points,
                                 std::span<typename Curve::AffineElement> extra_points,
                                 std::span<uint32_t> redirect_lookup,
                                 const uint8_t* msb_per_scalar,
                                 size_t c_threshold,
                                 uint32_t cid_lo,
                                 uint32_t cid_max,
                                 PhaseAScratch<Curve>& scratch) noexcept
{
    using AffineElement = typename Curve::AffineElement;
    using BaseField = typename Curve::BaseField;
    constexpr uint32_t HT_EMPTY = ~uint32_t{ 0 };

    // Per-thread hash table — sized for the largest expected bucket. Long-
    // scalar density per bucket is highly NON-uniform on chonk wires: the few
    // buckets corresponding to digit_0 ∈ {1,2,3,…} hold 700+ long entries with
    // 500+ distinct values. A 256-slot table fills up and the open-addressing
    // probe goes infinite. A 4096-slot table keeps load <25% even on the worst
    // bucket. 4096 × 4 = 16 KB per thread.
    //
    // We use LAZY CLEARING via a dirty-slot list rather than std::fill_n per
    // bucket: a 16 KB fill × ~2 K buckets × 8 threads = 256 MB of write traffic
    // per Phase A, which dominates the cluster-scan wall (≈ 280 ms / 450 ms on
    // the WASM trace). With lazy clear the per-bucket reset cost scales with
    // the number of slots ACTUALLY written (typically 25-700), not 4096.
    constexpr size_t HT_SIZE = 4096;
    constexpr size_t HT_MASK = HT_SIZE - 1;
    static_assert((HT_SIZE & (HT_SIZE - 1)) == 0, "HT_SIZE must be a power of 2");
    std::array<uint32_t, HT_SIZE> ht;

    // The hash table maps scalar_value → either (a) the singleton scalar_idx
    // observed first, or (b) a sentinel pointing into cluster_members for an
    // already-opened cluster. We disambiguate via a separate parallel slot
    // status array (bit-set if slot holds a cluster pointer). To keep the data
    // structure simple, we instead use TWO sentinel bits in the high end of
    // the uint32_t scalar_idx:
    //   high bit clear → slot holds a singleton scalar_idx (just one observation)
    //   high bit set   → slot holds (cluster_id | HT_CLUSTER_BIT)
    // scalar_idx values fit the schedule payload (29 bits), so the top 3 bits are free.
    constexpr uint32_t HT_CLUSTER_BIT = uint32_t{ 1 } << 31;

    // Per-worker arena-backed scratch spans. Caller allocates `scratch` once at the start
    // of the MSM (see `pippenger_round_parallel_internal`); we treat them as bounded
    // capacity buffers with a logical-size cursor. No allocator churn, no thread_local
    // process state to clean up after the MSM returns.
    uint32_t* const cluster_members_data = scratch.cluster_members.data();
    const size_t cluster_members_cap = scratch.cluster_members.size();
    size_t cluster_members_size = 0;
    uint32_t* const cluster_offsets_data = scratch.cluster_offsets.data();
    const size_t cluster_offsets_cap = scratch.cluster_offsets.size();
    size_t cluster_offsets_size = 0;
    uint16_t* const dirty_slots_data = scratch.dirty_slots.data();
    const size_t dirty_slots_cap = scratch.dirty_slots.size();
    size_t dirty_slots_size = 0;
    {
        BB_BENCH_NAME("MSM::PhaseA/alloc_buffers");
        // Cluster offsets always pushes a 0 sentinel first.
        BB_ASSERT_GTE(cluster_offsets_cap, size_t{ 1 });
        cluster_offsets_data[cluster_offsets_size++] = 0;
    }

    // Initial fill — uninitialised stack memory could match HT_EMPTY values
    // by coincidence. After this, clearing is incremental via dirty_slots.
    std::fill_n(ht.data(), HT_SIZE, HT_EMPTY);
    // Slot-local one-limb fingerprints for occupied hash-table entries. They are
    // valid iff `ht[slot] != HT_EMPTY`; lazy clearing only needs to reset `ht`.
    std::array<uint64_t, HT_SIZE> ht_fingerprint;

    uint32_t clusters_opened = 0;
    {
        BB_BENCH_NAME("MSM::PhaseA/cluster_scan");
        // Per-bucket scratch — both backed by arena spans (caller-allocated).
        //   - `bucket_rep[bucket_cid]` = scalar_idx of the rep for that in-bucket cluster.
        //   - `staged[..]`             = (bucket_cid, idx) pairs awaiting cluster emission.
        uint32_t* const bucket_rep_data = scratch.bucket_rep.data();
        const size_t bucket_rep_cap = scratch.bucket_rep.size();
        size_t bucket_rep_size = 0;
        std::pair<uint32_t, uint32_t>* const staged_data = scratch.staged.data();
        const size_t staged_cap = scratch.staged.size();
        size_t staged_size = 0;

        for (size_t b = b_lo; b < b_hi; ++b) {
            const size_t lo = w0_bucket_start[b];
            const size_t hi = w0_bucket_start[b + 1];
            if (hi - lo < 2) {
                continue;
            }

            // Lazy clear: reset only slots dirtied by the previous bucket.
            for (size_t k = 0; k < dirty_slots_size; ++k) {
                ht[dirty_slots_data[k]] = HT_EMPTY;
            }
            dirty_slots_size = 0;
            bucket_rep_size = 0;
            staged_size = 0;

            for (size_t i = lo; i < hi; ++i) {
                const uint32_t idx = schedule_w0[i] & SCHEDULE_INDEX_MASK;
                if (static_cast<size_t>(msb_per_scalar[idx]) < c_threshold) {
                    continue;
                }
                const uint64_t* d = scalars[idx].data;
                const uint64_t fingerprint = dedup_scalar_fingerprint(d);
                size_t slot = dedup_fingerprint_slot(fingerprint, HT_MASK);

                // Probe-count safety net. With HT_SIZE = 4096 and per-bucket distinct-
                // long-value counts up to ~700 on chonk wires, table load is ≤ 17 %
                // and the average probe length is ≈ 1.1 — but if any future workload
                // produces a bucket dense enough to fill the table, fall back to
                // "treat as singleton, don't dedup" rather than infinite-loop.
                size_t probe_count = 0;
                while (true) {
                    if (++probe_count > HT_SIZE) {
                        break;
                    }
                    const uint32_t entry = ht[slot];
                    if (entry == HT_EMPTY) {
                        ht[slot] = idx;
                        ht_fingerprint[slot] = fingerprint;
                        // If the dirty-slot list overflows its cap we must NOT skip the
                        // record — every subsequent bucket would then leak slots forward.
                        // Cap is HT_SIZE so this is structurally unreachable.
                        if (BB_LIKELY(dirty_slots_size < dirty_slots_cap)) {
                            dirty_slots_data[dirty_slots_size++] = static_cast<uint16_t>(slot);
                        }
                        break;
                    }
                    if ((entry & HT_CLUSTER_BIT) != 0) {
                        const uint32_t bucket_cid = entry & ~HT_CLUSTER_BIT;
                        const uint32_t rep = bucket_rep_data[bucket_cid];
                        if (ht_fingerprint[slot] == fingerprint &&
                            std::memcmp(d, scalars[rep].data, sizeof(scalars[rep].data)) == 0) {
                            // Out of staged-pair capacity: leave this duplicate un-deduped
                            // (it will go through the standard pippenger path).
                            if (BB_UNLIKELY(staged_size >= staged_cap)) {
                                break;
                            }
                            staged_data[staged_size++] = { bucket_cid, idx };
                            break;
                        }
                        slot = (slot + 1) & HT_MASK;
                        continue;
                    }
                    // Singleton at slot: compare values.
                    if (ht_fingerprint[slot] == fingerprint &&
                        std::memcmp(d, scalars[entry].data, sizeof(scalars[entry].data)) == 0) {
                        if (clusters_opened >= (cid_max - cid_lo)) {
                            break; // cap reached, leave un-deduped
                        }
                        // Out of bucket_rep / staged capacity: leave un-deduped.
                        if (BB_UNLIKELY(bucket_rep_size >= bucket_rep_cap || staged_size >= staged_cap)) {
                            break;
                        }
                        const uint32_t bucket_cid = static_cast<uint32_t>(bucket_rep_size);
                        bucket_rep_data[bucket_rep_size++] = entry;
                        staged_data[staged_size++] = { bucket_cid, idx };
                        ht[slot] = HT_CLUSTER_BIT | bucket_cid;
                        ++clusters_opened;
                        break;
                    }
                    slot = (slot + 1) & HT_MASK;
                }
            }

            if (bucket_rep_size == 0) {
                continue;
            }

            // Sort staged non-reps by bucket_cid so each cluster's members are
            // contiguous; then emit (rep, non-reps...) per cluster.
            std::stable_sort(staged_data,
                             staged_data + staged_size,
                             [](const std::pair<uint32_t, uint32_t>& a,
                                const std::pair<uint32_t, uint32_t>& b) noexcept { return a.first < b.first; });
            size_t staged_cursor = 0;
            for (size_t bc = 0; bc < bucket_rep_size; ++bc) {
                // Compute this cluster's member count up front (rep + staged non-reps with
                // matching bucket_cid) so we never split a cluster across the slab cap.
                // When the next cluster would overflow cluster_members_cap, break cleanly:
                // un-flattened cluster reps/members never get a redirect_lookup entry, so
                // Stage 4/6a process them as normal scalars with their original signed
                // digits. The MSM sum is unchanged; we just deliver less dedup work.
                size_t this_cluster_members = 1; // rep
                for (size_t sc = staged_cursor; sc < staged_size && staged_data[sc].first == bc; ++sc) {
                    ++this_cluster_members;
                }
                if (cluster_members_size + this_cluster_members > cluster_members_cap) {
                    break;
                }
                cluster_members_data[cluster_members_size++] = bucket_rep_data[bc];
                while (staged_cursor < staged_size && staged_data[staged_cursor].first == bc) {
                    cluster_members_data[cluster_members_size++] = staged_data[staged_cursor].second;
                    ++staged_cursor;
                }
                // cluster_offsets cap is provably non-overflow given clusters_opened ≤
                // cids_per_thread and cluster_offsets_cap = cids_per_thread + 2; the
                // initial 0 sentinel plus at most cids_per_thread end-offsets fits.
                cluster_offsets_data[cluster_offsets_size++] = static_cast<uint32_t>(cluster_members_size);
            }
        }
    } // MSM::PhaseA/cluster_scan

    // Only flattened clusters are published. `clusters_opened` counts every promoted
    // hash-table singleton, including clusters later skipped because cluster_members_cap
    // would be exceeded. Skipped clusters intentionally fall through the normal Pippenger
    // path because they never get redirect_lookup entries.
    const size_t num_clusters = cluster_offsets_size - 1;
    if (num_clusters == 0) {
        return 0;
    }

    // For tree_reduce we need a single contiguous member list; cluster_members_data is
    // already such a list, with [cluster_offsets[k], cluster_offsets[k+1]) per cluster.
    // cluster_offsets_size = num_clusters + 1 (initial 0 sentinel + one push per cluster).
    BB_ASSERT_EQ(cluster_offsets_size, num_clusters + 1, "cluster_offsets layout mismatch");

    {
        BB_BENCH_NAME("MSM::PhaseA/tree_reduce");
        typename Curve::AffineElement* const chunk_pts_data = scratch.chunk_pts.data();
        uint32_t* const chunk_ids_data = scratch.chunk_ids.data();
        const size_t chunk_cap = scratch.chunk_pts.size();
        BB_ASSERT_GTE(chunk_cap, DEDUP_MAX_CHUNK_MEMBERS);
        BB_ASSERT_GTE(scratch.chunk_ids.size(), DEDUP_MAX_CHUNK_MEMBERS);
        size_t chunk_size = 0;
        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-member-init)
        std::array<AffineElement, 2 * BATCH_CAPACITY> scratch_pts;
        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-member-init)
        std::array<uint32_t, BATCH_CAPACITY> pair_dest;
        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-member-init)
        std::array<BaseField, BATCH_CAPACITY> inversion_scratch;

        size_t cid_cursor = 0;
        size_t member_offset_in_cluster = 0;
        AffineElement carry{};
        bool has_carry = false;

        while (cid_cursor < num_clusters || has_carry) {
            chunk_size = 0;
            if (has_carry) {
                chunk_pts_data[chunk_size] = carry;
                chunk_ids_data[chunk_size] = static_cast<uint32_t>(cid_cursor);
                ++chunk_size;
                has_carry = false;
            }
            while (cid_cursor < num_clusters && chunk_size < DEDUP_MAX_CHUNK_MEMBERS) {
                const size_t cluster_lo = cluster_offsets_data[cid_cursor] + member_offset_in_cluster;
                const size_t cluster_hi = cluster_offsets_data[cid_cursor + 1];
                const size_t available = cluster_hi - cluster_lo;
                const size_t room = DEDUP_MAX_CHUNK_MEMBERS - chunk_size;
                if (available <= room) {
                    for (size_t k = 0; k < available; ++k) {
                        chunk_pts_data[chunk_size] = points[cluster_members_data[cluster_lo + k]];
                        chunk_ids_data[chunk_size] = static_cast<uint32_t>(cid_cursor);
                        ++chunk_size;
                    }
                    ++cid_cursor;
                    member_offset_in_cluster = 0;
                } else {
                    for (size_t k = 0; k < room; ++k) {
                        chunk_pts_data[chunk_size] = points[cluster_members_data[cluster_lo + k]];
                        chunk_ids_data[chunk_size] = static_cast<uint32_t>(cid_cursor);
                        ++chunk_size;
                    }
                    member_offset_in_cluster += room;
                    break;
                }
            }
            const size_t result_len = dedup_tree_reduce_in_place<Curve>(chunk_pts_data,
                                                                        chunk_ids_data,
                                                                        chunk_size,
                                                                        scratch_pts.data(),
                                                                        pair_dest.data(),
                                                                        inversion_scratch.data());
            const bool last_is_partial = (cid_cursor < num_clusters) && (member_offset_in_cluster > 0);
            const size_t whole_count = last_is_partial ? result_len - 1 : result_len;
            for (size_t k = 0; k < whole_count; ++k) {
                const uint32_t local_cid = chunk_ids_data[k];
                extra_points[cid_lo + local_cid] = chunk_pts_data[k];
            }
            if (last_is_partial) {
                carry = chunk_pts_data[result_len - 1];
                has_carry = true;
            }
        }
    } // MSM::PhaseA/tree_reduce

    {
        BB_BENCH_NAME("MSM::PhaseA/publish_redirects");
        for (size_t k = 0; k < num_clusters; ++k) {
            const size_t mlo = cluster_offsets_data[k];
            const size_t mhi = cluster_offsets_data[k + 1];
            const uint32_t rep_idx = cluster_members_data[mlo];
            const uint32_t global_cid = cid_lo + static_cast<uint32_t>(k);
            redirect_lookup[rep_idx] = DEDUP_REDIRECT_BIT | global_cid;
            for (size_t m = mlo + 1; m < mhi; ++m) {
                const uint32_t non_rep_idx = cluster_members_data[m];
                redirect_lookup[non_rep_idx] = DEDUP_SKIP_BIT | non_rep_idx;
            }
        }
    }

    return num_clusters;
}

// Post-Phase-A schedule patcher. Walks a window's already-emitted bucket runs,
// rewrites entries whose scalar_idx has an encoded dedup payload, and compacts
// non-rep DEDUP_SKIP entries out of the schedule.
// The hot Stage 4 emit loop is now dedup-unaware (plain `sched_w[idx] = sign | scalar_idx`);
// all dedup tagging happens here.
//
// This is a free function — NOT a lambda capturing dedup_state by reference — so
// `redirect_lookup` is passed as a raw pointer argument and the inner loop has no
// closure-indirection chain. The only random load per iter is the single
// `redirect_lookup[scalar_idx]` lookup, which lands in L2 for typical MSM sizes.
// `bucket_start` is rewritten in place, so each old bucket end is saved before
// its prefix slot is overwritten with the compacted end.
template <typename Curve>
[[gnu::flatten]] inline void dedup_patch_schedule_window(uint32_t* __restrict sched_w,
                                                         size_t* __restrict bucket_start,
                                                         size_t num_buckets,
                                                         const uint32_t* __restrict redirect_lookup) noexcept
{
    static_cast<void>(static_cast<Curve*>(nullptr)); // template tag for symbol disambiguation
    size_t write = 0;
    size_t old_bucket_start = bucket_start[0];
    bucket_start[0] = 0;
    for (size_t bucket = 0; bucket < num_buckets; ++bucket) {
        const size_t old_bucket_end = bucket_start[bucket + 1];
        for (size_t read = old_bucket_start; read < old_bucket_end; ++read) {
            const uint32_t e = sched_w[read];
            const uint32_t idx = e & SCHEDULE_INDEX_MASK;
            const uint32_t patch = redirect_lookup[idx];
            uint32_t out = e;
            if (BB_UNLIKELY(patch != DEDUP_INVALID_EXTRA)) {
                if ((patch & DEDUP_SKIP_BIT) != 0) {
                    continue;
                }
                out = (e & SCHEDULE_SIGN_BIT) | patch;
            }
            if (write != read || out != e) {
                sched_w[write] = out;
            }
            ++write;
        }
        old_bucket_start = old_bucket_end;
        bucket_start[bucket + 1] = write;
    }
}

} // namespace bb::scalar_multiplication::round_parallel_detail
