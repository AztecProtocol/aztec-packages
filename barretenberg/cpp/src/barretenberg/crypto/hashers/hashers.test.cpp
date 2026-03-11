#include <gtest/gtest.h>

#include "../hashers/hashers.hpp"

#include <array>
#include <cstddef>
#include <stdint.h>
#include <vector>

using namespace bb;
using namespace bb::crypto;

namespace {

std::string bytes_to_hex_string(const std::vector<uint8_t>& bytes)
{
    static constexpr std::array<char, 16> HEX_CHARS = { '0', '1', '2', '3', '4', '5', '6', '7',
                                                        '8', '9', 'a', 'b', 'c', 'd', 'e', 'f' };
    std::string hex(bytes.size() * 2, '\0');
    for (size_t i = 0; i < bytes.size(); ++i) {
        hex[2 * i] = HEX_CHARS[bytes[i] >> 4];
        hex[(2 * i) + 1] = HEX_CHARS[bytes[i] & 0x0f];
    }
    return hex;
}

} // namespace

TEST(Sha256, EmptyHash)
{
    auto hash = Sha256Hasher::hash(std::vector<uint8_t>{});
    std::vector<uint8_t> hash_vec(hash.begin(), hash.end());
    auto hash_string = bytes_to_hex_string(hash_vec);
    EXPECT_EQ(hash_string, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
}

TEST(Keccak, EmptyHash)
{
    auto hash = KeccakHasher::hash(std::vector<uint8_t>{});
    std::vector<uint8_t> hash_vec(hash.begin(), hash.end());
    auto hash_string = bytes_to_hex_string(hash_vec);
    EXPECT_EQ(hash_string, "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
}

TEST(Blake2s, EmptyHash)
{
    auto hash = Blake2sHasher::hash(std::vector<uint8_t>{});
    std::vector<uint8_t> hash_vec(hash.begin(), hash.end());
    auto hash_string = bytes_to_hex_string(hash_vec);
    EXPECT_EQ(hash_string, "69217a3079908094e11121d042354a7c1f55b6482ca1a51e1b250dfd1ed0eef9");
}
