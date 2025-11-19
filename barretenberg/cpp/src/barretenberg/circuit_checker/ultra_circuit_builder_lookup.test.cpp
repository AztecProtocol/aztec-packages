#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/plookup_tables.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>
#include <unordered_map>

using namespace bb;

class UltraCircuitBuilderLookup : public ::testing::Test {
  protected:
    using Builder = UltraCircuitBuilder;
    using ColumnIdx = plookup::ColumnIdx;
};

// Verifies that a valid lookup operation creates the expected number of gates and passes circuit check
TEST_F(UltraCircuitBuilderLookup, BasicLookup)
{
    Builder builder;

    // UINT32_XOR decomposes into 6 lookups: five 6-bit tables, one 2-bit table
    const fr a_value(42);
    const fr b_value(17);
    const auto a_idx = builder.add_variable(a_value);
    const auto b_idx = builder.add_variable(b_value);

    const auto accumulators =
        plookup::get_lookup_accumulators(plookup::MultiTableId::UINT32_XOR, a_value, b_value, true);
    const auto result =
        builder.create_gates_from_plookup_accumulators(plookup::MultiTableId::UINT32_XOR, accumulators, a_idx, b_idx);

    // First lookup should reuse input indices
    EXPECT_EQ(result[ColumnIdx::C1][0], a_idx);
    EXPECT_EQ(result[ColumnIdx::C2][0], b_idx);

    // Check builder state
    EXPECT_EQ(result[ColumnIdx::C1].size(), 6UL);
    EXPECT_EQ(result[ColumnIdx::C2].size(), 6UL);
    EXPECT_EQ(result[ColumnIdx::C3].size(), 6UL);
    EXPECT_EQ(builder.blocks.lookup.size(), 6UL);

    // Check circuit satisfaction
    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that step size coefficients are set correctly for each gate in a multi-table lookup
TEST_F(UltraCircuitBuilderLookup, StepSizeCoefficients)
{
    Builder builder;

    const fr a_value(7);
    const fr b_value(14);
    const auto a_idx = builder.add_variable(a_value);
    const auto b_idx = builder.add_variable(b_value);

    const auto accumulators =
        plookup::get_lookup_accumulators(plookup::MultiTableId::UINT32_XOR, a_value, b_value, true);
    builder.create_gates_from_plookup_accumulators(plookup::MultiTableId::UINT32_XOR, accumulators, a_idx, b_idx);

    const auto& multi_table = plookup::get_multitable(plookup::MultiTableId::UINT32_XOR);
    const size_t num_lookups = multi_table.column_1_step_sizes.size();

    // Check that step sizes have been populated correctly in the the corresponding selectors
    for (size_t i = 0; i < num_lookups - 1; ++i) {
        EXPECT_EQ(builder.blocks.lookup.q_2()[i], -multi_table.column_1_step_sizes[i + 1]);
        EXPECT_EQ(builder.blocks.lookup.q_m()[i], -multi_table.column_2_step_sizes[i + 1]);
        EXPECT_EQ(builder.blocks.lookup.q_c()[i], -multi_table.column_3_step_sizes[i + 1]);
    }

    // Check last gate has zero step sizes
    const size_t last_idx = num_lookups - 1;
    EXPECT_EQ(builder.blocks.lookup.q_2()[last_idx], fr(0));
    EXPECT_EQ(builder.blocks.lookup.q_m()[last_idx], fr(0));
    EXPECT_EQ(builder.blocks.lookup.q_c()[last_idx], fr(0));

    // Check that remaining selectors are set correctly
    for (size_t i = 0; i < num_lookups; ++i) {
        const auto& table = builder.get_table(multi_table.basic_table_ids[i]);
        EXPECT_EQ(builder.blocks.lookup.q_3()[i], fr(table.table_index)); // unique table identifier
        EXPECT_EQ(builder.blocks.lookup.q_lookup()[i], fr(1));            // gate selector should be "on"
        EXPECT_EQ(builder.blocks.lookup.q_1()[i], fr(0));                 // unused in lookup gates
        EXPECT_EQ(builder.blocks.lookup.q_4()[i], fr(0));                 // unused in lookup gates
    }

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that different tables get unique indices
TEST_F(UltraCircuitBuilderLookup, DifferentTablesGetUniqueIndices)
{
    Builder builder;

    // Specify three different table IDs
    const auto table_id1 = plookup::BasicTableId::UINT_XOR_SLICE_6_ROTATE_0;
    const auto table_id2 = plookup::BasicTableId::UINT_XOR_SLICE_2_ROTATE_0;
    const auto table_id3 = plookup::BasicTableId::UINT_AND_SLICE_6_ROTATE_0;

    // Construct four tables, three unique and one duplicate
    auto& table1 = builder.get_table(table_id1);
    auto& table2 = builder.get_table(table_id2);
    auto& table1_again = builder.get_table(table_id1); // duplicate of table1
    auto& table3 = builder.get_table(table_id3);

    // table1 and table1_again should be the same reference
    EXPECT_EQ(&table1, &table1_again);

    // Table IDs should be set correctly
    EXPECT_EQ(table1.id, table_id1);
    EXPECT_EQ(table2.id, table_id2);
    EXPECT_EQ(table1_again.id, table_id1);
    EXPECT_EQ(table3.id, table_id3);

    // Tables should have `table_index` based on order of creation
    EXPECT_EQ(table1.table_index, 0UL);
    EXPECT_EQ(table2.table_index, 1UL);
    EXPECT_EQ(table1_again.table_index, 0UL);
    EXPECT_EQ(table3.table_index, 2UL);

    // Exactly three different tables should have been created
    EXPECT_EQ(builder.get_num_lookup_tables(), 3UL);
}

// Verifies correct behavior when key_b_index is not provided (2-to-1 lookup without second index)
TEST_F(UltraCircuitBuilderLookup, NoKeyBIndex)
{
    Builder builder;

    // HONK_DUMMY_MULTI is a 2-to-1 lookup (two keys, one result)
    // Tables only contain entries for values 0 and 1 (base = 1 << 1)
    const fr a_value(1);
    const fr b_value(0);
    const auto a_idx = builder.add_variable(a_value);
    // Not providing b_idx - it will be created from accumulators

    const auto accumulators =
        plookup::get_lookup_accumulators(plookup::MultiTableId::HONK_DUMMY_MULTI, a_value, b_value, true);
    const auto result = builder.create_gates_from_plookup_accumulators(
        plookup::MultiTableId::HONK_DUMMY_MULTI, accumulators, a_idx, std::nullopt);

    // First lookup should reuse a_idx for C1
    EXPECT_EQ(result[ColumnIdx::C1][0], a_idx);

    // C2 and C3 should be newly created variables
    EXPECT_NE(result[ColumnIdx::C2][0], a_idx);
    EXPECT_NE(result[ColumnIdx::C3][0], a_idx);

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that lookup entries are recorded in the table's lookup_gates vector
TEST_F(UltraCircuitBuilderLookup, LookupEntriesRecorded)
{
    Builder builder;

    const fr a_value(33);
    const fr b_value(44);
    const auto a_idx = builder.add_variable(a_value);
    const auto b_idx = builder.add_variable(b_value);

    const auto accumulators =
        plookup::get_lookup_accumulators(plookup::MultiTableId::UINT32_XOR, a_value, b_value, true);

    const auto& multi_table = plookup::get_multitable(plookup::MultiTableId::UINT32_XOR);

    // Get unique table IDs and record their initial sizes
    // Note: UINT32_XOR uses UINT_XOR_SLICE_6_ROTATE_0 five times and UINT_XOR_SLICE_2_ROTATE_0 once
    std::unordered_map<plookup::BasicTableId, size_t> initial_sizes;
    std::unordered_map<plookup::BasicTableId, size_t> expected_additions;

    for (const auto& table_id : multi_table.basic_table_ids) {
        if (initial_sizes.find(table_id) == initial_sizes.end()) {
            auto& table = builder.get_table(table_id);
            initial_sizes[table_id] = table.lookup_gates.size();
            expected_additions[table_id] = 0;
        }
        expected_additions[table_id]++;
    }

    builder.create_gates_from_plookup_accumulators(plookup::MultiTableId::UINT32_XOR, accumulators, a_idx, b_idx);

    // Check that each unique table received the correct number of new lookup entries
    for (const auto& [table_id, initial_size] : initial_sizes) {
        auto& table = builder.get_table(table_id);
        EXPECT_EQ(table.lookup_gates.size(), initial_size + expected_additions[table_id]);
    }

    EXPECT_TRUE(CircuitChecker::check(builder));
}

// Verifies that corrupting any accumulator position in any column causes circuit check to fail
TEST_F(UltraCircuitBuilderLookup, BadAccumulatorFaiure)
{
    auto test_corrupt_accumulator = [](ColumnIdx column, size_t position) {
        Builder builder;

        const fr a_value(123);
        const fr b_value(456);
        const auto a_idx = builder.add_variable(a_value);
        const auto b_idx = builder.add_variable(b_value);

        // Get valid accumulators
        auto accumulators = plookup::get_lookup_accumulators(plookup::MultiTableId::UINT32_XOR, a_value, b_value, true);

        // Corrupt the specified accumulator entry
        accumulators[column][position] += fr(1);

        builder.create_gates_from_plookup_accumulators(plookup::MultiTableId::UINT32_XOR, accumulators, a_idx, b_idx);

        // Circuit should fail because the corrupted accumulator doesn't match the table
        EXPECT_FALSE(CircuitChecker::check(builder));
    };

    // UINT32_XOR has 6 lookups (five 6-bit tables, one 2-bit table)
    const size_t num_lookups = 6;

    // Test corrupting each position in each column
    for (size_t i = 0; i < num_lookups; ++i) {
        // Note: C1[0] and C2[0] are not tested because the first lookup gate reuses the existing
        // witness indices (key_a_index and key_b_index) rather than creating new witnesses from
        // accumulators[C1][0] and accumulators[C2][0]
        if (i > 0) {
            test_corrupt_accumulator(ColumnIdx::C1, i);
            test_corrupt_accumulator(ColumnIdx::C2, i);
        }
        // C3 is always created from accumulators, so test all positions
        test_corrupt_accumulator(ColumnIdx::C3, i);
    }
}

// Verifies that invalid input witness values (C1[0] and C2[0]) cause circuit check to fail
TEST_F(UltraCircuitBuilderLookup, InvalidInputWitnessFailure)
{
    const fr a_value(123);
    const fr b_value(456);

    // Compute accumulators based on the genuine values
    const auto accumulators =
        plookup::get_lookup_accumulators(plookup::MultiTableId::UINT32_XOR, a_value, b_value, true);

    // Test with wrong witness value for key_a (first input, reused as C1[0])
    {
        Builder builder;

        // Create witness with bad value for first input
        const fr bad_a_value(666);
        const auto bad_a_idx = builder.add_variable(bad_a_value);
        const auto b_idx = builder.add_variable(b_value);

        builder.create_gates_from_plookup_accumulators(
            plookup::MultiTableId::UINT32_XOR, accumulators, bad_a_idx, b_idx);

        // Circuit should fail because witness at a_idx doesn't match what accumulators expect
        EXPECT_FALSE(CircuitChecker::check(builder));
    }

    // Test with wrong witness value for key_b (second input, reused as C2[0])
    {
        Builder builder;

        // Create witness with bad value for second input
        const fr bad_b_value(666);
        const auto a_idx = builder.add_variable(a_value);
        const auto bad_b_idx = builder.add_variable(bad_b_value);

        builder.create_gates_from_plookup_accumulators(
            plookup::MultiTableId::UINT32_XOR, accumulators, a_idx, bad_b_idx);

        // Circuit should fail because witness at b_idx doesn't match what accumulators expect
        EXPECT_FALSE(CircuitChecker::check(builder));
    }
}
