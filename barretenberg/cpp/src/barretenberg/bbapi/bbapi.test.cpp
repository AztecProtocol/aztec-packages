#include "barretenberg/bbapi/bbapi.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/generated/bb_types.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/serialize/test_helper.hpp"
#include <gtest/gtest.h>

using namespace bb;
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

// Regression tests for input validation at API boundaries.
// These ensure non-canonical field encodings and trailing bytes are rejected.

TEST(BBApiInputValidation, NonCanonicalPublicInputRejected)
{
    using Flavor = bb::UltraFlavor;
    // A value >= BN254 scalar field modulus should be rejected
    uint256_t non_canonical = fr::modulus + 1;
    std::vector<uint256_t> bad_public_inputs = { non_canonical };
    std::vector<uint256_t> proof = { uint256_t(0) };

    EXPECT_THROW(bbapi::concatenate_proof<Flavor>(bad_public_inputs, proof), std::runtime_error);
}

TEST(BBApiInputValidation, NonCanonicalProofElementRejected)
{
    using Flavor = bb::UltraFlavor;
    // The modulus itself is non-canonical (valid range is [0, modulus))
    uint256_t non_canonical = fr::modulus;
    std::vector<uint256_t> public_inputs = { uint256_t(42) };
    std::vector<uint256_t> bad_proof = { non_canonical };

    EXPECT_THROW(bbapi::concatenate_proof<Flavor>(public_inputs, bad_proof), std::runtime_error);
}

TEST(BBApiInputValidation, CanonicalValuesAccepted)
{
    using Flavor = bb::UltraFlavor;
    // modulus - 1 is the largest canonical value
    uint256_t max_canonical = fr::modulus - 1;
    std::vector<uint256_t> public_inputs = { uint256_t(0), max_canonical };
    std::vector<uint256_t> proof = { uint256_t(1) };

    EXPECT_NO_THROW(bbapi::concatenate_proof<Flavor>(public_inputs, proof));
}

TEST(BBApiInputValidation, TrailingBytesInBinaryInputRejected)
{
    // A buffer that is not a multiple of 32 bytes should be rejected
    std::vector<uint8_t> buf(32 + 1, 0); // 33 bytes = 1 field element + 1 trailing byte
    EXPECT_THROW(many_from_buffer_exact<uint256_t>(buf, "test input"), std::runtime_error);
}

TEST(BBApiInputValidation, ExactBinaryInputAccepted)
{
    // A buffer that is exactly 2 field elements should parse fine
    std::vector<uint8_t> buf(64, 0);
    EXPECT_NO_THROW(many_from_buffer_exact<uint256_t>(buf, "test input"));
    auto result = many_from_buffer_exact<uint256_t>(buf, "test input");
    EXPECT_EQ(result.size(), 2UL);
}

TEST(BBApiInputValidation, VkWithTrailingBytesRejectedOnProveSide)
{
    using VK = UltraFlavor::VerificationKey;
    const size_t expected_size = VK::calc_num_data_types() * sizeof(bb::fr);
    // One extra byte beyond the expected VK size
    std::vector<uint8_t> bad_vk(expected_size + 1, 0);
    EXPECT_THROW(bbapi::validate_vk_size<VK>(bad_vk), std::runtime_error);
}

TEST(BBApiInputValidation, VkWithCorrectSizeAccepted)
{
    using VK = UltraFlavor::VerificationKey;
    const size_t expected_size = VK::calc_num_data_types() * sizeof(bb::fr);
    std::vector<uint8_t> good_vk(expected_size, 0);
    EXPECT_NO_THROW(bbapi::validate_vk_size<VK>(good_vk));
}
