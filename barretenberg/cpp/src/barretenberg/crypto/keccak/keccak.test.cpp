#include "keccak.hpp"
#include <algorithm>
#include <array>
#include <gtest/gtest.h>
#include <vector>

struct KeccakF1600TestVector {
    std::array<uint64_t, KECCAKF1600_LANES> input;
    std::array<uint64_t, KECCAKF1600_LANES> expected;
};

struct Keccak256TestVector {
    std::string input;
    std::array<uint8_t, KECCAK256_OUTPUT_BYTES> output;
};

// Test vectors generated using the keccak reference implementation (https://github.com/XKCP/XKCP) for testing the
// Keccak-f[1600] permutation.
const std::vector<KeccakF1600TestVector> keccak_f1600_test_vectors = {
    {
        // Test vector 0: input state all zeros
        // input
        {
            0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL,
            0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL,
            0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL,
            0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL,
            0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL,
            0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL,
            0x0000000000000000ULL,
        },
        // expected
        {
            0xf1258f7940e1dde7ULL, 0x84d5ccf933c0478aULL, 0xd598261ea65aa9eeULL, 0xbd1547306f80494dULL,
            0x8b284e056253d057ULL, 0xff97a42d7f8e6fd4ULL, 0x90fee5a0a44647c4ULL, 0x8c5bda0cd6192e76ULL,
            0xad30a6f71b19059cULL, 0x30935ab7d08ffc64ULL, 0xeb5aa93f2317d635ULL, 0xa9a6e6260d712103ULL,
            0x81a57c16dbcf555fULL, 0x43b831cd0347c826ULL, 0x01f22f1a11a5569fULL, 0x05e5635a21d9ae61ULL,
            0x64befef28cc970f2ULL, 0x613670957bc46611ULL, 0xb87c5a554fd00ecbULL, 0x8c3ee88a1ccf32c8ULL,
            0x940c7922ae3a2614ULL, 0x1841f924a2c509e4ULL, 0x16f53526e70465c2ULL, 0x75f644e97f30a13bULL,
            0xeaf1ff7b5ceca249ULL,
        },
    },
    { // Test vector 1: input state all zeros except state[7] = 0x01
      // input
      {
          0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL,
          0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000001ULL,
          0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL,
          0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL,
          0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL,
          0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL, 0x0000000000000000ULL,
          0x0000000000000000ULL,
      },
      // expected
      {
          0xf89fa1b0580a15baULL, 0xd09a0e1fda1679c7ULL, 0x35c3440aa6048cf2ULL, 0x115ec7b0307f2c7eULL,
          0xe93033174ca2f73eULL, 0xfd7ed47fd5d55ec7ULL, 0xe2ebf004ed0a6afeULL, 0x5a202cba857c67ceULL,
          0x7d450ddf1f7fce46ULL, 0x21df2dba060c98c9ULL, 0x563f49c5d4bba6a6ULL, 0xe5aa838dfa9578c3ULL,
          0xdab8f71a22c0aa76ULL, 0x562d3489202a07f5ULL, 0xd07fe4ba0ab87adbULL, 0xece257bfaa08ed0aULL,
          0xe5b2e12fd47b1f72ULL, 0x9b57fac2e804d61dULL, 0xf348aaa3db7cb967ULL, 0xe4c6816eb6efdb4fULL,
          0x07e0b2874d9145faULL, 0xfc862e157895914aULL, 0x46f97e688195e6d6ULL, 0xb14d54e0e18737e1ULL,
          0x6c917bce823be510ULL,
      } },
    { // Test vector 2: input state random
      {
          0xb927c455c848e162ULL, 0x99aab6305b0c67d2ULL, 0x86c82d9206ff9d10ULL, 0xc62e1591b3acb97cULL,
          0xd71eb61789837849ULL, 0x1fcae52e1d26b374ULL, 0x5f73f05bbb082416ULL, 0x1106dcfa15d4b341ULL,
          0xbd1858ca046cca90ULL, 0x3f8b5d62c30ded2dULL, 0x08c41b1679d0e830ULL, 0xa0be02df11a1ea1aULL,
          0xdcf2f941dacba0eaULL, 0x08dc689cf04dadafULL, 0x9de4c75553d27c26ULL, 0xfba269f116eb1fa9ULL,
          0x10a26a79d4dda06eULL, 0xdaa0c44ecce5d0aaULL, 0x01845349df0d7282ULL, 0xeaac21cc0f520303ULL,
          0x040bd46202ffbbcdULL, 0xbebbf2bad6e9c728ULL, 0xadc7181f4d10a5d8ULL, 0x74cc9d08ae6e48daULL,
          0x56f23161f5de8aa9ULL,
      },
      // expected
      { 0x89ecaa6d735e24ffULL, 0x15851a3b6a301aeeULL, 0xe1bc8595b9acf21eULL, 0x319e186ff7ee8bf4ULL,
        0x067037274566661dULL, 0x1982160201e28fcfULL, 0xca244e5297f9467dULL, 0xde2ca967a1fd94f9ULL,
        0x79805a6aa693d2a8ULL, 0x378a7b61abcd5da6ULL, 0xf13f9d48362d6f44ULL, 0x7fd8ca2daeb5ec04ULL,
        0x7ce2588f4928cab2ULL, 0xb0c80460f1abda2bULL, 0x5f7d9e14b9f92a4eULL, 0x8a2c71fb0603a8b3ULL,
        0xe69ac90deb369296ULL, 0x4379ca48a4f4ab70ULL, 0xfe25c7dcc34ad624ULL, 0x9451f94dc25ecd1fULL,
        0x100b88567c225f0aULL, 0xca3baa05c1ab1617ULL, 0x10770385dfd6e43aULL, 0x95a9348911968c9bULL,
        0x748483f6e42a8fecULL } }
};

const std::vector<Keccak256TestVector> keccak256_test_vectors = {
    { "", { 0xC5ULL, 0xD2ULL, 0x46ULL, 0x01ULL, 0x86ULL, 0xF7ULL, 0x23ULL, 0x3CULL, 0x92ULL, 0x7EULL, 0x7DULL,
            0xB2ULL, 0xDCULL, 0xC7ULL, 0x03ULL, 0xC0ULL, 0xE5ULL, 0x00ULL, 0xB6ULL, 0x53ULL, 0xCAULL, 0x82ULL,
            0x27ULL, 0x3BULL, 0x7BULL, 0xFAULL, 0xD8ULL, 0x04ULL, 0x5DULL, 0x85ULL, 0xA4ULL, 0x70ULL } },
    { "abc", { 0x4EULL, 0x03ULL, 0x65ULL, 0x7AULL, 0xEAULL, 0x45ULL, 0xA9ULL, 0x4FULL, 0xC7ULL, 0xD4ULL, 0x7BULL,
               0xA8ULL, 0x26ULL, 0xC8ULL, 0xD6ULL, 0x67ULL, 0xC0ULL, 0xD1ULL, 0xE6ULL, 0xE3ULL, 0x3AULL, 0x64ULL,
               0xA0ULL, 0x36ULL, 0xECULL, 0x44ULL, 0xF5ULL, 0x8FULL, 0xA1ULL, 0x2DULL, 0x6CULL, 0x45ULL } },
};

TEST(misc_keccak, permutation_test)
{
    for (size_t i = 0; i < keccak_f1600_test_vectors.size(); ++i) {
        const auto& test_vec = keccak_f1600_test_vectors[i];

        // Copy input into state array
        std::array<uint64_t, KECCAKF1600_LANES> state;
        std::copy(test_vec.input.begin(), test_vec.input.end(), state.begin());

        // Run the permutation
        ethash_keccakf1600(state.data());

        // Check the output against expected
        for (size_t j = 0; j < KECCAKF1600_LANES; ++j) {
            EXPECT_EQ(state[j], test_vec.expected[j]) << "Mismatch in test vector " << i << " at lane " << j;
        }
    }
}

TEST(misc_keccak, keccak256_test)
{
    for (const auto& v : keccak256_test_vectors) {
        std::vector<uint8_t> input(v.input.begin(), v.input.end());

        keccak256 hash_result = ethash_keccak256(input.data(), input.size());

        for (auto& word : hash_result.word64s) {
            if (is_little_endian()) {
                word = __builtin_bswap64(word);
            }
        }

        std::array<uint8_t, KECCAK256_OUTPUT_BYTES> result;

        for (size_t i = 0; i < KECCAK256_OUTPUT_WORDS; ++i) {
            for (size_t j = 0; j < 8; ++j) {
                uint8_t byte = static_cast<uint8_t>(hash_result.word64s[i] >> (56 - (j * 8)));
                result[i * 8 + j] = byte;
            }
        }

        EXPECT_EQ(result, v.output);
    }
}
