#include "barretenberg/plonk_honk_shared/composer/composer_lib.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/slab_allocator.hpp"
#include "barretenberg/plonk_honk_shared/types/circuit_type.hpp"
#include "barretenberg/srs/factories/crs_factory.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"

// #include "barretenberg/common/serialize.hpp"
// #include "barretenberg/ecc/curves/bn254/fr.hpp"
// #include "barretenberg/numeric/uint256/uint256.hpp"
// #include "barretenberg/plonk_honk_shared/library/grand_product_delta.hpp"
// #include "barretenberg/relations/permutation_relation.hpp"
// #include "barretenberg/relations/relation_parameters.hpp"
// #include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
// #include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp"
// #include "barretenberg/stdlib_circuit_builders/plookup_tables/types.hpp"
// #include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
// #include "barretenberg/sumcheck/sumcheck_round.hpp"
// #include "barretenberg/ultra_honk/ultra_prover.hpp"
// #include "barretenberg/ultra_honk/ultra_verifier.hpp"

#include <array>
#include <gtest/gtest.h>

using namespace bb;

class ComposerLibTests : public ::testing::Test {
  public:
    using Flavor = UltraFlavor;
    using FF = typename Flavor::FF;
    // Flavor::CircuitBuilder circuit_constructor;
    // Flavor::ProvingKey proving_key = []() {
    //     auto crs_factory = srs::factories::CrsFactory<bb::curve::BN254>();
    //     auto crs = crs_factory.get_prover_crs(4);
    //     return Flavor::ProvingKey(/*circuit_size=*/8, /*num_public_inputs=*/0);
    // }();
  protected:
    static void SetUpTestSuite() { bb::srs::init_crs_factory("../srs_db/ignition"); }
};

TEST_F(ComposerLibTests, LookupReadCounts)
{
    using Builder = UltraCircuitBuilder;
    using Flavor = UltraFlavor;
    using FF = typename Flavor::FF;
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

    // UltraProver prover(builder);
    auto read_counts = construct_lookup_read_counts<Flavor>(builder, circuit_size);
    // info("circuit_size = ", prover.instance->proving_key.circuit_size);

    size_t idx = 0;
    for (auto& val : read_counts) {
        if (val != 0) {
            info("idx = ", idx);
            info(val);
        }
        ++idx;
    }

    EXPECT_EQ(read_counts[0], 5);
    EXPECT_EQ(read_counts[64 + 5], 1);
}