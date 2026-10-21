#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/assert.hpp"
#include <gtest/gtest.h>
#include <sstream>

TEST(BinarySerialization, RejectsOversizedVectorsBeforeAllocation)
{
    const std::vector<uint8_t> oversized_length{ 255, 255, 255, 255 };

    ASSERT_THROW_OR_ABORT(from_buffer<std::vector<uint8_t>>(oversized_length),
                          "Serialized vector exceeds maximum allocation");
    ASSERT_THROW_OR_ABORT(from_buffer<std::vector<uint32_t>>(oversized_length),
                          "Serialized vector exceeds maximum allocation");

    std::istringstream stream(std::string(oversized_length.begin(), oversized_length.end()));
    std::vector<uint8_t> decoded;
    ASSERT_THROW_OR_ABORT(read(stream, decoded), "Serialized vector exceeds maximum allocation");
}

TEST(BinarySerialization, VectorRoundTrip)
{
    const std::vector<uint32_t> original{ 1, 2, 3 };
    EXPECT_EQ(from_buffer<std::vector<uint32_t>>(to_buffer<true>(original)), original);
}
