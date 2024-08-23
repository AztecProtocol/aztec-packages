#include "barretenberg/stdlib_circuit_builders/standard_circuit_builder.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/crypto/generators/generator_data.hpp"
#include "barretenberg/crypto/pedersen_commitment/pedersen.hpp"
#include <gtest/gtest.h>

using namespace bb;

namespace {
auto& engine = numeric::get_debug_randomness();
}

TEST(standard_circuit_constructor, base_case)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();
    fr a = fr::one();
    circuit_constructor.add_public_variable(a);

    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
}

TEST(standard_circuit_constructor, grumpkin_base_case)
{
    StandardGrumpkinCircuitBuilder circuit_constructor = StandardGrumpkinCircuitBuilder();
    grumpkin::fr a = grumpkin::fr::one();
    circuit_constructor.add_public_variable(a);
    grumpkin::fr b = grumpkin::fr::one();
    grumpkin::fr c = a + b;
    grumpkin::fr d = a + c;
    uint32_t a_idx = circuit_constructor.add_variable(a);
    uint32_t b_idx = circuit_constructor.add_variable(b);
    uint32_t c_idx = circuit_constructor.add_variable(c);
    uint32_t d_idx = circuit_constructor.add_variable(d);

    uint32_t w_l_2_idx = circuit_constructor.add_variable(2);
    uint32_t w_r_2_idx = circuit_constructor.add_variable(2);
    uint32_t w_o_2_idx = circuit_constructor.add_variable(4);
    circuit_constructor.create_mul_gate({ w_l_2_idx, w_r_2_idx, w_o_2_idx, 1, -1, 0 });

    circuit_constructor.create_add_gate({ a_idx,
                                          b_idx,
                                          c_idx,
                                          grumpkin::fr::one(),
                                          grumpkin::fr::one(),
                                          grumpkin::fr::neg_one(),
                                          grumpkin::fr::zero() });

    circuit_constructor.create_add_gate({ d_idx,
                                          c_idx,
                                          a_idx,
                                          grumpkin::fr::one(),
                                          grumpkin::fr::neg_one(),
                                          grumpkin::fr::neg_one(),
                                          grumpkin::fr::zero() });

    circuit_constructor.create_add_gate({ d_idx,
                                          c_idx,
                                          b_idx,
                                          grumpkin::fr::one(),
                                          grumpkin::fr::neg_one(),
                                          grumpkin::fr::neg_one(),
                                          grumpkin::fr::zero() });

    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
}

TEST(standard_circuit_constructor, test_add_gate)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();
    fr a = fr::one();
    uint32_t a_idx = circuit_constructor.add_public_variable(a);
    fr b = fr::one();
    fr c = a + b;
    fr d = a + c;
    // uint32_t a_idx = circuit_constructor.add_variable(a);
    uint32_t b_idx = circuit_constructor.add_variable(b);
    uint32_t c_idx = circuit_constructor.add_variable(c);
    uint32_t d_idx = circuit_constructor.add_variable(d);
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });

    circuit_constructor.create_add_gate({ d_idx, c_idx, a_idx, fr::one(), fr::neg_one(), fr::neg_one(), fr::zero() });

    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ b_idx, a_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });

    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });

    bool result = CircuitChecker::check(circuit_constructor); // instance, prover.reference_string.SRS_T2);
    EXPECT_EQ(result, true);
}

TEST(standard_circuit_constructor, test_mul_gate_proofs)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();
    fr q[7]{ fr::random_element(), fr::random_element(), fr::random_element(), fr::random_element(),
             fr::random_element(), fr::random_element(), fr::random_element() };
    fr q_inv[7]{
        q[0].invert(), q[1].invert(), q[2].invert(), q[3].invert(), q[4].invert(), q[5].invert(), q[6].invert(),
    };

    fr a = fr::random_element();
    fr b = fr::random_element();
    fr c = -((((q[0] * a) + (q[1] * b)) + q[3]) * q_inv[2]);
    fr d = -((((q[4] * (a * b)) + q[6]) * q_inv[5]));

    uint32_t a_idx = circuit_constructor.add_variable(a);
    uint32_t b_idx = circuit_constructor.add_variable(b);
    uint32_t c_idx = circuit_constructor.add_variable(c);
    uint32_t d_idx = circuit_constructor.add_variable(d);

    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });

    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, q[0], q[1], q[2], q[3] });
    circuit_constructor.create_mul_gate({ a_idx, b_idx, d_idx, q[4], q[5], q[6] });

    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
}

TEST(standard_circuit_constructor, range_constraint)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();

    for (size_t i = 0; i < 10; ++i) {

        uint32_t value = engine.get_random_uint32();
        fr witness_value = fr{ value, 0, 0, 0 }.to_montgomery_form();
        uint32_t witness_index = circuit_constructor.add_variable(witness_value);

        // include non-nice numbers of bits, that will bleed over gate boundaries
        size_t extra_bits = 2 * (i % 4);

        std::vector<uint32_t> accumulators =
            circuit_constructor.decompose_into_base4_accumulators(witness_index, 32 + extra_bits);

        for (uint32_t j = 0; j < 16; ++j) {
            uint32_t result = (value >> (30U - (2 * j)));
            fr source = circuit_constructor.get_variable(accumulators[j + (extra_bits >> 1)]).from_montgomery_form();
            uint32_t expected = static_cast<uint32_t>(source.data[0]);
            EXPECT_EQ(result, expected);
        }
        for (uint32_t j = 1; j < 16; ++j) {
            uint32_t left = (value >> (30U - (2 * j)));
            uint32_t right = (value >> (30U - (2 * (j - 1))));
            EXPECT_EQ(left - 4 * right < 4, true);
        }
    }

    uint32_t zero_idx = circuit_constructor.add_variable(fr::zero());
    uint32_t one_idx = circuit_constructor.add_variable(fr::one());
    circuit_constructor.create_big_add_gate(
        { zero_idx, zero_idx, zero_idx, one_idx, fr::one(), fr::one(), fr::one(), fr::one(), fr::neg_one() });

    bool result = CircuitChecker::check(circuit_constructor);

    EXPECT_EQ(result, true);
}

TEST(standard_circuit_constructor, range_constraint_fail)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();

    uint64_t value = 0xffffff;
    uint32_t witness_index = circuit_constructor.add_variable(fr(value));

    circuit_constructor.decompose_into_base4_accumulators(witness_index, 23);

    bool result = CircuitChecker::check(circuit_constructor);

    EXPECT_EQ(result, false);
}

TEST(standard_circuit_constructor, and_constraint)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();

    for (size_t i = 0; i < /*10*/ 1; ++i) {
        uint32_t left_value = engine.get_random_uint32();

        fr left_witness_value = fr{ left_value, 0, 0, 0 }.to_montgomery_form();
        uint32_t left_witness_index = circuit_constructor.add_variable(left_witness_value);

        uint32_t right_value = engine.get_random_uint32();
        fr right_witness_value = fr{ right_value, 0, 0, 0 }.to_montgomery_form();
        uint32_t right_witness_index = circuit_constructor.add_variable(right_witness_value);

        uint32_t out_value = left_value & right_value;
        // include non-nice numbers of bits, that will bleed over gate boundaries
        size_t extra_bits = 2 * (i % 4);

        auto accumulators =
            circuit_constructor.create_and_constraint(left_witness_index, right_witness_index, 32 + extra_bits);
        // circuit_constructor.create_and_constraint(left_witness_index, right_witness_index, 32 + extra_bits);

        for (uint32_t j = 0; j < 16; ++j) {
            uint32_t left_expected = (left_value >> (30U - (2 * j)));
            uint32_t right_expected = (right_value >> (30U - (2 * j)));
            uint32_t out_expected = left_expected & right_expected;

            fr left_source =
                circuit_constructor.get_variable(accumulators.left[j + (extra_bits >> 1)]).from_montgomery_form();
            uint32_t left_result = static_cast<uint32_t>(left_source.data[0]);

            fr right_source =
                circuit_constructor.get_variable(accumulators.right[j + (extra_bits >> 1)]).from_montgomery_form();
            uint32_t right_result = static_cast<uint32_t>(right_source.data[0]);

            fr out_source =
                circuit_constructor.get_variable(accumulators.out[j + (extra_bits >> 1)]).from_montgomery_form();
            uint32_t out_result = static_cast<uint32_t>(out_source.data[0]);

            EXPECT_EQ(left_result, left_expected);
            EXPECT_EQ(right_result, right_expected);
            EXPECT_EQ(out_result, out_expected);
        }
        for (uint32_t j = 1; j < 16; ++j) {
            uint32_t left = (left_value >> (30U - (2 * j)));
            uint32_t right = (left_value >> (30U - (2 * (j - 1))));
            EXPECT_EQ(left - 4 * right < 4, true);

            left = (right_value >> (30U - (2 * j)));
            right = (right_value >> (30U - (2 * (j - 1))));
            EXPECT_EQ(left - 4 * right < 4, true);

            left = (out_value >> (30U - (2 * j)));
            right = (out_value >> (30U - (2 * (j - 1))));
            EXPECT_EQ(left - 4 * right < 4, true);
        }
    }

    uint32_t zero_idx = circuit_constructor.add_variable(fr::zero());
    uint32_t one_idx = circuit_constructor.add_variable(fr::one());
    circuit_constructor.create_big_add_gate(
        { zero_idx, zero_idx, zero_idx, one_idx, fr::one(), fr::one(), fr::one(), fr::one(), fr::neg_one() });

    bool result = CircuitChecker::check(circuit_constructor);

    EXPECT_EQ(result, true);
}

TEST(standard_circuit_constructor, xor_constraint)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();

    for (size_t i = 0; i < /*10*/ 1; ++i) {
        uint32_t left_value = engine.get_random_uint32();

        fr left_witness_value = fr{ left_value, 0, 0, 0 }.to_montgomery_form();
        uint32_t left_witness_index = circuit_constructor.add_variable(left_witness_value);

        uint32_t right_value = engine.get_random_uint32();
        fr right_witness_value = fr{ right_value, 0, 0, 0 }.to_montgomery_form();
        uint32_t right_witness_index = circuit_constructor.add_variable(right_witness_value);

        uint32_t out_value = left_value ^ right_value;
        // include non-nice numbers of bits, that will bleed over gate boundaries
        size_t extra_bits = 2 * (i % 4);

        auto accumulators =
            circuit_constructor.create_xor_constraint(left_witness_index, right_witness_index, 32 + extra_bits);

        for (uint32_t j = 0; j < 16; ++j) {
            uint32_t left_expected = (left_value >> (30U - (2 * j)));
            uint32_t right_expected = (right_value >> (30U - (2 * j)));
            uint32_t out_expected = left_expected ^ right_expected;

            fr left_source =
                circuit_constructor.get_variable(accumulators.left[j + (extra_bits >> 1)]).from_montgomery_form();
            uint32_t left_result = static_cast<uint32_t>(left_source.data[0]);

            fr right_source =
                circuit_constructor.get_variable(accumulators.right[j + (extra_bits >> 1)]).from_montgomery_form();
            uint32_t right_result = static_cast<uint32_t>(right_source.data[0]);

            fr out_source =
                circuit_constructor.get_variable(accumulators.out[j + (extra_bits >> 1)]).from_montgomery_form();
            uint32_t out_result = static_cast<uint32_t>(out_source.data[0]);

            EXPECT_EQ(left_result, left_expected);
            EXPECT_EQ(right_result, right_expected);
            EXPECT_EQ(out_result, out_expected);
        }
        for (uint32_t j = 1; j < 16; ++j) {
            uint32_t left = (left_value >> (30U - (2 * j)));
            uint32_t right = (left_value >> (30U - (2 * (j - 1))));
            EXPECT_EQ(left - 4 * right < 4, true);

            left = (right_value >> (30U - (2 * j)));
            right = (right_value >> (30U - (2 * (j - 1))));
            EXPECT_EQ(left - 4 * right < 4, true);

            left = (out_value >> (30U - (2 * j)));
            right = (out_value >> (30U - (2 * (j - 1))));
            EXPECT_EQ(left - 4 * right < 4, true);
        }
    }

    uint32_t zero_idx = circuit_constructor.add_variable(fr::zero());
    uint32_t one_idx = circuit_constructor.add_variable(fr::one());
    circuit_constructor.create_big_add_gate(
        { zero_idx, zero_idx, zero_idx, one_idx, fr::one(), fr::one(), fr::one(), fr::one(), fr::neg_one() });

    bool result = CircuitChecker::check(circuit_constructor);

    EXPECT_EQ(result, true);
}

TEST(standard_circuit_constructor, big_add_gate_with_bit_extract)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();

    const auto generate_constraints = [&circuit_constructor](uint32_t quad_value) {
        uint32_t quad_accumulator_left =
            (engine.get_random_uint32() & 0x3fffffff) - quad_value; // make sure this won't overflow
        uint32_t quad_accumulator_right = (4 * quad_accumulator_left) + quad_value;

        uint32_t left_idx = circuit_constructor.add_variable(uint256_t(quad_accumulator_left));
        uint32_t right_idx = circuit_constructor.add_variable(uint256_t(quad_accumulator_right));

        uint32_t input = engine.get_random_uint32();
        uint32_t output = input + (quad_value > 1 ? 1 : 0);

        circuit_constructor.create_big_add_gate_with_bit_extraction(
            { circuit_constructor.add_variable(uint256_t(input)),
              circuit_constructor.add_variable(uint256_t(output)),
              right_idx,
              left_idx,
              fr(6),
              -fr(6),
              fr::zero(),
              fr::zero(),
              fr::zero() });
    };

    generate_constraints(0);
    generate_constraints(1);
    generate_constraints(2);
    generate_constraints(3);

    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
}

TEST(standard_circuit_constructor, test_range_constraint_fail)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();
    uint32_t witness_index = circuit_constructor.add_variable(fr::neg_one());
    circuit_constructor.decompose_into_base4_accumulators(witness_index, 32);

    bool result = CircuitChecker::check(circuit_constructor);

    EXPECT_EQ(result, false);
}

TEST(standard_circuit_constructor, test_check_circuit_correct)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();
    fr a = fr::one();
    uint32_t a_idx = circuit_constructor.add_public_variable(a);
    fr b = fr::one();
    fr c = a + b;
    fr d = a + c;
    // uint32_t a_idx = circuit_constructor.add_variable(a);
    uint32_t b_idx = circuit_constructor.add_variable(b);
    uint32_t c_idx = circuit_constructor.add_variable(c);
    uint32_t d_idx = circuit_constructor.add_variable(d);
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });

    circuit_constructor.create_add_gate({ d_idx, c_idx, a_idx, fr::one(), fr::neg_one(), fr::neg_one(), fr::zero() });

    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
}

TEST(standard_circuit_constructor, test_check_circuit_broken)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();
    fr a = fr::one();
    uint32_t a_idx = circuit_constructor.add_public_variable(a);
    fr b = fr::one();
    fr c = a + b;
    fr d = a + c + 1;
    // uint32_t a_idx = circuit_constructor.add_variable(a);
    uint32_t b_idx = circuit_constructor.add_variable(b);
    uint32_t c_idx = circuit_constructor.add_variable(c);
    uint32_t d_idx = circuit_constructor.add_variable(d);
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });

    circuit_constructor.create_add_gate({ d_idx, c_idx, a_idx, fr::one(), fr::neg_one(), fr::neg_one(), fr::zero() });

    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, false);
}

TEST(standard_circuit, test_boomerang_value_1)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();
    fr a = fr::random_element();
    uint32_t a_idx = circuit_constructor.add_public_variable(a);
    fr b = fr::random_element();
    fr c = a + b;
    fr d = fr::random_element();
    fr e = d + a; //
    // uint32_t a_idx = circuit_constructor.add_variable(a);
    uint32_t b_idx = circuit_constructor.add_variable(b);
    uint32_t c_idx = circuit_constructor.add_variable(c);
    uint32_t d_idx = circuit_constructor.add_variable(d);
    uint32_t e_idx = circuit_constructor.add_variable(e);
    uint32_t a_duplicate_idx = circuit_constructor.add_variable(
        a); // вот это бумеранг, потому что e работало именно с a, но между ними a_duplicate и a нет никакой связи.
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate(
        { a_duplicate_idx, d_idx, e_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });

    bool result = CircuitChecker::check(circuit_constructor);
    bool result1 = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
    EXPECT_EQ(result1, true);
    circuit_constructor.print_boomerang_variables();
}

TEST(standard_circuit_constructor, print_boomerang_variables)
{
    // need to calculate expression a + 2 * b + 3 * c
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();
    fr a = fr::random_element();
    fr b = fr::random_element();
    fr c = fr::random_element();
    fr two = fr(2);
    fr three = fr(3);
    uint32_t a_idx = circuit_constructor.add_variable(a);
    uint32_t b_idx = circuit_constructor.add_variable(b);
    uint32_t c_idx = circuit_constructor.add_variable(c);
    fr d1 = circuit_constructor.get_variable(a_idx) + two * circuit_constructor.get_variable(b_idx);
    uint32_t d1_idx = circuit_constructor.add_variable(d1);
    fr d2 = circuit_constructor.get_variable(d1_idx) + three * circuit_constructor.get_variable(c_idx);
    uint32_t d2_idx = circuit_constructor.add_variable(d2);
    circuit_constructor.create_add_gate({ d1_idx, c_idx, d2_idx, fr::one(), three, fr::neg_one(), fr::zero() });
    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
    circuit_constructor.print_boomerang_variables();
}

TEST(standard_circuit_constructor, test_logic_constraint)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();
    fr a = fr(1);
    fr b = fr(2);
    uint32_t a_idx = circuit_constructor.add_variable(a);
    uint32_t b_idx = circuit_constructor.add_variable(b);
    size_t num_bits = 2;
    auto accumulators = circuit_constructor.create_logic_constraint(a_idx, b_idx, num_bits, true);
    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
    circuit_constructor.print_boomerang_variables();
}

TEST(standard_circuit_builder, test_boomerang_value_4)
{
    StandardCircuitBuilder circuit_constructor = StandardCircuitBuilder();
    fr a = fr::random_element();
    fr b = fr::random_element();
    fr c = a + b;
    uint32_t a_idx = circuit_constructor.add_variable(a);
    uint32_t b_idx = circuit_constructor.add_variable(b);
    uint32_t c_idx = circuit_constructor.add_variable(c);
    circuit_constructor.create_add_gate({ a_idx, b_idx, c_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    fr d = fr::random_element();
    fr e = fr::random_element();
    fr f = d + e;
    uint32_t d_idx = circuit_constructor.add_variable(d);
    uint32_t e_idx = circuit_constructor.add_variable(e);
    uint32_t f_idx = circuit_constructor.add_variable(f);
    circuit_constructor.create_add_gate({ d_idx, e_idx, f_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    fr g = c * f;
    fr g1 = c + f;
    uint32_t g_idx = circuit_constructor.add_variable(g);
    uint32_t g1_idx = circuit_constructor.add_variable(g1);
    circuit_constructor.create_mul_gate({ c_idx, f_idx, g_idx, fr::one(), fr::neg_one(), fr::zero() });
    circuit_constructor.create_add_gate({ c_idx, f_idx, g1_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    fr g_dupl = circuit_constructor.get_variable(g_idx);
    fr g_inv = g_dupl.invert();
    fr g_2 = g_inv + g1;
    uint32_t g_inv_idx = circuit_constructor.add_variable(g_inv);
    uint32_t g2_idx = circuit_constructor.add_variable(g_2);
    circuit_constructor.create_add_gate({ g_inv_idx, g1_idx, g2_idx, fr::one(), fr::one(), fr::neg_one(), fr::zero() });
    bool result = CircuitChecker::check(circuit_constructor);
    EXPECT_EQ(result, true);
    circuit_constructor.print_boomerang_variables();
}