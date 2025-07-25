#pragma once
// Meant to be the main header included by *.cpp files* that use msgpack.
// Note: heavy header due to serialization logic, don't include if msgpack.hpp will do
// CBinding helpers that take a function or a lambda and
// - bind the input as a coded msgpack array of all the arguments (using template metamagic)
// - bind the return value to an out buffer, where the caller must free the memory

#define MSGPACK_NO_BOOST
#include "barretenberg/common/try_catch_shim.hpp"
#include "msgpack_impl/check_memory_span.hpp"
#include "msgpack_impl/concepts.hpp"
#include "msgpack_impl/func_traits.hpp"
#include "msgpack_impl/msgpack_impl.hpp"
#include "msgpack_impl/name_value_pair_macro.hpp"
#include "msgpack_impl/schema_impl.hpp"
#include "msgpack_impl/schema_name.hpp"
#include "msgpack_impl/struct_map_impl.hpp"

#include <cstring>
#include <type_traits>

/**
 * Represents this as a bbmalloc'ed object, fit for sending to e.g. TypeScript.
 * @param obj The object.
 * @return The buffer pointer/size pair.
 */
inline std::pair<uint8_t*, size_t> msgpack_encode_buffer(auto&& obj)
{
    // Create a buffer to store the encoded data
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, obj);

    uint8_t* output = static_cast<uint8_t*>(aligned_alloc(64, buffer.size()));
    memcpy(output, buffer.data(), buffer.size());
    // Convert the buffer data to a string and return it
    return { output, buffer.size() };
}

// This function is intended to bind a function to a MessagePack-formatted input data,
// perform the function with the unpacked data, then pack the result back into MessagePack format.
inline void msgpack_cbind_impl(const auto& func,        // The function to be applied
                               const uint8_t* input_in, // The input data in MessagePack format
                               size_t input_len_in,     // The length of the input data
                               uint8_t** output_out,    // The output data in MessagePack format
                               size_t* output_len_out)  // The length of the output data
{
    using FuncTraits = decltype(get_func_traits<decltype(func)>());
    // Args: the parameter types of the function as a tuple.
    typename FuncTraits::Args params;

    // Unpack the input data into the parameter tuple.
    msgpack::unpack(reinterpret_cast<const char*>(input_in), input_len_in).get().convert(params);

    // Apply the function to the parameters, then encode the result into a MessagePack buffer.
    auto [output, output_len] = msgpack_encode_buffer(FuncTraits::apply(func, params));

    // Assign the output data and its length to the given output parameters.
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
