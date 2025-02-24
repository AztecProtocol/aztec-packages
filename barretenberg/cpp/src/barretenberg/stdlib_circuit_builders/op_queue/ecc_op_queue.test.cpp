#include "barretenberg/stdlib_circuit_builders/op_queue/ecc_op_queue.hpp"
#include <gtest/gtest.h>

using namespace bb;

class ECCOpQueueTest {
  public:
    using Curve = curve::BN254;
    using G1 = Curve::AffineElement;
    using Fr = Curve::ScalarField;

    // Perform some basic interactions with the ECC op queue to mock the behavior of a single circuit
    static void populate_an_arbitrary_subtable_of_ops(const std::shared_ptr<bb::ECCOpQueue>& op_queue)
    {
        auto P1 = G1::random_element();
        auto P2 = G1::random_element();
        auto z = Fr::random_element();

        op_queue->initialize_new_subtable();
        op_queue->add_accumulate(P1);
        op_queue->mul_accumulate(P2, z);
        op_queue->eq_and_reset();
    }
};

TEST(ECCOpQueueTest, Basic)
{
    using G1 = ECCOpQueueTest::G1;

    ECCOpQueue op_queue;
    op_queue.initialize_new_subtable();
    op_queue.add_accumulate(bb::g1::affine_one);
    op_queue.empty_row_for_testing();
    const auto& raw_ops = op_queue.get_raw_ops();
    EXPECT_EQ(raw_ops[0].base_point, G1::one());
    EXPECT_EQ(raw_ops[1].add, false);
}

TEST(ECCOpQueueTest, InternalAccumulatorCorrectness)
{
    using G1 = ECCOpQueueTest::G1;
    using Fr = ECCOpQueueTest::Fr;

    // Compute a simple point accumulation natively
    auto P1 = G1::random_element();
    auto P2 = G1::random_element();
    auto z = Fr::random_element();
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

// Check that the ECC op queue correctly constructs the table column polynomials for the full table, the previous table,
// and the current subtable via successive prepending of subtables
TEST(ECCOpQueueTest, ColumnPolynomialConstruction)
{
    using Fr = fr;

    // Instantiate and EccOpQueue and populate it with several subtables of ECC ops
    auto op_queue = std::make_shared<bb::ECCOpQueue>();

    const size_t NUM_SUBTABLES = 5;
    for (size_t i = 0; i < NUM_SUBTABLES; ++i) {
        ECCOpQueueTest::populate_an_arbitrary_subtable_of_ops(op_queue);
    }

    // Construct column polynomials corresponding to the full table (T), the previous table (T_prev), and the current
    // subtable (t_current)
    std::array<Polynomial<Fr>, 4> table_polynomials = op_queue->get_ultra_ops_table_columns();
    std::array<Polynomial<Fr>, 4> previous_table_polynomials = op_queue->get_previous_ultra_ops_table_columns();
    std::array<Polynomial<Fr>, 4> subtable_polynomials = op_queue->get_current_subtable_columns();

    // Check that the table polynomials are constructed correctly by checking the following identity at a single point:
    // T(x) = t_current(x) + x^k * T_prev(x), where k is the size of the current subtable
    const size_t current_subtable_size = op_queue->get_current_ultra_ops_subtable_size();

    Fr eval_challenge = Fr::random_element();

    std::array<Fr, 4> table_evals;
    std::array<Fr, 4> shifted_previous_table_evals;
    std::array<Fr, 4> subtable_evals;
    for (auto [eval, poly] : zip_view(table_evals, table_polynomials)) {
        eval = poly.evaluate(eval_challenge); // T(x)
    }
    for (auto [eval, poly] : zip_view(shifted_previous_table_evals, previous_table_polynomials)) {
        eval = poly.evaluate(eval_challenge);
        eval *= eval_challenge.pow(current_subtable_size); // x^k * T_prev(x)
    }
    for (auto [eval, poly] : zip_view(subtable_evals, subtable_polynomials)) {
        eval = poly.evaluate(eval_challenge); // t_current(x)
    }

    // Check T(x) = t_current(x) + x^k * T_prev(x)
    for (auto [table_eval, shifted_previous_table_eval, subtable_eval] :
         zip_view(table_evals, shifted_previous_table_evals, subtable_evals)) {
        EXPECT_EQ(table_eval, subtable_eval + shifted_previous_table_eval);
    }
}
