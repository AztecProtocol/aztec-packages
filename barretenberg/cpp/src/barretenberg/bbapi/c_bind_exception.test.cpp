#include "barretenberg/bbapi/c_bind.hpp"
#include "barretenberg/bbapi/generated/bb_types.hpp"
#include "barretenberg/bbapi/generated/ipc_codegen/msgpack_adaptor.hpp"
#include "barretenberg/bbapi/generated/ipc_codegen/msgpack_include.hpp"
#include <cstdlib>
#include <gtest/gtest.h>
#include <string>
#include <vector>

using namespace bb::bbapi;

namespace {

// Call the FFI entrypoint with a wire command and return the response's
// named-union tag ([type_name, payload]).
template <typename Cmd> std::string ffi_response_type(const char* name, const Cmd& cmd)
{
    // Request framing: [[CommandName, payload]] — the named-union pair inside
    // a one-element argument array.
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(1);
    pk.pack_array(2);
    pk.pack(std::string(name));
    pk.pack(cmd);

    uint8_t* out = nullptr;
    size_t out_len = 0;
    ipc_ffi_entry(reinterpret_cast<const uint8_t*>(buf.data()), buf.size(), &out, &out_len);

    auto oh = msgpack::unpack(reinterpret_cast<const char*>(out), out_len);
    // NOLINTNEXTLINE(cppcoreguidelines-no-malloc)
    free(out);
    auto arr = oh.get().via.array;
    EXPECT_EQ(arr.size, 2U);
    auto type = arr.ptr[0].as<std::string>();
    if (type == "BbErrorResponse") {
        std::cout << "error payload: " << arr.ptr[1] << '\n';
    }
    return type;
}

} // namespace

#ifndef BB_NO_EXCEPTIONS

// An exception thrown during command execution must come back as the error
// response, not kill the process: SrsInitSrs with truncated buffers throws in
// from_buffer.
TEST(CBind, CatchesExceptionAndReturnsErrorResponse)
{
    wire::BbSrsInitSrs cmd;
    cmd.num_points = 100;                         // needs 6400 bytes of points
    cmd.points_buf = std::vector<uint8_t>(10, 0); // far too small
    cmd.g2_point = std::vector<uint8_t>(10, 0);   // needs 128 bytes

    EXPECT_EQ(ffi_response_type("BbSrsInitSrs", cmd), "BbErrorResponse");
}

// A valid command answers with its own response type (no false-positive errors).
TEST(CBind, ValidOperationReturnsSuccess)
{
    wire::BbPoseidon2Hash cmd;
    cmd.inputs = { std::array<uint8_t, 32>{} }; // hash of a single zero field

    EXPECT_EQ(ffi_response_type("BbPoseidon2Hash", cmd), "BbPoseidon2HashResponse");
}

// An unknown command tag must produce the error response rather than a decode
// failure or silence.
TEST(CBind, UnknownCommandReturnsErrorResponse)
{
    wire::BbPoseidon2Hash cmd;
    EXPECT_EQ(ffi_response_type("NoSuchCommand", cmd), "BbErrorResponse");
}

#else
TEST(CBind, ExceptionsDisabled)
{
    GTEST_SKIP() << "Skipping exception handling tests when BB_NO_EXCEPTIONS is defined";
}
#endif
