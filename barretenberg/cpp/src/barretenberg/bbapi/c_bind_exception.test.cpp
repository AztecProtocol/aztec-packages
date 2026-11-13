#include "barretenberg/bbapi/ffi_test_dispatch.hpp"
#include <gtest/gtest.h>
#include <string>

using namespace bb::bbapi;
using bb::bbapi::ffi_test::ffi_call;

namespace {

std::string ffi_response_type(const char* name, const auto& cmd)
{
    return ffi_call(cmd, name).type;
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

// A block-aligned input is the handler's precondition; a ragged one must come
// back as an error frame rather than trip the assert inside the sponge.
TEST(CBind, Poseidon2AbsorbChainMalformedLengthReturnsErrorResponse)
{
    for (size_t length : { 1U, 32U, 95U, 97U }) {
        SCOPED_TRACE(length);
        wire::BbPoseidon2AbsorbChain cmd;
        cmd.inputs = std::vector<uint8_t>(length);
        EXPECT_EQ(ffi_response_type("BbPoseidon2AbsorbChain", cmd), "BbErrorResponse");
    }
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

// Warmup runs the prover's hot loops on self-made inputs; they must be shaped so that
// the unsafe MSM path never meets two equal points.
TEST(CBind, WarmupSucceeds)
{
    EXPECT_EQ(ffi_response_type("BbWarmup", wire::BbWarmup{}), "BbWarmupResponse");
}

#else
TEST(CBind, ExceptionsDisabled)
{
    GTEST_SKIP() << "Skipping exception handling tests when BB_NO_EXCEPTIONS is defined";
}
#endif
