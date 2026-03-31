#include "barretenberg/bbapi/generated/bb_types.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/serialize/test_helper.hpp"
#include <gtest/gtest.h>

using namespace bb::bbapi::wire;

// Template for testing roundtrip serialization of wire types
template <typename T> class BBApiMsgpack : public ::testing::Test {};

// Enumerate wire command types (these have SERIALIZATION_FIELDS for msgpack roundtrip)
using Commands = ::testing::Types<BbCircuitProve,
                                  BbCircuitComputeVk,
                                  BbCircuitStats,
                                  BbCircuitVerify,
                                  BbVkAsFields,
                                  BbCircuitWriteSolidityVerifier,
                                  BbChonkStart,
                                  BbChonkLoad,
                                  BbChonkAccumulate,
                                  BbChonkProve,
                                  BbChonkComputeVk,
                                  BbChonkCheckPrecomputedVk,
                                  BbChonkBatchVerify>;

TYPED_TEST_SUITE(BBApiMsgpack, Commands);

TYPED_TEST(BBApiMsgpack, DefaultConstructorRoundtrip)
{
    TypeParam command{};
    auto [actual_command, expected_command] = msgpack_roundtrip(command);
    EXPECT_EQ(actual_command, expected_command);
}
