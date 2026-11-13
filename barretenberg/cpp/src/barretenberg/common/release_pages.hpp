#pragma once

#include <algorithm>
#include <cstddef>
#include <cstdint>
#if !defined(__wasm__) && !defined(_WIN32) && !defined(NO_MULTITHREADING)
#include <array>
#include <pthread.h>
#include <sys/mman.h>
#include <unistd.h>
#endif

namespace bb {

/**
 * @brief Before a large block is freed, hand its pages back to the OS from several threads at once.
 *
 * @details Freeing a multi-megabyte block unmaps it on the calling thread, and the kernel then frees its pages one at a
 * time (on the order of 0.1 ms per MiB), so gigabytes of polynomials take a noticeable serial pause to tear down.
 * madvise(MADV_DONTNEED) on disjoint ranges runs concurrently, after which the free only unmaps an empty range. Only
 * whole pages strictly inside [ptr, ptr + bytes) are released, so allocator metadata next to the block is never
 * touched. The block's contents are lost: call this only immediately before freeing it. Blocks under
 * MIN_PARALLEL_RELEASE_BYTES are left to the allocator. Uses short-lived threads rather than the parallel_for pool, so
 * it is safe from destructors running on any thread, including inside a parallel_for.
 */
inline void release_pages_in_parallel([[maybe_unused]] void* ptr, [[maybe_unused]] size_t bytes)
{
#if !defined(__wasm__) && !defined(_WIN32) && !defined(NO_MULTITHREADING) && defined(MADV_DONTNEED)
    constexpr size_t MIN_PARALLEL_RELEASE_BYTES = size_t{ 64 } << 20;
    constexpr size_t BYTES_PER_THREAD = size_t{ 16 } << 20;
    constexpr size_t MAX_THREADS = 16;
    if (ptr == nullptr || bytes < MIN_PARALLEL_RELEASE_BYTES) {
        return;
    }
    const auto page = static_cast<uintptr_t>(sysconf(_SC_PAGESIZE));
    const auto begin = (reinterpret_cast<uintptr_t>(ptr) + page - 1) & ~(page - 1);
    const auto end = (reinterpret_cast<uintptr_t>(ptr) + bytes) & ~(page - 1);
    if (end <= begin) {
        return;
    }
    const size_t num_pages = (end - begin) / page;
    const size_t num_threads = std::clamp<size_t>((end - begin) / BYTES_PER_THREAD, 1, MAX_THREADS);
    struct Slice {
        uintptr_t lo;
        uintptr_t hi;
    };
    std::array<Slice, MAX_THREADS> slices{};
    for (size_t t = 0; t < num_threads; ++t) {
        slices[t] = { begin + (((num_pages * t) / num_threads) * page),
                      begin + (((num_pages * (t + 1)) / num_threads) * page) };
    }
    auto release_slice = [](void* arg) -> void* {
        const auto* slice = static_cast<const Slice*>(arg);
        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-reinterpret-cast,performance-no-int-to-ptr)
        static_cast<void>(madvise(reinterpret_cast<void*>(slice->lo), slice->hi - slice->lo, MADV_DONTNEED));
        return nullptr;
    };
    // pthread_create reports failure by its return value and the handles live in a fixed array, so nothing here can
    // throw, including a failed allocation: this runs inside deleters and noexcept releases.
    std::array<pthread_t, MAX_THREADS> threads{};
    size_t spawned = 1;
    while (spawned < num_threads && pthread_create(&threads[spawned], nullptr, release_slice, &slices[spawned]) == 0) {
        ++spawned;
    }
    // Out of threads: this thread releases the slices nobody took.
    for (size_t t = spawned; t < num_threads; ++t) {
        release_slice(&slices[t]);
    }
    release_slice(slices.data());
    for (size_t t = 1; t < spawned; ++t) {
        pthread_join(threads[t], nullptr);
    }
#endif
}

} // namespace bb
