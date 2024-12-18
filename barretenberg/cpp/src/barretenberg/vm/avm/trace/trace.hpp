#pragma once

#include "barretenberg/vm/avm/trace/addressing_mode.hpp"
#include "barretenberg/vm/avm/trace/alu_trace.hpp"
#include "barretenberg/vm/avm/trace/binary_trace.hpp"
#include "barretenberg/vm/avm/trace/bytecode_trace.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/execution_hints.hpp"
#include "barretenberg/vm/avm/trace/gadgets/conversion_trace.hpp"
#include "barretenberg/vm/avm/trace/gadgets/ecc.hpp"
#include "barretenberg/vm/avm/trace/gadgets/keccak.hpp"
#include "barretenberg/vm/avm/trace/gadgets/merkle_tree.hpp"
#include "barretenberg/vm/avm/trace/gadgets/poseidon2.hpp"
#include "barretenberg/vm/avm/trace/gadgets/range_check.hpp"
#include "barretenberg/vm/avm/trace/gadgets/sha256.hpp"
#include "barretenberg/vm/avm/trace/gadgets/slice_trace.hpp"
#include "barretenberg/vm/avm/trace/gas_trace.hpp"
#include "barretenberg/vm/avm/trace/mem_trace.hpp"
#include "barretenberg/vm/avm/trace/opcode.hpp"
#include "barretenberg/vm/avm/trace/public_inputs.hpp"
#include "barretenberg/vm/constants.hpp"
#include <stack>
#include <unordered_set>

namespace bb::avm_trace {

using Row = bb::AvmFullRow<bb::fr>;

struct ReturnDataError {
    std::vector<FF> return_data;
    AvmError error;
    bool is_top_level = false;
};

struct RowWithError {
    Row row;
    AvmError error;
};

// This is the internal context that we keep along the lifecycle of bytecode execution
// to iteratively build the whole trace. This is effectively performing witness generation.
// At the end of circuit building, mainTrace can be moved to AvmCircuitBuilder by calling
// AvmCircuitBuilder::set_trace(rows).
class AvmTraceBuilder {

  public:
    AvmTraceBuilder(AvmPublicInputs public_inputs = {},
                    ExecutionHints execution_hints = {},
                    uint32_t side_effect_counter = 0);

    void set_all_calldata(const std::vector<FF>& all_calldata) { this->all_calldata = all_calldata; }
    std::vector<FF> get_all_returndata() { return this->all_returndata; }
    void set_public_call_request(PublicCallRequest const& public_call_request)
    {
        this->current_public_call_request = public_call_request;
    }
    uint32_t get_call_ptr() const { return call_ptr; }
    void set_call_ptr(uint8_t call_ptr) { this->call_ptr = call_ptr; }

    uint32_t get_pc() const { return pc; }
    void set_pc(uint32_t new_pc) { pc = new_pc; }
    uint32_t get_l2_gas_left() const { return gas_trace_builder.get_l2_gas_left(); }
    uint32_t get_da_gas_left() const { return gas_trace_builder.get_da_gas_left(); }
    uint32_t get_clk() const { return static_cast<uint32_t>(main_trace.size()); }

    // Compute - Arithmetic
    AvmError op_add(
        uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code = OpCode::ADD_16);
    AvmError op_sub(
        uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code = OpCode::SUB_16);
    AvmError op_mul(
        uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code = OpCode::MUL_16);
    AvmError op_div(
        uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code = OpCode::DIV_16);
    AvmError op_fdiv(
        uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code = OpCode::FDIV_16);

    // Compute - Comparators
    AvmError op_eq(
        uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code = OpCode::EQ_16);
    AvmError op_lt(
        uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code = OpCode::LT_16);
    AvmError op_lte(
        uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code = OpCode::LTE_16);

    // Compute - Bitwise
    AvmError op_and(
        uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code = OpCode::AND_16);
    AvmError op_or(
        uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code = OpCode::OR_16);
    AvmError op_xor(
        uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code = OpCode::XOR_16);
    AvmError op_not(uint8_t indirect, uint32_t a_offset, uint32_t dst_offset, OpCode op_code = OpCode::NOT_16);
    AvmError op_shl(
        uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code = OpCode::SHL_16);
    AvmError op_shr(
        uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code = OpCode::SHR_16);

    // Compute - Type Conversions
    AvmError op_cast(uint8_t indirect,
                     uint32_t a_offset,
                     uint32_t dst_offset,
                     AvmMemoryTag dst_tag,
                     OpCode op_code = OpCode::CAST_16);

    // Execution Environment
    AvmError op_get_env_var(uint8_t indirect, uint32_t dst_offset, uint8_t env_var);
    AvmError op_address(uint8_t indirect, uint32_t dst_offset);
    AvmError op_sender(uint8_t indirect, uint32_t dst_offset);
    AvmError op_transaction_fee(uint8_t indirect, uint32_t dst_offset);
    AvmError op_is_static_call(uint8_t indirect, uint32_t dst_offset);

    // Execution Environment - Globals
    AvmError op_chain_id(uint8_t indirect, uint32_t dst_offset);
    AvmError op_version(uint8_t indirect, uint32_t dst_offset);
    AvmError op_block_number(uint8_t indirect, uint32_t dst_offset);
    AvmError op_timestamp(uint8_t indirect, uint32_t dst_offset);
    AvmError op_fee_per_l2_gas(uint8_t indirect, uint32_t dst_offset);
    AvmError op_fee_per_da_gas(uint8_t indirect, uint32_t dst_offset);

    // Execution Environment - Calldata
    AvmError op_calldata_copy(uint8_t indirect,
                              uint32_t cd_offset_address,
                              uint32_t copy_size_offset,
                              uint32_t dst_offset);
    AvmError op_returndata_size(uint8_t indirect, uint32_t dst_offset);
    AvmError op_returndata_copy(uint8_t indirect,
                                uint32_t rd_offset_address,
                                uint32_t copy_size_offset,
                                uint32_t dst_offset);

    // Machine State - Gas
    AvmError op_l2gasleft(uint8_t indirect, uint32_t dst_offset);
    AvmError op_dagasleft(uint8_t indirect, uint32_t dst_offset);

    // Machine State - Internal Control Flow
    // TODO(8945): skip_gas boolean is temporary and should be removed once all fake rows are removed
    AvmError op_jump(uint32_t jmp_dest, bool skip_gas = false);
    AvmError op_jumpi(uint8_t indirect, uint32_t cond_offset, uint32_t jmp_dest);
    AvmError op_internal_call(uint32_t jmp_dest);
    AvmError op_internal_return();

    // Machine State - Memory
    // TODO(8945): skip_gas boolean is temporary and should be removed once all fake rows are removed
    AvmError op_set(uint8_t indirect,
                    FF val,
                    uint32_t dst_offset,
                    AvmMemoryTag in_tag,
                    OpCode op_code = OpCode::SET_FF,
                    bool skip_gas = false);
    AvmError op_mov(uint8_t indirect, uint32_t src_offset, uint32_t dst_offset, OpCode op_code = OpCode::MOV_16);

    // World State
    AvmError op_sload(uint8_t indirect, uint32_t slot_offset, uint32_t dest_offset);
    AvmError op_sstore(uint8_t indirect, uint32_t src_offset, uint32_t slot_offset);
    AvmError op_note_hash_exists(uint8_t indirect,
                                 uint32_t note_hash_offset,
                                 uint32_t leaf_index_offset,
                                 uint32_t dest_offset);
    AvmError op_emit_note_hash(uint8_t indirect, uint32_t note_hash_offset);
    AvmError op_nullifier_exists(uint8_t indirect,
                                 uint32_t nullifier_offset,
                                 uint32_t address_offset,
                                 uint32_t dest_offset);
    AvmError op_emit_nullifier(uint8_t indirect, uint32_t nullifier_offset);
    AvmError op_l1_to_l2_msg_exists(uint8_t indirect,
                                    uint32_t log_offset,
                                    uint32_t leaf_index_offset,
                                    uint32_t dest_offset);
    AvmError op_get_contract_instance(
        uint8_t indirect, uint16_t address_offset, uint16_t dst_offset, uint16_t exists_offset, uint8_t member_enum);

    // Accrued Substate
    AvmError op_emit_unencrypted_log(uint8_t indirect, uint32_t log_offset, uint32_t log_size_offset);
    AvmError op_emit_l2_to_l1_msg(uint8_t indirect, uint32_t recipient_offset, uint32_t content_offset);

    // Control Flow - Contract Calls
    AvmError op_call(uint16_t indirect,
                     uint32_t gas_offset,
                     uint32_t addr_offset,
                     uint32_t args_offset,
                     uint32_t args_size,
                     uint32_t success_offset);
    AvmError op_static_call(uint16_t indirect,
                            uint32_t gas_offset,
                            uint32_t addr_offset,
                            uint32_t args_offset,
                            uint32_t args_size,
                            uint32_t success_offset);
    ReturnDataError op_return(uint8_t indirect, uint32_t ret_offset, uint32_t ret_size_offset);
    // REVERT Opcode (that just call return under the hood for now)
    ReturnDataError op_revert(uint8_t indirect, uint32_t ret_offset, uint32_t ret_size_offset);

    // Misc
    AvmError op_debug_log(uint8_t indirect,
                          uint32_t message_offset,
                          uint32_t fields_offset,
                          uint32_t fields_size_offset,
                          uint32_t message_size);

    // Gadgets
    AvmError op_poseidon2_permutation(uint8_t indirect, uint32_t input_offset, uint32_t output_offset);
    AvmError op_sha256_compression(uint8_t indirect,
                                   uint32_t output_offset,
                                   uint32_t state_offset,
                                   uint32_t inputs_offset);
    AvmError op_keccakf1600(uint8_t indirect, uint32_t output_offset, uint32_t input_offset);

    AvmError op_ec_add(uint16_t indirect,
                       uint32_t lhs_x_offset,
                       uint32_t lhs_y_offset,
                       uint32_t lhs_is_inf_offset,
                       uint32_t rhs_x_offset,
                       uint32_t rhs_y_offset,
                       uint32_t rhs_is_inf_offset,
                       uint32_t output_offset);
    AvmError op_variable_msm(uint8_t indirect,
                             uint32_t points_offset,
                             uint32_t scalars_offset,
                             uint32_t output_offset,
                             uint32_t point_length_offset);
    // Conversions
    AvmError op_to_radix_be(uint16_t indirect,
                            uint32_t src_offset,
                            uint32_t radix_offset,
                            uint32_t num_limbs_offset,
                            uint32_t output_bits_offset,
                            uint32_t dst_offset);

    std::vector<Row> finalize(bool apply_end_gas_assertions = false);
    void reset();

    void checkpoint_non_revertible_state();
    void rollback_to_non_revertible_checkpoint();
    std::vector<uint8_t> get_bytecode(const FF contract_address, bool check_membership = false);
    std::unordered_set<FF> bytecode_membership_cache;
    void insert_private_state(const std::vector<FF>& siloed_nullifiers, const std::vector<FF>& unique_note_hashes);
    void insert_private_revertible_state(const std::vector<FF>& siloed_nullifiers,
                                         const std::vector<FF>& siloed_note_hashes);
    void pay_fee();
    void pad_trees();
    void allocate_gas_for_call(uint32_t l2_gas, uint32_t da_gas);
    void handle_exceptional_halt();

    // These are used for testing only.
    AvmTraceBuilder& set_range_check_required(bool required)
    {
        range_check_required = required;
        return *this;
    }
    AvmTraceBuilder& set_full_precomputed_tables(bool required)
    {
        full_precomputed_tables = required;
        return *this;
    }

    struct MemOp {
        bool is_indirect;
        uint32_t indirect_address;
        uint32_t direct_address;
        AvmMemoryTag tag;
        bool tag_match;
        FF val;
    };

    struct ExtCallCtx {
        uint32_t context_id; // This is the unique id of the ctx, we'll use the clk
        uint32_t parent_id;
        bool is_static_call = false;
        FF contract_address{};
        std::vector<FF> calldata;
        std::vector<FF> nested_returndata;
        uint32_t last_pc;
        uint32_t success_offset;
        uint32_t start_l2_gas_left;
        uint32_t start_da_gas_left;
        uint32_t l2_gas_left; // as of start of latest nested call
        uint32_t da_gas_left; // as of start of latest nested call
        std::stack<uint32_t> internal_return_ptr_stack;
        TreeSnapshots tree_snapshot; // This is the tree state at the time of the call
        std::unordered_set<FF> public_data_unique_writes;
    };

    ExtCallCtx current_ext_call_ctx{};
    std::stack<ExtCallCtx> external_call_ctx_stack;

  private:
    std::vector<Row> main_trace;

    AvmPublicInputs public_inputs;
    PublicCallRequest current_public_call_request;
    std::vector<FF> returndata;
    std::vector<FF> all_calldata;
    std::vector<FF> all_returndata;

    // Side effect counter will increment when any state writing values are encountered.
    uint32_t side_effect_counter = 0;
    uint32_t external_call_counter = 0; // Incremented both by OpCode::CALL and OpCode::STATICCALL
    ExecutionHints execution_hints;
    // These are some counters for the tree acceess hints that we probably dont need in the future
    uint32_t note_hash_read_counter = 0;
    uint32_t note_hash_write_counter = 0;
    uint32_t nullifier_read_counter = 0;
    uint32_t nullifier_write_counter = 0;
    uint32_t l1_to_l2_msg_read_counter = 0;
    uint32_t l2_to_l1_msg_write_counter = 0;
    uint32_t storage_read_counter = 0;
    uint32_t storage_write_counter = 0;
    uint32_t unencrypted_log_write_counter = 0;

    // These exist due to testing only.
    bool range_check_required = true;
    bool full_precomputed_tables = true;

    AvmMemTraceBuilder mem_trace_builder;
    AvmAluTraceBuilder alu_trace_builder;
    AvmBinaryTraceBuilder bin_trace_builder;
    AvmGasTraceBuilder gas_trace_builder;
    AvmConversionTraceBuilder conversion_trace_builder;
    AvmSha256TraceBuilder sha256_trace_builder;
    AvmPoseidon2TraceBuilder poseidon2_trace_builder;
    AvmKeccakTraceBuilder keccak_trace_builder;
    AvmEccTraceBuilder ecc_trace_builder;
    AvmSliceTraceBuilder slice_trace_builder;
    AvmRangeCheckBuilder range_check_builder;
    AvmBytecodeTraceBuilder bytecode_trace_builder;
    AvmMerkleTreeTraceBuilder merkle_tree_trace_builder;

    RowWithError create_kernel_lookup_opcode(uint8_t indirect, uint32_t dst_offset, FF value, AvmMemoryTag w_tag);

    RowWithError create_kernel_output_opcode(uint8_t indirect, uint32_t clk, uint32_t data_offset);

    RowWithError create_kernel_output_opcode_with_metadata(uint8_t indirect,
                                                           uint32_t clk,
                                                           uint32_t data_offset,
                                                           AvmMemoryTag data_r_tag,
                                                           uint32_t metadata_offset,
                                                           AvmMemoryTag metadata_r_tag);

    AvmError constrain_external_call(OpCode opcode,
                                     uint16_t indirect,
                                     uint32_t gas_offset,
                                     uint32_t addr_offset,
                                     uint32_t args_offset,
                                     uint32_t args_size_offset,
                                     uint32_t success_offset);

    AvmError execute_gasleft(EnvironmentVariable var, uint8_t indirect, uint32_t dst_offset);

    void finalise_mem_trace_lookup_counts();

    uint32_t pc = 0;
    uint32_t internal_return_ptr =
        0; // After a nested call, it should be initialized with MAX_SIZE_INTERNAL_STACK * call_ptr
    uint8_t call_ptr = 0;

    MemOp constrained_read_from_memory(uint8_t space_id,
                                       uint32_t clk,
                                       AddressWithMode addr,
                                       AvmMemoryTag read_tag,
                                       AvmMemoryTag write_tag,
                                       IntermRegister reg,
                                       AvmMemTraceBuilder::MemOpOwner mem_op_owner = AvmMemTraceBuilder::MAIN);
    MemOp constrained_write_to_memory(uint8_t space_id,
                                      uint32_t clk,
                                      AddressWithMode addr,
                                      FF const& value,
                                      AvmMemoryTag read_tag,
                                      AvmMemoryTag write_tag,
                                      IntermRegister reg,
                                      AvmMemTraceBuilder::MemOpOwner mem_op_owner = AvmMemTraceBuilder::MAIN);
    uint32_t get_inserted_note_hashes_count();
    uint32_t get_inserted_nullifiers_count();
    uint32_t get_public_data_writes_count();
    FF get_tx_hash() const { return public_inputs.previous_non_revertible_accumulated_data.nullifiers[0]; }

    // TODO: remove these once everything is constrained.
    AvmMemoryTag unconstrained_get_memory_tag(AddressWithMode addr);
    bool check_tag(AvmMemoryTag tag, AddressWithMode addr);
    bool check_tag_range(AvmMemoryTag tag, AddressWithMode start_offset, uint32_t size);
    FF unconstrained_read_from_memory(AddressWithMode addr);
    template <typename T> void read_slice_from_memory(AddressWithMode addr, size_t slice_len, std::vector<T>& slice);
    void write_to_memory(AddressWithMode addr, FF val, AvmMemoryTag w_tag, bool fix_pc = true);
    template <typename T> void write_slice_to_memory(AddressWithMode addr, AvmMemoryTag w_tag, const T& slice);
};

} // namespace bb::avm_trace
