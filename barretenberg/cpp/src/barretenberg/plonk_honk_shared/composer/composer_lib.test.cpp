#include "barretenberg/plonk_honk_shared/composer/composer_lib.hpp"
#include "barretenberg/srs/factories/crs_factory.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"

#include <array>
#include <gtest/gtest.h>

using namespace bb;

class ComposerLibTests : public ::testing::Test {
  public:
    using Flavor = UltraFlavor;
    using FF = typename Flavor::FF;

  protected:
    static void SetUpTestSuite() { bb::srs::init_crs_factory("../srs_db/ignition"); }
};

TEST_F(ComposerLibTests, LookupReadCounts)
{
    using Builder = UltraCircuitBuilder;
    using Flavor = UltraFlavor;
    using FF = typename Flavor::FF;
    using Polynomial = typename Flavor::Polynomial;
    Builder builder;

    uint256_t left_val = 1 & 0xffffffffULL;
    uint256_t right_val = 5 & 0xffffffffULL;
    // uint256_t left_val = 25251 & 0xffffffffULL;
    // uint256_t right_val = 2831092109228376 & 0xffffffffULL;

    FF left{ left_val };
    FF right{ right_val };
    auto left_idx = builder.add_variable(left);
    auto right_idx = builder.add_variable(right);

    auto accumulators =
        plookup::get_lookup_accumulators(plookup::MultiTableId::UINT32_XOR, left, right, /*is_2_to_1_lookup*/ true);
    info("num accumulators = ", accumulators.columns[0].size());

    builder.create_gates_from_plookup_accumulators(
        plookup::MultiTableId::UINT32_XOR, accumulators, left_idx, right_idx);

    info("num tables = ", builder.lookup_tables.size());
    info("num lookups = ", builder.lookup_tables[0].lookup_gates.size());

    size_t circuit_size = 8192;

    Polynomial read_counts{ circuit_size };
    Polynomial read_tags{ circuit_size };

    construct_lookup_read_counts<Flavor>(read_counts, read_tags, builder, circuit_size);

    // size_t idx = 0;
    // for (auto& val : read_counts) {
    //     if (val != 0) {
    //         info("idx = ", idx);
    //         info(val);
    //     }
    //     ++idx;
    // }

    // The table polys are constructed at the bottom of the trace, thus so to are the counts/tags
    size_t offset = circuit_size - builder.get_tables_size();

    size_t idx = 0;
    for (auto [count, tag] : zip_view(read_counts, read_tags)) {
        if (idx == (0 + offset)) {
            EXPECT_EQ(count, 5);
            EXPECT_EQ(tag, 1);
        } else if (idx == (69 + offset)) {
            EXPECT_EQ(count, 1);
            EXPECT_EQ(tag, 1);
        } else {
            EXPECT_EQ(count, 0);
            EXPECT_EQ(tag, 0);
        }
        idx++;
    }
}