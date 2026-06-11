#pragma once
// Meant to be the main header included by *.cpp files* that use msgpack.
// Note: heavy header due to serialization logic, don't include if msgpack.hpp will do

#include <cstring>

#include "barretenberg/common/mem.hpp"

#include "barretenberg/common/try_catch_shim.hpp"
#include "msgpack_impl/check_memory_span.hpp"
#include "msgpack_impl/concepts.hpp"
#include "msgpack_impl/msgpack_impl.hpp"
#include "msgpack_impl/name_value_pair_macro.hpp"
#include "msgpack_impl/schema_name.hpp"
#include "msgpack_impl/struct_map_impl.hpp"

/**
 * Represents this as a bbmalloc'ed object, fit for sending to e.g. TypeScript.
 * @param obj The object.
 * @param scratch_buf Optional pre-allocated scratch buffer to use if result fits.
 * @param scratch_size Size of the scratch buffer.
 * @return The buffer pointer/size pair. Returns scratch_buf if result fits, otherwise allocates new buffer.
 */
inline std::pair<uint8_t*, size_t> msgpack_encode_buffer(auto&& obj,
                                                         uint8_t* scratch_buf = nullptr,
                                                         size_t scratch_size = 0)
{
    // Create a buffer to store the encoded data
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, obj);

    // If scratch buffer provided and result fits, use it
    if (scratch_buf != nullptr && buffer.size() <= scratch_size) {
        memcpy(scratch_buf, buffer.data(), buffer.size());
        return { scratch_buf, buffer.size() };
    }

    // Otherwise allocate new buffer
    uint8_t* output = static_cast<uint8_t*>(aligned_alloc(64, buffer.size()));
    memcpy(output, buffer.data(), buffer.size());
    return { output, buffer.size() };
}
