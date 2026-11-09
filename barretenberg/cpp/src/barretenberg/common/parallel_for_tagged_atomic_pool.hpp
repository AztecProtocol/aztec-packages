#pragma once

#ifndef NO_MULTITHREADING
#include <cstddef>
#include <functional>
#include <memory>

namespace bb::detail {

/** @brief Experimental generation-tagged pool with atomic claims and bounded spinning before sleep. */
class TaggedAtomicThreadPool {
  public:
    /** @brief Creates persistent workers; the caller also participates in each job. */
    explicit TaggedAtomicThreadPool(size_t num_workers);
    ~TaggedAtomicThreadPool();
    TaggedAtomicThreadPool(const TaggedAtomicThreadPool&) = delete;
    TaggedAtomicThreadPool& operator=(const TaggedAtomicThreadPool&) = delete;

    /** @brief Runs a job synchronously. Calls must be serialized and callbacks must not throw or reenter this pool. */
    void run(size_t num_iterations, const std::function<void(size_t)>& func);

  private:
    class Impl;
    std::unique_ptr<Impl> impl;
};

} // namespace bb::detail

namespace bb {
/** @brief Runs iterations in an experimental pool owned by the caller thread, with a serial reentrant fallback. */
void parallel_for_tagged_atomic_pool(size_t num_iterations, const std::function<void(size_t)>& func);
} // namespace bb
#endif
