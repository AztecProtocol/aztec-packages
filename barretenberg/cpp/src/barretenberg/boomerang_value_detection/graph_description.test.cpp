#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/aes128/aes128.hpp"
#include "barretenberg/crypto/generators/generator_data.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include "barretenberg/stdlib/encryption/aes128/aes128.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/plookup_tables/fixed_base/fixed_base.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;
using namespace cdg;

/**
 * @brief Test graph description of circuit with arithmetic gates
 *
 * @details This test verifies that:
 * - The number of connected components equals the number of pairs (i,j), where 0<=i,j<16
 * - Each pair creates an isolated component, resulting in 256 total components
 */
TEST(boomerang_ultra_circuit_constructor, test_graph_for_arithmetic_gates)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    for (size_t i = 0; i < 16; ++i) {
        for (size_t j = 0; j < 16; ++j) {
            uint64_t left = static_cast<uint64_t>(j);
            uint64_t right = static_cast<uint64_t>(i);
            uint32_t left_idx = circuit_constructor.add_variable(fr(left));
            uint32_t right_idx = circuit_constructor.add_variable(fr(right));
            uint32_t result_idx = circuit_constructor.add_variable(fr(left ^ right));

            uint32_t add_idx =
                circuit_constructor.add_variable(fr(left) + fr(right) + circuit_constructor.get_variable(result_idx));
            circuit_constructor.create_big_add_gate(
                { left_idx, right_idx, result_idx, add_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) });
        }
    }

    StaticAnalyzer graph = StaticAnalyzer(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), 1024);
    EXPECT_EQ(connected_components.size(), 256);
}

/**
 * @brief Test duplicate discovery
 *
 */
TEST(boomerang_ultra_circuit_constructor, test_duplicate_discovery)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    auto value_one = bb::fr::random_element();
    auto value_two = bb ::fr::random_element();
    auto value_three = bb::fr::random_element();
    for (size_t i = 0; i < 4; i++) {
        uint32_t left_idx = circuit_constructor.add_variable(value_one);
        uint32_t right_idx = circuit_constructor.add_variable(value_two);
        uint32_t result_idx = circuit_constructor.add_variable(value_three);

        uint32_t add_idx = circuit_constructor.add_variable(value_one + value_two + value_three + fr(i % 2));
        circuit_constructor.create_big_add_gate(
            { left_idx, right_idx, result_idx, add_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) });
    }

    StaticAnalyzer analyzer = StaticAnalyzer(circuit_constructor);
    analyzer.fill_witness_duplicate_map();
    const auto& duplicate_map = analyzer.get_witness_duplicate_map();
    EXPECT_TRUE(duplicate_map.contains(value_one));
    EXPECT_TRUE(duplicate_map.contains(value_two));
    EXPECT_TRUE(duplicate_map.contains(value_three));
}

TEST(boomerang_ultra_circuit_constructor, duplicate_filter_keeps_distinct_same_gate_witnesses)
{
    UltraCircuitBuilder circuit_constructor;
    const auto repeated_value = bb::fr::random_element();
    const auto balancing_value = -(repeated_value + repeated_value);

    const uint32_t left_idx = circuit_constructor.add_variable(repeated_value);
    const uint32_t right_idx = circuit_constructor.add_variable(repeated_value);
    const uint32_t balancing_idx = circuit_constructor.add_variable(balancing_value);

    circuit_constructor.create_big_add_gate(
        { left_idx, right_idx, balancing_idx, circuit_constructor.zero_idx(), fr(1), fr(1), fr(1), fr(0), fr(0) });

    StaticAnalyzer analyzer = StaticAnalyzer(circuit_constructor);
    analyzer.fill_witness_duplicate_map();
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().contains(repeated_value));
}

TEST(boomerang_ultra_circuit_constructor, duplicate_filter_keeps_common_value_witnesses)
{
    UltraCircuitBuilder circuit_constructor;
    const auto repeated_value = bb::fr::one();
    const auto balancing_value = -(repeated_value + repeated_value);

    const uint32_t left_idx = circuit_constructor.add_variable(repeated_value);
    const uint32_t right_idx = circuit_constructor.add_variable(repeated_value);
    const uint32_t balancing_idx = circuit_constructor.add_variable(balancing_value);

    circuit_constructor.create_big_add_gate(
        { left_idx, right_idx, balancing_idx, circuit_constructor.zero_idx(), fr(1), fr(1), fr(1), fr(0), fr(0) });

    StaticAnalyzer analyzer = StaticAnalyzer(circuit_constructor);
    analyzer.fill_witness_duplicate_map();
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().contains(repeated_value));
}

TEST(boomerang_ultra_circuit_constructor, duplicate_filter_keeps_caller_filtered_unexplained_witnesses)
{
    UltraCircuitBuilder circuit_constructor;
    const auto repeated_value = bb::fr::random_element();
    const auto balancing_value = -(repeated_value + repeated_value);

    const uint32_t left_idx = circuit_constructor.add_variable(repeated_value);
    const uint32_t right_idx = circuit_constructor.add_variable(repeated_value);
    const uint32_t balancing_idx = circuit_constructor.add_variable(balancing_value);

    circuit_constructor.create_big_add_gate(
        { left_idx, right_idx, balancing_idx, circuit_constructor.zero_idx(), fr(1), fr(1), fr(1), fr(0), fr(0) });

    StaticAnalyzer analyzer = StaticAnalyzer(circuit_constructor);
    analyzer.fill_witness_duplicate_map({ repeated_value });
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().contains(repeated_value));
}

TEST(boomerang_ultra_circuit_constructor, test_non_native_prime_limb_intermediate_duplicate_filter)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    auto repeated_value = bb::fr::random_element();
    const bb::fr fq_modulus_selector = (uint256_t(0x30644e72e131a029ULL) << 192) + (uint256_t(0xb85045b6ULL) << 160);

    for (size_t i = 0; i < 3; i++) {
        uint32_t repeated_idx = circuit_constructor.add_variable(repeated_value);
        const auto other_value = bb::fr::random_element();
        const auto left_scaling = bb::fr::random_element();
        const auto right_scaling = bb::fr::random_element();
        uint32_t other_idx = circuit_constructor.add_variable(other_value);
        uint32_t compensating_idx = circuit_constructor.add_variable(
            -(left_scaling * repeated_value + right_scaling * other_value) / fq_modulus_selector);
        circuit_constructor.create_big_add_gate({ repeated_idx,
                                                  other_idx,
                                                  compensating_idx,
                                                  circuit_constructor.zero_idx(),
                                                  left_scaling,
                                                  right_scaling,
                                                  fq_modulus_selector,
                                                  fr(0),
                                                  fr(0) });
    }

    auto nnf_repeated_value = bb::fr::random_element();
    for (size_t i = 0; i < 3; i++) {
        uint32_t repeated_idx = circuit_constructor.add_variable(nnf_repeated_value);
        uint32_t peer_idx = circuit_constructor.add_variable(bb::fr::random_element());
        circuit_constructor.blocks.nnf.populate_wires(
            repeated_idx, peer_idx, circuit_constructor.zero_idx(), circuit_constructor.zero_idx());
        circuit_constructor.apply_nnf_selectors(UltraCircuitBuilder::NON_NATIVE_FIELD_1);
        circuit_constructor.blocks.nnf.populate_wires(circuit_constructor.zero_idx(),
                                                      circuit_constructor.zero_idx(),
                                                      circuit_constructor.zero_idx(),
                                                      circuit_constructor.zero_idx());
        circuit_constructor.apply_nnf_selectors(UltraCircuitBuilder::NNF_NONE);
        circuit_constructor.increment_num_gates(2);

        const auto other_value = bb::fr::random_element();
        uint32_t other_idx = circuit_constructor.add_variable(other_value);
        const bb::fr q_c = -(fq_modulus_selector * (other_value + nnf_repeated_value));
        circuit_constructor.create_big_add_gate({ other_idx,
                                                  circuit_constructor.zero_idx(),
                                                  repeated_idx,
                                                  circuit_constructor.zero_idx(),
                                                  fq_modulus_selector,
                                                  fr(0),
                                                  fq_modulus_selector,
                                                  fr(0),
                                                  q_c });
    }

    auto nnf_only_repeated_value = bb::fr::random_element();
    for (size_t i = 0; i < 3; i++) {
        uint32_t repeated_idx = circuit_constructor.add_variable(nnf_only_repeated_value);
        uint32_t peer_idx = circuit_constructor.add_variable(bb::fr::random_element());
        circuit_constructor.blocks.nnf.populate_wires(
            repeated_idx, peer_idx, circuit_constructor.zero_idx(), circuit_constructor.zero_idx());
        circuit_constructor.apply_nnf_selectors(UltraCircuitBuilder::NON_NATIVE_FIELD_1);
        circuit_constructor.blocks.nnf.populate_wires(circuit_constructor.zero_idx(),
                                                      circuit_constructor.zero_idx(),
                                                      circuit_constructor.zero_idx(),
                                                      circuit_constructor.zero_idx());
        circuit_constructor.apply_nnf_selectors(UltraCircuitBuilder::NNF_NONE);
        circuit_constructor.increment_num_gates(2);
    }

    auto product_repeated_value = bb::fr::random_element();
    for (size_t i = 0; i < 3; i++) {
        const auto left_value = bb::fr::random_element();
        const auto right_value = bb::fr::random_element();
        const auto output_value = bb::fr::random_element();
        uint32_t left_idx = circuit_constructor.add_variable(left_value);
        uint32_t right_idx = circuit_constructor.add_variable(right_value);
        uint32_t output_idx = circuit_constructor.add_variable(output_value);
        uint32_t repeated_idx = circuit_constructor.add_variable(product_repeated_value);
        const bb::fr left_scaling = bb::fr::random_element();
        const bb::fr const_scaling = -(left_value * right_value * fq_modulus_selector + left_value * left_scaling +
                                       output_value + product_repeated_value * fq_modulus_selector);
        circuit_constructor.create_big_mul_add_gate({ .a = left_idx,
                                                      .b = right_idx,
                                                      .c = output_idx,
                                                      .d = repeated_idx,
                                                      .mul_scaling = fq_modulus_selector,
                                                      .a_scaling = left_scaling,
                                                      .b_scaling = fr(0),
                                                      .c_scaling = fr(1),
                                                      .d_scaling = fq_modulus_selector,
                                                      .const_scaling = const_scaling });
    }

    auto shifted_repeated_value = bb::fr::random_element();
    for (size_t i = 0; i < 3; i++) {
        const auto left_value = bb::fr::random_element();
        const auto right_value = bb::fr::random_element();
        const auto out_value = bb::fr::random_element();
        const bb::fr left_scaling = fr(1);
        const bb::fr right_scaling = uint256_t(1) << 14;
        const bb::fr out_scaling = uint256_t(1) << 28;
        uint32_t left_idx = circuit_constructor.add_variable(left_value);
        uint32_t right_idx = circuit_constructor.add_variable(right_value);
        uint32_t out_idx = circuit_constructor.add_variable(out_value);
        uint32_t compensating_idx =
            circuit_constructor.add_variable(-(shifted_repeated_value + left_scaling * left_value +
                                               right_scaling * right_value + out_scaling * out_value) /
                                             fq_modulus_selector);
        uint32_t repeated_idx = circuit_constructor.add_variable(shifted_repeated_value);
        circuit_constructor.create_big_add_gate({ left_idx,
                                                  right_idx,
                                                  out_idx,
                                                  compensating_idx,
                                                  left_scaling,
                                                  right_scaling,
                                                  out_scaling,
                                                  fq_modulus_selector,
                                                  fr(0) },
                                                true);
        circuit_constructor.create_big_add_gate({ circuit_constructor.zero_idx(),
                                                  circuit_constructor.zero_idx(),
                                                  circuit_constructor.zero_idx(),
                                                  repeated_idx,
                                                  fr(0),
                                                  fr(0),
                                                  fr(0),
                                                  fr(0),
                                                  fr(0) });
    }

    StaticAnalyzer analyzer = StaticAnalyzer(circuit_constructor);
    analyzer.fill_witness_duplicate_map();
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().empty());
}

TEST(boomerang_ultra_circuit_constructor, test_non_native_duplicate_filter_suppresses_connected_limb_chain)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    const auto repeated_value = bb::fr::random_element();
    const bb::fr fq_modulus_selector = (uint256_t(0x30644e72e131a029ULL) << 192) + (uint256_t(0xb85045b6ULL) << 160);

    uint32_t previous_idx = circuit_constructor.add_variable(repeated_value);
    for (size_t i = 0; i < 5; i++) {
        uint32_t peer_idx = circuit_constructor.add_variable(-(fr(1) + fq_modulus_selector) * repeated_value);
        uint32_t next_idx = circuit_constructor.add_variable(repeated_value);
        circuit_constructor.create_big_add_gate({ previous_idx,
                                                  peer_idx,
                                                  next_idx,
                                                  circuit_constructor.zero_idx(),
                                                  fr(1),
                                                  fr(1),
                                                  fq_modulus_selector,
                                                  fr(0),
                                                  fr(0) });
        previous_idx = next_idx;
    }

    StaticAnalyzer analyzer = StaticAnalyzer(circuit_constructor, /*connect_variables=*/false);
    analyzer.fill_witness_duplicate_map();
    EXPECT_FALSE(analyzer.get_witness_duplicate_map().contains(repeated_value));
}

TEST(boomerang_ultra_circuit_constructor, test_non_native_duplicate_filter_suppresses_connected_product_rows)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    const bb::fr fq_modulus_selector = (uint256_t(0x30644e72e131a029ULL) << 192) + (uint256_t(0xb85045b6ULL) << 160);

    const auto product_repeated_value = bb::fr::random_element();
    uint32_t previous_product_idx = circuit_constructor.add_variable(product_repeated_value);
    for (size_t i = 0; i < 3; i++) {
        const auto peer_value =
            -(fq_modulus_selector * product_repeated_value) / (fq_modulus_selector * product_repeated_value + fr(1));
        uint32_t peer_idx = circuit_constructor.add_variable(peer_value);
        uint32_t next_product_idx = circuit_constructor.add_variable(product_repeated_value);
        circuit_constructor.create_big_mul_add_gate({ .a = previous_product_idx,
                                                      .b = peer_idx,
                                                      .c = next_product_idx,
                                                      .d = circuit_constructor.zero_idx(),
                                                      .mul_scaling = fq_modulus_selector,
                                                      .a_scaling = fr(0),
                                                      .b_scaling = fr(1),
                                                      .c_scaling = fq_modulus_selector,
                                                      .d_scaling = fr(0),
                                                      .const_scaling = fr(0) });
        previous_product_idx = next_product_idx;
    }

    const auto q4_repeated_value = bb::fr::random_element();
    uint32_t previous_q4_idx = circuit_constructor.add_variable(q4_repeated_value);
    for (size_t i = 0; i < 3; i++) {
        const auto left_value = fr(7 + i);
        const auto right_value = -(fr(1) + fq_modulus_selector) * q4_repeated_value / left_value;
        uint32_t left_idx = circuit_constructor.add_variable(left_value);
        uint32_t right_idx = circuit_constructor.add_variable(right_value);
        uint32_t next_q4_idx = circuit_constructor.add_variable(q4_repeated_value);
        circuit_constructor.create_big_mul_add_gate({ .a = left_idx,
                                                      .b = right_idx,
                                                      .c = previous_q4_idx,
                                                      .d = next_q4_idx,
                                                      .mul_scaling = fr(1),
                                                      .a_scaling = fr(0),
                                                      .b_scaling = fr(0),
                                                      .c_scaling = fr(1),
                                                      .d_scaling = fq_modulus_selector,
                                                      .const_scaling = fr(0) });
        previous_q4_idx = next_q4_idx;
    }

    StaticAnalyzer analyzer = StaticAnalyzer(circuit_constructor, /*connect_variables=*/false);
    analyzer.fill_witness_duplicate_map();
    EXPECT_FALSE(analyzer.get_witness_duplicate_map().contains(product_repeated_value));
    EXPECT_FALSE(analyzer.get_witness_duplicate_map().contains(q4_repeated_value));
}

TEST(boomerang_ultra_circuit_constructor, test_non_native_duplicate_filter_suppresses_fixed_witness_bridge)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    const auto repeated_value = bb::fr::random_element();
    const bb::fr fq_modulus_selector = (uint256_t(0x30644e72e131a029ULL) << 192) + (uint256_t(0xb85045b6ULL) << 160);

    uint32_t fixed_idx = circuit_constructor.add_variable(repeated_value);
    circuit_constructor.fix_witness(fixed_idx, repeated_value);
    uint32_t repeated_idx = circuit_constructor.add_variable(repeated_value);
    uint32_t next_repeated_idx = circuit_constructor.add_variable(repeated_value);
    const auto balancing_value =
        -(repeated_value * repeated_value + fq_modulus_selector * repeated_value) / fq_modulus_selector;
    uint32_t balancing_idx = circuit_constructor.add_variable(balancing_value);

    circuit_constructor.create_big_mul_add_gate({ .a = fixed_idx,
                                                  .b = repeated_idx,
                                                  .c = balancing_idx,
                                                  .d = next_repeated_idx,
                                                  .mul_scaling = fr(1),
                                                  .a_scaling = fr(0),
                                                  .b_scaling = fr(0),
                                                  .c_scaling = fq_modulus_selector,
                                                  .d_scaling = fq_modulus_selector,
                                                  .const_scaling = fr(0) });

    StaticAnalyzer analyzer = StaticAnalyzer(circuit_constructor, /*connect_variables=*/false);
    analyzer.fill_witness_duplicate_map();
    EXPECT_FALSE(analyzer.get_witness_duplicate_map().contains(repeated_value));
}

TEST(boomerang_ultra_circuit_constructor, test_arithmetic_derivation_duplicate_filter_suppresses_mirrored_rows)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    const bb::fr q_c = (uint256_t(0x30644e72e131a029ULL) << 192) + (uint256_t(0xb85045b6ULL) << 160);
    const bb::fr peer_value = bb::fr::random_element();
    const bb::fr pure_product_q_m = fr(0x9d80);
    const bb::fr pure_product_value = -q_c / (pure_product_q_m * peer_value);
    uint32_t peer_idx = circuit_constructor.add_variable(peer_value);
    uint32_t pure_product_left_idx = circuit_constructor.add_variable(pure_product_value);
    uint32_t pure_product_right_idx = circuit_constructor.add_variable(pure_product_value);
    circuit_constructor.create_big_mul_add_gate({ .a = peer_idx,
                                                  .b = pure_product_left_idx,
                                                  .c = circuit_constructor.zero_idx(),
                                                  .d = circuit_constructor.zero_idx(),
                                                  .mul_scaling = pure_product_q_m,
                                                  .a_scaling = fr(0),
                                                  .b_scaling = fr(0),
                                                  .c_scaling = fr(0),
                                                  .d_scaling = fr(0),
                                                  .const_scaling = q_c });
    circuit_constructor.create_big_mul_add_gate({ .a = pure_product_right_idx,
                                                  .b = peer_idx,
                                                  .c = pure_product_right_idx,
                                                  .d = circuit_constructor.zero_idx(),
                                                  .mul_scaling = pure_product_q_m,
                                                  .a_scaling = fr(0),
                                                  .b_scaling = fr(0),
                                                  .c_scaling = fr(0),
                                                  .d_scaling = fr(0),
                                                  .const_scaling = q_c });

    const bb::fr linear_q_m = fr(0x5a0);
    const bb::fr linear_scaling = -fr(0xb3f);
    const bb::fr linear_value = -q_c / (linear_q_m * peer_value + linear_scaling);
    uint32_t linear_left_idx = circuit_constructor.add_variable(linear_value);
    uint32_t linear_right_idx = circuit_constructor.add_variable(linear_value);
    circuit_constructor.create_big_mul_add_gate({ .a = peer_idx,
                                                  .b = linear_left_idx,
                                                  .c = circuit_constructor.zero_idx(),
                                                  .d = circuit_constructor.zero_idx(),
                                                  .mul_scaling = linear_q_m,
                                                  .a_scaling = fr(0),
                                                  .b_scaling = linear_scaling,
                                                  .c_scaling = fr(0),
                                                  .d_scaling = fr(0),
                                                  .const_scaling = q_c });
    circuit_constructor.create_big_mul_add_gate({ .a = linear_right_idx,
                                                  .b = peer_idx,
                                                  .c = linear_right_idx,
                                                  .d = circuit_constructor.zero_idx(),
                                                  .mul_scaling = linear_q_m,
                                                  .a_scaling = linear_scaling,
                                                  .b_scaling = fr(0),
                                                  .c_scaling = fr(0),
                                                  .d_scaling = fr(0),
                                                  .const_scaling = q_c });

    StaticAnalyzer analyzer = StaticAnalyzer(circuit_constructor, /*connect_variables=*/false);
    analyzer.fill_witness_duplicate_map();
    EXPECT_FALSE(analyzer.get_witness_duplicate_map().contains(pure_product_value));
    EXPECT_FALSE(analyzer.get_witness_duplicate_map().contains(linear_value));
}

TEST(boomerang_ultra_circuit_constructor, test_elliptic_duplicate_filter_suppresses_repeated_operation_outputs)
{
    using affine_element = grumpkin::g1::affine_element;
    using element = grumpkin::g1::element;
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    affine_element p1 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 0);
    affine_element p2 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 1);
    affine_element p3(element(p1) + element(p2));

    for (size_t i = 0; i < 3; i++) {
        uint32_t x1 = circuit_constructor.add_variable(p1.x);
        uint32_t y1 = circuit_constructor.add_variable(p1.y);
        uint32_t x2 = circuit_constructor.add_variable(p2.x);
        uint32_t y2 = circuit_constructor.add_variable(p2.y);
        uint32_t x3 = circuit_constructor.add_variable(p3.x);
        uint32_t y3 = circuit_constructor.add_variable(p3.y);
        circuit_constructor.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, /*is_addition=*/true });
    }

    StaticAnalyzer analyzer = StaticAnalyzer(circuit_constructor, /*connect_variables=*/false);
    analyzer.fill_witness_duplicate_map();
    EXPECT_FALSE(analyzer.get_witness_duplicate_map().contains(p3.x));
    EXPECT_FALSE(analyzer.get_witness_duplicate_map().contains(p3.y));
}

TEST(boomerang_ultra_circuit_constructor, test_non_native_duplicate_filter_keeps_plain_gate_use)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    const auto repeated_value = bb::fr::random_element();
    const bb::fr fq_modulus_selector = (uint256_t(0x30644e72e131a029ULL) << 192) + (uint256_t(0xb85045b6ULL) << 160);

    for (size_t i = 0; i < 3; i++) {
        uint32_t repeated_idx = circuit_constructor.add_variable(repeated_value);
        const auto other_value = bb::fr::random_element();
        uint32_t other_idx = circuit_constructor.add_variable(other_value);
        const bb::fr q_c = -(fq_modulus_selector * (other_value + repeated_value));
        circuit_constructor.create_big_add_gate({ other_idx,
                                                  circuit_constructor.zero_idx(),
                                                  repeated_idx,
                                                  circuit_constructor.zero_idx(),
                                                  fq_modulus_selector,
                                                  fr(0),
                                                  fq_modulus_selector,
                                                  fr(0),
                                                  q_c });

        if (i == 0) {
            const auto left_value = bb::fr::random_element();
            const auto right_value = bb::fr::random_element();
            uint32_t left_idx = circuit_constructor.add_variable(left_value);
            uint32_t right_idx = circuit_constructor.add_variable(right_value);
            uint32_t add_idx = circuit_constructor.add_variable(left_value + right_value + repeated_value);
            circuit_constructor.create_big_add_gate(
                { left_idx, right_idx, repeated_idx, add_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) });
        }
    }

    StaticAnalyzer analyzer = StaticAnalyzer(circuit_constructor);
    analyzer.fill_witness_duplicate_map();
    EXPECT_TRUE(analyzer.get_witness_duplicate_map().contains(repeated_value));
}

/**
 * @brief Test graph description of Ultra Circuit Builder with arithmetic gates with shifts
 *
 * @details This test verifies that:
 * - When all gates have shifts, they form a single connected component
 * - The shift operation connects all variables in the circuit
 */
TEST(boomerang_ultra_circuit_constructor, test_graph_for_arithmetic_gates_with_shifts)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    for (size_t i = 0; i < 16; ++i) {
        for (size_t j = 0; j < 16; ++j) {
            uint64_t left = static_cast<uint64_t>(j);
            uint64_t right = static_cast<uint64_t>(i);
            uint32_t left_idx = circuit_constructor.add_variable(fr(left));
            uint32_t right_idx = circuit_constructor.add_variable(fr(right));
            uint32_t result_idx = circuit_constructor.add_variable(fr(left ^ right));

            uint32_t add_idx =
                circuit_constructor.add_variable(fr(left) + fr(right) + circuit_constructor.get_variable(result_idx));
            circuit_constructor.create_big_add_gate(
                { left_idx, right_idx, result_idx, add_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) }, true);
        }
    }

    StaticAnalyzer graph = StaticAnalyzer(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    auto num_connected_components = connected_components.size();
    bool result = num_connected_components == 1;
    EXPECT_EQ(result, true);
}

/**
 * @brief Test graph description of circuit with boolean gates
 *
 * @details This test verifies that:
 * - All variables are isolated with boolean gates
 * - The number of connected components is 0
 * - All variables are in one gate
 */
TEST(boomerang_ultra_circuit_constructor, test_graph_for_boolean_gates)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    for (size_t i = 0; i < 20; ++i) {
        fr a = fr::zero();
        uint32_t a_idx = circuit_constructor.add_variable(a);
        circuit_constructor.create_bool_gate(a_idx);
    }

    StaticAnalyzer graph = StaticAnalyzer(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    auto num_connected_components = connected_components.size();
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    bool result = num_connected_components == 0;
    EXPECT_EQ(result, true);
    EXPECT_EQ(variables_in_one_gate.size(), 20);
}

/**
 * @brief Test graph description for circuit with one elliptic addition gate
 *
 * @details This test verifies that:
 * - The circuit forms one connected component containing 6 variables
 * - The variables represent the coordinates of three points: (x1,y1), (x2,y2), (x3,y3)
 * - Where (x3,y3) is the result of adding (x1,y1) and (x2,y2)
 */
TEST(boomerang_ultra_circuit_constructor, test_graph_for_elliptic_add_gate)
{
    typedef grumpkin::g1::affine_element affine_element;
    typedef grumpkin::g1::element element;
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    affine_element p1 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 0);

    affine_element p2 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 1);
    affine_element p3(element(p1) + element(p2));

    uint32_t x1 = circuit_constructor.add_variable(p1.x);
    uint32_t y1 = circuit_constructor.add_variable(p1.y);
    uint32_t x2 = circuit_constructor.add_variable(p2.x);
    uint32_t y2 = circuit_constructor.add_variable(p2.y);
    uint32_t x3 = circuit_constructor.add_variable(p3.x);
    uint32_t y3 = circuit_constructor.add_variable(p3.y);

    circuit_constructor.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, /*is_addition=*/true });

    StaticAnalyzer graph = StaticAnalyzer(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    auto num_connected_components = connected_components.size();
    bool result = num_connected_components == 1;
    EXPECT_EQ(result, true);
}

/**
 * @brief Test graph description for circuit with one elliptic double gate
 *
 * @details This test verifies that:
 * - The circuit forms one connected component containing 4 variables
 * - The variables represent the coordinates of two points: (x1,y1) and (x3,y3)
 * - Where (x3,y3) is the result of doubling (x1,y1)
 */
TEST(boomerang_ultra_circuit_constructor, test_graph_for_elliptic_double_gate)
{
    typedef grumpkin::g1::affine_element affine_element;
    typedef grumpkin::g1::element element;
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    affine_element p1 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 0);
    affine_element p3(element(p1).dbl());

    uint32_t x1 = circuit_constructor.add_variable(p1.x);
    uint32_t y1 = circuit_constructor.add_variable(p1.y);
    uint32_t x3 = circuit_constructor.add_variable(p3.x);
    uint32_t y3 = circuit_constructor.add_variable(p3.y);

    circuit_constructor.create_ecc_dbl_gate({ x1, y1, x3, y3 });

    StaticAnalyzer graph = StaticAnalyzer(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    auto num_connected_components = connected_components.size();
    bool result = num_connected_components == 1;
    EXPECT_EQ(result, true);
}

/**
 * @brief Test graph description for circuit with elliptic addition and multiplication gates
 *
 * @details This test verifies that:
 * - The circuit forms 2 connected components
 * - First component contains: x1, y1, x2, y2, x3, y3, x4, y4
 * - Second component contains: x5, y5, x6, y6, x7, y7, x8, y8
 * - Each component represents a separate elliptic curve operation sequence
 */
TEST(boomerang_ultra_circuit_constructor, test_graph_for_elliptic_together)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    typedef grumpkin::g1::affine_element affine_element;
    typedef grumpkin::g1::element element;

    affine_element p1 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 0);
    affine_element p2 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 1);
    affine_element p3(element(p1) + element(p2));

    uint32_t x1 = circuit_constructor.add_variable(p1.x);
    uint32_t y1 = circuit_constructor.add_variable(p1.y);
    uint32_t x2 = circuit_constructor.add_variable(p2.x);
    uint32_t y2 = circuit_constructor.add_variable(p2.y);
    uint32_t x3 = circuit_constructor.add_variable(p3.x);
    uint32_t y3 = circuit_constructor.add_variable(p3.y);

    circuit_constructor.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, /*is_addition=*/true });
    affine_element p4(element(p3).dbl());
    uint32_t x4 = circuit_constructor.add_variable(p4.x);
    uint32_t y4 = circuit_constructor.add_variable(p4.y);
    circuit_constructor.create_ecc_dbl_gate({ x3, y3, x4, y4 });

    affine_element p5 = crypto::pedersen_commitment::commit_native({ bb::fr(2) }, 1);
    affine_element p6 = crypto::pedersen_commitment::commit_native({ bb::fr(3) }, 1);
    affine_element p7(element(p5) + element(p6));

    uint32_t x5 = circuit_constructor.add_variable(p5.x);
    uint32_t y5 = circuit_constructor.add_variable(p5.y);
    uint32_t x6 = circuit_constructor.add_variable(p6.x);
    uint32_t y6 = circuit_constructor.add_variable(p6.y);
    uint32_t x7 = circuit_constructor.add_variable(p7.x);
    uint32_t y7 = circuit_constructor.add_variable(p7.y);

    circuit_constructor.create_ecc_add_gate({ x5, y5, x6, y6, x7, y7, /*is_addition=*/true });
    affine_element p8(element(p7).dbl());
    uint32_t x8 = circuit_constructor.add_variable(p8.x);
    uint32_t y8 = circuit_constructor.add_variable(p8.y);
    circuit_constructor.create_ecc_dbl_gate({ x7, y7, x8, y8 });

    StaticAnalyzer graph = StaticAnalyzer(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    auto num_connected_components = connected_components.size();
    bool result = num_connected_components == 2;
    EXPECT_EQ(result, true);
}

/**
 * @brief Test graph description for circuit with 2 sort constraints
 *
 * @details This test verifies that:
 * - The circuit forms 2 connected components
 * - First component contains: a_idx, b_idx, c_idx, d_idx
 * - Second component contains: e_idx, f_idx, g_idx, h_idx
 * - Each sort constraint creates its own connected component
 */
TEST(boomerang_ultra_circuit_constructor, test_graph_for_sort_constraints)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    fr a = fr::one();
    fr b = fr(2);
    fr c = fr(3);
    fr d = fr(4);

    auto a_idx = circuit_constructor.add_variable(a);
    auto b_idx = circuit_constructor.add_variable(b);
    auto c_idx = circuit_constructor.add_variable(c);
    auto d_idx = circuit_constructor.add_variable(d);
    circuit_constructor.enforce_small_deltas({ a_idx, b_idx, c_idx, d_idx });

    fr e = fr(5);
    fr f = fr(6);
    fr g = fr(7);
    fr h = fr(8);
    auto e_idx = circuit_constructor.add_variable(e);
    auto f_idx = circuit_constructor.add_variable(f);
    auto g_idx = circuit_constructor.add_variable(g);
    auto h_idx = circuit_constructor.add_variable(h);
    circuit_constructor.enforce_small_deltas({ e_idx, f_idx, g_idx, h_idx });

    StaticAnalyzer graph = StaticAnalyzer(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components[0].size(), 4);
    EXPECT_EQ(connected_components[1].size(), 4);
    EXPECT_EQ(connected_components.size(), 2);
}

/**
 * @brief Test graph description for circuit with 2 sorted constraints with edges
 *
 * @details This test verifies that:
 * - The circuit forms 2 connected components
 * - First component contains: a_idx through h_idx
 * - Second component contains: a1_idx through h1_idx
 * - Each sort constraint with edges creates its own connected component
 */
TEST(boomerang_ultra_circuit_constructor, test_graph_for_sort_constraints_with_edges)
{
    fr a = fr::one();
    fr b = fr(2);
    fr c = fr(3);
    fr d = fr(4);
    fr e = fr(5);
    fr f = fr(6);
    fr g = fr(7);
    fr h = fr(8);

    UltraCircuitBuilder circuit_constructor;
    auto a_idx = circuit_constructor.add_variable(a);
    auto b_idx = circuit_constructor.add_variable(b);
    auto c_idx = circuit_constructor.add_variable(c);
    auto d_idx = circuit_constructor.add_variable(d);
    auto e_idx = circuit_constructor.add_variable(e);
    auto f_idx = circuit_constructor.add_variable(f);
    auto g_idx = circuit_constructor.add_variable(g);
    auto h_idx = circuit_constructor.add_variable(h);
    circuit_constructor.create_sort_constraint_with_edges(
        { a_idx, b_idx, c_idx, d_idx, e_idx, f_idx, g_idx, h_idx }, a, h);

    fr a1 = fr(9);
    fr b1 = fr(10);
    fr c1 = fr(11);
    fr d1 = fr(12);
    fr e1 = fr(13);
    fr f1 = fr(14);
    fr g1 = fr(15);
    fr h1 = fr(16);

    auto a1_idx = circuit_constructor.add_variable(a1);
    auto b1_idx = circuit_constructor.add_variable(b1);
    auto c1_idx = circuit_constructor.add_variable(c1);
    auto d1_idx = circuit_constructor.add_variable(d1);
    auto e1_idx = circuit_constructor.add_variable(e1);
    auto f1_idx = circuit_constructor.add_variable(f1);
    auto g1_idx = circuit_constructor.add_variable(g1);
    auto h1_idx = circuit_constructor.add_variable(h1);

    circuit_constructor.create_sort_constraint_with_edges(
        { a1_idx, b1_idx, c1_idx, d1_idx, e1_idx, f1_idx, g1_idx, h1_idx }, a1, h1);
    StaticAnalyzer graph = StaticAnalyzer(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    auto num_connected_components = connected_components.size();
    bool result = num_connected_components == 2;
    EXPECT_EQ(result, true);
}

/**
 * @brief Test graph description for circuit with gates created from plookup accumulators
 *
 * @details This test verifies that:
 * - The circuit forms one connected component
 * - Plookup accumulator gates connect all variables in the circuit
 */
TEST(boomerang_ultra_circuit_constructor, test_graph_with_plookup_accumulators)
{
    UltraCircuitBuilder circuit_builder = UltraCircuitBuilder();

    fr input_value = fr::random_element();
    const fr input_lo = static_cast<uint256_t>(input_value).slice(0, plookup::fixed_base::table::BITS_PER_LO_SCALAR);
    const auto input_lo_index = circuit_builder.add_variable(input_lo);

    const auto sequence_data_lo = plookup::get_lookup_accumulators(plookup::MultiTableId::FIXED_BASE_LEFT_LO, input_lo);

    const auto lookup_witnesses = circuit_builder.create_gates_from_plookup_accumulators(
        plookup::MultiTableId::FIXED_BASE_LEFT_LO, sequence_data_lo, input_lo_index);

    const size_t num_lookups = plookup::fixed_base::table::NUM_TABLES_PER_LO_MULTITABLE;

    EXPECT_EQ(num_lookups, lookup_witnesses[plookup::ColumnIdx::C1].size());

    StaticAnalyzer graph = StaticAnalyzer(circuit_builder);
    auto connected_components = graph.find_connected_components();
    auto num_connected_components = connected_components.size();
    bool result = num_connected_components == 1;
    EXPECT_EQ(result, true);
}

/**
 * @brief Test variable gate counts for variables from arithmetic gates without shifts
 *
 * @details This test verifies that:
 * - Each variable (except index 0) appears in exactly one gate
 * - Variables with index 0 appear in no gates
 */
TEST(boomerang_ultra_circuit_constructor, test_variables_gates_counts_for_arithmetic_gate)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    for (size_t i = 0; i < 25; ++i) {
        for (size_t j = 0; j < 25; ++j) {
            uint64_t left = static_cast<uint64_t>(j);
            uint64_t right = static_cast<uint64_t>(i);
            uint32_t left_idx = circuit_constructor.add_variable(fr(left));
            uint32_t right_idx = circuit_constructor.add_variable(fr(right));
            uint32_t result_idx = circuit_constructor.add_variable(fr(left ^ right));

            uint32_t add_idx =
                circuit_constructor.add_variable(fr(left) + fr(right) + circuit_constructor.get_variable(result_idx));
            circuit_constructor.create_big_add_gate(
                { left_idx, right_idx, result_idx, add_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) });
        }
    }

    StaticAnalyzer graph = StaticAnalyzer(circuit_constructor);
    auto variables_gate_counts = graph.get_variables_gate_counts();

    // Verify that each variable (except zero_idx) appears in exactly 1 gate
    bool result = true;
    uint32_t zero_idx = circuit_constructor.zero_idx();
    for (const auto pair : variables_gate_counts) {
        if (pair.first != zero_idx) {
            result = result && (pair.second == 1);
        }
    }
    EXPECT_EQ(result, true);
}

/**
 * @brief Test variable gate counts for variables in circuit with gates with shifts
 *
 * @details This test verifies that:
 * - Variables with index == 0 mod 4 and index != 4 have gate count == 2
 * - All other variables (except zero_idx) have gate count == 1
 */
TEST(boomerang_ultra_circuit_constructor, test_variables_gates_counts_for_arithmetic_gate_with_shifts)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    for (size_t i = 0; i < 25; ++i) {
        for (size_t j = 0; j < 25; ++j) {
            uint64_t left = static_cast<uint64_t>(j);
            uint64_t right = static_cast<uint64_t>(i);
            uint32_t left_idx = circuit_constructor.add_variable(fr(left));
            uint32_t right_idx = circuit_constructor.add_variable(fr(right));
            uint32_t result_idx = circuit_constructor.add_variable(fr(left ^ right));

            uint32_t add_idx =
                circuit_constructor.add_variable(fr(left) + fr(right) + circuit_constructor.get_variable(result_idx));
            circuit_constructor.create_big_add_gate(
                { left_idx, right_idx, result_idx, add_idx, fr(1), fr(1), fr(1), fr(-1), fr(0) }, true);
        }
    }

    StaticAnalyzer graph = StaticAnalyzer(circuit_constructor);
    bool result = true;
    uint32_t zero_idx = circuit_constructor.zero_idx();
    auto variables_gate_counts = graph.get_variables_gate_counts();
    for (const auto& pair : variables_gate_counts) {
        if (pair.first != zero_idx) {
            result = result && (pair.first % 4 == 0 && pair.first != 4 ? (pair.second == 2) : (pair.second == 1));
        }
    }
    EXPECT_EQ(result, true);
}

/**
 * @brief Test variable gate counts for variables in circuit with boolean gates
 *
 * @details This test verifies that:
 * - All variables (except zero_idx) have gate count == 1
 */
TEST(boomerang_ultra_circuit_constructor, test_variables_gates_counts_for_boolean_gates)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    for (size_t i = 0; i < 20; ++i) {
        fr a = fr::zero();
        uint32_t a_idx = circuit_constructor.add_variable(a);
        circuit_constructor.create_bool_gate(a_idx);
    }

    StaticAnalyzer graph = StaticAnalyzer(circuit_constructor);
    auto variables_gate_counts = graph.get_variables_gate_counts();
    bool result = true;
    uint32_t zero_idx = circuit_constructor.zero_idx();
    for (const auto& part : variables_gate_counts) {
        if (part.first != zero_idx) {
            result = result && (part.second == 1);
        }
    }
    EXPECT_EQ(result, true);
}

/**
 * @brief Test variable gate counts in circuit with sorted constraints
 *
 * @details This test verifies that:
 * - All variables in both connected components have gate count == 1
 * - Each sort constraint creates a separate component with consistent gate counts
 */
TEST(boomerang_ultra_circuit_constructor, test_variables_gates_counts_for_sorted_constraints)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    fr a = fr::one();
    fr b = fr(2);
    fr c = fr(3);
    fr d = fr(4);

    auto a_idx = circuit_constructor.add_variable(a);
    auto b_idx = circuit_constructor.add_variable(b);
    auto c_idx = circuit_constructor.add_variable(c);
    auto d_idx = circuit_constructor.add_variable(d);
    circuit_constructor.enforce_small_deltas({ a_idx, b_idx, c_idx, d_idx });

    fr e = fr(5);
    fr f = fr(6);
    fr g = fr(7);
    fr h = fr(8);
    auto e_idx = circuit_constructor.add_variable(e);
    auto f_idx = circuit_constructor.add_variable(f);
    auto g_idx = circuit_constructor.add_variable(g);
    auto h_idx = circuit_constructor.add_variable(h);
    circuit_constructor.enforce_small_deltas({ e_idx, f_idx, g_idx, h_idx });

    StaticAnalyzer graph = StaticAnalyzer(circuit_constructor);
    auto variables_gate_counts = graph.get_variables_gate_counts();
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 2);
    bool result = true;
    for (const auto& var_idx : connected_components[0].vars()) {
        result = result && (variables_gate_counts[var_idx] == 1);
    }

    for (const auto& var_idx : connected_components[1].vars()) {
        result = result && (variables_gate_counts[var_idx] == 1);
    }
    EXPECT_EQ(result, true);
}

/**
 * @brief Test sorted constraints with edges create proper connected components
 *
 * @details This test verifies that:
 * - Each sort constraint with edges creates a separate connected component
 * - All variables are tracked with appropriate gate counts (>= 1)
 */
TEST(boomerang_ultra_circuit_constructor, test_variables_gates_counts_for_sorted_constraints_with_edges)
{
    UltraCircuitBuilder circuit_constructor;
    auto add_variables = [&circuit_constructor](const std::vector<fr>& vars) {
        std::vector<uint32_t> res;
        res.reserve(vars.size());
        for (const auto& var : vars) {
            res.emplace_back(circuit_constructor.add_variable(var));
        }
        return res;
    };
    std::vector<fr> vars1 = { fr::one(), fr(2), fr(3), fr(4), fr(5), fr(6), fr(7), fr(8) };
    std::vector<fr> vars2 = { fr(9), fr(10), fr(11), fr(12), fr(13), fr(14), fr(15), fr(16) };
    auto var_idx1 = add_variables(vars1);
    auto var_idx2 = add_variables(vars2);
    circuit_constructor.create_sort_constraint_with_edges(var_idx1, vars1[0], vars1[vars1.size() - 1]);
    circuit_constructor.create_sort_constraint_with_edges(var_idx2, vars2[0], vars2[vars2.size() - 1]);
    StaticAnalyzer graph = StaticAnalyzer(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    auto variables_gate_counts = graph.get_variables_gate_counts();

    // Two separate sort constraints should create 2 connected components
    EXPECT_EQ(connected_components.size(), 2);

    // All variables should appear in at least one gate
    for (size_t i = 0; i < var_idx1.size(); i++) {
        EXPECT_GE(variables_gate_counts[var_idx1[i]], 1)
            << "Variable at index " << i << " should appear in at least 1 gate";
    }
}

/**
 * @brief Test variable gate counts for variables in circuit with elliptic addition gates
 *
 * @details This test verifies that:
 * - All variables in the connected component have gate count == 1
 * - The component contains the 6 variables representing the coordinates of the points
 */
TEST(boomerang_ultra_circuit_constructor, test_variables_gates_counts_for_ecc_add_gates)
{
    typedef grumpkin::g1::affine_element affine_element;
    typedef grumpkin::g1::element element;
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    affine_element p1 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 0);

    affine_element p2 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 1);
    affine_element p3(element(p1) + element(p2));

    uint32_t x1 = circuit_constructor.add_variable(p1.x);
    uint32_t y1 = circuit_constructor.add_variable(p1.y);
    uint32_t x2 = circuit_constructor.add_variable(p2.x);
    uint32_t y2 = circuit_constructor.add_variable(p2.y);
    uint32_t x3 = circuit_constructor.add_variable(p3.x);
    uint32_t y3 = circuit_constructor.add_variable(p3.y);

    circuit_constructor.create_ecc_add_gate({ x1, y1, x2, y2, x3, y3, /*is_addition=*/true });

    StaticAnalyzer graph = StaticAnalyzer(circuit_constructor);
    auto variables_gate_counts = graph.get_variables_gate_counts();
    auto connected_components = graph.find_connected_components();
    auto variable_indices = connected_components[0].vars();
    bool result =
        (variables_gate_counts[variable_indices[0]] == 1) && (variables_gate_counts[variable_indices[1]] == 1) &&
        (variables_gate_counts[variable_indices[2]] == 1) && (variables_gate_counts[variable_indices[3]] == 1) &&
        (variables_gate_counts[variable_indices[4]] == 1) && (variables_gate_counts[variable_indices[5]] == 1);
    EXPECT_EQ(connected_components.size(), 1);
    EXPECT_EQ(result, true);
}

/**
 * @brief Test variable gate counts for variables in circuit with elliptic double gates
 *
 * @details This test verifies that:
 * - All variables in the connected component have gate count == 1
 * - The component contains the 4 variables representing the coordinates of the point
 */

TEST(boomerang_ultra_circuit_constructor, test_variables_gates_counts_for_ecc_dbl_gate)
{
    typedef grumpkin::g1::affine_element affine_element;
    typedef grumpkin::g1::element element;
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();

    affine_element p1 = crypto::pedersen_commitment::commit_native({ bb::fr(1) }, 0);
    affine_element p3(element(p1).dbl());

    uint32_t x1 = circuit_constructor.add_variable(p1.x);
    uint32_t y1 = circuit_constructor.add_variable(p1.y);
    uint32_t x3 = circuit_constructor.add_variable(p3.x);
    uint32_t y3 = circuit_constructor.add_variable(p3.y);

    circuit_constructor.create_ecc_dbl_gate({ x1, y1, x3, y3 });

    StaticAnalyzer graph = StaticAnalyzer(circuit_constructor);
    auto variables_gate_counts = graph.get_variables_gate_counts();
    auto connected_components = graph.find_connected_components();

    auto vars = connected_components[0].vars();
    EXPECT_EQ(vars.size(), 4);
    bool result = (variables_gate_counts[vars[0]] == 1) && (variables_gate_counts[vars[1]] == 1) &&
                  (variables_gate_counts[vars[2]] == 1) && (variables_gate_counts[vars[3]] == 1);

    EXPECT_EQ(connected_components.size(), 1);
    EXPECT_EQ(result, true);
}

/**
 * @brief Test graph description of circuit with range constraints
 *
 * @details This test verifies that:
 * - All variables must be in one connected component
 */

TEST(boomerang_ultra_circuit_constructor, test_graph_for_range_constraints)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    auto add_variables = [&circuit_constructor](const std::vector<fr>& vars) {
        std::vector<uint32_t> res;
        res.reserve(vars.size());
        for (const auto& var : vars) {
            res.emplace_back(circuit_constructor.add_variable(var));
        }
        return res;
    };
    auto indices = add_variables({ fr(1), fr(2), fr(3), fr(4) });
    for (size_t i = 0; i < indices.size(); i++) {
        circuit_constructor.create_small_range_constraint(indices[i], 5);
    }
    circuit_constructor.enforce_small_deltas(indices);
    StaticAnalyzer graph = StaticAnalyzer(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
}

/**
 * @brief Test graph description of circuit with decompose function
 *
 * @details This test verifies that:
 * - All variables must be in one connected component
 */

TEST(boomerang_ultra_circuit_constructor, composed_range_constraint)
{
    UltraCircuitBuilder circuit_constructor = UltraCircuitBuilder();
    auto c = fr::random_element();
    auto d = uint256_t(c).slice(0, 133);
    auto e = fr(d);
    auto a_idx = circuit_constructor.add_variable(fr(e));
    circuit_constructor.create_add_gate(
        { a_idx, circuit_constructor.zero_idx(), circuit_constructor.zero_idx(), 1, 0, 0, -fr(e) });
    circuit_constructor.create_limbed_range_constraint(a_idx, 134);

    StaticAnalyzer graph = StaticAnalyzer(circuit_constructor);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
}
