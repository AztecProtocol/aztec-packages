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

TEST(APIFileIO, WriteReadRoundTripPreservesBinaryBytes)
{
    // 0x1A is the text-mode EOF marker on Windows, and text mode rewrites 0x0A and 0x0D 0x0A.
    std::vector<uint8_t> data{ 0x00, 0x1A, 0x0A, 0x0D, 0x0A, 0x0D, 0xFF, 0x1A, 0x0A };
    auto path = (std::filesystem::temp_directory_path() / "bb_file_io_binary_round_trip.bin").string();

    write_file(path, data);
    // get_file_size opens in binary mode, so this catches write-side expansion on its own.
    EXPECT_EQ(get_file_size(path), data.size());
    EXPECT_EQ(read_file(path), data);

    std::filesystem::remove(path);
}
