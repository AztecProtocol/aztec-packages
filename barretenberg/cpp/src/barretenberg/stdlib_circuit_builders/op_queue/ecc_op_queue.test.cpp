#include "barretenberg/stdlib_circuit_builders/op_queue/ecc_op_queue.hpp"
#include <gtest/gtest.h>

using namespace bb;

TEST(ECCOpQueueTest, Basic)
{
    ECCOpQueue op_queue;
    op_queue.initialize_new_subtable();
    op_queue.add_accumulate(bb::g1::affine_one);
    op_queue.empty_row_for_testing();
    const auto raw_ops = op_queue.get_raw_ops();
    EXPECT_EQ(raw_ops[0].base_point, bb::g1::affine_one);
    EXPECT_EQ(raw_ops[1].add, false);
}

TEST(ECCOpQueueTest, InternalAccumulatorCorrectness)
{
    using point = g1::affine_element;
    using scalar = fr;

    // Compute a simple point accumulation natively
    auto P1 = point::random_element();
    auto P2 = point::random_element();
    auto z = scalar::random_element();
    auto P_expected = P1 + P2 * z;

    // Add the same operations to the ECC op queue; the native computation is performed under the hood.
    ECCOpQueue op_queue;
    op_queue.initialize_new_subtable();
    op_queue.add_accumulate(P1);
    op_queue.mul_accumulate(P2, z);

    // The correct result should now be stored in the accumulator within the op queue
    EXPECT_EQ(op_queue.get_accumulator(), P_expected);

    // Adding an equality op should reset the accumulator to zero (the point at infinity)
    op_queue.eq_and_reset();
    EXPECT_TRUE(op_queue.get_accumulator().is_point_at_infinity());
}
