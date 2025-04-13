#ifndef NO_MULTITHREADING
#ifdef OMP_MULTITHREADING
#include <cstddef>
#include <cstdlib>
#include <functional>
#include <omp.h>

namespace {
struct OpenMPInitializer {
    OpenMPInitializer()
    {
        const char* env = std::getenv("HARDWARE_CONCURRENCY");
        if (env != nullptr) {
            int threads = std::atoi(env);
            if (threads > 0) {
                omp_set_num_threads(threads);
            }
        }
    }
};

const OpenMPInitializer ompInitializer;
} // namespace

namespace bb {
void parallel_for_omp(size_t num_iterations, const std::function<void(size_t)>& func)
{
#pragma omp parallel for
    for (size_t i = 0; i < num_iterations; ++i) {
        func(i);
    }
}
} // namespace bb
#endif
#endif
