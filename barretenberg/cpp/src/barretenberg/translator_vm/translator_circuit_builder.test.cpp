#include "translator_circuit_builder.hpp"
#include "barretenberg/circuit_checker/translator_circuit_checker.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include <array>
#include <cstddef>
#include <gtest/gtest.h>

using namespace bb;
namespace {
auto& engine = numeric::get_debug_randomness();
}
using CircuitChecker = TranslatorCircuitChecker;
/**
 * @brief Check that a single accumulation gate is created correctly
 *
 */
TEST(TranslatorCircuitBuilder, CircuitBuilderBaseCase)
{
    using Fq = ::curve::BN254::BaseField;
    using Fr = ::curve::BN254::ScalarField;

    constexpr size_t NUM_LIMB_BITS = TranslatorCircuitBuilder::NUM_LIMB_BITS;
    constexpr size_t NUM_Z_BITS = TranslatorCircuitBuilder::NUM_Z_BITS;

    // Generate random EccOpQueue transcript values
    EccOpCode op_code;
    switch (engine.get_random_uint8() % 4) {
    case 0:
        op_code = {};
        break;
    case 1:
        op_code = { .eq = true, .reset = true };
        break;
    case 2:
        op_code = { .mul = true };
        break;
    case 3:
        op_code = { .add = true };
        break;
    }
    auto get_random_z_scalar = []() { return Fr(engine.get_random_uint256().slice(0, NUM_Z_BITS)); };

    Fq p_x = Fq::random_element();
    Fr p_x_lo = uint256_t(p_x).slice(0, 2 * NUM_LIMB_BITS);
    Fr p_x_hi = uint256_t(p_x).slice(2 * NUM_LIMB_BITS, 4 * NUM_LIMB_BITS);
    Fq p_y = Fq::random_element();
    Fr p_y_lo = uint256_t(p_y).slice(0, 2 * NUM_LIMB_BITS);
    Fr p_y_hi = uint256_t(p_y).slice(2 * NUM_LIMB_BITS, 4 * NUM_LIMB_BITS);
    Fr z_1 = get_random_z_scalar();
    Fr z_2 = get_random_z_scalar();
    Fq v = Fq::random_element();
    Fq x = Fq::random_element();

    Fq previous_accumulator = Fq(0);

    // Create a circuit builder
    auto circuit_builder = TranslatorCircuitBuilder(v, x);
    UltraOp op = UltraOp{
        .op_code = op_code, .x_lo = p_x_lo, .x_hi = p_x_hi, .y_lo = p_y_lo, .y_hi = p_y_hi, .z_1 = z_1, .z_2 = z_2
    };

    // Generate the witness for a single step
    TranslatorCircuitBuilder::AccumulationInput single_accumulation_step =
        TranslatorCircuitBuilder::generate_witness_values(op, previous_accumulator, v, x);

    // Submit one accumulation step in the builder
    circuit_builder.create_accumulation_gate(single_accumulation_step);
    // Check if the circuit fails
    EXPECT_TRUE(TranslatorCircuitChecker::check(circuit_builder));
}

/**
 * @brief Check that the circuit can handle several accumulations
 *
 */
TEST(TranslatorCircuitBuilder, SeveralOperationCorrectness)
{
    using point = g1::affine_element;
    using scalar = fr;
    using Fq = fq;

    auto P1 = point::random_element();
    auto P2 = point::random_element();
    auto z = scalar::random_element();

    // Add the same operations to the ECC op queue; the native computation is performed under the hood.
    auto op_queue = std::make_shared<ECCOpQueue>();
    op_queue->no_op_ultra_only();
    op_queue->add_accumulate(P1);
    op_queue->mul_accumulate(P2, z);
    Fq op_accumulator = 0;
    Fq p_x_accumulator = 0;
    Fq p_y_accumulator = 0;
    Fq z_1_accumulator = 0;
    Fq z_2_accumulator = 0;
    Fq batching_challenge = fq::random_element();

    op_queue->eq_and_reset();
    op_queue->empty_row_for_testing();

    // Sample the evaluation input x
    Fq x = Fq::random_element();
    // Get an inverse
    Fq x_inv = x.invert();
    // Compute the batched evaluation of polynomials (multiplying by inverse to go from lower to higher)
    const auto& ultra_ops = op_queue->get_ultra_ops();
    for (size_t i = 1; i < ultra_ops.size(); i++) {
        const auto& ecc_op = ultra_ops[i];
        op_accumulator = op_accumulator * x_inv + ecc_op.op_code.value();
        const auto [x_u256, y_u256] = ecc_op.get_base_point_standard_form();
        p_x_accumulator = p_x_accumulator * x_inv + x_u256;
        p_y_accumulator = p_y_accumulator * x_inv + y_u256;
        z_1_accumulator = z_1_accumulator * x_inv + uint256_t(ecc_op.z_1);
        z_2_accumulator = z_2_accumulator * x_inv + uint256_t(ecc_op.z_2);
    }
    // The degree is ultra_ops.size() - 2 as we ignore the first no-op in computation
    Fq x_pow = x.pow(ultra_ops.size() - 2);

    // Multiply by an appropriate power of x to get rid of the inverses
    Fq result = ((((z_2_accumulator * batching_challenge + z_1_accumulator) * batching_challenge + p_y_accumulator) *
                      batching_challenge +
                  p_x_accumulator) *
                     batching_challenge +
                 op_accumulator) *
                x_pow;

    // Create circuit builder and feed the queue inside
    auto circuit_builder = TranslatorCircuitBuilder(batching_challenge, x, op_queue);
    // Check that the circuit passes
    EXPECT_TRUE(CircuitChecker::check(circuit_builder));
    // Check the accumulation result stored as 4 limbs in the circuit and then reconstructed is consistent with the
    // value computed by hand.
    EXPECT_EQ(result, CircuitChecker::get_computation_result(circuit_builder));
}
