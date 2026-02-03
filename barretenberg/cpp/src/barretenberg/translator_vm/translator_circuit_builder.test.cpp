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

/**
 * @brief Helper function to compute the expected accumulator result manually
 */
fq compute_expected_result(const std::shared_ptr<ECCOpQueue>& op_queue, const fq& batching_challenge, const fq& x)
{
    using Fq = fq;
    Fq x_inv = x.invert();
    Fq op_accumulator = Fq(0);
    Fq p_x_accumulator = Fq(0);
    Fq p_y_accumulator = Fq(0);
    Fq z_1_accumulator = Fq(0);
    Fq z_2_accumulator = Fq(0);
    Fq x_pow = Fq(1);

    const auto& ultra_ops = op_queue->get_ultra_ops();
    for (const auto& ultra_op : ultra_ops) {
        if (ultra_op.op_code.is_random_op || ultra_op.op_code.value() == 0) {
            continue;
        }
        op_accumulator = op_accumulator * x_inv + ultra_op.op_code.value();
        const auto [x_fq, y_fq] = ultra_op.get_base_point_standard_form();
        p_x_accumulator = p_x_accumulator * x_inv + x_fq;
        p_y_accumulator = p_y_accumulator * x_inv + y_fq;
        z_1_accumulator = z_1_accumulator * x_inv + uint256_t(ultra_op.z_1);
        z_2_accumulator = z_2_accumulator * x_inv + uint256_t(ultra_op.z_2);
        x_pow *= x;
    }
    x_pow *= x_inv;

    // Compute batched polynomial evaluation using Horner's method
    Fq total = z_2_accumulator;  // z₂
    total *= batching_challenge; // z₂ * v
    total += z_1_accumulator;    // z₂ * v + z₁
    total *= batching_challenge; // z₂ * v² + z₁ * v
    total += p_y_accumulator;    // z₂ * v² + z₁ * v + P.y
    total *= batching_challenge; // z₂ * v³ + z₁ * v² + P.y * v
    total += p_x_accumulator;    // z₂ * v³ + z₁ * v² + P.y * v + P.x
    total *= batching_challenge; // z₂ * v⁴ + z₁ * v³ + P.y * v² + P.x * v
    total += op_accumulator;     // z₂ * v⁴ + z₁ * v³ + P.y * v² + P.x * v + op
    total *= x_pow;              // x_pow * ( ... )
    return total;
}
} // namespace
using CircuitChecker = TranslatorCircuitChecker;

// Test that the circuit can handle several accumulations correctly
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

    Fq batching_challenge = Fq::random_element();
    Fq x = Fq::random_element();

    // Create circuit builder and feed the queue inside
    auto circuit_builder = TranslatorCircuitBuilder(batching_challenge, x, op_queue);
    EXPECT_TRUE(CircuitChecker::check(circuit_builder));

    // Verify the accumulator result is correct
    Fq expected_result = compute_expected_result(op_queue, batching_challenge, x);
    EXPECT_EQ(expected_result, CircuitChecker::get_computation_result(circuit_builder));
}

// Test with minimal operations (only required no-ops and random ops)
TEST(TranslatorCircuitBuilder, MinimalOperations)
{
    using Fq = fq;

    auto op_queue = std::make_shared<ECCOpQueue>();
    op_queue->no_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->eq_and_reset();
    op_queue->merge();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->merge(MergeSettings::APPEND, ECCOpQueue::OP_QUEUE_SIZE - op_queue->get_current_subtable_size());

    Fq batching_challenge = Fq::random_element();
    Fq x = Fq::random_element();

    auto circuit_builder = TranslatorCircuitBuilder(batching_challenge, x, op_queue);
    EXPECT_TRUE(CircuitChecker::check(circuit_builder));
}

// Test with only add operations
TEST(TranslatorCircuitBuilder, OnlyAddOperations)
{
    using point = g1::affine_element;
    using Fq = fq;

    auto P1 = point::random_element();
    auto P2 = point::random_element();

    auto op_queue = std::make_shared<ECCOpQueue>();
    op_queue->no_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->add_accumulate(P1);
    op_queue->add_accumulate(P2);
    op_queue->add_accumulate(P1);
    op_queue->eq_and_reset();
    op_queue->merge();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->merge(MergeSettings::APPEND, ECCOpQueue::OP_QUEUE_SIZE - op_queue->get_current_subtable_size());

    Fq batching_challenge = Fq::random_element();
    Fq x = Fq::random_element();

    auto circuit_builder = TranslatorCircuitBuilder(batching_challenge, x, op_queue);
    EXPECT_TRUE(CircuitChecker::check(circuit_builder));

    // Verify the accumulator result is correct
    Fq expected_result = compute_expected_result(op_queue, batching_challenge, x);
    EXPECT_EQ(expected_result, CircuitChecker::get_computation_result(circuit_builder));
}

// Test with only multiplication operations
TEST(TranslatorCircuitBuilder, OnlyMulOperations)
{
    using point = g1::affine_element;
    using scalar = fr;
    using Fq = fq;

    auto P = point::random_element();
    auto z1 = scalar::random_element();
    auto z2 = scalar::random_element();

    auto op_queue = std::make_shared<ECCOpQueue>();
    op_queue->no_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->mul_accumulate(P, z1);
    op_queue->mul_accumulate(P, z2);
    op_queue->eq_and_reset();
    op_queue->merge();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->merge(MergeSettings::APPEND, ECCOpQueue::OP_QUEUE_SIZE - op_queue->get_current_subtable_size());

    Fq batching_challenge = Fq::random_element();
    Fq x = Fq::random_element();

    auto circuit_builder = TranslatorCircuitBuilder(batching_challenge, x, op_queue);
    EXPECT_TRUE(CircuitChecker::check(circuit_builder));

    // Verify the accumulator result is correct
    Fq expected_result = compute_expected_result(op_queue, batching_challenge, x);
    EXPECT_EQ(expected_result, CircuitChecker::get_computation_result(circuit_builder));
}

// Test with multiple no-ops interspersed with real operations
TEST(TranslatorCircuitBuilder, InterspersedNoOps)
{
    using point = g1::affine_element;
    using Fq = fq;

    auto P = point::random_element();

    auto op_queue = std::make_shared<ECCOpQueue>();
    op_queue->no_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->add_accumulate(P);
    op_queue->no_op_ultra_only();
    op_queue->no_op_ultra_only();
    op_queue->add_accumulate(P);
    op_queue->no_op_ultra_only();
    op_queue->eq_and_reset();
    op_queue->merge();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->merge(MergeSettings::APPEND, ECCOpQueue::OP_QUEUE_SIZE - op_queue->get_current_subtable_size());

    Fq batching_challenge = Fq::random_element();
    Fq x = Fq::random_element();

    auto circuit_builder = TranslatorCircuitBuilder(batching_challenge, x, op_queue);
    EXPECT_TRUE(CircuitChecker::check(circuit_builder));

    // Verify the accumulator result is correct
    Fq expected_result = compute_expected_result(op_queue, batching_challenge, x);
    EXPECT_EQ(expected_result, CircuitChecker::get_computation_result(circuit_builder));
}

// Test with point at infinity
TEST(TranslatorCircuitBuilder, PointAtInfinity)
{
    using point = g1::affine_element;
    using Fq = fq;

    auto P_infinity = point::infinity();

    auto op_queue = std::make_shared<ECCOpQueue>();
    op_queue->no_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->add_accumulate(P_infinity);
    op_queue->eq_and_reset();
    op_queue->merge();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->merge(MergeSettings::APPEND, ECCOpQueue::OP_QUEUE_SIZE - op_queue->get_current_subtable_size());

    Fq batching_challenge = Fq::random_element();
    Fq x = Fq::random_element();

    auto circuit_builder = TranslatorCircuitBuilder(batching_challenge, x, op_queue);
    EXPECT_TRUE(CircuitChecker::check(circuit_builder));

    // Verify the accumulator result is correct (point at infinity should contribute P.x=0, P.y=0)
    Fq expected_result = compute_expected_result(op_queue, batching_challenge, x);
    EXPECT_EQ(expected_result, CircuitChecker::get_computation_result(circuit_builder));
}

// Test with scalar = 0
TEST(TranslatorCircuitBuilder, ZeroScalar)
{
    using point = g1::affine_element;
    using scalar = fr;
    using Fq = fq;

    auto P = point::random_element();
    auto zero = scalar::zero();

    auto op_queue = std::make_shared<ECCOpQueue>();
    op_queue->no_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->mul_accumulate(P, zero);
    op_queue->eq_and_reset();
    op_queue->merge();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->merge(MergeSettings::APPEND, ECCOpQueue::OP_QUEUE_SIZE - op_queue->get_current_subtable_size());

    Fq batching_challenge = Fq::random_element();
    Fq x = Fq::random_element();

    auto circuit_builder = TranslatorCircuitBuilder(batching_challenge, x, op_queue);
    EXPECT_TRUE(CircuitChecker::check(circuit_builder));

    // Verify the accumulator result is correct (z=0 should result in P.x*0, P.y*0)
    Fq expected_result = compute_expected_result(op_queue, batching_challenge, x);
    EXPECT_EQ(expected_result, CircuitChecker::get_computation_result(circuit_builder));
}

// Test with many operations to stress test the circuit
TEST(TranslatorCircuitBuilder, ManyOperations)
{
    using point = g1::affine_element;
    using scalar = fr;
    using Fq = fq;

    auto op_queue = std::make_shared<ECCOpQueue>();
    op_queue->no_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();

    // Add many operations
    for (size_t i = 0; i < 20; ++i) {
        auto P = point::random_element();
        auto z = scalar::random_element();
        op_queue->add_accumulate(P);
        op_queue->mul_accumulate(P, z);
    }

    op_queue->eq_and_reset();
    op_queue->merge();
    op_queue->random_op_ultra_only();
    op_queue->random_op_ultra_only();
    op_queue->merge(MergeSettings::APPEND, ECCOpQueue::OP_QUEUE_SIZE - op_queue->get_current_subtable_size());

    Fq batching_challenge = Fq::random_element();
    Fq x = Fq::random_element();

    auto circuit_builder = TranslatorCircuitBuilder(batching_challenge, x, op_queue);
    EXPECT_TRUE(CircuitChecker::check(circuit_builder));

    // Verify the accumulator result is correct (stress test with many operations)
    Fq expected_result = compute_expected_result(op_queue, batching_challenge, x);
    EXPECT_EQ(expected_result, CircuitChecker::get_computation_result(circuit_builder));
}

// Test determinism - same inputs should produce same circuit and same result
TEST(TranslatorCircuitBuilder, Determinism)
{
    using point = g1::affine_element;
    using scalar = fr;
    using Fq = fq;

    auto P = point::random_element();
    auto z = scalar::random_element();
    Fq batching_challenge = Fq::random_element();
    Fq x = Fq::random_element();

    // Build first circuit
    auto op_queue1 = std::make_shared<ECCOpQueue>();
    op_queue1->no_op_ultra_only();
    op_queue1->random_op_ultra_only();
    op_queue1->random_op_ultra_only();
    op_queue1->random_op_ultra_only();
    op_queue1->add_accumulate(P);
    op_queue1->mul_accumulate(P, z);
    op_queue1->eq_and_reset();
    op_queue1->merge();
    op_queue1->random_op_ultra_only();
    op_queue1->random_op_ultra_only();
    op_queue1->merge(MergeSettings::APPEND, ECCOpQueue::OP_QUEUE_SIZE - op_queue1->get_current_subtable_size());

    auto circuit_builder1 = TranslatorCircuitBuilder(batching_challenge, x, op_queue1);
    auto result1 = CircuitChecker::get_computation_result(circuit_builder1);

    // Build second circuit with same operations
    auto op_queue2 = std::make_shared<ECCOpQueue>();
    op_queue2->no_op_ultra_only();
    op_queue2->random_op_ultra_only();
    op_queue2->random_op_ultra_only();
    op_queue2->random_op_ultra_only();
    op_queue2->add_accumulate(P);
    op_queue2->mul_accumulate(P, z);
    op_queue2->eq_and_reset();
    op_queue2->merge();
    op_queue2->random_op_ultra_only();
    op_queue2->random_op_ultra_only();
    op_queue2->merge(MergeSettings::APPEND, ECCOpQueue::OP_QUEUE_SIZE - op_queue2->get_current_subtable_size());

    auto circuit_builder2 = TranslatorCircuitBuilder(batching_challenge, x, op_queue2);
    auto result2 = CircuitChecker::get_computation_result(circuit_builder2);

    EXPECT_EQ(result1, result2);
}
