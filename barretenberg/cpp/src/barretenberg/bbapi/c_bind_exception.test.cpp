#include "barretenberg/bbapi/bbapi_handlers.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/generated/bb_dispatch.hpp"
#include "barretenberg/bbapi/generated/bb_types.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <gtest/gtest.h>
#include <stdexcept>
#include <string_view>
#include <vector>

using namespace bb;

#ifndef BB_NO_EXCEPTIONS

namespace {
// Pack a wire-typed command into the bb dispatcher's expected input:
// `[ [type_name, payload] ]`.
template <typename WireCmd> std::vector<uint8_t> pack_wire_command(const WireCmd& cmd)
{
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(1);
    pk.pack_array(2);
    pk.pack(std::string(WireCmd::MSGPACK_SCHEMA_NAME));
    pk.pack(cmd);
    return std::vector<uint8_t>(buf.data(), buf.data() + buf.size());
}

// Extract the response type name from a packed `[name, payload]` response.
std::string response_type_name(const std::vector<uint8_t>& bytes)
{
    auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(bytes.data()), bytes.size());
    auto obj = unpacked.get();
    if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 2) {
        return "";
    }
    const auto& name_obj = obj.via.array.ptr[0];
    return std::string(name_obj.via.str.ptr, name_obj.via.str.size);
}

// Extract the error message from an ErrorResponse-shaped `[name, {message: ...}]`.
std::string response_error_message(const std::vector<uint8_t>& bytes)
{
    auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(bytes.data()), bytes.size());
    auto obj = unpacked.get();
    bbapi::wire::ErrorResponse err;
    obj.via.array.ptr[1].convert(err);
    return err.message;
}
} // namespace

// Test that exceptions thrown during command execution are caught by the
// codegen-emitted dispatcher and converted to ErrorResponse.
TEST(CBind, CatchesExceptionAndReturnsErrorResponse)
{
    // SrsInitSrs with num_points=100 requests 6400 bytes but points_buf has only 10.
    bbapi::wire::SrsInitSrs cmd{ .points_buf = std::vector<uint8_t>(10, 0),
                                 .num_points = 100,
                                 .g2_point = std::vector<uint8_t>(10, 0) };

    bbapi::BBApiRequest request;
    auto handler = bbapi::make_bb_handler(request);
    auto response = handler(pack_wire_command(cmd));

    EXPECT_EQ(response_type_name(response), "ErrorResponse");
    auto msg = response_error_message(response);
    EXPECT_FALSE(msg.empty()) << "Error message should not be empty";
    std::cout << "Successfully caught exception with message: " << msg << '\n';
}

TEST(CBind, ValidOperationReturnsSuccess)
{
    bbapi::wire::Blake2s cmd{ .data = std::vector<uint8_t>{ 1, 2, 3 } };

    bbapi::BBApiRequest request;
    auto handler = bbapi::make_bb_handler(request);

    auto response = handler(pack_wire_command(cmd));
    EXPECT_EQ(response_type_name(response), "Blake2sResponse");
}

#else
TEST(CBind, ExceptionsDisabled)
{
    GTEST_SKIP() << "Skipping exception handling tests when BB_NO_EXCEPTIONS is defined";
}
#endif
