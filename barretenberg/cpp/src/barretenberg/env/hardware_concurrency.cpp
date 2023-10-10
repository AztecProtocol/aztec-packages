#include "hardware_concurrency.hpp"
#include <barretenberg/common/throw_or_abort.hpp>
#include <cstdlib>
#include <stdexcept>
#include <string>
#include <thread>

extern "C" {

uint32_t env_hardware_concurrency()
{
    try {
        static auto val = std::getenv("HARDWARE_CONCURRENCY");
        static const uint32_t cores = val ? (uint32_t)std::stoul(val) : std::thread::hardware_concurrency();
        return cores;
    } catch (std::exception const&) {
        throw_or_abort("HARDWARE_CONCURRENCY invalid.");
    }
}
}