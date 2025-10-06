#include "hardware_concurrency.hpp"
#include <barretenberg/common/throw_or_abort.hpp>
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
    static const char* val = std::getenv("HARDWARE_CONCURRENCY");
    static uint32_t cores =
        val != nullptr ? static_cast<uint32_t>(std::stoul(val)) : std::thread::hardware_concurrency();
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

extern "C" {

uint32_t env_hardware_concurrency()
{
#ifndef __wasm__
    try {
#endif
        return _get_num_cores();
#ifndef __wasm__
    } catch (std::exception const&) {
        throw std::runtime_error("HARDWARE_CONCURRENCY invalid.");
    }
#endif
}
}
