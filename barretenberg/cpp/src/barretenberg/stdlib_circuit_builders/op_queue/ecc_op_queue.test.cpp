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
        std::array<std::vector<scalar>, 4> table;
        void append(const UltraOp& op)
        {
            table[0].push_back(op.op);
            table[1].push_back(op.x_lo);
            table[2].push_back(op.x_hi);
            table[3].push_back(op.y_lo);

            table[0].push_back(0);
            table[1].push_back(op.y_hi);
            table[2].push_back(op.z_1);
            table[3].push_back(op.z_2);
        }

        // Construct the mock ultra ops table such that the chunks appear in reverse order, as if prepended
        MockUltraOpsTable(const auto& ops_chunks)
        {
            for (auto& ops_chunk : std::ranges::reverse_view(ops_chunks)) {
                for (const auto& op : ops_chunk) {
                    append(op);
                }
            }
        }

        size_t size() const { return table[0].size(); }
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

TEST(ECCOpQueueTest, New)
{
    using point = g1::affine_element;
    using scalar = fr;

    // Compute a simple point accumulation natively
    auto P1 = point::random_element();
    auto P2 = point::random_element();
    auto z = scalar::random_element();
    auto P_expected = P1 + P2 * z;

    // Add the same operations to the ECC op queue; the native computation is performed under the hood.
    NewECCOpQueue op_queue;
    op_queue.add_accumulate(P1);
    op_queue.mul_accumulate(P2, z);

    // The correct result should now be stored in the accumulator within the op queue
    EXPECT_EQ(op_queue.get_accumulator(), P_expected);

    // Adding an equality op should reset the accumulator to zero (the point at infinity)
    op_queue.eq_and_reset();
    EXPECT_TRUE(op_queue.get_accumulator().is_point_at_infinity());
}

TEST(ECCOpQueueTest, NewConstruction)
{
    // Construct chunks of ultra ops, each representing the set of ops added by a single circuit
    const size_t NUM_CHUNKS = 3;
    std::array<std::vector<UltraOp>, NUM_CHUNKS> ultra_ops_chunks;
    std::array<size_t, NUM_CHUNKS> chunk_sizes = { 4, 2, 7 };
    for (auto [chunk, size] : zip_view(ultra_ops_chunks, chunk_sizes)) {
        for (size_t i = 0; i < size; ++i) {
            chunk.push_back(ECCOpQueueTest::random_ultra_op());
        }
    }

    // Construct the mock ultra ops table which contains the chunks ordered in reverse (as if prepended)
    ECCOpQueueTest::MockUltraOpsTable mock_table(ultra_ops_chunks);

    // Construct the concatenated table internal to the op queue
    NewECCOpQueue op_queue;
    for (const auto& chunk : ultra_ops_chunks) {
        for (const auto& op : chunk) {
            op_queue.append_ultra_op(op);
        }
        op_queue.construct_concatenated_table();
    }

    // Compute the expected total table size as the sum of the chink sizes times 2
    size_t expected_table_size = 0;
    for (const auto& size : chunk_sizes) {
        expected_table_size += size * 2;
    }

    EXPECT_EQ(op_queue.ultra_ops_size(), expected_table_size);
    EXPECT_EQ(mock_table.size(), expected_table_size);
}
