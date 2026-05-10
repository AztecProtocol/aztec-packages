/**
 * Memory-growth-under-threads test.
 *
 * Triggers a `memory.grow` mid-execution by allocating buffers from multiple
 * threads totalling more than the link-time INITIAL_MEMORY=512MB. Each
 * thread writes a known pattern into its slice BEFORE the cross-thread grow
 * may happen, then re-reads the same slice AFTER the grow and asserts the
 * data survived intact. We additionally compare `__builtin_wasm_memory_size`
 * before and after to fail loudly if a future flag bump suppresses the
 * grow (which would silently neuter the test).
 *
 * The historical bug class this exercises: under the previous wasm runtime,
 * `memory.grow` could detach a thread's TypedArray view of the heap without
 * the thread noticing, causing later memcmp operations to silently read
 * stale memory. Emscripten + wasm threads remap the shared buffer atomically
 * (SHARED_MEMORY=1), so a properly wired build should pass cleanly.
 */

#include "barretenberg/common/log.hpp"
#include "barretenberg/common/throw_or_abort.hpp"

#include <atomic>
#include <barrier>
#include <cstdint>
#include <cstring>
#include <gtest/gtest.h>
#include <memory>
#include <thread>
#include <vector>

namespace {

// Sized to comfortably exceed the link-time INITIAL_MEMORY=512MB. With
// kThreads * kPerThreadGrowBytes + kPreGrowBytes ~= 772 MiB, the wasm
// linear memory MUST grow at least once mid-execution. If a future
// toolchain bump moves INITIAL_MEMORY higher than that we will need to
// scale this test up in lockstep, and the post-test
// __builtin_wasm_memory_size assertion below will fail loudly so the
// drift is caught immediately.
constexpr size_t kPreGrowBytes = 4 * 1024 * 1024;        // 4 MiB seed buffer
constexpr size_t kPerThreadGrowBytes = 96 * 1024 * 1024; // 96 MiB per worker
constexpr size_t kThreads = 8;
constexpr size_t kWasmPageBytes = 65536;

void fill_pattern(uint8_t* buf, size_t len, uint8_t seed)
{
    for (size_t i = 0; i < len; ++i) {
        buf[i] = static_cast<uint8_t>((i * 1103515245u + seed) & 0xFFu);
    }
}

bool check_pattern(const uint8_t* buf, size_t len, uint8_t seed)
{
    for (size_t i = 0; i < len; ++i) {
        if (buf[i] != static_cast<uint8_t>((i * 1103515245u + seed) & 0xFFu)) {
            return false;
        }
    }
    return true;
}

} // namespace

TEST(WasmThreadsMemoryGrowth, PreGrowDataSurvivesGrow)
{
    // Allocate the pre-grow buffer once; every worker reads + checks it.
    auto seed_buf = std::make_unique<uint8_t[]>(kPreGrowBytes);
    fill_pattern(seed_buf.get(), kPreGrowBytes, /*seed=*/0xAB);

    // Each worker owns a slice of `per_thread_buffers` that it writes a
    // known pattern into BEFORE the cross-thread allocations that force
    // `memory.grow`. After the grow each worker re-reads its slice and
    // asserts the pattern is intact. This is the property a faulty
    // memory.grow under threads would break.
    std::vector<std::unique_ptr<uint8_t[]>> per_thread_buffers(kThreads);

#if defined(__wasm__)
    const size_t pages_before = __builtin_wasm_memory_size(0);
#else
    const size_t pages_before = 0;
#endif

    std::atomic<size_t> completed{ 0 };
    std::atomic<size_t> mismatches{ 0 };

    // Phase barrier: every worker must finish its pre-grow write before any
    // worker allocates a fresh grow buffer. Otherwise a fast worker could
    // allocate-and-grow while a slow worker is still mid-write, masking the
    // bug class we are trying to catch.
    std::barrier sync_point(static_cast<std::ptrdiff_t>(kThreads));

    std::vector<std::thread> workers;
    workers.reserve(kThreads);

    for (size_t t = 0; t < kThreads; ++t) {
        workers.emplace_back([&, t]() {
            // Pre-grow phase: allocate a per-thread buffer and write a
            // known pattern. We do this BEFORE any thread triggers the
            // grow so we can prove the pattern survives the grow.
            per_thread_buffers[t] = std::make_unique<uint8_t[]>(kPerThreadGrowBytes);
            fill_pattern(per_thread_buffers[t].get(), kPerThreadGrowBytes, static_cast<uint8_t>(t));

            // Capture a snapshot of the shared seed buffer too.
            std::vector<uint8_t> snapshot(kPreGrowBytes);
            std::memcpy(snapshot.data(), seed_buf.get(), kPreGrowBytes);

            // Wait until every thread has written its pre-grow slice.
            sync_point.arrive_and_wait();

            // Grow-triggering allocation. The total across all threads
            // (kThreads * kPerThreadGrowBytes + kPreGrowBytes) is sized
            // to exceed the link-time INITIAL_MEMORY=512MB; at least
            // one of these allocations MUST cause memory.grow to fire.
            auto grow_buf = std::make_unique<uint8_t[]>(kPerThreadGrowBytes);
            fill_pattern(grow_buf.get(), kPerThreadGrowBytes, static_cast<uint8_t>(0xC0u + t));

            // Post-grow validation: the pre-grow pattern must still be
            // readable in every thread's owned slice, and the shared seed
            // buffer must match the pre-grow snapshot byte-for-byte. The
            // previous wasm runtime exhibited stale TypedArray views here.
            if (!check_pattern(per_thread_buffers[t].get(), kPerThreadGrowBytes, static_cast<uint8_t>(t))) {
                mismatches.fetch_add(1, std::memory_order_relaxed);
            }
            if (!check_pattern(seed_buf.get(), kPreGrowBytes, /*seed=*/0xAB)) {
                mismatches.fetch_add(1, std::memory_order_relaxed);
            }
            if (std::memcmp(snapshot.data(), seed_buf.get(), kPreGrowBytes) != 0) {
                mismatches.fetch_add(1, std::memory_order_relaxed);
            }
            // Confirm the freshly allocated post-grow buffer holds the
            // pattern we just wrote into it.
            if (!check_pattern(grow_buf.get(), kPerThreadGrowBytes, static_cast<uint8_t>(0xC0u + t))) {
                mismatches.fetch_add(1, std::memory_order_relaxed);
            }

            completed.fetch_add(1, std::memory_order_relaxed);
        });
    }

    for (auto& w : workers) {
        w.join();
    }

    EXPECT_EQ(completed.load(), kThreads);
    EXPECT_EQ(mismatches.load(), 0u) << "pre-grow data corruption detected after memory.grow under threads";

#if defined(__wasm__)
    const size_t pages_after = __builtin_wasm_memory_size(0);
    // Linear memory MUST have grown at least once. If a future toolchain
    // bump pushes INITIAL_MEMORY above the test's allocation total, this
    // assertion fires and the test scaling needs to be revisited in
    // lockstep. Without it, a flag drift would silently neuter the test.
    EXPECT_GT(pages_after * kWasmPageBytes, pages_before * kWasmPageBytes)
        << "memory.grow never fired: linear memory was already large enough to absorb "
        << (kThreads * kPerThreadGrowBytes + kPreGrowBytes) << " bytes without growth. "
        << "Either INITIAL_MEMORY shrank (good) or this test's allocation total is too small (bad).";
#endif
}
