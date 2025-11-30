// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "bigfield_translator.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/numeric/bitop/get_msb.hpp"

namespace bb {

BigfieldTranslator::fq_ct BigfieldTranslator::compute_column_sum(const std::vector<fq_ct>& column,
                                                                 const std::vector<fq_ct>& x_powers_base,
                                                                 const std::vector<fq_ct>& batch_multipliers,
                                                                 size_t num_rows)
{
    const size_t num_batches = (num_rows + BATCH_SIZE - 1) / BATCH_SIZE;

    fq_ct total_sum = fq_ct::zero();

    for (size_t batch = 0; batch < num_batches; batch++) {
        const size_t batch_start = batch * BATCH_SIZE;
        const size_t batch_end = std::min(batch_start + BATCH_SIZE, num_rows);
        const size_t actual_batch_size = batch_end - batch_start;

        std::vector<fq_ct> left(actual_batch_size);
        std::vector<fq_ct> right(actual_batch_size);

        for (size_t j = 0; j < actual_batch_size; j++) {
            const size_t row_idx = batch_start + j;
            left[j] = column[row_idx];
            // Within this batch, use descending powers from x^{BATCH_SIZE-1} down to x^{BATCH_SIZE-actual_batch_size}
            // For the last (potentially partial) batch, we still use the same x_powers_base indexing
            right[j] = x_powers_base[BATCH_SIZE - 1 - j];
        }

        fq_ct batch_sum = fq_ct::mult_madd(left, right, {});
        // Scale by batch multiplier and add to total
        total_sum = total_sum + batch_sum * batch_multipliers[batch];
    }

    return total_sum;
}

BigfieldTranslator::fq_ct BigfieldTranslator::compute_accumulator(Builder& builder,
                                                                  const fq_ct& evaluation_challenge_x,
                                                                  const fq_ct& batching_challenge_v)
{
    BB_BENCH_NAME("BigfieldTranslator::compute_accumulator");

    // Get the number of UltraOps from the ecc_op block
    // Each UltraOp uses 2 rows in the ecc_op block
    const size_t ecc_op_block_size = builder.blocks.ecc_op.size();
    BB_ASSERT(ecc_op_block_size % 2 == 0, "ecc_op block size must be even");
    const size_t num_rows = ecc_op_block_size / 2;

    if (num_rows == 0) {
        return fq_ct::zero();
    }

    // Op queue size must be a power of two
    BB_ASSERT((num_rows & (num_rows - 1)) == 0, "Op queue size must be a power of two");
    BB_ASSERT(num_rows >= BATCH_SIZE, "Op queue size must be at least BATCH_SIZE");

    const size_t num_batches = num_rows / BATCH_SIZE;
    const size_t log_num_batches = numeric::get_msb(num_batches);

    // Step 1: Compute BATCH_SIZE sequential powers (x^0 to x^{BATCH_SIZE-1})
    std::vector<fq_ct> x_powers_base(BATCH_SIZE);
    x_powers_base[0] = fq_ct::one();
    x_powers_base[1] = evaluation_challenge_x;
    for (size_t i = 2; i < BATCH_SIZE; i++) {
        x_powers_base[i] = x_powers_base[i - 1] * evaluation_challenge_x;
    }

    // Step 2: Compute batch multipliers via repeated squaring
    // x^BATCH_SIZE = x^{BATCH_SIZE-1} * x, then square repeatedly
    // We need: x^0, x^BATCH_SIZE, x^{2*BATCH_SIZE}, ..., x^{(num_batches-1)*BATCH_SIZE}
    // For descending order, batch 0 gets the largest power, batch num_batches-1 gets x^0

    std::vector<fq_ct> batch_multipliers(num_batches);
    batch_multipliers[num_batches - 1] = fq_ct::one(); // x^0

    if (num_batches > 1) {
        // Compute x^BATCH_SIZE, x^{2*BATCH_SIZE}, x^{4*BATCH_SIZE}, ... via repeated squaring
        fq_ct x_batch = x_powers_base[BATCH_SIZE - 1] * evaluation_challenge_x; // x^BATCH_SIZE

        // powers_of_two[i] = x^{BATCH_SIZE * 2^i}
        std::vector<fq_ct> powers_of_two(log_num_batches);
        powers_of_two[0] = x_batch;
        for (size_t i = 1; i < log_num_batches; i++) {
            powers_of_two[i] = powers_of_two[i - 1].sqr();
        }

        // Build batch multipliers in descending order
        // batch_multipliers[i] = x^{(num_batches - 1 - i) * BATCH_SIZE}
        for (size_t i = 0; i < num_batches - 1; i++) {
            size_t exponent = num_batches - 1 - i; // How many BATCH_SIZE units
            fq_ct mult = fq_ct::one();
            for (size_t bit = 0; bit < log_num_batches; bit++) {
                if ((exponent >> bit) & 1) {
                    mult = mult * powers_of_two[bit];
                }
            }
            batch_multipliers[i] = mult;
        }
    }

    // Step 3: Get witness indices from ecc_op block and create bigfield elements with range constraints
    //
    // The ecc_op block stores each UltraOp across 2 rows:
    //   Row 2i:   (op, x_lo, x_hi, y_lo)
    //   Row 2i+1: (0,  y_hi, z_1,  z_2)
    //
    // We use these witness indices directly to ensure the accumulator computation
    // uses the same witnesses that are copy-constrained to the kernel circuit.
    //
    // Range constraints:
    // - x_lo, x_hi, y_lo, y_hi: 136 bits each (Fq coordinates)
    // - z_1, z_2: 128 bits each (scalars)
    // - op: 4 bits (values in {0, 3, 4, 8}, TODO: refactor to {0,1,2,3})

    using field_ct = stdlib::field_t<Builder>;

    // Access the ecc_op block wires
    auto& ecc_op_wires = builder.blocks.ecc_op.wires;

    std::vector<fq_ct> ops(num_rows);
    std::vector<fq_ct> pxs(num_rows);
    std::vector<fq_ct> pys(num_rows);
    std::vector<fq_ct> z1s(num_rows);
    std::vector<fq_ct> z2s(num_rows);

    for (size_t i = 0; i < num_rows; i++) {
        // Each UltraOp uses 2 rows in the ecc_op block
        size_t row_idx = 2 * i;

        // Row 2i: (op, x_lo, x_hi, y_lo)
        uint32_t op_idx = ecc_op_wires[0][row_idx];
        uint32_t x_lo_idx = ecc_op_wires[1][row_idx];
        uint32_t x_hi_idx = ecc_op_wires[2][row_idx];
        uint32_t y_lo_idx = ecc_op_wires[3][row_idx];

        // Row 2i+1: (0, y_hi, z_1, z_2)
        uint32_t y_hi_idx = ecc_op_wires[1][row_idx + 1];
        uint32_t z1_idx = ecc_op_wires[2][row_idx + 1];
        uint32_t z2_idx = ecc_op_wires[3][row_idx + 1];

        // Create field_t from witness indices
        field_ct op_field = field_ct::from_witness_index(&builder, op_idx);
        field_ct x_lo = field_ct::from_witness_index(&builder, x_lo_idx);
        field_ct x_hi = field_ct::from_witness_index(&builder, x_hi_idx);
        field_ct y_lo = field_ct::from_witness_index(&builder, y_lo_idx);
        field_ct y_hi = field_ct::from_witness_index(&builder, y_hi_idx);
        field_ct z1_field = field_ct::from_witness_index(&builder, z1_idx);
        field_ct z2_field = field_ct::from_witness_index(&builder, z2_idx);

        // op_code.value() = 8*add + 4*mul + 2*eq + reset, currently in {0, 3, 4, 8}
        // TODO: Refactor opcodes to {0, 1, 2, 3} to reduce to 2-bit range constraint
        ops[i] = fq_ct::create_from_single_limb(op_field, 4);

        // Px from x_lo and x_hi (each 136 bits) - use safe constructor with range constraints
        pxs[i] = fq_ct(x_lo, x_hi);

        // Py from y_lo and y_hi (each 136 bits)
        pys[i] = fq_ct(y_lo, y_hi);

        // z1 and z2 are 128-bit scalar field elements
        // Use create_from_single_limb which range-constrains to 128 bits
        z1s[i] = fq_ct::create_from_single_limb(z1_field, 128);
        z2s[i] = fq_ct::create_from_single_limb(z2_field, 128);
    }

    // Step 4: Compute powers of v
    fq_ct v = batching_challenge_v;
    fq_ct v2 = v.sqr();
    fq_ct v3 = v2 * v;
    fq_ct v4 = v3 * v;

    // Step 5: Compute column sums using vertical batching
    fq_ct op_sum = compute_column_sum(ops, x_powers_base, batch_multipliers, num_rows);
    fq_ct px_sum = compute_column_sum(pxs, x_powers_base, batch_multipliers, num_rows);
    fq_ct py_sum = compute_column_sum(pys, x_powers_base, batch_multipliers, num_rows);
    fq_ct z1_sum = compute_column_sum(z1s, x_powers_base, batch_multipliers, num_rows);
    fq_ct z2_sum = compute_column_sum(z2s, x_powers_base, batch_multipliers, num_rows);

    // Step 6: Combine with batching challenge
    // result = op_sum + v*px_sum + v²*py_sum + v³*z1_sum + v⁴*z2_sum
    fq_ct result = fq_ct::mult_madd({ px_sum, py_sum, z1_sum, z2_sum }, { v, v2, v3, v4 }, { op_sum });

    return result;
}

void BigfieldTranslator::populate_ecc_op_block(Builder& builder, const std::shared_ptr<ECCOpQueue>& op_queue)
{
    BB_BENCH_NAME("BigfieldTranslator::populate_ecc_op_block");

    auto& ultra_ops = op_queue->get_ultra_ops();

    // Populate the ecc_op block with all UltraOps from the op_queue.
    // This mirrors MegaCircuitBuilder::populate_ecc_op_wires but works for standalone translator circuits
    // where we receive the op_queue directly rather than building it incrementally via queue_ecc_* methods.
    for (const auto& ultra_op : ultra_ops) {
        // Create witness variables for each component
        uint32_t x_lo_idx = builder.add_variable(ultra_op.x_lo);
        uint32_t x_hi_idx = builder.add_variable(ultra_op.x_hi);
        uint32_t y_lo_idx = builder.add_variable(ultra_op.y_lo);
        uint32_t y_hi_idx = builder.add_variable(ultra_op.y_hi);
        uint32_t z1_idx = builder.add_variable(ultra_op.z_1);
        uint32_t z2_idx = builder.add_variable(ultra_op.z_2);

        // Get the op code witness index.
        // IMPORTANT: We create a FRESH witness for the first row's op value to ensure deterministic circuit structure.
        // Using shared indices (like builder.get_ecc_op_idx()) causes NNF multiplication deduplication
        // to depend on which rows have the same op code, leading to non-constant VK.
        // However, the second row's first wire (op_val_idx_2) is NOT used in accumulator computation,
        // so we can safely reuse builder.zero_idx() for it (matching MegaCircuitBuilder behavior).
        using FF = typename Builder::FF;
        uint32_t op_val_idx_1 = builder.add_variable(FF(ultra_op.op_code.value()));
        uint32_t op_val_idx_2 = builder.zero_idx(); // second row value always 0, not used in computation

        // If this is a random operation, the op values are randomized
        if (ultra_op.op_code.is_random_op) {
            op_val_idx_1 = builder.add_variable(FF(ultra_op.op_code.random_value_1));
            op_val_idx_2 = builder.add_variable(FF(ultra_op.op_code.random_value_2));
        }

        // Row 2i: (op, x_lo, x_hi, y_lo)
        builder.blocks.ecc_op.populate_wires(op_val_idx_1, x_lo_idx, x_hi_idx, y_lo_idx);
        for (auto& selector : builder.blocks.ecc_op.get_selectors()) {
            selector.emplace_back(0);
        }

        // Row 2i+1: (0, y_hi, z_1, z_2)
        builder.blocks.ecc_op.populate_wires(op_val_idx_2, y_hi_idx, z1_idx, z2_idx);
        for (auto& selector : builder.blocks.ecc_op.get_selectors()) {
            selector.emplace_back(0);
        }
    }
}

BigfieldTranslator::Fq BigfieldTranslator::compute_accumulator_native(const Fq& evaluation_challenge_x,
                                                                      const Fq& batching_challenge_v,
                                                                      const std::shared_ptr<ECCOpQueue>& op_queue)
{
    auto& ultra_ops = op_queue->get_ultra_ops();
    const size_t num_rows = ultra_ops.size();

    if (num_rows == 0) {
        return Fq(0);
    }

    // Compute powers of v
    Fq v = batching_challenge_v;
    Fq v2 = v.sqr();
    Fq v3 = v2 * v;
    Fq v4 = v3 * v;

    // Precompute all powers of x
    std::vector<Fq> x_powers(num_rows);
    x_powers[0] = Fq(1);
    for (size_t i = 1; i < num_rows; i++) {
        x_powers[i] = x_powers[i - 1] * evaluation_challenge_x;
    }

    // Shift for combining lo/hi parts: 2^136
    const uint512_t shift_136 = uint512_t(1) << 136;

    // Compute the accumulator: Σ(op_i + v*Px_i + v²*Py_i + v³*z1_i + v⁴*z2_i) * x^{N-1-i}
    Fq result(0);
    for (size_t i = 0; i < num_rows; i++) {
        const auto& row = ultra_ops[i];

        // Reconstruct values
        uint32_t op_value = row.op_code.value();
        Fq op = Fq(op_value);

        uint512_t px_value = uint512_t(uint256_t(row.x_lo)) + uint512_t(uint256_t(row.x_hi)) * shift_136;
        Fq px = Fq(px_value.lo);

        uint512_t py_value = uint512_t(uint256_t(row.y_lo)) + uint512_t(uint256_t(row.y_hi)) * shift_136;
        Fq py = Fq(py_value.lo);

        Fq z1 = Fq(uint256_t(row.z_1));
        Fq z2 = Fq(uint256_t(row.z_2));

        // Compute row contribution
        Fq row_value = op + v * px + v2 * py + v3 * z1 + v4 * z2;

        // Add weighted by x^{N-1-i}
        result += row_value * x_powers[num_rows - 1 - i];
    }

    return result;
}

} // namespace bb
