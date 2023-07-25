#pragma once
#include <string>
#include <utility>
// CBIND forward declarations for msgback default bind format (encode as tuple of args and return value as msgpack
// string)
#define WASM_EXPORT extern "C" __attribute__((visibility("default")))

#define CBIND_DECL(cname)                                                                                              \
    WASM_EXPORT void cname(                                                                                            \
        const uint8_t* input_in, size_t input_len_in, uint8_t** output_out, size_t* output_len_out);                   \
    WASM_EXPORT void cname##__schema(uint8_t** output_out, size_t* output_len_out);
