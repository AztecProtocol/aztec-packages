#include "barretenberg/honk/composer/composer_lib.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/srs/factories/crs_factory.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <array>
#include <gtest/gtest.h>

using namespace bb;

class ComposerLibTests : public ::testing::Test {
  public:
    using Flavor = UltraFlavor;
    using FF = typename Flavor::FF;

  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

/**
 * @brief A test to demonstrate that lookup read counts/tags are computed correctly for a simple 'hand-computable' case
 * using the uint32 XOR table
 *
 */
TEST_F(ComposerLibTests, LookupReadCounts)
{
    using Builder = UltraCircuitBuilder;
    using Flavor = UltraFlavor;
    using FF = typename Flavor::FF;
    using Polynomial = typename Flavor::Polynomial;
    auto UINT32_XOR = plookup::MultiTableId::UINT32_XOR;

    Builder builder;

    // define some very simply inputs to XOR
    FF left{ 1 };
    FF right{ 5 };

    auto left_idx = builder.add_variable(left);
    auto right_idx = builder.add_variable(right);

    // create a single lookup from the uint32 XOR table
    auto accumulators = plookup::get_lookup_accumulators(UINT32_XOR, left, right, /*is_2_to_1_lookup*/ true);
    builder.create_gates_from_plookup_accumulators(UINT32_XOR, accumulators, left_idx, right_idx);

    EXPECT_EQ(builder.lookup_tables.size(), 2);       // we only used two tables, first for 6 bits, second for 2 bits
    EXPECT_EQ(builder.lookup_tables[0].size(), 4096); // first table has size 64*64 (6 bit operands)
    EXPECT_EQ(builder.lookup_tables[1].size(), 16);   // first table has size 4*4 (2 bit operands)

    size_t circuit_size = 8192;

    Polynomial read_counts{ circuit_size };
    Polynomial read_tags{ circuit_size };

    construct_lookup_read_counts<Flavor>(read_counts, read_tags, builder, circuit_size);

    // The table polys are constructed at the bottom of the trace, thus so to are the counts/tags
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1033): construct tables and counts at top of trace
    size_t offset = builder.blocks.lookup.trace_offset;

    // The uint32 XOR lookup table is constructed for 6 bit operands via double for loop that iterates through the left
    // operand externally (0 to 63) then the right operand internally (0 to 63). Computing (1 XOR 5) will thus result in
    // 1 lookup from the (1*64 + 5)th index in the table and 4 lookups from the (0*64 + 0)th index (for the remaining 4
    // 6-bits limbs  that are all 0) and one lookup from second table from the (64 * 64 + 0) index (for last 2 bits).
    // The counts and tags at all other indices should be zero.
    for (auto [idx, count, tag] : zip_polys(read_counts, read_tags)) {
        if (idx == (0 + offset)) {
            EXPECT_EQ(count, 4);
            EXPECT_EQ(tag, 1);
        } else if (idx == (69 + offset)) {
            EXPECT_EQ(count, 1);
            EXPECT_EQ(tag, 1);
        } else if (idx == (64 * 64 + offset)) {
            EXPECT_EQ(count, 1);
            EXPECT_EQ(tag, 1);
        } else {
            EXPECT_EQ(count, 0);
            EXPECT_EQ(tag, 0);
        }
        idx++;
    }
}
