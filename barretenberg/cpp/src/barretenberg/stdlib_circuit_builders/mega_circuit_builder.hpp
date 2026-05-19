// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke, Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include <memory>
#include <string>
#include <utility>

#include "barretenberg/honk/execution_trace/mega_execution_trace.hpp"
#include "barretenberg/op_queue/ecc_op_queue_fwd.hpp"
#include "databus.hpp"
#include "ultra_circuit_builder.hpp"

namespace bb {

struct EccOpCode;
struct UltraOp;

template <typename FF> class MegaCircuitBuilder_ : public UltraCircuitBuilder_<MegaExecutionTraceBlocks> {
  private:
    DataBus databus; // Container for public calldata/returndata

  public:
    using ExecutionTrace = MegaExecutionTraceBlocks;

    static constexpr size_t DEFAULT_NON_NATIVE_FIELD_LIMB_BITS =
        UltraCircuitBuilder_<MegaExecutionTraceBlocks>::DEFAULT_NON_NATIVE_FIELD_LIMB_BITS;

    // Stores record of ecc operations and performs corresponding native operations internally
    std::shared_ptr<ECCOpQueue> op_queue;

    // Indices for constant variables corresponding to ECCOpQueue op codes
    uint32_t null_op_idx;
    uint32_t add_accum_op_idx;
    uint32_t mul_accum_op_idx;
    uint32_t equality_op_idx;

    // Functions for adding ECC op queue "gates"
    ecc_op_tuple queue_ecc_add_accum(const g1::affine_element& point);
    ecc_op_tuple queue_ecc_mul_accum(const g1::affine_element& point, const FF& scalar, bool in_finalize = false);
    ecc_op_tuple queue_ecc_eq(bool in_finalize = true);
    ecc_op_tuple queue_ecc_no_op();
    void queue_ecc_random_op();
    void queue_ecc_hiding_op(const curve::BN254::BaseField& Px, const curve::BN254::BaseField& Py);

  private:
    ecc_op_tuple populate_ecc_op_wires(const UltraOp& ultra_op, bool in_finalize = false);
    void set_goblin_ecc_op_code_constant_variables();
    void create_databus_read_gate(const databus_lookup_gate_<FF>& in, BusId bus_idx);
    void apply_databus_selectors(BusId bus_idx);

  public:
    explicit MegaCircuitBuilder_(bool is_write_vk_mode = false);
    MegaCircuitBuilder_(std::shared_ptr<ECCOpQueue> op_queue_in, bool is_write_vk_mode = false);

    /**
     * @brief Constructor from data generated from ACIR
     *
     * @param op_queue_in Op queue to which goblinized group ops will be added
     * @param witness_values witnesses values known to acir
     * @param public_inputs indices of public inputs in witness array
     * @param is_write_vk_mode true if the builder is used to generate the vk of a circuit
     *
     * @note witness_values is the vector of witness values known at the time of acir generation. It is filled with
     * witness values which are interleaved with zeros when witnesses are optimized away.
     *
     * @note The length of the witness vector is in general less than total number of variables/witnesses that might be
     * present for a circuit generated from acir, since many gates will depend on the details of the bberg
     * implementation (or more generally on the backend used to process acir).
     *
     */
    MegaCircuitBuilder_(std::shared_ptr<ECCOpQueue> op_queue_in,
                        const std::vector<FF>& witness_values,
                        const std::vector<uint32_t>& public_inputs,
                        const bool is_write_vk_mode);

    /**
     * @brief Convert op code to the witness index for the corresponding op index in the builder
     *
     * @param op_code
     * @return uint32_t
     */
    uint32_t get_ecc_op_idx(const EccOpCode& op_code);

    void finalize_circuit();

    void create_poseidon2_initial_external_gate(const poseidon2_initial_external_gate_<FF>& in);
    void create_poseidon2_quad_internal_gate(const poseidon2_quad_internal_gate_<FF>& in);
    void create_poseidon2_transition_entry_gate(const poseidon2_transition_entry_gate_<FF>& in);

    size_t get_num_constant_gates() const override { return 0; }

    /**
     * @brief Add a witness variable to the specified calldata bus.
     *
     */
    void add_public_calldata(BusId bus_idx, const uint32_t& in) { return append_to_bus_vector(bus_idx, in); }

    /**
     * @brief Add a witness variable to the public return_data.
     *
     */
    void add_public_return_data(const uint32_t& in) { return append_to_bus_vector(BusId::RETURNDATA, in); }

    uint32_t read_bus_vector(BusId bus_idx, const uint32_t& read_idx_witness_idx);

    /**
     * @brief Read from the specified calldata bus and create a corresponding databus read gate
     *
     */
    uint32_t read_calldata(BusId bus_idx, const uint32_t& read_idx_witness_idx)
    {
        return read_bus_vector(bus_idx, read_idx_witness_idx);
    };

    /**
     * @brief Read from return_data and create a corresponding databus read gate
     *
     * @param read_idx_witness_idx Witness index for the return_data read index
     * @return uint32_t Witness index for the result of the read
     */
    uint32_t read_return_data(const uint32_t& read_idx_witness_idx)
    {
        return read_bus_vector(BusId::RETURNDATA, read_idx_witness_idx);
    };

    void append_to_bus_vector(const BusId bus_idx, const uint32_t& witness_idx)
    {
        databus[static_cast<size_t>(bus_idx)].append(witness_idx);
    }

    const BusVector& get_calldata(BusId idx) const { return databus[static_cast<size_t>(idx)]; }
    const BusVector& get_return_data() const { return databus[static_cast<size_t>(BusId::RETURNDATA)]; }
    // Indexed access to the databus columns; enables NUM_BUS_COLUMNS-driven iteration over bus vectors.
    const BusVector& get_bus_vector(size_t bus_idx) const { return databus[bus_idx]; }

    /**
     * @brief Compute a hash of the circuit
     * @details Hashes all wires and selectors from each block. Note that this encompases all gate data, copy
     * constraints, and public inputs (via pub inputs block). Useful for debugging purposes to identify where two
     * circuits diverge.
     */
    std::string hash() const;
};
using MegaCircuitBuilder = MegaCircuitBuilder_<bb::fr>;
} // namespace bb
