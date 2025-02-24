#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/numeric/random/engine.hpp"

#include "barretenberg/ecc/curves/bn254/fq.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

#include "barretenberg/stdlib/primitives/bool/bool.hpp"
#include "barretenberg/stdlib/primitives/byte_array/byte_array.hpp"
#include "barretenberg/stdlib/primitives/field/field.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/transcript/origin_tag.hpp"
#include "barretenberg/common/test.hpp"
#include <memory>
#include <utility>

using namespace bb;
using namespace cdg;

namespace {
auto& engine = numeric::get_debug_randomness();
}

using Builder = UltraCircuitBuilder;
using bn254 = stdlib::bn254<Builder>;
using fr_ct = bn254::ScalarField;
using fq_ct = bn254::BaseField;
using public_witness_ct = bn254::public_witness_ct;
using witness_ct = bn254::witness_ct;

void fix_bigfield_element(const fq_ct& element) {
    for (int i = 0; i < 4; i++) {
        element.binary_basis_limbs[i].element.fix_witness();
    }
    element.prime_basis_limb.fix_witness();
}

/**
 * @brief this test checks graph description for bigfield constructors
 * The result is one connected component with one variable in one gate,
 * testing different types of bigfield construction
 * @details Tests construction of:
 *          - Constant value
 *          - Witness from u512
 *          - Small field witness
 *          - Mixed construction with lower limb addition
 */
TEST(boomerang_bigfield, test_graph_description_bigfield_constructors) { 
    Builder builder;
    [[maybe_unused]]fq_ct constant = fq_ct(1);
    [[maybe_unused]]fq_ct var = fq_ct::create_from_u512_as_witness(&builder, 1);
    [[maybe_unused]]fr_ct small_var = witness_ct(&builder, fr(1));
    [[maybe_unused]]fq_ct mixed = fq_ct(1).add_to_lower_limb(small_var, 1);
    [[maybe_unused]]fq_ct r;

    auto graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 1);
}

/**
 * @brief this test checks graph description for bigfield addition operations
 * The result is one connected component with no variables in one gate,
 * testing various addition combinations with fix_bigfield_element
 */
TEST(boomerang_bigfield, test_graph_description_bigfield_addition) {
    Builder builder;
    [[maybe_unused]]fq_ct var = fq_ct::create_from_u512_as_witness(&builder, 1);
    [[maybe_unused]]fr_ct small_var = witness_ct(&builder, fr(1));
    [[maybe_unused]]fq_ct mixed = fq_ct(1).add_to_lower_limb(small_var, 1);
    [[maybe_unused]]fq_ct r;
    [[maybe_unused]]fq_ct r1;
    [[maybe_unused]]fq_ct r2;

    r = mixed + var;
    fix_bigfield_element(r);
    r1 = r + mixed;
    fix_bigfield_element(r1);
    r2 = r + var;
    fix_bigfield_element(r2);

    auto graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

/**
 * @brief this test checks graph description for bigfield subtraction operations
 * The result is one connected component with no variables in one gate,
 * testing all possible subtraction combinations between mixed, constant, and variable values
 */
TEST(boomerang_bigfield, test_graph_description_bigfield_substraction) {
    Builder builder;
    [[maybe_unused]]fq_ct constant = fq_ct(1);
    [[maybe_unused]]fq_ct var = fq_ct::create_from_u512_as_witness(&builder, 1);
    [[maybe_unused]]fr_ct small_var = witness_ct(&builder, fr(1));
    [[maybe_unused]]fq_ct mixed = fq_ct(1).add_to_lower_limb(small_var, 1);
    [[maybe_unused]]fq_ct r;

    r = mixed - mixed;
    fix_bigfield_element(r);
    r = mixed - constant;
    fix_bigfield_element(r);
    r = mixed - var;
    fix_bigfield_element(r);
    r = var - mixed;
    fix_bigfield_element(r);

    auto graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
    for (const auto& elem: variables_in_one_gate) {
        info("elem == ", elem);
    }
}

/**
 * @brief this test checks graph description for bigfield multiplication operations
 * The result is one connected component with no variables in one gate,
 * testing all possible multiplication combinations
 */
TEST(boomerang_bigfield, test_graph_description_bigfield_multiplication) {
    Builder builder;
    [[maybe_unused]]fq_ct constant = fq_ct(1);
    [[maybe_unused]]fq_ct var = fq_ct::create_from_u512_as_witness(&builder, 1);
    [[maybe_unused]]fr_ct small_var = witness_ct(&builder, fr(1));
    [[maybe_unused]]fq_ct mixed = fq_ct(1).add_to_lower_limb(small_var, 1);
    [[maybe_unused]]fq_ct r;

    r = var * constant;
    r = constant * constant;
    r = mixed * var;
    r = mixed * constant;
    r = mixed * mixed;
    auto graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

/**
 * @brief this test checks graph description for bigfield division operations
 * The result is one connected component with three variables in one gate,
 * testing division operations with circuit checking
 * @details Each division operator creates one inverse variable for polynomial gate check (a * a_inv - 1 = 0)
 */
TEST(boomerang_bigfield, test_graph_description_bigfield_division) {
    Builder builder;
    [[maybe_unused]]fq_ct constant = fq_ct(1);
    [[maybe_unused]]fq_ct var = fq_ct::create_from_u512_as_witness(&builder, 1);
    [[maybe_unused]]fr_ct small_var = witness_ct(&builder, fr(1));
    [[maybe_unused]]fq_ct mixed = fq_ct(1).add_to_lower_limb(small_var, 1);
    [[maybe_unused]]fq_ct r;

    r = constant / var;
    fix_bigfield_element(r);
    r = constant / constant;
    r = mixed / mixed;
    fix_bigfield_element(r);
    r = mixed / var;
    fix_bigfield_element(r);

    CircuitChecker::check(builder);
    auto graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    //every operator / in bigfield creates one inverse variable for poly gate to check a * a_inv - 1 = 0. 
    //it is the false case, but it will be secure just to check that there are no other variables except for them
    //otherwise there is a possibility to remove dangerous variables from other functions.
    EXPECT_EQ(variables_in_one_gate.size(), 3);     
}

/**
 * @brief this test checks graph description for mixed bigfield operations
 * The result is one connected component with two variables in one gate,
 * testing combinations of addition, subtraction, multiplication and division
 */
TEST(boomerang_bigfield, test_graph_description_bigfield_mix_operations) {
    auto builder = Builder();
    fq_ct constant = fq_ct(1);
    fq_ct var = fq_ct::create_from_u512_as_witness(&builder, 1);
    fr_ct small_var = witness_ct(&builder, fr(1));
    fq_ct mixed = fq_ct(1).add_to_lower_limb(small_var, 1);
    fq_ct r;

    r = mixed + mixed;
    fix_bigfield_element(r);
    r = mixed - mixed;
    fix_bigfield_element(r);
    r = mixed + var;
    fix_bigfield_element(r);
    r = mixed + constant;
    fix_bigfield_element(r);
    r = mixed - var;
    fix_bigfield_element(r);
    r = mixed - constant;
    fix_bigfield_element(r);
    r = var - mixed;
    fix_bigfield_element(r);

    r = var * constant;
    fix_bigfield_element(r);
    r = constant / var;
    fix_bigfield_element(r);
    r = constant * constant;
    r = constant / constant;

    r = mixed * var;
    fix_bigfield_element(r);
    r = mixed / var;
    fix_bigfield_element(r);
    r = mixed * mixed;
    fix_bigfield_element(r);
    r = mixed * constant;
    fix_bigfield_element(r);
    auto graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 2);
}

/**
 * @brief this test checks graph description for high/low bits constructor and operations
 * The result is one connected component with no variables in one gate,
 * testing bit-sliced construction and repeated additions
 */
TEST(boomerang_bigfield, test_graph_description_constructor_high_low_bits_and_operations) {
    auto builder = Builder();
    size_t num_repetitions = 3;
    fq inputs[2]{ fq::random_element(), fq::random_element() };
    fq_ct a(witness_ct(&builder, fr(uint256_t(inputs[0]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
            witness_ct(&builder, fr(uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
    fq_ct b(witness_ct(&builder, fr(uint256_t(inputs[1]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
            witness_ct(&builder, fr(uint256_t(inputs[1]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
    fq_ct c = a * b;
    for (size_t i = 0; i < num_repetitions; ++i) {
        fq d = fq::random_element();
        fq_ct d1(witness_ct(&builder, fr(uint256_t(d).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                 witness_ct(&builder, fr(uint256_t(d).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
        c = c + d1;
    }
    fix_bigfield_element(c);
    auto graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), 1); 
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

/**
 * @brief this test checks graph description for multiple multiplication operations
 * The result is num_repetitions connected components with no variables in one gate,
 * testing independent multiplication operations
 */
TEST(boomerang_bigfield, test_graph_description_mul_function) {
    auto builder = Builder();
    size_t num_repetitions = 4;
    for (size_t i = 0; i < num_repetitions; ++i) {
        fq inputs[2]{ fq::random_element(), fq::random_element()};
        fq_ct a(witness_ct(&builder, fr(uint256_t(inputs[0]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                witness_ct(&builder, fr(uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
        fq_ct b(witness_ct(&builder, fr(uint256_t(inputs[1]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                witness_ct(&builder, fr(uint256_t(inputs[1]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));

        fq_ct c = a * b;
        fix_bigfield_element(c);
    }
    auto graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), num_repetitions);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

/**
 * @brief this test checks graph description for square operations
 * The result is num_repetitions connected components with no variables in one gate,
 * testing repeated squaring operations on random inputs
 */
TEST(boomerang_bigfield, test_graph_description_sqr_function) {
    auto builder = Builder();
    size_t num_repetitions = 10;
    for (size_t i = 0; i < num_repetitions; ++i) {
        fq input = fq::random_element();
        fq_ct a(witness_ct(&builder, fr(uint256_t(input).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                witness_ct(&builder, fr(uint256_t(input).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
        fq_ct c = a.sqr();
        fix_bigfield_element(c);
    }
    auto graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), num_repetitions);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

/**
 * @brief this test checks graph description for multiply-add operations
 * The result is num_repetitions connected components with no variables in one gate,
 * testing multiply-add operations with three inputs
 */
TEST(boomerang_bigfield, test_graph_description_madd_function) {
    auto builder = Builder();
    size_t num_repetitions = 5;
    for (size_t i = 0; i < num_repetitions; ++i) {
        fq inputs[3]{ fq::random_element(), fq::random_element(), fq::random_element() };
        fq_ct a(witness_ct(&builder, fr(uint256_t(inputs[0]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                witness_ct(&builder, fr(uint256_t(inputs[0]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
        fq_ct b(witness_ct(&builder, fr(uint256_t(inputs[1]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                witness_ct(&builder, fr(uint256_t(inputs[1]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
        fq_ct c(witness_ct(&builder, fr(uint256_t(inputs[2]).slice(0, fq_ct::NUM_LIMB_BITS * 2))),
                witness_ct(&builder, fr(uint256_t(inputs[2]).slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 4))));
        [[maybe_unused]]fq_ct d = a.madd(b, { c }); 
        fix_bigfield_element(d);
    }
    auto graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    EXPECT_EQ(connected_components.size(), num_repetitions);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

/**
 * @brief this test checks graph description for multiple multiply-add operations
 * The result is connected components with no variables in one gate,
 * testing batch multiply-add operations with multiple inputs
 * @details Uses arrays of size number_of_madds=16 for left multiply, right multiply and add values
 */
TEST(boomerang_bigfield, test_graph_description_mult_madd_function) {

    auto builder = Builder();
    size_t num_repetitions = 1;
    const size_t number_of_madds = 16;
    for (size_t i = 0; i < num_repetitions; ++i) {
        fq mul_left_values[number_of_madds];
        fq mul_right_values[number_of_madds];
        fq to_add_values[number_of_madds];

        std::vector<fq_ct> mul_left;
        std::vector<fq_ct> mul_right;
        std::vector<fq_ct> to_add;
        mul_left.reserve(number_of_madds);
        mul_right.reserve(number_of_madds);
        to_add.reserve(number_of_madds);
        for (size_t j = 0; j < number_of_madds; j++) {
            mul_left_values[j] = fq::random_element();
            mul_right_values[j] = fq::random_element();
            mul_left.emplace_back(
                fq_ct::create_from_u512_as_witness(&builder, uint512_t(uint256_t(mul_left_values[j]))));
            mul_right.emplace_back(
                fq_ct::create_from_u512_as_witness(&builder, uint512_t(uint256_t(mul_right_values[j]))));
            to_add_values[j] = fq::random_element();
            to_add.emplace_back(
                fq_ct::create_from_u512_as_witness(&builder, uint512_t(uint256_t(to_add_values[j]))));
        }
        fq_ct f = fq_ct::mult_madd(mul_left, mul_right, to_add);
        fix_bigfield_element(f);
    }
    builder.finalize_circuit(false);
    auto graph = Graph(builder);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0); 
}

/**
 * @brief this test checks graph description for high/low bits constructor
 * The result is connected components with no variables in one gate,
 * testing basic multiplication with bit-sliced construction
 */
TEST(boomerang_bigfield, test_graph_description_constructor_high_low_bits)
{
    auto builder = Builder();
    fq mul_left_value = fq::random_element();
    fq mul_right_value = fq::random_element();
    //fq mul_right_value = fq::random_element();
    [[maybe_unused]]fq_ct mul_left = fq_ct::create_from_u512_as_witness(&builder, uint512_t(uint256_t(mul_left_value)));
    [[maybe_unused]]fq_ct mul_right = fq_ct::create_from_u512_as_witness(&builder, uint512_t(uint256_t(mul_right_value)));
    fq_ct product = mul_left * mul_right;
    fix_bigfield_element(product);
    builder.finalize_circuit(false);
    auto graph = Graph(builder);
    auto connected_components = graph.find_connected_components();
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

