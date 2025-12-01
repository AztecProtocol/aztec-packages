#pragma once
// Meant to be the main header included by *.cpp files* that use msgpack.
// Note: heavy header due to serialization logic, don't include if msgpack.hpp will do
// CBinding helpers that take a function or a lambda and
// - bind the input as a coded msgpack array of all the arguments (using template metamagic)
// - bind the return value to an out buffer, where the caller must free the memory

#include <cstring>
#include <type_traits>

#include "barretenberg/common/try_catch_shim.hpp"
#include "msgpack_impl/check_memory_span.hpp"
#include "msgpack_impl/concepts.hpp"
#include "msgpack_impl/func_traits.hpp"
#include "msgpack_impl/msgpack_impl.hpp"
#include "msgpack_impl/name_value_pair_macro.hpp"
#include "msgpack_impl/schema_impl.hpp"
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

// This function is intended to bind a function to a MessagePack-formatted input data,
// perform the function with the unpacked data, then pack the result back into MessagePack format.
// Note: output_out and output_len_out are IN-OUT parameters:
//   IN:  Caller provides scratch buffer pointer and size
//   OUT: Returns actual result buffer (may be scratch or newly allocated) and size
inline void msgpack_cbind_impl(const auto& func,        // The function to be applied
                               const uint8_t* input_in, // The input data in MessagePack format
                               size_t input_len_in,     // The length of the input data
                               uint8_t** output_out,    // IN-OUT: scratch buffer ptr / result buffer ptr
                               size_t* output_len_out)  // IN-OUT: scratch buffer size / result size
{
    using FuncTraits = decltype(get_func_traits<decltype(func)>());
    // Args: the parameter types of the function as a tuple.
    typename FuncTraits::Args params;

    // Unpack the input data into the parameter tuple.
    msgpack::unpack(reinterpret_cast<const char*>(input_in), input_len_in).get().convert(params);

    // Read IN values: caller-provided scratch buffer
    uint8_t* scratch_buf = *output_out;
    size_t scratch_size = *output_len_out;

    // Apply the function to the parameters, then encode the result into a MessagePack buffer.
    // Try to use scratch buffer; allocate if result doesn't fit.
    auto [output, output_len] = msgpack_encode_buffer(FuncTraits::apply(func, params), scratch_buf, scratch_size);

    // Write OUT values: actual result buffer and size
    // If result fit in scratch, output == scratch_buf (pointer unchanged)
    // If result didn't fit, output is newly allocated buffer (pointer changed)
    *output_out = output;
    *output_len_out = output_len;
}

// returns a C-style string json of the schema
inline void msgpack_cbind_schema_impl(auto func, uint8_t** output_out, size_t* output_len_out)
{
    (void)func; // unused except for type
    // Object representation of the cbind
    auto cbind_obj = get_func_traits<decltype(func)>();
    std::string schema = msgpack_schema_to_string(cbind_obj);
    *output_out = static_cast<uint8_t*>(aligned_alloc(64, schema.size() + 1));
    memcpy(*output_out, schema.c_str(), schema.size() + 1);
    *output_len_out = schema.size();
}

// The CBIND_NOSCHEMA macro generates a function named 'cname' that decodes the input arguments from msgpack format,
// calls the target function, and then encodes the return value back into msgpack format. It should be used over CBIND
// in cases where we do not want schema generation, such as meta-functions that themselves give information to control
// how the schema is interpreted.
#define CBIND_NOSCHEMA(cname, func)                                                                                    \
    WASM_EXPORT void cname(const uint8_t* input_in, size_t input_len_in, uint8_t** output_out, size_t* output_len_out) \
    {                                                                                                                  \
        msgpack_cbind_impl(func, input_in, input_len_in, output_out, output_len_out);                                  \
    }

// The CBIND macro is a convenient utility that abstracts away several steps in binding C functions with msgpack
// serialization. It creates two separate functions:
// 1. cname function: This decodes the input arguments from msgpack format, calls the target function,
// and then encodes the return value back into msgpack format.
// 2. cname##__schema function: This creates a JSON schema of the function's input arguments and return type.
#define CBIND(cname, func)                                                                                             \
    CBIND_NOSCHEMA(cname, func)                                                                                        \
    WASM_EXPORT void cname##__schema(uint8_t** output_out, size_t* output_len_out)                                     \
    {                                                                                                                  \
        msgpack_cbind_schema_impl(func, output_out, output_len_out);                                                   \
    }
