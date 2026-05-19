#include "barretenberg/op_queue/ecc_op_queue.hpp"

#include <utility>

namespace bb {

bool ecc_op_queue_accumulator_is_empty(const std::shared_ptr<ECCOpQueue>& op_queue)
{
    return op_queue->get_accumulator().is_point_at_infinity();
}

std::pair<UltraOp, ECCVMOperation> UltraEccOpsTable::make_hiding_op_pair(const curve::BN254::BaseField& Px,
                                                                         const curve::BN254::BaseField& Py)
{
    using Fr = curve::BN254::ScalarField;
    using Point = curve::BN254::AffineElement;

    EccOpCode op_code{ .eq = true, .reset = true };
    Point base_point;
    base_point.x = Px;
    base_point.y = Py;

    constexpr size_t CHUNK_SIZE = 2 * stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION;
    uint256_t x_256(Px);
    uint256_t y_256(Py);
    UltraOp ultra_op{
        .op_code = op_code,
        .x_lo = Fr(x_256.slice(0, CHUNK_SIZE)),
        .x_hi = Fr(x_256.slice(CHUNK_SIZE, CHUNK_SIZE * 2)),
        .y_lo = Fr(y_256.slice(0, CHUNK_SIZE)),
        .y_hi = Fr(y_256.slice(CHUNK_SIZE, CHUNK_SIZE * 2)),
        .z_1 = Fr(0),
        .z_2 = Fr(0),
        .return_is_infinity = false,
    };
    ECCVMOperation eccvm_op{ .op_code = op_code, .base_point = base_point };
    return { ultra_op, eccvm_op };
}

size_t UltraEccOpsTable::num_ultra_rows() const
{
    if (!has_fixed_append_offset()) {
        return table.size() * NUM_ROWS_PER_OP;
    }
    BB_ASSERT(!table.get().empty(), "Fixed-append set but no subtables present");
    const size_t last_subtable_rows = table.get().back().size() * NUM_ROWS_PER_OP;
    return (fixed_append_offset.value() * NUM_ROWS_PER_OP) + APPEND_TRACE_OFFSET + last_subtable_rows;
}

size_t UltraEccOpsTable::ultra_table_size_up_to_tail() const
{
    BB_ASSERT_EQ(table.get_current_subtable_size(),
                 0UL,
                 "Current subtable should be merged before computing the size of table of operations up to the tail.");
    BB_ASSERT_GT(table.num_subtables(), 1UL, "Cannot compute tail table size without at least two tables.");
    size_t size = 0;
    for (size_t subtable_idx = 0; subtable_idx < table.num_subtables() - 1; ++subtable_idx) {
        size += table.get()[subtable_idx].size() * NUM_ROWS_PER_OP;
    }
    return size;
}

void UltraEccOpsTable::merge_with_fixed_append_offset(size_t offset)
{
    BB_ASSERT(!has_fixed_append_offset(), "Can only perform fixed-location append once");

    size_t prior_subtables_size = 0;
    for (const auto& subtable : table.get()) {
        prior_subtables_size += subtable.size();
    }
    BB_ASSERT_LTE(prior_subtables_size,
                  offset,
                  "Merged table size exceeds fixed append offset. This means that there are too many ops before "
                  "the last subtable. The last subtable doesn't fit at the end of the op queue.");

    fixed_append_offset = offset;
    table.merge();
}

std::vector<UltraOp> UltraEccOpsTable::get_no_zk_reconstructed_ultra_ops() const
{
    return get_reconstructed(/*include_zk_ops=*/false);
}

std::vector<UltraOp> UltraEccOpsTable::get_zk_reconstructed_ultra_ops() const
{
    return get_reconstructed(/*include_zk_ops=*/true);
}

std::vector<UltraOp> UltraEccOpsTable::get_reconstructed(const bool include_zk_ops) const
{
    BB_ASSERT_EQ(get_current_subtable_size(),
                 0UL,
                 "current subtable should be merged before reconstructing the full table of operations.");
    BB_ASSERT(!include_zk_ops || has_zk_ops(), "ZK ops must be constructed before reconstructing the Ultra table.");

    std::vector<UltraOp> reconstructed_table;
    reconstructed_table.reserve(1 << CONST_OP_QUEUE_LOG_SIZE);

    if (include_zk_ops) {
        reconstructed_table.insert(reconstructed_table.end(), zk_ops.begin(), zk_ops.end());
    }

    if (!has_fixed_append_offset()) {
        for (const auto& subtable : table.get()) {
            reconstructed_table.insert(reconstructed_table.end(), subtable.begin(), subtable.end());
        }
        return reconstructed_table;
    }

    for (size_t idx = 0; idx + 1 < table.num_subtables(); ++idx) {
        const auto& subtable = table.get()[idx];
        reconstructed_table.insert(reconstructed_table.end(), subtable.begin(), subtable.end());
    }

    constexpr size_t preamble_op_slots = APPEND_TRACE_OFFSET / NUM_ROWS_PER_OP;
    const size_t zk_offset_ops = include_zk_ops ? zk_ops.size() : 0;
    const size_t target_op_count = fixed_append_offset.value() + zk_offset_ops + preamble_op_slots;
    BB_ASSERT_LTE(
        reconstructed_table.size(), target_op_count, "Current table size is larger than fixed append offset.");
    reconstructed_table.insert(
        reconstructed_table.end(), target_op_count - reconstructed_table.size(), UltraOp{ /* no-op */ });

    const auto& final_subtable = table.get().back();
    reconstructed_table.insert(reconstructed_table.end(), final_subtable.begin(), final_subtable.end());
    return reconstructed_table;
}

std::pair<UltraEccOpsTable::ColumnPolynomials, ECCVMOperation> UltraEccOpsTable::construct_zk_columns()
{
    BB_ASSERT(!has_zk_ops(), "ZK ops should only be constructed once.");

    for (size_t idx = 0; idx < ECC_NUM_NO_OPS_START; idx++) {
        zk_ops.push_back(UltraOp{ /* no_op */ });
    }

    for (size_t idx = 0; idx < ECC_NUM_RANDOM_OPS_START; idx++) {
        zk_ops.push_back(UltraOp{ .op_code = EccOpCode{ .is_random_op = true,
                                                        .random_value_1 = Fr::random_element(),
                                                        .random_value_2 = Fr::random_element() },
                                  .x_lo = Fr::random_element(),
                                  .x_hi = Fr::random_element(),
                                  .y_lo = Fr::random_element(),
                                  .y_hi = Fr::random_element(),
                                  .z_1 = Fr::random_element(),
                                  .z_2 = Fr::random_element(),
                                  .return_is_infinity = false });
    }

    using Fq = curve::BN254::BaseField;
    auto [hiding_ultra_op, hiding_eccvm_op] = make_hiding_op_pair(Fq::random_element(), Fq::random_element());
    zk_ops.push_back(hiding_ultra_op);

    const size_t poly_size = (zk_ops.size() * NUM_ROWS_PER_OP);
    BB_ASSERT_EQ(poly_size, ZK_ULTRA_OPS);

    ColumnPolynomials column_polynomials;
    for (auto& poly : column_polynomials) {
        poly = Polynomial<Fr>(poly_size);
    }

    size_t i = 0;
    for (const auto& op : zk_ops) {
        write_op_to_polynomials(column_polynomials, op, i);
        i += NUM_ROWS_PER_OP;
    }

    return { column_polynomials, hiding_eccvm_op };
}

std::vector<UltraEccOpsTable::ColumnPolynomials> UltraEccOpsTable::construct_subtable_columns() const
{
    std::vector<ColumnPolynomials> subtable_columns;

    for (size_t idx = 0; idx < table.num_subtables(); idx++) {
        const auto& subtable = table.get()[idx];
        const size_t poly_size = (subtable.size() * NUM_ROWS_PER_OP);
        ColumnPolynomials columns = construct_columns_in_range(poly_size, idx, idx + 1);
        subtable_columns.push_back(std::move(columns));
    }

    return subtable_columns;
}

UltraEccOpsTable::ColumnPolynomials UltraEccOpsTable::construct_table_columns(const bool include_zk_ops) const
{
    BB_ASSERT(!include_zk_ops || has_zk_ops(),
              "ZK ops must be constructed before constructing the full Ultra table with ZK ops.");
    return construct_columns_in_range(num_ultra_rows(), 0, table.num_subtables(), include_zk_ops, fixed_append_offset);
}

UltraEccOpsTable::ColumnPolynomials UltraEccOpsTable::construct_table_columns_up_to_tail() const
{
    BB_ASSERT(has_zk_ops(), "ZK ops should have been constructed before constructing the table up to tail");
    BB_ASSERT_GT(table.num_subtables(),
                 1UL,
                 "There should be at least two subtables (including the tail) to construct the table up to tail");
    BB_ASSERT_GT(table.num_subtables(), 0UL, "Cannot construct table up to tail without a current subtable");

    return construct_columns_in_range(
        ultra_table_size_up_to_tail(), 0, table.num_subtables() - 1, /*include_zk_ops=*/true);
}

UltraEccOpsTable::ColumnPolynomials UltraEccOpsTable::construct_current_ultra_ops_subtable_columns() const
{
    BB_ASSERT(table.num_subtables() > 0, "Cannot construct current subtable columns with no merged subtables");
    const size_t leading_zeros = has_fixed_append_offset() ? APPEND_TRACE_OFFSET : 0;
    const auto& subtable = table.get().back();
    const size_t poly_size = leading_zeros + (subtable.size() * NUM_ROWS_PER_OP);

    ColumnPolynomials column_polynomials;
    if (poly_size == 0) {
        return column_polynomials;
    }
    for (auto& poly : column_polynomials) {
        poly = Polynomial<Fr>(poly_size);
    }

    size_t row = leading_zeros;
    for (const auto& op : subtable) {
        write_op_to_polynomials(column_polynomials, op, row);
        row += NUM_ROWS_PER_OP;
    }
    return column_polynomials;
}

void UltraEccOpsTable::write_op_to_polynomials(ColumnPolynomials& column_polynomials,
                                               const UltraOp& op,
                                               const size_t row_idx)
{
    column_polynomials[0].at(row_idx) = !op.op_code.is_random_op ? op.op_code.value() : op.op_code.random_value_1;
    column_polynomials[1].at(row_idx) = op.x_lo;
    column_polynomials[2].at(row_idx) = op.x_hi;
    column_polynomials[3].at(row_idx) = op.y_lo;
    column_polynomials[0].at(row_idx + 1) = !op.op_code.is_random_op ? 0 : op.op_code.random_value_2;
    column_polynomials[1].at(row_idx + 1) = op.y_hi;
    column_polynomials[2].at(row_idx + 1) = op.z_1;
    column_polynomials[3].at(row_idx + 1) = op.z_2;
}

UltraEccOpsTable::ColumnPolynomials UltraEccOpsTable::construct_columns_in_range(
    const size_t poly_size,
    const size_t subtable_start_idx,
    const size_t subtable_end_idx,
    const bool include_zk_ops,
    const std::optional<size_t> fixed_append_offset_for_last) const
{
    const size_t final_poly_size = poly_size + (include_zk_ops ? ZK_ULTRA_OPS : 0);

    ColumnPolynomials column_polynomials;
    if (final_poly_size == 0) {
        return column_polynomials;
    }
    for (auto& poly : column_polynomials) {
        poly = Polynomial<Fr>(final_poly_size);
    }

    size_t row = 0;

    if (include_zk_ops) {
        BB_ASSERT(has_zk_ops(), "ZK ops should have been constructed before including them in the columns");
        for (const auto& op : zk_ops) {
            write_op_to_polynomials(column_polynomials, op, row);
            row += NUM_ROWS_PER_OP;
        }
    }

    const size_t sequential_end = fixed_append_offset_for_last.has_value() ? subtable_end_idx - 1 : subtable_end_idx;
    for (size_t idx = subtable_start_idx; idx < sequential_end; ++idx) {
        for (const auto& op : table.get()[idx]) {
            write_op_to_polynomials(column_polynomials, op, row);
            row += NUM_ROWS_PER_OP;
        }
    }

    if (fixed_append_offset_for_last.has_value()) {
        const size_t zk_prefix_rows = include_zk_ops ? ZK_ULTRA_OPS : 0;
        size_t append_row =
            zk_prefix_rows + (fixed_append_offset_for_last.value() * NUM_ROWS_PER_OP) + APPEND_TRACE_OFFSET;
        for (const auto& op : table.get()[subtable_end_idx - 1]) {
            write_op_to_polynomials(column_polynomials, op, append_row);
            append_row += NUM_ROWS_PER_OP;
        }
    }

    return column_polynomials;
}

ECCOpQueue::ECCOpQueue()
{
    initialize_new_subtable();
}

void ECCOpQueue::initialize_new_subtable()
{
    eccvm_ops_table.create_new_subtable();
    ultra_ops_table.create_new_subtable();
}

size_t ECCOpQueue::num_subtables() const
{
    return eccvm_ops_table.num_subtables();
}

size_t ECCOpQueue::get_current_subtable_size() const
{
    return ultra_ops_table.get_current_subtable_size();
}

size_t ECCOpQueue::get_append_offset() const
{
    constexpr size_t reserved_op_slots = UltraEccOpsTable::APPEND_TRACE_OFFSET / UltraEccOpsTable::NUM_ROWS_PER_OP;
    constexpr size_t zk_op_slots = UltraEccOpsTable::ZK_ULTRA_OPS / UltraEccOpsTable::NUM_ROWS_PER_OP;
    return OP_QUEUE_SIZE - get_current_subtable_size() - reserved_op_slots - zk_op_slots;
}

void ECCOpQueue::merge()
{
    eccvm_ops_table.merge();
    ultra_ops_table.merge();
}

void ECCOpQueue::merge_fixed_append(size_t ultra_fixed_offset)
{
    eccvm_ops_table.merge();
    ultra_ops_table.merge_with_fixed_append_offset(ultra_fixed_offset);
}

std::array<Polynomial<curve::BN254::ScalarField>, UltraEccOpsTable::TABLE_WIDTH> ECCOpQueue::construct_zk_columns()
{
    auto [column_polynomials, hiding_op] = ultra_ops_table.construct_zk_columns();
    this->hiding_op_for_eccvm = hiding_op;
    this->has_hiding_op = true;

    return column_polynomials;
}

std::vector<std::array<Polynomial<curve::BN254::ScalarField>, UltraEccOpsTable::TABLE_WIDTH>> ECCOpQueue::
    construct_subtable_columns() const
{
    return ultra_ops_table.construct_subtable_columns();
}

std::array<Polynomial<curve::BN254::ScalarField>, UltraEccOpsTable::TABLE_WIDTH> ECCOpQueue::
    construct_ultra_ops_table_columns(const bool include_zk_ops) const
{
    return ultra_ops_table.construct_table_columns(include_zk_ops);
}

std::array<Polynomial<curve::BN254::ScalarField>, UltraEccOpsTable::TABLE_WIDTH> ECCOpQueue::
    construct_table_columns_up_to_tail() const
{
    return ultra_ops_table.construct_table_columns_up_to_tail();
}

std::array<Polynomial<curve::BN254::ScalarField>, UltraEccOpsTable::TABLE_WIDTH> ECCOpQueue::
    construct_current_ultra_ops_subtable_columns() const
{
    return ultra_ops_table.construct_current_ultra_ops_subtable_columns();
}

void ECCOpQueue::construct_full_eccvm_ops_table()
{
    eccvm_ops_reconstructed = eccvm_ops_table.get_reconstructed();
}

void ECCOpQueue::construct_zk_reconstructed_ultra_ops_table()
{
    ultra_ops_zk_reconstructed = ultra_ops_table.get_zk_reconstructed_ultra_ops();
}

void ECCOpQueue::construct_no_zk_reconstructed_ultra_ops_table()
{
    ultra_ops_no_zk_reconstructed = ultra_ops_table.get_no_zk_reconstructed_ultra_ops();
}

size_t ECCOpQueue::get_ultra_ops_table_num_rows() const
{
    return ultra_ops_table.num_ultra_rows();
}

size_t ECCOpQueue::get_ultra_ops_count() const
{
    return ultra_ops_table.num_ops();
}

size_t ECCOpQueue::get_ultra_ops_table_num_rows_up_to_tail() const
{
    return ultra_ops_table.ultra_table_size_up_to_tail();
}

std::vector<ECCVMOperation>& ECCOpQueue::get_eccvm_ops()
{
    if (eccvm_ops_reconstructed.empty()) {
        construct_full_eccvm_ops_table();
        // Prepend the hiding op at index 0 (required for ZK)
        if (!has_hiding_op) {
            throw_or_abort("Hiding op must be set before calling get_eccvm_ops()");
        }
        eccvm_ops_reconstructed.insert(eccvm_ops_reconstructed.begin(), hiding_op_for_eccvm);
    }
    return eccvm_ops_reconstructed;
}

std::vector<UltraOp>& ECCOpQueue::get_no_zk_reconstructed_ultra_ops()
{
    if (ultra_ops_no_zk_reconstructed.empty()) {
        construct_no_zk_reconstructed_ultra_ops_table();
    }
    return ultra_ops_no_zk_reconstructed;
}

std::vector<UltraOp>& ECCOpQueue::get_zk_reconstructed_ultra_ops()
{
    if (ultra_ops_zk_reconstructed.empty()) {
        construct_zk_reconstructed_ultra_ops_table();
    }
    return ultra_ops_zk_reconstructed;
}

size_t ECCOpQueue::get_num_msm_rows() const
{
    return eccvm_row_tracker.get_num_msm_rows();
}

size_t ECCOpQueue::get_num_rows() const
{
    return eccvm_row_tracker.get_num_rows();
}

uint32_t ECCOpQueue::get_number_of_muls() const
{
    return eccvm_row_tracker.get_number_of_muls();
}

void ECCOpQueue::set_eccvm_ops_for_fuzzing(std::vector<ECCVMOperation>& eccvm_ops_in)
{
    eccvm_ops_reconstructed = eccvm_ops_in;
}

void ECCOpQueue::add_erroneous_equality_op_for_testing()
{
    EccOpCode op_code{ .eq = true, .reset = true };
    append_eccvm_op(ECCVMOperation{ .op_code = op_code, .base_point = Point::random_element() });
}

void ECCOpQueue::empty_row_for_testing()
{
    append_eccvm_op(ECCVMOperation{ .base_point = point_at_infinity });
    accumulator.self_set_infinity();
}

curve::BN254::AffineElement ECCOpQueue::get_accumulator()
{
    return accumulator;
}

UltraOp ECCOpQueue::add_accumulate(const Point& to_add)
{
    // Update the accumulator natively
    accumulator = accumulator + to_add;
    EccOpCode op_code{ .add = true };
    // Store the eccvm operation
    append_eccvm_op(ECCVMOperation{ .op_code = op_code, .base_point = to_add });

    // Construct and store the operation in the ultra op format
    return construct_and_populate_ultra_ops(op_code, to_add);
}

UltraOp ECCOpQueue::mul_accumulate(const Point& to_mul, const Fr& scalar)
{
    BB_BENCH_NAME("ECCOpQueue::mul_accumulate");
    // Update the accumulator natively
    accumulator = accumulator + to_mul * scalar;
    EccOpCode op_code{ .mul = true };

    // Construct and store the operation in the ultra op format
    UltraOp ultra_op = construct_and_populate_ultra_ops(op_code, to_mul, scalar);

    // Store the eccvm operation
    append_eccvm_op(ECCVMOperation{
        .op_code = op_code,
        .base_point = to_mul,
        .z1 = ultra_op.z_1,
        .z2 = ultra_op.z_2,
        .mul_scalar_full = scalar,
    });

    return ultra_op;
}

UltraOp ECCOpQueue::no_op_ultra_only()
{
    UltraOp no_op{};
    ultra_ops_table.push(no_op);
    return no_op;
}

UltraOp ECCOpQueue::random_op_ultra_only()
{
    UltraOp random_op{ .op_code = EccOpCode{ .is_random_op = true,
                                             .random_value_1 = Fr::random_element(),
                                             .random_value_2 = Fr::random_element() },
                       .x_lo = Fr::random_element(),
                       .x_hi = Fr::random_element(),
                       .y_lo = Fr::random_element(),
                       .y_hi = Fr::random_element(),
                       .z_1 = Fr::random_element(),
                       .z_2 = Fr::random_element(),
                       .return_is_infinity = false };
    ultra_ops_table.push(random_op);
    return random_op;
}

UltraOp ECCOpQueue::eq_and_reset()
{
    auto expected = accumulator;
    accumulator.self_set_infinity();
    EccOpCode op_code{ .eq = true, .reset = true };
    // Store eccvm operation
    append_eccvm_op(ECCVMOperation{ .op_code = op_code, .base_point = expected });

    // Construct and store the operation in the ultra op format
    return construct_and_populate_ultra_ops(op_code, expected);
}

UltraOp ECCOpQueue::append_hiding_op(const Fq& Px, const Fq& Py)
{
    auto [ultra_op, eccvm_op] = UltraEccOpsTable::make_hiding_op_pair(Px, Py);

    hiding_op_for_eccvm = eccvm_op;
    has_hiding_op = true;
    ultra_ops_table.push(ultra_op);

    // Do NOT update the accumulator - the hiding op doesn't perform any actual EC computation
    return ultra_op;
}

void ECCOpQueue::append_eccvm_op(const ECCVMOperation& op)
{
    eccvm_row_tracker.update_cached_msms(op);
    eccvm_ops_table.push(op);
}

UltraOp ECCOpQueue::construct_and_populate_ultra_ops(EccOpCode op_code, const Point& point, const Fr& scalar)
{
    UltraOp ultra_op;
    ultra_op.op_code = op_code;

    // Decompose point coordinates (Fq) into hi-lo chunks (Fr)
    const size_t CHUNK_SIZE = 2 * stdlib::NUM_LIMB_BITS_IN_FIELD_SIMULATION;
    uint256_t x_256(point.x);
    uint256_t y_256(point.y);
    ultra_op.return_is_infinity = point.is_point_at_infinity();
    // if we have a point at infinity, set x/y to zero
    // in the biggroup_goblin class we use `assert_equal` statements to validate
    // the original in-circuit coordinate values are also zero
    if (point.is_point_at_infinity()) {
        x_256 = 0;
        y_256 = 0;
    }
    ultra_op.x_lo = Fr(x_256.slice(0, CHUNK_SIZE));
    ultra_op.x_hi = Fr(x_256.slice(CHUNK_SIZE, CHUNK_SIZE * 2));
    ultra_op.y_lo = Fr(y_256.slice(0, CHUNK_SIZE));
    ultra_op.y_hi = Fr(y_256.slice(CHUNK_SIZE, CHUNK_SIZE * 2));

    // Split scalar into 128 bit endomorphism scalars
    Fr z_1 = 0;
    Fr z_2 = 0;
    auto converted = scalar.from_montgomery_form();
    uint256_t converted_u256(scalar);
    // if our scalar is small, don't split.
    if (converted_u256.get_msb() < 128) {
        ultra_op.z_1 = scalar;
        ultra_op.z_2 = 0;
    } else {
        Fr::split_into_endomorphism_scalars(converted, z_1, z_2);
        ultra_op.z_1 = z_1.to_montgomery_form();
        ultra_op.z_2 = z_2.to_montgomery_form();
    }

    ultra_ops_table.push(ultra_op);

    return ultra_op;
}

} // namespace bb
