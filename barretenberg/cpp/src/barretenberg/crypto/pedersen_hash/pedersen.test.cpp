#include "pedersen.hpp"
#include "barretenberg/crypto/generators/generator_data.hpp"
#include "barretenberg/crypto/pedersen_commitment/c_bind.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include <gtest/gtest.h>

namespace bb::crypto {

using bb::fr;

// Verifies the domain-seperated "pedersen_hash_length" generator matches the expected
TEST(Pedersen, DeriveLengthGenerator)
{
    auto generator = pedersen_hash::length_generator;
    std::cout << generator << std::endl;
    EXPECT_EQ(generator,
              grumpkin::g1::affine_element(
                  fr(uint256_t("0x2df8b940e5890e4e1377e05373fae69a1d754f6935e6a780b666947431f2cdcd")),
                  fr(uint256_t("0x2ecd88d15967bc53b885912e0d16866154acb6aac2d3f85e27ca7eefb2c19083"))));
}

// Verifies that hashing {1, 1} produces the expected result
TEST(Pedersen, Hash)
{
    auto x = pedersen_hash::Fq::one();
    auto r = pedersen_hash::hash({ x, x });
    EXPECT_EQ(r, fr(uint256_t("07ebfbf4df29888c6cd6dca13d4bb9d1a923013ddbbcbdc3378ab8845463297b")));
}

// Verifies that hashing {1, 1} with a generator-offset/context variant produces the expected result
TEST(Pedersen, HashWithIndex)
{
    auto x = pedersen_hash::Fq::one();
    auto r = pedersen_hash::hash({ x, x }, 5);
    EXPECT_EQ(r, fr(uint256_t("1c446df60816b897cda124524e6b03f36df0cec333fad87617aab70d7861daa6")));
}

// Verifies that hashing a 32-byte buffer is equivalent to hashing two field elements via the intended chaining
TEST(Pedersen, Hash32Bytes)
{
    using Fq = pedersen_hash::Fq;

    std::vector<uint8_t> buf(32);
    for (size_t i = 0; i < buf.size(); ++i) {
        buf[i] = static_cast<uint8_t>(0xA0 + i);
    }

    // First 31-byte chunk
    uint256_t acc0(0);
    for (size_t i = 0; i < 31; ++i) {
        acc0 = (acc0 << uint256_t(8));
        acc0 += uint256_t(buf[i]);
    }
    Fq element0(acc0);

    // Last 1-byte chunk
    uint256_t acc1(0);
    acc1 = (acc1 << uint256_t(8));
    acc1 += uint256_t(buf[31]);
    Fq element1(acc1);

    // For exactly 2 elements, hash_buffer should equal hash({element0, element1})
    auto expected = pedersen_hash::hash({ element0, element1 });
    auto got = pedersen_hash::hash_buffer(buf);

    EXPECT_EQ(got, expected);
}

} // namespace bb::crypto
