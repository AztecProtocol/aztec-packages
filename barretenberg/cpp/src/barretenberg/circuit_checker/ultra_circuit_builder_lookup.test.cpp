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
TEST_F(UltraCircuitBuilderLookup, ValidLookupPassesCheck)
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

// Verifies that step size coefficients are set correctly for non-last and last gates
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

    // Sanity check: unused selectors are set to 0
    for (size_t i = 0; i < num_lookups; ++i) {
        EXPECT_EQ(builder.blocks.lookup.q_1()[i], fr(0));
        EXPECT_EQ(builder.blocks.lookup.q_4()[i], fr(0));
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

    // Construct tables, using table_id1 twice
    auto& table1 = builder.get_table(table_id1);
    auto& table2 = builder.get_table(table_id2);
    auto& table1_again = builder.get_table(table_id1);
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

// Verifies that the table index is correctly stored in q_3 selector
TEST_F(UltraCircuitBuilderLookup, TableIndexInQ3)
{
    Builder builder;

    const fr a_value(11);
    const fr b_value(22);
    const auto a_idx = builder.add_variable(a_value);
    const auto b_idx = builder.add_variable(b_value);

    // UINT32_XOR uses multiple BasicTables (6-bit for first 5 lookups, 2-bit for last)
    const auto accumulators =
        plookup::get_lookup_accumulators(plookup::MultiTableId::UINT32_XOR, a_value, b_value, true);
    builder.create_gates_from_plookup_accumulators(plookup::MultiTableId::UINT32_XOR, accumulators, a_idx, b_idx);

    const auto& multi_table = plookup::get_multitable(plookup::MultiTableId::UINT32_XOR);
    const size_t num_lookups = multi_table.basic_table_ids.size();

    // Check that q_3 contains the correct table index for each gate
    for (size_t i = 0; i < num_lookups; ++i) {
        const auto& table = builder.get_table(multi_table.basic_table_ids[i]);
        EXPECT_EQ(builder.blocks.lookup.q_3()[i], fr(table.table_index));
    }

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

// Verifies that invalid accumulator values cause circuit check to fail
TEST_F(UltraCircuitBuilderLookup, InvalidAccumulatorsFailCheck)
{
    Builder builder;

    const fr a_value(123);
    const fr b_value(456);
    const auto a_idx = builder.add_variable(a_value);
    const auto b_idx = builder.add_variable(b_value);

    // Get valid accumulators
    auto accumulators = plookup::get_lookup_accumulators(plookup::MultiTableId::UINT32_XOR, a_value, b_value, true);

    // Corrupt an accumulator value
    accumulators[ColumnIdx::C3][0] = fr(999999); // Invalid output value

    builder.create_gates_from_plookup_accumulators(plookup::MultiTableId::UINT32_XOR, accumulators, a_idx, b_idx);

    // Circuit should fail because accumulators don't match the table
    EXPECT_FALSE(CircuitChecker::check(builder));
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

// Verifies that multiple BasicTables are used correctly in a single operation (UINT32_XOR uses both 6-bit and 2-bit)
TEST_F(UltraCircuitBuilderLookup, MultipleBasicTables)
{
    Builder builder;

    const fr a_value(0x12345678);
    const fr b_value(0xABCDEF00);
    const auto a_idx = builder.add_variable(a_value);
    const auto b_idx = builder.add_variable(b_value);

    const auto accumulators =
        plookup::get_lookup_accumulators(plookup::MultiTableId::UINT32_XOR, a_value, b_value, true);
    builder.create_gates_from_plookup_accumulators(plookup::MultiTableId::UINT32_XOR, accumulators, a_idx, b_idx);

    // UINT32_XOR should use two different BasicTable types:
    // - UINT_XOR_SLICE_6_ROTATE_0 for first 5 lookups (30 bits)
    // - UINT_XOR_SLICE_2_ROTATE_0 for last lookup (2 bits)

    const auto& multi_table = plookup::get_multitable(plookup::MultiTableId::UINT32_XOR);
    EXPECT_EQ(multi_table.basic_table_ids.size(), 6UL);

    // First 5 should be 6-bit tables
    for (size_t i = 0; i < 5; ++i) {
        EXPECT_EQ(multi_table.basic_table_ids[i], plookup::BasicTableId::UINT_XOR_SLICE_6_ROTATE_0);
    }

    // Last should be 2-bit table
    EXPECT_EQ(multi_table.basic_table_ids[5], plookup::BasicTableId::UINT_XOR_SLICE_2_ROTATE_0);

    // Both tables should exist in the builder
    auto& table_6bit = builder.get_table(plookup::BasicTableId::UINT_XOR_SLICE_6_ROTATE_0);
    auto& table_2bit = builder.get_table(plookup::BasicTableId::UINT_XOR_SLICE_2_ROTATE_0);

    EXPECT_NE(table_6bit.table_index, table_2bit.table_index);

    EXPECT_TRUE(CircuitChecker::check(builder));
}
