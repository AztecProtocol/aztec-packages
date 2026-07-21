#include "barretenberg/bbapi/bbapi.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/bbapi/bbapi_crypto.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/chonk/private_execution_steps.hpp"
#include "barretenberg/common/assert.hpp"
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
                                  bbapi::ChonkStart,
                                  bbapi::ChonkLoad,
                                  bbapi::ChonkAccumulate,
                                  bbapi::ChonkProve,
                                  bbapi::ChonkComputeVk,
                                  bbapi::ChonkCheckPrecomputedVk,
                                  bbapi::ChonkBatchVerify>;

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

// Regression tests for input validation at API boundaries.
// These ensure non-canonical field encodings and trailing bytes are rejected.

TEST(BBApiInputValidation, NonCanonicalPublicInputRejected)
{
    using Flavor = UltraFlavor;
    // A value >= BN254 scalar field modulus should be rejected
    uint256_t non_canonical = fr::modulus + 1;
    std::vector<uint256_t> bad_public_inputs = { non_canonical };
    std::vector<uint256_t> proof = { uint256_t(0) };

    EXPECT_THROW(bbapi::concatenate_proof<Flavor>(bad_public_inputs, proof), std::runtime_error);
}

TEST(BBApiInputValidation, NonCanonicalProofElementRejected)
{
    using Flavor = UltraFlavor;
    // The modulus itself is non-canonical (valid range is [0, modulus))
    uint256_t non_canonical = fr::modulus;
    std::vector<uint256_t> public_inputs = { uint256_t(42) };
    std::vector<uint256_t> bad_proof = { non_canonical };

    EXPECT_THROW(bbapi::concatenate_proof<Flavor>(public_inputs, bad_proof), std::runtime_error);
}

TEST(BBApiInputValidation, CanonicalValuesAccepted)
{
    using Flavor = UltraFlavor;
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

TEST(BBApiInputValidation, ChonkVerifyWrongVkSizeReturnsInvalid)
{
    auto response = bbapi::ChonkVerify{ .proof = {}, .vk = { 0 } }.execute();
    EXPECT_FALSE(response.valid);
}

TEST(BBApiInputValidation, ChonkVerifyFromFieldsWrongVkSizeReturnsInvalid)
{
    auto response = bbapi::ChonkVerifyFromFields{ .proof = {}, .vk = { 0 } }.execute();
    EXPECT_FALSE(response.valid);
}

TEST(BBApiInputValidation, ChonkBatchVerifyWrongVkSizeReturnsInvalid)
{
    auto response = bbapi::ChonkBatchVerify{ .proofs = { ChonkProof{} }, .vks = { { 0 } } }.execute();
    EXPECT_FALSE(response.valid);
}

// Helper: pack a vector of PrivateExecutionStepRaw into a byte buffer via msgpack.
namespace {
std::vector<uint8_t> pack_steps(const std::vector<PrivateExecutionStepRaw>& steps)
{
    std::stringstream ss;
    msgpack::pack(ss, steps);
    const std::string s = ss.str();
    return { s.begin(), s.end() };
}
} // namespace

TEST(BBApiInputValidation, MsgpackParseUncompressedAcceptsCleanInput)
{
    PrivateExecutionStepRaw step{
        .bytecode = { 0xCA, 0xFE }, .witness = { 0xBE, 0xEF }, .vk = {}, .function_name = "test_fn"
    };

    auto buf = pack_steps({ step });
    auto result = PrivateExecutionStepRaw::parse_uncompressed(buf);

    ASSERT_EQ(result.size(), 1);
    EXPECT_EQ(result[0].bytecode, step.bytecode);
    EXPECT_EQ(result[0].witness, step.witness);
    EXPECT_EQ(result[0].function_name, "test_fn");
}

TEST(BBApiInputValidation, MsgpackParseUncompressedRejectsTrailingData)
{
    PrivateExecutionStepRaw step{ .bytecode = {}, .witness = {}, .vk = {}, .function_name = "x" };

    auto buf = pack_steps({ step });
    buf.push_back(0x00);

    EXPECT_THROW(PrivateExecutionStepRaw::parse_uncompressed(buf), std::invalid_argument);
}

TEST(BBApiInputValidation, MsgpackLoadAcceptsCleanFile)
{
    PrivateExecutionStepRaw step{ .bytecode = { 1, 2, 3 }, .witness = { 4, 5 }, .vk = {}, .function_name = "file_fn" };

    auto buf = pack_steps({ step });

    auto tmp = std::filesystem::temp_directory_path() / "bb_test_clean.msgpack";
    std::ofstream out(tmp, std::ios::binary);
    out.write(reinterpret_cast<const char*>(buf.data()), static_cast<std::streamsize>(buf.size()));
    out.close();

    auto result = PrivateExecutionStepRaw::load(tmp);
    std::filesystem::remove(tmp);

    ASSERT_EQ(result.size(), 1);
    EXPECT_EQ(result[0].function_name, "file_fn");
}

TEST(BBApiInputValidation, MsgpackLoadRejectsTrailingData)
{
    PrivateExecutionStepRaw step{ .bytecode = {}, .witness = {}, .vk = {}, .function_name = "x" };

    auto buf = pack_steps({ step });
    buf.push_back(0x00);

    auto tmp = std::filesystem::temp_directory_path() / "bb_test_tailed.msgpack";
    std::ofstream out(tmp, std::ios::binary);
    out.write(reinterpret_cast<const char*>(buf.data()), static_cast<std::streamsize>(buf.size()));
    out.close();

    EXPECT_THROW(PrivateExecutionStepRaw::load(tmp), std::invalid_argument);
    std::filesystem::remove(tmp);
}

// Regression tests for AesEncrypt/AesDecrypt input validation.
// Without these guards, a socket client could force a ~4 GB allocation via the
// uint32_t `length` field, or pass `length != plaintext.size()` and silently
// encrypt zero-padded tail bytes.
TEST(BBApiInputValidation, AesEncryptRejectsLengthMismatch)
{
    bbapi::BBApiRequest request{};
    bbapi::AesEncrypt cmd{ .plaintext = std::vector<uint8_t>(16, 0), .iv = {}, .key = {}, .length = 32 };
    EXPECT_THROW_OR_ABORT(std::move(cmd).execute(request), ".*length must equal plaintext.*");
}

TEST(BBApiInputValidation, AesEncryptRejectsNonBlockAlignedLength)
{
    bbapi::BBApiRequest request{};
    bbapi::AesEncrypt cmd{ .plaintext = std::vector<uint8_t>(17, 0), .iv = {}, .key = {}, .length = 17 };
    EXPECT_THROW_OR_ABORT(std::move(cmd).execute(request), ".*multiple of 16.*");
}

TEST(BBApiInputValidation, AesDecryptRejectsLengthMismatch)
{
    bbapi::BBApiRequest request{};
    bbapi::AesDecrypt cmd{ .ciphertext = std::vector<uint8_t>(16, 0), .iv = {}, .key = {}, .length = 32 };
    EXPECT_THROW_OR_ABORT(std::move(cmd).execute(request), ".*length must equal ciphertext.*");
}

TEST(BBApiInputValidation, AesDecryptRejectsNonBlockAlignedLength)
{
    bbapi::BBApiRequest request{};
    bbapi::AesDecrypt cmd{ .ciphertext = std::vector<uint8_t>(17, 0), .iv = {}, .key = {}, .length = 17 };
    EXPECT_THROW_OR_ABORT(std::move(cmd).execute(request), ".*multiple of 16.*");
}
