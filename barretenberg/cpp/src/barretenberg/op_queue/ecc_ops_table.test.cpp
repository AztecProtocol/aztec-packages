#include "barretenberg/op_queue/ecc_ops_table.hpp"
#include "barretenberg/common/zip_view.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include <gtest/gtest.h>

#include <ranges>

using namespace bb;

class EccOpsTableTest : public ::testing::Test {
    using Curve = curve::BN254;
    using Scalar = fr;
    using ECCVMOperation = VMOperation<Curve::Group>;

  public:
    // Mock ultra ops table that constructs a concatenated table from successively prepended subtables
    struct MockUltraOpsTable {
        std::array<std::vector<Scalar>, 4> columns;
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

    // Mock eccvm ops table that constructs a concatenated table from successively prepended subtables
    struct MockEccvmOpsTable {
        std::vector<ECCVMOperation> eccvm_ops;

        MockEccvmOpsTable(const auto& subtable_ops)
        {
            for (auto& ops : std::ranges::reverse_view(subtable_ops)) {
                for (const auto& op : ops) {
                    eccvm_ops.push_back(op);
                }
            }
        }
    };

    static UltraOp random_ultra_op()
    {
        UltraOp op;
        op.op_code = EccOpCode{};
        op.x_lo = Scalar::random_element();
        op.x_hi = Scalar::random_element();
        op.y_lo = Scalar::random_element();
        op.y_hi = Scalar::random_element();
        op.z_1 = Scalar::random_element();
        op.z_2 = Scalar::random_element();
        op.return_is_infinity = false;
        return op;
    }

    static ECCVMOperation random_eccvm_op()
    {
        return ECCVMOperation{ .op_code = EccOpCode{ .mul = true },
                               .base_point = curve::BN254::Group::affine_element::random_element(),
                               .z1 = uint256_t(Scalar::random_element()),
                               .z2 = uint256_t(Scalar::random_element()),
                               .mul_scalar_full = Scalar::random_element() };
    }
};

// Ensure UltraOpsTable correctly constructs a concatenated table from successively prepended subtables
TEST(EccOpsTableTest, UltraOpsTable)
{
    using Fr = fr;

    // Construct sets of ultra ops, each representing those added by a single circuit
    const size_t NUM_SUBTABLES = 3;
    std::array<std::vector<UltraOp>, NUM_SUBTABLES> subtable_ultra_ops;
    std::array<size_t, NUM_SUBTABLES> subtable_op_counts = { 4, 2, 7 };
    for (auto [subtable_ops, op_count] : zip_view(subtable_ultra_ops, subtable_op_counts)) {
        for (size_t i = 0; i < op_count; ++i) {
            subtable_ops.push_back(EccOpsTableTest::random_ultra_op());
        }
    }

    // Construct the mock ultra ops table which contains the subtables ordered in reverse (as if prepended)
    EccOpsTableTest::MockUltraOpsTable expected_ultra_ops_table(subtable_ultra_ops);

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

    // Construct polynomials corresponding to the columns of the ultra ops table
    std::array<Polynomial<Fr>, 4> ultra_ops_table_polynomials = ultra_ops_table.construct_table_columns();

    // Check that the ultra ops table constructed by the op queue matches the expected table
    for (auto [expected_column, poly] : zip_view(expected_ultra_ops_table.columns, ultra_ops_table_polynomials)) {
        for (auto [expected_value, value] : zip_view(expected_column, poly.coeffs())) {
            EXPECT_EQ(expected_value, value);
        }
    }
}

// Ensure EccvmOpsTable correctly constructs a concatenated table from successively prepended subtables
TEST(EccOpsTableTest, EccvmOpsTable)
{

    // Construct sets of eccvm ops, each representing those added by a single circuit
    const size_t NUM_SUBTABLES = 3;
    std::array<std::vector<ECCVMOperation>, NUM_SUBTABLES> subtable_eccvm_ops;
    std::array<size_t, NUM_SUBTABLES> subtable_op_counts = { 4, 2, 7 };
    for (auto [subtable_ops, op_count] : zip_view(subtable_eccvm_ops, subtable_op_counts)) {
        for (size_t i = 0; i < op_count; ++i) {
            subtable_ops.push_back(EccOpsTableTest::random_eccvm_op());
        }
    }

    // Construct the mock eccvm ops table which contains the subtables ordered in reverse (as if prepended)
    EccOpsTableTest::MockEccvmOpsTable expected_eccvm_ops_table(subtable_eccvm_ops);

    // Construct the concatenated eccvm ops table
    EccvmOpsTable eccvm_ops_table;
    for (const auto& subtable_ops : subtable_eccvm_ops) {
        eccvm_ops_table.create_new_subtable();
        for (const auto& op : subtable_ops) {
            eccvm_ops_table.push(op);
        }
    }

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
