#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include <gtest/gtest.h>

using namespace bb;

TEST(APIFileIO, ManyFromBufferExactRejectsTrailingBytes)
{
    std::vector<uint8_t> bytes(sizeof(uint256_t) + 1, 0);

    EXPECT_THROW_WITH_MESSAGE((many_from_buffer_exact<uint256_t>(bytes, "UltraHonk proof file")),
                              "UltraHonk proof file size must be a multiple of 32 bytes, got 33");
}

TEST(APIFileIO, ManyFromBufferExactAcceptsAlignedBuffers)
{
    std::vector<uint256_t> expected{ uint256_t(1), uint256_t(2) };
    auto bytes = to_buffer(expected);

    auto parsed = many_from_buffer_exact<uint256_t>(bytes, "UltraHonk proof file");

    EXPECT_EQ(parsed, expected);
}
