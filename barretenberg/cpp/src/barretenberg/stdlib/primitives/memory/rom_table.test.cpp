
#include <gtest/gtest.h>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include "rom_table.hpp"

using namespace bb;

// Defining ultra-specific types for local testing.
using Builder = UltraCircuitBuilder;
using field_ct = stdlib::field_t<Builder>;
using witness_ct = stdlib::witness_t<Builder>;
using rom_table_ct = stdlib::rom_table<Builder>;

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

TEST(RomTable, RomTableReadWriteConsistency)
{
    Builder builder;

    std::vector<field_ct> table_values;
    const size_t table_size = 10;
    for (size_t i = 0; i < table_size; ++i) {
        table_values.emplace_back(witness_ct(&builder, bb::fr::random_element()));
    }

    rom_table_ct table(table_values);

    field_ct result(0);
    fr expected(0);

    for (size_t i = 0; i < 10; ++i) {
        field_ct index(witness_ct(&builder, (uint64_t)i));

        if (i % 2 == 0) {
            const auto before_n = builder.num_gates;
            const auto to_add = table[index];
            const auto after_n = builder.num_gates;
            // should cost 1 gates (the ROM read adds 1 extra gate when the proving key is constructed)
            // (but not for 1st entry, the 1st ROM read also builts the ROM table, which will cost table_size * 2 gates)
            if (i != 0) {
                EXPECT_EQ(after_n - before_n, 1ULL);
            }
            result += to_add; // variable lookup
        } else {
            const auto before_n = builder.num_gates;
            const auto to_add = table[i]; // constant lookup
            const auto after_n = builder.num_gates;
            // should cost 0 gates. Constant lookups are free
            EXPECT_EQ(after_n - before_n, 0ULL);
            result += to_add;
        }
        expected += table_values[i].get_value();
    }

    EXPECT_EQ(result.get_value(), expected);

    bool verified = CircuitChecker::check(builder);
    EXPECT_EQ(verified, true);
}
