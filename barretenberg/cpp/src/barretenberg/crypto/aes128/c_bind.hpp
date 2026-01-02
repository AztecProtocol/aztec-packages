// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include <barretenberg/common/serialize.hpp>
#include <barretenberg/common/wasm_export.hpp>
#include <cstddef>
#include <cstdint>

WASM_EXPORT void aes_encrypt_buffer_cbc(
    uint8_t const* input, uint8_t const* iv, uint8_t const* key, uint32_t const* length, uint8_t** r);

WASM_EXPORT void aes_decrypt_buffer_cbc(
    uint8_t const* input, uint8_t const* iv, uint8_t const* key, uint32_t const* length, uint8_t** r);
