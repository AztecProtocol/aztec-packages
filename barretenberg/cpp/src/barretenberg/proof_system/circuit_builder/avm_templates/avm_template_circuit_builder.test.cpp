#include "avm_template_circuit_builder.hpp"
#include "barretenberg/crypto/generators/generator_data.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include <gtest/gtest.h>

using namespace barretenberg;

namespace {
auto& engine = numeric::random::get_debug_engine();
}

namespace avm_template_circuit_builder_tests {

template <typename Flavor> class AVMTemplateCircuitBuilderTests : public ::testing::Test {};

using FlavorTypes = ::testing::Types<proof_system::honk::flavor::AVMTemplate>;
TYPED_TEST_SUITE(AVMTemplateCircuitBuilderTests, FlavorTypes);

TYPED_TEST(AVMTemplateCircuitBuilderTests, BaseCase)
{
    using Flavor = TypeParam;
    using FF = typename Flavor::FF;

    proof_system::AVMTemplateCircuitBuilder<Flavor> circuit_builder;

    std::vector<FF> column_0;
    std::vector<FF> column_1;
    for (size_t i = 0; i < 16; i++) {
        column_0.emplace_back(FF::random_element());
        column_1.emplace_back(FF::random_element());
    }
    for (size_t i = 0; i < 16; i++) {
        // Put the same values but in inverse order
        circuit_builder.add_row({ column_0[i], column_1[i], column_0[15 - i], column_1[15 - i] });
    }

    // Test that the permutation with correct values works
    bool result = circuit_builder.check_circuit();
    EXPECT_EQ(result, true);
    // And that it fails with incorrct values
    circuit_builder.wires[0][5] = FF::random_element();
    result = circuit_builder.check_circuit();
    EXPECT_EQ(result, false);
}
} // namespace avm_template_circuit_builder_tests