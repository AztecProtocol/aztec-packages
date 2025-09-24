// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "fixed_base.hpp"
#include "barretenberg/crypto/pedersen_hash/pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <gtest/gtest.h>
#include <set>

namespace bb::plookup::fixed_base {

class FixedBaseTableTest : public ::testing::Test {
  protected:
    using affine_element = grumpkin::g1::affine_element;
    using element = grumpkin::g1::element;
    using fr = grumpkin::fr;

    void SetUp() override {}
};

/**
 * @brief Test that the generator points are properly initialized and distinct
 */
TEST_F(FixedBaseTableTest, GeneratorPointsAreValid)
{
    const auto lhs_gen = table::lhs_generator_point();
    const auto rhs_gen = table::rhs_generator_point();

    // Check that generators are on the curve
    EXPECT_TRUE(lhs_gen.on_curve());
    EXPECT_TRUE(rhs_gen.on_curve());

    // Check that generators are distinct
    EXPECT_NE(lhs_gen, rhs_gen);

    // Check that hi/lo base points are correctly computed
    const auto lhs_lo = table::lhs_base_point_lo();
    const auto lhs_hi = table::lhs_base_point_hi();
    const auto rhs_lo = table::rhs_base_point_lo();
    const auto rhs_hi = table::rhs_base_point_hi();

    EXPECT_EQ(lhs_lo, lhs_gen);
    EXPECT_EQ(rhs_lo, rhs_gen);

    // Verify that hi points are lo points multiplied by 2^128
    element expected_lhs_hi = element(lhs_lo) * table::MAX_LO_SCALAR;
    element expected_rhs_hi = element(rhs_lo) * table::MAX_LO_SCALAR;

    EXPECT_EQ(lhs_hi, affine_element(expected_lhs_hi));
    EXPECT_EQ(rhs_hi, affine_element(expected_rhs_hi));
}

/**
 * @brief Test single lookup table generation
 */
TEST_F(FixedBaseTableTest, SingleLookupTableGeneration)
{
    const auto base_point = table::lhs_generator_point();
    const auto offset_gen = grumpkin::g1::affine_one;

    const auto lookup_table = table::generate_single_lookup_table(base_point, offset_gen);

    // Check table size
    EXPECT_EQ(lookup_table.size(), table::MAX_TABLE_SIZE);

    // Verify all entries in a single loop:
    // - Check the pattern: table[i] = offset_gen + i * base_point
    // - Check that all entries are on the curve
    for (size_t i = 0; i < lookup_table.size(); ++i) {
        element expected = element(offset_gen) + element(base_point) * i;
        EXPECT_EQ(lookup_table[i], affine_element(expected));
        EXPECT_TRUE(lookup_table[i].on_curve());
    }
}

/**
 * @brief Test that generated tables have the correct structure
 */
TEST_F(FixedBaseTableTest, MultiTableStructure)
{
    const auto& all_tables = table::fixed_base_tables();

    // Check we have 4 multi-tables
    EXPECT_EQ(all_tables.size(), table::NUM_FIXED_BASE_MULTI_TABLES);

    // Check table 0 (LHS_LO): should have 15 sub-tables
    EXPECT_EQ(all_tables[0].size(), table::NUM_TABLES_PER_LO_MULTITABLE);

    // Check table 1 (LHS_HI): should have 14 sub-tables
    EXPECT_EQ(all_tables[1].size(), table::NUM_TABLES_PER_HI_MULTITABLE);

    // Check table 2 (RHS_LO): should have 15 sub-tables
    EXPECT_EQ(all_tables[2].size(), table::NUM_TABLES_PER_LO_MULTITABLE);

    // Check table 3 (RHS_HI): should have 14 sub-tables
    EXPECT_EQ(all_tables[3].size(), table::NUM_TABLES_PER_HI_MULTITABLE);

    // Verify each sub-table has MAX_TABLE_SIZE entries
    for (const auto& multi_table : all_tables) {
        for (const auto& sub_table : multi_table) {
            EXPECT_EQ(sub_table.size(), table::MAX_TABLE_SIZE);

            // Verify all points are on the curve
            for (const auto& point : sub_table) {
                EXPECT_TRUE(point.on_curve());
            }
        }
    }
}

/**
 * @brief Test that offset generators are properly computed
 */
TEST_F(FixedBaseTableTest, OffsetGeneratorComputation)
{
    const auto& offset_gens = table::fixed_base_table_offset_generators();

    // Should have 4 offset generators
    EXPECT_EQ(offset_gens.size(), table::NUM_FIXED_BASE_MULTI_TABLES);

    // All offset generators should be on the curve
    for (const auto& gen : offset_gens) {
        EXPECT_TRUE(gen.on_curve());
    }

    // Offset generators should be distinct
    std::set<affine_element> unique_gens(offset_gens.begin(), offset_gens.end());
    EXPECT_EQ(unique_gens.size(), offset_gens.size());

    // Verify offset generators match what's computed from generate_generator_offset
    auto lhs_lo_offset = table::generate_generator_offset<table::BITS_PER_LO_SCALAR>(table::lhs_base_point_lo());
    auto lhs_hi_offset = table::generate_generator_offset<table::BITS_PER_HI_SCALAR>(table::lhs_base_point_hi());
    auto rhs_lo_offset = table::generate_generator_offset<table::BITS_PER_LO_SCALAR>(table::rhs_base_point_lo());
    auto rhs_hi_offset = table::generate_generator_offset<table::BITS_PER_HI_SCALAR>(table::rhs_base_point_hi());

    EXPECT_EQ(offset_gens[0], lhs_lo_offset);
    EXPECT_EQ(offset_gens[1], lhs_hi_offset);
    EXPECT_EQ(offset_gens[2], rhs_lo_offset);
    EXPECT_EQ(offset_gens[3], rhs_hi_offset);
}

/**
 * @brief Test get_generator_offset_for_table_id function
 */
// AUDITTODO: make this test checlk that the total offset matches the sum of the individual offsets
TEST_F(FixedBaseTableTest, GetGeneratorOffsetForTableId)
{
    const auto& offset_gens = table::fixed_base_table_offset_generators();

    // Test each valid table ID
    EXPECT_EQ(table::get_generator_offset_for_table_id(FIXED_BASE_LEFT_LO), offset_gens[0]);
    EXPECT_EQ(table::get_generator_offset_for_table_id(FIXED_BASE_LEFT_HI), offset_gens[1]);
    EXPECT_EQ(table::get_generator_offset_for_table_id(FIXED_BASE_RIGHT_LO), offset_gens[2]);
    EXPECT_EQ(table::get_generator_offset_for_table_id(FIXED_BASE_RIGHT_HI), offset_gens[3]);

    // Test invalid table ID triggers assertion
    // BB_ASSERT_EQ throws an exception, so we use EXPECT_THROW instead of EXPECT_DEATH
    EXPECT_THROW(table::get_generator_offset_for_table_id(SHA256_CH_INPUT), std::runtime_error);
}

/**
 * @brief Test that basic table generation works correctly
 */
TEST_F(FixedBaseTableTest, BasicTableGeneration)
{
    // Generate a basic table for the first LHS_LO table
    auto basic_table = table::generate_basic_fixed_base_table<0>(FIXED_BASE_0_0, 0, 0);

    // Check basic properties
    EXPECT_EQ(basic_table.id, FIXED_BASE_0_0);
    EXPECT_EQ(basic_table.table_index, 0);
    EXPECT_FALSE(basic_table.use_twin_keys);

    // Check table size
    EXPECT_EQ(basic_table.column_1.size(), table::MAX_TABLE_SIZE);
    EXPECT_EQ(basic_table.column_2.size(), table::MAX_TABLE_SIZE);
    EXPECT_EQ(basic_table.column_3.size(), table::MAX_TABLE_SIZE);

    // Check column 1 contains indices
    for (size_t i = 0; i < basic_table.column_1.size(); ++i) {
        EXPECT_EQ(basic_table.column_1[i], bb::fr(i));
    }

    // Check that get_values_from_key is not null
    EXPECT_NE(basic_table.get_values_from_key, nullptr);

    // Test the function pointer works
    std::array<uint64_t, 2> test_key = { 5, 0 };
    auto values = basic_table.get_values_from_key(test_key);
    EXPECT_EQ(values[0], basic_table.column_2[5]);
    EXPECT_EQ(values[1], basic_table.column_3[5]);
}

/**
 * @brief Test multi-table generation
 */
TEST_F(FixedBaseTableTest, MultiTableGeneration)
{
    // Generate multi-table for LHS_LO
    auto multi_table = table::get_fixed_base_table<0, table::BITS_PER_LO_SCALAR>(FIXED_BASE_LEFT_LO);

    // Check basic properties
    EXPECT_EQ(multi_table.id, FIXED_BASE_LEFT_LO);
    EXPECT_EQ(multi_table.basic_table_ids.size(), table::NUM_TABLES_PER_LO_MULTITABLE);
    EXPECT_EQ(multi_table.get_table_values.size(), table::NUM_TABLES_PER_LO_MULTITABLE);

    // Check that all function pointers are set
    for (const auto& func_ptr : multi_table.get_table_values) {
        EXPECT_NE(func_ptr, nullptr);
    }

    // Check slice sizes
    for (const auto& slice_size : multi_table.slice_sizes) {
        EXPECT_EQ(slice_size, table::MAX_TABLE_SIZE);
    }
}

/**
 * @brief Test edge cases in table indexing
 */
TEST_F(FixedBaseTableTest, TableIndexingEdgeCases)
{
    const auto& all_tables = table::fixed_base_tables();

    // Test the last entry in each table
    for (size_t multi_idx = 0; multi_idx < all_tables.size(); ++multi_idx) {
        const auto& multi_table = all_tables[multi_idx];
        for (size_t table_idx = 0; table_idx < multi_table.size(); ++table_idx) {
            const auto& sub_table = multi_table[table_idx];

            // Last entry should be on curve
            EXPECT_TRUE(sub_table.back().on_curve());

            // Test get_basic_fixed_base_table_values for boundary values
            if (multi_idx == 0 && table_idx == 0) {
                std::array<uint64_t, 2> key = { table::MAX_TABLE_SIZE - 1, 0 };
                auto values = table::get_basic_fixed_base_table_values<0, 0>(key);
                EXPECT_EQ(values[0], sub_table.back().x);
                EXPECT_EQ(values[1], sub_table.back().y);
            }
        }
    }
}

/**
 * @brief Test that the smaller tables (for high bits) are handled correctly
 */
TEST_F(FixedBaseTableTest, SmallerTableHandling)
{
    // Check the last table in LO multitables (should only need 2 bits)
    // BITS_PER_LO_SCALAR = 128, BITS_PER_TABLE = 9
    // 128 / 9 = 14 full tables + 1 partial table
    // Last table covers: 128 - 14*9 = 128 - 126 = 2 bits
    {
        const size_t lo_bits = table::BITS_PER_LO_SCALAR;
        const size_t num_lo_tables = table::NUM_TABLES_PER_LO_MULTITABLE;
        EXPECT_EQ(num_lo_tables, 15);

        const size_t last_table_bits = lo_bits - (num_lo_tables - 1) * table::BITS_PER_TABLE;
        EXPECT_EQ(last_table_bits, 2);

        // The storage has MAX_TABLE_SIZE entries, but only 4 should be needed
        const auto& all_tables = table::fixed_base_tables();
        const auto& last_lo_table = all_tables[0][num_lo_tables - 1];
        EXPECT_EQ(last_lo_table.size(), table::MAX_TABLE_SIZE); // Storage is full size

        // But when used in BasicTable, it should only reference 4 entries
        auto basic_table = table::generate_basic_fixed_base_table<0>(
            static_cast<BasicTableId>(FIXED_BASE_0_0 + num_lo_tables - 1), num_lo_tables - 1, num_lo_tables - 1);
        EXPECT_EQ(basic_table.column_1.size(), 4); // Only 4 entries used
    }

    // Check HI multitables (all tables are full size)
    // BITS_PER_HI_SCALAR = 126, BITS_PER_TABLE = 9
    // 126 / 9 = 14 tables, last table covers 126 - 13*9 = 9 bits (full table)
    {
        const size_t hi_bits = table::BITS_PER_HI_SCALAR;
        const size_t num_hi_tables = table::NUM_TABLES_PER_HI_MULTITABLE;
        EXPECT_EQ(num_hi_tables, 14);

        const size_t last_table_bits = hi_bits - (num_hi_tables - 1) * table::BITS_PER_TABLE;
        EXPECT_EQ(last_table_bits, 9); // Full table

        auto basic_table = table::generate_basic_fixed_base_table<1>(
            static_cast<BasicTableId>(FIXED_BASE_1_0 + num_hi_tables - 1), num_hi_tables - 1, num_hi_tables - 1);
        EXPECT_EQ(basic_table.column_1.size(), table::MAX_TABLE_SIZE); // Full size used
    }
}

} // namespace bb::plookup::fixed_base
