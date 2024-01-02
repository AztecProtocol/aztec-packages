#include "toy_avm_circuit_builder.hpp"
#include "barretenberg/crypto/generators/generator_data.hpp"
#include <gtest/gtest.h>

using namespace barretenberg;

namespace {
auto& engine = numeric::random::get_debug_engine();
}

namespace toy_avm_circuit_builder_tests {

/**
 * @brief A test explaining the work of the permutations in Toy AVM
 *
 */
TEST(ToyAVMCircuitBuilder, BaseCase)
{

    using FF = proof_system::honk::flavor::ToyAVM::FF;
    const size_t circuit_size = 16;
    proof_system::ToyAVMCircuitBuilder<proof_system::honk::flavor::ToyAVM> circuit_builder;

    // Sample 2*16 random elements for the tuple permutation example
    std::vector<FF> column_0;
    std::vector<FF> column_1;
    for (size_t i = 0; i < circuit_size; i++) {
        column_0.emplace_back(FF::random_element());
        column_1.emplace_back(FF::random_element());
    }

    // Sample 8 random elements for the single column permutation
    std::vector<FF> column_2;
    for (size_t i = 0; i < circuit_size / 2; i++) {
        column_2.emplace_back(FF::random_element());
    }

    std::vector<std::pair<uint8_t, uint8_t>> xor_arguments;

    // Get xor arguments
    for (size_t i = 0; i < circuit_size; i++) {
        xor_arguments.emplace_back(engine.get_random_uint8(), engine.get_random_uint8());
    }
    for (size_t i = 0; i < circuit_size; i++) {
        // We put the same tuple of values in the first 2 wires and in the next 2 to at different rows
        // We also put the same value in the self_permutation column in 2 consecutive rows
        uint8_t xor_result = std::get<0>(xor_arguments[i]) ^ std::get<1>(xor_arguments[i]);
        circuit_builder.add_row({ column_0[i],                        // Tuple 1 element 1
                                  column_1[i],                        // Tuple 1 element 2
                                  column_0[15 - i],                   // Tuple 2 element 1
                                  column_1[15 - i],                   // Tuple 2  element 2
                                  column_2[i / 2],                    // Self-permutation column
                                  engine.get_random_uint8(),          // Range constrained column
                                  std::get<0>(xor_arguments[i]) >> 4, // Xor columns
                                  std::get<1>(xor_arguments[i]) >> 4,
                                  xor_result >> 4,
                                  std::get<0>(xor_arguments[i]),
                                  std::get<1>(xor_arguments[i]),
                                  xor_result });
    }

    // Test that permutations with correct values work
    bool result = circuit_builder.check_circuit();
    EXPECT_EQ(result, true);

    // Store value temporarily
    FF tmp = circuit_builder.wires[0][5];

    // Replace one of the values in a tuple permutation column with a random one, breaking the permutation
    circuit_builder.wires[0][5] = FF::random_element();

    // Check that it fails
    result = circuit_builder.check_circuit();
    EXPECT_EQ(result, false);

    // Restore value
    circuit_builder.wires[0][5] = tmp;

    // Check circuit passes
    result = circuit_builder.check_circuit();
    EXPECT_EQ(result, true);

    // Break single-column permutation
    tmp = circuit_builder.wires[4][0];
    circuit_builder.wires[4][0] = FF::random_element();
    result = circuit_builder.check_circuit();
    EXPECT_EQ(result, false);

    // Restore value
    circuit_builder.wires[4][0] = tmp;
    // Check circuit passes
    result = circuit_builder.check_circuit();
    EXPECT_EQ(result, true);

    // Break range constraint

    circuit_builder.wires[5][0] = 257;
    result = circuit_builder.check_circuit();
    EXPECT_EQ(result, false);

    // Restore range constraint

    circuit_builder.wires[5][0] = 255;
    result = circuit_builder.check_circuit();
    EXPECT_EQ(result, true);

    // Break xor  constraint

    circuit_builder.wires[6][0] = 0;
    circuit_builder.wires[7][0] = 0;
    circuit_builder.wires[8][0] = 1;
    result = circuit_builder.check_circuit();
    EXPECT_EQ(result, false);

    // Break scaled xor  constraint

    circuit_builder.wires[6][0] = 0;
    circuit_builder.wires[7][0] = 0;
    circuit_builder.wires[8][0] = 0;
    circuit_builder.wires[9][0] = 1;
    circuit_builder.wires[10][0] = 1;
    circuit_builder.wires[11][0] = 1;
    result = circuit_builder.check_circuit();
    EXPECT_EQ(result, false);

    // Restore xor constraint
    circuit_builder.wires[11][0] = 0;
    result = circuit_builder.check_circuit();
    EXPECT_EQ(result, true);
}
} // namespace toy_avm_circuit_builder_tests