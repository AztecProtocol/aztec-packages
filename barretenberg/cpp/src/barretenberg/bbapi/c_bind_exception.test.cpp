#include "barretenberg/bbapi/bbapi_execute.hpp"
#include "barretenberg/bbapi/bbapi_srs.hpp"
#include "barretenberg/bbapi/c_bind.hpp"
#include <gtest/gtest.h>
#include <stdexcept>
#include <string_view>

using namespace bb::bbapi;

#ifndef BB_NO_EXCEPTIONS

// Test that exceptions thrown during command execution are caught and converted to BbErrorResponse
TEST(CBind, CatchesExceptionAndReturnsErrorResponse)
{
    // Create an BbSrsInitSrs command with invalid data that will cause an exception
    // The from_buffer calls in bbapi_srs.cpp will read past buffer boundaries
    BbSrsInitSrs cmd;
    cmd.num_points = 100;                         // Request 100 points (6400 bytes needed)
    cmd.points_buf = std::vector<uint8_t>(10, 0); // Only provide 10 bytes - will cause out of bounds access
    cmd.g2_point = std::vector<uint8_t>(10, 0);   // Also too small (needs 128 bytes)

    Command command = std::move(cmd);

    // Call bbapi - exception should be caught and converted to BbErrorResponse
    CommandResponse response = bbapi(std::move(command));

    // Check that we got an BbErrorResponse using get_type_name()
    std::string_view type_name = response.get_type_name();
    EXPECT_EQ(type_name, "BbErrorResponse") << "Expected BbErrorResponse but got: " << type_name;

    // Also verify using std::holds_alternative on the underlying variant
    bool is_error = std::holds_alternative<BbErrorResponse>(response.get());
    EXPECT_TRUE(is_error) << "Expected BbErrorResponse variant";

    if (is_error) {
        const auto& error = std::get<BbErrorResponse>(response.get());
        EXPECT_FALSE(error.message.empty()) << "Error message should not be empty";
        std::cout << "Successfully caught exception with message: " << error.message << '\n';
    }
}

// Test that valid operations still work correctly (no false positives)
TEST(CBind, ValidOperationReturnsSuccess)
{
    // Create a BbShutdown command which should succeed without throwing
    BbShutdown shutdown_cmd;
    Command command = shutdown_cmd;

    // Call bbapi - should return success response
    CommandResponse response = bbapi(std::move(command));

    // Check that we got a ShutdownResponse, not an BbErrorResponse
    std::string_view type_name = response.get_type_name();
    EXPECT_NE(type_name, "BbErrorResponse") << "Valid command should not return BbErrorResponse";
    EXPECT_EQ(type_name, "ShutdownResponse") << "Expected ShutdownResponse";

    // Also verify using std::holds_alternative on the underlying variant
    bool is_shutdown = std::holds_alternative<BbShutdown::Response>(response.get());
    EXPECT_TRUE(is_shutdown) << "Expected BbShutdown::Response variant";
}

#else
TEST(CBind, ExceptionsDisabled)
{
    GTEST_SKIP() << "Skipping exception handling tests when BB_NO_EXCEPTIONS is defined";
}
#endif
