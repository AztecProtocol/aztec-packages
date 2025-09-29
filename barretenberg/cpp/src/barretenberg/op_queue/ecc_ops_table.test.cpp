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

        // Construct the ultra ops table from the given subtables, ordered as they should appear in the op queue.
        MockUltraOpsTable(const auto& subtable_ops)
        {
            for (auto& ops : subtable_ops) {
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
            for (auto& ops : subtable_ops) {
                for (const auto& op : ops) {
                    eccvm_ops.push_back(op);
                }
            }
        }
    };
};

// Ensure UltraOpsTable correctly constructs a concatenated table from successively prepended subtables
TEST(EccOpsTableTest, UltraOpsTablePrependOnly)
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

    std::reverse(subtables.begin(), subtables.end());
    // Construct the mock ultra ops table which contains the subtables ordered in reverse (as if prepended)
    EccOpsTableTest::MockUltraOpsTable expected_ultra_ops_table(subtables);

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

TEST(EccOpsTableTest, UltraOpsPrependThenAppend)
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
    std::array<MergeSettings, NUM_SUBTABLES> merge_settings = { MergeSettings::PREPEND,
                                                                MergeSettings::PREPEND,
                                                                MergeSettings::APPEND };
    for (const auto& [subtable_ops, setting] : zip_view(subtables, merge_settings)) {
        ultra_ops_table.create_new_subtable();
        for (const auto& op : subtable_ops) {
            ultra_ops_table.push(op);
        }
        ultra_ops_table.merge(setting);
    }

    std::vector<std::vector<UltraOp>> ordered_subtables;
    for (auto [subtable, setting] : zip_view(subtables, merge_settings)) {
        auto it = setting == MergeSettings::PREPEND ? ordered_subtables.begin() : ordered_subtables.end();
        ordered_subtables.insert(it, subtable);
    }

    // Construct the mock ultra ops table which contains the subtables ordered in reverse (as if prepended)
    EccOpsTableTest::MockUltraOpsTable expected_ultra_ops_table(ordered_subtables);

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
    std::array<MergeSettings, NUM_SUBTABLES> merge_settings = { MergeSettings::PREPEND,
                                                                MergeSettings::PREPEND,
                                                                MergeSettings::APPEND };

    for (size_t i = 0; i < NUM_SUBTABLES; ++i) {
        ultra_ops_table.create_new_subtable();
        for (const auto& op : subtables[i]) {
            ultra_ops_table.push(op);
        }

        // For APPEND (last subtable), don't provide an offset (default to right after prepended tables)
        ultra_ops_table.merge(merge_settings[i]);
    }

    // Expected order: subtable[1], subtable[0], subtable[2] (no gap)
    std::vector<std::vector<UltraOp>> ordered_subtables = { subtables[1], subtables[0], subtables[2] };

    // Construct the mock ultra ops table
    EccOpsTableTest::MockUltraOpsTable expected_ultra_ops_table(ordered_subtables);

    // Check that the ultra ops table has the correct size
    auto expected_num_ops = std::accumulate(subtable_op_counts.begin(), subtable_op_counts.end(), size_t(0));
    EXPECT_EQ(ultra_ops_table.size(), expected_num_ops);

    // Construct polynomials corresponding to the columns of the ultra ops table
    std::array<Polynomial<Fr>, 4> ultra_ops_table_polynomials = ultra_ops_table.construct_table_columns();

    // Check that the ultra ops table matches the expected table
    for (auto [expected_column, poly] : zip_view(expected_ultra_ops_table.columns, ultra_ops_table_polynomials)) {
        for (auto [expected_value, value] : zip_view(expected_column, poly.coeffs())) {
            EXPECT_EQ(expected_value, value);
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
    std::array<MergeSettings, NUM_SUBTABLES> merge_settings = { MergeSettings::PREPEND,
                                                                MergeSettings::PREPEND,
                                                                MergeSettings::APPEND };

    // Define a fixed offset at which to append the table (must be greater than the total size of the prepended tables)
    const size_t fixed_offset = 20;
    const size_t fixed_offset_num_rows = fixed_offset * ULTRA_ROWS_PER_OP;
    const size_t prepended_size = (subtable_op_counts[0] + subtable_op_counts[1]) * ULTRA_ROWS_PER_OP;
    ASSERT(fixed_offset_num_rows > prepended_size);

    // Construct the ultra ops table
    for (size_t i = 0; i < NUM_SUBTABLES; ++i) {
        ultra_ops_table.create_new_subtable();
        for (const auto& op : subtables[i]) {
            ultra_ops_table.push(op);
        }

        // For APPEND (last subtable), provide a fixed offset
        if (merge_settings[i] == MergeSettings::APPEND) {
            ultra_ops_table.merge(merge_settings[i], fixed_offset);
        } else {
            ultra_ops_table.merge(merge_settings[i]);
        }
    }

    // Check that the ultra ops table has the correct total size (gap is not present in raw ops table)
    auto expected_num_ops = std::accumulate(subtable_op_counts.begin(), subtable_op_counts.end(), size_t(0));
    EXPECT_EQ(ultra_ops_table.size(), expected_num_ops);

    // Check that the polynomials have the correct size (including gap)
    size_t expected_poly_size = fixed_offset_num_rows + (subtable_op_counts[2] * ULTRA_ROWS_PER_OP);
    EXPECT_EQ(ultra_ops_table.ultra_table_size(), expected_poly_size);

    // Construct polynomials corresponding to the columns of the ultra ops table
    std::array<Polynomial<Fr>, 4> ultra_ops_table_polynomials = ultra_ops_table.construct_table_columns();

    // Verify each polynomial has the expected size
    for (const auto& poly : ultra_ops_table_polynomials) {
        EXPECT_EQ(poly.size(), expected_poly_size);
    }

    // Construct expected table with zeros in the gap
    // Order: subtable[1], subtable[0], zeros, subtable[2]
    std::vector<std::vector<UltraOp>> ordered_subtables = { subtables[1], subtables[0] };
    EccOpsTableTest::MockUltraOpsTable expected_prepended_table(ordered_subtables);

    // Check prepended subtables are at the beginning
    for (auto [ultra_op_poly, expected_poly] :
         zip_view(ultra_ops_table_polynomials, expected_prepended_table.columns)) {
        for (size_t row = 0; row < prepended_size; ++row) {
            EXPECT_EQ(ultra_op_poly.at(row), expected_poly[row]);
        }
    }

    // Check gap from offset to appended subtable is filled with zeros
    for (auto ultra_op_poly : ultra_ops_table_polynomials) {
        for (size_t row = prepended_size; row < fixed_offset_num_rows; ++row) {
            EXPECT_EQ(ultra_op_poly.at(row), Fr::zero());
        }
    }

    // Check appended subtable is at the fixed offset
    std::vector<std::vector<UltraOp>> appended_subtables = { subtables[2] };
    EccOpsTableTest::MockUltraOpsTable expected_appended_table(appended_subtables);
    for (auto [ultra_op_poly, expected_poly] : zip_view(ultra_ops_table_polynomials, expected_appended_table.columns)) {
        for (size_t row = 0; row < subtable_op_counts[2] * ULTRA_ROWS_PER_OP; row++) {
            EXPECT_EQ(ultra_op_poly.at(fixed_offset_num_rows + row), expected_poly[row]);
        }
    }

    // Mimic get_reconstructed by unifying all the ops from subtables into a single vector with the appropriate append
    // offset
    {
        std::vector<UltraOp> expected_reconstructed;
        expected_reconstructed.reserve(expected_num_ops + fixed_offset);

        // Order: subtable[1], subtable[0], no-ops range, subtable[2]
        for (const auto& op : subtables[1]) {
            expected_reconstructed.push_back(op);
        }
        for (const auto& op : subtables[0]) {
            expected_reconstructed.push_back(op);
        }

        // Add the range of noops
        UltraOp no_op = {};
        size_t size_before = expected_reconstructed.size();
        for (size_t i = size_before; i < fixed_offset; i++) {
            expected_reconstructed.push_back(no_op);
        }

        for (const auto& op : subtables[2]) {
            expected_reconstructed.push_back(op);
        }

        EXPECT_EQ(expected_reconstructed.size(), ultra_ops_table.get_reconstructed().size());

        // Compare to the op-queue's reconstruction (should include the gap as no-ops)
        EXPECT_EQ(expected_reconstructed, ultra_ops_table.get_reconstructed());
    }
}

// Ensure EccvmOpsTable correctly constructs a concatenated table from successively prepended subtables
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

    std::reverse(subtables.begin(), subtables.end());
    // Construct the mock eccvm ops table which contains the subtables ordered in reverse (as if prepended)
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

// Ensure EccvmOpsTable correctly constructs a concatenated table from successively prepended and then appended
// subtables
TEST(EccOpsTableTest, EccvmOpsTablePrependThenAppend)
{

    // Construct sets of eccvm ops, each representing those added by a single circuit
    using TableGenerator = EccOpsTableTest::EccvmOpTableGenerator;

    // Construct sets of ops, each representing those added by a single circuit
    const size_t NUM_SUBTABLES = 3;
    std::vector<size_t> subtable_op_counts = { 4, 2, 7 };

    TableGenerator table_generator;
    auto subtables = table_generator.generate_subtables(NUM_SUBTABLES, subtable_op_counts);

    std::array<MergeSettings, NUM_SUBTABLES> merge_settings = { MergeSettings::PREPEND,
                                                                MergeSettings::PREPEND,
                                                                MergeSettings::APPEND };
    // Construct the concatenated eccvm ops table
    EccvmOpsTable eccvm_ops_table;
    for (const auto& [subtable_ops, setting] : zip_view(subtables, merge_settings)) {
        eccvm_ops_table.create_new_subtable();
        for (const auto& op : subtable_ops) {
            eccvm_ops_table.push(op);
        }
        eccvm_ops_table.merge(setting);
    }

    std::vector<std::vector<ECCVMOperation>> ordered_subtables;
    for (auto [subtable, setting] : zip_view(subtables, merge_settings)) {
        auto it = setting == MergeSettings::PREPEND ? ordered_subtables.begin() : ordered_subtables.end();
        ordered_subtables.insert(it, subtable);
    }

    // Construct the mock ultra ops table which contains the subtables ordered in reverse (as if prepended)
    EccOpsTableTest::MockEccvmOpsTable expected_eccvm_ops_table(ordered_subtables);

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
