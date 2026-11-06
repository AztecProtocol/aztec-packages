// Device translation unit for the batched GPU MSM core. Includes the kernel arithmetic (msm_kernels_impl.hpp).
// This file needs nvcc and the CUDA toolkit's CUB headers. It is compiled by a dedicated nvcc command when the
// GPU_MSM CMake option is on.
//
// Large batches are split into column groups: the host prepares group k + 1 (a parallel count-then-fill pass
// that drops zero scalars) while the device works on group k. For each group the device first merges
// identical wide scalars of a column (dedup_repeated_scalars), then runs a group of windows at a time, every
// step on the device. Windows are independent, so within a group each (window, column) pair is a virtual
// column and all of them go through each step together:
//   1. msm_bucket_key_kernel: one thread per (non-zero item, window), writes the sort key
//      virtual_column * num_buckets + digit (kernels::signed_window_digit).
//   2. cub::DeviceRadixSort sorts the item indices by key and msm_bucket_ranges_kernel records each
//      (virtual column, bucket) slot's [start, end) range in the sorted order.
//   3. msm_bucket_accumulate_kernel: one thread per (virtual column, bucket) slot folds the points of
//      exactly the items in its range (kernels::kernel_bucket_term / kernels::kernel_accumulate); slots
//      with more than kHeavyChunk items are split over the heavy chunk and combine kernels.
//   4. msm_reduce_segments_kernel and msm_reduce_combine_kernel reduce each virtual column's buckets into
//      that window's contribution.
// Once every window has run, msm_finalize_kernel combines each column's per-window contributions
// with kernels::combine_window_contributions and converts the result with kernels::kernel_finalize.
#include "msm_kernels_impl.hpp"
#include <cub/device/device_radix_sort.cuh>
#include <cub/device/device_select.cuh>
#include <cub/iterator/counting_input_iterator.cuh>

#include <algorithm>
#include <atomic>
#include <climits>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <future>
#include <memory>
#include <thread>
#include <vector>

namespace bb::gpu_msm {

namespace {

// Supported explicit window_bits range. 0 is not in this range -- it means "pick one automatically" -- and is
// handled before this range is consulted. Any explicit value outside [kMinWindowBits, kMaxWindowBits] is a caller
// mistake and is rejected loudly (see fail_window_bits below) rather than silently clamped or allowed to produce a
// wrong result.
constexpr uint32_t kMinWindowBits = 2;
constexpr uint32_t kMaxWindowBits = 16;
// The automatic choice stops here even for very large columns: above it the per-bucket reduction costs more
// than the saved windows (measured on an RTX 4090: 13 bits beats the log2 rule's 14-16 by 15-25%).
constexpr uint32_t kMaxAutoWindowBits = 13;

constexpr cudaError_t kCudaOk = static_cast<cudaError_t>(0);

[[noreturn]] void fail_window_bits(uint32_t window_bits)
{
    std::fprintf(stderr,
                 "msm_batch_cuda: unsupported window_bits=%u (supported: 0 to pick automatically, "
                 "or an explicit value in %u..%u)\n",
                 window_bits,
                 kMinWindowBits,
                 kMaxWindowBits);
    std::fflush(stderr);
    std::abort();
}

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
    if (bits > kMaxAutoWindowBits) {
        bits = kMaxAutoWindowBits;
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

// Every device allocation made so far by this call to msm_batch_cuda, so die() can free all of them before the
// process exits. free_all() does not check the cudaFree statuses because it only runs on that failure path.
struct DeviceAllocs {
    std::vector<void*> ptrs;
    void add(void* p) { ptrs.push_back(p); }
    void release(void* p) { ptrs.erase(std::remove(ptrs.begin(), ptrs.end(), p), ptrs.end()); }
    void free_all()
    {
        for (void* p : ptrs) {
            if (p != nullptr) {
                cudaFree(p);
            }
        }
        ptrs.clear();
    }
};

[[noreturn]] void die(const char* what, DeviceAllocs& allocs)
{
    allocs.free_all();
    std::fprintf(stderr, "msm_batch_cuda: %s failed\n", what);
    std::fflush(stderr);
    std::abort();
}

constexpr unsigned kThreadsPerBlock = 256;

// A (column, bucket) slot with more than this many items is "heavy": its items are folded by several
// threads, kHeavyChunk items each, and the partial sums are added up afterwards. Slots at or below it
// are folded by a single thread.
constexpr uint32_t kHeavyChunk = 256;
constexpr uint32_t kSignBit = 0x80000000u;

// Index of the column that owns `item`, by binary search over the (non-decreasing) column starts.
__device__ inline uint32_t column_of(const uint64_t* col_start, uint32_t num_columns, uint64_t item)
{
    uint32_t lo = 0;
    uint32_t hi = num_columns;
    while (hi - lo > 1) {
        const uint32_t mid = lo + (hi - lo) / 2;
        if (col_start[mid] <= item) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    return lo;
}

// One thread per (work item, window of the group): writes the sort key, virtual_column * num_buckets +
// magnitude of the signed digit, and the sort value, the item index with kSignBit set when the digit is
// negative. The virtual column of window first_window + k and column c is k * num_columns + c, so every
// (window, column) pair of the group has its own run of num_buckets slots. The column is found by binary
// search over the (non-decreasing) column starts. A zero digit maps to bucket 0 of its virtual column,
// which no later step reads.
__global__ void msm_bucket_key_kernel(const U256* work_scalars,
                                      const uint64_t* col_start,
                                      uint32_t num_columns,
                                      uint64_t work_items,
                                      uint32_t group,
                                      uint32_t first_window,
                                      uint32_t window_bits,
                                      uint32_t num_buckets,
                                      uint32_t* keys,
                                      uint32_t* items)
{
    const uint64_t idx = static_cast<uint64_t>(blockIdx.x) * static_cast<uint64_t>(blockDim.x) + threadIdx.x;
    if (idx >= work_items * group) {
        return;
    }
    const uint32_t local_window = static_cast<uint32_t>(idx / work_items);
    const uint64_t item = idx - static_cast<uint64_t>(local_window) * work_items;
    const uint32_t lo = column_of(col_start, num_columns, item);
    bool negative = false;
    const uint32_t magnitude =
        kernels::signed_window_digit(work_scalars[item], first_window + local_window, window_bits, negative);
    keys[idx] = (local_window * num_columns + lo) * num_buckets + magnitude;
    items[idx] = static_cast<uint32_t>(item) | (negative ? kSignBit : 0u);
}

// One thread per sorted item: records, for each key, the [start, end) range it occupies in the sorted
// order. Slots with no items keep the zero-initialised (empty) range.
__global__ void msm_bucket_ranges_kernel(const uint32_t* sorted_keys,
                                         uint64_t work_items,
                                         uint32_t* range_start,
                                         uint32_t* range_end)
{
    const uint64_t i = static_cast<uint64_t>(blockIdx.x) * static_cast<uint64_t>(blockDim.x) + threadIdx.x;
    if (i >= work_items) {
        return;
    }
    const uint32_t key = sorted_keys[i];
    if (i == 0 || sorted_keys[i - 1] != key) {
        range_start[key] = static_cast<uint32_t>(i);
    }
    if (i + 1 == work_items || sorted_keys[i + 1] != key) {
        range_end[key] = static_cast<uint32_t>(i + 1);
    }
}

// One thread per sorted item that ends a run of equal keys: if the run is heavy, appends it to the
// heavy list. A single 64-bit atomic hands out both the list position (high 32 bits) and the first
// chunk id (low 32 bits), so chunk ids grow with list position.
__global__ void msm_heavy_list_kernel(const uint32_t* sorted_keys,
                                      uint64_t work_items,
                                      uint32_t num_buckets,
                                      const uint32_t* range_start,
                                      unsigned long long* counter,
                                      uint32_t* heavy_key,
                                      uint32_t* heavy_base)
{
    const uint64_t i = static_cast<uint64_t>(blockIdx.x) * static_cast<uint64_t>(blockDim.x) + threadIdx.x;
    if (i >= work_items) {
        return;
    }
    const uint32_t key = sorted_keys[i];
    if (i + 1 != work_items && sorted_keys[i + 1] == key) {
        return;
    }
    if (key % num_buckets == 0) {
        return;
    }
    const uint32_t count = static_cast<uint32_t>(i + 1) - range_start[key];
    if (count <= kHeavyChunk) {
        return;
    }
    const uint32_t chunks = (count + kHeavyChunk - 1) / kHeavyChunk;
    const unsigned long long old = atomicAdd(counter, (1ULL << 32) | chunks);
    const uint32_t position = static_cast<uint32_t>(old >> 32);
    heavy_key[position] = key;
    heavy_base[position] = static_cast<uint32_t>(old & 0xffffffffULL);
}

// Folds the points of items [begin, end) of the sorted order, negating those whose sort value carries
// kSignBit. All point arithmetic is kernels::kernel_bucket_term / kernels::kernel_accumulate.
template <class F>
__device__ kernels::JacobianPoint fold_sorted_items(const AffinePoint* work_points,
                                                    const uint32_t* sorted_items,
                                                    uint32_t begin,
                                                    uint32_t end)
{
    kernels::JacobianPoint acc = kernels::jac_identity<F>();
    for (uint32_t j = begin; j < end; j++) {
        const uint32_t item = sorted_items[j];
        AffinePoint point = work_points[item & ~kSignBit];
        if (point.infinity) {
            continue;
        }
        if ((item & kSignBit) != 0) {
            point.y = kernels::negate_mod_p<F>(point.y);
        }
        acc = kernels::kernel_accumulate<F>(acc, kernels::kernel_bucket_term<F>(point));
    }
    return acc;
}

// One thread per (column, bucket) pair: bucket index from the x dimension, column index from the y
// dimension. Bucket 0 is never written. A light slot is folded and written here; a heavy slot is left
// to the chunk and combine kernels below.
template <class F>
__global__ void msm_bucket_accumulate_kernel(const AffinePoint* work_points,
                                             const uint32_t* sorted_items,
                                             const uint32_t* range_start,
                                             const uint32_t* range_end,
                                             uint32_t num_columns,
                                             uint32_t num_buckets,
                                             kernels::JacobianPoint* buckets)
{
    const uint32_t bucket = blockIdx.x * blockDim.x + threadIdx.x;
    const uint32_t col = blockIdx.y;
    if (bucket >= num_buckets || col >= num_columns || bucket == 0) {
        return;
    }
    const uint64_t slot = static_cast<uint64_t>(col) * num_buckets + bucket;
    const uint32_t begin = range_start[slot];
    const uint32_t end = range_end[slot];
    if (end - begin > kHeavyChunk) {
        return;
    }
    buckets[slot] = fold_sorted_items<F>(work_points, sorted_items, begin, end);
}

// One thread per chunk of a heavy slot: finds its slot by binary search over the chunk bases and folds
// its kHeavyChunk items into partials[chunk].
template <class F>
__global__ void msm_heavy_chunk_kernel(const AffinePoint* work_points,
                                       const uint32_t* sorted_items,
                                       const uint32_t* range_start,
                                       const uint32_t* range_end,
                                       const uint32_t* heavy_key,
                                       const uint32_t* heavy_base,
                                       uint32_t num_heavy,
                                       uint32_t total_chunks,
                                       kernels::JacobianPoint* partials)
{
    const uint32_t chunk = blockIdx.x * blockDim.x + threadIdx.x;
    if (chunk >= total_chunks) {
        return;
    }
    uint32_t lo = 0;
    uint32_t hi = num_heavy;
    while (hi - lo > 1) {
        const uint32_t mid = lo + (hi - lo) / 2;
        if (heavy_base[mid] <= chunk) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    const uint32_t key = heavy_key[lo];
    const uint32_t begin = range_start[key] + (chunk - heavy_base[lo]) * kHeavyChunk;
    const uint32_t end = min(range_end[key], begin + kHeavyChunk);
    partials[chunk] = fold_sorted_items<F>(work_points, sorted_items, begin, end);
}

// One thread per heavy slot: adds up that slot's partial sums into its bucket.
template <class F>
__global__ void msm_heavy_combine_kernel(const kernels::JacobianPoint* partials,
                                         const uint32_t* heavy_key,
                                         const uint32_t* heavy_base,
                                         uint32_t num_heavy,
                                         uint32_t total_chunks,
                                         kernels::JacobianPoint* buckets)
{
    const uint32_t h = blockIdx.x * blockDim.x + threadIdx.x;
    if (h >= num_heavy) {
        return;
    }
    const uint32_t end = (h + 1 < num_heavy) ? heavy_base[h + 1] : total_chunks;
    kernels::JacobianPoint acc = kernels::jac_identity<F>();
    for (uint32_t c = heavy_base[h]; c < end; c++) {
        acc = kernels::kernel_accumulate<F>(acc, partials[c]);
    }
    buckets[heavy_key[h]] = acc;
}

// One thread per (column, segment): grid x covers segments, grid y covers columns. Reduces one
// segment of that column's buckets for the current window with kernels::reduce_bucket_segment,
// writing its total and running sum to the (column, segment) slot. No two threads share a slot.
template <class F>
__global__ void msm_reduce_segments_kernel(const kernels::JacobianPoint* buckets,
                                           uint32_t num_buckets,
                                           uint32_t segment_log2,
                                           uint32_t num_segments,
                                           kernels::JacobianPoint* segment_totals,
                                           kernels::JacobianPoint* segment_runnings)
{
    const uint32_t segment = blockIdx.x * blockDim.x + threadIdx.x;
    if (segment >= num_segments) {
        return;
    }
    const uint64_t col = blockIdx.y;
    const uint64_t slot = col * num_segments + segment;
    segment_totals[slot] = kernels::reduce_bucket_segment<F>(
        &buckets[col * num_buckets], num_buckets, segment_log2, segment, &segment_runnings[slot]);
}

// One thread per virtual column (grid sized from num_columns * group): combines that virtual column's
// segment results into its window's contribution via kernels::combine_segment_reductions, writing it to
// the column's exclusive slot for window first_window + v / num_columns.
template <class F>
__global__ void msm_reduce_combine_kernel(const kernels::JacobianPoint* segment_totals,
                                          const kernels::JacobianPoint* segment_runnings,
                                          uint32_t num_columns,
                                          uint32_t group,
                                          uint32_t num_segments,
                                          uint32_t segment_log2,
                                          uint32_t first_window,
                                          uint32_t num_windows,
                                          kernels::JacobianPoint* contributions)
{
    const uint32_t v = blockIdx.x * blockDim.x + threadIdx.x;
    if (v >= num_columns * group) {
        return;
    }
    const uint32_t col = v % num_columns;
    const uint32_t window = first_window + v / num_columns;
    contributions[static_cast<uint64_t>(col) * num_windows + window] =
        kernels::combine_segment_reductions<F>(&segment_totals[static_cast<uint64_t>(v) * num_segments],
                                               &segment_runnings[static_cast<uint64_t>(v) * num_segments],
                                               num_segments,
                                               segment_log2);
}

// One thread per column: folds that column's per-window contributions into its final point with
// kernels::combine_window_contributions and converts it to affine with kernels::kernel_finalize.
template <class F>
__global__ void msm_finalize_kernel(const kernels::JacobianPoint* contributions,
                                    uint32_t num_columns,
                                    uint32_t num_windows,
                                    uint32_t window_bits,
                                    AffinePoint* results)
{
    const uint32_t col = blockIdx.x * blockDim.x + threadIdx.x;
    if (col >= num_columns) {
        return;
    }
    const kernels::JacobianPoint acc = kernels::combine_window_contributions<F>(
        &contributions[static_cast<uint64_t>(col) * num_windows], num_windows, window_bits);
    results[col] = kernels::kernel_finalize<F>(acc);
}

} // namespace

// Re-queries the runtime on every call -- no static, global or function-local-static variable
// anywhere in this file remembers a previous answer -- and reports unavailable both when the
// query itself fails and when it succeeds but reports zero devices.
bool cuda_available()
{
    int count = 0;
    const cudaError_t status = cudaGetDeviceCount(&count);
    if (status != kCudaOk) {
        return false;
    }
    return count > 0;
}

namespace {

// Repeated-scalar merge. The points of a run of identical scalars in one column are added once, up front,
// and the other items' scalars are zeroed, which every later stage treats as no contribution. Only
// scalars wider than one window are merged.

// A run must be at least this long for the merge to repay its field inversion (the merged point is
// converted back to affine) and its extra additions. Measured on recorded AVM columns: 2 to 4 perform the
// same, 8 is about 6% slower on the wire commitments.
constexpr uint32_t kMinDuplicateRun = 4;

__device__ inline uint64_t scalar_hash48(const U256& s)
{
    uint64_t h = 0x9E3779B97F4A7C15ULL;
    for (int i = 0; i < 4; i++) {
        h ^= s.limb[i];
        h *= 0xff51afd7ed558ccdULL;
        h ^= h >> 32;
    }
    return h & ((1ULL << 48) - 1);
}

// One thread per work item: flags scalars wider than one window and gives them the sort key
// column << 48 | hash of the scalar. Equal scalars of a column get equal keys; different scalars may too,
// which the later full comparison tolerates.
__global__ void msm_dup_key_kernel(const U256* work_scalars,
                                   const uint64_t* col_start,
                                   uint32_t num_columns,
                                   uint64_t work_items,
                                   uint32_t window_bits,
                                   uint64_t* keys,
                                   uint8_t* wide)
{
    const uint64_t i = static_cast<uint64_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (i >= work_items) {
        return;
    }
    const U256 s = work_scalars[i];
    const bool is_wide = kernels::highest_set_bit(s) >= static_cast<int>(window_bits);
    wide[i] = is_wide ? 1 : 0;
    keys[i] = is_wide ? ((static_cast<uint64_t>(column_of(col_start, num_columns, i)) << 48) | scalar_hash48(s)) : 0;
}

// One thread per sorted wide item: marks the first item of every maximal run of identical scalars of one
// column. Equal keys are necessary but not sufficient, so the scalars are compared in full.
__global__ void msm_dup_head_kernel(
    const uint64_t* sorted_keys, const uint32_t* sorted_items, const U256* work_scalars, uint64_t count, uint8_t* head)
{
    const uint64_t p = static_cast<uint64_t>(blockIdx.x) * blockDim.x + threadIdx.x;
    if (p >= count) {
        return;
    }
    bool is_head = true;
    if (p > 0 && sorted_keys[p] == sorted_keys[p - 1]) {
        is_head = !kernels::is_equal(work_scalars[sorted_items[p]], work_scalars[sorted_items[p - 1]]);
    }
    head[p] = is_head ? 1 : 0;
}

// One thread per run of at most kHeavyChunk items: folds the run's points and rewrites the first item.
template <class F>
__global__ void msm_dup_small_kernel(AffinePoint* work_points,
                                     U256* work_scalars,
                                     const uint32_t* sorted_items,
                                     const uint32_t* heads,
                                     uint32_t num_runs,
                                     uint64_t count)
{
    const uint32_t r = blockIdx.x * blockDim.x + threadIdx.x;
    if (r >= num_runs) {
        return;
    }
    const uint32_t begin = heads[r];
    const uint32_t end = (r + 1 < num_runs) ? heads[r + 1] : static_cast<uint32_t>(count);
    const uint32_t length = end - begin;
    if (length < kMinDuplicateRun || length > kHeavyChunk) {
        return;
    }
    const kernels::JacobianPoint acc = fold_sorted_items<F>(work_points, sorted_items, begin, end);
    work_points[sorted_items[begin]] = kernels::kernel_finalize<F>(acc);
    for (uint32_t q = begin + 1; q < end; q++) {
        work_scalars[sorted_items[q]] = U256{ { 0, 0, 0, 0 } };
    }
}

// One thread per run longer than kHeavyChunk: appends it to the long-run list. A single 64-bit atomic hands
// out the list position (high 32 bits) and the first chunk id (low 32 bits), as msm_heavy_list_kernel does.
__global__ void msm_dup_long_list_kernel(const uint32_t* heads,
                                         uint32_t num_runs,
                                         uint64_t count,
                                         unsigned long long* counter,
                                         uint32_t* long_begin,
                                         uint32_t* long_length,
                                         uint32_t* long_base)
{
    const uint32_t r = blockIdx.x * blockDim.x + threadIdx.x;
    if (r >= num_runs) {
        return;
    }
    const uint32_t begin = heads[r];
    const uint32_t end = (r + 1 < num_runs) ? heads[r + 1] : static_cast<uint32_t>(count);
    const uint32_t length = end - begin;
    if (length <= kHeavyChunk) {
        return;
    }
    const uint32_t chunks = (length + kHeavyChunk - 1) / kHeavyChunk;
    const unsigned long long old = atomicAdd(counter, (1ULL << 32) | chunks);
    const uint32_t position = static_cast<uint32_t>(old >> 32);
    long_begin[position] = begin;
    long_length[position] = length;
    long_base[position] = static_cast<uint32_t>(old & 0xffffffffULL);
}

// One thread per chunk of a long run: folds the chunk's points into partials[chunk] and zeroes the scalars
// of its items other than the run's first.
template <class F>
__global__ void msm_dup_long_chunk_kernel(const AffinePoint* work_points,
                                          U256* work_scalars,
                                          const uint32_t* sorted_items,
                                          const uint32_t* long_begin,
                                          const uint32_t* long_length,
                                          const uint32_t* long_base,
                                          uint32_t num_long,
                                          uint32_t total_chunks,
                                          kernels::JacobianPoint* partials)
{
    const uint32_t chunk = blockIdx.x * blockDim.x + threadIdx.x;
    if (chunk >= total_chunks) {
        return;
    }
    uint32_t lo = 0;
    uint32_t hi = num_long;
    while (hi - lo > 1) {
        const uint32_t mid = lo + (hi - lo) / 2;
        if (long_base[mid] <= chunk) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    const uint32_t run_begin = long_begin[lo];
    const uint32_t begin = run_begin + (chunk - long_base[lo]) * kHeavyChunk;
    const uint32_t end = min(run_begin + long_length[lo], begin + kHeavyChunk);
    partials[chunk] = fold_sorted_items<F>(work_points, sorted_items, begin, end);
    for (uint32_t q = max(begin, run_begin + 1); q < end; q++) {
        work_scalars[sorted_items[q]] = U256{ { 0, 0, 0, 0 } };
    }
}

// One thread per long run: adds up its chunk partials and rewrites the run's first item.
template <class F>
__global__ void msm_dup_long_combine_kernel(const kernels::JacobianPoint* partials,
                                            AffinePoint* work_points,
                                            const uint32_t* sorted_items,
                                            const uint32_t* long_begin,
                                            const uint32_t* long_length,
                                            const uint32_t* long_base,
                                            uint32_t num_long,
                                            uint32_t total_chunks)
{
    const uint32_t h = blockIdx.x * blockDim.x + threadIdx.x;
    if (h >= num_long) {
        return;
    }
    const uint32_t end = (h + 1 < num_long) ? long_base[h + 1] : total_chunks;
    kernels::JacobianPoint acc = kernels::jac_identity<F>();
    for (uint32_t c = long_base[h]; c < end; c++) {
        acc = kernels::kernel_accumulate<F>(acc, partials[c]);
    }
    work_points[sorted_items[long_begin[h]]] = kernels::kernel_finalize<F>(acc);
}

// Host driver of the merge. Every temporary buffer is allocated and freed here.
template <class F>
void dedup_repeated_scalars(DeviceAllocs& allocs,
                            AffinePoint* d_work_points,
                            U256* d_work_scalars,
                            const uint64_t* d_col_start,
                            uint32_t num_columns,
                            uint64_t work_items,
                            uint32_t window_bits)
{
    std::vector<void*> temporaries;
    const auto alloc = [&](size_t bytes, const char* what) {
        void* raw = nullptr;
        if (cudaMalloc(&raw, std::max<size_t>(bytes, 16)) != kCudaOk) {
            die(what, allocs);
        }
        allocs.add(raw);
        temporaries.push_back(raw);
        return raw;
    };
    const auto check = [&](cudaError_t status, const char* what) {
        if (status != kCudaOk) {
            die(what, allocs);
        }
    };
    const int n = static_cast<int>(work_items);
    const unsigned grid = static_cast<unsigned>((work_items + kThreadsPerBlock - 1) / kThreadsPerBlock);

    auto* d_keys = static_cast<uint64_t*>(alloc(work_items * sizeof(uint64_t), "cudaMalloc(dup keys)"));
    auto* d_wide = static_cast<uint8_t*>(alloc(work_items, "cudaMalloc(dup wide)"));
    auto* d_selected =
        static_cast<unsigned long long*>(alloc(2 * sizeof(unsigned long long), "cudaMalloc(dup counters)"));
    check(cudaMemset(d_selected, 0, 2 * sizeof(unsigned long long)), "cudaMemset(dup counters)");
    msm_dup_key_kernel<<<grid, kThreadsPerBlock>>>(
        d_work_scalars, d_col_start, num_columns, work_items, window_bits, d_keys, d_wide);

    auto* d_wide_idx = static_cast<uint32_t*>(alloc(work_items * sizeof(uint32_t), "cudaMalloc(dup wide idx)"));
    auto* d_wide_keys = static_cast<uint64_t*>(alloc(work_items * sizeof(uint64_t), "cudaMalloc(dup wide keys)"));
    auto* d_num = static_cast<int*>(alloc(2 * sizeof(int), "cudaMalloc(dup count)"));
    cub::CountingInputIterator<uint32_t> counting(0);
    size_t bytes_a = 0;
    size_t bytes_b = 0;
    check(cub::DeviceSelect::Flagged(nullptr, bytes_a, counting, d_wide, d_wide_idx, d_num, n), "cub select size");
    check(cub::DeviceSelect::Flagged(nullptr, bytes_b, d_keys, d_wide, d_wide_keys, d_num + 1, n), "cub select size");
    void* d_temp = alloc(std::max(bytes_a, bytes_b), "cudaMalloc(dup temp)");
    check(cub::DeviceSelect::Flagged(d_temp, bytes_a, counting, d_wide, d_wide_idx, d_num, n), "cub select (indices)");
    check(cub::DeviceSelect::Flagged(d_temp, bytes_b, d_keys, d_wide, d_wide_keys, d_num + 1, n), "cub select (keys)");
    int wide_count = 0;
    check(cudaMemcpy(&wide_count, d_num, sizeof(int), cudaMemcpyDeviceToHost), "cudaMemcpy(dup wide count)");

    if (wide_count >= static_cast<int>(kMinDuplicateRun)) {
        const uint64_t count = static_cast<uint64_t>(wide_count);
        const unsigned wide_grid = static_cast<unsigned>((count + kThreadsPerBlock - 1) / kThreadsPerBlock);
        auto* d_sorted_keys = static_cast<uint64_t*>(alloc(count * sizeof(uint64_t), "cudaMalloc(dup sorted keys)"));
        auto* d_sorted_idx = static_cast<uint32_t*>(alloc(count * sizeof(uint32_t), "cudaMalloc(dup sorted idx)"));
        int end_bit = 49;
        while (end_bit < 64 && (1ULL << (end_bit - 48)) < num_columns) {
            end_bit++;
        }
        size_t sort_bytes = 0;
        check(cub::DeviceRadixSort::SortPairs(
                  nullptr, sort_bytes, d_wide_keys, d_sorted_keys, d_wide_idx, d_sorted_idx, wide_count, 0, end_bit),
              "cub sort size");
        void* d_sort_temp = alloc(sort_bytes, "cudaMalloc(dup sort temp)");
        check(
            cub::DeviceRadixSort::SortPairs(
                d_sort_temp, sort_bytes, d_wide_keys, d_sorted_keys, d_wide_idx, d_sorted_idx, wide_count, 0, end_bit),
            "cub sort");

        auto* d_head = static_cast<uint8_t*>(alloc(count, "cudaMalloc(dup head)"));
        auto* d_heads = static_cast<uint32_t*>(alloc(count * sizeof(uint32_t), "cudaMalloc(dup heads)"));
        msm_dup_head_kernel<<<wide_grid, kThreadsPerBlock>>>(
            d_sorted_keys, d_sorted_idx, d_work_scalars, count, d_head);
        cub::CountingInputIterator<uint32_t> positions(0);
        size_t heads_bytes = 0;
        check(cub::DeviceSelect::Flagged(nullptr, heads_bytes, positions, d_head, d_heads, d_num + 1, wide_count),
              "cub heads size");
        void* d_heads_temp = alloc(heads_bytes, "cudaMalloc(dup heads temp)");
        check(cub::DeviceSelect::Flagged(d_heads_temp, heads_bytes, positions, d_head, d_heads, d_num + 1, wide_count),
              "cub heads");
        int num_runs = 0;
        check(cudaMemcpy(&num_runs, d_num + 1, sizeof(int), cudaMemcpyDeviceToHost), "cudaMemcpy(dup run count)");

        const unsigned run_grid =
            static_cast<unsigned>((static_cast<uint64_t>(num_runs) + kThreadsPerBlock - 1) / kThreadsPerBlock);
        const uint64_t long_cap = count / kHeavyChunk + 1;
        const uint64_t chunk_cap = 2 * count / kHeavyChunk + 2;
        auto* d_long_begin = static_cast<uint32_t*>(alloc(long_cap * sizeof(uint32_t), "cudaMalloc(dup long begin)"));
        auto* d_long_length = static_cast<uint32_t*>(alloc(long_cap * sizeof(uint32_t), "cudaMalloc(dup long length)"));
        auto* d_long_base = static_cast<uint32_t*>(alloc(long_cap * sizeof(uint32_t), "cudaMalloc(dup long base)"));
        auto* d_partials = static_cast<kernels::JacobianPoint*>(
            alloc(chunk_cap * sizeof(kernels::JacobianPoint), "cudaMalloc(dup partials)"));
        unsigned long long* d_long_counter = d_selected + 1;

        msm_dup_small_kernel<F><<<run_grid, kThreadsPerBlock>>>(
            d_work_points, d_work_scalars, d_sorted_idx, d_heads, static_cast<uint32_t>(num_runs), count);
        msm_dup_long_list_kernel<<<run_grid, kThreadsPerBlock>>>(
            d_heads, static_cast<uint32_t>(num_runs), count, d_long_counter, d_long_begin, d_long_length, d_long_base);
        check(cudaDeviceSynchronize(), "cudaDeviceSynchronize(dup small/list)");
        unsigned long long long_counter = 0;
        check(cudaMemcpy(&long_counter, d_long_counter, sizeof(long_counter), cudaMemcpyDeviceToHost),
              "cudaMemcpy(dup long counter)");
        const uint32_t num_long = static_cast<uint32_t>(long_counter >> 32);
        const uint32_t total_chunks = static_cast<uint32_t>(long_counter & 0xffffffffULL);
        if (num_long > 0) {
            msm_dup_long_chunk_kernel<F>
                <<<(total_chunks + kThreadsPerBlock - 1) / kThreadsPerBlock, kThreadsPerBlock>>>(d_work_points,
                                                                                                 d_work_scalars,
                                                                                                 d_sorted_idx,
                                                                                                 d_long_begin,
                                                                                                 d_long_length,
                                                                                                 d_long_base,
                                                                                                 num_long,
                                                                                                 total_chunks,
                                                                                                 d_partials);
            msm_dup_long_combine_kernel<F>
                <<<(num_long + kThreadsPerBlock - 1) / kThreadsPerBlock, kThreadsPerBlock>>>(d_partials,
                                                                                             d_work_points,
                                                                                             d_sorted_idx,
                                                                                             d_long_begin,
                                                                                             d_long_length,
                                                                                             d_long_base,
                                                                                             num_long,
                                                                                             total_chunks);
        }
        check(cudaDeviceSynchronize(), "cudaDeviceSynchronize(dup merge)");
        check(cudaGetLastError(), "cudaGetLastError(dup merge)");
    }

    check(cudaDeviceSynchronize(), "cudaDeviceSynchronize(dedup)");
    for (void* pointer : temporaries) {
        const cudaError_t freed = cudaFree(pointer);
        allocs.release(pointer);
        check(freed, "cudaFree(dedup)");
    }
}

// The CPU-side half of a batch: the non-zero (point, scalar) pairs of a run of columns, flattened in column
// order, and the per-column layout the device stage needs. Building it touches no device state.
struct HostBatch {
    size_t num_columns = 0;
    std::vector<uint64_t> col_start;
    std::vector<uint64_t> col_size;
    int max_bit = -1;
    uint64_t total_nonzero = 0;
    std::unique_ptr<AffinePoint[]> work_points;
    std::unique_ptr<U256[]> work_scalars;
};

HostBatch prepare_host_batch(std::span<const AffinePoint> points, std::span<const Column> columns)
{
    const size_t num_columns = columns.size();
    // Zero scalars contribute nothing, so they are dropped here: each column is split into fixed-size
    // chunks, a parallel pass counts the non-zero scalars (and the highest set bit) per chunk, and a
    // second parallel pass writes only the non-zero (point, scalar) pairs at the chunk's prefix-summed
    // offset. Column and chunk order is preserved, so the compacted layout is deterministic.
    struct Chunk {
        size_t column;
        uint64_t lo;
        uint64_t hi;
        uint64_t nonzero;
        uint64_t offset;
        int max_bit;
    };
    constexpr uint64_t kChunkItems = 1ULL << 16;
    std::vector<Chunk> chunks;
    for (size_t i = 0; i < num_columns; i++) {
        for (uint64_t lo = 0; lo < columns[i].size; lo += kChunkItems) {
            chunks.push_back(Chunk{ i, lo, std::min<uint64_t>(columns[i].size, lo + kChunkItems), 0, 0, -1 });
        }
    }
    const size_t num_threads =
        std::max<size_t>(1, std::min<size_t>(chunks.size(), std::thread::hardware_concurrency()));
    const auto run_chunks = [&](auto&& fn) {
        std::atomic<size_t> next{ 0 };
        std::vector<std::thread> pool;
        for (size_t t = 0; t < num_threads; t++) {
            pool.emplace_back([&] {
                for (size_t c = next.fetch_add(1); c < chunks.size(); c = next.fetch_add(1)) {
                    fn(chunks[c]);
                }
            });
        }
        for (auto& th : pool) {
            th.join();
        }
    };
    run_chunks([&](Chunk& ch) {
        const U256* scalars = columns[ch.column].scalars;
        for (uint64_t j = ch.lo; j < ch.hi; j++) {
            if (kernels::is_zero(scalars[j])) {
                continue;
            }
            ch.nonzero++;
            ch.max_bit = std::max(ch.max_bit, kernels::highest_set_bit(scalars[j]));
        }
    });

    std::vector<uint64_t> col_start(num_columns, 0);
    std::vector<uint64_t> col_size(num_columns, 0);
    int max_bit = -1;
    uint64_t total_nonzero = 0;
    for (Chunk& ch : chunks) {
        ch.offset = total_nonzero;
        col_size[ch.column] += ch.nonzero;
        total_nonzero += ch.nonzero;
        max_bit = std::max(max_bit, ch.max_bit);
    }
    // Every column gets a start, including empty ones, so the starts stay non-decreasing.
    uint64_t running_start = 0;
    for (size_t i = 0; i < num_columns; i++) {
        col_start[i] = running_start;
        running_start += col_size[i];
    }
    const uint64_t work_items = total_nonzero;
    // Uninitialised on purpose: the fill pass below writes every slot, and zero-filling these multi-GB
    // buffers on one thread costs more than the parallel fill itself. The per-chunk check makes a gap
    // or overrun (the scalars changing between the two passes) abort instead of feeding stale memory
    // to the device.
    std::unique_ptr<AffinePoint[]> work_points(new AffinePoint[work_items]);
    std::unique_ptr<U256[]> work_scalars(new U256[work_items]);
    run_chunks([&](Chunk& ch) {
        const Column& column = columns[ch.column];
        uint64_t out = ch.offset;
        for (uint64_t j = ch.lo; j < ch.hi; j++) {
            if (kernels::is_zero(column.scalars[j])) {
                continue;
            }
            if (out == ch.offset + ch.nonzero) {
                break;
            }
            work_points[out] = points[column.start + j];
            work_scalars[out] = column.scalars[j];
            out++;
        }
        if (out != ch.offset + ch.nonzero) {
            std::fprintf(stderr, "msm_batch_cuda: scalars changed between the count and fill passes\n");
            std::fflush(stderr);
            std::abort();
        }
    });

    HostBatch batch;
    batch.num_columns = num_columns;
    batch.col_start = std::move(col_start);
    batch.col_size = std::move(col_size);
    batch.max_bit = max_bit;
    batch.total_nonzero = total_nonzero;
    batch.work_points = std::move(work_points);
    batch.work_scalars = std::move(work_scalars);
    return batch;
}

template <class F> std::vector<AffinePoint> msm_run_device(const HostBatch& batch, const CoreConfig& config)
{
    DeviceAllocs allocs;

    // The runtime must report a usable device before any allocation or launch is attempted.
    {
        int device_count = 0;
        const cudaError_t count_status = cudaGetDeviceCount(&device_count);
        if (count_status != kCudaOk) {
            die("cudaGetDeviceCount", allocs);
        }
        if (device_count <= 0) {
            die("cudaGetDeviceCount reported no device", allocs);
        }
    }

    const size_t num_columns = batch.num_columns;
    const std::vector<uint64_t>& col_start = batch.col_start;
    const std::vector<uint64_t>& col_size = batch.col_size;
    const int max_bit = batch.max_bit;
    const uint64_t total_nonzero = batch.total_nonzero;
    const uint64_t work_items = total_nonzero;
    const std::unique_ptr<AffinePoint[]>& work_points = batch.work_points;
    const std::unique_ptr<U256[]>& work_scalars = batch.work_scalars;
    std::vector<AffinePoint> results(num_columns);
    if (work_items == 0) {
        for (size_t i = 0; i < num_columns; i++) {
            results[i] = kernels::kernel_finalize<F>(kernels::jac_identity<F>());
        }
        return results;
    }

    const uint32_t window_bits =
        resolve_window_bits(config.window_bits, total_nonzero, static_cast<uint64_t>(num_columns));
    // Signed digits need a top window of at most window_bits - 2 bits so that nothing carries out of it.
    const uint32_t num_windows =
        (max_bit < 0)
            ? 0
            : static_cast<uint32_t>((max_bit + 1 + static_cast<int>(window_bits) + 1) / static_cast<int>(window_bits));
    const uint32_t num_buckets = (1u << (window_bits - 1)) + 1;

    if (num_windows == 0) {
        for (size_t i = 0; i < num_columns; i++) {
            results[i] = kernels::kernel_finalize<F>(kernels::jac_identity<F>());
        }
        return results;
    }

    AffinePoint* d_work_points = nullptr;
    U256* d_work_scalars = nullptr;
    uint64_t* d_col_start = nullptr;
    uint64_t* d_col_size = nullptr;
    uint32_t* d_keys_in = nullptr;
    uint32_t* d_keys_out = nullptr;
    uint32_t* d_items_in = nullptr;
    uint32_t* d_items_out = nullptr;
    uint32_t* d_range_start = nullptr;
    uint32_t* d_range_end = nullptr;
    void* d_sort_temp = nullptr;
    unsigned long long* d_heavy_counter = nullptr;
    uint32_t* d_heavy_key = nullptr;
    uint32_t* d_heavy_base = nullptr;
    kernels::JacobianPoint* d_partials = nullptr;
    size_t sort_temp_bytes = 0;
    kernels::JacobianPoint* d_buckets = nullptr;
    kernels::JacobianPoint* d_contributions = nullptr;
    kernels::JacobianPoint* d_segment_totals = nullptr;
    kernels::JacobianPoint* d_segment_runnings = nullptr;
    AffinePoint* d_results = nullptr;
    const uint64_t num_slots = static_cast<uint64_t>(num_columns) * num_buckets;
    if (num_slots > UINT32_MAX || work_items > static_cast<uint64_t>(INT_MAX)) {
        std::fprintf(stderr,
                     "msm_batch_cuda: batch too large (%llu slots, %llu items)\n",
                     static_cast<unsigned long long>(num_slots),
                     static_cast<unsigned long long>(work_items));
        std::abort();
    }
    const uint64_t heavy_cap = work_items / kHeavyChunk + 1;
    const uint64_t chunk_cap = 2 * work_items / kHeavyChunk + 2;
    const uint32_t segment_log2 = kernels::reduce_segment_log2(window_bits - 1);
    const uint32_t num_segments = kernels::reduce_segment_count(num_buckets, segment_log2);

    // Windows do not depend on each other, so `group` consecutive windows run together, each (window,
    // column) pair acting as its own virtual column. A group is bounded by the 32-bit sort keys, the int
    // item count of the sort, the 65535 limit on grid y, and (when not forced) the memory budget.
    const uint64_t bytes_per_window =
        work_items * 4 * sizeof(uint32_t) + num_slots * (2 * sizeof(uint32_t) + sizeof(kernels::JacobianPoint)) +
        heavy_cap * 2 * sizeof(uint32_t) + chunk_cap * sizeof(kernels::JacobianPoint) +
        2 * static_cast<uint64_t>(num_columns) * num_segments * sizeof(kernels::JacobianPoint);
    const uint64_t group_limit = std::max<uint64_t>(1,
                                                    std::min({ static_cast<uint64_t>(UINT32_MAX) / num_slots,
                                                               static_cast<uint64_t>(INT_MAX) / work_items,
                                                               static_cast<uint64_t>(65535) / num_columns }));
    uint64_t group_size = 0;
    if (config.window_group != 0) {
        group_size = std::min<uint64_t>(config.window_group, num_windows);
        if (group_size > group_limit) {
            std::fprintf(stderr,
                         "msm_batch_cuda: window_group=%u exceeds the %llu windows one group can hold for this batch\n",
                         config.window_group,
                         static_cast<unsigned long long>(group_limit));
            std::fflush(stderr);
            std::abort();
        }
    } else {
        group_size = std::min<uint64_t>({ static_cast<uint64_t>(num_windows),
                                          group_limit,
                                          std::max<uint64_t>(1, config.window_memory_bytes / bytes_per_window) });
    }
    const uint32_t group = static_cast<uint32_t>(group_size);
    int sort_end_bit = 1;
    while ((1ULL << sort_end_bit) < num_slots * group) {
        sort_end_bit++;
    }

    {
        void* raw = nullptr;
        cudaError_t status;

        status = cudaMalloc(&raw, work_items * sizeof(AffinePoint));
        if (status != kCudaOk) {
            die("cudaMalloc(d_work_points)", allocs);
        }
        d_work_points = static_cast<AffinePoint*>(raw);
        allocs.add(raw);

        status = cudaMalloc(&raw, work_items * sizeof(U256));
        if (status != kCudaOk) {
            die("cudaMalloc(d_work_scalars)", allocs);
        }
        d_work_scalars = static_cast<U256*>(raw);
        allocs.add(raw);

        status = cudaMalloc(&raw, num_columns * sizeof(uint64_t));
        if (status != kCudaOk) {
            die("cudaMalloc(d_col_start)", allocs);
        }
        d_col_start = static_cast<uint64_t*>(raw);
        allocs.add(raw);

        status = cudaMalloc(&raw, num_columns * sizeof(uint64_t));
        if (status != kCudaOk) {
            die("cudaMalloc(d_col_size)", allocs);
        }
        d_col_size = static_cast<uint64_t*>(raw);
        allocs.add(raw);

        const auto alloc_u32 = [&](uint32_t*& out, size_t count, const char* what) {
            void* buffer = nullptr;
            if (cudaMalloc(&buffer, count * sizeof(uint32_t)) != kCudaOk) {
                die(what, allocs);
            }
            out = static_cast<uint32_t*>(buffer);
            allocs.add(buffer);
        };
        alloc_u32(d_keys_in, work_items * group, "cudaMalloc(d_keys_in)");
        alloc_u32(d_keys_out, work_items * group, "cudaMalloc(d_keys_out)");
        alloc_u32(d_items_in, work_items * group, "cudaMalloc(d_items_in)");
        alloc_u32(d_items_out, work_items * group, "cudaMalloc(d_items_out)");
        alloc_u32(d_range_start, num_slots * group, "cudaMalloc(d_range_start)");
        alloc_u32(d_range_end, num_slots * group, "cudaMalloc(d_range_end)");
        alloc_u32(d_heavy_key, heavy_cap * group, "cudaMalloc(d_heavy_key)");
        alloc_u32(d_heavy_base, heavy_cap * group, "cudaMalloc(d_heavy_base)");
        if (cudaMalloc(&raw, sizeof(unsigned long long)) != kCudaOk) {
            die("cudaMalloc(d_heavy_counter)", allocs);
        }
        d_heavy_counter = static_cast<unsigned long long*>(raw);
        allocs.add(raw);
        if (cudaMalloc(&raw, chunk_cap * group * sizeof(kernels::JacobianPoint)) != kCudaOk) {
            die("cudaMalloc(d_partials)", allocs);
        }
        d_partials = static_cast<kernels::JacobianPoint*>(raw);
        allocs.add(raw);
        if (cub::DeviceRadixSort::SortPairs(nullptr,
                                            sort_temp_bytes,
                                            d_keys_in,
                                            d_keys_out,
                                            d_items_in,
                                            d_items_out,
                                            static_cast<int>(work_items * group),
                                            0,
                                            sort_end_bit) != kCudaOk) {
            die("cub::DeviceRadixSort::SortPairs(size query)", allocs);
        }
        if (cudaMalloc(&raw, sort_temp_bytes) != kCudaOk) {
            die("cudaMalloc(d_sort_temp)", allocs);
        }
        d_sort_temp = raw;
        allocs.add(raw);

        status =
            cudaMalloc(&raw, static_cast<size_t>(num_columns) * num_buckets * group * sizeof(kernels::JacobianPoint));
        if (status != kCudaOk) {
            die("cudaMalloc(d_buckets)", allocs);
        }
        d_buckets = static_cast<kernels::JacobianPoint*>(raw);
        allocs.add(raw);

        status = cudaMalloc(&raw, static_cast<size_t>(num_columns) * num_windows * sizeof(kernels::JacobianPoint));
        if (status != kCudaOk) {
            die("cudaMalloc(d_contributions)", allocs);
        }
        d_contributions = static_cast<kernels::JacobianPoint*>(raw);
        allocs.add(raw);

        status =
            cudaMalloc(&raw, static_cast<size_t>(num_columns) * num_segments * group * sizeof(kernels::JacobianPoint));
        if (status != kCudaOk) {
            die("cudaMalloc(d_segment_totals)", allocs);
        }
        d_segment_totals = static_cast<kernels::JacobianPoint*>(raw);
        allocs.add(raw);

        status =
            cudaMalloc(&raw, static_cast<size_t>(num_columns) * num_segments * group * sizeof(kernels::JacobianPoint));
        if (status != kCudaOk) {
            die("cudaMalloc(d_segment_runnings)", allocs);
        }
        d_segment_runnings = static_cast<kernels::JacobianPoint*>(raw);
        allocs.add(raw);

        status = cudaMalloc(&raw, static_cast<size_t>(num_columns) * sizeof(AffinePoint));
        if (status != kCudaOk) {
            die("cudaMalloc(d_results)", allocs);
        }
        d_results = static_cast<AffinePoint*>(raw);
        allocs.add(raw);
    }

    {
        cudaError_t status;
        status = cudaMemcpy(d_work_points, work_points.get(), work_items * sizeof(AffinePoint), cudaMemcpyHostToDevice);
        if (status != kCudaOk) {
            die("cudaMemcpy(d_work_points)", allocs);
        }
        status = cudaMemcpy(d_work_scalars, work_scalars.get(), work_items * sizeof(U256), cudaMemcpyHostToDevice);
        if (status != kCudaOk) {
            die("cudaMemcpy(d_work_scalars)", allocs);
        }
        status = cudaMemcpy(d_col_start, col_start.data(), num_columns * sizeof(uint64_t), cudaMemcpyHostToDevice);
        if (status != kCudaOk) {
            die("cudaMemcpy(d_col_start)", allocs);
        }
        status = cudaMemcpy(d_col_size, col_size.data(), num_columns * sizeof(uint64_t), cudaMemcpyHostToDevice);
        if (status != kCudaOk) {
            die("cudaMemcpy(d_col_size)", allocs);
        }
    }

    if (config.dedup_scalars) {
        dedup_repeated_scalars<F>(allocs,
                                  d_work_points,
                                  d_work_scalars,
                                  d_col_start,
                                  static_cast<uint32_t>(num_columns),
                                  work_items,
                                  window_bits);
    }

    const unsigned bucket_grid_x = static_cast<unsigned>((num_buckets + kThreadsPerBlock - 1) / kThreadsPerBlock);
    const unsigned segment_grid_x = (num_segments + kThreadsPerBlock - 1) / kThreadsPerBlock;

    for (uint32_t first_window = 0; first_window < num_windows; first_window += group) {
        cudaError_t status;
        const uint32_t windows_in_group = std::min(group, num_windows - first_window);
        const uint64_t group_items = work_items * windows_in_group;
        const uint64_t group_slots = num_slots * windows_in_group;
        const uint32_t virtual_columns = static_cast<uint32_t>(num_columns) * windows_in_group;
        const unsigned digit_grid = static_cast<unsigned>((group_items + kThreadsPerBlock - 1) / kThreadsPerBlock);
        const unsigned reduce_grid = (virtual_columns + kThreadsPerBlock - 1) / kThreadsPerBlock;
        const dim3 bucket_grid(bucket_grid_x, virtual_columns, 1);
        const dim3 segment_grid(segment_grid_x, virtual_columns, 1);

        msm_bucket_key_kernel<<<digit_grid, kThreadsPerBlock>>>(d_work_scalars,
                                                                d_col_start,
                                                                static_cast<uint32_t>(num_columns),
                                                                work_items,
                                                                windows_in_group,
                                                                first_window,
                                                                window_bits,
                                                                num_buckets,
                                                                d_keys_in,
                                                                d_items_in);
        if (cudaMemset(d_range_start, 0, group_slots * sizeof(uint32_t)) != kCudaOk ||
            cudaMemset(d_range_end, 0, group_slots * sizeof(uint32_t)) != kCudaOk ||
            cudaMemset(d_heavy_counter, 0, sizeof(unsigned long long)) != kCudaOk) {
            die("cudaMemset(bucket ranges)", allocs);
        }
        if (cub::DeviceRadixSort::SortPairs(d_sort_temp,
                                            sort_temp_bytes,
                                            d_keys_in,
                                            d_keys_out,
                                            d_items_in,
                                            d_items_out,
                                            static_cast<int>(group_items),
                                            0,
                                            sort_end_bit) != kCudaOk) {
            die("cub::DeviceRadixSort::SortPairs", allocs);
        }
        msm_bucket_ranges_kernel<<<digit_grid, kThreadsPerBlock>>>(d_keys_out, group_items, d_range_start, d_range_end);
        msm_heavy_list_kernel<<<digit_grid, kThreadsPerBlock>>>(
            d_keys_out, group_items, num_buckets, d_range_start, d_heavy_counter, d_heavy_key, d_heavy_base);
        status = cudaDeviceSynchronize();
        if (status != kCudaOk) {
            die("cudaDeviceSynchronize(key/sort kernels)", allocs);
        }
        status = cudaGetLastError();
        if (status != kCudaOk) {
            die("cudaGetLastError(key/sort kernels)", allocs);
        }
        unsigned long long heavy_counter = 0;
        if (cudaMemcpy(&heavy_counter, d_heavy_counter, sizeof(heavy_counter), cudaMemcpyDeviceToHost) != kCudaOk) {
            die("cudaMemcpy(heavy counter)", allocs);
        }
        const uint32_t num_heavy = static_cast<uint32_t>(heavy_counter >> 32);
        const uint32_t total_chunks = static_cast<uint32_t>(heavy_counter & 0xffffffffULL);

        msm_bucket_accumulate_kernel<F><<<bucket_grid, kThreadsPerBlock>>>(
            d_work_points, d_items_out, d_range_start, d_range_end, virtual_columns, num_buckets, d_buckets);
        if (num_heavy > 0) {
            msm_heavy_chunk_kernel<F>
                <<<(total_chunks + kThreadsPerBlock - 1) / kThreadsPerBlock, kThreadsPerBlock>>>(d_work_points,
                                                                                                 d_items_out,
                                                                                                 d_range_start,
                                                                                                 d_range_end,
                                                                                                 d_heavy_key,
                                                                                                 d_heavy_base,
                                                                                                 num_heavy,
                                                                                                 total_chunks,
                                                                                                 d_partials);
            msm_heavy_combine_kernel<F><<<(num_heavy + kThreadsPerBlock - 1) / kThreadsPerBlock, kThreadsPerBlock>>>(
                d_partials, d_heavy_key, d_heavy_base, num_heavy, total_chunks, d_buckets);
        }
        status = cudaDeviceSynchronize();
        if (status != kCudaOk) {
            die("cudaDeviceSynchronize(bucket kernel)", allocs);
        }
        status = cudaGetLastError();
        if (status != kCudaOk) {
            die("cudaGetLastError(bucket kernel)", allocs);
        }

        msm_reduce_segments_kernel<F><<<segment_grid, kThreadsPerBlock>>>(
            d_buckets, num_buckets, segment_log2, num_segments, d_segment_totals, d_segment_runnings);
        status = cudaDeviceSynchronize();
        if (status != kCudaOk) {
            die("cudaDeviceSynchronize(segment reduce kernel)", allocs);
        }
        status = cudaGetLastError();
        if (status != kCudaOk) {
            die("cudaGetLastError(segment reduce kernel)", allocs);
        }

        msm_reduce_combine_kernel<F><<<reduce_grid, kThreadsPerBlock>>>(d_segment_totals,
                                                                        d_segment_runnings,
                                                                        static_cast<uint32_t>(num_columns),
                                                                        windows_in_group,
                                                                        num_segments,
                                                                        segment_log2,
                                                                        first_window,
                                                                        num_windows,
                                                                        d_contributions);
        status = cudaDeviceSynchronize();
        if (status != kCudaOk) {
            die("cudaDeviceSynchronize(combine kernel)", allocs);
        }
        status = cudaGetLastError();
        if (status != kCudaOk) {
            die("cudaGetLastError(combine kernel)", allocs);
        }
    }

    {
        cudaError_t status;
        const unsigned finalize_grid = static_cast<unsigned>((num_columns + kThreadsPerBlock - 1) / kThreadsPerBlock);
        msm_finalize_kernel<F><<<finalize_grid, kThreadsPerBlock>>>(
            d_contributions, static_cast<uint32_t>(num_columns), num_windows, window_bits, d_results);
        status = cudaDeviceSynchronize();
        if (status != kCudaOk) {
            die("cudaDeviceSynchronize(finalize kernel)", allocs);
        }
        status = cudaGetLastError();
        if (status != kCudaOk) {
            die("cudaGetLastError(finalize kernel)", allocs);
        }
        status = cudaMemcpy(results.data(), d_results, results.size() * sizeof(AffinePoint), cudaMemcpyDeviceToHost);
        if (status != kCudaOk) {
            die("cudaMemcpy(results)", allocs);
        }
    }

    {
        const cudaError_t f0 = cudaFree(d_work_points);
        const cudaError_t f1 = cudaFree(d_work_scalars);
        const cudaError_t f2 = cudaFree(d_col_start);
        const cudaError_t f3 = cudaFree(d_col_size);
        const cudaError_t f4 = cudaFree(d_keys_in);
        const cudaError_t f10 = cudaFree(d_keys_out);
        const cudaError_t f11 = cudaFree(d_items_in);
        const cudaError_t f12 = cudaFree(d_items_out);
        const cudaError_t f13 = cudaFree(d_range_start);
        const cudaError_t f14 = cudaFree(d_range_end);
        const cudaError_t f15 = cudaFree(d_sort_temp);
        const cudaError_t f16 = cudaFree(d_heavy_counter);
        const cudaError_t f17 = cudaFree(d_heavy_key);
        const cudaError_t f18 = cudaFree(d_heavy_base);
        const cudaError_t f19 = cudaFree(d_partials);
        const cudaError_t f5 = cudaFree(d_buckets);
        const cudaError_t f6 = cudaFree(d_contributions);
        const cudaError_t f7 = cudaFree(d_segment_totals);
        const cudaError_t f8 = cudaFree(d_segment_runnings);
        const cudaError_t f9 = cudaFree(d_results);
        if (f0 != kCudaOk || f1 != kCudaOk || f2 != kCudaOk || f3 != kCudaOk || f4 != kCudaOk || f5 != kCudaOk ||
            f6 != kCudaOk || f7 != kCudaOk || f8 != kCudaOk || f9 != kCudaOk || f10 != kCudaOk || f11 != kCudaOk ||
            f12 != kCudaOk || f13 != kCudaOk || f14 != kCudaOk || f15 != kCudaOk || f16 != kCudaOk || f17 != kCudaOk ||
            f18 != kCudaOk || f19 != kCudaOk) {
            std::fprintf(stderr, "msm_batch_cuda: cudaFree failed during cleanup\n");
            std::fflush(stderr);
            std::abort();
        }
    }

    return results;
}

// A batch is split into one column group per this many scalars (up to kMaxPipelineGroups), so that the host
// preparation of one group overlaps the device work of the previous one. Each extra group costs about 20 ms
// of allocation and launch overhead, which is only repaid on batches with hundreds of milliseconds of host work.
constexpr uint64_t kPipelineGroupScalars = 12ULL << 20;
constexpr uint32_t kMaxPipelineGroups = 8;

template <class F>
std::vector<AffinePoint> msm_batch_cuda_impl(std::span<const AffinePoint> points,
                                             std::span<const Column> columns,
                                             const CoreConfig& config)
{
    // window_bits is validated, by name, before any device interaction at all.
    if (config.window_bits != 0 && (config.window_bits < kMinWindowBits || config.window_bits > kMaxWindowBits)) {
        fail_window_bits(config.window_bits);
    }
    const size_t num_columns = columns.size();
    if (num_columns == 0) {
        return {};
    }
    uint64_t total_scalars = 0;
    for (const Column& column : columns) {
        total_scalars += column.size;
    }
    uint64_t groups = config.host_pipeline != 0
                          ? config.host_pipeline
                          : std::clamp<uint64_t>(total_scalars / kPipelineGroupScalars, 1, kMaxPipelineGroups);
    groups = std::min<uint64_t>(groups, num_columns);
    if (groups <= 1) {
        const HostBatch batch = prepare_host_batch(points, columns);
        return msm_run_device<F>(batch, config);
    }

    // Contiguous column ranges of roughly equal scalar count.
    std::vector<size_t> bounds{ 0 };
    uint64_t seen = 0;
    for (size_t i = 0; i < num_columns && bounds.size() < groups; i++) {
        seen += columns[i].size;
        if (seen * groups >= total_scalars * bounds.size() && i + 1 < num_columns) {
            bounds.push_back(i + 1);
        }
    }
    bounds.push_back(num_columns);

    const auto prepare = [&](size_t g) {
        return std::async(std::launch::async, [&, g] {
            return prepare_host_batch(points, columns.subspan(bounds[g], bounds[g + 1] - bounds[g]));
        });
    };
    std::vector<AffinePoint> results;
    results.reserve(num_columns);
    auto next = prepare(0);
    for (size_t g = 0; g + 1 < bounds.size(); g++) {
        const HostBatch batch = next.get();
        if (g + 2 < bounds.size()) {
            next = prepare(g + 1);
        }
        const std::vector<AffinePoint> part = msm_run_device<F>(batch, config);
        results.insert(results.end(), part.begin(), part.end());
    }
    return results;
}

} // namespace

std::vector<AffinePoint> msm_batch_cuda(std::span<const AffinePoint> points,
                                        std::span<const Column> columns,
                                        const CoreConfig& config)
{
    switch (config.curve) {
    case Curve::Bn254:
        return msm_batch_cuda_impl<kernels::Bn254BaseField>(points, columns, config);
    case Curve::Grumpkin:
        return msm_batch_cuda_impl<kernels::GrumpkinBaseField>(points, columns, config);
    }
    std::fprintf(stderr, "msm_batch_cuda: unknown curve %u\n", static_cast<unsigned>(config.curve));
    std::fflush(stderr);
    std::abort();
}

} // namespace bb::gpu_msm
