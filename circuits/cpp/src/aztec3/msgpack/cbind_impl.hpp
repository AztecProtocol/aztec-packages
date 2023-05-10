#pragma once
// Note: heavy header due to serialization logic, don't include if msgpack.hpp will do
// CBinding helpers that take a function or a lambda and
// - bind the input as a coded msgpack array of all the arguments (using template metamagic)
// - bind the return value to an out buffer, where the caller must free the memory
#include <aztec3/msgpack/schema_impl.hpp>

#include <barretenberg/common/msgpack_impl.hpp>

#include <cstring>
#include <type_traits>

namespace msgpack {
inline std::pair<uint8_t*, size_t> encode_buffer(auto&& obj)
{
    // Create a buffer to store the encoded data
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, obj);

    uint8_t* output = (uint8_t*)aligned_alloc(64, buffer.size());
    memcpy(output, buffer.data(), buffer.size());
    // Convert the buffer data to a string and return it
    return { output, buffer.size() };
}

template <typename T> inline void decode(T* value, const uint8_t* encoded_data, size_t encoded_data_size)
{
    // Create a MsgPack unpacker
    msgpack::unpack((const char*)encoded_data, encoded_data_size).get().convert(*value);
}

std::string string_encode(const auto& obj)
{
    std::stringstream output;
    msgpack::pack(output, obj);
    std::string output_str = output.str();
    msgpack::object_handle oh = msgpack::unpack(output_str.data(), output_str.size());
    std::stringstream pretty_output;
    pretty_output << oh.get() << std::endl;
    return pretty_output.str();
}
void print(const auto& obj)
{
    std::stringstream output;
    msgpack::pack(output, obj);
    std::string output_str = output.str();
    msgpack::object_handle oh = msgpack::unpack(output_str.data(), output_str.size());
    std::stringstream pretty_output;
    pretty_output << oh.get() << std::endl;
    logstr(pretty_output.str().c_str());
}

template <typename Func> struct func_traits;

template <typename R, typename... Vs> struct func_traits<R (*)(Vs...)> {
    typedef std::tuple<Vs...> Args;
    Args args;
    R ret;
    MSGPACK(args, ret);
};
template <typename R, typename... Vs> struct func_traits<R (&)(Vs...)> {
    typedef std::tuple<Vs...> Args;
    Args args;
    R ret;
    MSGPACK(args, ret);
};

template <typename R, typename T, typename... Vs> struct func_traits<R (T::*)(Vs...) const> {
    typedef std::tuple<Vs...> Args;
    Args args;
    R ret;
    MSGPACK(args, ret);
};

// Template metamagic for figuring out the parameters and return type of a function
template <typename T>
concept Callable =
    requires() { typename std::enable_if_t<std::is_member_function_pointer_v<decltype(&T::operator())>, void>; };

template <Callable T> constexpr auto get_func_traits()
{
    return func_traits<decltype(&T::operator())>();
}

template <typename T> constexpr auto get_func_traits()
{
    return func_traits<T>();
}

template <typename T> constexpr auto param_tuple()
{
    return typename decltype(get_func_traits<T>())::Args{};
}

inline void cbind_impl(
    auto func, const uint8_t* input_in, size_t input_len_in, uint8_t** output_out, size_t* output_len_out)
{
    auto params = param_tuple<decltype(func)>();
    msgpack::decode(&params, input_in, input_len_in);
    auto [output, output_len] = msgpack::encode_buffer(std::apply(func, params));
    *output_out = output;
    *output_len_out = output_len;
}

// returns a C-style string json of the schema
inline void cbind_schema_impl(auto func, uint8_t** output_out, size_t* output_len_out)
{
    (void)func;  // unused except for type
    // Object representation of the cbind
    auto cbind_obj = get_func_traits<decltype(func)>();
    std::string schema = msgpack::schema_to_string(cbind_obj);
    *output_out = (uint8_t*)aligned_alloc(64, schema.size() + 1);
    memcpy(*output_out, schema.c_str(), schema.size() + 1);
    *output_len_out = schema.size();
}

inline auto cbind_test_impl(auto func)
{
    return [=](auto... test_args) {
        auto expected_ret = func(test_args...);
        auto [input, input_len] = msgpack::encode_buffer(std::make_tuple(test_args...));
        uint8_t* output;
        size_t output_len;
        cbind_impl(func, input, input_len, &output, &output_len);
        decltype(expected_ret) actual_ret;
        msgpack::decode(&actual_ret, output, output_len);
        aligned_free(output);
        // TODO reinstate equality check when derived from msgpack
        return std::make_pair(msgpack::string_encode(actual_ret), msgpack::string_encode(expected_ret));
    };
}
}  // namespace msgpack

// TODO flag to not generate schema
// TODO flag to not generate test helper
#define CBIND(cname, func, test_args)                                                                                  \
    WASM_EXPORT void cname(const uint8_t* input_in, size_t input_len_in, uint8_t** output_out, size_t* output_len_out) \
    {                                                                                                                  \
        msgpack::cbind_impl(func, input_in, input_len_in, output_out, output_len_out);                                 \
    }                                                                                                                  \
    WASM_EXPORT void cname##__schema(uint8_t** output_out, size_t* output_len_out)                                     \
    {                                                                                                                  \
        msgpack::cbind_schema_impl(func, output_out, output_len_out);                                                  \
    }                                                                                                                  \
    std::pair<std::string, std::string> cname##__test()                                                                \
    {                                                                                                                  \
        return msgpack::cbind_test_impl(func) test_args;                                                               \
    }