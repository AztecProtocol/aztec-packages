#include "barretenberg/bbapi/ffi_test_dispatch.hpp"
#include "barretenberg/common/low_memory.hpp"
#include <cstdlib>
#include <gtest/gtest.h>

// The cases are death tests, which gtest does not provide on wasm.
#if !defined(BB_NO_EXCEPTIONS) && GTEST_HAS_DEATH_TEST

using namespace bb::bbapi;
using bb::bbapi::ffi_test::ffi_call;

// configure() changes process-wide state (and the test binary may have turned the mode on from BB_SLOW_LOW_MEMORY), so
// each case runs in a child process ("threadsafe" death tests re-execute the binary).
TEST(LowMemoryConfigureDeathTest, AcceptedOutsideAProof)
{
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    EXPECT_EXIT(
        {
            auto response = ffi_call(wire::BbLowMemoryConfigure{ .mode = "off",
                                                                 .storage_budget = std::nullopt,
                                                                 .storage_directory = std::nullopt,
                                                                 .automatic_threshold = std::nullopt });
            bool ok = response.type == wire::BbLowMemoryConfigureResponse::MSGPACK_SCHEMA_NAME;
            if (ok) {
                auto applied = response.payload().as<wire::BbLowMemoryConfigureResponse>();
                ok = !applied.enabled && !applied.file_backed_polynomials && !applied.heap_configured;
            }
            std::_Exit(ok ? 0 : 1);
        },
        ::testing::ExitedWithCode(0),
        "");
}

TEST(LowMemoryConfigureDeathTest, RejectsAnUnknownMode)
{
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    EXPECT_EXIT(
        {
            const bool was_enabled = bb::low_memory::enabled();
            auto response = ffi_call(wire::BbLowMemoryConfigure{ .mode = "fast",
                                                                 .storage_budget = std::nullopt,
                                                                 .storage_directory = std::nullopt,
                                                                 .automatic_threshold = std::nullopt });
            std::_Exit(response.is_error() && bb::low_memory::enabled() == was_enabled ? 0 : 1);
        },
        ::testing::ExitedWithCode(0),
        "");
}

// The FFI entry keeps one request context for the process, so the started proof would also leak into later tests.
TEST(LowMemoryConfigureDeathTest, RejectedWhileAChonkProofIsInProgress)
{
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    EXPECT_EXIT(
        {
            // App, kernel, kernel, hiding kernel: the smallest stack ChonkStart accepts.
            auto started = ffi_call(wire::BbChonkStart{ .kinds = { 0, 1, 1, 2 } });
            auto configured = ffi_call(wire::BbLowMemoryConfigure{ .mode = "on",
                                                                   .storage_budget = std::nullopt,
                                                                   .storage_directory = std::nullopt,
                                                                   .automatic_threshold = std::nullopt });
            std::_Exit(started.type == wire::BbChonkStartResponse::MSGPACK_SCHEMA_NAME && configured.is_error() ? 0
                                                                                                                : 1);
        },
        ::testing::ExitedWithCode(0),
        "");
}

#endif
