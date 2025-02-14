#include "barretenberg/stdlib_circuit_builders/op_queue/ecc_op_queue.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/stdlib_circuit_builders/op_queue/new_ecc_op_queue.hpp"
#include <gtest/gtest.h>

#include <ranges>

using namespace bb;

class ECCOpQueueTest : public ::testing::Test {
    using scalar = fr;

  public:
    struct MockUltraOpsTable {
        std::array<std::vector<scalar>, 4> columns;
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
        op.op = scalar::random_element();
        op.x_lo = scalar::random_element();
        op.x_hi = scalar::random_element();
        op.y_lo = scalar::random_element();
        op.y_hi = scalar::random_element();
        op.z_1 = scalar::random_element();
        op.z_2 = scalar::random_element();
        op.return_is_infinity = false;
        return op;
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
    UltraOpsTable ultra_ops_table;
    for (const auto& subtable_ops : subtable_ultra_ops) {
        for (const auto& op : subtable_ops) {
            ultra_ops_table.append_operation(op);
        }
        ultra_ops_table.concatenate_subtable();
    }

    // Compute the expected total table size as the sum of the subtable op counts times 2
    size_t expected_table_size = 0;
    for (const auto& count : subtable_op_counts) {
        expected_table_size += count * 2;
    }

    // Check that the ultra ops table internal to the op queue has the correct size
    EXPECT_EQ(ultra_ops_table.size(), expected_table_size);

    // Define a storage for the genuine ultra ops table and populate using the data stored in the op queue
    std::array<std::vector<fr>, 4> ultra_ops_columns;
    std::array<std::span<fr>, 4> ultra_ops_column_spans;
    for (auto [column_span, column] : zip_view(ultra_ops_column_spans, ultra_ops_columns)) {
        column.resize(expected_table_size);
        column_span = column;
    }
    ultra_ops_table.populate_columns(ultra_ops_column_spans);

    // ultra_ops_table[2][3] += 1;

    // Check that the ultra ops table constructed by the op queue matches the expected table
    for (auto [expected_column, column] : zip_view(expected_ultra_ops_table.columns, ultra_ops_columns)) {
        for (auto [expected_value, value] : zip_view(expected_column, column)) {
            EXPECT_EQ(expected_value, value);
        }
    }

    // Check that the ultra ops table constructed by the op queue matches the expected table using row iterator
    std::array<std::vector<Fr>, 4> columns;
    for (const auto& row : ultra_ops_table) {
        for (size_t i = 0; i < 4; ++i) {
            columns[i].push_back(row[i]);
        }
    }

    EXPECT_EQ(expected_ultra_ops_table.columns, columns);
}
