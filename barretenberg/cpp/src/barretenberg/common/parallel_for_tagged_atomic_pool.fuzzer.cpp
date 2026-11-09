#include "barretenberg/common/parallel_for_tagged_atomic_pool.hpp"
#include "barretenberg/common/assert.hpp"

#ifndef NO_MULTITHREADING
#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <thread>
#include <vector>

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    if (size == 0) {
        return 0;
    }
    bb::detail::TaggedAtomicThreadPool pool(data[0] % 4);
    const size_t jobs = std::min<size_t>(size, 33);
    for (size_t job = 1; job < jobs; ++job) {
        const size_t n = data[job];
        std::vector<std::atomic<size_t>> counts(n);
        std::vector<size_t> results(n, 0);
        if (data[job] % 31 == 0) {
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
        }
        pool.run(n, [&](size_t i) {
            BB_ASSERT_LT(i, n);
            counts[i].fetch_add(1, std::memory_order_relaxed);
            if (i % 7 == 0) {
                std::this_thread::yield();
            }
            results[i] = (job + 1) * (i + 1);
        });
        for (size_t i = 0; i < n; ++i) {
            BB_ASSERT_EQ(counts[i].load(), 1U);
            BB_ASSERT_EQ(results[i], (job + 1) * (i + 1));
        }
    }
    return 0;
}
#else
#include <cstddef>
#include <cstdint>
extern "C" int LLVMFuzzerTestOneInput(const uint8_t*, size_t)
{
    return 0;
}
#endif
