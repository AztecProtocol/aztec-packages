#include "barretenberg/stdlib_circuit_builders/op_queue/ecc_op_queue.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/stdlib_circuit_builders/op_queue/ecc_ops_table.hpp"
#include <gtest/gtest.h>

#include <ranges>

using namespace bb;

class ECCOpQueueTest : public ::testing::Test {
    using Curve = curve::BN254;
    using Point = Curve::AffineElement;
    using Scalar = fr;
    using ECCVMOperation = bb::eccvm::VMOperation<Curve::Group>;

  public:
    struct MockUltraOpsTable {
        std::array<std::vector<Scalar>, 4> columns;
        void append(const UltraOp& op)
        {
            columns[0].push_back(op.op);
            columns[1].push_back(op.x_lo);
            columns[2].push_back(op.x_hi);
            columns[3].push_back(op.y_lo);

            columns[0].push_back(0);
            columns[1].push_back(op.y_hi);
            columns[2].push_back(op.z_1);
            columns[3].push_back(op.z_2);
        }

        // Construct the= ultra ops table such that the subtables appear in reverse order, as if prepended
        MockUltraOpsTable(const auto& subtable_ops)
        {
            for (auto& ops : std::ranges::reverse_view(subtable_ops)) {
                for (const auto& op : ops) {
                    append(op);
                }
            }
        }

        size_t size() const { return columns[0].size(); }
    };

    static UltraOp random_ultra_op()
    {
        UltraOp op;
        op.op_code = NULL_OP;
        op.op = Scalar::random_element();
        op.x_lo = Scalar::random_element();
        op.x_hi = Scalar::random_element();
        op.y_lo = Scalar::random_element();
        op.y_hi = Scalar::random_element();
        op.z_1 = Scalar::random_element();
        op.z_2 = Scalar::random_element();
        op.return_is_infinity = false;
        return op;
    }

    struct MockRawOpsTable {
        std::vector<ECCVMOperation> raw_ops;
        void append(const ECCVMOperation& op) { raw_ops.push_back(op); }

        MockRawOpsTable(const auto& subtable_ops)
        {
            for (auto& ops : std::ranges::reverse_view(subtable_ops)) {
                for (const auto& op : ops) {
                    append(op);
                }
            }
        }
    };

    static ECCVMOperation random_raw_op()
    {
        return ECCVMOperation{ .mul = true,
                               .base_point = curve::BN254::Group::affine_element::random_element(),
                               .z1 = uint256_t(Scalar::random_element()),
                               .z2 = uint256_t(Scalar::random_element()),
                               .mul_scalar_full = Scalar::random_element() };
    }
};

TEST(ECCOpQueueTest, Basic)
{
    ECCOpQueue op_queue;
    const auto& raw_ops = op_queue.get_raw_ops();
    op_queue.add_accumulate(bb::g1::affine_one);
    EXPECT_EQ(raw_ops[0].base_point, bb::g1::affine_one);
    op_queue.empty_row_for_testing();
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
    op_queue.add_accumulate(P1);
    op_queue.mul_accumulate(P2, z);

    // The correct result should now be stored in the accumulator within the op queue
    EXPECT_EQ(op_queue.get_accumulator(), P_expected);

    // Adding an equality op should reset the accumulator to zero (the point at infinity)
    op_queue.eq_and_reset();
    EXPECT_TRUE(op_queue.get_accumulator().is_point_at_infinity());
}

TEST(ECCOpQueueTest, UltraOpsTableConstruction)
{
    using Fr = fr;

    constexpr size_t NUM_ROWS_PER_OP = 2; // Each ECC op is represented by two rows in the ultra ops table

    // Construct sets of ultra ops, each representing those added by a single circuit
    const size_t NUM_SUBTABLES = 3;
    std::array<std::vector<UltraOp>, NUM_SUBTABLES> subtable_ultra_ops;
    std::array<size_t, NUM_SUBTABLES> subtable_op_counts = { 4, 2, 7 };
    for (auto [subtable_ops, op_count] : zip_view(subtable_ultra_ops, subtable_op_counts)) {
        for (size_t i = 0; i < op_count; ++i) {
            subtable_ops.push_back(ECCOpQueueTest::random_ultra_op());
        }
    }

    // Construct the mock ultra ops table which contains the subtables ordered in reverse (as if prepended)
    ECCOpQueueTest::MockUltraOpsTable expected_ultra_ops_table(subtable_ultra_ops);

    // Construct the concatenated table internal to the op queue
    UltraEccOpsTable ultra_ops_table;
    for (const auto& subtable_ops : subtable_ultra_ops) {
        ultra_ops_table.create_new_subtable();
        for (const auto& op : subtable_ops) {
            ultra_ops_table.push(op);
        }
    }

    // Check that the ultra ops table internal to the op queue has the correct size
    auto expected_num_ops = std::accumulate(subtable_op_counts.begin(), subtable_op_counts.end(), size_t(0));
    EXPECT_EQ(ultra_ops_table.size(), expected_num_ops);

    // // expected_ultra_ops_table.columns[2][3] += 1;

    // Construct polynomials corresponding to the columns of the ultra ops table
    const size_t expected_table_size = expected_num_ops * NUM_ROWS_PER_OP;
    std::array<Polynomial<Fr>, 4> ultra_ops_table_polynomials;
    std::array<std::span<fr>, 4> column_spans;
    for (auto [column_span, column] : zip_view(column_spans, ultra_ops_table_polynomials)) {
        column = Polynomial<Fr>(expected_table_size);
        column_span = column.coeffs();
    }
    ultra_ops_table.populate_column_data(column_spans);

    // Check that the ultra ops table constructed by the op queue matches the expected table
    for (auto [expected_column, poly] : zip_view(expected_ultra_ops_table.columns, ultra_ops_table_polynomials)) {
        for (auto [expected_value, value] : zip_view(expected_column, poly.coeffs())) {
            EXPECT_EQ(expected_value, value);
        }
    }
}

TEST(ECCOpQueueTest, RawOpsTableConstruction)
{
    using ECCVMOperation = bb::eccvm::VMOperation<curve::BN254::Group>;

    // Construct sets of ultra ops, each representing those added by a single circuit
    const size_t NUM_SUBTABLES = 3;
    std::array<std::vector<ECCVMOperation>, NUM_SUBTABLES> subtable_raw_ops;
    std::array<size_t, NUM_SUBTABLES> subtable_op_counts = { 4, 2, 7 };
    for (auto [subtable_ops, op_count] : zip_view(subtable_raw_ops, subtable_op_counts)) {
        for (size_t i = 0; i < op_count; ++i) {
            subtable_ops.push_back(ECCOpQueueTest::random_raw_op());
        }
    }

    // Construct the mock ultra ops table which contains the subtables ordered in reverse (as if prepended)
    ECCOpQueueTest::MockRawOpsTable expected_raw_ops_table(subtable_raw_ops);

    // Construct the concatenated raw ops table
    RawEccOpsTable raw_ops_table;
    for (const auto& subtable_ops : subtable_raw_ops) {
        raw_ops_table.create_new_subtable();
        for (const auto& op : subtable_ops) {
            raw_ops_table.push(op);
        }
    }

    // Check that the table has the correct size
    auto expected_num_ops = std::accumulate(subtable_op_counts.begin(), subtable_op_counts.end(), size_t(0));
    EXPECT_EQ(raw_ops_table.size(), expected_num_ops);

    // Check that the manually constructed mock table matches the genuine table
    size_t idx = 0;
    for (const auto& op : raw_ops_table) {
        EXPECT_EQ(expected_raw_ops_table.raw_ops[idx++], op);
    }
}
