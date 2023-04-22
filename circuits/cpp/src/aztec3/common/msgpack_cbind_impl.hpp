#pragma once
// Note: heavy header due to serialization logic, don't include if auto parameters will do
#include <barretenberg/common/msgpack_impl.hpp>

namespace msgpack {
inline std::pair<uint8_t*, size_t> encode_buffer(auto obj)
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
} // namespace msgpack