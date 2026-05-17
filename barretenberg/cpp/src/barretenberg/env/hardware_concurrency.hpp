#pragma once
#include <cstdint>

#ifdef __wasm__
#include "barretenberg/common/wasm_export.hpp"
WASM_IMPORT("env_hardware_concurrency") uint32_t env_hardware_concurrency();
#else
extern "C" uint32_t env_hardware_concurrency();
#endif
