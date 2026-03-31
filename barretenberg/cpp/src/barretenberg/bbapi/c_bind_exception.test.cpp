#include "barretenberg/bbapi/bbapi_execute.hpp"
#include "barretenberg/bbapi/generated/bb_ipc_server.hpp"
#include <gtest/gtest.h>
#include <string>

using namespace bb::bbapi;

#ifndef BB_NO_EXCEPTIONS

// Test that exceptions thrown during command execution are caught by the generated dispatch
TEST(CBind, CatchesExceptionAndReturnsErrorResponse)
{
    // Create an invalid SRS command via wire types — too few bytes for the claimed num_points
    wire::BbSrsInitSrs wire_cmd;
    wire_cmd.num_points = 100;                                // Request 100 points
    wire_cmd.points_buf = std::vector<uint8_t>(10, 0);       // Only 10 bytes — will fail
    wire_cmd.g2_point = std::vector<uint8_t>(10, 0);         // Also too small

    // Serialize as [[CommandName, {payload}]]
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(1);
    pk.pack_array(2);
    pk.pack(std::string("BbSrsInitSrs"));
    pk.pack(wire_cmd);

    // Call the generated handler — exception should be caught and converted to error response
    static BbRequest request;
    auto handler = make_bb_handler(request);
    auto response_bytes = handler(std::vector<uint8_t>(buf.data(), buf.data() + buf.size()));

    // Parse response: [ResponseName, {payload}]
    auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(response_bytes.data()), response_bytes.size());
    auto obj = unpacked.get();
    ASSERT_EQ(obj.type, msgpack::type::ARRAY);
    ASSERT_EQ(obj.via.array.size, 2u);

    std::string resp_name(obj.via.array.ptr[0].via.str.ptr, obj.via.array.ptr[0].via.str.size);
    EXPECT_EQ(resp_name, "BbErrorResponse") << "Expected error response but got: " << resp_name;
}

#else
TEST(CBind, ExceptionsDisabled)
{
    GTEST_SKIP() << "Skipping exception handling tests when BB_NO_EXCEPTIONS is defined";
}
#endif
