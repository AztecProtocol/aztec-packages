#include "barretenberg/bbapi/bbapi_execute.hpp"
#include "barretenberg/bbapi/bbapi_srs.hpp"
#include "barretenberg/bbapi/c_bind.hpp"
#include <gtest/gtest.h>
#include <stdexcept>
#include <string_view>

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

#else
TEST(CBind, ExceptionsDisabled)
{
    GTEST_SKIP() << "Skipping exception handling tests when BB_NO_EXCEPTIONS is defined";
}
#endif
