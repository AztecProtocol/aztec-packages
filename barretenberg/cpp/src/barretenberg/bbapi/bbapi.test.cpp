#include "barretenberg/bbapi/bbapi.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/utils.hpp"
#include "barretenberg/serialize/test_helper.hpp"
#include "msgpack/v3/sbuffer_decl.hpp"
#include <gtest/gtest.h>

using namespace bb;

// Template for testing roundtrip serialization
template <typename T> class BBApiSerializationTest : public ::testing::Test {};

// Enumerate each command type
using Commands = ::testing::Types<bbapi::CircuitProve,
                                  bbapi::CircuitComputeVk,
                                  bbapi::CircuitStats,
                                  bbapi::CircuitVerify,
                                  bbapi::VkAsFields,
                                  bbapi::CircuitWriteSolidityVerifier,
                                  bbapi::ClientIvcStart,
                                  bbapi::ClientIvcLoad,
                                  bbapi::ClientIvcAccumulate,
                                  bbapi::ClientIvcProve,
                                  bbapi::ClientIvcComputeStandaloneVk,
                                  bbapi::ClientIvcComputeIvcVk,
                                  bbapi::ClientIvcCheckPrecomputedVk>;

// Typed test suites
template <typename T> class BBApiMsgpack : public ::testing::Test {};

TYPED_TEST_SUITE(BBApiMsgpack, Commands);

// Test roundtrip serialization for UltraHonk commands
TYPED_TEST(BBApiMsgpack, DefaultConstructorRoundtrip)
{
    TypeParam command{};
    auto [actual_command, expected_command] = msgpack_roundtrip(command);
    EXPECT_EQ(actual_command, expected_command);

    typename TypeParam::Response response{};
    auto [actual_response, expected_response] = msgpack_roundtrip(response);
    EXPECT_EQ(actual_response, expected_response);
    std::cout << msgpack_schema_to_string(command) << " " << msgpack_schema_to_string(response) << std::endl;
}
