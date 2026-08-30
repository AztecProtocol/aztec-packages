#pragma once
#include "barretenberg/common/wasm_export.hpp"
#include <cstddef>
#include <cstdint>

/**
 * @brief In-process FFI/wasm entrypoint (the ipc-codegen FFI backend symbol).
 *
 * Same msgpack command/response payload as every transport, without the
 * transport-level length/id envelope. Output is aligned_alloc'd; the caller
 * frees it with free().
 */
WASM_EXPORT void ipc_ffi_entry(const uint8_t* input, size_t input_len, uint8_t** output, size_t* output_len);
