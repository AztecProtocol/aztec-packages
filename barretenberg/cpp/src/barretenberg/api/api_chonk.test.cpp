#include "barretenberg/api/api_chonk.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/chonk/chonk_proof.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/serialize.hpp"
#include <atomic>
#include <filesystem>
#include <gtest/gtest.h>
#include <unistd.h>

using namespace bb;

namespace {

class TemporaryDirectory {
  public:
    TemporaryDirectory()
    {
        static std::atomic_uint64_t sequence = 0;
        path = std::filesystem::temp_directory_path() /
               ("api_chonk_test_" + std::to_string(getpid()) + "_" + std::to_string(sequence++));
        std::filesystem::create_directory(path);
    }
    ~TemporaryDirectory() { std::filesystem::remove_all(path); }

    std::filesystem::path path;
};

std::vector<uint8_t> minimum_chonk_proof_bytes()
{
    return to_buffer(std::vector<fr>(ChonkProof::PROOF_LENGTH_WITHOUT_PUB_INPUTS));
}

} // namespace

TEST(ChonkAPI, ProofStatsRejectsTrailingProofBytes)
{
    TemporaryDirectory temporary;
    auto proof_path = temporary.path / "proof";
    auto proof = minimum_chonk_proof_bytes();
    proof.push_back(0);
    write_file(proof_path, proof);

    EXPECT_THROW_WITH_MESSAGE(ChonkAPI().proof_stats(proof_path, "-"),
                              "Chonk proof file size must be a multiple of 32 bytes");
}

TEST(ChonkAPI, VerifyRejectsTrailingProofBytesBeforeReadingKey)
{
    TemporaryDirectory temporary;
    auto proof_path = temporary.path / "proof";
    auto proof = minimum_chonk_proof_bytes();
    proof.push_back(0);
    write_file(proof_path, proof);

    EXPECT_THROW_WITH_MESSAGE(ChonkAPI().verify({}, {}, proof_path, temporary.path / "missing_vk"),
                              "Chonk proof file size must be a multiple of 32 bytes");
}

TEST(ChonkAPI, BatchVerifyRejectsNonContiguousPairs)
{
    TemporaryDirectory temporary;
    for (const auto* filename : { "proof_0", "vk_0", "proof_2", "vk_2" }) {
        write_file(temporary.path / filename, std::vector<uint8_t>{ 0 });
    }

    EXPECT_THROW_WITH_MESSAGE(ChonkAPI().batch_verify({}, temporary.path),
                              "batch_verify: proof/vk indices must be contiguous starting at 0");
}

TEST(ChonkAPI, BatchVerifyReportsMissingDirectoryAsNoPairs)
{
    TemporaryDirectory temporary;
    auto missing_directory = temporary.path / "missing";

    EXPECT_THROW_WITH_MESSAGE(ChonkAPI().batch_verify({}, missing_directory),
                              "batch_verify: no proof_0/vk_0 pairs found in");
}

TEST(ChonkAPI, BatchVerifyRejectsUnmatchedPairs)
{
    TemporaryDirectory temporary;
    write_file(temporary.path / "proof_0", minimum_chonk_proof_bytes());

    EXPECT_THROW_WITH_MESSAGE(ChonkAPI().batch_verify({}, temporary.path),
                              "batch_verify: proof/vk indices must match and be contiguous starting at 0");
}

TEST(ChonkAPI, BatchVerifyRejectsLeadingZeroAliases)
{
    for (const auto* alias : { "proof_00", "vk_00" }) {
        SCOPED_TRACE(alias);
        TemporaryDirectory temporary;
        for (const auto* filename : { "proof_0", "vk_0", alias }) {
            write_file(temporary.path / filename, std::vector<uint8_t>{ 0 });
        }

        EXPECT_THROW_WITH_MESSAGE(ChonkAPI().batch_verify({}, temporary.path),
                                  "batch_verify: file index must not contain leading zeros");
    }
}

TEST(ChonkAPI, BatchVerifyRejectsTrailingProofBytesBeforeReadingKey)
{
    TemporaryDirectory temporary;
    auto proof = minimum_chonk_proof_bytes();
    proof.push_back(0);
    write_file(temporary.path / "proof_0", proof);
    write_file(temporary.path / "vk_0", std::vector<uint8_t>{ 0 });

    EXPECT_THROW_WITH_MESSAGE(ChonkAPI().batch_verify({}, temporary.path),
                              "Chonk proof file size must be a multiple of 32 bytes");
}

TEST(ChonkAPI, ProofStatsAppendsBinarySuffix)
{
    TemporaryDirectory temporary;
    auto proof_path = temporary.path / "proof";
    auto output_path = temporary.path / "stats.bin";
    write_file(proof_path, minimum_chonk_proof_bytes());

    ChonkAPI().proof_stats(proof_path, output_path);

    auto json = read_file(output_path);
    EXPECT_NE(std::string(json.begin(), json.end()).find("compressed_proof_size_bytes"), std::string::npos);
    EXPECT_TRUE(std::filesystem::exists(output_path.string() + ".bin"));
}

TEST(ChonkAPI, ProofStatsRejectsInputSidecarCollision)
{
    TemporaryDirectory temporary;
    auto output_path = temporary.path / "stats.json";
    auto proof_path = temporary.path / "stats.json.bin";
    write_file(proof_path, minimum_chonk_proof_bytes());

    EXPECT_THROW_WITH_MESSAGE(ChonkAPI().proof_stats(proof_path, output_path),
                              "proof_stats: compressed proof path conflicts with input or output path");
}

TEST(ChonkAPI, ProofStatsRejectsEquivalentInputSidecar)
{
    TemporaryDirectory temporary;
    auto proof_path = temporary.path / "proof";
    auto output_path = temporary.path / "stats.json";
    write_file(proof_path, minimum_chonk_proof_bytes());
    std::filesystem::create_hard_link(proof_path, output_path.string() + ".bin");

    EXPECT_THROW_WITH_MESSAGE(ChonkAPI().proof_stats(proof_path, output_path),
                              "proof_stats: compressed proof path conflicts with input or output path");
}
