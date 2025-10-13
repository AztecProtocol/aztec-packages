// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "fixed_base.hpp"
#include "barretenberg/crypto/pedersen_hash/pedersen.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <gtest/gtest.h>

namespace bb::plookup::fixed_base {

class FixedBaseTableTest : public ::testing::Test {
  protected:
    using affine_element = grumpkin::g1::affine_element;
    using element = grumpkin::g1::element;
    using fr = grumpkin::fr;
};

/**
 * @brief Test that generator points are correctly initialized and have the expected relationships.
 *
 * This test verifies:
 * - LHS and RHS generator points are valid curve points
 * - LHS and RHS generators are distinct
 * - The "lo" base points are identical to their respective generators
 * - The "hi" base points are correctly computed as lo * 2^128 for handling the high bits of scalars
 */
TEST_F(FixedBaseTableTest, GeneratorPointsAndBasePointRelationships)
{
    const auto lhs_gen = table::lhs_generator_point();
    const auto rhs_gen = table::rhs_generator_point();

    const auto lhs_lo = table::lhs_base_point_lo();
    const auto lhs_hi = table::lhs_base_point_hi();
    const auto rhs_lo = table::rhs_base_point_lo();
    const auto rhs_hi = table::rhs_base_point_hi();

    // Both generators must be valid points on the Grumpkin curve
    EXPECT_TRUE(lhs_gen.on_curve());
    EXPECT_TRUE(rhs_gen.on_curve());

    // LHS and RHS generators must be different points
    EXPECT_NE(lhs_gen, rhs_gen);

    // The "lo" base points (for the low 128 bits of the scalar) should be the same as the generators themselves
    EXPECT_EQ(lhs_lo, lhs_gen);
    EXPECT_EQ(rhs_lo, rhs_gen);

    // The "hi" base points should be the "lo" points multiplied by 2^128
    EXPECT_EQ(lhs_hi, affine_element(element(lhs_lo) * table::MAX_LO_SCALAR));
    EXPECT_EQ(rhs_hi, affine_element(element(rhs_lo) * table::MAX_LO_SCALAR));
}

/**
 * @brief Test that single lookup tables are generated correctly with the expected point progression.
 *
 * A lookup table contains precomputed multiples of a base point: [offset, offset + base, offset + 2*base, ...]
 * This allows efficient scalar multiplication by table lookup instead of repeated point additions.
 * The offset generator ensures table entries are never the point at infinity.e.
 */
TEST_F(FixedBaseTableTest, LookupTableGenerationCorrectness)
{
    const auto base_point = table::lhs_generator_point();
    const auto offset_gen = grumpkin::g1::affine_one;
    const auto lookup_table = table::generate_single_lookup_table(base_point, offset_gen);

    // Table should have exactly MAX_TABLE_SIZE (512) entries for 9-bit lookups
    EXPECT_EQ(lookup_table.size(), table::MAX_TABLE_SIZE);

    // Verify every entry follows the pattern: table[i] = offset_gen + i * base_point
    // This allows us to compute k * base_point by looking up table[k] and subtracting offset_gen
    for (size_t i = 0; i < lookup_table.size(); ++i) {
        element expected = element(offset_gen) + element(base_point) * i;
        EXPECT_EQ(lookup_table[i], affine_element(expected));

        // Every point in the table must be a valid curve point
        EXPECT_TRUE(lookup_table[i].on_curve());
    }
}

/**
 * @brief Test the complete multi-table structure and verify offset generators are computed correctly.
 *
 * The fixed-base scalar multiplication system uses 4 multi-tables:
 * - LHS_LO: 15 tables of 9 bits each for the low 128 bits of left scalars (last table uses only 2 bits)
 * - LHS_HI: 14 tables of 9 bits each for the high 126 bits of left scalars
 * - RHS_LO: 15 tables of 9 bits each for the low 128 bits of right scalars (last table uses only 2 bits)
 * - RHS_HI: 14 tables of 9 bits each for the high 126 bits of right scalars
 *
 * Each multi-table has an offset generator that ensures no table entries are the point at infinity.
 */
TEST_F(FixedBaseTableTest, MultiTableStructureAndOffsets)
{
    const auto& all_tables = table::fixed_base_tables();
    const auto& offset_gens = table::fixed_base_table_offset_generators();

    // We should have exactly 4 multi-tables: LHS_LO, LHS_HI, RHS_LO, RHS_HI
    EXPECT_EQ(all_tables.size(), table::NUM_FIXED_BASE_MULTI_TABLES);

    // LO multi-tables have 15 sub-tables (14 full 9-bit tables + 1 partial 2-bit table)
    EXPECT_EQ(all_tables[0].size(), table::NUM_TABLES_PER_LO_MULTITABLE); // LHS_LO
    EXPECT_EQ(all_tables[2].size(), table::NUM_TABLES_PER_LO_MULTITABLE); // RHS_LO

    // HI multi-tables have 14 sub-tables (all full 9-bit tables)
    EXPECT_EQ(all_tables[1].size(), table::NUM_TABLES_PER_HI_MULTITABLE); // LHS_HI
    EXPECT_EQ(all_tables[3].size(), table::NUM_TABLES_PER_HI_MULTITABLE); // RHS_HI

    // Verify that every sub-table has the correct size and contains valid curve points
    // Note: Even partial tables allocate full MAX_TABLE_SIZE for consistency
    for (const auto& multi_table : all_tables) {
        for (const auto& sub_table : multi_table) {
            EXPECT_EQ(sub_table.size(), table::MAX_TABLE_SIZE);

            // Every point in every table must be a valid curve point
            for (const auto& point : sub_table) {
                EXPECT_TRUE(point.on_curve());
            }
        }
    }

    // There should be one offset generator per multi-table
    EXPECT_EQ(offset_gens.size(), table::NUM_FIXED_BASE_MULTI_TABLES);

    // Each offset generator should match what compute_generator_offset produces
    EXPECT_EQ(offset_gens[0], table::compute_generator_offset<table::BITS_PER_LO_SCALAR>(table::lhs_base_point_lo()));
    EXPECT_EQ(offset_gens[1], table::compute_generator_offset<table::BITS_PER_HI_SCALAR>(table::lhs_base_point_hi()));
    EXPECT_EQ(offset_gens[2], table::compute_generator_offset<table::BITS_PER_LO_SCALAR>(table::rhs_base_point_lo()));
    EXPECT_EQ(offset_gens[3], table::compute_generator_offset<table::BITS_PER_HI_SCALAR>(table::rhs_base_point_hi()));

    // Verify that get_generator_offset_for_table_id returns the correct offset for each multi-table ID
    EXPECT_EQ(table::get_generator_offset_for_table_id(FIXED_BASE_LEFT_LO), offset_gens[0]);
    EXPECT_EQ(table::get_generator_offset_for_table_id(FIXED_BASE_LEFT_HI), offset_gens[1]);
    EXPECT_EQ(table::get_generator_offset_for_table_id(FIXED_BASE_RIGHT_LO), offset_gens[2]);
    EXPECT_EQ(table::get_generator_offset_for_table_id(FIXED_BASE_RIGHT_HI), offset_gens[3]);
}

/**
 * @brief Test the generation of basic lookup tables and multi-tables, verifying value retrieval functions.
 *
 * Multi-tables combine multiple basic tables to handle multi-scalar multiplication efficiently.
 * This test ensures that both table types are constructed correctly and that their lookup
 * functions return the expected values.
 */
TEST_F(FixedBaseTableTest, TableGenerationAndValueRetrieval)
{
    // Generate a basic table for the first LHS_LO sub-table
    auto basic_table =
        table::generate_basic_fixed_base_table<0>(FIXED_BASE_0_0, /*basic_table_index=*/0, /*table_index=*/0);

    // The lookup function should be properly initialized
    EXPECT_NE(basic_table.get_values_from_key, nullptr);

    // Column 1 should contain sequential indices from 0 to MAX_TABLE_SIZE-1
    // These indices correspond to the scalar values being looked up
    for (size_t i = 0; i < basic_table.column_1.size(); ++i) {
        EXPECT_EQ(basic_table.column_1[i], bb::fr(i));
    }

    // Test that value retrieval works correctly for various indices
    // The key format is {index, 0} where the second element is unused for fixed base tables
    for (size_t test_idx : { size_t(0), size_t(5), size_t(100), table::MAX_TABLE_SIZE - 1 }) {
        std::array<uint64_t, 2> test_key = { test_idx, 0 };
        auto values = basic_table.get_values_from_key(test_key);

        // The returned values should be the x and y coordinates at the given index
        EXPECT_EQ(values[0], basic_table.column_2[test_idx]); // x-coordinate
        EXPECT_EQ(values[1], basic_table.column_3[test_idx]); // y-coordinate
    }

    // Test multi-table generation for the LHS_LO multi-table
    auto multi_table = table::get_fixed_base_table<0, table::BITS_PER_LO_SCALAR>(FIXED_BASE_LEFT_LO);

    // Verify the multi-table has the correct ID and number of sub-tables
    EXPECT_EQ(multi_table.id, FIXED_BASE_LEFT_LO);
    EXPECT_EQ(multi_table.basic_table_ids.size(), table::NUM_TABLES_PER_LO_MULTITABLE);
    EXPECT_EQ(multi_table.get_table_values.size(), table::NUM_TABLES_PER_LO_MULTITABLE);

    // Each sub-table should have a valid lookup function and the correct slice size
    // Even the last table (which only uses 2 bits) reports MAX_TABLE_SIZE for consistency
    for (size_t i = 0; i < multi_table.get_table_values.size(); ++i) {
        EXPECT_NE(multi_table.get_table_values[i], nullptr);
        EXPECT_EQ(multi_table.slice_sizes[i], table::MAX_TABLE_SIZE);
    }
}

/**
 * @brief Test that partial tables (using fewer than 9 bits) are handled correctly.
 *
 * When splitting a 254-bit scalar into 9-bit chunks, the last chunk may have fewer bits.
 * For 128-bit LO scalars: 14 tables × 9 bits + 1 table × 2 bits = 128 bits
 * For 126-bit HI scalars: 14 tables × 9 bits = 126 bits (evenly divisible)
 *
 * This test verifies that the last LO table only allocates space for 4 entries (2^2)
 * while the last HI table uses the full 512 entries (2^9).
 */
TEST_F(FixedBaseTableTest, PartialTableHandling)
{
    // E.g. the last table in LHS_LO handles only 2 bits, so it should have 2^2 = 4 entries
    size_t last_table_idx_lo = table::NUM_TABLES_PER_LO_MULTITABLE - 1;
    auto basic_table = table::generate_basic_fixed_base_table</*multitable_index=*/0>(
        static_cast<BasicTableId>(FIXED_BASE_0_0 + last_table_idx_lo), last_table_idx_lo, last_table_idx_lo);
    EXPECT_EQ(basic_table.column_1.size(), 4);

    // The last table in LHS_HI handles a full 9 bits, so it should have 2^9 = 512 entries
    // 126 bits divides evenly by 9, so all HI tables are full-sized
    size_t last_table_idx_hi = table::NUM_TABLES_PER_HI_MULTITABLE - 1;
    auto hi_basic_table = table::generate_basic_fixed_base_table<1>(
        static_cast<BasicTableId>(FIXED_BASE_1_0 + last_table_idx_hi), last_table_idx_hi, last_table_idx_hi);
    EXPECT_EQ(hi_basic_table.column_1.size(), table::MAX_TABLE_SIZE);
}

} // namespace bb::plookup::fixed_base
