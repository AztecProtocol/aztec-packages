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
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->add_accumulate(P1);
    op_queue->mul_accumulate(P2, z);
    op_queue->eq_and_reset();
    op_queue->merge();

    op_queue->add_accumulate(P1);
    op_queue->mul_accumulate(P2, z);
    op_queue->add_accumulate(P1);
    op_queue->mul_accumulate(P2, z);
    op_queue->eq_and_reset();
    // Placeholder for randomness
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->merge(MergeSettings::APPEND, ECCOpQueue::OP_QUEUE_SIZE - op_queue->get_current_subtable_size());

    Fq op_accumulator = 0;
    Fq p_x_accumulator = 0;
    Fq p_y_accumulator = 0;
    Fq z_1_accumulator = 0;
    Fq z_2_accumulator = 0;
    Fq batching_challenge = fq::random_element();

    // Sample the evaluation input x
    Fq x = Fq::random_element();
    // Compute x_pow (power given by the degree of the polynomial) to be number of real ultra ops - 1
    Fq x_pow = Fq(1);
    // Get an inverse
    Fq x_inv = x.invert();
    // Compute the batched evaluation of polynomials (multiplying by inverse to go from lower to higher)
    const auto& ultra_ops = op_queue->get_ultra_ops();
    for (const auto& ultra_op : ultra_ops) {

        if (ultra_op.op_code.is_random_op || ultra_op.op_code.value() == 0) {
            continue;
        }
        op_accumulator = op_accumulator * x_inv + ultra_op.op_code.value();
        const auto [x_u256, y_u256] = ultra_op.get_base_point_standard_form();
        p_x_accumulator = p_x_accumulator * x_inv + x_u256;
        p_y_accumulator = p_y_accumulator * x_inv + y_u256;
        z_1_accumulator = z_1_accumulator * x_inv + uint256_t(ultra_op.z_1);
        z_2_accumulator = z_2_accumulator * x_inv + uint256_t(ultra_op.z_2);
        x_pow *= x;
    }
    x_pow *= x_inv;
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
