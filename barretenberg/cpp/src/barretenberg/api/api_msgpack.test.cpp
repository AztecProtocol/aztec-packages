#include "barretenberg/api/api_msgpack.hpp"
#include "barretenberg/bbapi/bbapi_execute.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include <cstdint>
#include <cstring>
#include <gmock/gmock.h>
#include <gtest/gtest.h>
#include <iostream>
#include <sstream>
#include <string>
#include <variant>
#include <vector>

using namespace bb;

#ifndef BB_NO_EXCEPTIONS

namespace {

// The stream protocol frames every message with a 4-byte native-order length prefix.
void append_frame(std::string& stream, const std::vector<uint8_t>& message)
{
    uint32_t length = static_cast<uint32_t>(message.size());
    std::array<char, sizeof(length)> prefix{};
    std::memcpy(prefix.data(), &length, sizeof(length));
    stream.append(prefix.data(), prefix.size());
    stream.append(reinterpret_cast<const char*>(message.data()), message.size());
}

std::vector<bbapi::CommandResponse> read_frames(const std::string& stream)
{
    std::vector<bbapi::CommandResponse> responses;
    size_t offset = 0;
    while (offset + sizeof(uint32_t) <= stream.size()) {
        uint32_t length = 0;
        std::memcpy(&length, stream.data() + offset, sizeof(length));
        offset += sizeof(length);
        EXPECT_LE(offset + length, stream.size()) << "response frame runs past the end of the stream";
        if (offset + length > stream.size()) {
            break;
        }
        bbapi::CommandResponse response;
        msgpack::unpack(stream.data() + offset, length).get().convert(response);
        responses.push_back(std::move(response));
        offset += length;
    }
    return responses;
}

std::string error_message(const bbapi::CommandResponse& response)
{
    return std::holds_alternative<bbapi::ErrorResponse>(response.get())
               ? std::get<bbapi::ErrorResponse>(response.get()).message
               : std::string();
}

} // namespace

// Each malformed frame is answered with an ErrorResponse carrying the reason, and the stream keeps going: the
// trailing Shutdown is still served and the call returns success.
TEST(APIMsgpack, MalformedFramesAreAnsweredAndTheStreamContinues)
{
    std::string input;
    append_frame(input, { 0xc1 });                                       // reserved msgpack byte
    append_frame(input, { 0xc0 });                                       // nil
    append_frame(input, { 0x91, 0x92, 0xa8, 'S', 'h', 'u', 't' });       // truncated command name
    append_frame(input, { 0x91, 0x92, 0xa4, 'N', 'o', 'p', 'e', 0x80 }); // unknown command name
    append_frame(input,
                 { 0x91, 0x92, 0xaa, 'S', 'r', 's', 'I', 'n', 'i', 't', 'S', 'r', 's',
                   0x81, 0xaa, 'n',  'u', 'm', '_', 'p', 'o', 'i', 'n', 't', 's', 0x01 }); // missing command fields
    append_frame(input, { 0x91, 0x92, 0xa8, 'S', 'h', 'u', 't', 'd', 'o', 'w', 'n', 0x80 });

    // Responses are written through the buffer std::cout holds on entry, so capture that.
    std::istringstream input_stream(input);
    std::ostringstream output_stream;
    auto* original_cout_buf = std::cout.rdbuf(output_stream.rdbuf());
    int result = process_msgpack_commands(input_stream);
    std::cout.rdbuf(original_cout_buf);

    EXPECT_EQ(result, 0);
    std::vector<bbapi::CommandResponse> responses = read_frames(output_stream.str());
    ASSERT_EQ(responses.size(), 6U) << "expected one response per request frame";
    EXPECT_THAT(error_message(responses[0]), testing::HasSubstr("parse error"));
    EXPECT_THAT(error_message(responses[1]), testing::HasSubstr("array of size 1"));
    EXPECT_THAT(error_message(responses[2]), testing::HasSubstr("insufficient"));
    EXPECT_THAT(error_message(responses[3]), testing::HasSubstr("Nope"));
    EXPECT_THAT(error_message(responses[4]), testing::HasSubstr("points_buf"));
    EXPECT_EQ(responses[5].get_type_name(), "ShutdownResponse");
}

#else
TEST(APIMsgpack, ExceptionsDisabled)
{
    GTEST_SKIP() << "Skipping msgpack stream error handling tests when BB_NO_EXCEPTIONS is defined";
}
#endif
