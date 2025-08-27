#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include <gtest/gtest.h>

using namespace bb;

class ECCOpQueueTest {
  public:
    using Curve = curve::BN254;
    using G1 = Curve::AffineElement;
    using Fr = Curve::ScalarField;
    using Polynomial = bb::Polynomial<Fr>;

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

    /**
     * @brief Check that the table column polynomials reconstructed by the op queue have the correct relationship
     *
     */
    static void check_table_column_polynomials(const std::shared_ptr<bb::ECCOpQueue>& op_queue,
                                               MergeSettings settings,
                                               std::optional<size_t> ultra_fixed_offset = std::nullopt)
    {
        // Construct column polynomials corresponding to the full table (T), the previous table (T_prev), and the
        // current subtable (t_current)
        auto table_polynomials = op_queue->construct_ultra_ops_table_columns();
        auto prev_table_polynomials = op_queue->construct_previous_ultra_ops_table_columns();
        auto subtable_polynomials = op_queue->construct_current_ultra_ops_subtable_columns();

        // Check T(x) = t_current(x) + x^k * T_prev(x) at a single random challenge point
        Fr eval_challenge = Fr::random_element();
        for (auto [table_poly, prev_table_poly, subtable_poly] :
             zip_view(table_polynomials, prev_table_polynomials, subtable_polynomials)) {
            const Fr table_eval = table_poly.evaluate(eval_challenge); // T(x)
            // Check that the previous table polynomial is constructed correctly according to the merge settings by
            // checking the identity at a single point
            if (settings == MergeSettings::PREPEND) {
                // T(x) = t_current(x) + x^k * T_prev(x), where k is the size of the current subtable
                const size_t current_subtable_size = op_queue->get_current_ultra_ops_subtable_num_rows(); // k
                const Fr subtable_eval = subtable_poly.evaluate(eval_challenge); // t_current(x)
                const Fr shifted_previous_table_eval = prev_table_poly.evaluate(eval_challenge) *
                                                       eval_challenge.pow(current_subtable_size); // x^k * T_prev(x)
                EXPECT_EQ(table_eval, subtable_eval + shifted_previous_table_eval);
            } else {
                // APPEND merge performs concatenation directly to end of previous table or at a specified fixed offset
                const size_t prev_table_size = op_queue->get_previous_ultra_ops_table_num_rows(); // k
                const size_t shift_magnitude = ultra_fixed_offset.value_or(prev_table_size);
                // T(x) = T_prev(x) + x^k * t_current(x), where k is the shift magnitude
                const Fr prev_table_eval = prev_table_poly.evaluate(eval_challenge); // T_prev(x)
                const Fr shifted_subtable_eval =
                    subtable_poly.evaluate(eval_challenge) * eval_challenge.pow(shift_magnitude); // x^k * t_current(x)
                EXPECT_EQ(table_eval, shifted_subtable_eval + prev_table_eval);
            }
        }
    }

    /**
     * @brief  Check that the opcode values are consistent between the ultra ops table and the eccvm ops table
     *
     * @param op_queue
     */
    static void check_opcode_consistency_with_eccvm(const std::shared_ptr<bb::ECCOpQueue>& op_queue)
    {
        auto ultra_table = op_queue->get_ultra_ops();
        auto eccvm_table = op_queue->get_eccvm_ops();

        EXPECT_EQ(eccvm_table.size(), ultra_table.size());
        for (size_t i = 0; i < eccvm_table.size(); ++i) {
            EXPECT_EQ(ultra_table[2 * i], eccvm_table[i].op_code.value());
            EXPECT_EQ(ultra_table[2 * i + 1], eccvm_table[i].op_code.value());
        }
    };
};

TEST(ECCOpQueueTest, Basic)
{
    using G1 = ECCOpQueueTest::G1;

    ECCOpQueue op_queue;
    op_queue.add_accumulate(bb::g1::affine_one);
    op_queue.empty_row_for_testing();
    op_queue.merge();
    const auto& eccvm_ops = op_queue.get_eccvm_ops();
    EXPECT_EQ(eccvm_ops[0].base_point, G1::one());
    EXPECT_EQ(eccvm_ops[1].op_code.add, false);
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
TEST(ECCOpQueueTest, ColumnPolynomialConstructionPrependOnly)
{

    // Instantiate an EccOpQueue and populate it with several subtables of ECC ops
    auto op_queue = std::make_shared<bb::ECCOpQueue>();

    // Check that the table polynomials have the correct form after each subtable concatenation
    const size_t NUM_SUBTABLES = 5;
    for (size_t i = 0; i < NUM_SUBTABLES; ++i) {
        ECCOpQueueTest::populate_an_arbitrary_subtable_of_ops(op_queue);
        MergeSettings settings = MergeSettings::PREPEND;
        op_queue->merge(settings);
        ECCOpQueueTest::check_table_column_polynomials(op_queue, settings);
    }

    ECCOpQueueTest::check_opcode_consistency_with_eccvm(op_queue);
}

TEST(ECCOpQueueTest, ColumnPolynomialConstructionPrependThenAppend)
{

    // Instantiate an EccOpQueue and populate it with several subtables of ECC ops
    auto op_queue = std::make_shared<bb::ECCOpQueue>();

    // Check that the table polynomials have the correct form after each subtable concatenation
    const size_t NUM_SUBTABLES = 2;
    for (size_t i = 0; i < NUM_SUBTABLES; ++i) {
        ECCOpQueueTest::populate_an_arbitrary_subtable_of_ops(op_queue);
        MergeSettings settings = MergeSettings::PREPEND;
        op_queue->merge(settings);
        ECCOpQueueTest::check_table_column_polynomials(op_queue, settings);
    }

    // Do a single append operation
    ECCOpQueueTest::populate_an_arbitrary_subtable_of_ops(op_queue);
    MergeSettings settings = MergeSettings::APPEND;
    op_queue->merge(settings);
    ECCOpQueueTest::check_table_column_polynomials(op_queue, settings);

    ECCOpQueueTest::check_opcode_consistency_with_eccvm(op_queue);
}

TEST(ECCOpQueueTest, ColumnPolynomialConstructionPrependThenAppendAtFixedOffset)
{

    // Instantiate an EccOpQueue and populate it with several subtables of ECC ops
    auto op_queue = std::make_shared<bb::ECCOpQueue>();

    // Check that the table polynomials have the correct form after each subtable concatenation
    const size_t NUM_SUBTABLES = 2;
    for (size_t i = 0; i < NUM_SUBTABLES; ++i) {
        ECCOpQueueTest::populate_an_arbitrary_subtable_of_ops(op_queue);
        MergeSettings settings = MergeSettings::PREPEND;
        op_queue->merge(settings);
        ECCOpQueueTest::check_table_column_polynomials(op_queue, settings);
    }

    // Do a single append operation at a fixed offset (sufficiently large as to not overlap with the existing table)
    const size_t ultra_fixed_offset = op_queue->get_ultra_ops_table_num_rows() + 20;
    ECCOpQueueTest::populate_an_arbitrary_subtable_of_ops(op_queue);
    MergeSettings settings = MergeSettings::APPEND;
    op_queue->merge(settings, ultra_fixed_offset);
    ECCOpQueueTest::check_table_column_polynomials(op_queue, settings, ultra_fixed_offset);

    ECCOpQueueTest::check_opcode_consistency_with_eccvm(op_queue);
}
