#pragma once
#include "barretenberg/common/wasm_export.hpp"
#include <cstdint>

#ifdef __wasm__
WASM_IMPORT("env_hardware_concurrency") uint32_t env_hardware_concurrency();
#else
#include <thread>
inline uint32_t env_hardware_concurrency()
{
    return static_cast<uint32_t>(std::thread::hardware_concurrency());
}
#endif