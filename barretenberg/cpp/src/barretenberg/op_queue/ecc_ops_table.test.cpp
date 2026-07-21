#include "barretenberg/op_queue/ecc_ops_table.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include <gtest/gtest.h>

#include <ranges>

using namespace bb;

class EccOpsTableTest : public ::testing::Test {
    using Curve = curve::BN254;
    using Scalar = fr;

  public:
    template <typename Op> struct MockSubtableGenerator {
        virtual ~MockSubtableGenerator() = default;
        virtual Op generate_random_op() const = 0;
        std::vector<std::vector<Op>> generate_subtables(size_t num_subtables, std::vector<size_t> ops_per_table)
        {
            BB_ASSERT_EQ(num_subtables, ops_per_table.size());
            std::vector<std::vector<Op>> subtables;
            subtables.reserve(num_subtables);
            for (size_t i = 0; i < num_subtables; ++i) {
                std::vector<Op> subtable;
                subtable.reserve(ops_per_table[i]);
                for (size_t j = 0; j < ops_per_table[i]; ++j) {
                    subtable.push_back(generate_random_op());
                }
                subtables.push_back(std::move(subtable));
            }

            return subtables;
        }
    };

    struct UltraOpTableGenerator : public MockSubtableGenerator<UltraOp> {
        ~UltraOpTableGenerator() override = default;
        UltraOp generate_random_op() const override
        {
            return UltraOp{ .op_code = EccOpCode{},
                            .x_lo = Scalar::random_element(),
                            .x_hi = Scalar::random_element(),
                            .y_lo = Scalar::random_element(),
                            .y_hi = Scalar::random_element(),
                            .z_1 = Scalar::random_element(),
                            .z_2 = Scalar::random_element(),
                            .return_is_infinity = false };
        }
    };

    struct EccvmOpTableGenerator : public MockSubtableGenerator<ECCVMOperation> {
        ~EccvmOpTableGenerator() override = default;
        ECCVMOperation generate_random_op() const override
        {
            return ECCVMOperation{ .op_code = EccOpCode{ .mul = true },
                                   .base_point = Curve::Group::affine_element::random_element(),
                                   .z1 = uint256_t(Scalar::random_element()),
                                   .z2 = uint256_t(Scalar::random_element()),
                                   .mul_scalar_full = Scalar::random_element() };
        }
    };

    // Mock ultra ops table that constructs a concatenated table from successively appended subtables.
    struct MockUltraOpsTable {
        std::array<std::vector<Scalar>, NUM_WIRES> columns;
        void append(const UltraOp& op)
        {
            columns[0].push_back(op.op_code.value());
            columns[1].push_back(op.x_lo);
            columns[2].push_back(op.x_hi);
            columns[3].push_back(op.y_lo);

            columns[0].push_back(0);
            columns[1].push_back(op.y_hi);
            columns[2].push_back(op.z_1);
            columns[3].push_back(op.z_2);
        }

        void append_zero_rows(size_t num_rows)
        {
            for (auto& column : columns) {
                column.insert(column.end(), num_rows, Scalar::zero());
            }
        }

        // Construct the ultra ops table from the given subtables, ordered as they should appear in the op queue.
        MockUltraOpsTable(const auto& subtable_ops, bool last_subtable_has_preamble = false)
        {
            const size_t last_idx = subtable_ops.size() == 0 ? 0 : subtable_ops.size() - 1;
            for (size_t i = 0; i < subtable_ops.size(); ++i) {
                if (last_subtable_has_preamble && i == last_idx) {
                    append_zero_rows(UltraEccOpsTable::APPEND_TRACE_OFFSET);
                }
                for (const auto& op : subtable_ops[i]) {
                    append(op);
                }
            }
        }

        size_t size() const { return columns[0].size(); }
    };

    // Mock eccvm ops table that constructs a concatenated table from successively appended subtables.
    struct MockEccvmOpsTable {
        std::vector<ECCVMOperation> eccvm_ops;

        MockEccvmOpsTable(const auto& subtable_ops)
        {
            for (auto& ops : subtable_ops) {
                for (const auto& op : ops) {
                    eccvm_ops.push_back(op);
                }
            }
        }
    };
};

// Ensure UltraOpsTable correctly constructs a concatenated table from successively appended subtables.
TEST(EccOpsTableTest, UltraOpsTable)
{
    using Fr = fr;
    using TableGenerator = EccOpsTableTest::UltraOpTableGenerator;

    // Construct sets of ultra ops, each representing those added by a single circuit
    const size_t NUM_SUBTABLES = 3;
    std::vector<size_t> subtable_op_counts = { 4, 2, 7 };

    TableGenerator table_generator;
    auto subtables = table_generator.generate_subtables(NUM_SUBTABLES, subtable_op_counts);

    // Construct the concatenated table internal to the op queue
    UltraEccOpsTable ultra_ops_table;
    for (const auto& subtable_ops : subtables) {
        ultra_ops_table.create_new_subtable();
        for (const auto& op : subtable_ops) {
            ultra_ops_table.push(op);
        }
        ultra_ops_table.merge();
    }

    // Construct the mock ultra ops table which contains the subtables in append order.
    EccOpsTableTest::MockUltraOpsTable expected_ultra_ops_table(subtables);

    // Check that the ultra ops table internal to the op queue has the correct size
    auto expected_num_ops = std::accumulate(subtable_op_counts.begin(), subtable_op_counts.end(), size_t(0));
    EXPECT_EQ(ultra_ops_table.num_ops(), expected_num_ops);

    // Construct polynomials corresponding to the columns of the ultra ops table
    ultra_ops_table.construct_zk_columns();
    std::array<Polynomial<Fr>, NUM_WIRES> ultra_ops_table_polynomials = ultra_ops_table.construct_table_columns();
    std::array<Polynomial<Fr>, NUM_WIRES> no_zk_ultra_ops_table_polynomials =
        ultra_ops_table.construct_table_columns(/*include_zk_ops=*/false);

    // Check that the ultra ops table constructed by the op queue matches the expected table
    for (auto [expected_column, poly, no_zk_poly] :
         zip_view(expected_ultra_ops_table.columns, ultra_ops_table_polynomials, no_zk_ultra_ops_table_polynomials)) {
        EXPECT_EQ(poly.size(), UltraEccOpsTable::ZK_ULTRA_OPS + expected_column.size());
        EXPECT_EQ(no_zk_poly.size(), expected_column.size());
        for (size_t row = 0; row < expected_column.size(); ++row) {
            EXPECT_EQ(expected_column[row], poly.at(UltraEccOpsTable::ZK_ULTRA_OPS + row));
            EXPECT_EQ(expected_column[row], no_zk_poly.at(row));
        }
    }
}

TEST(EccOpsTableTest, UltraOpsFixedLocationAppendNoGap)
{
    using Fr = fr;
    using TableGenerator = EccOpsTableTest::UltraOpTableGenerator;

    // Construct sets of ultra ops
    const size_t NUM_SUBTABLES = 3;
    std::vector<size_t> subtable_op_counts = { 4, 2, 7 };

    TableGenerator table_generator;
    auto subtables = table_generator.generate_subtables(NUM_SUBTABLES, subtable_op_counts);

    // Construct the concatenated table with fixed-location append (no explicit offset)
    UltraEccOpsTable ultra_ops_table;
    for (size_t i = 0; i < NUM_SUBTABLES; ++i) {
        ultra_ops_table.create_new_subtable();
        for (const auto& op : subtables[i]) {
            ultra_ops_table.push(op);
        }

        if (i == NUM_SUBTABLES - 1) {
            // No-gap fixed-append: place the appended subtable immediately after the prior subtables.
            const size_t no_gap_offset = subtable_op_counts[0] + subtable_op_counts[1];
            ultra_ops_table.merge_with_fixed_append_offset(no_gap_offset);
        } else {
            ultra_ops_table.merge();
        }
    }

    // Expected order: subtable[0], subtable[1], subtable[2] (no gap). The final APPEND carries
    // APPEND_TRACE_OFFSET preamble rows.
    std::vector<std::vector<UltraOp>> ordered_subtables = { subtables[0], subtables[1], subtables[2] };

    // Construct the mock ultra ops table
    EccOpsTableTest::MockUltraOpsTable expected_ultra_ops_table(ordered_subtables,
                                                                /*last_subtable_has_preamble=*/true);

    // Check that the ultra ops table has the correct size
    auto expected_num_ops = std::accumulate(subtable_op_counts.begin(), subtable_op_counts.end(), size_t(0));
    EXPECT_EQ(ultra_ops_table.num_ops(), expected_num_ops);

    // Construct polynomials corresponding to the columns of the ultra ops table
    ultra_ops_table.construct_zk_columns();
    std::array<Polynomial<Fr>, NUM_WIRES> ultra_ops_table_polynomials = ultra_ops_table.construct_table_columns();

    // Check that the ultra ops table matches the expected table
    for (auto [expected_column, poly] : zip_view(expected_ultra_ops_table.columns, ultra_ops_table_polynomials)) {
        EXPECT_EQ(poly.size(), UltraEccOpsTable::ZK_ULTRA_OPS + expected_column.size());
        for (size_t row = 0; row < expected_column.size(); ++row) {
            EXPECT_EQ(expected_column[row], poly.at(UltraEccOpsTable::ZK_ULTRA_OPS + row));
        }
    }
}

TEST(EccOpsTableTest, UltraOpsFixedLocationAppendWithGap)
{
    using Fr = fr;
    using TableGenerator = EccOpsTableTest::UltraOpTableGenerator;

    const size_t ULTRA_ROWS_PER_OP = UltraEccOpsTable::NUM_ROWS_PER_OP;

    // Construct sets of ultra ops
    const size_t NUM_SUBTABLES = 3;
    std::vector<size_t> subtable_op_counts = { 4, 2, 7 };

    TableGenerator table_generator;
    auto subtables = table_generator.generate_subtables(NUM_SUBTABLES, subtable_op_counts);

    // Construct the concatenated table with fixed-location append at specific offset
    UltraEccOpsTable ultra_ops_table;
    // Define a fixed offset at which to append the table (must be greater than the total size of the prior tables).
    const size_t fixed_offset = 20;
    const size_t fixed_offset_num_rows = fixed_offset * ULTRA_ROWS_PER_OP;
    const size_t prior_subtables_size = (subtable_op_counts[0] + subtable_op_counts[1]) * ULTRA_ROWS_PER_OP;
    BB_ASSERT(fixed_offset_num_rows > prior_subtables_size);

    // Construct the ultra ops table
    for (size_t i = 0; i < NUM_SUBTABLES; ++i) {
        ultra_ops_table.create_new_subtable();
        for (const auto& op : subtables[i]) {
            ultra_ops_table.push(op);
        }

        if (i == NUM_SUBTABLES - 1) {
            ultra_ops_table.merge_with_fixed_append_offset(fixed_offset);
        } else {
            ultra_ops_table.merge();
        }
    }

    // Check that the ultra ops table has the correct total size (gap is not present in raw ops table)
    auto expected_num_ops = std::accumulate(subtable_op_counts.begin(), subtable_op_counts.end(), size_t(0));
    EXPECT_EQ(ultra_ops_table.num_ops(), expected_num_ops);

    // Check that the polynomials have the correct size (including gap and APPEND_TRACE_OFFSET preamble)
    constexpr size_t LEADING_ZEROS = UltraEccOpsTable::APPEND_TRACE_OFFSET;
    size_t expected_poly_size = fixed_offset_num_rows + LEADING_ZEROS + (subtable_op_counts[2] * ULTRA_ROWS_PER_OP);
    EXPECT_EQ(ultra_ops_table.num_ultra_rows(), expected_poly_size);
    ultra_ops_table.construct_zk_columns();
    const size_t zk_prefix_rows = UltraEccOpsTable::ZK_ULTRA_OPS;

    // Construct polynomials corresponding to the columns of the ultra ops table
    std::array<Polynomial<Fr>, NUM_WIRES> ultra_ops_table_polynomials = ultra_ops_table.construct_table_columns();

    // Verify each polynomial has the expected size
    for (const auto& poly : ultra_ops_table_polynomials) {
        EXPECT_EQ(poly.size(), zk_prefix_rows + expected_poly_size);
    }

    // Construct expected table with zeros in the gap
    // Order: subtable[0], subtable[1], zeros, subtable[2]
    std::vector<std::vector<UltraOp>> ordered_subtables = { subtables[0], subtables[1] };
    EccOpsTableTest::MockUltraOpsTable expected_prior_table(ordered_subtables);

    // Check prior subtables are at the beginning.
    for (auto [ultra_op_poly, expected_poly] : zip_view(ultra_ops_table_polynomials, expected_prior_table.columns)) {
        for (size_t row = 0; row < prior_subtables_size; ++row) {
            EXPECT_EQ(ultra_op_poly.at(zk_prefix_rows + row), expected_poly[row]);
        }
    }

    // Check gap from prior tables up to (fixed_offset + preamble) is filled with zeros.
    for (auto ultra_op_poly : ultra_ops_table_polynomials) {
        for (size_t row = prior_subtables_size; row < fixed_offset_num_rows + LEADING_ZEROS; ++row) {
            EXPECT_EQ(ultra_op_poly.at(zk_prefix_rows + row), Fr::zero());
        }
    }

    // Check appended subtable is placed right after the APPEND_TRACE_OFFSET preamble
    std::vector<std::vector<UltraOp>> appended_subtables = { subtables[2] };
    EccOpsTableTest::MockUltraOpsTable expected_appended_table(appended_subtables);
    for (auto [ultra_op_poly, expected_poly] : zip_view(ultra_ops_table_polynomials, expected_appended_table.columns)) {
        for (size_t row = 0; row < subtable_op_counts[2] * ULTRA_ROWS_PER_OP; row++) {
            EXPECT_EQ(ultra_op_poly.at(zk_prefix_rows + fixed_offset_num_rows + LEADING_ZEROS + row),
                      expected_poly[row]);
        }
    }

    // Mimic get_reconstructed by unifying all the ops from subtables into a single vector with the appropriate append
    // offset
    {
        std::vector<UltraOp> expected_reconstructed;
        expected_reconstructed.reserve(expected_num_ops + fixed_offset);

        // Order: subtable[0], subtable[1], no-ops range (including APPEND_TRACE_OFFSET preamble), subtable[2]
        for (const auto& op : subtables[0]) {
            expected_reconstructed.push_back(op);
        }
        for (const auto& op : subtables[1]) {
            expected_reconstructed.push_back(op);
        }

        // Add the range of noops up to (fixed_offset + preamble op slots).
        constexpr size_t PREAMBLE_OP_SLOTS = LEADING_ZEROS / UltraEccOpsTable::NUM_ROWS_PER_OP;
        UltraOp no_op = {};
        size_t size_before = expected_reconstructed.size();
        for (size_t i = size_before; i < fixed_offset + PREAMBLE_OP_SLOTS; i++) {
            expected_reconstructed.push_back(no_op);
        }

        for (const auto& op : subtables[2]) {
            expected_reconstructed.push_back(op);
        }

        const auto reconstructed = ultra_ops_table.get_no_zk_reconstructed_ultra_ops();
        EXPECT_EQ(expected_reconstructed.size(), reconstructed.size());

        // Compare to the op-queue's reconstruction (should include the gap as no-ops)
        EXPECT_EQ(expected_reconstructed, reconstructed);
    }
}

// Ensure EccvmOpsTable correctly constructs a concatenated table from successively appended subtables
TEST(EccOpsTableTest, EccvmOpsTable)
{

    // Construct sets of eccvm ops, each representing those added by a single circuit
    using TableGenerator = EccOpsTableTest::EccvmOpTableGenerator;

    // Construct sets of ultra ops, each representing those added by a single circuit
    const size_t NUM_SUBTABLES = 3;
    std::vector<size_t> subtable_op_counts = { 4, 2, 7 };

    TableGenerator table_generator;
    auto subtables = table_generator.generate_subtables(NUM_SUBTABLES, subtable_op_counts);

    // Construct the concatenated eccvm ops table
    EccvmOpsTable eccvm_ops_table;
    for (const auto& subtable_ops : subtables) {
        eccvm_ops_table.create_new_subtable();
        for (const auto& op : subtable_ops) {
            eccvm_ops_table.push(op);
        }
        eccvm_ops_table.merge();
    }

    // Construct the mock eccvm ops table which contains the subtables in append order.
    EccOpsTableTest::MockEccvmOpsTable expected_eccvm_ops_table(subtables);

    // Check that the table has the correct size
    auto expected_num_ops = std::accumulate(subtable_op_counts.begin(), subtable_op_counts.end(), size_t(0));
    EXPECT_EQ(eccvm_ops_table.size(), expected_num_ops);

    // Check that accessing the table values via operator[] matches the manually constructed mock table
    for (size_t i = 0; i < expected_num_ops; ++i) {
        EXPECT_EQ(expected_eccvm_ops_table.eccvm_ops[i], eccvm_ops_table[i]);
    }

    // Check that the copy-based reconstruction of the eccvm ops table matches the expected table
    EXPECT_EQ(expected_eccvm_ops_table.eccvm_ops, eccvm_ops_table.get_reconstructed());
}

// Ensure EccvmOpsTable correctly constructs a concatenated table from successively appended
// subtables
TEST(EccOpsTableTest, EccvmOpsTableAppendOnly)
{

    // Construct sets of eccvm ops, each representing those added by a single circuit
    using TableGenerator = EccOpsTableTest::EccvmOpTableGenerator;

    // Construct sets of ops, each representing those added by a single circuit
    const size_t NUM_SUBTABLES = 3;
    std::vector<size_t> subtable_op_counts = { 4, 2, 7 };

    TableGenerator table_generator;
    auto subtables = table_generator.generate_subtables(NUM_SUBTABLES, subtable_op_counts);

    // Construct the concatenated eccvm ops table
    EccvmOpsTable eccvm_ops_table;
    for (const auto& subtable_ops : subtables) {
        eccvm_ops_table.create_new_subtable();
        for (const auto& op : subtable_ops) {
            eccvm_ops_table.push(op);
        }
        eccvm_ops_table.merge();
    }

    // Construct the mock eccvm ops table which contains the subtables in append order.
    EccOpsTableTest::MockEccvmOpsTable expected_eccvm_ops_table(subtables);

    // Check that the table has the correct size
    auto expected_num_ops = std::accumulate(subtable_op_counts.begin(), subtable_op_counts.end(), size_t(0));
    EXPECT_EQ(eccvm_ops_table.size(), expected_num_ops);

    // Check that accessing the table values via operator[] matches the manually constructed mock table
    for (size_t i = 0; i < expected_num_ops; ++i) {
        EXPECT_EQ(expected_eccvm_ops_table.eccvm_ops[i], eccvm_ops_table[i]);
    }

    // Check that the copy-based reconstruction of the eccvm ops table matches the expected table
    EXPECT_EQ(expected_eccvm_ops_table.eccvm_ops, eccvm_ops_table.get_reconstructed());
}
