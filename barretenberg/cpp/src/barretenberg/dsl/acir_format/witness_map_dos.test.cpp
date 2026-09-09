// Regression tests for the witness-index cap in `witness_map_to_witness_vector`.
// Without it, a crafted `WitnessMap{{Witness{UINT32_MAX}, ...}}` forces ~2^32 `fr`
// allocations (~137 GB) via the gap-fill loop.

#include <gtest/gtest.h>
#include <vector>

#include "acir_to_constraint_buf.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "serde/witness_stack.hpp"

using namespace acir_format;

class WitnessMapDoSTest : public ::testing::Test {};

static std::vector<uint8_t> encoded_zero_fr()
{
    std::vector<uint8_t> buf(32, 0);
    return buf;
}

TEST_F(WitnessMapDoSTest, RejectsUint32MaxWitnessIndex)
{
    Witnesses::WitnessMap witness_map;
    witness_map.value.emplace(Witnesses::Witness{ UINT32_MAX }, encoded_zero_fr());

    EXPECT_THROW_WITH_MESSAGE(witness_map_to_witness_vector(witness_map), "exceeds the maximum allowed");
}

TEST_F(WitnessMapDoSTest, RejectsIndexJustOverCap)
{
    // Mirrors the file-local constant in acir_to_constraint_buf.cpp; keep in sync.
    constexpr uint32_t MAX_WITNESS_INDEX = 1U << 28;

    Witnesses::WitnessMap witness_map;
    witness_map.value.emplace(Witnesses::Witness{ MAX_WITNESS_INDEX + 1U }, encoded_zero_fr());

    EXPECT_THROW_WITH_MESSAGE(witness_map_to_witness_vector(witness_map), "exceeds the maximum allowed");
}

TEST_F(WitnessMapDoSTest, AcceptsRealisticIndex)
{
    Witnesses::WitnessMap witness_map;
    witness_map.value.emplace(Witnesses::Witness{ 0U }, encoded_zero_fr());
    witness_map.value.emplace(Witnesses::Witness{ 5U }, encoded_zero_fr());
    witness_map.value.emplace(Witnesses::Witness{ 1023U }, encoded_zero_fr());

    auto witness_vector = witness_map_to_witness_vector(witness_map);
    EXPECT_EQ(witness_vector.size(), 1024U);
}

TEST_F(WitnessMapDoSTest, AcceptsEmptyMap)
{
    Witnesses::WitnessMap witness_map;
    auto witness_vector = witness_map_to_witness_vector(witness_map);
    EXPECT_EQ(witness_vector.size(), 0U);
}
