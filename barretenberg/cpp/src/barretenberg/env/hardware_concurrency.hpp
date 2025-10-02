#pragma once
#include "barretenberg/common/wasm_export.hpp"
#include <cstdint>

#ifdef __wasm__
WASM_IMPORT("env_hardware_concurrency") uint32_t env_hardware_concurrency();
#else
#ifndef NO_MULTITHREADING
#include <thread>
#endif
inline uint32_t env_hardware_concurrency()
{
#ifdef NO_MULTITHREADING
    return 1;
#else
    return static_cast<uint32_t>(std::thread::hardware_concurrency());
#endif
}
#endif