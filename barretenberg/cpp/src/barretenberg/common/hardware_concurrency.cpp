#include <barretenberg/common/throw_or_abort.hpp>
#include <barretenberg/env/hardware_concurrency.hpp>
#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <string>

#ifndef NO_MULTITHREADING
#include <thread>

static uint32_t& _get_num_cores()
{
    static thread_local const char* val = std::getenv("HARDWARE_CONCURRENCY");
    static thread_local uint32_t cores =
        val != nullptr ? static_cast<uint32_t>(std::stoul(val)) : env_hardware_concurrency();
    return cores;
}
#endif

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
