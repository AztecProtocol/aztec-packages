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
    static const char* val = std::getenv("HARDWARE_CONCURRENCY");
    static uint32_t cores =
        val != nullptr ? static_cast<uint32_t>(std::stoul(val)) : std::thread::hardware_concurrency();
    return cores;
}

namespace bb {
// only for testing purposes currently
void set_hardware_concurrency(size_t num_cores)
{
    _get_num_cores() = static_cast<uint32_t>(num_cores);
}
} // namespace bb

extern "C" {

#ifdef NO_MULTITHREADING
uint32_t env_hardware_concurrency()
{
    return 1;
}
#else
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
#endif
}
