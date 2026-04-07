// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke, Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "mega_circuit_builder.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_permutation.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include "barretenberg/relations/poseidon2_single_row.hpp"
#include <unordered_map>
#include <unordered_set>

using namespace bb;
using namespace bb::crypto;

namespace bb {

template <typename FF> void MegaCircuitBuilder_<FF>::finalize_circuit(const bool ensure_nonzero)
{
    if (ensure_nonzero && !this->circuit_finalized) {
        // do the mega part of ensuring all polynomials are nonzero; ultra part will be done inside of
        // Ultra::finalize_circuit
        add_mega_gates_to_ensure_all_polys_are_non_zero();
    }
    // All of the gates involved in finalization are part of the Ultra arithmetization
    UltraCircuitBuilder_<MegaExecutionTraceBlocks>::finalize_circuit(ensure_nonzero);
}

/**
 * @brief Ensure all polynomials have at least one non-zero coefficient to avoid commiting to the zero-polynomial.
 *        This only adds gates for the Goblin polynomials. Most polynomials are handled via the Ultra method,
 *        which should be done by a separate call to the Ultra builder's non zero polynomial gates method.
 *
 * @param in Structure containing variables and witness selectors
 */
template <typename FF> void MegaCircuitBuilder_<FF>::add_mega_gates_to_ensure_all_polys_are_non_zero()
{
    // Add a single default value to all databus columns. Note: This value must be equal across all columns in order for
    // inter-circuit databus commitment checks to pass in IVC settings.

    // Create an arbitrary calldata read gate
    add_public_calldata(this->add_variable(BusVector::DEFAULT_VALUE));    // add one entry in calldata
    auto raw_read_idx = static_cast<uint32_t>(get_calldata().size()) - 1; // read data that was just added
    auto read_idx = this->add_variable(FF(raw_read_idx));
    update_finalize_witnesses({ read_idx, read_calldata(read_idx) });

    // Create an arbitrary secondary_calldata read gate
    add_public_secondary_calldata(this->add_variable(BusVector::DEFAULT_VALUE)); // add one entry in secondary_calldata
    raw_read_idx = static_cast<uint32_t>(get_secondary_calldata().size()) - 1;   // read data that was just added
    read_idx = this->add_variable(FF(raw_read_idx));
    update_finalize_witnesses({ read_idx, read_secondary_calldata(read_idx) });

    // Create an arbitrary return data read gate
    add_public_return_data(this->add_variable(BusVector::DEFAULT_VALUE)); // add one entry in return data
    raw_read_idx = static_cast<uint32_t>(get_return_data().size()) - 1;   // read data that was just added
    read_idx = this->add_variable(FF(raw_read_idx));
    update_finalize_witnesses({ read_idx, read_return_data(read_idx) });

    if (op_queue->get_current_subtable_size() == 0) {
        // Add a mul dummy op in the subtable to avoid column polynomial being zero (it has to be a mul rather than an
        // add to ensure all 4 column polynomials contain some data)
        this->queue_ecc_mul_accum(bb::g1::affine_element::one(), 2, /*in_finalize=*/true);
        this->queue_ecc_eq(/*in_finalize=*/true);
    }

    // Ensure the poseidon2_op block is non-empty (same pattern as ecc_op above).
    // If no poseidon2 hashes were deferred, add a dummy permutation so the block and op queue
    // columns are non-trivial and polynomial commitments are non-zero.
    if (poseidon2_op_queue && this->blocks.poseidon2_op.size() == 0) {
        uint32_t zero = this->zero_idx();
        this->queue_poseidon2_permutation({ zero, zero, zero, zero });
    }
}

/**
 * @brief Ensure all polynomials have at least one non-zero coefficient to avoid commiting to the zero-polynomial.
 *        This only adds gates for the Goblin polynomials. Most polynomials are handled via the Ultra method,
 *        which should be done by a separate call to the Ultra builder's non zero polynomial gates method.
 *
 * @param in Structure containing variables and witness selectors
 */
template <typename FF> void MegaCircuitBuilder_<FF>::add_ultra_and_mega_gates_to_ensure_all_polys_are_non_zero()
{
    // Most polynomials are handled via the conventional Ultra method
    UltraCircuitBuilder_<MegaExecutionTraceBlocks>::add_gates_to_ensure_all_polys_are_non_zero();
    add_mega_gates_to_ensure_all_polys_are_non_zero();
}

/**
 * @brief Add simple point addition operation to the op queue and add corresponding gates
 *
 * @param point Point to be added into the accumulator
 */
template <typename FF> ecc_op_tuple MegaCircuitBuilder_<FF>::queue_ecc_add_accum(const bb::g1::affine_element& point)
{
    // Add the operation to the op queue
    auto ultra_op = op_queue->add_accumulate(point);

    // Add corresponding gates for the operation
    ecc_op_tuple op_tuple = populate_ecc_op_wires(ultra_op);
    return op_tuple;
}

/**
 * @brief Add point mul-then-accumulate operation to the op queue and add corresponding gates
 *
 * @tparam FF
 * @param point
 * @param scalar The scalar by which point is multiplied prior to being accumulated
 * @param in_finalize It's used in boomerang catcher to mark
 * that all variables from some connected component were created after finalize method was called
 * @return ecc_op_tuple encoding the point and scalar inputs to the mul accum
 */
template <typename FF>
ecc_op_tuple MegaCircuitBuilder_<FF>::queue_ecc_mul_accum(const bb::g1::affine_element& point,
                                                          const FF& scalar,
                                                          bool in_finalize)
{
    // Add the operation to the op queue
    auto ultra_op = op_queue->mul_accumulate(point, scalar);

    // Add corresponding gates for the operation
    ecc_op_tuple op_tuple = populate_ecc_op_wires(ultra_op, in_finalize);
    return op_tuple;
}

/**
 * @brief Add point equality operation to the op queue based on the value of the internal accumulator and add
 * corresponding gates
 * @param in_finalize It's used in boomerang catcher to mark
 * that all variables from some connected component were created after finalize method was called
 * @return ecc_op_tuple encoding the point to which equality has been asserted
 */
template <typename FF> ecc_op_tuple MegaCircuitBuilder_<FF>::queue_ecc_eq(bool in_finalize)
{
    // Add the operation to the op queue
    auto ultra_op = op_queue->eq_and_reset();

    // Add corresponding gates for the operation
    ecc_op_tuple op_tuple = populate_ecc_op_wires(ultra_op, in_finalize);
    op_tuple.return_is_infinity = ultra_op.return_is_infinity;
    return op_tuple;
}

/**
 * @brief Logic for a no-op operation.
 *
 * @return ecc_op_tuple with all its fields set to zero
 */
template <typename FF> ecc_op_tuple MegaCircuitBuilder_<FF>::queue_ecc_no_op()
{
    // Add the operation to the op queue
    auto ultra_op = op_queue->no_op_ultra_only();

    // Add corresponding gates for the operation
    ecc_op_tuple op_tuple = populate_ecc_op_wires(ultra_op);
    return op_tuple;
}

/**
 * @brief Add goblin ecc op gates for a single operation
 *
 * @details Given an `UltraOp`, corresponding to a point (x,y) on the curve and a scalar z, write this data in an
 * Ultra-legible way to the trace. This information will eventually be captured in certain derived witnesses, and we
 * delegate computation of the logged elliptic curve operations to the ECCVM.
 * @param ultra_op Operation data expressed in the ultra format
 * @param in_finalize Used in boomerang catcher to mark
 * that all variables from some connected component were created after finalize method was called
 * @note All selectors are set to 0 since the ecc op selector is derived later based on the block size/location.
 * @note No on-curve checks, this is done in ECCVM.
 */
template <typename FF>
ecc_op_tuple MegaCircuitBuilder_<FF>::populate_ecc_op_wires(const UltraOp& ultra_op, bool in_finalize)
{
    ecc_op_tuple op_tuple;
    op_tuple.op = get_ecc_op_idx(ultra_op.op_code);
    op_tuple.x_lo = this->add_variable(ultra_op.x_lo);
    op_tuple.x_hi = this->add_variable(ultra_op.x_hi);
    op_tuple.y_lo = this->add_variable(ultra_op.y_lo);
    op_tuple.y_hi = this->add_variable(ultra_op.y_hi);
    op_tuple.z_1 = this->add_variable(ultra_op.z_1);
    op_tuple.z_2 = this->add_variable(ultra_op.z_2);

    // Set the indices for the op values for each of the two rows
    uint32_t op_val_idx_1 = op_tuple.op;      // genuine op code value
    uint32_t op_val_idx_2 = this->zero_idx(); // second row value always set to 0
    // If this is a random operation, the op values are randomized
    if (ultra_op.op_code.is_random_op) {
        op_val_idx_1 = this->add_variable(ultra_op.op_code.random_value_1);
        op_val_idx_2 = this->add_variable(ultra_op.op_code.random_value_2);
    }
    // Populate the ecc_op block with TWO rows (matching Ultra format)
    // Row 1: OP   | x_lo | x_hi | y_lo
    // Row 2: 0    | y_hi | z_1  | z_2
    this->blocks.ecc_op.populate_wires(op_val_idx_1, op_tuple.x_lo, op_tuple.x_hi, op_tuple.y_lo);
    for (auto& selector : this->blocks.ecc_op.get_selectors()) {
        selector.emplace_back(0);
    }
    this->blocks.ecc_op.populate_wires(op_val_idx_2, op_tuple.y_hi, op_tuple.z_1, op_tuple.z_2);
    for (auto& selector : this->blocks.ecc_op.get_selectors()) {
        selector.emplace_back(0);
    }

    if (in_finalize) {
        update_used_witnesses(
            { op_tuple.op, op_tuple.x_lo, op_tuple.x_hi, op_tuple.y_lo, op_tuple.y_hi, op_tuple.z_1, op_tuple.z_2 });
        update_finalize_witnesses(
            { op_tuple.op, op_tuple.x_lo, op_tuple.x_hi, op_tuple.y_lo, op_tuple.y_hi, op_tuple.z_1, op_tuple.z_2 });
    }

    return op_tuple;
};

/**
 * @brief Mechanism for populating two rows with randomness.  This "operation" doesn't return a tuple representing the
 * indices of the ecc op values because it should never be used in subsequent logic.
 *
 * @note All selectors are set to 0 since the ecc op selector is derived later based on the block size/location. The
 * method does not return a tuple of variable indices as those should not be used in subsequent steps for random ops.
 */
template <typename FF> void MegaCircuitBuilder_<FF>::queue_ecc_random_op()
{
    // Add the operation to the op queue
    auto ultra_op = op_queue->random_op_ultra_only();

    // Add corresponding gates for the operation
    (void)populate_ecc_op_wires(ultra_op);
}

/**
 * @brief Add a hiding op with random (possibly non-curve) Px, Py values to the op queue and circuit.
 *
 * @details This op provides statistical hiding (~508 bits) for the accumulated_result in Translator/ECCVM.
 * The Px, Py values are random field elements that may not be on the curve. The op uses opcode 3 (eq+reset)
 * for Translator compatibility. In ECCVM, this op is prepended to land at row 1 (lagrange_second == 1),
 * since row 0 is identically zero (for shifts).
 *
 * @param Px Random field element for x-coordinate
 * @param Py Random field element for y-coordinate
 */
template <typename FF>
void MegaCircuitBuilder_<FF>::queue_ecc_hiding_op(const curve::BN254::BaseField& Px, const curve::BN254::BaseField& Py)
{
    // Add the operation to the op queue (returns the UltraOp for gate creation)
    auto ultra_op = op_queue->append_hiding_op(Px, Py);

    // Add corresponding gates for the operation
    populate_ecc_op_wires(ultra_op);
}

template <typename FF> void MegaCircuitBuilder_<FF>::set_goblin_ecc_op_code_constant_variables()
{
    null_op_idx = this->zero_idx(); // constant 0 is is associated with the zero index
    add_accum_op_idx = this->put_constant_variable(FF(EccOpCode{ .add = true }.value()));
    mul_accum_op_idx = this->put_constant_variable(FF(EccOpCode{ .mul = true }.value()));
    equality_op_idx = this->put_constant_variable(FF(EccOpCode{ .eq = true, .reset = true }.value()));
}

/**
 * @brief Read from a databus column
 * @details Creates a databus lookup gate based on the input index and read result
 *
 * @tparam FF
 * @param read_idx_witness_idx Variable index of the read index
 * @return uint32_t Variable index of the result of the read
 */
template <typename FF>
uint32_t MegaCircuitBuilder_<FF>::read_bus_vector(BusId bus_idx, const uint32_t& read_idx_witness_idx)
{
    auto& bus_vector = databus[static_cast<size_t>(bus_idx)];
    // Get the raw index into the databus column
    const uint32_t read_idx = static_cast<uint32_t>(uint256_t(this->get_variable(read_idx_witness_idx)));

    BB_ASSERT_LT(read_idx, bus_vector.size()); // Ensure that the read index is valid

    // Create a variable corresponding to the result of the read. Note that we do not in general connect reads from
    // databus via copy constraints (i.e. we create a unique variable for the result of each read)
    FF value = this->get_variable(bus_vector[read_idx]);
    uint32_t value_witness_idx = this->add_variable(value);

    create_databus_read_gate({ read_idx_witness_idx, value_witness_idx }, bus_idx);
    bus_vector.increment_read_count(read_idx);

    return value_witness_idx;
}

/**
 * @brief Create a databus lookup/read gate
 *
 * @tparam FF
 * @param databus_lookup_gate_ witness indices corresponding to: read index, result value
 */
template <typename FF>
void MegaCircuitBuilder_<FF>::create_databus_read_gate(const databus_lookup_gate_<FF>& in, const BusId bus_idx)
{
    auto& block = this->blocks.busread;
    block.populate_wires(in.value, in.index, this->zero_idx(), this->zero_idx());
    apply_databus_selectors(bus_idx);

    this->check_selector_length_consistency();
    this->increment_num_gates();
}

template <typename FF> void MegaCircuitBuilder_<FF>::apply_databus_selectors(const BusId bus_idx)
{
    auto& block = this->blocks.busread;
    switch (bus_idx) {
    case BusId::CALLDATA: {
        block.q_1().emplace_back(1);
        block.q_2().emplace_back(0);
        block.q_3().emplace_back(0);
        break;
    }
    case BusId::SECONDARY_CALLDATA: {
        block.q_1().emplace_back(0);
        block.q_2().emplace_back(1);
        block.q_3().emplace_back(0);
        break;
    }
    case BusId::RETURNDATA: {
        block.q_1().emplace_back(0);
        block.q_2().emplace_back(0);
        block.q_3().emplace_back(1);
        break;
    }
    }
    block.q_4().emplace_back(0);
    block.q_m().emplace_back(0);
    block.q_c().emplace_back(0);
    block.set_gate_selector(1);
}

/**
 * @brief Create a single-row Poseidon2 gate.
 * @details Computes the full Poseidon2 permutation natively, records the 88 witness column
 * values, and reserves a row in the arithmetic block (with all selectors = 0). The extra
 * columns are populated later by TraceToPolynomials for flavors that support them.
 *
 * Column layout (88 total, all columns store x^5 S-box output BEFORE matrix multiply):
 *   [0..3]:   x^5 outputs for external round 0    [72..75]: x^5 outputs for external round 60
 *   [4..7]:   x^5 outputs for external round 1    [76..79]: x^5 outputs for external round 61
 *   [8..11]:  x^5 outputs for external round 2    [80..83]: x^5 outputs for external round 62
 *   [12..15]: x^5 outputs for external round 3    [84..87]: x^5 outputs for external round 63
 *   [16..71]: x^5 output (element 0) for internal rounds 4-59
 */
template <typename FF>
void MegaCircuitBuilder_<FF>::create_poseidon2_single_row_gate(const std::array<FF, 4>& input)
{
    using Params = crypto::Poseidon2Bn254ScalarFieldParams;
    using Perm = crypto::Poseidon2Permutation<Params>;

    Poseidon2SingleRowGateData gate_data{};

    std::array<FF, 4> state = input;

    // Initial M_E (no columns — computed algebraically in the relation)
    Perm::matrix_multiplication_external(state);

    // First 4 external rounds (columns 0..15: x^5 S-box outputs before M_E)
    for (size_t r = 0; r < 4; r++) {
        for (size_t j = 0; j < 4; j++) {
            auto s = state[j] + Params::round_constants[r][j];
            auto x2 = s.sqr();
            x2.self_sqr();
            state[j] = x2 * s;
            gate_data.state[r * 4 + j] = state[j]; // store x^5 before M_E
        }
        Perm::matrix_multiplication_external(state);
    }

    // 56 internal rounds (columns 16..71: x^5 S-box output for element 0 before M_I)
    for (size_t r = 4; r < 60; r++) {
        auto s0 = state[0] + Params::round_constants[r][0];
        auto x2 = s0.sqr();
        x2.self_sqr();
        state[0] = x2 * s0;
        gate_data.state[r - 4 + 16] = state[0]; // store x^5 before M_I
        Perm::matrix_multiplication_internal(state);
    }

    // Last 4 external rounds (columns 72..87: x^5 S-box outputs before M_E)
    for (size_t r = 60; r < 64; r++) {
        for (size_t j = 0; j < 4; j++) {
            auto s = state[j] + Params::round_constants[r][j];
            auto x2 = s.sqr();
            x2.self_sqr();
            state[j] = x2 * s;
            gate_data.state[(r - 60) * 4 + 72 + j] = state[j]; // store x^5 before M_E
        }
        Perm::matrix_multiplication_external(state);
    }

    // Record which row in the arithmetic block this gate occupies
    gate_data.block_row_index = this->blocks.arithmetic.size();
    poseidon2_single_row_gates.push_back(std::move(gate_data));

    // Add the input values as variables and wire them into w_l, w_r, w_o, w_4
    uint32_t a_idx = this->add_variable(input[0]);
    uint32_t b_idx = this->add_variable(input[1]);
    uint32_t c_idx = this->add_variable(input[2]);
    uint32_t d_idx = this->add_variable(input[3]);

    // Reserve a trace row in the arithmetic block (all arithmetic selectors = 0)
    auto& block = this->blocks.arithmetic;
    block.populate_wires(a_idx, b_idx, c_idx, d_idx);
    block.q_m().emplace_back(0);
    block.q_1().emplace_back(0);
    block.q_2().emplace_back(0);
    block.q_3().emplace_back(0);
    block.q_c().emplace_back(0);
    block.q_4().emplace_back(0);
    block.set_gate_selector(0); // q_arith = 0
    this->check_selector_length_consistency();
    this->increment_num_gates();
}

/**
 * @brief Queue a deferred Poseidon2 permutation for MegaV2Flavor IVC.
 * @details Records 5 values across 2 rows in the poseidon2_op block:
 *   Row 0: state[0], state[1], state[2], state[3]  (sponge state before permutation)
 *   Row 1: output,   1 (read_tag),  0,   0
 * The permutation is computed natively via the Poseidon2OpQueue; the output is returned
 * as circuit variables for use in subsequent circuit logic.
 *
 * @param input_witness_indices The 4 witness indices for the sponge state inputs
 * @return Array of 4 circuit variable indices for the permutation output state
 */
template <typename FF>
std::array<uint32_t, 4> MegaCircuitBuilder_<FF>::queue_poseidon2_permutation(
    const std::array<uint32_t, 4>& input_witness_indices)
{
    BB_ASSERT(poseidon2_op_queue != nullptr,
              "Poseidon2OpQueue must be initialized to use queue_poseidon2_permutation");

    using Perm_ = crypto::Poseidon2Permutation<crypto::Poseidon2Bn254ScalarFieldParams>;

    // Get native values from the existing witnesses
    std::array<FF, 4> sponge_state;
    for (size_t i = 0; i < 4; ++i) {
        sponge_state[i] = this->get_variable(input_witness_indices[i]);
    }

    // Compute permutation natively and record in the op queue
    auto output = poseidon2_op_queue->add_hash_op(sponge_state);
    auto output_state = Perm_::permutation(sponge_state);

    // Row 0: use the caller's witness indices for inputs
    auto& block = this->blocks.poseidon2_op;
    block.populate_wires(input_witness_indices[0], input_witness_indices[1], input_witness_indices[2],
                         input_witness_indices[3]);
    for (auto& selector : block.get_selectors()) {
        selector.emplace_back(0);
    }
    this->check_selector_length_consistency();
    this->increment_num_gates();

    // Row 1: w_l = output, w_r = 1 (serves as read_tag via w_r_shift at row 0)
    uint32_t out_idx = this->add_variable(output);
    uint32_t one_idx = this->add_variable(FF(1));
    block.populate_wires(out_idx, one_idx, this->zero_idx(), this->zero_idx());
    for (auto& selector : block.get_selectors()) {
        selector.emplace_back(0);
    }
    this->check_selector_length_consistency();
    this->increment_num_gates();

    // Return output state as circuit variable indices
    std::array<uint32_t, 4> output_indices;
    output_indices[0] = out_idx;
    output_indices[1] = this->add_variable(output_state[1]);
    output_indices[2] = this->add_variable(output_state[2]);
    output_indices[3] = this->add_variable(output_state[3]);

    return output_indices;
}

template class MegaCircuitBuilder_<bb::fr>;
} // namespace bb
