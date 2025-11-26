#include <gtest/gtest.h>

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include "ram_table.hpp"

using namespace bb;

template <typename Builder> class RamTableTests : public ::testing::Test {
  public:
    using field_ct = stdlib::field_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;
    using ram_table_ct = stdlib::ram_table<Builder>;
};
using BuilderTypes = testing::Types<UltraCircuitBuilder, MegaCircuitBuilder>;

namespace {
auto& engine = numeric::get_debug_randomness();
}
STANDARD_TESTING_TAGS

/**
 * @brief Check that Origin Tags within the ram table are propagated correctly (when we lookup an element it has the
 * same tag as the one inserted originally)
 *
 */
TEST(RamTable, TagCorrectness)
{
    using Builder = UltraCircuitBuilder;
    using field_ct = stdlib::field_t<Builder>;
    using witness_ct = stdlib::witness_t<Builder>;
    using ram_table_ct = stdlib::ram_table<Builder>;
    Builder builder;
    std::vector<field_ct> table_values;

    // Generate random witnesses
    field_ct entry_1 = witness_ct(&builder, bb::fr::random_element());
    field_ct entry_2 = witness_ct(&builder, bb::fr::random_element());
    field_ct entry_3 = witness_ct(&builder, bb::fr::random_element());

    // Tag them with 3 different tags
    entry_1.set_origin_tag(submitted_value_origin_tag);
    entry_2.set_origin_tag(challenge_origin_tag);
    // The last tag is an instant death tag, that triggers a runtime failure if any computation happens on the element
    entry_3.set_origin_tag(instant_death_tag);

    table_values.emplace_back(entry_1);
    table_values.emplace_back(entry_2);
    table_values.emplace_back(entry_3);

    // Initialize the table
    ram_table_ct table(table_values);

    // Check that each element has the same tag as original entries
    EXPECT_EQ(table.read(field_ct(0)).get_origin_tag(), submitted_value_origin_tag);
    EXPECT_EQ(table.read(field_ct(witness_ct(&builder, 0))).get_origin_tag(), submitted_value_origin_tag);
    EXPECT_EQ(table.read(field_ct(1)).get_origin_tag(), challenge_origin_tag);
    EXPECT_EQ(table.read(field_ct(witness_ct(&builder, 1))).get_origin_tag(), challenge_origin_tag);

    // Replace one of the elements in the table with a new one
    entry_2.set_origin_tag(next_challenge_tag);
    table.write(field_ct(1), entry_2);

    // Check that the tag has been updated accordingly
    EXPECT_EQ(table.read(field_ct(1)).get_origin_tag(), next_challenge_tag);
    EXPECT_EQ(table.read(field_ct(witness_ct(&builder, 1))).get_origin_tag(), next_challenge_tag);

#ifndef NDEBUG
    // Check that interacting with the poisoned element causes a runtime error
    EXPECT_THROW(table.read(0) + table.read(2), std::runtime_error);
#endif
}

TYPED_TEST_SUITE(RamTableTests, BuilderTypes);

TYPED_TEST(RamTableTests, RamTableInitReadConsistency)
{

    using Builder = TypeParam;
    using field_ct = typename TestFixture::field_ct;
    using witness_ct = typename TestFixture::witness_ct;
    using ram_table_ct = typename TestFixture::ram_table_ct;
    Builder builder;

    std::vector<field_ct> table_values;
    const size_t table_size = 10;
    for (size_t i = 0; i < table_size; ++i) {
        table_values.emplace_back(witness_ct(&builder, bb::fr::random_element()));
    }

    ram_table_ct table(table_values);

    field_ct result(0);
    fr expected(0);

    for (size_t i = 0; i < 10; ++i) {
        field_ct index(witness_ct(&builder, static_cast<uint64_t>(i)));

        if (i % 2 == 0) {
            const auto to_add = table.read(index);
            result += to_add; // variable lookup
        } else {
            const auto to_add = table.read(i); // constant lookup
            result += to_add;
        }
        expected += table_values[i].get_value();
    }

    EXPECT_EQ(result.get_value(), expected);

    bool verified = CircuitChecker::check(builder);
    EXPECT_EQ(verified, true);
}

TYPED_TEST(RamTableTests, RamTableReadWriteConsistency)
{
    using Builder = TypeParam;
    using field_ct = typename TestFixture::field_ct;
    using witness_ct = typename TestFixture::witness_ct;
    using ram_table_ct = typename TestFixture::ram_table_ct;
    Builder builder;
    const size_t table_size = 10;
    const size_t num_reads = 2 * table_size;

    std::vector<fr> table_values(table_size);

    ram_table_ct table(&builder, table_size);

    for (size_t i = 0; i < table_size; ++i) {
        table.write(i, 0);
    }
    field_ct result(0); // tracks a running sum of circuit values to verify correctness of RAM operations
    fr expected(0);     // tracks a running sum of native values to verify correctness of RAM operations
    // lambda that both initializes and updates our table.
    const auto update = [&]() {
        for (size_t i = 0; i < table_size / 2; ++i) {
            table_values[2 * i] = fr::random_element();
            table_values[2 * i + 1] = fr::random_element();

            // init with both constant and variable index values
            table.write(2 * i, table_values[2 * i]);
            table.write(2 * i + 1, witness_ct(&builder, table_values[2 * i + 1]));
        }
    };
    // lambda that reads from our table
    const auto read = [&]() {
        for (size_t i = 0; i < num_reads / 2; ++i) {
            const size_t index_1 = static_cast<size_t>(engine.get_random_uint32() % table_size);
            const size_t index_2 = static_cast<size_t>(engine.get_random_uint32() % table_size);
            // both constant and variable reads
            result += table.read(witness_ct(&builder, index_1));
            result += table.read(index_2);

            expected += table_values[index_1];
            expected += table_values[index_2];
        }
    };

    update();
    read();
    update();
    read();
    update();

    EXPECT_EQ(result.get_value(), expected);

    bool verified = CircuitChecker::check(builder);
    EXPECT_EQ(verified, true);
}
