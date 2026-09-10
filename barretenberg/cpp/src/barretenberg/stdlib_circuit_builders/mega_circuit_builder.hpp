// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke, Raju], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include <sstream>
#include <utility>

#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/honk/execution_trace/generated/mega_app_execution_trace_generated.hpp"
#include "barretenberg/honk/execution_trace/generated/mega_avm_execution_trace_generated.hpp"
#include "barretenberg/honk/execution_trace/generated/mega_execution_trace_generated.hpp"
#include "barretenberg/honk/execution_trace/generated/mega_kernel_execution_trace_generated.hpp"
#include "barretenberg/honk/execution_trace/generated/mega_zk_execution_trace_generated.hpp"
#include "barretenberg/op_queue/ecc_op_queue.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "databus.hpp"
#include "ultra_circuit_builder.hpp"

namespace bb {

/**
 * @brief Circuit builder for the Mega arithmetization.
 *
 * @tparam ExecutionTrace_ The arithmetization this circuit is built for: which blocks exist, which gate kinds
 * they own, and which databus columns are present. A reduced arithmetization (kernel, app, hiding kernel)
 * omits what its flavor does not constrain, so the builder type and the flavor correspond one to one -- see
 * `Flavor::CircuitBuilder`, which `ProverInstance_<Flavor>` takes as its circuit type. A gate the flavor
 * cannot constrain has no block to be appended to, and creating one is a compile error.
 */
template <typename FF, typename ExecutionTrace_>
class MegaCircuitBuilder_ : public UltraCircuitBuilder_<ExecutionTrace_> {
  private:
    DataBus databus; // Container for public calldata/returndata

  public:
    using ExecutionTrace = ExecutionTrace_;
    using Base = UltraCircuitBuilder_<ExecutionTrace>;
    using GateRowT = typename Base::GateRowT;

    static constexpr size_t DEFAULT_NON_NATIVE_FIELD_LIMB_BITS = Base::DEFAULT_NON_NATIVE_FIELD_LIMB_BITS;

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
    void create_databus_read_gate(const databus_lookup_gate_<FF>& in, BusId bus_idx)
        requires(ExecutionTrace::has_gate_kind(GateKind::BusRead));

  public:
    MegaCircuitBuilder_(std::shared_ptr<ECCOpQueue> op_queue_in = std::make_shared<ECCOpQueue>(),
                        bool is_write_vk_mode = false)
        : Base(is_write_vk_mode)
        , op_queue(std::move(op_queue_in))
    {
        BB_BENCH();
        // Instantiate the subtable to be populated with goblin ecc ops from this circuit. The merge settings indicate
        // whether the subtable should be prepended or appended to the existing subtables from prior circuits.
        op_queue->initialize_new_subtable();

        // Set indices to constants corresponding to Goblin ECC op codes
        set_goblin_ecc_op_code_constant_variables();
    };

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
                        const bool is_write_vk_mode)
        : Base(witness_values, public_inputs, is_write_vk_mode)
        , op_queue(std::move(op_queue_in))
    {
        // Instantiate the subtable to be populated with goblin ecc ops from this circuit. The merge settings indicate
        // whether the subtable should be prepended or appended to the existing subtables from prior circuits.
        op_queue->initialize_new_subtable();

        // Set indices to constants corresponding to Goblin ECC op codes
        set_goblin_ecc_op_code_constant_variables();
    };

    /**
     * @brief Convert op code to the witness index for the corresponding op index in the builder
     *
     * @param op_code
     * @return uint32_t
     */
    uint32_t get_ecc_op_idx(const EccOpCode& op_code)
    {
        if (op_code.add) {
            return add_accum_op_idx;
        }
        if (op_code.mul) {
            return mul_accum_op_idx;
        }
        if (op_code.eq && op_code.reset) {
            return equality_op_idx;
        }
        if (!op_code.add && !op_code.mul && !op_code.eq && !op_code.reset) {
            return null_op_idx;
        }

        throw_or_abort("Invalid op code");
        return 0;
    }

    void finalize_circuit();

    // Shadows UltraCircuitBuilder_::create_poseidon2_external_gate so Mega external rounds land in the
    // shared `poseidon2` block alongside the internal rounds (keeping each permutation's rows contiguous).
    void create_poseidon2_external_gate(const poseidon2_external_gate_<FF>& in);
    void create_poseidon2_initial_external_gate(const poseidon2_initial_external_gate_<FF>& in);
    void create_poseidon2_quad_internal_gate(const poseidon2_quad_internal_gate_<FF>& in);
    void create_poseidon2_transition_entry_gate(const poseidon2_transition_entry_gate_<FF>& in);

    size_t get_num_constant_gates() const override { return 0; }

    /**
     * @brief Add a witness variable to the specified calldata bus.
     *
     */
    void add_public_calldata(BusId bus_idx, const uint32_t& in)
        requires(ExecutionTrace::has_gate_kind(GateKind::BusRead))
    {
        return append_to_bus_vector(bus_idx, in);
    }

    /**
     * @brief Add a witness variable to the public return_data.
     *
     */
    void add_public_return_data(const uint32_t& in)
        requires(ExecutionTrace::has_gate_kind(GateKind::BusRead))
    {
        return append_to_bus_vector(BusId::RETURNDATA, in);
    }

    uint32_t read_bus_vector(BusId bus_idx, const uint32_t& read_idx_witness_idx)
        requires(ExecutionTrace::has_gate_kind(GateKind::BusRead));

    /**
     * @brief Emit a busread gate at slot `slot_idx` whose value wire is the bus_vector entry at that slot.
     * @details Creates a constant witness for the index, reuses the bus entry's existing witness as the
     * value wire (no fresh allocation), and increments the slot's read_count.
     */
    void create_databus_init_read_gate(BusId bus_idx, size_t slot_idx)
        requires(ExecutionTrace::has_gate_kind(GateKind::BusRead));

    /**
     * @brief Read from the specified calldata bus and create a corresponding databus read gate
     *
     */
    uint32_t read_calldata(BusId bus_idx, const uint32_t& read_idx_witness_idx)
        requires(ExecutionTrace::has_gate_kind(GateKind::BusRead))
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
        requires(ExecutionTrace::has_gate_kind(GateKind::BusRead))
    {
        return read_bus_vector(BusId::RETURNDATA, read_idx_witness_idx);
    };

    /**
     * @brief Append a witness to a bus column and bind the new slot to that witness via a busread gate.
     */
    void append_to_bus_vector(const BusId bus_idx, const uint32_t& witness_idx)
        requires(ExecutionTrace::has_gate_kind(GateKind::BusRead))
    {
        assert_bus_allowed(bus_idx, "append to");
        auto& bus_vector = databus[static_cast<size_t>(bus_idx)];
        bus_vector.append(witness_idx);
        create_databus_init_read_gate(bus_idx, bus_vector.size() - 1);
    }

    /**
     * @brief Abort unless this arithmetization has bus `bus_idx`.
     * @details Unlike a gate kind, which a reduced arithmetization simply has no block for, the bus is
     * selected by a runtime `BusId` at every databus call site, so this one check stays dynamic (against a
     * compile-time mask). `append_to_bus_vector` and `read_bus_vector` are the only builder-level databus
     * entry points. Reads must be checked independently of content: a read gate lands in the `busread`
     * block, which every Mega arithmetization keeps, so only the read call site knows which bus was read.
     */
    void assert_bus_allowed(const BusId bus_idx, const char* action) const
    {
        if (!ExecutionTrace::has_bus(static_cast<size_t>(bus_idx))) {
            throw_or_abort("MegaCircuitBuilder: cannot " + std::string(action) + " databus column " +
                           std::to_string(static_cast<size_t>(bus_idx)) +
                           "; it is not part of the arithmetization this circuit is built for.");
        }
    }

    const BusVector& get_calldata(BusId idx) const { return databus[static_cast<size_t>(idx)]; }
    const BusVector& get_return_data() const { return databus[static_cast<size_t>(BusId::RETURNDATA)]; }
    // Indexed access to the databus columns; enables NUM_BUS_COLUMNS-driven iteration over bus vectors.
    const BusVector& get_bus_vector(size_t bus_idx) const { return databus[bus_idx]; }

    /**
     * @brief Release the circuit-construction data (see UltraCircuitBuilder_::free_construction_data) and the databus.
     * @details The builder cannot be used to build or check a circuit afterwards.
     */
    void free_construction_data() override
    {
        UltraCircuitBuilder_<MegaExecutionTraceBlocks>::free_construction_data();
        databus = DataBus{};
    }

    /**
     * @brief Compute a hash of the circuit
     * @details Hashes all wires and selectors from each block. Note that this encompases all gate data, copy
     * constraints, and public inputs (via pub inputs block). Useful for debugging purposes to identify where two
     * circuits diverge.
     */
    std::string hash() const
    {
        using serialize::write;
        std::vector<uint8_t> buffer;

        // Hash each block's complete structure - need to const_cast to call non-const methods
        auto& blocks_ref = const_cast<ExecutionTrace&>(this->blocks);
        for (auto& block : blocks_ref.get()) {
            // Hash all wires; implicitly contains copy constraint information
            for (const auto& wire : block.wires) {
                for (const auto& idx : wire) {
                    write(buffer, idx);
                }
            }

            // Hash all selectors
            auto selectors = block.get_selectors();
            for (auto& selector : selectors) {
                for (size_t i = 0; i < selector.size(); ++i) {
                    write(buffer, selector[i]);
                }
            }
        }

        // Compute SHA256 hash
        auto hash_bytes = crypto::sha256(buffer);

        // Convert to hex string
        std::stringstream ss;
        ss << hash_bytes;
        return ss.str();
    }
};
// The builder aliases (one per arithmetization) are declared in circuit_builders_fwd.hpp.
} // namespace bb
