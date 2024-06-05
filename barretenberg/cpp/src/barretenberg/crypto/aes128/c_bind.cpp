#include "c_bind.hpp"

#include <arpa/inet.h>
#include <vector>

#include "aes128.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/wasm_export.hpp"

WASM_EXPORT void aes_encrypt_buffer_cbc(
    uint8_t const* in, uint8_t const* iv, uint8_t const* key, uint32_t const* length, uint8_t** r)
{
    auto len = ntohl(*length);
    bb::crypto::aes128_encrypt_buffer_cbc((uint8_t*)in, (uint8_t*)iv, key, len);
    std::vector<uint8_t> result(in, in + len);
    *r = to_heap_buffer(result);
}

WASM_EXPORT void aes_decrypt_buffer_cbc(
    uint8_t const* in, uint8_t const* iv, uint8_t const* key, uint32_t const* length, uint8_t** r)
{
    auto len = ntohl(*length);
    bb::crypto::aes128_decrypt_buffer_cbc((uint8_t*)in, (uint8_t*)iv, key, len);
    std::vector<uint8_t> result(in, in + len);
    *r = to_heap_buffer(result);
}
