#include "rom_table.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/transcript/origin_tag.hpp"

#include <gtest/gtest.h>
using namespace bb;

template <typename Builder> class RomTableTests : public ::testing::Test {
  public:
    using field_ct = stdlib::field_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;
    using rom_table_ct = stdlib::rom_table<Builder>;
};
using BuilderTypes = testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;
namespace {
auto& engine = numeric::get_debug_randomness();
}
STANDARD_TESTING_TAGS

/**
 * @brief Ensure the tags of elements initializing the ROM table are correctly propagated
 *
 */
TEST(RomTable, TagCorrectness)
{
    using Builder = UltraCircuitBuilder;
    using field_ct = stdlib::field_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;
    using rom_table_ct = stdlib::rom_table<Builder>;
    Builder builder;
    std::vector<field_ct> table_values;
    // Create random witness elements
    field_ct entry_1 = witness_ct(&builder, bb::fr::random_element());
    field_ct entry_2 = witness_ct(&builder, bb::fr::random_element());
    field_ct entry_3 = witness_ct(&builder, bb::fr::random_element());

    // Tag all 3 with different tags
    entry_1.set_origin_tag(submitted_value_origin_tag);
    entry_2.set_origin_tag(challenge_origin_tag);
    // The last one is "poisoned" (calculating with this element should result in runtime error)
    entry_3.set_origin_tag(instant_death_tag);

    table_values.emplace_back(entry_1);
    table_values.emplace_back(entry_2);
    table_values.emplace_back(entry_3);

    // Initialize the table with them
    rom_table_ct table(table_values);

    // Check that the tags of the first two are preserved
    EXPECT_EQ(table[field_ct(witness_ct(&builder, 0))].get_origin_tag(), submitted_value_origin_tag);
    EXPECT_EQ(table[field_ct(witness_ct(&builder, 1))].get_origin_tag(), challenge_origin_tag);

#ifndef NDEBUG
    // Check that computing the sum with the last once crashes the program
    EXPECT_THROW(table[0] + table[2], std::runtime_error);
#endif
}

TYPED_TEST_SUITE(RomTableTests, BuilderTypes);
// tests basic functionality, as well as the number of gates added per ROM read (not including the
// finalization/processing): one gate per variable lookup, zero gates per constant lookup.
TYPED_TEST(RomTableTests, RomTableReadWriteConsistency)
{
    using Builder = TypeParam;
    using field_ct = typename TestFixture::field_ct;
    using witness_ct = typename TestFixture::witness_ct;
    using rom_table_ct = typename TestFixture::rom_table_ct;

    Builder builder;

    const size_t table_size = 10;
    std::vector<field_ct> table_values;
    for (size_t i = 0; i < table_size; ++i) {
        table_values.emplace_back(witness_ct(&builder, bb::fr::random_element()));
    }

    rom_table_ct table(table_values);

    field_ct result(0);
    fr expected(0);

    for (size_t i = 0; i < table_size; ++i) {
        // if `i` is even, do a variable lookup (i.e., the index witness is _not constant_), if `i` is odd, do a
        // constant lookup.
        if (i % 2 == 0) {
            field_ct index(witness_ct(&builder, static_cast<uint64_t>(i)));
            const auto before_n = builder.num_gates();
            const auto to_add = table[index];
            const auto after_n = builder.num_gates();
            // should cost 1 gate (the ROM read adds 1 extra gate when the proving key is constructed, i.e., before
            // finalization), but not for first entry, the first ROM read also builts the ROM table, which will cost
            // table_size * 2 gates.
            if (i != 0) {
                EXPECT_EQ(after_n - before_n, 1ULL);
            }
            result += to_add; // variable lookup
        } else {
            const auto before_n = builder.num_gates();
            const auto to_add = table[i]; // constant lookup
            const auto after_n = builder.num_gates();
            // should cost 0 gates. Constant lookups are free
            EXPECT_EQ(after_n - before_n, 0ULL);
            result += to_add;
        }
        expected += table_values[i].get_value();
    }

    EXPECT_EQ(result.get_value(), expected);
    EXPECT_EQ(CircuitChecker::check(builder), true);
}
// tests that copying the ROM table works as expected.
TYPED_TEST(RomTableTests, RomCopy)
{
    using Builder = TypeParam;
    using field_ct = typename TestFixture::field_ct;
    using witness_ct = typename TestFixture::witness_ct;
    using rom_table_ct = typename TestFixture::rom_table_ct;

    Builder builder;

    std::vector<field_ct> table_values;
    const size_t table_size = 5;
    for (size_t i = 0; i < table_size; ++i) {
        table_values.emplace_back(witness_ct(&builder, bb::fr::random_element()));
    }

    rom_table_ct table(table_values);
    const auto copied_rom_table = table;
    field_ct result(0);
    fr expected(0);

    for (size_t i = 0; i < table_size; ++i) {

        field_ct index(witness_ct(&builder, static_cast<uint64_t>(i)));
        const auto to_add = (i % 2 == 0) ? copied_rom_table[index] : table[index];
        result += to_add;
        expected += table_values[i].get_value();
    }
    EXPECT_EQ(result.get_value(), expected);

    bool verified = CircuitChecker::check(builder);
    EXPECT_EQ(verified, true);
}
