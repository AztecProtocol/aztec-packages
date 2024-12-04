#include <algorithm>
#include <array>
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <fstream>
#include <functional>
#include <iostream>
#include <limits>
#include <set>
#include <string>
#include <sys/types.h>
#include <unordered_map>
#include <vector>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/polynomials/univariate.hpp"
#include "barretenberg/vm/avm/generated/full_row.hpp"
#include "barretenberg/vm/avm/trace/addressing_mode.hpp"
#include "barretenberg/vm/avm/trace/bytecode_trace.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/deserialization.hpp"
#include "barretenberg/vm/avm/trace/execution_hints.hpp"
#include "barretenberg/vm/avm/trace/fixed_bytes.hpp"
#include "barretenberg/vm/avm/trace/fixed_gas.hpp"
#include "barretenberg/vm/avm/trace/fixed_powers.hpp"
#include "barretenberg/vm/avm/trace/gadgets/cmp.hpp"
#include "barretenberg/vm/avm/trace/gadgets/keccak.hpp"
#include "barretenberg/vm/avm/trace/gadgets/merkle_tree.hpp"
#include "barretenberg/vm/avm/trace/gadgets/slice_trace.hpp"
#include "barretenberg/vm/avm/trace/helper.hpp"
#include "barretenberg/vm/avm/trace/opcode.hpp"
#include "barretenberg/vm/avm/trace/public_inputs.hpp"
#include "barretenberg/vm/avm/trace/trace.hpp"
#include "barretenberg/vm/aztec_constants.hpp"
#include "barretenberg/vm/stats.hpp"

namespace bb::avm_trace {

using Poseidon2 = crypto::Poseidon2<crypto::Poseidon2Bn254ScalarFieldParams>;
/**************************************************************************************************
 *                              HELPERS IN ANONYMOUS NAMESPACE
 **************************************************************************************************/
namespace {

// WARNING: FOR TESTING ONLY
// Generates the lookup table for the range checks without doing a full 2**16 rows
uint32_t finalize_rng_chks_for_testing(std::vector<Row>& main_trace,
                                       AvmAluTraceBuilder const& alu_trace_builder,
                                       AvmMemTraceBuilder const& mem_trace_builder,
                                       AvmRangeCheckBuilder const& rng_chk_trace_builder,
                                       AvmGasTraceBuilder const& gas_trace_builder)
{
    // Build the main_trace, and add any new rows with specific clks that line up with lookup reads

    // Is there a "spread-like" operator in cpp or can I make it generic of the first param of the unordered map
    std::vector<std::unordered_map<uint8_t, uint32_t>> u8_rng_chks = {
        alu_trace_builder.u8_range_chk_counters[0], alu_trace_builder.u8_range_chk_counters[1],
        alu_trace_builder.u8_pow_2_counters[0],     alu_trace_builder.u8_pow_2_counters[1],
        rng_chk_trace_builder.powers_of_2_counts,   mem_trace_builder.mem_rng_chk_u8_counts,
    };

    std::vector<std::reference_wrapper<std::unordered_map<uint16_t, uint32_t> const>> u16_rng_chks;

    u16_rng_chks.emplace_back(rng_chk_trace_builder.dyn_diff_counts);
    u16_rng_chks.emplace_back(mem_trace_builder.mem_rng_chk_u16_0_counts);
    u16_rng_chks.emplace_back(mem_trace_builder.mem_rng_chk_u16_1_counts);
    u16_rng_chks.insert(u16_rng_chks.end(),
                        rng_chk_trace_builder.u16_range_chk_counters.begin(),
                        rng_chk_trace_builder.u16_range_chk_counters.end());

    u16_rng_chks.insert(u16_rng_chks.end(),
                        gas_trace_builder.rem_gas_rng_check_counts.begin(),
                        gas_trace_builder.rem_gas_rng_check_counts.end());

    auto custom_clk = std::set<uint32_t>{};
    for (auto const& row : u8_rng_chks) {
        for (auto const& [key, value] : row) {
            custom_clk.insert(key);
        }
    }

    for (auto row : u16_rng_chks) {
        for (auto const& [key, value] : row.get()) {
            custom_clk.insert(key);
        }
    }

    for (auto const& [clk, count] : mem_trace_builder.m_tag_err_lookup_counts) {
        custom_clk.insert(clk);
    }

    auto old_size = main_trace.size();
    for (auto const& clk : custom_clk) {
        if (clk >= old_size) {
            main_trace.push_back(Row{ .main_clk = FF(clk) });
        }
    }

    return static_cast<uint32_t>(main_trace.size());
}

template <typename MEM, size_t T> std::array<MEM, T> vec_to_arr(std::vector<MEM> const& vec)
{
    std::array<MEM, T> arr;
    ASSERT(T == vec.size());
    for (size_t i = 0; i < T; i++) {
        arr[i] = vec[i];
    }
    return arr;
}

bool check_tag_integral(AvmMemoryTag tag)
{
    switch (tag) {
    case AvmMemoryTag::U1:
    case AvmMemoryTag::U8:
    case AvmMemoryTag::U16:
    case AvmMemoryTag::U32:
    case AvmMemoryTag::U64:
    case AvmMemoryTag::U128:
        return true;
    default:
        return false;
    }
}

bool isCanonical(FF contract_address)
{
    // TODO: constrain this!
    return contract_address == CANONICAL_AUTH_REGISTRY_ADDRESS || contract_address == DEPLOYER_CONTRACT_ADDRESS ||
           contract_address == REGISTERER_CONTRACT_ADDRESS || contract_address == MULTI_CALL_ENTRYPOINT_ADDRESS ||
           contract_address == FEE_JUICE_ADDRESS || contract_address == ROUTER_ADDRESS;
}

} // anonymous namespace

/**************************************************************************************************
 *                                   HELPERS
 **************************************************************************************************/

void AvmTraceBuilder::checkpoint_non_revertible_state()
{
    merkle_tree_trace_builder.checkpoint_non_revertible_state();
}
void AvmTraceBuilder::rollback_to_non_revertible_checkpoint()
{
    merkle_tree_trace_builder.rollback_to_non_revertible_checkpoint();
}

std::vector<uint8_t> AvmTraceBuilder::get_bytecode(const FF contract_address, bool check_membership)
{
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    // Find the bytecode based on contract address of the public call request
    const AvmContractBytecode bytecode_hint =
        *std::ranges::find_if(execution_hints.all_contract_bytecode, [contract_address](const auto& contract) {
            return contract.contract_instance.address == contract_address;
        });

    bool exists = true;
    if (check_membership && !isCanonical(contract_address)) {
        const auto contract_address_nullifier = AvmMerkleTreeTraceBuilder::unconstrained_silo_nullifier(
            DEPLOYER_CONTRACT_ADDRESS, /*nullifier=*/contract_address);
        // nullifier read hint for the contract address
        NullifierReadTreeHint nullifier_read_hint = bytecode_hint.contract_instance.membership_hint;

        // If the hinted preimage matches the contract address nullifier, the membership check will prove its existence,
        // otherwise the membership check will prove that a low-leaf exists that skips the contract address nullifier.
        exists = nullifier_read_hint.low_leaf_preimage.nullifier == contract_address_nullifier;
        // perform the membership or non-membership check
        bool is_member = merkle_tree_trace_builder.perform_nullifier_read(clk,
                                                                          nullifier_read_hint.low_leaf_preimage,
                                                                          nullifier_read_hint.low_leaf_index,
                                                                          nullifier_read_hint.low_leaf_sibling_path);
        // membership check must always pass
        ASSERT(is_member);

        if (exists) {
            // This was a membership proof!
            // Assert that the hint's exists flag matches. The flag isn't really necessary...
            ASSERT(bytecode_hint.contract_instance.exists);
        } else {
            // This was a non-membership proof!
            // Enforce that the tree access membership checked a low-leaf that skips the contract address nullifier.
            // Show that the contract address nullifier meets the non membership conditions (sandwich or max)
            ASSERT(contract_address_nullifier < nullifier_read_hint.low_leaf_preimage.nullifier &&
                   (nullifier_read_hint.low_leaf_preimage.next_nullifier == FF::zero() ||
                    contract_address_nullifier > nullifier_read_hint.low_leaf_preimage.next_nullifier));
        }
    }

    if (exists) {
        vinfo("Found bytecode for contract address: ", contract_address);
        return bytecode_hint.bytecode;
    }
    // TODO(dbanks12): handle non-existent bytecode
    vinfo("Bytecode not found for contract address: ", contract_address);
    throw std::runtime_error("Bytecode not found");
}

void AvmTraceBuilder::insert_private_state(const std::vector<FF>& siloed_nullifiers,
                                           [[maybe_unused]] const std::vector<FF>& siloed_note_hashes)
{
    for (const auto& siloed_nullifier : siloed_nullifiers) {
        auto hint = execution_hints.nullifier_write_hints[nullifier_write_counter++];
        merkle_tree_trace_builder.perform_nullifier_append(0,
                                                           hint.low_leaf_membership.low_leaf_preimage,
                                                           hint.low_leaf_membership.low_leaf_index,
                                                           hint.low_leaf_membership.low_leaf_sibling_path,
                                                           siloed_nullifier,
                                                           hint.insertion_path);
    }
}

/**
 * @brief Loads a value from memory into a given intermediate register at a specified clock cycle.
 * Handles both direct and indirect memory access.
 * @tparam reg The intermediate register to load the value into.
 */
AvmTraceBuilder::MemOp AvmTraceBuilder::constrained_read_from_memory(uint8_t space_id,
                                                                     uint32_t clk,
                                                                     AddressWithMode addr,
                                                                     AvmMemoryTag read_tag,
                                                                     AvmMemoryTag write_tag,
                                                                     IntermRegister reg,
                                                                     AvmMemTraceBuilder::MemOpOwner mem_op_owner)
{
    // Get the same matching indirect register for the given intermediate register.
    // This is a hack that we can replace with a mapping of IntermediateRegister to IndirectRegister.
    auto indirect_reg = static_cast<IndirectRegister>(reg);
    // Set up direct and indirect offsets that may be overwritten
    uint32_t direct_offset = addr.offset;
    uint32_t indirect_offset = 0;
    bool tag_match = true;
    bool is_indirect = false;
    if (addr.mode == AddressingMode::INDIRECT) {
        is_indirect = true;
        indirect_offset = direct_offset;
        auto read_ind =
            mem_trace_builder.indirect_read_and_load_from_memory(space_id, clk, indirect_reg, indirect_offset);
        if (!read_ind.tag_match) {
            tag_match = false;
        }
        direct_offset = uint32_t(read_ind.val);
    }
    auto read_dir = mem_trace_builder.read_and_load_from_memory(
        space_id, clk, reg, direct_offset, read_tag, write_tag, mem_op_owner);

    return MemOp{
        .is_indirect = is_indirect,
        .indirect_address = indirect_offset,
        .direct_address = direct_offset,
        .tag = read_tag,
        .tag_match = tag_match && read_dir.tag_match,
        .val = read_dir.val,
    };
}

/**
 * @brief Writes a value to memory from a given intermediate register at a specified clock cycle.
 * Handles both direct and indirect memory access.
 * @tparam reg The intermediate register to write the value from.
 */
AvmTraceBuilder::MemOp AvmTraceBuilder::constrained_write_to_memory(uint8_t space_id,
                                                                    uint32_t clk,
                                                                    AddressWithMode addr,
                                                                    FF const& value,
                                                                    AvmMemoryTag read_tag,
                                                                    AvmMemoryTag write_tag,
                                                                    IntermRegister reg,
                                                                    AvmMemTraceBuilder::MemOpOwner mem_op_owner)
{
    auto indirect_reg = static_cast<IndirectRegister>(reg);
    uint32_t direct_offset = addr.offset;
    uint32_t indirect_offset = 0;
    bool tag_match = true;
    bool is_indirect = false;
    if (addr.mode == AddressingMode::INDIRECT) {
        is_indirect = true;
        indirect_offset = direct_offset;
        auto read_ind =
            mem_trace_builder.indirect_read_and_load_from_memory(space_id, clk, indirect_reg, indirect_offset);
        if (!read_ind.tag_match) {
            tag_match = false;
        }
        direct_offset = uint32_t(read_ind.val);
    }
    mem_trace_builder.write_into_memory(space_id, clk, reg, direct_offset, value, read_tag, write_tag, mem_op_owner);
    return MemOp{ .is_indirect = is_indirect,
                  .indirect_address = indirect_offset,
                  .direct_address = direct_offset,
                  .tag = write_tag,
                  .tag_match = tag_match,
                  .val = value };
}

AvmMemoryTag AvmTraceBuilder::unconstrained_get_memory_tag(AddressWithMode addr)
{
    auto offset = addr.offset;
    if (addr.mode == AddressingMode::INDIRECT) {
        offset = static_cast<decltype(offset)>(mem_trace_builder.unconstrained_read(call_ptr, offset));
    }
    return mem_trace_builder.unconstrained_get_memory_tag(call_ptr, offset);
}

bool AvmTraceBuilder::check_tag(AvmMemoryTag tag, AddressWithMode addr)
{
    return unconstrained_get_memory_tag(addr) == tag;
}

bool AvmTraceBuilder::check_tag_range(AvmMemoryTag tag, AddressWithMode start_offset, uint32_t size)
{
    for (uint32_t i = 0; i < size; i++) {
        if (!check_tag(tag, start_offset + i)) {
            return false;
        }
    }
    return true;
}

FF AvmTraceBuilder::unconstrained_read_from_memory(AddressWithMode addr)
{
    auto offset = addr.offset;
    if (addr.mode == AddressingMode::INDIRECT) {
        offset = static_cast<decltype(offset)>(mem_trace_builder.unconstrained_read(call_ptr, offset));
    }
    return mem_trace_builder.unconstrained_read(call_ptr, offset);
}

void AvmTraceBuilder::write_to_memory(AddressWithMode addr, FF val, AvmMemoryTag w_tag)
{
    // op_set increments the pc, so we need to store the current pc and then jump back to it
    // to legally reset the pc.
    auto current_pc = pc;
    op_set(static_cast<uint8_t>(addr.mode), val, addr.offset, w_tag, OpCode::SET_FF, true);
    op_jump(current_pc, true);
}

template <typename T>
void AvmTraceBuilder::read_slice_from_memory(AddressWithMode addr, size_t slice_len, std::vector<T>& slice)
{
    uint32_t base_addr = addr.offset;
    if (addr.mode == AddressingMode::INDIRECT) {
        base_addr = static_cast<uint32_t>(mem_trace_builder.unconstrained_read(call_ptr, base_addr));
    }

    for (uint32_t i = 0; i < slice_len; i++) {
        slice.push_back(static_cast<T>(mem_trace_builder.unconstrained_read(call_ptr, base_addr + i)));
    }
}

template <typename T>
void AvmTraceBuilder::write_slice_to_memory(AddressWithMode addr, AvmMemoryTag w_tag, const T& slice)
{
    auto base_addr = addr.mode == AddressingMode::INDIRECT
                         ? static_cast<uint32_t>(mem_trace_builder.unconstrained_read(call_ptr, addr.offset))
                         : addr.offset;
    for (uint32_t i = 0; i < slice.size(); i++) {
        write_to_memory(base_addr + i, slice[i], w_tag);
    }
}

// Finalise Lookup Counts
//
// For log derivative lookups, we require a column that contains the number of times each lookup is consumed
// As we build the trace, we keep track of the reads made in a mapping, so that they can be applied to the
// counts column here
//
// NOTE: its coupled to pil - this is not the final iteration
void AvmTraceBuilder::finalise_mem_trace_lookup_counts()
{
    for (auto const& [clk, count] : mem_trace_builder.m_tag_err_lookup_counts) {
        main_trace.at(clk).incl_main_tag_err_counts = count;
    }
}

/**
 * @brief Constructor of a trace builder of AVM. Only serves to set the capacity of the
 *        underlying traces and initialize gas values.
 */
AvmTraceBuilder::AvmTraceBuilder(AvmPublicInputs public_inputs,
                                 ExecutionHints execution_hints_,
                                 uint32_t side_effect_counter)
    // NOTE: we initialise the environment builder here as it requires public inputs
    : public_inputs(public_inputs)
    , side_effect_counter(side_effect_counter)
    , execution_hints(std::move(execution_hints_))
    , bytecode_trace_builder(execution_hints.all_contract_bytecode)
    , merkle_tree_trace_builder(public_inputs.start_tree_snapshots)
{
    // TODO: think about cast
    gas_trace_builder.set_initial_gas(
        static_cast<uint32_t>(public_inputs.gas_settings.gas_limits.l2_gas - public_inputs.start_gas_used.l2_gas),
        static_cast<uint32_t>(public_inputs.gas_settings.gas_limits.da_gas - public_inputs.start_gas_used.da_gas));
}

/**************************************************************************************************
 *                            COMPUTE - ARITHMETIC
 **************************************************************************************************/

/**
 * @brief Addition with direct or indirect memory access.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param a_offset An index in memory pointing to the first operand of the addition.
 * @param b_offset An index in memory pointing to the second operand of the addition.
 * @param dst_offset An index in memory pointing to the output of the addition.
 * @param in_tag The instruction memory tag of the operands.
 */
AvmError AvmTraceBuilder::op_add(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    // Resolve any potential indirects in the order they are encoded in the indirect byte.
    auto [resolved_addrs, res_error] =
        Addressing<3>::fromWire(indirect, call_ptr).resolve({ a_offset, b_offset, dst_offset }, mem_trace_builder);
    auto [resolved_a, resolved_b, resolved_c] = resolved_addrs;
    error = res_error;

    // We get our representative memory tag from the resolved_a memory address.
    AvmMemoryTag in_tag = unconstrained_get_memory_tag(resolved_a);
    // Reading from memory and loading into ia resp. ib.
    auto read_a = constrained_read_from_memory(call_ptr, clk, resolved_a, in_tag, in_tag, IntermRegister::IA);
    auto read_b = constrained_read_from_memory(call_ptr, clk, resolved_b, in_tag, in_tag, IntermRegister::IB);

    bool tag_match = read_a.tag_match && read_b.tag_match;
    if (is_ok(error) && !tag_match) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    // a + b = c
    FF a = read_a.val;
    FF b = read_b.val;

    // In case of a memory tag error, we do not perform the computation.
    // Therefore, we do not create any entry in ALU table and store the value 0 as
    // output (c) in memory.
    FF c = is_ok(error) ? alu_trace_builder.op_add(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    auto write_c = constrained_write_to_memory(call_ptr, clk, resolved_c, c, in_tag, in_tag, IntermRegister::IC);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::ADD_8);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_alu_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_call_ptr = call_ptr,
        .main_ia = read_a.val,
        .main_ib = read_b.val,
        .main_ic = write_c.val,
        .main_ind_addr_a = FF(read_a.indirect_address),
        .main_ind_addr_b = FF(read_b.indirect_address),
        .main_ind_addr_c = FF(write_c.indirect_address),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_a = FF(read_a.direct_address),
        .main_mem_addr_b = FF(read_b.direct_address),
        .main_mem_addr_c = FF(write_c.direct_address),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_rwc = FF(1),
        .main_sel_mem_op_a = FF(1),
        .main_sel_mem_op_b = FF(1),
        .main_sel_mem_op_c = FF(1),
        .main_sel_op_add = FF(1),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
        .main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(read_b.is_indirect)),
        .main_sel_resolve_ind_addr_c = FF(static_cast<uint32_t>(write_c.is_indirect)),
        .main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .main_w_in_tag = FF(static_cast<uint32_t>(in_tag)),
    });

    ASSERT(op_code == OpCode::ADD_8 || op_code == OpCode::ADD_16);
    pc += Deserialization::get_pc_increment(op_code);
    return error;
}

/**
 * @brief Subtraction with direct or indirect memory access.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param a_offset An index in memory pointing to the first operand of the subtraction.
 * @param b_offset An index in memory pointing to the second operand of the subtraction.
 * @param dst_offset An index in memory pointing to the output of the subtraction.
 * @param in_tag The instruction memory tag of the operands.
 */
AvmError AvmTraceBuilder::op_sub(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    // Resolve any potential indirects in the order they are encoded in the indirect byte.

    auto [resolved_addrs, res_error] =
        Addressing<3>::fromWire(indirect, call_ptr).resolve({ a_offset, b_offset, dst_offset }, mem_trace_builder);
    auto [resolved_a, resolved_b, resolved_c] = resolved_addrs;
    error = res_error;

    // We get our representative memory tag from the resolved_a memory address.
    AvmMemoryTag in_tag = unconstrained_get_memory_tag(resolved_a);
    // Reading from memory and loading into ia resp. ib.
    auto read_a = constrained_read_from_memory(call_ptr, clk, resolved_a, in_tag, in_tag, IntermRegister::IA);
    auto read_b = constrained_read_from_memory(call_ptr, clk, resolved_b, in_tag, in_tag, IntermRegister::IB);

    bool tag_match = read_a.tag_match && read_b.tag_match;
    if (is_ok(error) && !tag_match) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    // a - b = c
    FF a = read_a.val;
    FF b = read_b.val;

    // In case of a memory tag error, we do not perform the computation.
    // Therefore, we do not create any entry in ALU table and store the value 0 as
    // output (c) in memory.
    FF c = is_ok(error) ? alu_trace_builder.op_sub(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    auto write_c = constrained_write_to_memory(call_ptr, clk, resolved_c, c, in_tag, in_tag, IntermRegister::IC);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::SUB_8);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_alu_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_call_ptr = call_ptr,
        .main_ia = read_a.val,
        .main_ib = read_b.val,
        .main_ic = write_c.val,
        .main_ind_addr_a = FF(read_a.indirect_address),
        .main_ind_addr_b = FF(read_b.indirect_address),
        .main_ind_addr_c = FF(write_c.indirect_address),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_a = FF(read_a.direct_address),
        .main_mem_addr_b = FF(read_b.direct_address),
        .main_mem_addr_c = FF(write_c.direct_address),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_rwc = FF(1),
        .main_sel_mem_op_a = FF(1),
        .main_sel_mem_op_b = FF(1),
        .main_sel_mem_op_c = FF(1),
        .main_sel_op_sub = FF(1),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
        .main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(read_b.is_indirect)),
        .main_sel_resolve_ind_addr_c = FF(static_cast<uint32_t>(write_c.is_indirect)),
        .main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .main_w_in_tag = FF(static_cast<uint32_t>(in_tag)),
    });

    ASSERT(op_code == OpCode::SUB_8 || op_code == OpCode::SUB_16);
    pc += Deserialization::get_pc_increment(op_code);
    return error;
}
/**
 * @brief Multiplication with direct or indirect memory access.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param a_offset An index in memory pointing to the first operand of the multiplication.
 * @param b_offset An index in memory pointing to the second operand of the multiplication.
 * @param dst_offset An index in memory pointing to the output of the multiplication.
 * @param in_tag The instruction memory tag of the operands.
 */
AvmError AvmTraceBuilder::op_mul(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    // Resolve any potential indirects in the order they are encoded in the indirect byte.
    auto [resolved_addrs, res_error] =
        Addressing<3>::fromWire(indirect, call_ptr).resolve({ a_offset, b_offset, dst_offset }, mem_trace_builder);
    auto [resolved_a, resolved_b, resolved_c] = resolved_addrs;
    error = res_error;

    // We get our representative memory tag from the resolved_a memory address.
    AvmMemoryTag in_tag = unconstrained_get_memory_tag(resolved_a);
    // Reading from memory and loading into ia resp. ib.
    auto read_a = constrained_read_from_memory(call_ptr, clk, resolved_a, in_tag, in_tag, IntermRegister::IA);
    auto read_b = constrained_read_from_memory(call_ptr, clk, resolved_b, in_tag, in_tag, IntermRegister::IB);

    bool tag_match = read_a.tag_match && read_b.tag_match;
    if (is_ok(error) && !tag_match) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    // a * b = c
    FF a = read_a.val;
    FF b = read_b.val;

    // In case of a memory tag error, we do not perform the computation.
    // Therefore, we do not create any entry in ALU table and store the value 0 as
    // output (c) in memory.
    FF c = is_ok(error) ? alu_trace_builder.op_mul(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    auto write_c = constrained_write_to_memory(call_ptr, clk, resolved_c, c, in_tag, in_tag, IntermRegister::IC);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::MUL_8);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_alu_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_call_ptr = call_ptr,
        .main_ia = read_a.val,
        .main_ib = read_b.val,
        .main_ic = write_c.val,
        .main_ind_addr_a = FF(read_a.indirect_address),
        .main_ind_addr_b = FF(read_b.indirect_address),
        .main_ind_addr_c = FF(write_c.indirect_address),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_a = FF(read_a.direct_address),
        .main_mem_addr_b = FF(read_b.direct_address),
        .main_mem_addr_c = FF(write_c.direct_address),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_rwc = FF(1),
        .main_sel_mem_op_a = FF(1),
        .main_sel_mem_op_b = FF(1),
        .main_sel_mem_op_c = FF(1),
        .main_sel_op_mul = FF(1),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
        .main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(read_b.is_indirect)),
        .main_sel_resolve_ind_addr_c = FF(static_cast<uint32_t>(write_c.is_indirect)),
        .main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .main_w_in_tag = FF(static_cast<uint32_t>(in_tag)),
    });

    ASSERT(op_code == OpCode::MUL_8 || op_code == OpCode::MUL_16);
    pc += Deserialization::get_pc_increment(op_code);
    return error;
}

/**
 * @brief Integer division with direct or indirect memory access.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param a_offset An index in memory pointing to the first operand of the division.
 * @param b_offset An index in memory pointing to the second operand of the division.
 * @param dst_offset An index in memory pointing to the output of the division.
 * @param in_tag The instruction memory tag of the operands.
 */
AvmError AvmTraceBuilder::op_div(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] =
        Addressing<3>::fromWire(indirect, call_ptr).resolve({ a_offset, b_offset, dst_offset }, mem_trace_builder);
    auto [resolved_a, resolved_b, resolved_dst] = resolved_addrs;
    error = res_error;

    // We get our representative memory tag from the resolved_a memory address.
    AvmMemoryTag in_tag = unconstrained_get_memory_tag(resolved_a);
    // Reading from memory and loading into ia resp. ib.
    auto read_a = constrained_read_from_memory(call_ptr, clk, resolved_a, in_tag, in_tag, IntermRegister::IA);
    auto read_b = constrained_read_from_memory(call_ptr, clk, resolved_b, in_tag, in_tag, IntermRegister::IB);
    bool tag_match = read_a.tag_match && read_b.tag_match;

    // No need to add check_tag_integral(read_b.tag) as this follows from tag matching and that a has integral tag.
    if (is_ok(error) && !(tag_match && check_tag_integral(read_a.tag))) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    // a / b = c
    FF a = read_a.val;
    FF b = read_b.val;

    // In case of a memory tag error, we do not perform the computation.
    // Therefore, we do not create any entry in ALU table and store the value 0 as
    // output (c) in memory.
    FF c;
    FF inv;

    if (!b.is_zero()) {
        // If b is not zero, we prove it is not by providing its inverse as well
        inv = b.invert();
        c = is_ok(error) ? alu_trace_builder.op_div(a, b, in_tag, clk) : FF(0);
    } else {
        inv = 1;
        c = 0;
        if (is_ok(error)) {
            error = AvmError::DIV_ZERO;
        }
    }

    // Write into memory value c from intermediate register ic.
    auto write_dst = constrained_write_to_memory(call_ptr, clk, resolved_dst, c, in_tag, in_tag, IntermRegister::IC);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::DIV_8);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_alu_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_call_ptr = call_ptr,
        .main_ia = read_a.val,
        .main_ib = read_b.val,
        .main_ic = c,
        .main_ind_addr_a = FF(read_a.indirect_address),
        .main_ind_addr_b = FF(read_b.indirect_address),
        .main_ind_addr_c = FF(write_dst.indirect_address),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_inv = tag_match ? inv : FF(1),
        .main_mem_addr_a = FF(read_a.direct_address),
        .main_mem_addr_b = FF(read_b.direct_address),
        .main_mem_addr_c = FF(write_dst.direct_address),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_rwc = FF(1),
        .main_sel_mem_op_a = FF(1),
        .main_sel_mem_op_b = FF(1),
        .main_sel_mem_op_c = FF(1),
        .main_sel_op_div = FF(1),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
        .main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(read_b.is_indirect)),
        .main_sel_resolve_ind_addr_c = FF(static_cast<uint32_t>(write_dst.is_indirect)),
        .main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .main_w_in_tag = FF(static_cast<uint32_t>(in_tag)),
    });

    ASSERT(op_code == OpCode::DIV_8 || op_code == OpCode::DIV_16);
    pc += Deserialization::get_pc_increment(op_code);
    return error;
}

/**
 * @brief Finite field division with direct or indirect memory access.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param a_offset An index in memory pointing to the first operand of the division.
 * @param b_offset An index in memory pointing to the second operand of the division.
 * @param dst_offset An index in memory pointing to the output of the division.
 * @param in_tag The instruction memory tag of the operands.
 */
AvmError AvmTraceBuilder::op_fdiv(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    // Resolve any potential indirects in the order they are encoded in the indirect byte.
    auto [resolved_addrs, res_error] =
        Addressing<3>::fromWire(indirect, call_ptr).resolve({ a_offset, b_offset, dst_offset }, mem_trace_builder);
    auto [resolved_a, resolved_b, resolved_c] = resolved_addrs;
    error = res_error;

    // Reading from memory and loading into ia resp. ib.
    auto read_a =
        constrained_read_from_memory(call_ptr, clk, resolved_a, AvmMemoryTag::FF, AvmMemoryTag::FF, IntermRegister::IA);
    auto read_b =
        constrained_read_from_memory(call_ptr, clk, resolved_b, AvmMemoryTag::FF, AvmMemoryTag::FF, IntermRegister::IB);

    bool tag_match = read_a.tag_match && read_b.tag_match;
    if (is_ok(error) && !tag_match) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    // a * b^(-1) = c
    FF a = read_a.val;
    FF b = read_b.val;
    FF c;
    FF inv;

    if (!b.is_zero()) {
        inv = b.invert();
        c = a * inv;
    } else {
        inv = 1;
        c = 0;
        if (is_ok(error)) {
            error = AvmError::DIV_ZERO;
        }
    }

    // Write into memory value c from intermediate register ic.
    auto write_c = constrained_write_to_memory(
        call_ptr, clk, resolved_c, c, AvmMemoryTag::FF, AvmMemoryTag::FF, IntermRegister::IC);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::FDIV_8);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_call_ptr = call_ptr,
        .main_ia = tag_match ? read_a.val : FF(0),
        .main_ib = tag_match ? read_b.val : FF(0),
        .main_ic = tag_match ? write_c.val : FF(0),
        .main_ind_addr_a = FF(read_a.indirect_address),
        .main_ind_addr_b = FF(read_b.indirect_address),
        .main_ind_addr_c = FF(write_c.indirect_address),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_inv = tag_match ? inv : FF(1),
        .main_mem_addr_a = FF(read_a.direct_address),
        .main_mem_addr_b = FF(read_b.direct_address),
        .main_mem_addr_c = FF(write_c.direct_address),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_r_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::FF)),
        .main_rwc = FF(1),
        .main_sel_mem_op_a = FF(1),
        .main_sel_mem_op_b = FF(1),
        .main_sel_mem_op_c = FF(1),
        .main_sel_op_fdiv = FF(1),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
        .main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(read_b.is_indirect)),
        .main_sel_resolve_ind_addr_c = FF(static_cast<uint32_t>(write_c.is_indirect)),
        .main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .main_w_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::FF)),
    });

    ASSERT(op_code == OpCode::FDIV_8 || op_code == OpCode::FDIV_16);
    pc += Deserialization::get_pc_increment(op_code);
    return error;
}

/**************************************************************************************************
 *                            COMPUTE - COMPARATORS
 **************************************************************************************************/

/**
 * @brief Equality with direct or indirect memory access.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param a_offset An index in memory pointing to the first operand of the equality.
 * @param b_offset An index in memory pointing to the second operand of the equality.
 * @param dst_offset An index in memory pointing to the output of the equality.
 * @param in_tag The instruction memory tag of the operands.
 */
AvmError AvmTraceBuilder::op_eq(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] =
        Addressing<3>::fromWire(indirect, call_ptr).resolve({ a_offset, b_offset, dst_offset }, mem_trace_builder);
    auto [resolved_a, resolved_b, resolved_c] = resolved_addrs;
    error = res_error;

    // We get our representative memory tag from the resolved_a memory address.
    AvmMemoryTag in_tag = unconstrained_get_memory_tag(resolved_a);
    // Reading from memory and loading into ia resp. ib.
    auto read_a = constrained_read_from_memory(call_ptr, clk, resolved_a, in_tag, AvmMemoryTag::U1, IntermRegister::IA);
    auto read_b = constrained_read_from_memory(call_ptr, clk, resolved_b, in_tag, AvmMemoryTag::U1, IntermRegister::IB);
    bool tag_match = read_a.tag_match && read_b.tag_match;

    if (is_ok(error) && !tag_match) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    FF a = read_a.val;
    FF b = read_b.val;

    // In case of a memory tag error, we do not perform the computation.
    // Therefore, we do not create any entry in ALU table and store the value 0 as
    // output (c) in memory.
    FF c = is_ok(error) ? alu_trace_builder.op_eq(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    auto write_c =
        constrained_write_to_memory(call_ptr, clk, resolved_c, c, in_tag, AvmMemoryTag::U1, IntermRegister::IC);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::EQ_8);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_alu_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_call_ptr = call_ptr,
        .main_ia = read_a.val,
        .main_ib = read_b.val,
        .main_ic = write_c.val,
        .main_ind_addr_a = FF(read_a.indirect_address),
        .main_ind_addr_b = FF(read_b.indirect_address),
        .main_ind_addr_c = FF(write_c.indirect_address),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_a = FF(read_a.direct_address),
        .main_mem_addr_b = FF(read_b.direct_address),
        .main_mem_addr_c = FF(write_c.direct_address),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_rwc = FF(1),
        .main_sel_mem_op_a = FF(1),
        .main_sel_mem_op_b = FF(1),
        .main_sel_mem_op_c = FF(1),
        .main_sel_op_eq = FF(1),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
        .main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(read_b.is_indirect)),
        .main_sel_resolve_ind_addr_c = FF(static_cast<uint32_t>(write_c.is_indirect)),
        .main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .main_w_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::U1)),
    });

    ASSERT(op_code == OpCode::EQ_8 || op_code == OpCode::EQ_16);
    pc += Deserialization::get_pc_increment(op_code);
    return error;
}

AvmError AvmTraceBuilder::op_lt(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] =
        Addressing<3>::fromWire(indirect, call_ptr).resolve({ a_offset, b_offset, dst_offset }, mem_trace_builder);
    auto [resolved_a, resolved_b, resolved_c] = resolved_addrs;
    error = res_error;

    // We get our representative memory tag from the resolved_a memory address.
    AvmMemoryTag in_tag = unconstrained_get_memory_tag(resolved_a);
    auto read_a = constrained_read_from_memory(call_ptr, clk, resolved_a, in_tag, AvmMemoryTag::U1, IntermRegister::IA);
    auto read_b = constrained_read_from_memory(call_ptr, clk, resolved_b, in_tag, AvmMemoryTag::U1, IntermRegister::IB);
    bool tag_match = read_a.tag_match && read_b.tag_match;

    if (is_ok(error) && !tag_match) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    FF a = tag_match ? read_a.val : FF(0);
    FF b = tag_match ? read_b.val : FF(0);

    FF c = is_ok(error) ? alu_trace_builder.op_lt(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    auto write_c =
        constrained_write_to_memory(call_ptr, clk, resolved_c, c, in_tag, AvmMemoryTag::U1, IntermRegister::IC);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::LT_8);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_alu_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_call_ptr = call_ptr,
        .main_ia = read_a.val,
        .main_ib = read_b.val,
        .main_ic = write_c.val,
        .main_ind_addr_a = FF(read_a.indirect_address),
        .main_ind_addr_b = FF(read_b.indirect_address),
        .main_ind_addr_c = FF(write_c.indirect_address),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_a = FF(read_a.direct_address),
        .main_mem_addr_b = FF(read_b.direct_address),
        .main_mem_addr_c = FF(write_c.direct_address),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_rwc = FF(1),
        .main_sel_mem_op_a = FF(1),
        .main_sel_mem_op_b = FF(1),
        .main_sel_mem_op_c = FF(1),
        .main_sel_op_lt = FF(1),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
        .main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(read_b.is_indirect)),
        .main_sel_resolve_ind_addr_c = FF(static_cast<uint32_t>(write_c.is_indirect)),
        .main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .main_w_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::U1)),
    });

    ASSERT(op_code == OpCode::LT_8 || op_code == OpCode::LT_16);
    pc += Deserialization::get_pc_increment(op_code);
    return error;
}

AvmError AvmTraceBuilder::op_lte(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] =
        Addressing<3>::fromWire(indirect, call_ptr).resolve({ a_offset, b_offset, dst_offset }, mem_trace_builder);
    auto [resolved_a, resolved_b, resolved_c] = resolved_addrs;
    error = res_error;

    // We get our representative memory tag from the resolved_a memory address.
    AvmMemoryTag in_tag = unconstrained_get_memory_tag(resolved_a);
    // Reading from memory and loading into ia resp. ib.
    auto read_a = constrained_read_from_memory(call_ptr, clk, resolved_a, in_tag, AvmMemoryTag::U1, IntermRegister::IA);
    auto read_b = constrained_read_from_memory(call_ptr, clk, resolved_b, in_tag, AvmMemoryTag::U1, IntermRegister::IB);
    bool tag_match = read_a.tag_match && read_b.tag_match;

    if (is_ok(error) && !tag_match) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    FF a = tag_match ? read_a.val : FF(0);
    FF b = tag_match ? read_b.val : FF(0);

    FF c = is_ok(error) ? alu_trace_builder.op_lte(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    auto write_c =
        constrained_write_to_memory(call_ptr, clk, resolved_c, c, in_tag, AvmMemoryTag::U1, IntermRegister::IC);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::LTE_8);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_alu_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_call_ptr = call_ptr,
        .main_ia = read_a.val,
        .main_ib = read_b.val,
        .main_ic = write_c.val,
        .main_ind_addr_a = FF(read_a.indirect_address),
        .main_ind_addr_b = FF(read_b.indirect_address),
        .main_ind_addr_c = FF(write_c.indirect_address),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_a = FF(read_a.direct_address),
        .main_mem_addr_b = FF(read_b.direct_address),
        .main_mem_addr_c = FF(write_c.direct_address),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_rwc = FF(1),
        .main_sel_mem_op_a = FF(1),
        .main_sel_mem_op_b = FF(1),
        .main_sel_mem_op_c = FF(1),
        .main_sel_op_lte = FF(1),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
        .main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(read_b.is_indirect)),
        .main_sel_resolve_ind_addr_c = FF(static_cast<uint32_t>(write_c.is_indirect)),
        .main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .main_w_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::U1)),
    });

    ASSERT(op_code == OpCode::LTE_8 || op_code == OpCode::LTE_16);
    pc += Deserialization::get_pc_increment(op_code);
    return error;
}

/**************************************************************************************************
 *                            COMPUTE - BITWISE
 **************************************************************************************************/

AvmError AvmTraceBuilder::op_and(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] =
        Addressing<3>::fromWire(indirect, call_ptr).resolve({ a_offset, b_offset, dst_offset }, mem_trace_builder);
    auto [resolved_a, resolved_b, resolved_c] = resolved_addrs;
    error = res_error;

    // We get our representative memory tag from the resolved_a memory address.
    AvmMemoryTag in_tag = unconstrained_get_memory_tag(resolved_a);
    // Reading from memory and loading into ia resp. ib.
    auto read_a = constrained_read_from_memory(call_ptr, clk, resolved_a, in_tag, in_tag, IntermRegister::IA);
    auto read_b = constrained_read_from_memory(call_ptr, clk, resolved_b, in_tag, in_tag, IntermRegister::IB);

    bool tag_match = read_a.tag_match && read_b.tag_match;
    // No need to add check_tag_integral(read_b.tag) as this follows from tag matching and that a has integral tag.
    if (is_ok(error) && !(tag_match && check_tag_integral(read_a.tag))) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    FF a = tag_match ? read_a.val : FF(0);
    FF b = tag_match ? read_b.val : FF(0);

    FF c = is_ok(error) ? bin_trace_builder.op_and(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    auto write_c = constrained_write_to_memory(call_ptr, clk, resolved_c, c, in_tag, in_tag, IntermRegister::IC);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::AND_8);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_bin_op_id = FF(0),
        .main_call_ptr = call_ptr,
        .main_ia = read_a.val,
        .main_ib = read_b.val,
        .main_ic = write_c.val,
        .main_ind_addr_a = FF(read_a.indirect_address),
        .main_ind_addr_b = FF(read_b.indirect_address),
        .main_ind_addr_c = FF(write_c.indirect_address),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_a = FF(read_a.direct_address),
        .main_mem_addr_b = FF(read_b.direct_address),
        .main_mem_addr_c = FF(write_c.direct_address),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_rwc = FF(1),
        .main_sel_bin = FF(static_cast<uint32_t>(is_ok(error))),
        .main_sel_mem_op_a = FF(1),
        .main_sel_mem_op_b = FF(1),
        .main_sel_mem_op_c = FF(1),
        .main_sel_op_and = FF(1),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
        .main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(read_b.is_indirect)),
        .main_sel_resolve_ind_addr_c = FF(static_cast<uint32_t>(write_c.is_indirect)),
        .main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .main_w_in_tag = FF(static_cast<uint32_t>(in_tag)),
    });

    ASSERT(op_code == OpCode::AND_8 || op_code == OpCode::AND_16);
    pc += Deserialization::get_pc_increment(op_code);
    return error;
}

AvmError AvmTraceBuilder::op_or(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] =
        Addressing<3>::fromWire(indirect, call_ptr).resolve({ a_offset, b_offset, dst_offset }, mem_trace_builder);
    auto [resolved_a, resolved_b, resolved_c] = resolved_addrs;
    error = res_error;

    // We get our representative memory tag from the resolved_a memory address.
    AvmMemoryTag in_tag = unconstrained_get_memory_tag(resolved_a);
    // Reading from memory and loading into ia resp. ib.
    auto read_a = constrained_read_from_memory(call_ptr, clk, resolved_a, in_tag, in_tag, IntermRegister::IA);
    auto read_b = constrained_read_from_memory(call_ptr, clk, resolved_b, in_tag, in_tag, IntermRegister::IB);

    bool tag_match = read_a.tag_match && read_b.tag_match;
    // No need to add check_tag_integral(read_b.tag) as this follows from tag matching and that a has integral tag.
    if (is_ok(error) && !(tag_match && check_tag_integral(read_a.tag))) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    FF a = tag_match ? read_a.val : FF(0);
    FF b = tag_match ? read_b.val : FF(0);

    FF c = is_ok(error) ? bin_trace_builder.op_or(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    auto write_c = constrained_write_to_memory(call_ptr, clk, resolved_c, c, in_tag, in_tag, IntermRegister::IC);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::OR_8);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_bin_op_id = FF(1),
        .main_call_ptr = call_ptr,
        .main_ia = read_a.val,
        .main_ib = read_b.val,
        .main_ic = write_c.val,
        .main_ind_addr_a = FF(read_a.indirect_address),
        .main_ind_addr_b = FF(read_b.indirect_address),
        .main_ind_addr_c = FF(write_c.indirect_address),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_a = FF(read_a.direct_address),
        .main_mem_addr_b = FF(read_b.direct_address),
        .main_mem_addr_c = FF(write_c.direct_address),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_rwc = FF(1),
        .main_sel_bin = FF(static_cast<uint32_t>(is_ok(error))),
        .main_sel_mem_op_a = FF(1),
        .main_sel_mem_op_b = FF(1),
        .main_sel_mem_op_c = FF(1),
        .main_sel_op_or = FF(1),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
        .main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(read_b.is_indirect)),
        .main_sel_resolve_ind_addr_c = FF(static_cast<uint32_t>(write_c.is_indirect)),
        .main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .main_w_in_tag = FF(static_cast<uint32_t>(in_tag)),
    });

    ASSERT(op_code == OpCode::OR_8 || op_code == OpCode::OR_16);
    pc += Deserialization::get_pc_increment(op_code);
    return error;
}

AvmError AvmTraceBuilder::op_xor(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] =
        Addressing<3>::fromWire(indirect, call_ptr).resolve({ a_offset, b_offset, dst_offset }, mem_trace_builder);
    auto [resolved_a, resolved_b, resolved_c] = resolved_addrs;
    error = res_error;

    // We get our representative memory tag from the resolved_a memory address.
    AvmMemoryTag in_tag = unconstrained_get_memory_tag(resolved_a);
    // Reading from memory and loading into ia resp. ib.
    auto read_a = constrained_read_from_memory(call_ptr, clk, resolved_a, in_tag, in_tag, IntermRegister::IA);
    auto read_b = constrained_read_from_memory(call_ptr, clk, resolved_b, in_tag, in_tag, IntermRegister::IB);

    bool tag_match = read_a.tag_match && read_b.tag_match;
    // No need to add check_tag_integral(read_b.tag) as this follows from tag matching and that a has integral tag.
    if (is_ok(error) && !(tag_match && check_tag_integral(read_a.tag))) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    FF a = tag_match ? read_a.val : FF(0);
    FF b = tag_match ? read_b.val : FF(0);

    FF c = is_ok(error) ? bin_trace_builder.op_xor(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    auto write_c = constrained_write_to_memory(call_ptr, clk, resolved_c, c, in_tag, in_tag, IntermRegister::IC);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::XOR_8);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_bin_op_id = FF(2),
        .main_call_ptr = call_ptr,
        .main_ia = read_a.val,
        .main_ib = read_b.val,
        .main_ic = write_c.val,
        .main_ind_addr_a = FF(read_a.indirect_address),
        .main_ind_addr_b = FF(read_b.indirect_address),
        .main_ind_addr_c = FF(write_c.indirect_address),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_a = FF(read_a.direct_address),
        .main_mem_addr_b = FF(read_b.direct_address),
        .main_mem_addr_c = FF(write_c.direct_address),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_rwc = FF(1),
        .main_sel_bin = FF(static_cast<uint32_t>(is_ok(error))),
        .main_sel_mem_op_a = FF(1),
        .main_sel_mem_op_b = FF(1),
        .main_sel_mem_op_c = FF(1),
        .main_sel_op_xor = FF(1),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
        .main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(read_b.is_indirect)),
        .main_sel_resolve_ind_addr_c = FF(static_cast<uint32_t>(write_c.is_indirect)),
        .main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .main_w_in_tag = FF(static_cast<uint32_t>(in_tag)),
    });

    ASSERT(op_code == OpCode::XOR_8 || op_code == OpCode::XOR_16);
    pc += Deserialization::get_pc_increment(op_code);
    return error;
}

/**
 * @brief Bitwise not with direct or indirect memory access.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param a_offset An index in memory pointing to the only operand of Not.
 * @param dst_offset An index in memory pointing to the output of Not.
 */
AvmError AvmTraceBuilder::op_not(uint8_t indirect, uint32_t a_offset, uint32_t dst_offset, OpCode op_code)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    // Resolve any potential indirects in the order they are encoded in the indirect byte.
    auto [resolved_addrs, res_error] =
        Addressing<2>::fromWire(indirect, call_ptr).resolve({ a_offset, dst_offset }, mem_trace_builder);
    auto [resolved_a, resolved_c] = resolved_addrs;
    error = res_error;

    // We get our representative memory tag from the resolved_a memory address.
    AvmMemoryTag in_tag = unconstrained_get_memory_tag(resolved_a);
    // Reading from memory and loading into ia
    auto read_a = constrained_read_from_memory(call_ptr, clk, resolved_a, in_tag, in_tag, IntermRegister::IA);

    if (is_ok(error) && !check_tag_integral(read_a.tag)) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    // ~a = c
    FF a = read_a.val;

    // In case of an error (tag of type FF), we do not perform the computation.
    // Therefore, we do not create any entry in ALU table and store the value 0 as
    // output (c) in memory.
    FF c = is_ok(error) ? alu_trace_builder.op_not(a, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    auto write_c = constrained_write_to_memory(call_ptr, clk, resolved_c, c, in_tag, in_tag, IntermRegister::IC);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::NOT_8);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_alu_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_call_ptr = call_ptr,
        .main_ia = read_a.val,
        .main_ic = write_c.val,
        .main_ind_addr_a = FF(read_a.indirect_address),
        .main_ind_addr_c = FF(write_c.indirect_address),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_a = FF(read_a.direct_address),
        .main_mem_addr_c = FF(write_c.direct_address),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_rwc = FF(1),
        .main_sel_mem_op_a = FF(1),
        .main_sel_mem_op_c = FF(1),
        .main_sel_op_not = FF(1),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
        .main_sel_resolve_ind_addr_c = FF(static_cast<uint32_t>(write_c.is_indirect)),
        .main_w_in_tag = FF(static_cast<uint32_t>(in_tag)),
    });

    ASSERT(op_code == OpCode::NOT_8 || op_code == OpCode::NOT_16);
    pc += Deserialization::get_pc_increment(op_code);
    return error;
}

AvmError AvmTraceBuilder::op_shl(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] =
        Addressing<3>::fromWire(indirect, call_ptr).resolve({ a_offset, b_offset, dst_offset }, mem_trace_builder);
    auto [resolved_a, resolved_b, resolved_c] = resolved_addrs;
    error = res_error;

    // We get our representative memory tag from the resolved_a memory address.
    AvmMemoryTag in_tag = unconstrained_get_memory_tag(resolved_a);
    // Reading from memory and loading into ia resp. ib.
    auto read_a = constrained_read_from_memory(call_ptr, clk, resolved_a, in_tag, in_tag, IntermRegister::IA);
    // TODO(8603): once instructions can have multiple different tags for reads, constrain b's read & tag
    // auto read_b = constrained_read_from_memory(call_ptr, clk, resolved_b, AvmMemoryTag::U8, AvmMemoryTag::U8,
    // IntermRegister::IB); bool tag_match = read_a.tag_match && read_b.tag_match;
    auto read_b = unconstrained_read_from_memory(resolved_b);

    if (is_ok(error) && !(check_tag_integral(read_a.tag) && check_tag(AvmMemoryTag::U8, resolved_b))) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    FF a = is_ok(error) ? read_a.val : FF(0);
    FF b = is_ok(error) ? read_b : FF(0);

    FF c = is_ok(error) ? alu_trace_builder.op_shl(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    auto write_c = constrained_write_to_memory(call_ptr, clk, resolved_c, c, in_tag, in_tag, IntermRegister::IC);
    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::SHL_8);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_alu_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_call_ptr = call_ptr,
        .main_ia = read_a.val,
        .main_ib = read_b,
        .main_ic = write_c.val,
        .main_ind_addr_a = FF(read_a.indirect_address),
        //.main_ind_addr_b = FF(read_b.indirect_address),
        .main_ind_addr_c = FF(write_c.indirect_address),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_a = FF(read_a.direct_address),
        //.main_mem_addr_b = FF(read_b.direct_address),
        .main_mem_addr_c = FF(write_c.direct_address),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_rwc = FF(1),
        .main_sel_mem_op_a = FF(1),
        //.main_sel_mem_op_b = FF(1),
        .main_sel_mem_op_c = FF(1),
        .main_sel_op_shl = FF(1),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
        //.main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(read_b.is_indirect)),
        .main_sel_resolve_ind_addr_c = FF(static_cast<uint32_t>(write_c.is_indirect)),
        .main_w_in_tag = FF(static_cast<uint32_t>(in_tag)),
    });

    ASSERT(op_code == OpCode::SHL_8 || op_code == OpCode::SHL_16);
    pc += Deserialization::get_pc_increment(op_code);
    return error;
}

AvmError AvmTraceBuilder::op_shr(
    uint8_t indirect, uint32_t a_offset, uint32_t b_offset, uint32_t dst_offset, OpCode op_code)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] =
        Addressing<3>::fromWire(indirect, call_ptr).resolve({ a_offset, b_offset, dst_offset }, mem_trace_builder);
    auto [resolved_a, resolved_b, resolved_c] = resolved_addrs;
    error = res_error;

    // We get our representative memory tag from the resolved_a memory address.
    AvmMemoryTag in_tag = unconstrained_get_memory_tag(resolved_a);
    // Reading from memory and loading into ia resp. ib.
    auto read_a = constrained_read_from_memory(call_ptr, clk, resolved_a, in_tag, in_tag, IntermRegister::IA);
    // TODO(8603): once instructions can have multiple different tags for reads, constrain b's read & tag
    // auto read_b = constrained_read_from_memory(call_ptr, clk, resolved_b, AvmMemoryTag::U8, AvmMemoryTag::U8,
    // IntermRegister::IB); bool tag_match = read_a.tag_match && read_b.tag_match;
    auto read_b = unconstrained_read_from_memory(resolved_b);
    if (is_ok(error) && !(check_tag_integral(read_a.tag) && check_tag(AvmMemoryTag::U8, resolved_b))) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    FF a = is_ok(error) ? read_a.val : FF(0);
    FF b = is_ok(error) ? read_b : FF(0);

    FF c = is_ok(error) ? alu_trace_builder.op_shr(a, b, in_tag, clk) : FF(0);

    // Write into memory value c from intermediate register ic.
    auto write_c = constrained_write_to_memory(call_ptr, clk, resolved_c, c, in_tag, in_tag, IntermRegister::IC);
    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::SHR_8);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_alu_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_call_ptr = call_ptr,
        .main_ia = read_a.val,
        .main_ib = read_b,
        .main_ic = write_c.val,
        .main_ind_addr_a = FF(read_a.indirect_address),
        // TODO(8603): uncomment
        //.main_ind_addr_b = FF(read_b.indirect_address),
        .main_ind_addr_c = FF(write_c.indirect_address),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_a = FF(read_a.direct_address),
        // TODO(8603): uncomment
        //.main_mem_addr_b = FF(read_b.direct_address),
        .main_mem_addr_c = FF(write_c.direct_address),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_r_in_tag = FF(static_cast<uint32_t>(in_tag)),
        .main_rwc = FF(1),
        .main_sel_mem_op_a = FF(1),
        // TODO(8603): uncomment
        //.main_sel_mem_op_b = FF(1),
        .main_sel_mem_op_c = FF(1),
        .main_sel_op_shr = FF(1),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
        // TODO(8603): uncomment
        //.main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(read_b.is_indirect)),
        .main_sel_resolve_ind_addr_c = FF(static_cast<uint32_t>(write_c.is_indirect)),
        .main_w_in_tag = FF(static_cast<uint32_t>(in_tag)),
    });

    ASSERT(op_code == OpCode::SHR_8 || op_code == OpCode::SHR_16);
    pc += Deserialization::get_pc_increment(op_code);
    return error;
}

/**************************************************************************************************
 *                            COMPUTE - TYPE CONVERSIONS
 **************************************************************************************************/

/**
 * @brief Cast an element pointed by the address a_offset into type specified by dst_tag and
          store the result in address given by dst_offset.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param a_offset Offset of source memory cell.
 * @param dst_offset Offset of destination memory cell.
 * @param dst_tag Destination tag specifying the type the source value must be casted to.
 */
AvmError AvmTraceBuilder::op_cast(
    uint8_t indirect, uint32_t a_offset, uint32_t dst_offset, AvmMemoryTag dst_tag, OpCode op_code)
{
    auto const clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] =
        Addressing<2>::fromWire(indirect, call_ptr).resolve({ a_offset, dst_offset }, mem_trace_builder);
    auto [resolved_a, resolved_c] = resolved_addrs;

    // Reading from memory and loading into ia
    // There cannot be any tag error in this case.
    auto memEntry = mem_trace_builder.read_and_load_cast_opcode(call_ptr, clk, resolved_a, dst_tag);
    FF a = memEntry.val;

    // Therefore, we do not create any entry in ALU table and store the value 0 as
    // output (c) in memory.
    FF c = alu_trace_builder.op_cast(a, dst_tag, clk);

    // Write into memory value c from intermediate register ic.
    mem_trace_builder.write_into_memory(call_ptr, clk, IntermRegister::IC, resolved_c, c, memEntry.tag, dst_tag);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::CAST_8);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_alu_in_tag = FF(static_cast<uint32_t>(dst_tag)),
        .main_call_ptr = call_ptr,
        .main_ia = a,
        .main_ic = c,
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_a = FF(resolved_a),
        .main_mem_addr_c = FF(resolved_c),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(res_error))),
        .main_pc = FF(pc),
        .main_r_in_tag = FF(static_cast<uint32_t>(memEntry.tag)),
        .main_rwc = FF(1),
        .main_sel_mem_op_a = FF(1),
        .main_sel_mem_op_c = FF(1),
        .main_sel_op_cast = FF(1),
        .main_w_in_tag = FF(static_cast<uint32_t>(dst_tag)),
    });

    ASSERT(op_code == OpCode::CAST_8 || op_code == OpCode::CAST_16);
    pc += Deserialization::get_pc_increment(op_code);
    return res_error;
}

/**************************************************************************************************
 *                            EXECUTION ENVIRONMENT
 **************************************************************************************************/

// Helper function to add kernel lookup operations into the main trace
// TODO: add tag match to kernel_input_lookup opcodes to - it isnt written to - -ve test would catch
/**
 * @brief Create a kernel lookup opcode object
 *
 * Used for looking up into the kernel inputs (context) - {caller, address, etc.}
 *
 * @param indirect - Perform indirect memory resolution
 * @param dst_offset - Memory address to write the lookup result to
 * @param value - The value read from the memory address
 * @param w_tag - The memory tag of the value read
 * @return RowWithError
 */
RowWithError AvmTraceBuilder::create_kernel_lookup_opcode(uint8_t indirect,
                                                          uint32_t dst_offset,
                                                          FF value,
                                                          AvmMemoryTag w_tag)
{
    auto const clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] =
        Addressing<1>::fromWire(indirect, call_ptr).resolve({ dst_offset }, mem_trace_builder);
    auto [resolved_dst] = resolved_addrs;

    auto write_dst =
        constrained_write_to_memory(call_ptr, clk, resolved_dst, value, AvmMemoryTag::FF, w_tag, IntermRegister::IA);

    return RowWithError{ .row =
                             Row{
                                 .main_clk = clk,
                                 .main_call_ptr = call_ptr,
                                 .main_ia = value,
                                 .main_ind_addr_a = FF(write_dst.indirect_address),
                                 .main_internal_return_ptr = internal_return_ptr,
                                 .main_mem_addr_a = FF(write_dst.direct_address),
                                 .main_op_err = FF(static_cast<uint32_t>(!is_ok(res_error))),
                                 .main_pc = pc,
                                 .main_rwa = 1,
                                 .main_sel_mem_op_a = 1,
                                 .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(write_dst.is_indirect)),
                                 .main_tag_err = FF(static_cast<uint32_t>(!write_dst.tag_match)),
                                 .main_w_in_tag = static_cast<uint32_t>(w_tag),
                             },
                         .error = res_error };
}

AvmError AvmTraceBuilder::op_get_env_var(uint8_t indirect, uint32_t dst_offset, uint8_t env_var)
{
    if (env_var >= static_cast<int>(EnvironmentVariable::MAX_ENV_VAR)) {
        // Error, bad enum operand
        // TODO(9395): constrain this via range check
        auto const clk = static_cast<uint32_t>(main_trace.size()) + 1;
        const auto row = Row{
            .main_clk = clk,
            .main_call_ptr = call_ptr,
            .main_internal_return_ptr = internal_return_ptr,
            .main_op_err = FF(1),
            .main_pc = pc,
            .main_sel_op_address = FF(1), // TODO(9407): what selector should this be?
        };

        // Constrain gas cost
        gas_trace_builder.constrain_gas(static_cast<uint32_t>(row.main_clk), OpCode::GETENVVAR_16);
        main_trace.push_back(row);
        return AvmError::ENV_VAR_UNKNOWN;
    } else {
        EnvironmentVariable var = static_cast<EnvironmentVariable>(env_var);
        AvmError error = AvmError::NO_ERROR;

        switch (var) {
        case EnvironmentVariable::ADDRESS:
            error = op_address(indirect, dst_offset);
            break;
        case EnvironmentVariable::SENDER:
            error = op_sender(indirect, dst_offset);
            break;
        case EnvironmentVariable::TRANSACTIONFEE:
            error = op_transaction_fee(indirect, dst_offset);
            break;
        case EnvironmentVariable::CHAINID:
            error = op_chain_id(indirect, dst_offset);
            break;
        case EnvironmentVariable::VERSION:
            error = op_version(indirect, dst_offset);
            break;
        case EnvironmentVariable::BLOCKNUMBER:
            error = op_block_number(indirect, dst_offset);
            break;
        case EnvironmentVariable::TIMESTAMP:
            error = op_timestamp(indirect, dst_offset);
            break;
        case EnvironmentVariable::FEEPERL2GAS:
            error = op_fee_per_l2_gas(indirect, dst_offset);
            break;
        case EnvironmentVariable::FEEPERDAGAS:
            error = op_fee_per_da_gas(indirect, dst_offset);
            break;
        case EnvironmentVariable::ISSTATICCALL:
            error = op_is_static_call(indirect, dst_offset);
            break;
        case EnvironmentVariable::L2GASLEFT:
            error = op_l2gasleft(indirect, dst_offset);
            break;
        case EnvironmentVariable::DAGASLEFT:
            error = op_dagasleft(indirect, dst_offset);
            break;
        default:
            // Cannot happen thanks to the first if clause. This is to make the compiler happy.
            throw std::runtime_error("Invalid environment variable");
            break;
        }
        pc += Deserialization::get_pc_increment(OpCode::GETENVVAR_16);
        return error;
    }
}

AvmError AvmTraceBuilder::op_address(uint8_t indirect, uint32_t dst_offset)
{
    FF ia_value = this->current_ext_call_ctx.contract_address;

    auto [row, error] = create_kernel_lookup_opcode(indirect, dst_offset, ia_value, AvmMemoryTag::FF);
    row.main_sel_op_address = FF(1);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(static_cast<uint32_t>(row.main_clk), OpCode::GETENVVAR_16);

    main_trace.push_back(row);
    return error;
}

AvmError AvmTraceBuilder::op_sender(uint8_t indirect, uint32_t dst_offset)
{
    FF ia_value = this->current_public_call_request.msg_sender;
    auto [row, error] = create_kernel_lookup_opcode(indirect, dst_offset, ia_value, AvmMemoryTag::FF);
    row.main_sel_op_sender = FF(1);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(static_cast<uint32_t>(row.main_clk), OpCode::GETENVVAR_16);

    main_trace.push_back(row);
    return error;
}

AvmError AvmTraceBuilder::op_transaction_fee(uint8_t indirect, uint32_t dst_offset)
{
    FF ia_value = public_inputs.transaction_fee;
    auto [row, error] = create_kernel_lookup_opcode(indirect, dst_offset, ia_value, AvmMemoryTag::FF);
    row.main_sel_op_transaction_fee = FF(1);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(static_cast<uint32_t>(row.main_clk), OpCode::GETENVVAR_16);

    main_trace.push_back(row);
    return error;
}

AvmError AvmTraceBuilder::op_is_static_call(uint8_t indirect, uint32_t dst_offset)
{
    FF ia_value = this->current_public_call_request.is_static_call;
    auto [row, error] = create_kernel_lookup_opcode(indirect, dst_offset, ia_value, AvmMemoryTag::FF);
    row.main_sel_op_is_static_call = FF(1);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(static_cast<uint32_t>(row.main_clk), OpCode::GETENVVAR_16);

    main_trace.push_back(row);
    return error;
}

/**************************************************************************************************
 *                            EXECUTION ENVIRONMENT - GLOBALS
 **************************************************************************************************/

AvmError AvmTraceBuilder::op_chain_id(uint8_t indirect, uint32_t dst_offset)
{
    FF ia_value = public_inputs.global_variables.chain_id;
    auto [row, error] = create_kernel_lookup_opcode(indirect, dst_offset, ia_value, AvmMemoryTag::FF);
    row.main_sel_op_chain_id = FF(1);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(static_cast<uint32_t>(row.main_clk), OpCode::GETENVVAR_16);

    main_trace.push_back(row);
    return error;
}

AvmError AvmTraceBuilder::op_version(uint8_t indirect, uint32_t dst_offset)
{
    FF ia_value = public_inputs.global_variables.version;
    auto [row, error] = create_kernel_lookup_opcode(indirect, dst_offset, ia_value, AvmMemoryTag::FF);
    row.main_sel_op_version = FF(1);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(static_cast<uint32_t>(row.main_clk), OpCode::GETENVVAR_16);

    main_trace.push_back(row);
    return error;
}

AvmError AvmTraceBuilder::op_block_number(uint8_t indirect, uint32_t dst_offset)
{
    FF ia_value = public_inputs.global_variables.block_number;
    auto [row, error] = create_kernel_lookup_opcode(indirect, dst_offset, ia_value, AvmMemoryTag::FF);
    row.main_sel_op_block_number = FF(1);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(static_cast<uint32_t>(row.main_clk), OpCode::GETENVVAR_16);

    main_trace.push_back(row);
    return error;
}

AvmError AvmTraceBuilder::op_timestamp(uint8_t indirect, uint32_t dst_offset)
{
    FF ia_value = public_inputs.global_variables.timestamp;
    auto [row, error] = create_kernel_lookup_opcode(indirect, dst_offset, ia_value, AvmMemoryTag::U64);
    row.main_sel_op_timestamp = FF(1);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(static_cast<uint32_t>(row.main_clk), OpCode::GETENVVAR_16);

    main_trace.push_back(row);
    return error;
}

AvmError AvmTraceBuilder::op_fee_per_l2_gas(uint8_t indirect, uint32_t dst_offset)
{
    FF ia_value = public_inputs.global_variables.gas_fees.fee_per_l2_gas;
    auto [row, error] = create_kernel_lookup_opcode(indirect, dst_offset, ia_value, AvmMemoryTag::FF);
    row.main_sel_op_fee_per_l2_gas = FF(1);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(static_cast<uint32_t>(row.main_clk), OpCode::GETENVVAR_16);

    main_trace.push_back(row);
    return error;
}

AvmError AvmTraceBuilder::op_fee_per_da_gas(uint8_t indirect, uint32_t dst_offset)
{
    FF ia_value = public_inputs.global_variables.gas_fees.fee_per_da_gas;
    auto [row, error] = create_kernel_lookup_opcode(indirect, dst_offset, ia_value, AvmMemoryTag::FF);
    row.main_sel_op_fee_per_da_gas = FF(1);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(static_cast<uint32_t>(row.main_clk), OpCode::GETENVVAR_16);

    main_trace.push_back(row);
    return error;
}

/**************************************************************************************************
 *                            EXECUTION ENVIRONMENT - CALLDATA
 **************************************************************************************************/

/**
 * @brief CALLDATACOPY opcode with direct or indirect memory access, i.e.,
 *        direct: M[dst_offset:dst_offset+copy_size] = calldata[cd_offset:cd_offset+copy_size]
 *        indirect: M[M[dst_offset]:M[dst_offset]+copy_size] = calldata[cd_offset:cd_offset+copy_size]
 *        Simplified version with exclusively memory store operations and
 *        values from calldata passed by an array and loaded into
 *        intermediate registers.
 *        Assume that caller passes call_data_mem which is large enough so that
 *        no out-of-bound memory issues occur.
 *        TODO: error handling if dst_offset + copy_size > 2^32 which would lead to
 *              out-of-bound memory write. Similarly, if cd_offset + copy_size is larger
 *              than call_data_mem.size()
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param cd_offset_address The starting index of the region in calldata to be copied.
 * @param copy_size_offset The number of finite field elements to be copied into memory.
 * @param dst_offset The starting index of memory where calldata will be copied to.
 */
AvmError AvmTraceBuilder::op_calldata_copy(uint8_t indirect,
                                           uint32_t cd_offset_address,
                                           uint32_t copy_size_offset,
                                           uint32_t dst_offset)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] =
        Addressing<3>::fromWire(indirect, call_ptr)
            .resolve({ cd_offset_address, copy_size_offset, dst_offset }, mem_trace_builder);
    auto [cd_offset_resolved, copy_size_offset_resolved, dst_offset_resolved] = resolved_addrs;
    error = res_error;

    // This boolean will not be a trivial constant anymore once we constrain address resolution.
    bool tag_match = true;
    if (is_ok(error) && !(check_tag(AvmMemoryTag::U32, cd_offset_resolved) &&
                          check_tag(AvmMemoryTag::U32, copy_size_offset_resolved))) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    // TODO: constrain these.
    const uint32_t cd_offset = static_cast<uint32_t>(unconstrained_read_from_memory(cd_offset_resolved));
    const uint32_t copy_size = static_cast<uint32_t>(unconstrained_read_from_memory(copy_size_offset_resolved));

    // If the context_id == 0, then we are at the top level call so we read/write to a trace column
    bool is_top_level = current_ext_call_ctx.context_id == 0;

    auto calldata = current_ext_call_ctx.calldata;
    if (is_ok(error)) {
        if (is_top_level) {
            slice_trace_builder.create_calldata_copy_slice(
                calldata, clk, call_ptr, cd_offset, copy_size, dst_offset_resolved);
            mem_trace_builder.write_calldata_copy(calldata, clk, call_ptr, cd_offset, copy_size, dst_offset_resolved);
        } else {
            // If we are not at the top level, we write to memory directly
            write_slice_to_memory(dst_offset_resolved, AvmMemoryTag::FF, calldata);
        }
    }

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::CALLDATACOPY, copy_size);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_call_ptr = call_ptr,
        .main_ia = cd_offset,
        .main_ib = copy_size,
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_c = dst_offset_resolved,
        .main_op_err = static_cast<uint32_t>(!is_ok(error)),
        .main_pc = pc,
        .main_r_in_tag = static_cast<uint32_t>(AvmMemoryTag::FF),
        .main_sel_op_calldata_copy = FF(1),
        .main_sel_slice_gadget = static_cast<uint32_t>(is_top_level && is_ok(error)),
        .main_tag_err = static_cast<uint32_t>(!tag_match),
        .main_w_in_tag = static_cast<uint32_t>(AvmMemoryTag::FF),
    });

    pc += Deserialization::get_pc_increment(OpCode::CALLDATACOPY);
    return error;
}

AvmError AvmTraceBuilder::op_returndata_size(uint8_t indirect, uint32_t dst_offset)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto const clk = static_cast<uint32_t>(main_trace.size()) + 1;
    // This boolean will not be a trivial constant anymore once we constrain address resolution.
    bool tag_match = true;

    auto [resolved_addrs, res_error] =
        Addressing<1>::fromWire(indirect, call_ptr).resolve({ dst_offset }, mem_trace_builder);
    auto [resolved_dst_offset] = resolved_addrs;
    error = res_error;

    if (is_ok(error) && !tag_match) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    FF returndata_size = tag_match ? FF(current_ext_call_ctx.nested_returndata.size()) : FF(0);
    // TODO: constrain
    write_to_memory(resolved_dst_offset, returndata_size, AvmMemoryTag::U32);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::RETURNDATASIZE);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_call_ptr = call_ptr,
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_sel_op_returndata_size = FF(1),
        .main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
        .main_w_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::U32)),
    });

    pc += Deserialization::get_pc_increment(OpCode::RETURNDATASIZE);
    return error;
}

AvmError AvmTraceBuilder::op_returndata_copy(uint8_t indirect,
                                             uint32_t rd_offset_address,
                                             uint32_t copy_size_offset,
                                             uint32_t dst_offset)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] =
        Addressing<3>::fromWire(indirect, call_ptr)
            .resolve({ rd_offset_address, copy_size_offset, dst_offset }, mem_trace_builder);
    auto [rd_offset_resolved, copy_size_offset_resolved, dst_offset_resolved] = resolved_addrs;
    error = res_error;

    // This boolean will not be a trivial constant anymore once we constrain address resolution.
    bool tag_match = true;
    if (is_ok(error) && !(check_tag(AvmMemoryTag::U32, rd_offset_resolved) &&
                          check_tag(AvmMemoryTag::U32, copy_size_offset_resolved))) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    // TODO: constrain these.
    const uint32_t rd_offset = static_cast<uint32_t>(unconstrained_read_from_memory(rd_offset_resolved));
    const uint32_t copy_size = static_cast<uint32_t>(unconstrained_read_from_memory(copy_size_offset_resolved));

    gas_trace_builder.constrain_gas(clk,
                                    OpCode::RETURNDATACOPY,
                                    /*dyn_gas_multiplier=*/copy_size);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_op_err = static_cast<uint32_t>(!is_ok(error)),
        .main_pc = FF(pc),
        .main_sel_op_returndata_copy = FF(1),
        .main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
    });

    if (is_ok(error)) {
        // Write the return data to memory
        // TODO: validate bounds
        auto returndata_slice = std::vector(current_ext_call_ctx.nested_returndata.begin() + rd_offset,
                                            current_ext_call_ctx.nested_returndata.begin() + rd_offset + copy_size);

        pc += Deserialization::get_pc_increment(OpCode::RETURNDATACOPY);

        // Crucial to perform this operation after having incremented pc because write_slice_to_memory
        // is implemented with opcodes (SET and JUMP).
        write_slice_to_memory(dst_offset_resolved, AvmMemoryTag::FF, returndata_slice);
    }
    return error;
}

/**************************************************************************************************
 *                            MACHINE STATE - GAS
 **************************************************************************************************/

// Helper for "gas left" related opcodes
AvmError AvmTraceBuilder::execute_gasleft(EnvironmentVariable var, uint8_t indirect, uint32_t dst_offset)
{
    ASSERT(var == EnvironmentVariable::L2GASLEFT || var == EnvironmentVariable::DAGASLEFT);

    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] =
        Addressing<1>::fromWire(indirect, call_ptr).resolve({ dst_offset }, mem_trace_builder);
    auto [resolved_dst] = resolved_addrs;

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::GETENVVAR_16);

    uint32_t gas_remaining = 0;

    if (var == EnvironmentVariable::L2GASLEFT) {
        gas_remaining = gas_trace_builder.get_l2_gas_left();
    } else {
        gas_remaining = gas_trace_builder.get_da_gas_left();
    }

    // Write into memory from intermediate register ia.
    // TODO: probably will be U32 in final version
    auto write_dst = constrained_write_to_memory(
        call_ptr, clk, resolved_dst, gas_remaining, AvmMemoryTag::FF, AvmMemoryTag::FF, IntermRegister::IA);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_call_ptr = call_ptr,
        .main_ia = gas_remaining,
        .main_ind_addr_a = FF(write_dst.indirect_address),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_a = FF(write_dst.direct_address),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(res_error))),
        .main_pc = FF(pc),
        .main_rwa = FF(1),
        .main_sel_mem_op_a = FF(1),
        .main_sel_op_dagasleft = (var == EnvironmentVariable::DAGASLEFT) ? FF(1) : FF(0),
        .main_sel_op_l2gasleft = (var == EnvironmentVariable::L2GASLEFT) ? FF(1) : FF(0),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(write_dst.is_indirect)),
        .main_tag_err = FF(static_cast<uint32_t>(!write_dst.tag_match)),
        .main_w_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::FF)), // TODO: probably will be U32 in final version
                                                                      // Should the circuit (pil) constrain U32?
    });
    return res_error;
}

AvmError AvmTraceBuilder::op_l2gasleft(uint8_t indirect, uint32_t dst_offset)
{
    return execute_gasleft(EnvironmentVariable::L2GASLEFT, indirect, dst_offset);
}

AvmError AvmTraceBuilder::op_dagasleft(uint8_t indirect, uint32_t dst_offset)
{
    return execute_gasleft(EnvironmentVariable::DAGASLEFT, indirect, dst_offset);
}

/**************************************************************************************************
 *                            MACHINE STATE - INTERNAL CONTROL FLOW
 **************************************************************************************************/

/**
 * @brief JUMP OPCODE
 *        Jumps to a new `jmp_dest`
 *        This function must:
 *          - Set the next program counter to the provided `jmp_dest`.
 *
 * @param jmp_dest - The destination to jump to
 */
AvmError AvmTraceBuilder::op_jump(uint32_t jmp_dest, bool skip_gas)
{
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    // Constrain gas cost
    if (!skip_gas) {
        gas_trace_builder.constrain_gas(clk, OpCode::JUMP_32);
    }

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_call_ptr = call_ptr,
        .main_ia = FF(jmp_dest),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_pc = FF(pc),
        .main_sel_op_jump = FF(1),
    });

    // Adjust parameters for the next row
    pc = jmp_dest;
    return AvmError::NO_ERROR;
}

/**
 * @brief JUMPI OPCODE
 *        Jumps to a new `jmp_dest` if M[cond_offset] > 0
 *        This function sets the next program counter to the provided `jmp_dest` if condition > 0.
 *        Otherwise, program counter is incremented.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param cond_offset Offset of the condition
 * @param jmp_dest The destination to jump to
 */
AvmError AvmTraceBuilder::op_jumpi(uint8_t indirect, uint32_t cond_offset, uint32_t jmp_dest)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    // Will be a non-trivial constant once we constrain address resolution
    bool tag_match = true;

    auto [resolved_addrs, res_error] =
        Addressing<1>::fromWire(indirect, call_ptr).resolve({ cond_offset }, mem_trace_builder);
    auto [resolved_cond_offset] = resolved_addrs;
    error = res_error;

    if (is_ok(error) && !tag_match) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    // Specific JUMPI loading of conditional value into intermediate register id without any tag constraint.
    auto read_d = mem_trace_builder.read_and_load_jumpi_opcode(call_ptr, clk, resolved_cond_offset);

    const bool id_zero = read_d.val == 0;
    FF const inv = !id_zero ? read_d.val.invert() : 1;
    uint32_t next_pc = !id_zero ? jmp_dest : pc + Deserialization::get_pc_increment(OpCode::JUMPI_32);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::JUMPI_32);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_call_ptr = call_ptr,
        .main_ia = FF(next_pc),
        .main_id = read_d.val,
        .main_id_zero = static_cast<uint32_t>(id_zero),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_inv = inv,
        .main_mem_addr_d = resolved_cond_offset,
        .main_op_err = static_cast<uint32_t>(!is_ok(error)),
        .main_pc = FF(pc),
        .main_r_in_tag = static_cast<uint32_t>(read_d.tag),
        .main_sel_mem_op_d = 1,
        .main_sel_op_jumpi = FF(1),
        .main_tag_err = static_cast<uint32_t>(!tag_match),
        .main_w_in_tag = static_cast<uint32_t>(read_d.tag),
    });

    // Adjust parameters for the next row
    pc = next_pc;
    return error;
}

/**
 * @brief INTERNAL_CALL OPCODE
 *        This opcode effectively jumps to a new `jmp_dest` and stores the return program counter
 *        (current program counter + 1) onto a call stack.
 *        This function must:
 *          - Set the next program counter to the provided `jmp_dest`.
 *          - Store the current `pc` + 1 onto the call stack
 *
 * @param jmp_dest - The destination to jump to
 */
AvmError AvmTraceBuilder::op_internal_call(uint32_t jmp_dest)
{
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;
    const auto next_pc = pc + Deserialization::get_pc_increment(OpCode::INTERNALCALL);
    // We store the next instruction as the return location
    debug("Writing return ptr: ", internal_return_ptr);
    // We push the next pc onto the internal return stack of the current context
    current_ext_call_ctx.internal_return_ptr_stack.emplace(next_pc);
    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::INTERNALCALL);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_call_ptr = call_ptr,
        .main_ia = FF(jmp_dest),
        .main_ib = FF(next_pc),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_pc = FF(pc),
        .main_sel_op_internal_call = FF(1),
    });

    // Adjust parameters for the next row
    pc = jmp_dest;
    return AvmError::NO_ERROR;
}

/**
 * @brief INTERNAL_RETURN OPCODE
 *        The opcode returns from an internal call.
 *        This function must:
 *          - Read the return location from the internal call stack
 *          - Set the next program counter to the return location
 *
 *  TODO(https://github.com/AztecProtocol/aztec-packages/issues/3740): This function MUST come after a call
 * instruction.
 */
AvmError AvmTraceBuilder::op_internal_return()
{
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    // We pop the return location from the internal return stack of the current context
    uint32_t next_pc = current_ext_call_ctx.internal_return_ptr_stack.top();
    current_ext_call_ctx.internal_return_ptr_stack.pop();

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::INTERNALRETURN);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_call_ptr = call_ptr,
        .main_ia = next_pc,
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_pc = pc,
        .main_sel_op_internal_return = FF(1),
    });

    pc = next_pc;
    return AvmError::NO_ERROR;
}

/**************************************************************************************************
 *                            MACHINE STATE - MEMORY
 **************************************************************************************************/

// TODO: Ensure that the bytecode validation and/or deserialization is
//       enforcing that val complies to the tag.
/**
 * @brief Set a constant from bytecode with direct or indirect memory access.
 *        SET opcode is implemented purely as a memory operation. As val is a
 *        constant passed in the bytecode, the deserialization layer or bytecode
 *        validation circuit is enforcing that the constant complies to in_tag.
 *        Therefore, no range check is required as part of this opcode relation.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param dst_offset Memory destination offset where val is written to
 * @param in_tag The instruction memory tag
 */
AvmError AvmTraceBuilder::op_set(
    uint8_t indirect, FF val, uint32_t dst_offset, AvmMemoryTag in_tag, OpCode op_code, bool skip_gas)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    const auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] =
        Addressing<1>::fromWire(indirect, call_ptr).resolve({ dst_offset }, mem_trace_builder);
    auto [resolved_dst_offset] = resolved_addrs;
    error = res_error;

    auto write_c = constrained_write_to_memory(
        call_ptr, clk, resolved_dst_offset, val, AvmMemoryTag::FF, in_tag, IntermRegister::IC);

    if (is_ok(error) && !write_c.tag_match) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    // Constrain gas cost
    // FIXME: not great that we are having to choose one specific opcode here!
    if (!skip_gas) {
        gas_trace_builder.constrain_gas(clk, OpCode::SET_8);
    }

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_call_ptr = call_ptr,
        .main_ic = write_c.val,
        .main_ind_addr_c = FF(write_c.indirect_address),
        .main_internal_return_ptr = internal_return_ptr,
        .main_mem_addr_c = FF(write_c.direct_address),
        .main_op_err = static_cast<uint32_t>(!is_ok(error)),
        .main_pc = pc,
        .main_rwc = 1,
        .main_sel_mem_op_c = 1,
        .main_sel_op_set = 1,
        .main_sel_resolve_ind_addr_c = FF(static_cast<uint32_t>(write_c.is_indirect)),
        .main_tag_err = static_cast<uint32_t>(!write_c.tag_match),
        .main_w_in_tag = static_cast<uint32_t>(in_tag),
    });

    const std::set<OpCode> set_family{ OpCode::SET_8,  OpCode::SET_16,  OpCode::SET_32,
                                       OpCode::SET_64, OpCode::SET_128, OpCode::SET_FF };
    ASSERT(set_family.contains(op_code));
    pc += Deserialization::get_pc_increment(op_code);
    return error;
}

/**
 * @brief Copy value and tag from a memory cell at position src_offset to the
 *        memory cell at position dst_offset
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param src_offset Offset of source memory cell
 * @param dst_offset Offset of destination memory cell
 */
AvmError AvmTraceBuilder::op_mov(uint8_t indirect, uint32_t src_offset, uint32_t dst_offset, OpCode op_code)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    const auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    // Will be a non-trivial constant once we constrain address resolution
    bool tag_match = true;

    auto [resolved_addrs, res_error] =
        Addressing<2>::fromWire(indirect, call_ptr).resolve({ src_offset, dst_offset }, mem_trace_builder);
    auto [resolved_src_offset, resolved_dst_offset] = resolved_addrs;
    error = res_error;

    if (is_ok(error) && !tag_match) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    // Reading from memory and loading into ia without tag check.
    const auto [val, tag] = mem_trace_builder.read_and_load_mov_opcode(call_ptr, clk, resolved_src_offset);

    // Write into memory from intermediate register ic.
    mem_trace_builder.write_into_memory(call_ptr, clk, IntermRegister::IC, resolved_dst_offset, val, tag, tag);

    // Constrain gas cost
    // FIXME: not great that we are having to choose one specific opcode here!
    gas_trace_builder.constrain_gas(clk, OpCode::MOV_8);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_call_ptr = call_ptr,
        .main_ia = val,
        .main_ic = val,
        .main_internal_return_ptr = internal_return_ptr,
        .main_mem_addr_a = resolved_src_offset,
        .main_mem_addr_c = resolved_dst_offset,
        .main_op_err = static_cast<uint32_t>(!is_ok(error)),
        .main_pc = pc,
        .main_r_in_tag = static_cast<uint32_t>(tag),
        .main_rwc = 1,
        .main_sel_mem_op_a = 1,
        .main_sel_mem_op_c = 1,
        .main_sel_mov_ia_to_ic = 1,
        .main_sel_op_mov = 1,
        .main_tag_err = static_cast<uint32_t>(!tag_match),
        .main_w_in_tag = static_cast<uint32_t>(tag),
    });

    ASSERT(op_code == OpCode::MOV_8 || op_code == OpCode::MOV_16);
    pc += Deserialization::get_pc_increment(op_code);
    return error;
}

/**************************************************************************************************
 *                   HELPERS FOR WORLD STATE AND ACCRUED SUBSTATE
 **************************************************************************************************/

/**
 * @brief Create a kernel output opcode object
 *
 * Used for writing to the kernel app outputs - {new_note_hash, new_nullifier, etc.}
 *
 * @param indirect - Perform indirect memory resolution
 * @param clk - The trace clk
 * @param data_offset - The memory address to read the output from
 * @return Row
 */
RowWithError AvmTraceBuilder::create_kernel_output_opcode(uint8_t indirect, uint32_t clk, uint32_t data_offset)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto [resolved_addrs, res_error] =
        Addressing<1>::fromWire(indirect, call_ptr).resolve({ data_offset }, mem_trace_builder);
    auto [resolved_data] = resolved_addrs;
    error = res_error;

    auto read_a = constrained_read_from_memory(
        call_ptr, clk, resolved_data, AvmMemoryTag::FF, AvmMemoryTag::FF, IntermRegister::IA);
    bool tag_match = read_a.tag_match;
    if (is_ok(error) && !tag_match) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    return RowWithError{ .row =
                             Row{
                                 .main_clk = clk,
                                 .main_ia = read_a.val,
                                 .main_ind_addr_a = FF(read_a.indirect_address),
                                 .main_internal_return_ptr = internal_return_ptr,
                                 .main_mem_addr_a = FF(read_a.direct_address),
                                 .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
                                 .main_pc = pc,
                                 .main_r_in_tag = static_cast<uint32_t>(AvmMemoryTag::FF),
                                 .main_rwa = 0,
                                 .main_sel_mem_op_a = 1,
                                 .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
                                 .main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
                             },
                         .error = error };
}

/**
 * @brief Create a kernel output opcode with metadata object
 *
 * Used for writing to the kernel app outputs with extra metadata - {sload, sstore} (value, slot)
 *
 * @param indirect - Perform indirect memory resolution
 * @param clk - The trace clk
 * @param data_offset - The offset of the main value to output
 * @param data_r_tag - The data type of the value
 * @param metadata_offset - The offset of the metadata (slot in the sload example)
 * @param metadata_r_tag - The data type of the metadata
 * @return Row
 */
RowWithError AvmTraceBuilder::create_kernel_output_opcode_with_metadata(uint8_t indirect,
                                                                        uint32_t clk,
                                                                        uint32_t data_offset,
                                                                        AvmMemoryTag data_r_tag,
                                                                        uint32_t metadata_offset,
                                                                        AvmMemoryTag metadata_r_tag)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto [resolved_addrs, res_error] =
        Addressing<2>::fromWire(indirect, call_ptr).resolve({ data_offset, metadata_offset }, mem_trace_builder);
    auto [resolved_data, resolved_metadata] = resolved_addrs;
    error = res_error;

    auto read_a =
        constrained_read_from_memory(call_ptr, clk, resolved_data, data_r_tag, AvmMemoryTag::FF, IntermRegister::IA);
    auto read_b = constrained_read_from_memory(
        call_ptr, clk, resolved_metadata, metadata_r_tag, AvmMemoryTag::FF, IntermRegister::IB);
    bool tag_match = read_a.tag_match && read_b.tag_match;

    if (is_ok(error) && !tag_match) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    return RowWithError{ .row =
                             Row{
                                 .main_clk = clk,
                                 .main_ia = read_a.val,
                                 .main_ib = read_b.val,
                                 .main_ind_addr_a = FF(read_a.indirect_address),
                                 .main_ind_addr_b = FF(read_b.indirect_address),
                                 .main_internal_return_ptr = internal_return_ptr,
                                 .main_mem_addr_a = FF(read_a.direct_address),
                                 .main_mem_addr_b = FF(read_b.direct_address),
                                 .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
                                 .main_pc = pc,
                                 .main_r_in_tag = static_cast<uint32_t>(data_r_tag),
                                 .main_rwa = 0,
                                 .main_rwb = 0,
                                 .main_sel_mem_op_a = 1,
                                 .main_sel_mem_op_b = 1,
                                 .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
                                 .main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(read_b.is_indirect)),
                                 .main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
                             },
                         .error = error };
}

/**
 * @brief Create a kernel output opcode with set metadata output object
 *
 * Used for writing output opcode where one metadata value is written and comes from a hint
 * {note_hash_exists, nullifier_exists, etc. } Where a boolean output if it exists must also be written
 *
 * @param indirect - Perform indirect memory resolution
 * @param clk - The trace clk
 * @param data_offset - The offset of the main value to output
 * @param metadata_offset - The offset of the metadata (slot in the sload example)
 * @return Row
 */
Row AvmTraceBuilder::create_kernel_output_opcode_with_set_metadata_output_from_hint(
    uint32_t clk, uint32_t data_offset, [[maybe_unused]] uint32_t address_offset, uint32_t metadata_offset)
{
    FF exists = execution_hints.get_side_effect_hints().at(side_effect_counter);

    auto read_a = constrained_read_from_memory(
        call_ptr, clk, data_offset, AvmMemoryTag::FF, AvmMemoryTag::U1, IntermRegister::IA);

    auto write_b = constrained_write_to_memory(
        call_ptr, clk, metadata_offset, exists, AvmMemoryTag::FF, AvmMemoryTag::U1, IntermRegister::IB);
    bool tag_match = read_a.tag_match && write_b.tag_match;

    return Row{
        .main_clk = clk,
        .main_ia = read_a.val,
        .main_ib = write_b.val,
        .main_ind_addr_a = FF(read_a.indirect_address),
        .main_ind_addr_b = FF(write_b.indirect_address),
        .main_internal_return_ptr = internal_return_ptr,
        .main_mem_addr_a = FF(read_a.direct_address),
        .main_mem_addr_b = FF(write_b.direct_address),
        .main_pc = pc,
        .main_r_in_tag = static_cast<uint32_t>(AvmMemoryTag::FF),
        .main_rwa = 0,
        .main_rwb = 1,
        .main_sel_mem_op_a = 1,
        .main_sel_mem_op_b = 1,
        .main_sel_q_kernel_output_lookup = 1,
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
        .main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(write_b.is_indirect)),
        .main_tag_err = static_cast<uint32_t>(!tag_match),
        .main_w_in_tag = static_cast<uint32_t>(AvmMemoryTag::U1),
    };
}

// Specifically for handling the L1TOL2MSGEXISTS and NOTEHASHEXISTS opcodes
Row AvmTraceBuilder::create_kernel_output_opcode_for_leaf_index(uint32_t clk,
                                                                uint32_t data_offset,
                                                                uint32_t leaf_index,
                                                                uint32_t metadata_offset)
{
    // If doesnt exist, should not read_a, but instead get from public inputs
    FF exists = execution_hints.get_leaf_index_hints().at(leaf_index);

    auto read_a = constrained_read_from_memory(
        call_ptr, clk, data_offset, AvmMemoryTag::FF, AvmMemoryTag::U1, IntermRegister::IA);

    auto write_b = constrained_write_to_memory(
        call_ptr, clk, metadata_offset, exists, AvmMemoryTag::FF, AvmMemoryTag::U1, IntermRegister::IB);
    bool tag_match = read_a.tag_match && write_b.tag_match;

    return Row{
        .main_clk = clk,
        .main_ia = read_a.val,
        .main_ib = write_b.val,
        .main_ind_addr_a = FF(read_a.indirect_address),
        .main_ind_addr_b = FF(write_b.indirect_address),
        .main_internal_return_ptr = internal_return_ptr,
        .main_mem_addr_a = FF(read_a.direct_address),
        .main_mem_addr_b = FF(write_b.direct_address),
        .main_pc = pc,
        .main_r_in_tag = static_cast<uint32_t>(AvmMemoryTag::FF),
        .main_rwa = 0,
        .main_rwb = 1,
        .main_sel_mem_op_a = 1,
        .main_sel_mem_op_b = 1,
        .main_sel_q_kernel_output_lookup = 1,
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
        .main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(write_b.is_indirect)),
        .main_tag_err = static_cast<uint32_t>(!tag_match),
        .main_w_in_tag = static_cast<uint32_t>(AvmMemoryTag::U1),
    };
}

/**
 * @brief Create a kernel output opcode with set metadata output object
 *
 * Used for writing output opcode where one value is written and comes from a hint
 * {sload}
 *
 * @param indirect - Perform indirect memory resolution
 * @param clk - The trace clk
 * @param data_offset - The offset of the main value to output
 * @param metadata_offset - The offset of the metadata (slot in the sload example)
 * @return Row
 */
RowWithError AvmTraceBuilder::create_kernel_output_opcode_with_set_value_from_hint(uint8_t indirect,
                                                                                   uint32_t clk,
                                                                                   uint32_t data_offset,
                                                                                   uint32_t metadata_offset)
{
    FF value = execution_hints.get_side_effect_hints().at(side_effect_counter);
    // TODO: throw error if incorrect

    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto [resolved_addrs, res_error] =
        Addressing<2>::fromWire(indirect, call_ptr).resolve({ data_offset, metadata_offset }, mem_trace_builder);
    auto [resolved_data, resolved_metadata] = resolved_addrs;
    error = res_error;

    auto write_a = constrained_write_to_memory(
        call_ptr, clk, resolved_data, value, AvmMemoryTag::FF, AvmMemoryTag::FF, IntermRegister::IA);
    auto read_b = constrained_read_from_memory(
        call_ptr, clk, resolved_metadata, AvmMemoryTag::FF, AvmMemoryTag::FF, IntermRegister::IB);
    bool tag_match = write_a.tag_match && read_b.tag_match;

    if (is_ok(error) && !tag_match) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    return RowWithError{ .row =
                             Row{
                                 .main_clk = clk,
                                 .main_ia = write_a.val,
                                 .main_ib = read_b.val,
                                 .main_ind_addr_a = FF(write_a.indirect_address),
                                 .main_ind_addr_b = FF(read_b.indirect_address),
                                 .main_internal_return_ptr = internal_return_ptr,
                                 .main_mem_addr_a = FF(write_a.direct_address),
                                 .main_mem_addr_b = FF(read_b.direct_address),
                                 .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
                                 .main_pc = pc, // No PC increment here since we do it in the specific ops
                                 .main_r_in_tag = static_cast<uint32_t>(AvmMemoryTag::FF),
                                 .main_rwa = 1,
                                 .main_rwb = 0,
                                 .main_sel_mem_op_a = 1,
                                 .main_sel_mem_op_b = 1,
                                 .main_sel_q_kernel_output_lookup = 1,
                                 .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(write_a.is_indirect)),
                                 .main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(read_b.is_indirect)),
                                 .main_tag_err = static_cast<uint32_t>(!tag_match),
                                 .main_w_in_tag = static_cast<uint32_t>(AvmMemoryTag::FF),
                             },
                         .error = error };
}

/**************************************************************************************************
 *                              WORLD STATE
 **************************************************************************************************/

AvmError AvmTraceBuilder::op_sload(uint8_t indirect, uint32_t slot_offset, uint32_t dest_offset)
{
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto [resolved_addrs, res_error] =
        Addressing<2>::fromWire(indirect, call_ptr).resolve({ slot_offset, dest_offset }, mem_trace_builder);
    auto [resolved_slot, resolved_dest] = resolved_addrs;
    error = res_error;

    auto read_slot = unconstrained_read_from_memory(resolved_slot);
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/7960): Until this is moved
    // to its own gadget, we need to make an unconstrained read here

    // Retrieve the public data read hint for this sload
    PublicDataReadTreeHint read_hint = execution_hints.storage_read_hints.at(storage_read_counter++);

    // Compute the tree slot
    FF computed_tree_slot =
        merkle_tree_trace_builder.compute_public_tree_leaf_slot(clk, current_ext_call_ctx.contract_address, read_slot);
    // Sanity check that the computed slot using the value read from slot_offset should match the read hint
    ASSERT(computed_tree_slot == read_hint.leaf_preimage.slot);

    // Check that the leaf is a member of the public data tree
    bool is_member = merkle_tree_trace_builder.perform_storage_read(
        clk, read_hint.leaf_preimage, read_hint.leaf_index, read_hint.sibling_path);
    ASSERT(is_member);

    FF value = read_hint.leaf_preimage.value;
    auto write_a = constrained_write_to_memory(
        call_ptr, clk, resolved_dest, value, AvmMemoryTag::FF, AvmMemoryTag::FF, IntermRegister::IA);

    if (is_ok(error) && !write_a.tag_match) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    // TODO(8945): remove fake rows
    auto row = Row{
        .main_clk = clk,
        .main_ia = value,
        .main_ib = read_slot,
        .main_ind_addr_a = write_a.indirect_address,
        .main_internal_return_ptr = internal_return_ptr,
        .main_mem_addr_a = write_a.direct_address, // direct address incremented at end of the loop
        .main_pc = pc,
        .main_rwa = 1,
        .main_sel_mem_op_a = 1,
        .main_sel_op_sload = FF(1),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(write_a.is_indirect)),
        .main_tag_err = FF(static_cast<uint32_t>(!write_a.tag_match)),
        .main_w_in_tag = static_cast<uint32_t>(AvmMemoryTag::FF),
    };

    // Constrain gas cost
    // TODO: when/if we move this to its own gadget, and we have 1 row only, we should pass the size as
    // n_multiplier here.
    gas_trace_builder.constrain_gas(clk, OpCode::SLOAD);

    main_trace.push_back(row);

    debug("sload side-effect cnt: ", side_effect_counter);
    side_effect_counter++;
    clk++;

    pc += Deserialization::get_pc_increment(OpCode::SLOAD);
    return error;
}

AvmError AvmTraceBuilder::op_sstore(uint8_t indirect, uint32_t src_offset, uint32_t slot_offset)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    if (storage_write_counter >= MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX) {
        error = AvmError::SIDE_EFFECT_LIMIT_REACHED;
        auto row = Row{
            .main_clk = clk,
            .main_internal_return_ptr = internal_return_ptr,
            .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
            .main_pc = pc,
            .main_sel_op_sstore = FF(1),
        };
        gas_trace_builder.constrain_gas(clk, OpCode::SSTORE);
        main_trace.push_back(row);
        pc += Deserialization::get_pc_increment(OpCode::SSTORE);
        return error;
    }

    auto [resolved_addrs, res_error] =
        Addressing<2>::fromWire(indirect, call_ptr).resolve({ src_offset, slot_offset }, mem_trace_builder);
    auto [resolved_src, resolved_slot] = resolved_addrs;
    error = res_error;

    auto read_slot = unconstrained_read_from_memory(resolved_slot);
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/7960): Until this is moved
    // to its own gadget, we need to make an unconstrained read here
    // otherwise everything falls apart since this is a fake row.

    auto read_a = constrained_read_from_memory(
        call_ptr, clk, resolved_src, AvmMemoryTag::FF, AvmMemoryTag::FF, IntermRegister::IA);

    if (is_ok(error) && !read_a.tag_match) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    // Merkle check for SSTORE
    // (a) We compute the tree leaf slot of the low nullifier
    // (b) We check the membership of the low nullifier in the public data tree
    // (c) We check that the operand slot meets the low nullifier conditions (sandwich or max)
    // (d) We update the preimage of the low nullifier with the new slot it points to
    // (e) We create a new preimage for the new write
    // (f) We compute the new root by updating at the leaf index with the hash of the new preimage
    PublicDataWriteTreeHint write_hint = execution_hints.storage_write_hints.at(storage_write_counter++);
    merkle_tree_trace_builder.perform_storage_write(clk,
                                                    write_hint.low_leaf_membership.leaf_preimage,
                                                    write_hint.low_leaf_membership.leaf_index,
                                                    write_hint.low_leaf_membership.sibling_path,
                                                    write_hint.new_leaf_preimage.slot,
                                                    write_hint.new_leaf_preimage.value,
                                                    write_hint.insertion_path);

    // TODO(8945): remove fake rows
    Row row = Row{
        .main_clk = clk,
        .main_ia = read_a.val,
        .main_ib = read_slot,
        .main_ind_addr_a = read_a.indirect_address,
        .main_internal_return_ptr = internal_return_ptr,
        .main_mem_addr_a = read_a.direct_address, // direct address incremented at end of the loop
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = pc,
        .main_r_in_tag = static_cast<uint32_t>(AvmMemoryTag::FF),
        .main_sel_mem_op_a = 1,
        .main_sel_q_kernel_output_lookup = 1,
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
        .main_tag_err = FF(static_cast<uint32_t>(!read_a.tag_match)),
    };
    row.main_sel_op_sstore = FF(1);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::SSTORE);

    main_trace.push_back(row);

    debug("sstore side-effect cnt: ", side_effect_counter);
    side_effect_counter++;
    clk++;
    pc += Deserialization::get_pc_increment(OpCode::SSTORE);
    return error;
}

AvmError AvmTraceBuilder::op_note_hash_exists(uint8_t indirect,
                                              uint32_t note_hash_offset,
                                              uint32_t leaf_index_offset,
                                              uint32_t dest_offset)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto const clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] =
        Addressing<3>::fromWire(indirect, call_ptr)
            .resolve({ note_hash_offset, leaf_index_offset, dest_offset }, mem_trace_builder);
    auto [resolved_note_hash, resolved_leaf_index, resolved_dest] = resolved_addrs;
    error = res_error;

    if (is_ok(error) && !check_tag(AvmMemoryTag::FF, resolved_leaf_index)) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    Row row;

    if (is_ok(error)) {
        AppendTreeHint note_hash_read_hint = execution_hints.note_hash_read_hints.at(note_hash_read_counter++);
        FF note_hash_value = unconstrained_read_from_memory(resolved_note_hash);

        // The note hash exists, if what we read from the note hash offset matches the hinted leaf value
        bool exists = note_hash_value == note_hash_read_hint.leaf_value;
        // Check membership of the leaf index in the note hash tree
        const auto leaf_index = unconstrained_read_from_memory(resolved_leaf_index);
        bool is_member = merkle_tree_trace_builder.perform_note_hash_read(
            clk, note_hash_read_hint.leaf_value, leaf_index, note_hash_read_hint.sibling_path);

        ASSERT(is_member);

        // This already does memory reads
        auto read_a = constrained_read_from_memory(
            call_ptr, clk, resolved_note_hash, AvmMemoryTag::FF, AvmMemoryTag::U1, IntermRegister::IA);

        auto write_b = constrained_write_to_memory(call_ptr,
                                                   clk,
                                                   resolved_dest,
                                                   exists ? FF::one() : FF::zero(),
                                                   AvmMemoryTag::FF,
                                                   AvmMemoryTag::U1,
                                                   IntermRegister::IB);
        bool tag_match = read_a.tag_match && write_b.tag_match;

        row = Row{
            .main_clk = clk,
            .main_ia = read_a.val,
            .main_ib = write_b.val,
            .main_ind_addr_a = FF(read_a.indirect_address),
            .main_ind_addr_b = FF(write_b.indirect_address),
            .main_internal_return_ptr = internal_return_ptr,
            .main_mem_addr_a = FF(read_a.direct_address),
            .main_mem_addr_b = FF(write_b.direct_address),
            .main_pc = pc,
            .main_r_in_tag = static_cast<uint32_t>(AvmMemoryTag::FF),
            .main_rwa = 0,
            .main_rwb = 1,
            .main_sel_mem_op_a = 1,
            .main_sel_mem_op_b = 1,
            .main_sel_q_kernel_output_lookup = 1,
            .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
            .main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(write_b.is_indirect)),
            .main_tag_err = static_cast<uint32_t>(!tag_match),
            .main_w_in_tag = static_cast<uint32_t>(AvmMemoryTag::U1),
        };

        row.main_sel_op_note_hash_exists = FF(1);
        if (is_ok(error) && row.main_tag_err != FF(0)) {
            error = AvmError::CHECK_TAG_ERROR;
        }
    } else {
        row = Row{
            .main_clk = clk,
            .main_internal_return_ptr = internal_return_ptr,
            .main_op_err = FF(1),
            .main_pc = pc,
            .main_sel_op_note_hash_exists = FF(1),
        };
    }

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::NOTEHASHEXISTS);

    main_trace.push_back(row);

    debug("note_hash_exists side-effect cnt: ", side_effect_counter);
    pc += Deserialization::get_pc_increment(OpCode::NOTEHASHEXISTS);
    return error;
}

AvmError AvmTraceBuilder::op_emit_note_hash(uint8_t indirect, uint32_t note_hash_offset)
{
    auto const clk = static_cast<uint32_t>(main_trace.size()) + 1;

    if (note_hash_write_counter >= MAX_NOTE_HASHES_PER_TX) {
        AvmError error = AvmError::SIDE_EFFECT_LIMIT_REACHED;
        auto row = Row{
            .main_clk = clk,
            .main_internal_return_ptr = internal_return_ptr,
            .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
            .main_pc = pc,
            .main_sel_op_emit_note_hash = FF(1),
        };
        gas_trace_builder.constrain_gas(clk, OpCode::EMITNOTEHASH);
        main_trace.push_back(row);
        pc += Deserialization::get_pc_increment(OpCode::EMITNOTEHASH);
        return error;
    }

    auto [row, error] = create_kernel_output_opcode(indirect, clk, note_hash_offset);
    row.main_sel_op_emit_note_hash = FF(1);
    row.main_op_err = FF(static_cast<uint32_t>(!is_ok(error)));

    AppendTreeHint note_hash_write_hint = execution_hints.note_hash_write_hints.at(note_hash_write_counter++);
    auto siloed_note_hash =
        AvmMerkleTreeTraceBuilder::unconstrained_silo_note_hash(current_ext_call_ctx.contract_address, row.main_ia);
    ASSERT(row.main_ia == note_hash_write_hint.leaf_value);
    // We first check that the index is currently empty
    bool insert_index_is_empty = merkle_tree_trace_builder.perform_note_hash_read(
        clk, FF::zero(), note_hash_write_hint.leaf_index, note_hash_write_hint.sibling_path);
    ASSERT(insert_index_is_empty);

    // Update the root with the new leaf that is appended
    merkle_tree_trace_builder.perform_note_hash_append(clk, siloed_note_hash, note_hash_write_hint.sibling_path);

    AppendTreeHint note_hash_write_hint = execution_hints.note_hash_write_hints.at(note_hash_write_counter++);
    auto siloed_note_hash = AvmMerkleTreeTraceBuilder::unconstrained_silo_note_hash(
        current_public_call_request.contract_address, row.main_ia);
    ASSERT(row.main_ia == note_hash_write_hint.leaf_value);
    // We first check that the index is currently empty
    bool insert_index_is_empty = merkle_tree_trace_builder.perform_note_hash_read(
        clk, FF::zero(), note_hash_write_hint.leaf_index, note_hash_write_hint.sibling_path);
    ASSERT(insert_index_is_empty);

    // Update the root with the new leaf that is appended
    merkle_tree_trace_builder.perform_note_hash_append(clk, siloed_note_hash, note_hash_write_hint.sibling_path);

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::EMITNOTEHASH);

    main_trace.push_back(row);

    debug("emit_note_hash side-effect cnt: ", side_effect_counter);
    side_effect_counter++;

    pc += Deserialization::get_pc_increment(OpCode::EMITNOTEHASH);
    return error;
}

AvmError AvmTraceBuilder::op_nullifier_exists(uint8_t indirect,
                                              uint32_t nullifier_offset,
                                              uint32_t address_offset,
                                              uint32_t dest_offset)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto const clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] =
        Addressing<3>::fromWire(indirect, call_ptr)
            .resolve({ nullifier_offset, address_offset, dest_offset }, mem_trace_builder);
    auto [resolved_nullifier_offset, resolved_address, resolved_dest] = resolved_addrs;
    error = res_error;

    if (is_ok(error) && !check_tag(AvmMemoryTag::FF, resolved_address)) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    Row row;

    // Exists is written to b
    bool exists = false;
    if (is_ok(error)) {
        NullifierReadTreeHint nullifier_read_hint = execution_hints.nullifier_read_hints.at(nullifier_read_counter++);
        FF nullifier_value = unconstrained_read_from_memory(resolved_nullifier_offset);
        FF address_value = unconstrained_read_from_memory(resolved_address);
        FF siloed_nullifier = AvmMerkleTreeTraceBuilder::unconstrained_silo_nullifier(address_value, nullifier_value);
        bool is_member = merkle_tree_trace_builder.perform_nullifier_read(clk,
                                                                          nullifier_read_hint.low_leaf_preimage,
                                                                          nullifier_read_hint.low_leaf_index,
                                                                          nullifier_read_hint.low_leaf_sibling_path);
        ASSERT(is_member);

        if (siloed_nullifier == nullifier_read_hint.low_leaf_preimage.nullifier) {
            // This is a direct membership check
            exists = true;
        } else {
            exists = false;
            // This is a non-membership proof
            // Show that the target nullifier meets the non membership conditions (sandwich or max)
            ASSERT(siloed_nullifier < nullifier_read_hint.low_leaf_preimage.nullifier &&
                   (nullifier_read_hint.low_leaf_preimage.next_nullifier == FF::zero() ||
                    siloed_nullifier > nullifier_read_hint.low_leaf_preimage.next_nullifier));
        }

        auto read_a = constrained_read_from_memory(
            call_ptr, clk, resolved_nullifier_offset, AvmMemoryTag::FF, AvmMemoryTag::U1, IntermRegister::IA);

        auto write_b = constrained_write_to_memory(call_ptr,
                                                   clk,
                                                   resolved_dest,
                                                   exists ? FF::one() : FF::zero(),
                                                   AvmMemoryTag::FF,
                                                   AvmMemoryTag::U1,
                                                   IntermRegister::IB);
        bool tag_match = read_a.tag_match && write_b.tag_match;
        row = Row{
            .main_clk = clk,
            .main_ia = read_a.val,
            .main_ib = write_b.val,
            .main_ind_addr_a = FF(read_a.indirect_address),
            .main_ind_addr_b = FF(write_b.indirect_address),
            .main_internal_return_ptr = internal_return_ptr,
            .main_mem_addr_a = FF(read_a.direct_address),
            .main_mem_addr_b = FF(write_b.direct_address),
            .main_pc = pc,
            .main_r_in_tag = static_cast<uint32_t>(AvmMemoryTag::FF),
            .main_rwa = 0,
            .main_rwb = 1,
            .main_sel_mem_op_a = 1,
            .main_sel_mem_op_b = 1,
            .main_sel_q_kernel_output_lookup = 1,
            .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
            .main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(write_b.is_indirect)),
            .main_tag_err = static_cast<uint32_t>(!tag_match),
            .main_w_in_tag = static_cast<uint32_t>(AvmMemoryTag::U1),
        };
        // clk, resolved_nullifier_offset, resolved_address, resolved_dest);
        row.main_sel_op_nullifier_exists = FF(1);
        if (is_ok(error) && row.main_tag_err != FF(0)) {
            error = AvmError::CHECK_TAG_ERROR;
        }
    } else {
        row = Row{
            .main_clk = clk,
            .main_internal_return_ptr = internal_return_ptr,
            .main_op_err = FF(1),
            .main_pc = pc,
            .main_sel_op_nullifier_exists = FF(1),
        };
    }

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::NULLIFIEREXISTS);

    main_trace.push_back(row);

    debug("nullifier_exists side-effect cnt: ", side_effect_counter);
    side_effect_counter++;

    pc += Deserialization::get_pc_increment(OpCode::NULLIFIEREXISTS);
    return error;
}

AvmError AvmTraceBuilder::op_emit_nullifier(uint8_t indirect, uint32_t nullifier_offset)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto const clk = static_cast<uint32_t>(main_trace.size()) + 1;

    if (nullifier_write_counter >= MAX_NULLIFIERS_PER_TX) {
        error = AvmError::SIDE_EFFECT_LIMIT_REACHED;
        auto row = Row{
            .main_clk = clk,
            .main_internal_return_ptr = internal_return_ptr,
            .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
            .main_pc = pc,
            .main_sel_op_emit_nullifier = FF(1),
        };
        gas_trace_builder.constrain_gas(clk, OpCode::EMITNULLIFIER);
        main_trace.push_back(row);
        pc += Deserialization::get_pc_increment(OpCode::EMITNULLIFIER);
        return error;
    }

    auto [row, output_error] = create_kernel_output_opcode(indirect, clk, nullifier_offset);
    row.main_sel_op_emit_nullifier = FF(1);
    if (is_ok(error)) {
        error = output_error;
    }

    // Do merkle check
    FF nullifier_value = row.main_ia;
    FF siloed_nullifier =
        AvmMerkleTreeTraceBuilder::unconstrained_silo_nullifier(current_ext_call_ctx.contract_address, nullifier_value);

    NullifierWriteTreeHint nullifier_write_hint = execution_hints.nullifier_write_hints.at(nullifier_write_counter++);
    bool is_update = siloed_nullifier == nullifier_write_hint.low_leaf_membership.low_leaf_preimage.next_nullifier;
    if (is_update) {
        // hinted low-leaf points to the target nullifier, so it already exists
        // prove membership of that low-leaf, which also proves membership of the target nullifier
        bool exists = merkle_tree_trace_builder.perform_nullifier_read(
            clk,
            nullifier_write_hint.low_leaf_membership.low_leaf_preimage,
            nullifier_write_hint.low_leaf_membership.low_leaf_index,
            nullifier_write_hint.low_leaf_membership.low_leaf_sibling_path);
        // if hinted low-leaf that skips the nullifier fails membership check, bad hint!
        ASSERT(exists);
        nullifier_read_counter++;
        // Cannot update an existing nullifier, and cannot emit a duplicate. Error!
        if (is_ok(error)) {
            error = AvmError::DUPLICATE_NULLIFIER;
        }
    } else {
        // hinted low-leaf SKIPS the target nullifier, so it does NOT exist
        // prove membership of the low leaf which  also proves non-membership of the target nullifier
        merkle_tree_trace_builder.perform_nullifier_append(
            clk,
            nullifier_write_hint.low_leaf_membership.low_leaf_preimage,
            nullifier_write_hint.low_leaf_membership.low_leaf_index,
            nullifier_write_hint.low_leaf_membership.low_leaf_sibling_path,
            siloed_nullifier,
            nullifier_write_hint.insertion_path);
    }

    row.main_op_err = FF(static_cast<uint32_t>(!is_ok(error)));

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::EMITNULLIFIER);

    main_trace.push_back(row);

    debug("emit_nullifier side-effect cnt: ", side_effect_counter);
    side_effect_counter++;

    pc += Deserialization::get_pc_increment(OpCode::EMITNULLIFIER);
    return error;
}

AvmError AvmTraceBuilder::op_l1_to_l2_msg_exists(uint8_t indirect,
                                                 uint32_t log_offset,
                                                 uint32_t leaf_index_offset,
                                                 uint32_t dest_offset)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto const clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] = Addressing<3>::fromWire(indirect, call_ptr)
                                           .resolve({ log_offset, leaf_index_offset, dest_offset }, mem_trace_builder);
    auto [resolved_log, resolved_leaf_index, resolved_dest] = resolved_addrs;
    error = res_error;

    const auto leaf_index = unconstrained_read_from_memory(resolved_leaf_index);
    if (is_ok(error) && !check_tag(AvmMemoryTag::FF, resolved_leaf_index)) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    Row row;

    if (is_ok(error)) {
        // Do merkle check
        AppendTreeHint l1_to_l2_msg_read_hint =
            execution_hints.l1_to_l2_message_read_hints.at(l1_to_l2_msg_read_counter);
        FF l1_to_l2_msg_value = unconstrained_read_from_memory(resolved_log);
        ASSERT(leaf_index == l1_to_l2_msg_read_hint.leaf_index);

        bool exists = l1_to_l2_msg_value == l1_to_l2_msg_read_hint.leaf_value;

        // Check membership of the leaf index in the l1_to_l2_msg tree
        bool is_member = merkle_tree_trace_builder.perform_l1_to_l2_message_read(
            clk, l1_to_l2_msg_read_hint.leaf_value, leaf_index, l1_to_l2_msg_read_hint.sibling_path);
        ASSERT(is_member);

        auto read_a = constrained_read_from_memory(
            call_ptr, clk, resolved_log, AvmMemoryTag::FF, AvmMemoryTag::U1, IntermRegister::IA);

        auto write_b = constrained_write_to_memory(call_ptr,
                                                   clk,
                                                   resolved_dest,
                                                   exists ? FF::one() : FF::zero(),
                                                   AvmMemoryTag::FF,
                                                   AvmMemoryTag::U1,
                                                   IntermRegister::IB);
        bool tag_match = read_a.tag_match && write_b.tag_match;

        row = Row{
            .main_clk = clk,
            .main_ia = read_a.val,
            .main_ib = write_b.val,
            .main_ind_addr_a = FF(read_a.indirect_address),
            .main_ind_addr_b = FF(write_b.indirect_address),
            .main_internal_return_ptr = internal_return_ptr,
            .main_mem_addr_a = FF(read_a.direct_address),
            .main_mem_addr_b = FF(write_b.direct_address),
            .main_pc = pc,
            .main_r_in_tag = static_cast<uint32_t>(AvmMemoryTag::FF),
            .main_rwa = 0,
            .main_rwb = 1,
            .main_sel_mem_op_a = 1,
            .main_sel_mem_op_b = 1,
            .main_sel_q_kernel_output_lookup = 1,
            .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
            .main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(write_b.is_indirect)),
            .main_tag_err = static_cast<uint32_t>(!tag_match),
            .main_w_in_tag = static_cast<uint32_t>(AvmMemoryTag::U1),
        };

        row.main_sel_op_l1_to_l2_msg_exists = FF(1);
        if (is_ok(error) && row.main_tag_err != FF(0)) {
            error = AvmError::CHECK_TAG_ERROR;
        }
    } else {
        row = Row{
            .main_clk = clk,
            .main_internal_return_ptr = internal_return_ptr,
            .main_op_err = FF(1),
            .main_pc = pc,
            .main_sel_op_l1_to_l2_msg_exists = FF(1),
        };
    }

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::L1TOL2MSGEXISTS);

    main_trace.push_back(row);

    debug("l1_to_l2_msg_exists side-effect cnt: ", side_effect_counter);

    pc += Deserialization::get_pc_increment(OpCode::L1TOL2MSGEXISTS);
    return error;
}

AvmError AvmTraceBuilder::op_get_contract_instance(
    uint8_t indirect, uint16_t address_offset, uint16_t dst_offset, uint16_t exists_offset, uint8_t member_enum)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;
    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::GETCONTRACTINSTANCE);

    if (member_enum >= static_cast<int>(ContractInstanceMember::MAX_MEMBER)) {
        // Error, bad enum operand
        // TODO(9393): constrain this via range check
        const auto row = Row{
            .main_clk = clk,
            .main_call_ptr = call_ptr,
            .main_internal_return_ptr = internal_return_ptr,
            .main_op_err = FF(1),
            .main_pc = pc,
            .main_sel_op_get_contract_instance = FF(1),
        };
        main_trace.push_back(row);
        pc += Deserialization::get_pc_increment(OpCode::GETCONTRACTINSTANCE);
        return AvmError::CONTRACT_INST_MEM_UNKNOWN;
    };

    ContractInstanceMember chosen_member = static_cast<ContractInstanceMember>(member_enum);

    auto [resolved_addrs, res_error] = Addressing<3>::fromWire(indirect, call_ptr)
                                           .resolve({ address_offset, dst_offset, exists_offset }, mem_trace_builder);
    auto [resolved_address_offset, resolved_dst_offset, resolved_exists_offset] = resolved_addrs;
    error = res_error;

    auto read_address = constrained_read_from_memory(
        call_ptr, clk, resolved_address_offset, AvmMemoryTag::FF, AvmMemoryTag::FF, IntermRegister::IA);
    bool tag_match = read_address.tag_match;
    if (is_ok(error) && !tag_match) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    FF member_value = 0;
    bool exists = false;

    if (is_ok(error)) {
        const auto contract_address = read_address.val;
        const auto contract_address_nullifier = AvmMerkleTreeTraceBuilder::unconstrained_silo_nullifier(
            DEPLOYER_CONTRACT_ADDRESS, /*nullifier=*/contract_address);
        // Read the contract instance hint
        ContractInstanceHint instance = execution_hints.contract_instance_hints.at(contract_address);

        if (isCanonical(contract_address)) {
            // skip membership check for canonical contracts
            exists = true;
        } else {
            // nullifier read hint for the contract address
            NullifierReadTreeHint nullifier_read_hint = instance.membership_hint;

            // If the hinted preimage matches the contract address nullifier, the membership check will prove its
            // existence, otherwise the membership check will prove that a low-leaf exists that skips the contract
            // address nullifier.
            exists = nullifier_read_hint.low_leaf_preimage.nullifier == contract_address_nullifier;

            bool is_member =
                merkle_tree_trace_builder.perform_nullifier_read(clk,
                                                                 nullifier_read_hint.low_leaf_preimage,
                                                                 nullifier_read_hint.low_leaf_index,
                                                                 nullifier_read_hint.low_leaf_sibling_path);
            // membership check must always pass
            ASSERT(is_member);

            if (exists) {
                // This was a membership proof!
                // Assert that the hint's exists flag matches. The flag isn't really necessary...
                ASSERT(instance.exists);
            } else {
                // This was a non-membership proof!
                // Enforce that the tree access membership checked a low-leaf that skips the contract address nullifier.
                // Show that the contract address nullifier meets the non membership conditions (sandwich or max)
                ASSERT(contract_address_nullifier < nullifier_read_hint.low_leaf_preimage.nullifier &&
                       (nullifier_read_hint.low_leaf_preimage.next_nullifier == FF::zero() ||
                        contract_address_nullifier > nullifier_read_hint.low_leaf_preimage.next_nullifier));
            }
        }

        if (exists) {
            switch (chosen_member) {
            case ContractInstanceMember::DEPLOYER:
                member_value = instance.deployer_addr;
                break;
            case ContractInstanceMember::CLASS_ID:
                member_value = instance.contract_class_id;
                break;
            case ContractInstanceMember::INIT_HASH:
                member_value = instance.initialisation_hash;
                break;
            default:
                member_value = 0;
                break;
            }
        }
    }

    // TODO(8603): once instructions can have multiple different tags for writes, write dst as FF and exists as
    // U1 auto write_dst = constrained_write_to_memory(call_ptr, clk, resolved_dst_offset, member_value,
    // AvmMemoryTag::FF, AvmMemoryTag::FF, IntermRegister::IC); auto write_exists =
    // constrained_write_to_memory(call_ptr, clk, resolved_exists_offset, instance.instance_found_in_address,
    // AvmMemoryTag::FF, AvmMemoryTag::FF, IntermRegister::ID);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_call_ptr = call_ptr,
        .main_ia = read_address.val,
        // TODO(8603): uncomment this and below blocks once instructions can have multiple different tags for
        // writes
        //.main_ic = write_dst.val,
        //.main_id = write_exists.val,
        .main_ind_addr_a = FF(read_address.indirect_address),
        //.main_ind_addr_c = FF(write_dst.indirect_address),
        //.main_ind_addr_d = FF(write_exists.indirect_address),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_a = FF(read_address.direct_address),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        //.main_mem_addr_c = FF(write_dst.direct_address),
        //.main_mem_addr_d = FF(write_exists.direct_address),
        .main_pc = FF(pc),
        .main_r_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::FF)),
        .main_sel_mem_op_a = FF(1),
        //.main_sel_mem_op_c = FF(1),
        //.main_sel_mem_op_d = FF(1),
        .main_sel_op_get_contract_instance = FF(1),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_address.is_indirect)),
        //.main_sel_resolve_ind_addr_c = FF(static_cast<uint32_t>(write_dst.is_indirect)),
        //.main_sel_resolve_ind_addr_d = FF(static_cast<uint32_t>(write_exists.is_indirect)),
        .main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
    });

    pc += Deserialization::get_pc_increment(OpCode::GETCONTRACTINSTANCE);

    // Crucial to perform this operation after having incremented pc because write_slice_to_memory
    // is implemented with opcodes (SET and JUMP).
    // TODO(8603): once instructions can have multiple different tags for writes, remove this and do a
    // constrained writes
    write_to_memory(resolved_dst_offset, member_value, AvmMemoryTag::FF);
    write_to_memory(resolved_exists_offset, FF(static_cast<uint32_t>(exists)), AvmMemoryTag::U1);

    // TODO(dbanks12): compute contract address nullifier from instance preimage and perform membership check

    debug("contract_instance cnt: ", side_effect_counter);
    side_effect_counter++;
    return error;
}

/**************************************************************************************************
 *                              ACCRUED SUBSTATE
 **************************************************************************************************/

AvmError AvmTraceBuilder::op_emit_unencrypted_log(uint8_t indirect, uint32_t log_offset, uint32_t log_size_offset)
{
    std::vector<uint8_t> bytes_to_hash;

    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto const clk = static_cast<uint32_t>(main_trace.size()) + 1;

    // FIXME: read (and constrain) log_size_offset
    auto [resolved_addrs, res_error] =
        Addressing<2>::fromWire(indirect, call_ptr).resolve({ log_offset, log_size_offset }, mem_trace_builder);
    auto [resolved_log_offset, resolved_log_size_offset] = resolved_addrs;
    error = res_error;

    // This is a hack to get the contract address from the first contract instance
    // Once we have 1-enqueued call and proper nested contexts, this should use that address of the current context
    FF contract_address = execution_hints.all_contract_bytecode.at(0).contract_instance.address;
    std::vector<uint8_t> contract_address_bytes = contract_address.to_buffer();

    // Unencrypted logs are hashed with sha256 and truncated to 31 bytes - and then padded back to 32 bytes
    bytes_to_hash.insert(bytes_to_hash.end(),
                         std::make_move_iterator(contract_address_bytes.begin()),
                         std::make_move_iterator(contract_address_bytes.end()));

    if (is_ok(error) &&
        !(check_tag(AvmMemoryTag::FF, resolved_log_offset) && check_tag(AvmMemoryTag::U32, resolved_log_size_offset))) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    Row row;
    uint32_t log_size = 0;
    AddressWithMode direct_field_addr;
    uint32_t num_bytes = 0;

    if (is_ok(error)) {
        log_size = static_cast<uint32_t>(unconstrained_read_from_memory(resolved_log_size_offset));

        // The size is in fields of 32 bytes, the length used for the hash is in terms of bytes
        num_bytes = log_size * 32;
        std::vector<uint8_t> log_size_bytes = to_buffer(num_bytes);
        // Add the log size to the hash to bytes
        bytes_to_hash.insert(bytes_to_hash.end(),
                             std::make_move_iterator(log_size_bytes.begin()),
                             std::make_move_iterator(log_size_bytes.end()));

        direct_field_addr = AddressWithMode(static_cast<uint32_t>(resolved_log_offset));
        if (!check_tag_range(AvmMemoryTag::FF, direct_field_addr, log_size)) {
            error = AvmError::CHECK_TAG_ERROR;
        };
    }

    // Can't return earlier as we do elsewhere for side-effect-limit because we need
    // to at least retrieve log_size first to charge proper gas.
    // This means a tag error could occur before side-effect-limit first.
    if (is_ok(error) && unencrypted_log_write_counter >= MAX_UNENCRYPTED_LOGS_PER_TX) {
        error = AvmError::SIDE_EFFECT_LIMIT_REACHED;
        auto row = Row{
            .main_clk = clk,
            .main_internal_return_ptr = internal_return_ptr,
            .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
            .main_pc = pc,
            .main_sel_op_emit_unencrypted_log = FF(1),
        };
        // Constrain gas cost
        gas_trace_builder.constrain_gas(clk, OpCode::EMITUNENCRYPTEDLOG, static_cast<uint32_t>(log_size));
        main_trace.push_back(row);
        pc += Deserialization::get_pc_increment(OpCode::EMITUNENCRYPTEDLOG);
        return error;
    }
    unencrypted_log_write_counter++;

    if (is_ok(error)) {
        // We need to read the rest of the log_size number of elements
        for (uint32_t i = 0; i < log_size; i++) {
            FF log_value = unconstrained_read_from_memory(direct_field_addr + i);
            std::vector<uint8_t> log_value_byte = log_value.to_buffer();
            bytes_to_hash.insert(bytes_to_hash.end(),
                                 std::make_move_iterator(log_value_byte.begin()),
                                 std::make_move_iterator(log_value_byte.end()));
        }

        std::array<uint8_t, 32> output = crypto::sha256(bytes_to_hash);
        // Truncate the hash to 31 bytes so it will be a valid field element
        FF trunc_hash = FF(from_buffer<uint256_t>(output.data()) >> 8);

        // The + 32 here is for the contract_address in bytes, the +4 is for the extra 4 bytes that contain log_size
        // and is prefixed to message see toBuffer in unencrypted_l2_log.ts
        FF length_of_preimage = num_bytes + 32 + 4;
        // The + 4 is because the kernels store the length of the
        // processed log as 4 bytes; thus for this length value to match the log length stored in the kernels, we
        // need to add four to the length here. [Copied from unencrypted_l2_log.ts]
        FF metadata_log_length = length_of_preimage + 4;
        row = Row{
            .main_clk = clk,
            .main_ia = trunc_hash,
            .main_ib = metadata_log_length,
            .main_internal_return_ptr = internal_return_ptr,
            .main_pc = pc,
        };
        // Write to offset
        // kernel_trace_builder.op_emit_unencrypted_log(clk, side_effect_counter, trunc_hash, metadata_log_length);
        row.main_sel_op_emit_unencrypted_log = FF(1);
    } else {
        row = Row{
            .main_clk = clk,
            .main_internal_return_ptr = internal_return_ptr,
            .main_op_err = FF(1),
            .main_pc = pc,
            .main_sel_op_emit_unencrypted_log = FF(1),
        };
    }

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::EMITUNENCRYPTEDLOG, static_cast<uint32_t>(log_size));

    main_trace.push_back(row);

    debug("emit_unencrypted_log side-effect cnt: ", side_effect_counter);
    side_effect_counter++;
    pc += Deserialization::get_pc_increment(OpCode::EMITUNENCRYPTEDLOG);
    return error;
}

AvmError AvmTraceBuilder::op_emit_l2_to_l1_msg(uint8_t indirect, uint32_t recipient_offset, uint32_t content_offset)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto const clk = static_cast<uint32_t>(main_trace.size()) + 1;

    if (l2_to_l1_msg_write_counter >= MAX_L2_TO_L1_MSGS_PER_TX) {
        error = AvmError::SIDE_EFFECT_LIMIT_REACHED;
        auto row = Row{
            .main_clk = clk,
            .main_internal_return_ptr = internal_return_ptr,
            .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
            .main_pc = pc,
            .main_sel_op_emit_l2_to_l1_msg = FF(1),
        };
        gas_trace_builder.constrain_gas(clk, OpCode::SENDL2TOL1MSG);
        main_trace.push_back(row);
        pc += Deserialization::get_pc_increment(OpCode::SENDL2TOL1MSG);
        return error;
    }
    l2_to_l1_msg_write_counter++;

    // Note: unorthodox order - as seen in L2ToL1Message struct in TS
    auto [row, output_error] = create_kernel_output_opcode_with_metadata(
        indirect, clk, content_offset, AvmMemoryTag::FF, recipient_offset, AvmMemoryTag::FF);

    if (is_ok(error)) {
        error = output_error;
    }

    // Wtite to output
    // kernel_trace_builder.op_emit_l2_to_l1_msg(clk, side_effect_counter, row.main_ia, row.main_ib);
    row.main_sel_op_emit_l2_to_l1_msg = FF(1);
    row.main_op_err = FF(static_cast<uint32_t>(!is_ok(error)));

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::SENDL2TOL1MSG);

    main_trace.push_back(row);

    debug("emit_l2_to_l1_msg side-effect cnt: ", side_effect_counter);
    side_effect_counter++;

    pc += Deserialization::get_pc_increment(OpCode::SENDL2TOL1MSG);
    return error;
}

/**************************************************************************************************
 *                            CONTROL FLOW - CONTRACT CALLS
 **************************************************************************************************/

// Helper/implementation for CALL and STATICCALL
AvmError AvmTraceBuilder::constrain_external_call(OpCode opcode,
                                                  uint16_t indirect,
                                                  uint32_t gas_offset,
                                                  uint32_t addr_offset,
                                                  uint32_t args_offset,
                                                  uint32_t args_size_offset,
                                                  uint32_t success_offset)
{
    ASSERT(opcode == OpCode::CALL || opcode == OpCode::STATICCALL);
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;
    // const ExternalCallHint& hint = execution_hints.externalcall_hints.at(external_call_counter);

    auto [resolved_addrs, res_error] =
        Addressing<5>::fromWire(indirect, call_ptr)
            .resolve({ gas_offset, addr_offset, args_offset, args_size_offset, success_offset }, mem_trace_builder);
    auto [resolved_gas_offset,
          resolved_addr_offset,
          resolved_args_offset,
          resolved_args_size_offset,
          resolved_success_offset] = resolved_addrs;
    error = res_error;

    // Should read the address next to read_gas as well (tuple of gas values (l2Gas, daGas))
    auto read_gas_l2 = constrained_read_from_memory(
        call_ptr, clk, resolved_gas_offset, AvmMemoryTag::FF, AvmMemoryTag::FF, IntermRegister::IA);
    auto read_gas_da = mem_trace_builder.read_and_load_from_memory(
        call_ptr, clk, IntermRegister::IB, read_gas_l2.direct_address + 1, AvmMemoryTag::FF, AvmMemoryTag::FF);
    auto read_addr = constrained_read_from_memory(
        call_ptr, clk, resolved_addr_offset, AvmMemoryTag::FF, AvmMemoryTag::FF, IntermRegister::IC);
    auto read_args = constrained_read_from_memory(
        call_ptr, clk, resolved_args_offset, AvmMemoryTag::FF, AvmMemoryTag::FF, IntermRegister::ID);
    bool tag_match = read_gas_l2.tag_match && read_gas_da.tag_match && read_addr.tag_match && read_args.tag_match;

    if (is_ok(error) && !(tag_match && check_tag(AvmMemoryTag::U32, resolved_args_size_offset))) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    // TODO: constrain this
    auto args_size =
        is_ok(error) ? static_cast<uint32_t>(unconstrained_read_from_memory(resolved_args_size_offset)) : 0;

    // We need to consume the the gas cost of call, and then handle the amount allocated to the call
    gas_trace_builder.constrain_gas(clk,
                                    opcode,
                                    /*dyn_gas_multiplier=*/args_size);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_ia = read_gas_l2.val, /* gas_offset_l2 */
        .main_ib = read_gas_da.val, /* gas_offset_da */
        .main_ic = read_addr.val,   /* addr_offset */
        .main_id = read_args.val,   /* args_offset */
        .main_ind_addr_a = FF(read_gas_l2.indirect_address),
        .main_ind_addr_c = FF(read_addr.indirect_address),
        .main_ind_addr_d = FF(read_args.indirect_address),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_a = FF(read_gas_l2.direct_address),
        .main_mem_addr_b = FF(read_gas_l2.direct_address + 1),
        .main_mem_addr_c = FF(read_addr.direct_address),
        .main_mem_addr_d = FF(read_args.direct_address),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_r_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::FF)),
        .main_sel_mem_op_a = FF(1),
        .main_sel_mem_op_b = FF(1),
        .main_sel_mem_op_c = FF(1),
        .main_sel_mem_op_d = FF(1),
        .main_sel_op_external_call = static_cast<uint8_t>(opcode == OpCode::CALL),
        .main_sel_op_static_call = static_cast<uint8_t>(opcode == OpCode::STATICCALL),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_gas_l2.is_indirect)),
        .main_sel_resolve_ind_addr_c = FF(static_cast<uint32_t>(read_addr.is_indirect)),
        .main_sel_resolve_ind_addr_d = FF(static_cast<uint32_t>(read_args.is_indirect)),
        .main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
    });

    pc += Deserialization::get_pc_increment(opcode);

    // Crucial to perform this operation after having incremented pc because write_slice_to_memory
    // is implemented with opcodes (SET and JUMP).
    // Write the success flag to memory
    // write_to_memory(resolved_success_offset, hint.success, AvmMemoryTag::U1);
    // external_call_counter++;

    // Save return data for later.
    // nested_returndata = hint.return_data;

    // Adjust the side_effect_counter to the value at the end of the external call but not static call.
    // if (opcode == OpCode::CALL) {
    //     side_effect_counter = static_cast<uint32_t>(hint.end_side_effect_counter);
    // }
    //
    // We push the current ext call ctx onto the stack and initialize a new one
    current_ext_call_ctx.last_pc = pc;
    current_ext_call_ctx.success_offset = resolved_success_offset,
    external_call_ctx_stack.emplace(current_ext_call_ctx);

    // Ext Ctx setup
    std::vector<FF> calldata;
    read_slice_from_memory(resolved_args_offset, args_size, calldata);

    set_call_ptr(static_cast<uint8_t>(clk));

    current_ext_call_ctx = ExtCallCtx{
        .context_id = static_cast<uint8_t>(clk),
        .parent_id = current_ext_call_ctx.context_id,
        .contract_address = read_addr.val,
        .calldata = calldata,
        .nested_returndata = {},
        .last_pc = 0,
        .success_offset = 0,
        .l2_gas = static_cast<uint32_t>(read_gas_l2.val),
        .da_gas = static_cast<uint32_t>(read_gas_da.val),
        .internal_return_ptr_stack = {},
    };
    set_pc(0);

    return error;
}

/**
 * @brief External Call with direct or indirect memory access.
 *
 * NOTE: we do not constrain this here as it's behaviour will change fully once we have a full enqueued function
 * call in one vm circuit
 * @param indirect byte encoding information about indirect/direct memory access.
 * @param gas_offset An index in memory pointing to the first of the gas value tuple (l2Gas, daGas)
 * @param addr_offset An index in memory pointing to the target contract address
 * @param args_offset An index in memory pointing to the first value of the input array for the external call
 * @param args_size The number of values in the input array for the external call
 * @param success_offset An index in memory pointing to where the success flag (U1) of the external call should be
 * stored
 */
AvmError AvmTraceBuilder::op_call(uint16_t indirect,
                                  uint32_t gas_offset,
                                  uint32_t addr_offset,
                                  uint32_t args_offset,
                                  uint32_t args_size_offset,
                                  uint32_t success_offset)
{
    return constrain_external_call(
        OpCode::CALL, indirect, gas_offset, addr_offset, args_offset, args_size_offset, success_offset);
}

/**
 * @brief Static Call with direct or indirect memory access.
 *
 * NOTE: we do not constrain this here as it's behaviour will change fully once we have a full enqueued function
 * call in one vm circuit
 * @param indirect byte encoding information about indirect/direct memory access.
 * @param gas_offset An index in memory pointing to the first of the gas value tuple (l2Gas, daGas)
 * @param addr_offset An index in memory pointing to the target contract address
 * @param args_offset An index in memory pointing to the first value of the input array for the external call
 * @param args_size The number of values in the input array for the static call
 * @param success_offset An index in memory pointing to where the success flag (U8) of the static call should be
 * stored
 */
AvmError AvmTraceBuilder::op_static_call(uint16_t indirect,
                                         uint32_t gas_offset,
                                         uint32_t addr_offset,
                                         uint32_t args_offset,
                                         uint32_t args_size_offset,
                                         uint32_t success_offset)
{
    return constrain_external_call(
        OpCode::STATICCALL, indirect, gas_offset, addr_offset, args_offset, args_size_offset, success_offset);
}

/**
 * @brief RETURN opcode with direct and indirect memory access, i.e.,
 *        direct:   return(M[ret_offset:ret_offset+ret_size])
 *        indirect: return(M[M[ret_offset]:M[ret_offset]+ret_size])
 *        Simplified version with exclusively memory load operations into
 *        intermediate registers and then values are copied to the returned vector.
 *        TODO: taking care of flagging this row as the last one? Special STOP flag?
 *        TODO: error handling if ret_offset + ret_size > 2^32 which would lead to
 *              out-of-bound memory read.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param ret_offset The starting index of the memory region to be returned.
 * @param ret_size The number of elements to be returned.
 * @return The returned memory region as a std::vector.
 */
ReturnDataError AvmTraceBuilder::op_return(uint8_t indirect, uint32_t ret_offset, uint32_t ret_size_offset)
{

    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    // This boolean will not be a trivial constant once we re-enable constraining address resolution
    bool tag_match = true;

    // Resolve operands
    auto [resolved_addrs, res_error] =
        Addressing<2>::fromWire(indirect, call_ptr).resolve({ ret_offset, ret_size_offset }, mem_trace_builder);
    auto [resolved_ret_offset, resolved_ret_size_offset] = resolved_addrs;
    error = res_error;

    if (is_ok(error) && !(tag_match && check_tag(AvmMemoryTag::U32, resolved_ret_size_offset))) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    const auto ret_size = static_cast<uint32_t>(unconstrained_read_from_memory(resolved_ret_size_offset));

    bool is_top_level = current_ext_call_ctx.context_id == 0;

    if (tag_match) {
        if (is_top_level) {
            // The only memory operation performed from the main trace is a possible indirect load for resolving the
            // direct destination offset stored in main_mem_addr_c.
            // All the other memory operations are triggered by the slice gadget.
            returndata = mem_trace_builder.read_return_opcode(clk, call_ptr, resolved_ret_offset, ret_size);
            slice_trace_builder.create_return_slice(returndata, clk, call_ptr, resolved_ret_offset, ret_size);
            all_returndata.insert(all_returndata.end(), returndata.begin(), returndata.end());

        } else {
            // We are returning from a nested call
            std::vector<FF> returndata{};
            read_slice_from_memory(resolved_ret_offset, ret_size, returndata);
            // Pop the stack
            current_ext_call_ctx = external_call_ctx_stack.top();
            external_call_ctx_stack.pop();
            current_ext_call_ctx.nested_returndata = returndata;
            // Update the call_ptr before we write the success flag
            set_call_ptr(static_cast<uint8_t>(current_ext_call_ctx.context_id));
            write_to_memory(current_ext_call_ctx.success_offset, FF::one(), AvmMemoryTag::U1);
        }
    }

    gas_trace_builder.constrain_gas(clk, OpCode::RETURN, ret_size);

    if (ret_size == 0) {
        main_trace.push_back(Row{
            .main_clk = clk,
            .main_call_ptr = call_ptr,
            .main_ib = ret_size,
            .main_internal_return_ptr = FF(internal_return_ptr),
            .main_op_err = static_cast<uint32_t>(!is_ok(error)),
            .main_pc = pc,
            .main_sel_op_external_return = 1,
        });

        // Update the next pc, if we are at the top level we do what we used to do (i.e. maxing the pc)
        pc = is_top_level ? UINT32_MAX : current_ext_call_ctx.last_pc;

        return ReturnDataError{
            .return_data = {},
            .error = error,
            .is_top_level = is_top_level,
        };
    }

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_call_ptr = call_ptr,
        .main_ib = ret_size,
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_c = resolved_ret_offset,
        .main_op_err = static_cast<uint32_t>(!is_ok(error)),
        .main_pc = pc,
        .main_r_in_tag = static_cast<uint32_t>(AvmMemoryTag::FF),
        .main_sel_op_external_return = 1,
        .main_sel_slice_gadget = static_cast<uint32_t>(is_top_level && tag_match),
        .main_tag_err = static_cast<uint32_t>(!tag_match),
        .main_w_in_tag = static_cast<uint32_t>(AvmMemoryTag::FF),
    });

    // Update the next pc, if we are at the top level we do what we used to do (i.e. maxing the pc)
    pc = is_top_level ? UINT32_MAX : current_ext_call_ctx.last_pc;

    auto return_data = is_top_level ? returndata : current_ext_call_ctx.nested_returndata;

    return ReturnDataError{
        .return_data = return_data,
        .error = error,
        .is_top_level = is_top_level,
    };
}

ReturnDataError AvmTraceBuilder::op_revert(uint8_t indirect, uint32_t ret_offset, uint32_t ret_size_offset)
{
    // TODO: This opcode is still masquerading as RETURN.
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    // This boolean will not be a trivial constant once we re-enable constraining address resolution
    bool tag_match = true;

    auto [resolved_addrs, res_error] =
        Addressing<2>::fromWire(indirect, call_ptr).resolve({ ret_offset, ret_size_offset }, mem_trace_builder);
    auto [resolved_ret_offset, resolved_ret_size_offset] = resolved_addrs;
    error = res_error;

    if (is_ok(error) && !(tag_match && check_tag(AvmMemoryTag::U32, ret_size_offset))) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    const auto ret_size =
        is_ok(error) ? static_cast<uint32_t>(unconstrained_read_from_memory(resolved_ret_size_offset)) : 0;

    bool is_top_level = current_ext_call_ctx.context_id == 0;
    if (tag_match) {
        if (is_top_level) {
            // The only memory operation performed from the main trace is a possible indirect load for resolving the
            // direct destination offset stored in main_mem_addr_c.
            // All the other memory operations are triggered by the slice gadget.
            returndata = mem_trace_builder.read_return_opcode(clk, call_ptr, resolved_ret_offset, ret_size);
            slice_trace_builder.create_return_slice(returndata, clk, call_ptr, resolved_ret_offset, ret_size);
            all_returndata.insert(all_returndata.end(), returndata.begin(), returndata.end());
        } else {
            // We are returning from a nested call
            std::vector<FF> returndata{};
            read_slice_from_memory(resolved_ret_offset, ret_size, returndata);
            // Pop the stack
            current_ext_call_ctx = external_call_ctx_stack.top();
            external_call_ctx_stack.pop();
            current_ext_call_ctx.nested_returndata = returndata;
            // Update the call_ptr before we write the success flag
            set_call_ptr(static_cast<uint8_t>(current_ext_call_ctx.context_id));
            write_to_memory(current_ext_call_ctx.success_offset, FF::one(), AvmMemoryTag::U1);
        }
    }

    gas_trace_builder.constrain_gas(clk, OpCode::REVERT_8, ret_size);

    // TODO: fix and set sel_op_revert
    if (ret_size == 0) {
        main_trace.push_back(Row{
            .main_clk = clk,
            .main_call_ptr = call_ptr,
            .main_ib = ret_size,
            .main_internal_return_ptr = FF(internal_return_ptr),
            .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
            .main_pc = pc,
            .main_sel_op_external_return = 1,
        });

        pc = is_top_level ? UINT32_MAX : current_ext_call_ctx.last_pc;

        return ReturnDataError{
            .return_data = {},
            .error = error,
            .is_top_level = is_top_level,
        };
    }

    // TODO: fix and set sel_op_revert
    main_trace.push_back(Row{
        .main_clk = clk,
        .main_call_ptr = call_ptr,
        .main_ib = ret_size,
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_c = resolved_ret_offset,
        .main_op_err = static_cast<uint32_t>(!is_ok(error)),
        .main_pc = pc,
        .main_r_in_tag = static_cast<uint32_t>(AvmMemoryTag::FF),
        .main_sel_op_external_return = 1,
        .main_sel_slice_gadget = static_cast<uint32_t>(tag_match),
        .main_tag_err = static_cast<uint32_t>(!tag_match),
        .main_w_in_tag = static_cast<uint32_t>(AvmMemoryTag::FF),
    });

    pc = is_top_level ? UINT32_MAX : current_ext_call_ctx.last_pc;
    auto return_data = is_top_level ? returndata : current_ext_call_ctx.nested_returndata;

    if (is_ok(error)) {
        error = AvmError::REVERT_OPCODE;
    }

    // op_valid == true otherwise, ret_size == 0 and we would have returned above.
    return ReturnDataError{
        .return_data = return_data,
        .error = error,
        .is_top_level = is_top_level,
    };
}

/**************************************************************************************************
 *                                   MISC
 **************************************************************************************************/

AvmError AvmTraceBuilder::op_debug_log(uint8_t indirect,
                                       uint32_t message_offset,
                                       uint32_t fields_offset,
                                       uint32_t fields_size_offset,
                                       uint32_t message_size)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] =
        Addressing<3>::fromWire(indirect, call_ptr)
            .resolve({ message_offset, fields_offset, fields_size_offset }, mem_trace_builder);
    auto [resolved_message_offset, resolved_fields_offset, resolved_fields_size_offset] = resolved_addrs;
    error = res_error;

    if (is_ok(error) && !check_tag(AvmMemoryTag::U32, resolved_fields_size_offset)) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    const uint32_t fields_size =
        is_ok(error) ? static_cast<uint32_t>(unconstrained_read_from_memory(resolved_fields_size_offset)) : 0;

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::DEBUGLOG, message_size + fields_size);

    if (is_ok(error) && !(check_tag_range(AvmMemoryTag::U8, resolved_message_offset, message_size) &&
                          check_tag_range(AvmMemoryTag::FF, resolved_fields_offset, fields_size))) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_call_ptr = call_ptr,
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_sel_op_debug_log = FF(1),
    });

    pc += Deserialization::get_pc_increment(OpCode::DEBUGLOG);
    return error;
}

/**************************************************************************************************
 *                                   GADGETS
 **************************************************************************************************/

/**
 * @brief Poseidon2 Permutation with direct or indirect memory access.
 *
 * @param indirect byte encoding information about indirect/direct memory access.
 * @param input_offset An index in memory pointing to the first Field value of the input array to be used in the
 * next instance of poseidon2 permutation.
 * @param output_offset An index in memory pointing to where the first Field value of the output array should be
 * stored.
 */
AvmError AvmTraceBuilder::op_poseidon2_permutation(uint8_t indirect, uint32_t input_offset, uint32_t output_offset)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    // Resolve the indirect flags, the results of this function are used to determine the memory offsets
    // that point to the starting memory addresses for the input, output and h_init values
    // Note::This function will add memory reads at clk in the mem_trace_builder
    auto [resolved_addrs, res_error] =
        Addressing<2>::fromWire(indirect, call_ptr).resolve({ input_offset, output_offset }, mem_trace_builder);
    auto [resolved_input_offset, resolved_output_offset] = resolved_addrs;
    error = res_error;

    // Resolve indirects in the main trace. Do not resolve the value stored in direct addresses.

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::POSEIDON2PERM);

    // These read patterns will be refactored - we perform them here instead of in the poseidon gadget trace
    // even though they are "performed" by the gadget.
    AddressWithMode direct_src_offset = { AddressingMode::DIRECT, resolved_input_offset };
    // This is because passing the mem_builder to the gadget causes some issues regarding copy-move semantics in cpp
    auto read_a = constrained_read_from_memory(call_ptr,
                                               clk,
                                               direct_src_offset,
                                               AvmMemoryTag::FF,
                                               AvmMemoryTag::FF,
                                               IntermRegister::IA,
                                               AvmMemTraceBuilder::POSEIDON2);
    auto read_b = constrained_read_from_memory(call_ptr,
                                               clk,
                                               direct_src_offset + 1,
                                               AvmMemoryTag::FF,
                                               AvmMemoryTag::FF,
                                               IntermRegister::IB,
                                               AvmMemTraceBuilder::POSEIDON2);
    auto read_c = constrained_read_from_memory(call_ptr,
                                               clk,
                                               direct_src_offset + 2,
                                               AvmMemoryTag::FF,
                                               AvmMemoryTag::FF,
                                               IntermRegister::IC,
                                               AvmMemTraceBuilder::POSEIDON2);
    auto read_d = constrained_read_from_memory(call_ptr,
                                               clk,
                                               direct_src_offset + 3,
                                               AvmMemoryTag::FF,
                                               AvmMemoryTag::FF,
                                               IntermRegister::ID,
                                               AvmMemTraceBuilder::POSEIDON2);

    bool read_tag_valid = read_a.tag_match && read_b.tag_match && read_c.tag_match && read_d.tag_match;

    if (is_ok(error) && !read_tag_valid) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    if (is_ok(error)) {
        std::array<FF, 4> input = { read_a.val, read_b.val, read_c.val, read_d.val };
        std::array<FF, 4> result = poseidon2_trace_builder.poseidon2_permutation(
            input, call_ptr, clk, resolved_input_offset, resolved_output_offset);

        std::vector<FF> ff_result;
        for (uint32_t i = 0; i < 4; i++) {
            ff_result.emplace_back(result[i]);
        }
        // Write the result to memory after, see the comments at read to understand why this happens here.
        AddressWithMode direct_dst_offset = { AddressingMode::DIRECT, resolved_output_offset };
        auto write_a = constrained_write_to_memory(call_ptr,
                                                   clk,
                                                   direct_dst_offset,
                                                   ff_result[0],
                                                   AvmMemoryTag::FF,
                                                   AvmMemoryTag::FF,
                                                   IntermRegister::IA,
                                                   AvmMemTraceBuilder::POSEIDON2);
        auto write_b = constrained_write_to_memory(call_ptr,
                                                   clk,
                                                   direct_dst_offset + 1,
                                                   ff_result[1],
                                                   AvmMemoryTag::FF,
                                                   AvmMemoryTag::FF,
                                                   IntermRegister::IB,
                                                   AvmMemTraceBuilder::POSEIDON2);
        auto write_c = constrained_write_to_memory(call_ptr,
                                                   clk,
                                                   direct_dst_offset + 2,
                                                   ff_result[2],
                                                   AvmMemoryTag::FF,
                                                   AvmMemoryTag::FF,
                                                   IntermRegister::IC,
                                                   AvmMemTraceBuilder::POSEIDON2);

        auto write_d = constrained_write_to_memory(call_ptr,
                                                   clk,
                                                   direct_dst_offset + 3,
                                                   ff_result[3],
                                                   AvmMemoryTag::FF,
                                                   AvmMemoryTag::FF,
                                                   IntermRegister::ID,
                                                   AvmMemTraceBuilder::POSEIDON2);

        bool write_tag_valid = write_a.tag_match && write_b.tag_match && write_c.tag_match && write_d.tag_match;
        if (is_ok(error) && !write_tag_valid) {
            error = AvmError::CHECK_TAG_ERROR;
        }
    }

    // Main trace contains on operand values from the bytecode and resolved indirects
    main_trace.push_back(Row{
        .main_clk = clk,
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_a = resolved_input_offset,
        .main_mem_addr_b = resolved_output_offset,
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_sel_op_poseidon2 = FF(1),
    });

    pc += Deserialization::get_pc_increment(OpCode::POSEIDON2PERM);

    return error;
}

/**
 * @brief SHA256 Compression with direct or indirect memory access.
 *
 * @param indirect byte encoding information about indirect/direct memory access.
 * @param state_offset An index in memory pointing to the first U32 value of the state array to be used in the next
 * instance of sha256 compression.
 * @param input_offset An index in memory pointing to the first U32 value of the input array to be used in the next
 * instance of sha256 compression.
 * @param output_offset An index in memory pointing to where the first U32 value of the output array should be
 * stored.
 */
AvmError AvmTraceBuilder::op_sha256_compression(uint8_t indirect,
                                                uint32_t output_offset,
                                                uint32_t state_offset,
                                                uint32_t inputs_offset)
{
    const uint32_t STATE_SIZE = 8;
    const uint32_t INPUTS_SIZE = 16;

    // The clk plays a crucial role in this function as we attempt to write across multiple lines in the main trace.
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;

    // Resolve the indirect flags, the results of this function are used to determine the memory offsets
    // that point to the starting memory addresses for the input and output values.
    auto [resolved_addrs, res_error] = Addressing<3>::fromWire(indirect, call_ptr)
                                           .resolve({ output_offset, state_offset, inputs_offset }, mem_trace_builder);
    auto [resolved_output_offset, resolved_state_offset, resolved_inputs_offset] = resolved_addrs;
    error = res_error;

    auto read_a = constrained_read_from_memory(
        call_ptr, clk, resolved_state_offset, AvmMemoryTag::U32, AvmMemoryTag::FF, IntermRegister::IA);
    auto read_b = constrained_read_from_memory(
        call_ptr, clk, resolved_inputs_offset, AvmMemoryTag::U32, AvmMemoryTag::FF, IntermRegister::IB);
    bool tag_match = read_a.tag_match && read_b.tag_match;

    if (is_ok(error) && !(check_tag_range(AvmMemoryTag::U32, resolved_state_offset, STATE_SIZE) &&
                          check_tag_range(AvmMemoryTag::U32, resolved_inputs_offset, INPUTS_SIZE))) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::SHA256COMPRESSION);

    // Since the above adds mem_reads in the mem_trace_builder at clk, we need to follow up resolving the reads in
    // the main trace at the same clk cycle to preserve the cross-table permutation
    //
    // TODO<#6383>: We put the first value of each of the input, output (which is 0 at this point) and h_init arrays
    // into the main trace at the intermediate registers simply for the permutation check, in the future this will
    // change.
    // Note: we could avoid output being zero if we loaded the input and state beforehand (with a new function that
    // did not lay down constraints), but this is a simplification
    main_trace.push_back(Row{
        .main_clk = clk,
        .main_ia = read_a.val, // First element of state
        .main_ib = read_b.val, // First element of input
        .main_ind_addr_a = FF(read_a.indirect_address),
        .main_ind_addr_b = FF(read_b.indirect_address),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_a = FF(read_a.direct_address),
        .main_mem_addr_b = FF(read_b.direct_address),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_r_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::U32)),
        .main_sel_mem_op_a = FF(1),
        .main_sel_mem_op_b = FF(1),
        .main_sel_op_sha256 = FF(1),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_a.is_indirect)),
        .main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(read_b.is_indirect)),
        .main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
    });

    if (!is_ok(error)) {
        return error;
    }

    // We store the current clk this main trace row occurred so that we can line up the sha256 gadget operation at
    // the same clk later.
    auto sha_op_clk = clk;
    // We need to increment the clk
    clk++;
    // State array input is fixed to 256 bits
    std::vector<uint32_t> h_init_vec;
    // Input for hash is expanded to 512 bits
    std::vector<uint32_t> input_vec;
    // Read results are written to h_init array.
    read_slice_from_memory<uint32_t>(resolved_state_offset, 8, h_init_vec);
    // Read results are written to input array
    read_slice_from_memory<uint32_t>(resolved_inputs_offset, 16, input_vec);

    // Now that we have read all the values, we can perform the operation to get the resulting witness.
    // Note: We use the sha_op_clk to ensure that the sha256 operation is performed at the same clock cycle as the
    // main trace that has the selector
    std::array<uint32_t, 8> h_init = vec_to_arr<uint32_t, 8>(h_init_vec);
    std::array<uint32_t, 16> input = vec_to_arr<uint32_t, 16>(input_vec);

    std::array<uint32_t, 8> result = sha256_trace_builder.sha256_compression(h_init, input, sha_op_clk);
    // We convert the results to field elements here
    std::vector<FF> ff_result;
    for (uint32_t i = 0; i < 8; i++) {
        ff_result.emplace_back(result[i]);
    }

    pc += Deserialization::get_pc_increment(OpCode::SHA256COMPRESSION);

    // Crucial to perform this operation after having incremented pc because write_slice_to_memory
    // is implemented with opcodes (SET and JUMP).
    write_slice_to_memory(resolved_output_offset, AvmMemoryTag::U32, ff_result);

    return AvmError::NO_ERROR;
}

/**
 * @brief Keccakf1600  with direct or indirect memory access.
 * @param indirect byte encoding information about indirect/direct memory access.
 * @param output_offset An index in memory pointing to where the first u64 value of the output array should be
 * stored.
 * @param input_offset An index in memory pointing to the first u64 value of the input array to be used in the next
 * instance of keccakf1600.
 */
AvmError AvmTraceBuilder::op_keccakf1600(uint8_t indirect, uint32_t output_offset, uint32_t input_offset)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] =
        Addressing<2>::fromWire(indirect, call_ptr).resolve({ output_offset, input_offset }, mem_trace_builder);
    auto [resolved_output_offset, resolved_input_offset] = resolved_addrs;
    error = res_error;

    auto input_read = constrained_read_from_memory(
        call_ptr, clk, resolved_input_offset, AvmMemoryTag::U64, AvmMemoryTag::FF, IntermRegister::IA);
    bool tag_match = input_read.tag_match;

    if (is_ok(error) &&
        !(tag_match && check_tag_range(AvmMemoryTag::U64, resolved_input_offset, KECCAKF1600_INPUT_SIZE))) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::KECCAKF1600);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_ia = input_read.val, // First element of input
        .main_ind_addr_a = FF(input_read.indirect_address),
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_a = FF(input_read.direct_address),
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_r_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::U64)),
        .main_sel_mem_op_a = FF(1),
        .main_sel_op_keccak = FF(1),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(input_read.is_indirect)),
        .main_tag_err = FF(static_cast<uint32_t>(!tag_match)),
    });

    if (!is_ok(error)) {
        return error;
    }

    // Array input is fixed to 1600 bits
    std::vector<uint64_t> input_vec;
    // Read results are written to input array
    read_slice_from_memory<uint64_t>(resolved_input_offset, KECCAKF1600_INPUT_SIZE, input_vec);
    std::array<uint64_t, KECCAKF1600_INPUT_SIZE> input = vec_to_arr<uint64_t, KECCAKF1600_INPUT_SIZE>(input_vec);

    // Now that we have read all the values, we can perform the operation to get the resulting witness.
    // Note: We use the keccak_op_clk to ensure that the keccakf1600 operation is performed at the same clock cycle
    // as the main trace that has the selector
    std::array<uint64_t, KECCAKF1600_INPUT_SIZE> result = keccak_trace_builder.keccakf1600(clk, input);

    pc += Deserialization::get_pc_increment(OpCode::KECCAKF1600);

    // Crucial to perform this operation after having incremented pc because write_slice_to_memory
    // is implemented with opcodes (SET and JUMP).
    write_slice_to_memory(resolved_output_offset, AvmMemoryTag::U64, result);

    return AvmError::NO_ERROR;
}

AvmError AvmTraceBuilder::op_ec_add(uint16_t indirect,
                                    uint32_t lhs_x_offset,
                                    uint32_t lhs_y_offset,
                                    uint32_t lhs_is_inf_offset,
                                    uint32_t rhs_x_offset,
                                    uint32_t rhs_y_offset,
                                    uint32_t rhs_is_inf_offset,
                                    uint32_t output_offset)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    auto [resolved_addrs, res_error] = Addressing<7>::fromWire(indirect, call_ptr)
                                           .resolve({ lhs_x_offset,
                                                      lhs_y_offset,
                                                      lhs_is_inf_offset,
                                                      rhs_x_offset,
                                                      rhs_y_offset,
                                                      rhs_is_inf_offset,
                                                      output_offset },
                                                    mem_trace_builder);

    auto [resolved_lhs_x_offset,
          resolved_lhs_y_offset,
          resolved_lhs_is_inf_offset,
          resolved_rhs_x_offset,
          resolved_rhs_y_offset,
          resolved_rhs_is_inf_offset,
          resolved_output_offset] = resolved_addrs;

    error = res_error;

    // Tag checking
    bool tags_valid =
        check_tag(AvmMemoryTag::FF, resolved_lhs_x_offset) && check_tag(AvmMemoryTag::FF, resolved_lhs_y_offset) &&
        check_tag(AvmMemoryTag::U1, resolved_lhs_is_inf_offset) && check_tag(AvmMemoryTag::FF, resolved_rhs_x_offset) &&
        check_tag(AvmMemoryTag::FF, resolved_rhs_y_offset) && check_tag(AvmMemoryTag::U1, resolved_rhs_is_inf_offset);

    if (is_ok(error) && !tags_valid) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    gas_trace_builder.constrain_gas(clk, OpCode::ECADD);

    if (!is_ok(error)) {
        main_trace.push_back(Row{
            .main_clk = clk,
            .main_internal_return_ptr = FF(internal_return_ptr),
            .main_op_err = FF(1),
            .main_pc = FF(pc),
            .main_sel_op_ecadd = 1,
        });
        return error;
    }

    // Load lhs point
    auto lhs_x_read = unconstrained_read_from_memory(resolved_lhs_x_offset);
    auto lhs_y_read = unconstrained_read_from_memory(resolved_lhs_y_offset);
    // Load rhs point
    auto rhs_x_read = unconstrained_read_from_memory(resolved_rhs_x_offset);
    auto rhs_y_read = unconstrained_read_from_memory(resolved_rhs_y_offset);
    // Load the infinite bools separately since they have a different memory tag
    auto lhs_is_inf_read = unconstrained_read_from_memory(resolved_lhs_is_inf_offset);
    auto rhs_is_inf_read = unconstrained_read_from_memory(resolved_rhs_is_inf_offset);

    grumpkin::g1::affine_element lhs = uint8_t(lhs_is_inf_read) == 1
                                           ? grumpkin::g1::affine_element::infinity()
                                           : grumpkin::g1::affine_element{ lhs_x_read, lhs_y_read };
    grumpkin::g1::affine_element rhs = uint8_t(rhs_is_inf_read) == 1
                                           ? grumpkin::g1::affine_element::infinity()
                                           : grumpkin::g1::affine_element{ rhs_x_read, rhs_y_read };
    auto result = ecc_trace_builder.embedded_curve_add(lhs, rhs, clk);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_pc = FF(pc),
        .main_sel_op_ecadd = 1,
        .main_tag_err = FF(0),
    });

    pc += Deserialization::get_pc_increment(OpCode::ECADD);

    // Crucial to perform this operation after having incremented pc because write_slice_to_memory
    // is implemented with opcodes (SET and JUMP).
    // Write point coordinates
    write_to_memory(resolved_output_offset, result.x, AvmMemoryTag::FF);
    write_to_memory(resolved_output_offset + 1, result.y, AvmMemoryTag::FF);
    write_to_memory(resolved_output_offset + 2, result.is_point_at_infinity(), AvmMemoryTag::U1);

    return AvmError::NO_ERROR;
}

AvmError AvmTraceBuilder::op_variable_msm(uint8_t indirect,
                                          uint32_t points_offset,
                                          uint32_t scalars_offset,
                                          uint32_t output_offset,
                                          uint32_t point_length_offset)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;

    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;
    auto [resolved_addrs, res_error] =
        Addressing<4>::fromWire(indirect, call_ptr)
            .resolve({ points_offset, scalars_offset, output_offset, point_length_offset }, mem_trace_builder);
    auto [resolved_points_offset, resolved_scalars_offset, resolved_output_offset, resolved_point_length_offset] =
        resolved_addrs;
    error = res_error;

    if (is_ok(error) && !check_tag(AvmMemoryTag::U32, resolved_point_length_offset)) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    const FF points_length = is_ok(error) ? unconstrained_read_from_memory(resolved_point_length_offset) : 0;

    // Points are stored as [x1, y1, inf1, x2, y2, inf2, ...] with the types [FF, FF, U8, FF, FF, U8, ...]
    const uint32_t num_points = uint32_t(points_length) / 3; // 3 elements per point
    // We need to split up the reads due to the memory tags,
    std::vector<FF> points_coords_vec;
    std::vector<FF> points_inf_vec;
    std::vector<FF> scalars_vec;

    bool tags_valid = true;
    for (uint32_t i = 0; i < num_points; i++) {
        tags_valid = tags_valid && check_tag_range(AvmMemoryTag::FF, resolved_points_offset + 3 * i, 2) &&
                     check_tag(AvmMemoryTag::U1, resolved_points_offset + 3 * i + 2);
    }

    // Scalar read length is num_points* 2 since scalars are stored as lo and hi limbs
    uint32_t scalar_read_length = num_points * 2;

    tags_valid = tags_valid && check_tag_range(AvmMemoryTag::FF, resolved_scalars_offset, scalar_read_length);

    if (is_ok(error) && !tags_valid) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    // TODO(dbanks12): length needs to fit into u32 here or it will certainly
    // run out of gas. Casting/truncating here is not secure.
    gas_trace_builder.constrain_gas(clk, OpCode::MSM, static_cast<uint32_t>(points_length));

    if (!is_ok(error)) {
        main_trace.push_back(Row{
            .main_clk = clk,
            .main_internal_return_ptr = FF(internal_return_ptr),
            .main_op_err = FF(1),
            .main_pc = FF(pc),
            .main_sel_op_msm = 1,
        });

        return error;
    }

    // Loading the points is a bit more complex since we need to read the coordinates and the infinity flags
    // separately The current circuit constraints does not allow for multiple memory tags to be loaded from within
    // the same row. If we could we would be able to replace the following loops with a single read_slice_to_memory
    // call. For now we load the coordinates first and then the infinity flags, and finally splice them together
    // when creating the points

    // Read the coordinates first, +2 since we read 2 points per row, the first load could be indirect
    for (uint32_t i = 0; i < num_points; i++) {
        auto point_x1 = unconstrained_read_from_memory(resolved_points_offset + 3 * i);
        auto point_y1 = unconstrained_read_from_memory(resolved_points_offset + 3 * i + 1);
        auto infty = unconstrained_read_from_memory(resolved_points_offset + 3 * i + 2);
        points_coords_vec.insert(points_coords_vec.end(), { point_x1, point_y1 });
        points_inf_vec.emplace_back(infty);
    }

    // Scalars are easy to read since they are stored as [lo1, hi1, lo2, hi2, ...] with the types [FF, FF, FF,FF,
    // ...]
    read_slice_from_memory(resolved_scalars_offset, scalar_read_length, scalars_vec);

    // Reconstruct Grumpkin points
    std::vector<grumpkin::g1::affine_element> points;
    for (size_t i = 0; i < num_points; i++) {
        grumpkin::g1::Fq x = points_coords_vec[i * 2];
        grumpkin::g1::Fq y = points_coords_vec[i * 2 + 1];
        bool is_inf = points_inf_vec[i] == 1;
        if (is_inf) {
            points.emplace_back(grumpkin::g1::affine_element::infinity());
        } else {
            points.emplace_back(x, y);
        }
    }
    // Reconstruct Grumpkin scalars
    // Scalars are stored as [lo1, hi1, lo2, hi2, ...] with the types [FF, FF, FF, FF, ...]
    std::vector<grumpkin::fr> scalars;
    for (size_t i = 0; i < num_points; i++) {
        FF lo = scalars_vec[i * 2];
        FF hi = scalars_vec[i * 2 + 1];
        // hi is shifted 128 bits
        uint256_t scalar = (uint256_t(hi) << 128) + uint256_t(lo);
        scalars.emplace_back(scalar);
    }
    // Perform the variable MSM - could just put the logic in here since there are no constraints.
    auto result = ecc_trace_builder.variable_msm(points, scalars, clk);

    main_trace.push_back(Row{
        .main_clk = clk,
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_pc = FF(pc),
        .main_sel_op_msm = 1,
        .main_tag_err = FF(0),
    });

    pc += Deserialization::get_pc_increment(OpCode::MSM);

    // Crucial to perform this operation after having incremented pc because write_slice_to_memory
    // is implemented with opcodes (SET and JUMP).
    // Write the result back to memory [x, y, inf] with tags [FF, FF, U8]
    write_to_memory(resolved_output_offset, result.x, AvmMemoryTag::FF);
    write_to_memory(resolved_output_offset + 1, result.y, AvmMemoryTag::FF);
    write_to_memory(resolved_output_offset + 2, result.is_point_at_infinity(), AvmMemoryTag::U1);

    return AvmError::NO_ERROR;
}

/**************************************************************************************************
 *                                   CONVERSIONS
 **************************************************************************************************/

/**
 * @brief To_Radix_BE with direct or indirect memory access.
 *
 * @param indirect A byte encoding information about indirect/direct memory access.
 * @param src_offset An index in memory pointing to the input of the To_Radix_BE conversion.
 * @param dst_offset An index in memory pointing to the output of the To_Radix_BE conversion.
 * @param radix_offset An index in memory pointing to the strict upper bound of each converted limb, i.e., 0 <= limb
 * < radix.
 * @param num_limbs The number of limbs to the value into.
 * @param output_bits Should the output be U1s instead of U8s?
 */
AvmError AvmTraceBuilder::op_to_radix_be(uint8_t indirect,
                                         uint32_t src_offset,
                                         uint32_t dst_offset,
                                         uint32_t radix_offset,
                                         uint32_t num_limbs,
                                         uint8_t output_bits)
{
    // We keep the first encountered error
    AvmError error = AvmError::NO_ERROR;
    auto clk = static_cast<uint32_t>(main_trace.size()) + 1;

    // write output as bits or bytes
    AvmMemoryTag w_in_tag = output_bits > 0 ? AvmMemoryTag::U1 // bits mode
                                            : AvmMemoryTag::U8;

    auto [resolved_addrs, res_error] = Addressing<3>::fromWire(indirect, call_ptr)
                                           .resolve({ src_offset, dst_offset, radix_offset }, mem_trace_builder);
    auto [resolved_src_offset, resolved_dst_offset, resolved_radix_offset] = resolved_addrs;
    error = res_error;

    // Constrain gas cost
    gas_trace_builder.constrain_gas(clk, OpCode::TORADIXBE, num_limbs);

    auto read_src = constrained_read_from_memory(
        call_ptr, clk, resolved_src_offset, AvmMemoryTag::FF, w_in_tag, IntermRegister::IA);
    // TODO(8603): once instructions can have multiple different tags for reads, constrain the radix's read
    // TODO(9497): if simulator fails tag check here, witgen will not. Raise error flag!
    // auto read_radix = constrained_read_from_memory(
    //    call_ptr, clk, resolved_radix_offset, AvmMemoryTag::U32, AvmMemoryTag::U32, IntermRegister::IB);

    if (is_ok(error) && !check_tag(AvmMemoryTag::U32, resolved_radix_offset)) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    auto read_radix = unconstrained_read_from_memory(resolved_radix_offset);

    FF input = read_src.val;

    if (is_ok(error) && !read_src.tag_match) {
        error = AvmError::CHECK_TAG_ERROR;
    }

    // TODO(8603): uncomment
    // uint32_t radix = static_cast<uint32_t>(read_radix.val);
    uint32_t radix = static_cast<uint32_t>(read_radix);

    bool radix_out_of_bounds = radix > 256;
    if (is_ok(error) && radix_out_of_bounds) {
        error = AvmError::RADIX_OUT_OF_BOUNDS;
    }

    // In case of an error, we do not perform the computation.
    // Therefore, we do not create any entry in gadget table and we return a vector of 0.
    std::vector<uint8_t> res = is_ok(error)
                                   ? conversion_trace_builder.op_to_radix_be(input, radix, num_limbs, output_bits, clk)
                                   : std::vector<uint8_t>(num_limbs, 0);

    // This is the row that contains the selector to trigger the sel_op_radix_be
    // In this row, we read the input value and the destination address into register A and B respectively
    main_trace.push_back(Row{
        .main_clk = clk,
        .main_call_ptr = call_ptr,
        .main_ia = input,
        .main_ib = radix,
        .main_ic = num_limbs,
        .main_id = output_bits,
        .main_ind_addr_a = read_src.indirect_address,
        // TODO(8603): uncomment
        //.main_ind_addr_b = read_radix.indirect_address,
        .main_internal_return_ptr = FF(internal_return_ptr),
        .main_mem_addr_a = read_src.direct_address,
        // TODO(8603): uncomment
        //.main_mem_addr_b = read_radix.direct_address,
        .main_op_err = FF(static_cast<uint32_t>(!is_ok(error))),
        .main_pc = FF(pc),
        .main_r_in_tag = FF(static_cast<uint32_t>(AvmMemoryTag::FF)),
        .main_sel_mem_op_a = FF(1),
        // TODO(8603): uncomment
        //.main_sel_mem_op_b = FF(1),
        .main_sel_op_radix_be = FF(1),
        .main_sel_resolve_ind_addr_a = FF(static_cast<uint32_t>(read_src.is_indirect)),
        // TODO(8603): uncomment
        //.main_sel_resolve_ind_addr_b = FF(static_cast<uint32_t>(read_radix.is_indirect)),
        .main_w_in_tag = FF(static_cast<uint32_t>(w_in_tag)),
    });

    pc += Deserialization::get_pc_increment(OpCode::TORADIXBE);

    // Crucial to perform this operation after having incremented pc because write_slice_to_memory
    // is implemented with opcodes (SET and JUMP).
    write_slice_to_memory(resolved_dst_offset, w_in_tag, res);
    return error;
}

/**************************************************************************************************
 *                                   FINALIZE
 **************************************************************************************************/

/**
 * @brief Finalisation of the memory trace and incorporating it to the main trace.
 *        In particular, sorting the memory trace, setting .m_lastAccess and
 *        adding shifted values (first row). The main trace is moved at the end of
 *        this call.
 *
 * @return The main trace
 */
std::vector<Row> AvmTraceBuilder::finalize(bool apply_end_gas_assertions)
{
    // Some sanity checks
    // Check that the final merkle tree lines up with the public inputs
    TreeSnapshots tree_snapshots = merkle_tree_trace_builder.get_tree_snapshots();
    ASSERT(tree_snapshots == public_inputs.end_tree_snapshots);

    vinfo("range_check_required: ", range_check_required);
    vinfo("full_precomputed_tables: ", full_precomputed_tables);

    auto mem_trace = mem_trace_builder.finalize();
    auto conv_trace = conversion_trace_builder.finalize();
    auto sha256_trace = sha256_trace_builder.finalize();
    auto poseidon2_trace = poseidon2_trace_builder.finalize();
    auto keccak_trace = keccak_trace_builder.finalize();
    auto slice_trace = slice_trace_builder.finalize();
    const auto& fixed_gas_table = FixedGasTable::get();
    size_t mem_trace_size = mem_trace.size();
    size_t main_trace_size = main_trace.size();
    size_t alu_trace_size = alu_trace_builder.size();
    size_t conv_trace_size = conv_trace.size();
    size_t sha256_trace_size = sha256_trace.size();
    size_t poseidon2_trace_size = poseidon2_trace.size();
    size_t keccak_trace_size = keccak_trace.size();
    size_t bin_trace_size = bin_trace_builder.size();
    size_t gas_trace_size = gas_trace_builder.size();
    size_t slice_trace_size = slice_trace.size();

    // Range check size is 1 less than it needs to be since we insert a "first row" at the top of the trace at the
    // end, with clk 0 (this doubles as our range check)
    size_t const range_check_size = range_check_required ? UINT16_MAX : 0;
    std::vector<size_t> trace_sizes = { mem_trace_size,
                                        main_trace_size + 1,
                                        alu_trace_size,
                                        range_check_size,
                                        conv_trace_size,
                                        sha256_trace_size,
                                        poseidon2_trace_size,
                                        gas_trace_size + 1,
                                        KERNEL_INPUTS_LENGTH,
                                        KERNEL_OUTPUTS_LENGTH,
                                        /*kernel_trace_size,*/ fixed_gas_table.size(),
                                        slice_trace_size,
                                        current_ext_call_ctx.calldata.size() };
    auto trace_size = std::max_element(trace_sizes.begin(), trace_sizes.end());

    // Before making any changes to the main trace, mark the real rows.
    for (size_t i = 0; i < main_trace_size; i++) {
        main_trace[i].main_sel_execution_row = FF(1);
    }

    // Append row with selector toggling execution end.
    const Row end_exec_row = Row{ .main_sel_execution_end = FF(1) };
    main_trace.emplace_back(end_exec_row);

    // Set selector for toggling execution start (we have the guarantee that at least one row exists in main_trace)
    main_trace[0].main_sel_start_exec = FF(1);

    // We only need to pad with zeroes to the size to the largest trace here,
    // pow_2 padding is handled in the subgroup_size check in BB.
    // Resize the main_trace to accomodate a potential lookup, filling with default empty rows.
    main_trace_size = *trace_size;
    size_t main_trace_size_pre_padding = main_trace.size();
    main_trace.resize(*trace_size);

    /**********************************************************************************************
     * MEMORY TRACE INCLUSION
     **********************************************************************************************/

    // We compute in the main loop the timestamp and global address for next row.
    // Perform initialization for index 0 outside of the loop provided that mem trace exists.
    if (mem_trace_size > 0) {
        main_trace.at(0).mem_tsp =
            FF(AvmMemTraceBuilder::NUM_SUB_CLK * mem_trace.at(0).m_clk + mem_trace.at(0).m_sub_clk);

        main_trace.at(0).mem_glob_addr =
            FF(mem_trace.at(0).m_addr + (static_cast<uint64_t>(mem_trace.at(0).m_space_id) << 32));
    }

    for (size_t i = 0; i < mem_trace_size; i++) {
        auto const& src = mem_trace.at(i);
        auto& dest = main_trace.at(i);

        dest.mem_sel_mem = FF(1);
        dest.mem_clk = FF(src.m_clk);
        dest.mem_addr = FF(src.m_addr);
        dest.mem_space_id = FF(src.m_space_id);
        dest.mem_val = src.m_val;
        dest.mem_rw = FF(static_cast<uint32_t>(src.m_rw));
        dest.mem_r_in_tag = FF(static_cast<uint32_t>(src.r_in_tag));
        dest.mem_w_in_tag = FF(static_cast<uint32_t>(src.w_in_tag));
        dest.mem_tag = FF(static_cast<uint32_t>(src.m_tag));
        dest.mem_tag_err = FF(static_cast<uint32_t>(src.m_tag_err));
        dest.mem_one_min_inv = src.m_one_min_inv;
        dest.mem_sel_mov_ia_to_ic = FF(static_cast<uint32_t>(src.m_sel_mov_ia_to_ic));
        dest.mem_sel_mov_ib_to_ic = FF(static_cast<uint32_t>(src.m_sel_mov_ib_to_ic));
        dest.mem_sel_op_slice = FF(static_cast<uint32_t>(src.m_sel_op_slice));

        dest.incl_mem_tag_err_counts = FF(static_cast<uint32_t>(src.m_tag_err_count_relevant));

        // TODO: Should be a cleaner way to do this in the future. Perhaps an "into_canonical" function in
        // mem_trace_builder
        if (!src.m_sel_op_slice) {
            switch (src.m_sub_clk) {
            case AvmMemTraceBuilder::SUB_CLK_LOAD_A:
                src.poseidon_mem_op ? dest.mem_sel_op_poseidon_read_a = 1 : dest.mem_sel_op_a = 1;
                break;
            case AvmMemTraceBuilder::SUB_CLK_STORE_A:
                src.poseidon_mem_op ? dest.mem_sel_op_poseidon_write_a = 1 : dest.mem_sel_op_a = 1;
                break;
            case AvmMemTraceBuilder::SUB_CLK_LOAD_B:
                src.poseidon_mem_op ? dest.mem_sel_op_poseidon_read_b = 1 : dest.mem_sel_op_b = 1;
                break;
            case AvmMemTraceBuilder::SUB_CLK_STORE_B:
                src.poseidon_mem_op ? dest.mem_sel_op_poseidon_write_b = 1 : dest.mem_sel_op_b = 1;
                break;
            case AvmMemTraceBuilder::SUB_CLK_LOAD_C:
                src.poseidon_mem_op ? dest.mem_sel_op_poseidon_read_c = 1 : dest.mem_sel_op_c = 1;
                break;
            case AvmMemTraceBuilder::SUB_CLK_STORE_C:
                src.poseidon_mem_op ? dest.mem_sel_op_poseidon_write_c = 1 : dest.mem_sel_op_c = 1;
                break;
            case AvmMemTraceBuilder::SUB_CLK_LOAD_D:
                src.poseidon_mem_op ? dest.mem_sel_op_poseidon_read_d = 1 : dest.mem_sel_op_d = 1;
                break;
            case AvmMemTraceBuilder::SUB_CLK_STORE_D:
                src.poseidon_mem_op ? dest.mem_sel_op_poseidon_write_d = 1 : dest.mem_sel_op_d = 1;
                break;
            case AvmMemTraceBuilder::SUB_CLK_IND_LOAD_A:
                dest.mem_sel_resolve_ind_addr_a = 1;
                break;
            case AvmMemTraceBuilder::SUB_CLK_IND_LOAD_B:
                dest.mem_sel_resolve_ind_addr_b = 1;
                break;
            case AvmMemTraceBuilder::SUB_CLK_IND_LOAD_C:
                dest.mem_sel_resolve_ind_addr_c = 1;
                break;
            case AvmMemTraceBuilder::SUB_CLK_IND_LOAD_D:
                dest.mem_sel_resolve_ind_addr_d = 1;
                break;
            default:
                break;
            }
        }

        if (src.m_sel_op_slice) {
            dest.mem_skip_check_tag = dest.mem_sel_op_b * (-dest.mem_sel_mov_ib_to_ic + 1) + dest.mem_sel_op_slice;
        }

        if (i + 1 < mem_trace_size) {
            auto const& next = mem_trace.at(i + 1);
            auto& dest_next = main_trace.at(i + 1);
            dest_next.mem_tsp = FF(AvmMemTraceBuilder::NUM_SUB_CLK * next.m_clk + next.m_sub_clk);
            dest_next.mem_glob_addr = FF(next.m_addr + (static_cast<uint64_t>(next.m_space_id) << 32));

            FF diff{};
            if (dest_next.mem_glob_addr == dest.mem_glob_addr) {
                diff = dest_next.mem_tsp - dest.mem_tsp;
            } else {
                diff = dest_next.mem_glob_addr - dest.mem_glob_addr;
                dest.mem_lastAccess = FF(1);
            }
            dest.mem_sel_rng_chk = FF(1);

            // Mem Address row differences are range checked to 40 bits, and the inter-trace index is the timestamp
            // Decomposition of diff
            dest.mem_diff = diff;
            auto diff_u64 = static_cast<uint64_t>(diff);
            // 16 bit decomposition
            auto mem_u16_r0 = static_cast<uint16_t>(diff_u64);
            dest.mem_u16_r0 = FF(mem_u16_r0);
            mem_trace_builder.mem_rng_chk_u16_0_counts[mem_u16_r0]++;
            // Next 16 bits
            auto mem_u16_r1 = static_cast<uint16_t>(diff_u64 >> 16);
            dest.mem_u16_r1 = FF(mem_u16_r1);
            mem_trace_builder.mem_rng_chk_u16_1_counts[mem_u16_r1]++;
            // Final 8 bits
            auto mem_u8_r0 = static_cast<uint8_t>(diff_u64 >> 32);
            dest.mem_u8_r0 = FF(mem_u8_r0);
            mem_trace_builder.mem_rng_chk_u8_counts[mem_u8_r0]++;

        } else {
            dest.mem_lastAccess = FF(1);
            dest.mem_last = FF(1);
        }
    }
    /**********************************************************************************************
     * ALU TRACE INCLUSION
     **********************************************************************************************/
    // Finalize cmp gadget of the ALU trace
    auto cmp_trace_size = alu_trace_builder.cmp_builder.get_cmp_trace_size();
    if (main_trace_size < cmp_trace_size) {
        main_trace_size = cmp_trace_size;
        main_trace.resize(cmp_trace_size, {});
    }
    std::vector<AvmCmpBuilder::CmpEntry> cmp_trace = alu_trace_builder.cmp_builder.finalize();
    auto cmp_trace_canonical = alu_trace_builder.cmp_builder.into_canonical(cmp_trace);
    for (size_t i = 0; i < cmp_trace_canonical.size(); i++) {
        alu_trace_builder.cmp_builder.merge_into(main_trace.at(i), cmp_trace_canonical.at(i));
    }

    alu_trace_builder.finalize(main_trace);

    /**********************************************************************************************
     * GADGET TABLES INCLUSION
     **********************************************************************************************/

    // Add Conversion Gadget table
    for (size_t i = 0; i < conv_trace_size; i++) {
        auto const& src = conv_trace.at(i);
        auto& dest = main_trace.at(i);
        dest.conversion_sel_to_radix_be = FF(static_cast<uint8_t>(src.to_radix_be_sel));
        dest.conversion_clk = FF(src.conversion_clk);
        dest.conversion_input = src.input;
        dest.conversion_radix = FF(src.radix);
        dest.conversion_num_limbs = FF(src.num_limbs);
        dest.conversion_output_bits = FF(src.output_bits);
    }

    // Add SHA256 Gadget table
    for (size_t i = 0; i < sha256_trace_size; i++) {
        auto const& src = sha256_trace.at(i);
        auto& dest = main_trace.at(i);
        dest.sha256_clk = FF(src.clk);
        dest.sha256_input = src.input[0];
        // TODO: This will need to be enabled later
        // dest.sha256_output = src.output[0];
        dest.sha256_sel_sha256_compression = FF(1);
        dest.sha256_state = src.state[0];
    }

    // Add Poseidon2 Gadget table
    for (size_t i = 0; i < poseidon2_trace_size; i++) {
        auto& dest = main_trace.at(i);
        auto const& src = poseidon2_trace.at(i);
        dest.poseidon2_clk = FF(src.clk);
        merge_into(dest, src);
    }

    // Add KeccakF1600 Gadget table
    for (size_t i = 0; i < keccak_trace_size; i++) {
        auto const& src = keccak_trace.at(i);
        auto& dest = main_trace.at(i);
        dest.keccakf1600_clk = FF(src.clk);
        dest.keccakf1600_input = FF(src.input[0]);
        // TODO: This will need to be enabled later
        // dest.keccakf1600_output = src.output[0];
        dest.keccakf1600_sel_keccakf1600 = FF(1);
    }

    /**********************************************************************************************
     * SLICE TRACE INCLUSION
     **********************************************************************************************/
    for (size_t i = 0; i < slice_trace_size; i++) {
        merge_into(main_trace.at(i), slice_trace.at(i));
    }

    /**********************************************************************************************
     * BINARY TRACE INCLUSION
     **********************************************************************************************/

    bin_trace_builder.finalize(main_trace);

    /**********************************************************************************************
     * GAS TRACE INCLUSION
     **********************************************************************************************/

    gas_trace_builder.finalize(main_trace);

    if (apply_end_gas_assertions) {
        // Sanity check that the amount of gas consumed matches what we expect from the public inputs
        auto last_l2_gas_remaining = main_trace.back().main_l2_gas_remaining;
        auto expected_end_gas_l2 = public_inputs.gas_settings.gas_limits.l2_gas - public_inputs.end_gas_used.l2_gas;
        vinfo("Last L2 gas remaining: ", last_l2_gas_remaining);
        vinfo("Expected end gas L2: ", expected_end_gas_l2);
        ASSERT(last_l2_gas_remaining == expected_end_gas_l2);
        auto last_da_gas_remaining = main_trace.back().main_da_gas_remaining;
        auto expected_end_gas_da = public_inputs.gas_settings.gas_limits.da_gas - public_inputs.end_gas_used.da_gas;
        ASSERT(last_da_gas_remaining == expected_end_gas_da);
    }

    /**********************************************************************************************
     * KERNEL TRACE INCLUSION
     **********************************************************************************************/

    // kernel_trace_builder.finalize(main_trace);

    /**********************************************************************************************
     * BYTECODE TRACE INCLUSION
     **********************************************************************************************/

    bytecode_trace_builder.build_bytecode_hash_columns();
    // Should not have to resize in the future, but for now we do
    if (bytecode_trace_builder.total_bytecode_length() > main_trace_size) {
        main_trace_size = bytecode_trace_builder.total_bytecode_length();
        main_trace.resize(main_trace_size);
    }
    bytecode_trace_builder.finalize(main_trace);

    /**********************************************************************************************
     * ONLY FIXED TABLES FROM HERE ON
     **********************************************************************************************/

    main_trace.insert(main_trace.begin(), Row{ .main_sel_first = FF(1), .mem_lastAccess = FF(1) });

    /**********************************************************************************************
     * BYTES TRACE INCLUSION
     **********************************************************************************************/

    // Only generate precomputed byte tables if we are actually going to use them in this main trace.
    if (bin_trace_size > 0 || full_precomputed_tables) {
        if (!range_check_required) {
            FixedBytesTable::get().finalize_for_testing(main_trace, bin_trace_builder.byte_operation_counter);
            bin_trace_builder.finalize_lookups_for_testing(main_trace);
        } else {
            FixedBytesTable::get().finalize(main_trace);
            bin_trace_builder.finalize_lookups(main_trace);
        }
    }

    /**********************************************************************************************
     * RANGE CHECKS AND SELECTORS INCLUSION
     **********************************************************************************************/
    // HOOBOY THIS IS A DOOZY, we gotta extract the range check builder from the cmp which is in the alu
    auto cmp_range_check_entries = alu_trace_builder.cmp_builder.range_check_builder;
    range_check_builder.combine_range_builders(cmp_range_check_entries);
    // Add the range check counts to the main trace
    auto range_entries = range_check_builder.finalize();

    auto const old_trace_size = main_trace.size();

    auto new_trace_size =
        range_check_required
            ? old_trace_size
            : finalize_rng_chks_for_testing(
                  main_trace, alu_trace_builder, mem_trace_builder, range_check_builder, gas_trace_builder);

    for (size_t i = 0; i < new_trace_size; i++) {
        auto& r = main_trace.at(i);

        if (r.main_tag_err == FF(1)) {
            r.main_op_err = FF(1); // Consolidation of errors into main_op_err
        }

        if ((r.main_sel_op_add == FF(1) || r.main_sel_op_sub == FF(1) || r.main_sel_op_mul == FF(1) ||
             r.main_sel_op_eq == FF(1) || r.main_sel_op_not == FF(1) || r.main_sel_op_lt == FF(1) ||
             r.main_sel_op_lte == FF(1) || r.main_sel_op_cast == FF(1) || r.main_sel_op_shr == FF(1) ||
             r.main_sel_op_shl == FF(1) || r.main_sel_op_div == FF(1)) &&
            r.main_op_err == FF(0)) {
            r.main_sel_alu = FF(1); // From error consolidation, this is set only if tag_err == 0.
        }

        if (r.main_sel_op_internal_call == FF(1) || r.main_sel_op_internal_return == FF(1)) {
            r.main_space_id = INTERNAL_CALL_SPACE_ID;
        } else {
            r.main_space_id = r.main_call_ptr;
        };

        r.main_clk = i >= old_trace_size ? r.main_clk : FF(i);
        auto counter = i >= old_trace_size ? static_cast<uint32_t>(r.main_clk) : static_cast<uint32_t>(i);
        r.incl_main_tag_err_counts = mem_trace_builder.m_tag_err_lookup_counts[static_cast<uint32_t>(counter)];

        if (counter <= UINT8_MAX) {
            auto counter_u8 = static_cast<uint8_t>(counter);
            r.lookup_pow_2_0_counts = alu_trace_builder.u8_pow_2_counters[0][counter_u8];
            r.lookup_pow_2_1_counts = alu_trace_builder.u8_pow_2_counters[1][counter_u8];
            r.lookup_mem_rng_chk_2_counts = mem_trace_builder.mem_rng_chk_u8_counts[counter_u8];
            r.main_sel_rng_8 = FF(1);
            r.lookup_rng_chk_pow_2_counts = range_check_builder.powers_of_2_counts[counter_u8];

            // Also merge the powers of 2 table.
            merge_into(r, FixedPowersTable::get().at(counter));
        }

        if (counter <= UINT16_MAX) {
            // We add to the clk here in case our trace is smaller than our range checks
            // These are here for now until remove fully clean out the other lookups
            r.lookup_rng_chk_0_counts = range_check_builder.u16_range_chk_counters[0][uint16_t(counter)];
            r.lookup_rng_chk_1_counts = range_check_builder.u16_range_chk_counters[1][uint16_t(counter)];
            r.lookup_rng_chk_2_counts = range_check_builder.u16_range_chk_counters[2][uint16_t(counter)];
            r.lookup_rng_chk_3_counts = range_check_builder.u16_range_chk_counters[3][uint16_t(counter)];
            r.lookup_rng_chk_4_counts = range_check_builder.u16_range_chk_counters[4][uint16_t(counter)];
            r.lookup_rng_chk_5_counts = range_check_builder.u16_range_chk_counters[5][uint16_t(counter)];
            r.lookup_rng_chk_6_counts = range_check_builder.u16_range_chk_counters[6][uint16_t(counter)];
            r.lookup_rng_chk_7_counts = range_check_builder.u16_range_chk_counters[7][uint16_t(counter)];
            r.lookup_rng_chk_diff_counts = range_check_builder.dyn_diff_counts[uint16_t(counter)];
            r.lookup_mem_rng_chk_0_counts = mem_trace_builder.mem_rng_chk_u16_0_counts[uint16_t(counter)];
            r.lookup_mem_rng_chk_1_counts = mem_trace_builder.mem_rng_chk_u16_1_counts[uint16_t(counter)];
            r.lookup_l2_gas_rng_chk_0_counts = gas_trace_builder.rem_gas_rng_check_counts[0][uint16_t(counter)];
            r.lookup_l2_gas_rng_chk_1_counts = gas_trace_builder.rem_gas_rng_check_counts[1][uint16_t(counter)];
            r.lookup_da_gas_rng_chk_0_counts = gas_trace_builder.rem_gas_rng_check_counts[2][uint16_t(counter)];
            r.lookup_da_gas_rng_chk_1_counts = gas_trace_builder.rem_gas_rng_check_counts[3][uint16_t(counter)];
            r.main_sel_rng_16 = FF(1);
        }
    }
    // In case the range entries are larger than the main trace, we need to resize the main trace
    // Normally this would happen at the start of finalize, but we cannot finalize the range checks until after gas
    // :(
    if (range_entries.size() > new_trace_size) {
        main_trace.resize(range_entries.size(), {});
        new_trace_size = range_entries.size();
    }
    // We do this after we set up the table so we ensure the main trace is long enough to accomodate
    // range_entries.size() -- this feels weird and should be cleaned up
    for (size_t i = 0; i < range_entries.size(); i++) {
        range_check_builder.merge_into(main_trace[i], range_entries[i]);
    }

    /**********************************************************************************************
     * OTHER STUFF
     **********************************************************************************************/

    // Add the kernel inputs and outputs
    // kernel_trace_builder.finalize_columns(main_trace);

    // calldata column inclusion and selector
    for (size_t i = 0; i < all_calldata.size(); i++) {
        main_trace.at(i).main_calldata = all_calldata.at(i);
        main_trace.at(i).main_sel_calldata = 1;
    }

    // calldata loookup counts for calldatacopy operations
    for (auto const& [cd_offset, count] : slice_trace_builder.cd_lookup_counts) {
        main_trace.at(cd_offset).lookup_cd_value_counts = count;
    }

    // returndata column inclusion and selector
    for (size_t i = 0; i < all_returndata.size(); i++) {
        main_trace.at(i).main_returndata = all_returndata.at(i);
        main_trace.at(i).main_sel_returndata = 1;
    }

    // returndata loookup counts for return operations
    for (auto const& [cd_offset, count] : slice_trace_builder.ret_lookup_counts) {
        main_trace.at(cd_offset).lookup_ret_value_counts = count;
    }

    // Get tag_err counts from the mem_trace_builder
    if (range_check_required) {
        finalise_mem_trace_lookup_counts();
    }

    // Add the gas costs table to the main trace
    // For each opcode we write its l2 gas cost and da gas cost
    for (size_t i = 0; i < fixed_gas_table.size(); i++) {
        merge_into(main_trace.at(i), fixed_gas_table.at(i));
    }
    // Finalize the gas -> fixed gas lookup counts.
    gas_trace_builder.finalize_lookups(main_trace);

    auto trace = std::move(main_trace);

    vinfo("Trace sizes before padding:",
          "\n\tmain_trace_size: ",
          main_trace_size_pre_padding,
          "\n\tmem_trace_size: ",
          mem_trace_size,
          "\n\talu_trace_size: ",
          alu_trace_size,
          "\n\trange_check_size: ",
          range_check_size + 1, // The manually inserted first row is part of the range check
          "\n\tconv_trace_size: ",
          conv_trace_size,
          "\n\tbin_trace_size: ",
          bin_trace_size,
          "\n\tsha256_trace_size: ",
          sha256_trace_size,
          "\n\tposeidon2_trace_size: ",
          poseidon2_trace_size,
          "\n\tgas_trace_size: ",
          gas_trace_size,
          "\n\tfixed_gas_table_size: ",
          fixed_gas_table.size(),
          "\n\tslice_trace_size: ",
          slice_trace_size,
          "\n\trange_check_trace_size: ",
          range_entries.size(),
          "\n\tcmp_trace_size: ",
          cmp_trace_size,
          "\n\tkeccak_trace_size: ",
          keccak_trace_size,
          // "\n\tkernel_trace_size: ",
          // kernel_trace_size,
          "\n\tKERNEL_INPUTS_LENGTH: ",
          KERNEL_INPUTS_LENGTH,
          "\n\tKERNEL_OUTPUTS_LENGTH: ",
          KERNEL_OUTPUTS_LENGTH,
          "\n\tcalldata_size: ",
          current_ext_call_ctx.calldata.size());
    reset();

    return trace;
}

/**
 * @brief Resetting the internal state so that a new trace can be rebuilt using the same object.
 *
 */
void AvmTraceBuilder::reset()
{
    main_trace.clear();
    main_trace.shrink_to_fit(); // Reclaim memory.
    mem_trace_builder.reset();
    alu_trace_builder.reset();
    bin_trace_builder.reset();
    // kernel_trace_builder.reset();
    gas_trace_builder.reset();
    conversion_trace_builder.reset();
    sha256_trace_builder.reset();
    poseidon2_trace_builder.reset();
    keccak_trace_builder.reset();
    slice_trace_builder.reset();

    external_call_counter = 0;
}

} // namespace bb::avm_trace
