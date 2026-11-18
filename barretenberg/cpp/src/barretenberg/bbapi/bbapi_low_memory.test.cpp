#include "barretenberg/bbapi/ffi_test_dispatch.hpp"
#include "barretenberg/common/low_memory.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/polynomials/backing_memory.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/srs/factories/bn254_crs_data.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <cstdlib>
#include <gtest/gtest.h>

// Both cases are death tests, which gtest does not provide on wasm.
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

#if !defined(_WIN32)
// Exit codes name the first check that failed.
int crs_given_through_bbapi()
{
    constexpr size_t num_points = 16;
    auto configured = ffi_call(wire::BbLowMemoryConfigure{ .mode = "on",
                                                           .storage_budget = std::nullopt,
                                                           .storage_directory = std::nullopt,
                                                           .automatic_threshold = std::nullopt });
    if (configured.is_error() ||
        !configured.payload().as<wire::BbLowMemoryConfigureResponse>().file_backed_polynomials) {
        return 1;
    }
    // Successive doublings of the generator: distinct points, so the MSM below meets no edge case.
    std::vector<bb::g1::affine_element> points;
    std::vector<uint8_t> points_buf;
    bb::g1::element point = bb::g1::one;
    for (size_t i = 0; i < num_points; ++i) {
        points.emplace_back(point);
        const auto bytes = to_buffer(points.back());
        points_buf.insert(points_buf.end(), bytes.begin(), bytes.end());
        point = point.dbl();
    }
    const size_t usage_before = current_storage_usage.load();
    auto initialized = ffi_call(wire::BbSrsInitSrs{ .points_buf = std::move(points_buf),
                                                    .num_points = static_cast<uint32_t>(num_points),
                                                    .g2_point = to_buffer(bb::srs::get_bn254_g2_crs_element()) });
    if (initialized.is_error()) {
        return 2;
    }
    // The points live in a file mapping, which counts against the storage budget.
    if (current_storage_usage.load() - usage_before != num_points * sizeof(bb::g1::affine_element)) {
        return 3;
    }
    auto crs_points = bb::srs::get_bn254_crs_factory()->get_crs(num_points)->get_monomial_points();
    auto scalars = bb::Polynomial<bb::fr>::random(num_points);
    bb::g1::element expected = bb::g1::point_at_infinity;
    for (size_t i = 0; i < num_points; ++i) {
        expected += points[i] * scalars[i];
    }
    const auto commitment = bb::scalar_multiplication::pippenger<bb::curve::BN254>(scalars, crs_points);
    return commitment == expected ? 0 : 4;
}

TEST(LowMemoryConfigureDeathTest, CrsGivenThroughBbapiIsFileBacked)
{
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    EXPECT_EXIT(std::_Exit(crs_given_through_bbapi()), ::testing::ExitedWithCode(0), "");
}
#endif

#endif
