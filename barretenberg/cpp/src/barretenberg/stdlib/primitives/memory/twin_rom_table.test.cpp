
#include <array>
#include <gtest/gtest.h>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include "twin_rom_table.hpp"

using namespace bb;

// Defining ultra-specific types for local testing.
using Builder = UltraCircuitBuilder;
using field_ct = stdlib::field_t<Builder>;
using witness_ct = stdlib::witness_t<Builder>;
using twin_rom_table_ct = stdlib::twin_rom_table<Builder>;
using field_pair_ct = std::array<field_ct, 2>;

namespace {
auto& engine = numeric::get_debug_randomness();
}
STANDARD_TESTING_TAGS

TEST(TwinRomTable, TagCorrectness)
{

    Builder builder;
    std::vector<field_pair_ct> table_values;
    field_ct entry_1 = witness_ct(&builder, bb::fr::random_element());
    field_ct entry_2 = witness_ct(&builder, bb::fr::random_element());
    field_ct entry_3 = witness_ct(&builder, bb::fr::random_element());
    field_ct entry_4 = witness_ct(&builder, bb::fr::random_element());

    entry_1.set_origin_tag(submitted_value_origin_tag);
    entry_2.set_origin_tag(challenge_origin_tag);
    entry_3.set_origin_tag(next_challenge_tag);
    entry_4.set_origin_tag(instant_death_tag);
    table_values.emplace_back(field_pair_ct{ entry_1, entry_2 });
    table_values.emplace_back(field_pair_ct{ entry_3, entry_4 });

    twin_rom_table_ct table(table_values);

    EXPECT_EQ(table[field_ct(0)][0].get_origin_tag(), submitted_value_origin_tag);
    EXPECT_EQ(table[field_ct(witness_ct(&builder, 0))][1].get_origin_tag(), challenge_origin_tag);

    EXPECT_EQ(table[field_ct(1)][0].get_origin_tag(), next_challenge_tag);

#ifndef NDEBUG
    EXPECT_THROW(table[1][1] + 1, std::runtime_error);
#endif
}

TEST(TwinRomTable, ReadWriteConsistency)
{
    Builder builder;

    std::vector<field_pair_ct> table_values;
    const size_t table_size = 10;
    for (size_t i = 0; i < table_size; ++i) {
        table_values.emplace_back(field_pair_ct{ witness_ct(&builder, bb::fr::random_element()),
                                                 witness_ct(&builder, bb::fr::random_element()) });
    }

    twin_rom_table_ct table(table_values);

    field_pair_ct result{ field_ct(0), field_ct(0) };
    std::array<fr, 2> expected{ 0, 0 };

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
            result[0] += to_add[0]; // variable lookup
            result[1] += to_add[1]; // variable lookup
        } else {
            const auto before_n = builder.num_gates;
            const auto to_add = table[i]; // constant lookup
            const auto after_n = builder.num_gates;
            // should cost 0 gates. Constant lookups are free
            EXPECT_EQ(after_n - before_n, 0ULL);
            result[0] += to_add[0];
            result[1] += to_add[1];
        }
        auto expected_values = table_values[i];
        expected[0] += expected_values[0].get_value();
        expected[1] += expected_values[1].get_value();
    }

    EXPECT_EQ(result[0].get_value(), expected[0]);
    EXPECT_EQ(result[1].get_value(), expected[1]);

    bool verified = CircuitChecker::check(builder);
    EXPECT_EQ(verified, true);
}
