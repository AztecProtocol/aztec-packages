#include "barretenberg/bbapi/bbapi.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/bbapi/bbapi_crypto.hpp"
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/chonk/private_execution_steps.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/utils.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/serialize/test_helper.hpp"
#include "msgpack/v3/sbuffer_decl.hpp"
#include <atomic>
#include <cstdlib>
#include <gtest/gtest.h>
#include <limits>
#include <new>

using namespace bb;

namespace {
// Largest single operator-new request while tracking is on, so a test can bound a function's transient allocations.
std::atomic<bool> track_largest_allocation{ false };
std::atomic<size_t> largest_allocation{ 0 };

void record_allocation(size_t size)
{
    if (track_largest_allocation.load(std::memory_order_relaxed)) {
        size_t seen = largest_allocation.load(std::memory_order_relaxed);
        while (size > seen && !largest_allocation.compare_exchange_weak(seen, size)) {
        }
    }
}

struct LargestAllocationScope {
    LargestAllocationScope()
    {
        largest_allocation = 0;
        track_largest_allocation = true;
        bb::detail::set_allocation_observer(record_allocation);
    }
    ~LargestAllocationScope()
    {
        bb::detail::set_allocation_observer(nullptr);
        track_largest_allocation = false;
    }
};
} // namespace

#if !(defined(__APPLE__) && !defined(TRACY_MEMORY))
// Where common/mem.cpp does not replace operator new, this test does, so every request is seen.
void* operator new(size_t size)
{
    record_allocation(size);
    if (void* ptr = std::malloc(size == 0 ? 1 : size)) {
        return ptr;
    }
    throw std::bad_alloc();
}
void operator delete(void* ptr) noexcept
{
    std::free(ptr);
}
void operator delete(void* ptr, size_t /*size*/) noexcept
{
    std::free(ptr);
}
#endif

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

TEST(Poseidon2AbsorbChain, MatchesNativeSponge)
{
    using Sponge = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>::Sponge;
    const Sponge::State initial_state = { fr(11), fr(12), fr(13), fr(14) };
    const std::array<Sponge::Block, 2> blocks = { { { fr(1), fr(2), fr(3) }, { fr(4), fr(5), fr(6) } } };

    bbapi::BBApiRequest request{};
    auto response = bbapi::Poseidon2AbsorbChain{ .state = initial_state, .inputs = to_buffer(blocks) }.execute(request);
    EXPECT_EQ(response.state, Sponge::absorb_blocks(initial_state, blocks));
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

TEST(PrivateExecutionStepRaw, SelfDecompressIsIdempotent)
{
    const PrivateExecutionStepRaw step{ .bytecode = { 1, 2, 3 }, .witness = { 4, 5 }, .vk = {}, .function_name = "f" };
    auto tmp = std::filesystem::temp_directory_path() / "bb_test_step_idempotent.msgpack";
    PrivateExecutionStepRaw::compress_and_save({ step }, tmp);

    auto loaded = PrivateExecutionStepRaw::load(tmp);
    std::filesystem::remove(tmp);
    ASSERT_EQ(loaded.size(), 1);
    loaded[0].self_decompress();
    loaded[0].self_decompress();

    EXPECT_EQ(loaded[0].bytecode, step.bytecode);
    EXPECT_EQ(loaded[0].witness, step.witness);
}

namespace {
// Compressible but not trivially so: larger than the initial decompression buffer of a doubling strategy.
std::vector<uint8_t> sample_bytecode(size_t size)
{
    std::vector<uint8_t> bytecode(size);
    for (size_t i = 0; i < size; ++i) {
        bytecode[i] = static_cast<uint8_t>((i * 2654435761ULL) >> 13);
    }
    return bytecode;
}

PrivateExecutionStepRaw load_compressed_step(const std::vector<uint8_t>& bytecode, const std::string& file_name)
{
    const PrivateExecutionStepRaw step{ .bytecode = bytecode, .witness = { 4, 5 }, .vk = {}, .function_name = "f" };
    auto tmp = std::filesystem::temp_directory_path() / file_name;
    PrivateExecutionStepRaw::compress_and_save({ step }, tmp);
    auto loaded = PrivateExecutionStepRaw::load(tmp);
    std::filesystem::remove(tmp);
    return std::move(loaded.at(0));
}
} // namespace

/**
 * @brief Decompression allocates the output once at its final size: no intermediate buffer is larger than the result.
 */
TEST(PrivateExecutionStepRaw, SelfDecompressAllocatesOnlyTheFinalSize)
{
    const std::vector<uint8_t> bytecode = sample_bytecode(300 * 1024);
    auto loaded = load_compressed_step(bytecode, "bb_test_step_exact_size.msgpack");

    size_t largest = 0;
    {
        LargestAllocationScope scope;
        loaded.self_decompress();
        largest = largest_allocation;
    }

    EXPECT_EQ(loaded.bytecode, bytecode);
    EXPECT_EQ(loaded.witness, (std::vector<uint8_t>{ 4, 5 }));
    EXPECT_LE(largest, bytecode.size());
}

/**
 * @brief A gzip trailer claiming 4 GiB of output does not make decompression allocate it: the input is rejected with
 * an allocation bounded by what the compressed bytes can expand to.
 */
TEST(PrivateExecutionStepRaw, BogusUncompressedSizeIsNotAllocated)
{
    auto loaded = load_compressed_step(sample_bytecode(300 * 1024), "bb_test_step_bogus_isize.msgpack");
    const size_t compressed_size = loaded.bytecode.size();
    std::fill(loaded.bytecode.end() - 4, loaded.bytecode.end(), uint8_t{ 0xff });

    size_t largest = 0;
    {
        LargestAllocationScope scope;
        EXPECT_THROW(loaded.self_decompress(), std::invalid_argument);
        largest = largest_allocation;
    }
    EXPECT_LE(largest, (compressed_size * 1032) + 1024);
}

TEST(PrivateExecutionStepRaw, SelfDecompressLeavesUncompressedStepsUnchanged)
{
    const PrivateExecutionStepRaw step{ .bytecode = { 1, 2, 3 }, .witness = { 4, 5 }, .vk = {}, .function_name = "f" };
    auto parsed = PrivateExecutionStepRaw::parse_uncompressed(pack_steps({ step }));
    ASSERT_EQ(parsed.size(), 1);

    parsed[0].self_decompress();

    EXPECT_EQ(parsed[0].bytecode, step.bytecode);
    EXPECT_EQ(parsed[0].witness, step.witness);
}

TEST(PrivateExecutionStepRaw, CompressAndSaveDoesNotRecompressLoadedSteps)
{
    const PrivateExecutionStepRaw step{ .bytecode = { 1, 2, 3 }, .witness = { 4, 5 }, .vk = {}, .function_name = "f" };
    auto first = std::filesystem::temp_directory_path() / "bb_test_step_first.msgpack";
    auto second = std::filesystem::temp_directory_path() / "bb_test_step_second.msgpack";
    PrivateExecutionStepRaw::compress_and_save({ step }, first);

    PrivateExecutionStepRaw::compress_and_save(PrivateExecutionStepRaw::load(first), second);
    auto reloaded = PrivateExecutionStepRaw::load_and_decompress(second);
    std::filesystem::remove(first);
    std::filesystem::remove(second);

    ASSERT_EQ(reloaded.size(), 1);
    EXPECT_EQ(reloaded[0].bytecode, step.bytecode);
    EXPECT_EQ(reloaded[0].witness, step.witness);
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
