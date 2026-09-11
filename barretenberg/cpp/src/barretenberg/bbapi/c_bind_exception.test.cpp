#include "barretenberg/bbapi/bbapi_crypto.hpp"
#include "barretenberg/bbapi/bbapi_execute.hpp"
#include "barretenberg/bbapi/bbapi_srs.hpp"
#include "barretenberg/bbapi/c_bind.hpp"
#include "barretenberg/common/bbmalloc.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include <cstddef>
#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>
#include <stdexcept>
#include <string>
#include <string_view>
#include <tuple>
#include <variant>
#include <vector>

using namespace bb::bbapi;

#ifndef BB_NO_EXCEPTIONS

// Test that exceptions thrown during command execution are caught and converted to ErrorResponse
TEST(CBind, CatchesExceptionAndReturnsErrorResponse)
{
    // Create an SrsInitSrs command with invalid data that will cause an exception
    // The from_buffer calls in bbapi_srs.cpp will read past buffer boundaries
    SrsInitSrs cmd;
    cmd.num_points = 100;                         // Request 100 points (6400 bytes needed)
    cmd.points_buf = std::vector<uint8_t>(10, 0); // Only provide 10 bytes - will cause out of bounds access
    cmd.g2_point = std::vector<uint8_t>(10, 0);   // Also too small (needs 128 bytes)

    Command command = std::move(cmd);

    // Call bbapi - exception should be caught and converted to ErrorResponse
    CommandResponse response = bbapi(std::move(command));

    // Check that we got an ErrorResponse using get_type_name()
    std::string_view type_name = response.get_type_name();
    EXPECT_EQ(type_name, "ErrorResponse") << "Expected ErrorResponse but got: " << type_name;

    // Also verify using std::holds_alternative on the underlying variant
    bool is_error = std::holds_alternative<ErrorResponse>(response.get());
    EXPECT_TRUE(is_error) << "Expected ErrorResponse variant";

    if (is_error) {
        const auto& error = std::get<ErrorResponse>(response.get());
        EXPECT_FALSE(error.message.empty()) << "Error message should not be empty";
        std::cout << "Successfully caught exception with message: " << error.message << '\n';
    }
}

// Test that valid operations still work correctly (no false positives)
TEST(CBind, ValidOperationReturnsSuccess)
{
    // Create a Shutdown command which should succeed without throwing
    Shutdown shutdown_cmd;
    Command command = shutdown_cmd;

    // Call bbapi - should return success response
    CommandResponse response = bbapi(std::move(command));

    // Check that we got a ShutdownResponse, not an ErrorResponse
    std::string_view type_name = response.get_type_name();
    EXPECT_NE(type_name, "ErrorResponse") << "Valid command should not return ErrorResponse";
    EXPECT_EQ(type_name, "ShutdownResponse") << "Expected ShutdownResponse";

    // Also verify using std::holds_alternative on the underlying variant
    bool is_shutdown = std::holds_alternative<Shutdown::Response>(response.get());
    EXPECT_TRUE(is_shutdown) << "Expected Shutdown::Response variant";
}

namespace {

// Encodes a command as the msgpack tuple-of-arguments that the exported C entry point expects.
std::vector<uint8_t> encode_request(Command&& command)
{
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, std::make_tuple(std::move(command)));
    return { buffer.data(), buffer.data() + buffer.size() };
}

// Calls the exported C entry point with no caller scratch buffer, so the binding allocates the response, and
// returns a copy of the response bytes. The C symbol is qualified with :: because bb::bbapi::bbapi is the C++
// overload taking a Command.
std::vector<uint8_t> call_bbapi_c_allocating(const std::vector<uint8_t>& request)
{
    uint8_t* output = nullptr;
    size_t output_len = 0;
    ::bbapi(request.data(), request.size(), &output, &output_len);
    EXPECT_NE(output, nullptr);
    EXPECT_GT(output_len, 0U);
    if (output == nullptr) {
        return {};
    }
    std::vector<uint8_t> response_bytes(output, output + output_len);
    bbfree(output);
    return response_bytes;
}

CommandResponse decode_response(const std::vector<uint8_t>& response_bytes)
{
    CommandResponse response;
    msgpack::unpack(reinterpret_cast<const char*>(response_bytes.data()), response_bytes.size())
        .get()
        .convert(response);
    return response;
}

CommandResponse call_bbapi_c(const std::vector<uint8_t>& request)
{
    return decode_response(call_bbapi_c_allocating(request));
}

void expect_error_response(const std::vector<uint8_t>& request, std::string_view expected_message)
{
    std::vector<uint8_t> response_bytes = call_bbapi_c_allocating(request);
    ASSERT_FALSE(response_bytes.empty());
    CommandResponse response = decode_response(response_bytes);
    ASSERT_TRUE(std::holds_alternative<ErrorResponse>(response.get()))
        << "Expected ErrorResponse but got: " << response.get_type_name();
    // The message the C++ side threw must survive the boundary, not just some non-empty string.
    EXPECT_THAT(std::get<ErrorResponse>(response.get()).message, testing::HasSubstr(std::string(expected_message)));
}

// [["Nope", {}]]: well-formed msgpack naming a command that does not exist.
const std::vector<uint8_t> UNKNOWN_COMMAND_REQUEST = { 0x91, 0x92, 0xa4, 'N', 'o', 'p', 'e', 0x80 };

} // namespace

// A request whose msgpack stream ends inside the command name string.
TEST(CBind, TruncatedMsgpackReturnsErrorResponse)
{
    // [["Shut : the fixstr header announces eight bytes but only four follow
    expect_error_response({ 0x91, 0x92, 0xa8, 'S', 'h', 'u', 't' }, "insufficient");
}

// 0xc1 is the one byte value the msgpack specification reserves and never emits.
TEST(CBind, ReservedMsgpackByteReturnsErrorResponse)
{
    expect_error_response({ 0xc1 }, "parse error");
}

// A nil request cannot be converted to the argument tuple.
TEST(CBind, NilRequestReturnsErrorResponse)
{
    expect_error_response({ 0xc0 }, "bad_cast");
}

TEST(CBind, UnknownCommandNameReturnsErrorResponse)
{
    expect_error_response(UNKNOWN_COMMAND_REQUEST, "Nope");
}

// [["SrsInitSrs", {"num_points": 1}]]: a known command with the points_buf and g2_point fields omitted.
TEST(CBind, MissingCommandFieldReturnsErrorResponse)
{
    expect_error_response({ 0x91, 0x92, 0xaa, 'S', 'r', 's', 'I', 'n', 'i', 't', 'S', 'r', 's',
                            0x81, 0xaa, 'n',  'u', 'm', '_', 'p', 'o', 'i', 'n', 't', 's', 0x01 },
                          "points_buf");
}

// The IN-OUT output buffer protocol applies to error responses too: a response that fits in the caller's scratch
// buffer is written there and the pointer is left unchanged.
TEST(CBind, ErrorResponseUsesCallerScratchBuffer)
{
    std::vector<uint8_t> scratch(256, 0);
    uint8_t* output = scratch.data();
    size_t output_len = scratch.size();
    ::bbapi(UNKNOWN_COMMAND_REQUEST.data(), UNKNOWN_COMMAND_REQUEST.size(), &output, &output_len);
    EXPECT_EQ(output, scratch.data());
    ASSERT_GT(output_len, 0U);
    ASSERT_LE(output_len, scratch.size());
    CommandResponse response;
    msgpack::unpack(reinterpret_cast<const char*>(output), output_len).get().convert(response);
    ASSERT_TRUE(std::holds_alternative<ErrorResponse>(response.get()));
    EXPECT_FALSE(std::get<ErrorResponse>(response.get()).message.empty());
}

// A response that does not fit the caller's scratch buffer goes to a fresh allocation, byte for byte the same
// response, and the scratch buffer is left alone.
TEST(CBind, ErrorResponseLargerThanScratchIsAllocated)
{
    const std::vector<uint8_t> expected_bytes = call_bbapi_c_allocating(UNKNOWN_COMMAND_REQUEST);
    ASSERT_GT(expected_bytes.size(), 8U);

    std::vector<uint8_t> scratch(8, 0xee);
    uint8_t* output = scratch.data();
    size_t output_len = scratch.size();
    ::bbapi(UNKNOWN_COMMAND_REQUEST.data(), UNKNOWN_COMMAND_REQUEST.size(), &output, &output_len);
    ASSERT_NE(output, scratch.data());
    ASSERT_EQ(output_len, expected_bytes.size());
    EXPECT_EQ(std::vector<uint8_t>(output, output + output_len), expected_bytes);
    EXPECT_EQ(scratch, std::vector<uint8_t>(8, 0xee)) << "scratch buffer must be untouched when the response does "
                                                         "not fit";
    bbfree(output);
}

// A response the size of the caller's scratch buffer still fits and is written in place.
TEST(CBind, ErrorResponseExactlyFitsScratch)
{
    const std::vector<uint8_t> expected_bytes = call_bbapi_c_allocating(UNKNOWN_COMMAND_REQUEST);
    ASSERT_FALSE(expected_bytes.empty());

    std::vector<uint8_t> scratch(expected_bytes.size(), 0);
    uint8_t* output = scratch.data();
    size_t output_len = scratch.size();
    ::bbapi(UNKNOWN_COMMAND_REQUEST.data(), UNKNOWN_COMMAND_REQUEST.size(), &output, &output_len);
    EXPECT_EQ(output, scratch.data());
    EXPECT_EQ(output_len, expected_bytes.size());
    EXPECT_EQ(scratch, expected_bytes);
}

// A valid request through the C entry point produces the same response as calling the C++ overload directly.
TEST(CBind, ValidRequestRoundTripsThroughCBinding)
{
    Poseidon2Hash cmd{ .inputs = { bb::fr(1), bb::fr(2) } };
    CommandResponse expected = bbapi(Command(cmd));
    ASSERT_TRUE(std::holds_alternative<Poseidon2Hash::Response>(expected.get()));

    CommandResponse actual = call_bbapi_c(encode_request(Command(cmd)));
    ASSERT_TRUE(std::holds_alternative<Poseidon2Hash::Response>(actual.get()))
        << "Expected Poseidon2HashResponse but got: " << actual.get_type_name();
    EXPECT_EQ(std::get<Poseidon2Hash::Response>(actual.get()), std::get<Poseidon2Hash::Response>(expected.get()));
    EXPECT_NE(std::get<Poseidon2Hash::Response>(actual.get()).hash, bb::fr(0));
}

#else
TEST(CBind, ExceptionsDisabled)
{
    GTEST_SKIP() << "Skipping exception handling tests when BB_NO_EXCEPTIONS is defined";
}
#endif
