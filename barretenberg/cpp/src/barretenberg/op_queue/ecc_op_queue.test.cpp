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
    static void populate_an_arbitrary_subtable_of_ops(const std::shared_ptr<bb::ECCOpQueue>& op_queue,
                                                      bool initialize = true)
    {
        auto P1 = G1::random_element();
        auto P2 = G1::random_element();
        auto z = Fr::random_element();

        if (initialize) {
            op_queue->initialize_new_subtable();
        }
        op_queue->add_accumulate(P1);
        op_queue->mul_accumulate(P2, z);
        op_queue->eq_and_reset();
    }

    /**
     * @brief Check that the table column polynomials reconstructed by the op queue have the correct relationship
     *
     */
    static void check_final_table_column_polynomials(const std::shared_ptr<bb::ECCOpQueue>& op_queue,
                                                     std::optional<size_t> ultra_fixed_offset = std::nullopt)
    {
        // Construct column polynomials corresponding to the full table (T), the table up to and including the tail
        // (T_tail, the second to last table), and the current subtable (t_current). T and T_tail both include the ZK
        // preamble.
        auto table_polynomials = op_queue->construct_ultra_ops_table_columns();
        auto tail_table_polynomials = op_queue->construct_table_columns_up_to_tail();
        auto subtable_polynomials = op_queue->construct_current_ultra_ops_subtable_columns();

        // Check T(x) = T_tail(x) + x^k * t_current(x) at a single random challenge point
        Fr eval_challenge = Fr::random_element();
        for (auto [table_poly, tail_table_poly, subtable_poly] :
             zip_view(table_polynomials, tail_table_polynomials, subtable_polynomials)) {
            const Fr table_eval = table_poly.evaluate(eval_challenge); // T(x)
            // APPEND merge performs concatenation directly to end of previous table or at a specified fixed offset.
            const size_t tail_table_size = op_queue->get_ultra_ops_table_num_rows_up_to_tail(); // k
            const size_t shift_magnitude =
                ultra_fixed_offset.has_value()
                    ? bb::UltraEccOpsTable::ZK_ULTRA_OPS +
                          (ultra_fixed_offset.value() * bb::UltraEccOpsTable::NUM_ROWS_PER_OP)
                    : tail_table_size; // k
            // T(x) = T_tail(x) + x^k * t_current(x), where k is the shift magnitude.
            const Fr tail_table_eval = tail_table_poly.evaluate(eval_challenge); // T_tail(x)
            const Fr shifted_subtable_eval =
                subtable_poly.evaluate(eval_challenge) * eval_challenge.pow(shift_magnitude); // x^k * t_current(x)
            EXPECT_EQ(table_eval, shifted_subtable_eval + tail_table_eval);
        }
    }

    /**
     * @brief  Check that the operations agree between the ultra and eccvm tables
     *
     * @param op_queue
     */
    static void check_table_consistency_with_eccvm(const std::shared_ptr<bb::ECCOpQueue>& op_queue,
                                                   const bool include_zk_ops = false)
    {
        auto ultra_table =
            include_zk_ops ? op_queue->get_zk_reconstructed_ultra_ops() : op_queue->get_no_zk_reconstructed_ultra_ops();
        auto eccvm_table = op_queue->get_eccvm_ops();

        size_t j = 0;
        for (const auto& ultra_op : ultra_table) {
            if (ultra_op.op_code.is_random_op) {
                continue;
            }
            if (ultra_op.op_code.value() == 0) {
                continue;
            }
            ASSERT_LT(j, eccvm_table.size());
            const auto& eccvm_op = eccvm_table[j++];
            EXPECT_EQ(ultra_op.op_code.value(), eccvm_op.op_code.value());
            const auto point = ultra_op.get_base_point_standard_form();
            EXPECT_EQ(point[0],
                      eccvm_op.base_point.is_point_at_infinity() ? Curve::BaseField(0) : eccvm_op.base_point.x);
            EXPECT_EQ(point[1],
                      eccvm_op.base_point.is_point_at_infinity() ? Curve::BaseField(0) : eccvm_op.base_point.y);
            EXPECT_EQ(uint256_t(ultra_op.z_1), eccvm_op.z1);
            EXPECT_EQ(uint256_t(ultra_op.z_2), eccvm_op.z2);
        }
        EXPECT_EQ(j, eccvm_table.size());
    };
};

TEST(ECCOpQueueTest, Basic)
{
    using G1 = ECCOpQueueTest::G1;
    using Fq = curve::Grumpkin::ScalarField;

    ECCOpQueue op_queue;
    op_queue.add_accumulate(bb::g1::affine_one);
    op_queue.empty_row_for_testing();
    // Set hiding op for ECCVM ZK (required before get_eccvm_ops())
    op_queue.append_hiding_op(Fq::random_element(), Fq::random_element());
    op_queue.merge();
    const auto& eccvm_ops = op_queue.get_eccvm_ops();
    // Index 0 is the hiding op (prepended for ECCVM ZK), so actual ops start at index 1
    EXPECT_EQ(eccvm_ops[1].base_point, G1::one());
    EXPECT_EQ(eccvm_ops[2].op_code.add, false);
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

// Check that the ECC op queue correctly reconstructs subtables via successive appending of subtables.
TEST(ECCOpQueueTest, ColumnPolynomialConstruction)
{
    using Fq = curve::Grumpkin::ScalarField;

    // Instantiate an EccOpQueue and populate it with several subtables of ECC ops
    auto op_queue = std::make_shared<bb::ECCOpQueue>();

    // Check that the table polynomials have the correct form after each subtable concatenation
    const size_t NUM_SUBTABLES = 5;
    for (size_t i = 0; i < NUM_SUBTABLES; ++i) {
        op_queue->initialize_new_subtable();
        // Add hiding op to the first subtable so the Ultra and ECCVM opcode streams have matching order.
        if (i == 0) {
            op_queue->append_hiding_op(Fq::random_element(), Fq::random_element());
        }
        ECCOpQueueTest::populate_an_arbitrary_subtable_of_ops(op_queue, /*initialize=*/false);
        op_queue->merge();
    }

    ECCOpQueueTest::check_table_consistency_with_eccvm(op_queue);
}

TEST(ECCOpQueueTest, ColumnPolynomialConstructionUpToTailWithZkThenFixedAppend)
{
    // Instantiate an EccOpQueue and populate it with several subtables of ECC ops
    auto op_queue = std::make_shared<bb::ECCOpQueue>();

    // Construct app/kernel subtables followed by the tail subtable.
    const size_t NUM_SUBTABLES_THROUGH_TAIL = 3;
    for (size_t i = 0; i < NUM_SUBTABLES_THROUGH_TAIL; ++i) {
        op_queue->initialize_new_subtable();
        ECCOpQueueTest::populate_an_arbitrary_subtable_of_ops(op_queue, /*initialize=*/false);
        op_queue->merge();
    }

    op_queue->construct_zk_columns();

    // Do a single append operation at a fixed offset for the hiding kernel subtable.
    const size_t ultra_fixed_offset = op_queue->get_ultra_ops_table_num_rows() + 20;
    ECCOpQueueTest::populate_an_arbitrary_subtable_of_ops(op_queue);
    op_queue->merge_fixed_append(ultra_fixed_offset);
    auto table_up_to_tail = op_queue->construct_table_columns_up_to_tail();
    EXPECT_EQ(table_up_to_tail[0].size(),
              bb::UltraEccOpsTable::ZK_ULTRA_OPS + op_queue->get_ultra_ops_table_num_rows_up_to_tail());
    ECCOpQueueTest::check_final_table_column_polynomials(op_queue, ultra_fixed_offset);

    ECCOpQueueTest::check_table_consistency_with_eccvm(op_queue, /*include_zk_ops=*/true);
}

// Verify correct handling of point at infinity in add and mul operations
TEST(ECCOpQueueTest, PointAtInfinityHandling)
{
    using G1 = ECCOpQueueTest::G1;
    using Fr = ECCOpQueueTest::Fr;

    // Test add_accumulate with point at infinity
    {
        ECCOpQueue op_queue;
        auto P1 = G1::random_element();
        G1 identity;
        identity.self_set_infinity();

        op_queue.add_accumulate(P1);
        op_queue.add_accumulate(identity); // Adding identity should not change accumulator

        EXPECT_EQ(op_queue.get_accumulator(), P1);
    }

    // Test mul_accumulate with point at infinity
    {
        ECCOpQueue op_queue;
        auto P1 = G1::random_element();
        G1 identity;
        identity.self_set_infinity();
        auto scalar = Fr::random_element();

        op_queue.add_accumulate(P1);
        op_queue.mul_accumulate(identity, scalar); // identity * scalar = identity, adding gives P1

        EXPECT_EQ(op_queue.get_accumulator(), P1);
    }

    // Test that accumulator starts at identity element and operations work correctly
    {
        ECCOpQueue op_queue;
        auto P1 = G1::random_element();

        // Initial accumulator should be point at infinity
        EXPECT_TRUE(op_queue.get_accumulator().is_point_at_infinity());

        // Adding P1 to neutral element should give P1
        op_queue.add_accumulate(P1);
        EXPECT_EQ(op_queue.get_accumulator(), P1);
    }

    // Test mul with scalar = 0 (result should be identity)
    {
        ECCOpQueue op_queue;
        auto P1 = G1::random_element();
        auto P2 = G1::random_element();

        op_queue.add_accumulate(P1);
        op_queue.mul_accumulate(P2, Fr(0)); // 0 * P2 = infinity

        // Accumulator should still be P1 (P1 + identity = P1)
        EXPECT_EQ(op_queue.get_accumulator(), P1);
    }
}

// Verify that the `append_hiding_op` results in hiding op in the expected positions in both ECCVM and Ultra tables.
TEST(ECCOpQueueTest, HidingOpPositionConsistency)
{
    using G1 = ECCOpQueueTest::G1;
    using Fr = ECCOpQueueTest::Fr;
    using Fq = curve::BN254::BaseField;

    auto op_queue = std::make_shared<bb::ECCOpQueue>();

    // Add some regular operations
    auto P1 = G1::random_element();
    auto P2 = G1::random_element();
    auto z = Fr::random_element();

    op_queue->add_accumulate(P1);
    op_queue->mul_accumulate(P2, z);

    // Add hiding op with known random values
    Fq hiding_x = Fq::random_element();
    Fq hiding_y = Fq::random_element();
    op_queue->append_hiding_op(hiding_x, hiding_y);

    op_queue->eq_and_reset();
    op_queue->merge();

    // Get the reconstructed ECCVM table and raw Ultra table. This test is checking the explicitly appended hiding op
    // in the raw subtable, not the Chonk ZK-prefixed reconstruction.
    const auto& eccvm_ops = op_queue->get_eccvm_ops();
    const auto& ultra_ops = op_queue->get_no_zk_reconstructed_ultra_ops();

    // === ECCVM Table Checks ===
    // Hiding op should be at index 0 (prepended during get_eccvm_ops())
    const auto& eccvm_hiding_op = eccvm_ops[0];
    EXPECT_TRUE(eccvm_hiding_op.op_code.eq);
    EXPECT_TRUE(eccvm_hiding_op.op_code.reset);
    EXPECT_EQ(eccvm_hiding_op.base_point.x, hiding_x);
    EXPECT_EQ(eccvm_hiding_op.base_point.y, hiding_y);

    // === Ultra Table Checks ===
    // By construction, the hiding op should be at index 2:
    //   index 0: add_accumulate(P1)
    //   index 1: mul_accumulate(P2, z)
    //   index 2: append_hiding_op (eq+reset opcode)
    //   index 3: eq_and_reset
    constexpr size_t EXPECTED_HIDING_OP_ULTRA_IDX = 2;
    ASSERT_GT(ultra_ops.size(), EXPECTED_HIDING_OP_ULTRA_IDX);

    const auto& ultra_hiding_op = ultra_ops[EXPECTED_HIDING_OP_ULTRA_IDX];
    EXPECT_TRUE(ultra_hiding_op.op_code.eq) << "Hiding op at index 2 should have eq=true";
    EXPECT_TRUE(ultra_hiding_op.op_code.reset) << "Hiding op at index 2 should have reset=true";
    const size_t CHUNK_SIZE = 2 * stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION;
    uint256_t ultra_x = uint256_t(ultra_hiding_op.x_lo) + (uint256_t(ultra_hiding_op.x_hi) << CHUNK_SIZE);
    uint256_t ultra_y = uint256_t(ultra_hiding_op.y_lo) + (uint256_t(ultra_hiding_op.y_hi) << CHUNK_SIZE);

    EXPECT_EQ(Fq(ultra_x), eccvm_hiding_op.base_point.x);
    EXPECT_EQ(Fq(ultra_y), eccvm_hiding_op.base_point.y);

    // Verify opcodes match
    EXPECT_EQ(ultra_hiding_op.op_code.eq, eccvm_hiding_op.op_code.eq);
    EXPECT_EQ(ultra_hiding_op.op_code.reset, eccvm_hiding_op.op_code.reset);
}

TEST(ECCOpQueueTest, MissingHidingOpDoesNotPopulateCache)
{
    ECCOpQueue queue;
    queue.eq_and_reset();
    queue.merge();
    EXPECT_THROW(queue.get_eccvm_ops(), std::runtime_error);
    EXPECT_THROW(queue.get_eccvm_ops(), std::runtime_error);

    queue.construct_zk_columns();
    ASSERT_EQ(queue.get_eccvm_ops().size(), 2);
    EXPECT_TRUE(queue.get_eccvm_ops()[1].base_point.is_point_at_infinity());
}

TEST(ECCOpQueueTest, ReconstructedTablesFollowAppends)
{
    for (bool include_zk : { false, true }) {
        auto queue = std::make_shared<ECCOpQueue>();
        if (!include_zk) {
            queue->append_hiding_op(fq(11), fq(12));
        }
        queue->add_accumulate(g1::affine_one);
        queue->eq_and_reset();
        queue->merge();
        if (include_zk) {
            queue->construct_zk_columns();
        }
        ECCOpQueueTest::check_table_consistency_with_eccvm(queue, include_zk);
        const auto original = queue->get_eccvm_ops();

        queue->initialize_new_subtable();
        queue->mul_accumulate(g1::affine_one, fr(7));
        queue->eq_and_reset();
        EXPECT_THROW(queue->get_eccvm_ops(), std::runtime_error);
        EXPECT_THROW(queue->get_no_zk_reconstructed_ultra_ops(), std::runtime_error);
        EXPECT_THROW(queue->get_zk_reconstructed_ultra_ops(), std::runtime_error);
        if (include_zk) {
            queue->merge_fixed_append(20);
        } else {
            queue->merge();
        }
        ASSERT_EQ(queue->get_eccvm_ops().size(), original.size() + 2);
        EXPECT_EQ(queue->get_eccvm_ops().front(), original.front());
        EXPECT_EQ(queue->get_eccvm_ops().back().base_point, g1::affine_element(g1::one * fr(7)));
        ECCOpQueueTest::check_table_consistency_with_eccvm(queue, include_zk);
    }
}

TEST(ECCOpQueueTest, HidingOpCanOnlyBeInstalledOnce)
{
    for (bool include_zk : { false, true }) {
        auto queue = std::make_shared<ECCOpQueue>();
        if (!include_zk) {
            queue->append_hiding_op(fq(11), fq(12));
        }
        queue->merge();
        if (include_zk) {
            queue->construct_zk_columns();
        }
        const auto original = queue->get_eccvm_ops();
        EXPECT_THROW(queue->append_hiding_op(fq(13), fq(14)), std::runtime_error);
        EXPECT_THROW(queue->construct_zk_columns(), std::runtime_error);
        EXPECT_EQ(queue->get_eccvm_ops(), original);
        ECCOpQueueTest::check_table_consistency_with_eccvm(queue, include_zk);
    }
}

TEST(ECCOpQueueTest, AppendingToExplicitTestInputPreservesBothInputs)
{
    ECCOpQueue queue;
    std::vector<ECCVMOperation> input{ { .op_code = EccOpCode{ .add = true }, .base_point = g1::affine_one } };
    queue.set_eccvm_ops_for_fuzzing(input);
    queue.mul_accumulate(g1::affine_one, fr(7));
    queue.merge();
    const auto& ops = queue.get_eccvm_ops();
    ASSERT_EQ(ops.size(), 2);
    EXPECT_EQ(ops[0], input[0]);
    EXPECT_TRUE(ops[1].op_code.mul);
    EXPECT_EQ(ops[1].base_point, g1::affine_one);
    EXPECT_EQ(ops[1].z1, uint256_t(7));
}

TEST(ECCOpQueueTest, BatchSeparatorsPreserveSubtablesAndFixedAppend)
{
    auto queue = std::make_shared<ECCOpQueue>();
    ECCOpQueueTest::populate_an_arbitrary_subtable_of_ops(queue, false);
    queue->merge();
    queue->initialize_new_subtable();
    queue->merge();
    queue->construct_zk_columns();
    const auto original = queue->construct_subtable_columns();
    const auto original_eccvm = queue->get_eccvm_ops();
    const auto original_ultra = queue->get_zk_reconstructed_ultra_ops();
    const size_t original_rows = queue->get_ultra_ops_table_num_rows();
    queue->add_batch_merge_separators();

    const auto unchanged = queue->construct_subtable_columns();
    ASSERT_EQ(unchanged.size(), original.size());
    for (size_t i = 0; i < original.size(); ++i) {
        for (size_t col = 0; col < 4; ++col) {
            EXPECT_EQ(unchanged[i][col], original[i][col]);
        }
    }
    EXPECT_EQ(queue->get_ultra_ops_table_num_rows(), original_rows + 4);
    EXPECT_EQ(queue->get_eccvm_ops().size(), original_eccvm.size() + 2);
    EXPECT_EQ(queue->get_zk_reconstructed_ultra_ops().size(), original_ultra.size() + 2);
    const auto [ultra_separator, eccvm_separator] = UltraEccOpsTable::make_separator_op_pair();
    EXPECT_EQ(queue->get_eccvm_ops().back(), eccvm_separator);
    EXPECT_EQ(queue->get_zk_reconstructed_ultra_ops().back(), ultra_separator);
    ECCOpQueueTest::check_table_consistency_with_eccvm(queue, true);

    const auto aggregate = queue->construct_ultra_ops_table_columns();
    queue->initialize_new_subtable();
    ECCOpQueueTest::populate_an_arbitrary_subtable_of_ops(queue, false);
    const size_t append_offset = queue->get_append_offset_for_prover();
    queue->merge_fixed_append(append_offset);
    const auto tail = queue->construct_table_columns_up_to_tail();
    for (size_t col = 0; col < 4; ++col) {
        EXPECT_EQ(tail[col], aggregate[col]);
    }
    EXPECT_EQ(queue->get_ultra_ops_table_num_rows() + UltraEccOpsTable::ZK_ULTRA_OPS,
              ECCOpQueue::OP_QUEUE_SIZE * UltraEccOpsTable::NUM_ROWS_PER_OP);
    ECCOpQueueTest::check_final_table_column_polynomials(queue, append_offset);
    ECCOpQueueTest::check_table_consistency_with_eccvm(queue, true);
}
