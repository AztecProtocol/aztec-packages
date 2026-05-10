/**
 * Pool exhaustion test for the Emscripten-backed wasm runtime.
 *
 * Spawns `PTHREAD_POOL_SIZE + 4` threads of real work and waits for all of
 * them to complete. The previous wasm runtime silently deadlocked when more
 * pthreads were spawned than the static pool could hold.
 *
 * The toolchain ships with `PTHREAD_POOL_SIZE_STRICT=1`, which warns and
 * elastically grows the pool when the pre-spawned pool is exhausted. This
 * test exercises that elastic-growth path by spawning more std::threads
 * than the link-time pool size and asserting every one of them completes.
 *
 * The CMake-side `PTHREAD_POOL_SIZE` is 16 (see wasm-emscripten.cmake), so
 * we spawn 20 threads.
 */

#include "barretenberg/common/log.hpp"
#include "barretenberg/common/throw_or_abort.hpp"

#include <atomic>
#include <chrono>
#include <cstdint>
#include <gtest/gtest.h>
#include <thread>
#include <vector>

namespace {

// Mirrors the link-time PTHREAD_POOL_SIZE. We spawn +4 threads to step over
// the pool bound. If the build flags ever drift, update this constant in
// lockstep with the toolchain.
constexpr size_t kEmscriptenPthreadPoolSize = 16;
constexpr size_t kThreadsToSpawn = kEmscriptenPthreadPoolSize + 4;

// Real work: a simple FNV-1a hash over a fixed buffer. This is deliberately
// CPU-bound so the runtime cannot finish all threads on a single worker
// before the join hits.
uint64_t do_work(uint64_t seed)
{
    uint64_t h = 0xcbf29ce484222325ULL ^ seed;
    for (uint64_t i = 0; i < (1ULL << 16); ++i) {
        h ^= (i + seed);
        h *= 0x100000001b3ULL;
    }
    return h;
}

} // namespace

TEST(WasmThreadsPoolExhaustion, AllSpawnedThreadsComplete)
{
    std::atomic<size_t> completed{ 0 };
    std::vector<std::thread> threads;
    threads.reserve(kThreadsToSpawn);
    std::vector<uint64_t> results(kThreadsToSpawn, 0);

    auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(60);

    for (size_t i = 0; i < kThreadsToSpawn; ++i) {
        threads.emplace_back([i, &completed, &results]() {
            results[i] = do_work(static_cast<uint64_t>(i + 1));
            completed.fetch_add(1, std::memory_order_relaxed);
        });
    }

    for (auto& t : threads) {
        if (std::chrono::steady_clock::now() > deadline) {
            // If we ever overshoot 60s here, the pool is wedged. Abort with
            // a clear message rather than letting gtest's per-test timeout
            // chew through CI.
            throw_or_abort("pool exhaustion test exceeded 60s deadline; pthread pool likely deadlocked");
        }
        t.join();
    }

    EXPECT_EQ(completed.load(), kThreadsToSpawn);

    // Defensive: every thread should have produced a non-zero hash.
    for (size_t i = 0; i < kThreadsToSpawn; ++i) {
        EXPECT_NE(results[i], 0ULL) << "thread " << i << " produced zero hash";
    }
}
