#include "blake2b.hpp"
#include "checksum_check.hpp"
#include <filesystem>
#include <fstream>
#include <gtest/gtest.h>

using namespace bb::ignition;

// RFC 7693 Appendix A: BLAKE2b-512("abc")
TEST(Blake2b, RFC7693TestVector)
{
    const uint8_t input[] = { 'a', 'b', 'c' };
    auto hash = blake2b(input, 3);

    // Expected: BA 80 A5 3F 98 1C 4D 0D 6A 27 97 B6 9F 12 F6 E9
    //           4C 21 2F 14 68 5A C4 B7 4B 12 BB 6F DB FF A2 D1
    //           7D 87 C5 39 2A AB 79 2D C2 52 D5 DE 45 33 CC 95
    //           18 D3 8A A8 DB F1 92 5A B9 23 86 ED D4 00 99 23
    // clang-format off
    std::array<uint8_t, 64> expected = {
        0xBA, 0x80, 0xA5, 0x3F, 0x98, 0x1C, 0x4D, 0x0D,
        0x6A, 0x27, 0x97, 0xB6, 0x9F, 0x12, 0xF6, 0xE9,
        0x4C, 0x21, 0x2F, 0x14, 0x68, 0x5A, 0xC4, 0xB7,
        0x4B, 0x12, 0xBB, 0x6F, 0xDB, 0xFF, 0xA2, 0xD1,
        0x7D, 0x87, 0xC5, 0x39, 0x2A, 0xAB, 0x79, 0x2D,
        0xC2, 0x52, 0xD5, 0xDE, 0x45, 0x33, 0xCC, 0x95,
        0x18, 0xD3, 0x8A, 0xA8, 0xDB, 0xF1, 0x92, 0x5A,
        0xB9, 0x23, 0x86, 0xED, 0xD4, 0x00, 0x99, 0x23,
    };
    // clang-format on

    EXPECT_EQ(hash, expected);
}

TEST(Blake2b, EmptyInput)
{
    auto hash = blake2b(nullptr, 0);

    // BLAKE2b-512("") known value
    // 786a02f742015903c6c6fd852552d272912f4740e15847618a86e217f71f5419
    // d25e1031afee585313896444934eb04b903a685b1448b755d56f701afe9be2ce
    // clang-format off
    std::array<uint8_t, 64> expected = {
        0x78, 0x6a, 0x02, 0xf7, 0x42, 0x01, 0x59, 0x03,
        0xc6, 0xc6, 0xfd, 0x85, 0x25, 0x52, 0xd2, 0x72,
        0x91, 0x2f, 0x47, 0x40, 0xe1, 0x58, 0x47, 0x61,
        0x8a, 0x86, 0xe2, 0x17, 0xf7, 0x1f, 0x54, 0x19,
        0xd2, 0x5e, 0x10, 0x31, 0xaf, 0xee, 0x58, 0x53,
        0x13, 0x89, 0x64, 0x44, 0x93, 0x4e, 0xb0, 0x4b,
        0x90, 0x3a, 0x68, 0x5b, 0x14, 0x48, 0xb7, 0x55,
        0xd5, 0x6f, 0x70, 0x1a, 0xfe, 0x9b, 0xe2, 0xce,
    };
    // clang-format on

    EXPECT_EQ(hash, expected);
}

TEST(Blake2b, ChecksumVerification)
{
    auto tmp_dir = std::filesystem::temp_directory_path() / "ignition_blake2b_test";
    std::filesystem::create_directories(tmp_dir);
    auto tmp_file = tmp_dir / "test_checksum.dat";

    // Write some arbitrary data
    std::vector<uint8_t> data(1024);
    for (size_t i = 0; i < data.size(); ++i) {
        data[i] = static_cast<uint8_t>(i & 0xFF);
    }

    // Compute the BLAKE2B hash of the data
    auto checksum = blake2b(data.data(), data.size());

    // Write data + hash to file
    {
        std::ofstream file(tmp_file, std::ios::binary);
        file.write(reinterpret_cast<const char*>(data.data()), static_cast<std::streamsize>(data.size()));
        file.write(reinterpret_cast<const char*>(checksum.data()), static_cast<std::streamsize>(checksum.size()));
    }

    EXPECT_TRUE(verify_transcript_checksum(tmp_file));

    // Corrupt one byte — checksum should fail
    auto corrupted_file = tmp_dir / "test_checksum_bad.dat";
    data[500] ^= 0x01;
    {
        std::ofstream file(corrupted_file, std::ios::binary);
        file.write(reinterpret_cast<const char*>(data.data()), static_cast<std::streamsize>(data.size()));
        file.write(reinterpret_cast<const char*>(checksum.data()), static_cast<std::streamsize>(checksum.size()));
    }

    EXPECT_FALSE(verify_transcript_checksum(corrupted_file));

    std::filesystem::remove_all(tmp_dir);
}
