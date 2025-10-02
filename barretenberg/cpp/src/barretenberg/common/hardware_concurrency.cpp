#include <barretenberg/common/throw_or_abort.hpp>
#include <barretenberg/env/hardware_concurrency.hpp>
#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <string>

#ifndef NO_MULTITHREADING
#include <thread>
#endif

static uint32_t& _get_num_cores()
{
#ifdef NO_MULTITHREADING
    static uint32_t cores = 1;
#else
    static thread_local const char* val = std::getenv("HARDWARE_CONCURRENCY");
    static thread_local uint32_t cores =
<<<<<<< HEAD:barretenberg/cpp/src/barretenberg/common/hardware_concurrency.cpp
        val != nullptr ? static_cast<uint32_t>(std::stoul(val)) : env_hardware_concurrency();
=======
        val != nullptr ? static_cast<uint32_t>(std::stoul(val)) : std::thread::hardware_concurrency();
>>>>>>> 157d3036bd (Add nested parallel_for support and tests):barretenberg/cpp/src/barretenberg/env/hardware_concurrency.cpp
#endif
    return cores;
}

namespace bb {
// only for testing purposes currently
void set_hardware_concurrency([[maybe_unused]] size_t num_cores)
{
#ifdef NO_MULTITHREADING
    throw_or_abort("Cannot set hardware concurrency when multithreading is disabled.");
#else
    _get_num_cores() = static_cast<uint32_t>(num_cores);
#endif
}
} // namespace bb
