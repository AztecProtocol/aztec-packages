#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/assert.hpp"

#include <cstdint>
#include <gtest/gtest.h>
#include <sstream>
#include <string>
#include <vector>

namespace {

std::vector<uint8_t> make_length_prefix(uint32_t size)
{
    std::vector<uint8_t> buffer(sizeof(uint32_t));
    uint8_t* ptr = buffer.data();
    serialize::write(ptr, size);
    return buffer;
}

std::istringstream make_input_stream(const std::vector<uint8_t>& buffer)
{
    return std::istringstream(std::string(reinterpret_cast<const char*>(buffer.data()), buffer.size()));
}

} // namespace

TEST(Serialize, RejectsOversizedByteVectorFromRawBuffer)
{
    auto buffer = make_length_prefix(static_cast<uint32_t>(serialize::MAX_SERIALIZED_VECTOR_BYTES + 1));
    const uint8_t* ptr = buffer.data();
    std::vector<uint8_t> value;

    EXPECT_THROW_WITH_MESSAGE(std::read(ptr, value), "Serialized vector length");
    EXPECT_TRUE(value.empty());
}

TEST(Serialize, RejectsOversizedByteVectorFromStream)
{
    auto buffer = make_length_prefix(static_cast<uint32_t>(serialize::MAX_SERIALIZED_VECTOR_BYTES + 1));
    auto input = make_input_stream(buffer);
    std::vector<uint8_t> value;

    EXPECT_THROW_WITH_MESSAGE(std::read(input, value), "Serialized vector length");
    EXPECT_TRUE(value.empty());
}

TEST(Serialize, RejectsOversizedGenericVectorFromRawBuffer)
{
    auto buffer =
        make_length_prefix(static_cast<uint32_t>((serialize::MAX_SERIALIZED_VECTOR_BYTES / sizeof(uint32_t)) + 1));
    const uint8_t* ptr = buffer.data();
    std::vector<uint32_t> value;

    EXPECT_THROW_WITH_MESSAGE(std::read(ptr, value), "Serialized vector length");
    EXPECT_TRUE(value.empty());
}

TEST(Serialize, RejectsOversizedGenericVectorFromStream)
{
    auto buffer =
        make_length_prefix(static_cast<uint32_t>((serialize::MAX_SERIALIZED_VECTOR_BYTES / sizeof(uint32_t)) + 1));
    auto input = make_input_stream(buffer);
    std::vector<uint32_t> value;

    EXPECT_THROW_WITH_MESSAGE(std::read(input, value), "Serialized vector length");
    EXPECT_TRUE(value.empty());
}
