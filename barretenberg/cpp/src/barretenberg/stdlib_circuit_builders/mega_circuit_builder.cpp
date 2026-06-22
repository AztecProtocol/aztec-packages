// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke, Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "mega_circuit_builder.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2_params.hpp"
#include "barretenberg/flavor/mega_flavor.hpp"
#include <array>
#include <tuple>
#include <unordered_map>
#include <unordered_set>

using namespace bb;
using namespace bb::crypto;

namespace bb {

template <typename FF> void MegaCircuitBuilder_<FF>::finalize_circuit()
{
    UltraCircuitBuilder_<MegaExecutionTraceBlocks>::finalize_circuit();
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
 * @brief Add a no-op to the op queue and populate two zero rows in the ecc_op block.
 * @details Used by the tail kernel to give the Translator's op queue wires two leading zero rows (shiftability).
 * The no-op does not generate any ECCVM operation.
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

    // BOOMERANG_DUPLICATE_PROVENANCE: See
    // barretenberg/cpp/src/barretenberg/boomerang_value_detection/WITNESS_DUPLICATE_DETECTION.md. Tag each point limb
    // with an ECC_OP_TABLE provenance key keyed on the opcode, the serialization slot in the ecc_op block, and the limb
    // slot. The limb slot is essential: x_lo, x_hi, y_lo, and y_hi are not forced equal to each other.
    const uint64_t slot = ecc_op_slot_count++;
    if (!ultra_op.op_code.is_random_op) {
        const uint64_t opcode_value = static_cast<uint64_t>(ultra_op.op_code.value());
        enum class EccOpPointLimb : uint64_t { X_LO = 0, X_HI = 1, Y_LO = 2, Y_HI = 3 };
        const auto group_key = [&](EccOpPointLimb limb_slot) {
            return CircuitBuilderBase<FF>::make_duplicate_provenance(
                DuplicateProvenanceCategory::ECC_OP_TABLE,
                duplicate_provenance_local_id({ opcode_value, slot, static_cast<uint64_t>(limb_slot) }));
        };
        this->tag_duplicate_provenance(op_tuple.x_lo, group_key(EccOpPointLimb::X_LO));
        this->tag_duplicate_provenance(op_tuple.x_hi, group_key(EccOpPointLimb::X_HI));
        this->tag_duplicate_provenance(op_tuple.y_lo, group_key(EccOpPointLimb::Y_LO));
        this->tag_duplicate_provenance(op_tuple.y_hi, group_key(EccOpPointLimb::Y_HI));
    }

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

template <typename FF> void MegaCircuitBuilder_<FF>::create_databus_init_read_gate(BusId bus_idx, size_t slot_idx)
{
    auto& bus_vector = databus[static_cast<size_t>(bus_idx)];
    BB_ASSERT_LT(slot_idx, bus_vector.size());

    const uint32_t value_witness_idx = bus_vector[slot_idx];
    const uint32_t index_witness_idx = this->put_constant_variable(FF(static_cast<uint64_t>(slot_idx)));

    create_databus_read_gate({ index_witness_idx, value_witness_idx }, bus_idx);
    bus_vector.increment_read_count(slot_idx);
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
    const size_t idx = static_cast<size_t>(bus_idx);
    // Bus column k (0 <= k < NUM_BUS_COLUMNS) is selected by one of these selectors.
    // The order here must match BusData<bus_idx>::selector in databus_lookup_relation.hpp.
    auto databus_selectors = std::array{ &block.q_1(), &block.q_2(), &block.q_3(), &block.q_4(), &block.q_m() };
    static_assert(std::tuple_size_v<decltype(databus_selectors)> == NUM_BUS_COLUMNS,
                  "apply_databus_selectors mapping must match NUM_BUS_COLUMNS and "
                  "BusData<bus_idx>::selector in databus_lookup_relation.hpp");
    BB_ASSERT_LT(idx, databus_selectors.size());
    for (size_t selector_idx = 0; selector_idx < NUM_BUS_COLUMNS; ++selector_idx) {
        databus_selectors[selector_idx]->emplace_back(selector_idx == idx ? 1 : 0);
    }
    block.q_5().emplace_back(0);
    block.q_c().emplace_back(0);
    block.set_gate_selector(1);
}

/**
 * @brief Poseidon2 external-round gate. Mega routes it into the shared `poseidon2` block (Ultra instead uses a
 * dedicated external block) so every permutation's rows are contiguous and the external/terminal round relations
 * bind across the external<->internal boundary via `w_shift`.
 */
template <typename FF>
void MegaCircuitBuilder_<FF>::create_poseidon2_external_gate(const poseidon2_external_gate_<FF>& in)
{
    auto& block = this->blocks.poseidon2;
    block.populate_wires(in.a, in.b, in.c, in.d);
    block.q_m().emplace_back(0);
    block.q_1().emplace_back(crypto::Poseidon2Bn254ScalarFieldParams::round_constants[in.round_idx][0]);
    block.q_2().emplace_back(crypto::Poseidon2Bn254ScalarFieldParams::round_constants[in.round_idx][1]);
    block.q_3().emplace_back(crypto::Poseidon2Bn254ScalarFieldParams::round_constants[in.round_idx][2]);
    block.q_c().emplace_back(0);
    block.q_4().emplace_back(crypto::Poseidon2Bn254ScalarFieldParams::round_constants[in.round_idx][3]);
    block.q_5().emplace_back(0);
    block.set_gate_selector(GateKind::Poseidon2Ext, 1);
    this->check_selector_length_consistency();
    this->increment_num_gates();
}

/**
 * @brief Poseidon2 initial linear layer gate, activates the q_poseidon2_external_initial selector and relation.
 * @details Constrains the whole initial linear layer with a bespoke row.
 */
template <typename FF>
void MegaCircuitBuilder_<FF>::create_poseidon2_initial_external_gate(const poseidon2_initial_external_gate_<FF>& in)
{
    auto& block = this->blocks.poseidon2;
    block.populate_wires(in.a, in.b, in.c, in.d);
    block.q_m().emplace_back(0);
    block.q_1().emplace_back(0);
    block.q_2().emplace_back(0);
    block.q_3().emplace_back(0);
    block.q_c().emplace_back(0);
    block.q_4().emplace_back(0);
    block.q_5().emplace_back(0);
    block.set_gate_selector(GateKind::Poseidon2ExtInitial, 1);
    this->check_selector_length_consistency();
    this->increment_num_gates();
}

/**
 * @brief Poseidon2 K=4 compressed internal-round gate: processes FOUR consecutive internal rounds per row.
 * @details
 *   Wires:     a, b, c, d = state[0] at rounds 4i+0, 4i+1, 4i+2, 4i+3
 *   Selectors: q_1, q_2, q_3, q_4 = c_{4i}, c_{4i+1}, c_{4i+2}, c_{4i+3}   (this quad's 4 constants)
 *              q_m, q_c, q_5      = c_{4(i+1)}, c_{4(i+1)+1}, c_{4(i+1)+2} (next quad's first 3, for
 *                                                                           the shifted Vandermonde check)
 *   Terminal rows use q_poseidon2_quad_internal_terminal and set q_m, q_c, q_5 = 0 (no next quad).
 */
template <typename FF>
void MegaCircuitBuilder_<FF>::create_poseidon2_quad_internal_gate(const poseidon2_quad_internal_gate_<FF>& in)
{
    auto& block = this->blocks.poseidon2;
    block.populate_wires(in.a, in.b, in.c, in.d);
    const auto& rc = crypto::Poseidon2Bn254ScalarFieldParams::round_constants;
    block.q_1().emplace_back(rc[in.round_idx_start + 0][0]);
    block.q_2().emplace_back(rc[in.round_idx_start + 1][0]);
    block.q_3().emplace_back(rc[in.round_idx_start + 2][0]);
    block.q_4().emplace_back(rc[in.round_idx_start + 3][0]);
    if (in.is_terminal) {
        block.q_m().emplace_back(0);
        block.q_c().emplace_back(0);
        block.q_5().emplace_back(0);
        block.set_gate_selector(GateKind::Poseidon2QuadIntTerminal, 1);
    } else {
        block.q_m().emplace_back(rc[in.next_pair_start + 0][0]);
        block.q_c().emplace_back(rc[in.next_pair_start + 1][0]);
        block.q_5().emplace_back(rc[in.next_pair_start + 2][0]);
        block.set_gate_selector(GateKind::Poseidon2QuadInt, 1);
    }
    this->check_selector_length_consistency();
    this->increment_num_gates();
}

/**
 * @brief Poseidon2 transition-entry gate: standard → K=4 compressed encoding boundary.
 * @details Placed immediately before the first compressed row.
 *   Wires:     a, b, c, d = (s_0, s_1, s_2, s_3) at round `round_idx_start` (standard encoding)
 *   Selectors: q_1, q_2, q_3 = c_{start}, c_{start+1}, c_{start+2}
 *              q_4, q_m, q_c, q_5 = 0 (unused)
 *
 * Enforces the successor's (w_r_shift, w_o_shift, w_4_shift) equal state[0] at rounds
 * `start+1, start+2, start+3` respectively, via 3 degree-7 subrelations.
 */
template <typename FF>
void MegaCircuitBuilder_<FF>::create_poseidon2_transition_entry_gate(const poseidon2_transition_entry_gate_<FF>& in)
{
    auto& block = this->blocks.poseidon2;
    block.populate_wires(in.a, in.b, in.c, in.d);
    const auto& rc = crypto::Poseidon2Bn254ScalarFieldParams::round_constants;
    block.q_m().emplace_back(0);
    block.q_1().emplace_back(rc[in.round_idx_start + 0][0]);
    block.q_2().emplace_back(rc[in.round_idx_start + 1][0]);
    block.q_3().emplace_back(rc[in.round_idx_start + 2][0]);
    block.q_4().emplace_back(0);
    block.q_5().emplace_back(0);
    block.q_c().emplace_back(0);
    block.set_gate_selector(GateKind::Poseidon2TransitionEntry, 1);
    this->check_selector_length_consistency();
    this->increment_num_gates();
}

template class MegaCircuitBuilder_<bb::fr>;
} // namespace bb
