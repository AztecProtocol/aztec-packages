#include "cycle_group_offset_generators.hpp"

#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

#include <gtest/gtest.h>

namespace bb::stdlib {

using OffsetGenerators = cycle_group_offset_generators<curve::Grumpkin>;

// A grown block reuses the generators already held and derives the rest separately; both parts must match a single
// serial derivation.
TEST(CycleGroupOffsetGeneratorsGrowth, GrownBlockMatchesSerialDerivation)
{
    constexpr size_t num_generators = 100;
    const auto expected =
        grumpkin::g1::derive_generators(OffsetGenerators::DOMAIN_SEPARATOR, num_generators, /*starting_index=*/0);

    const OffsetGenerators generators;
    // The first request derives a small block, so the second one grows the store from it.
    const auto held = generators.get(3);
    const auto grown = generators.get(num_generators);

    ASSERT_EQ(grown.size(), num_generators);
    for (size_t i = 0; i < held.size(); ++i) {
        EXPECT_EQ(held[i], expected[i]);
    }
    for (size_t i = 0; i < num_generators; ++i) {
        EXPECT_EQ(grown[i], expected[i]);
    }
}

} // namespace bb::stdlib
