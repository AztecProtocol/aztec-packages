
#include <array>
#include <gtest/gtest.h>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include "twin_rom_table.hpp"

using namespace bb;

template <typename Builder> class TwinRomTableTests : public ::testing::Test {
  public:
    using field_ct = stdlib::field_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;
    using twin_rom_table_ct = stdlib::twin_rom_table<Builder>;
    using field_pair_ct = std::array<field_ct, 2>;
};
using BuilderTypes = testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;
namespace {
auto& engine = numeric::get_debug_randomness();
}
STANDARD_TESTING_TAGS

/**
 * @brief Check the correctness of tag propagation within the twin rom tables
 *
 */
TEST(TwinRomTable, TagCorrectness)
{
    using Builder = UltraCircuitBuilder;
    using field_ct = stdlib::field_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;
    using twin_rom_table_ct = stdlib::twin_rom_table<Builder>;
    using field_pair_ct = std::array<field_ct, 2>;
    Builder builder;
    std::vector<field_pair_ct> table_values;

    // Create random entries
    field_ct entry_1 = witness_ct(&builder, bb::fr::random_element());
    field_ct entry_2 = witness_ct(&builder, bb::fr::random_element());
    field_ct entry_3 = witness_ct(&builder, bb::fr::random_element());
    field_ct entry_4 = witness_ct(&builder, bb::fr::random_element());

    // Assign different standard tags to them
    entry_1.set_origin_tag(submitted_value_origin_tag);
    entry_2.set_origin_tag(challenge_origin_tag);
    entry_3.set_origin_tag(next_challenge_tag);
    // The last one is "poisoned" (calculating with this element should result in runtime error)
    entry_4.set_origin_tag(instant_death_tag);

    // Form entries in the twin table
    table_values.emplace_back(field_pair_ct{ entry_1, entry_2 });
    table_values.emplace_back(field_pair_ct{ entry_3, entry_4 });

    // Initialize the table
    twin_rom_table_ct table(table_values);

    // Check that the tags in positions [0][0], [0][1], [1][0] are preserved
    EXPECT_EQ(table[field_ct(witness_ct(&builder, 0))][0].get_origin_tag(), submitted_value_origin_tag);
    EXPECT_EQ(table[field_ct(witness_ct(&builder, 0))][1].get_origin_tag(), challenge_origin_tag);
    EXPECT_EQ(table[field_ct(1)][0].get_origin_tag(), next_challenge_tag);

#ifndef NDEBUG
    // Check that working with position [1][1] in debug causes "instant death"
    EXPECT_THROW(table[1][1] + 1, std::runtime_error);
#endif
}
TYPED_TEST_SUITE(TwinRomTableTests, BuilderTypes);
/**
 * @brief tests basic functionality, as well as the number of gates added per ROM read (not including the
 * finalization/processing): one gate per variable lookup, zero gates per constant lookup.
 */
TYPED_TEST(TwinRomTableTests, ReadWriteConsistency)
{
    using Builder = TypeParam;
    using field_ct = typename TestFixture::field_ct;
    using witness_ct = typename TestFixture::witness_ct;
    using twin_rom_table_ct = typename TestFixture::twin_rom_table_ct;
    using field_pair_ct = typename TestFixture::field_pair_ct;

    Builder builder;

    std::vector<field_pair_ct> table_values;
    const size_t table_size = 10;
    // Generate random witness pairs to put in the table
    for (size_t i = 0; i < table_size; ++i) {
        table_values.emplace_back(field_pair_ct{ witness_ct(&builder, bb::fr::random_element()),
                                                 witness_ct(&builder, bb::fr::random_element()) });
    }

    // Initialize the table
    twin_rom_table_ct table(table_values);

    field_pair_ct result{ field_ct(0), field_ct(0) };
    std::array<fr, 2> expected{ 0, 0 };

    // Go through the cycle of accessing all entries
    for (size_t i = 0; i < table_size; ++i) {

        if (i % 2 == 0) {
            field_ct index(witness_ct(&builder, (uint64_t)i));
            const auto before_n = builder.num_gates();
            // Get the entry from the table
            const auto to_add = table[index];
            const auto after_n = builder.num_gates();
            // should cost 1 gates (the ROM read adds 1 extra gate when the proving key is constructed)
            // (but not for 1st entry, the 1st ROM read also builts the ROM table, which will cost table_size * 2 gates)
            if (i != 0) {
                EXPECT_EQ(after_n - before_n, 1ULL);
            }
            // Accumulate each of the positions in the result
            result[0] += to_add[0]; // variable lookup
            result[1] += to_add[1]; // variable lookup
        } else {
            const auto before_n = builder.num_gates();
            const auto to_add = table[i]; // constant lookup
            const auto after_n = builder.num_gates();
            // should cost 0 gates. Constant lookups are free
            EXPECT_EQ(after_n - before_n, 0ULL);
            result[0] += to_add[0];
            result[1] += to_add[1];
        }
        // Accumulate original values
        auto expected_values = table_values[i];
        expected[0] += expected_values[0].get_value();
        expected[1] += expected_values[1].get_value();
    }

    // Check that the sum of the original values is the same as the sum of the ones received from the TwinRomTable
    // primitive
    EXPECT_EQ(result[0].get_value(), expected[0]);
    EXPECT_EQ(result[1].get_value(), expected[1]);

    bool verified = CircuitChecker::check(builder);
    EXPECT_EQ(verified, true);
}
