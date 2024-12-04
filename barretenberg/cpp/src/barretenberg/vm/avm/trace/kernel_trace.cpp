#include "barretenberg/vm/avm/trace/kernel_trace.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/vm/avm/generated/full_row.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/finalization.hpp"
#include "barretenberg/vm/avm/trace/trace.hpp"
#include "barretenberg/vm/constants.hpp"

#include <cstdint>
#include <sys/types.h>

// For the meantime, we do not fire around the public inputs as a vector or otherwise
// Instead we fire them around as a fixed length array from the kernel, as that is how they will be

namespace bb::avm_trace {

void AvmKernelTraceBuilder::reset()
{
    kernel_trace.clear();
    kernel_trace.shrink_to_fit(); // Reclaim memory.
    kernel_input_selector_counter.clear();
    kernel_output_selector_counter.clear();
}

FF AvmKernelTraceBuilder::perform_kernel_input_lookup(uint32_t selector)
{
    FF result = std::get<0>(public_inputs)[selector];
    kernel_input_selector_counter[selector]++;
    return result;
}

void AvmKernelTraceBuilder::perform_kernel_output_lookup(uint32_t write_offset,
                                                         uint32_t side_effect_counter,
                                                         const FF& value,
                                                         const FF& metadata)
{
    std::get<KERNEL_OUTPUTS_VALUE>(public_inputs)[write_offset] = value;
    std::get<KERNEL_OUTPUTS_SIDE_EFFECT_COUNTER>(public_inputs)[write_offset] = side_effect_counter;
    std::get<KERNEL_OUTPUTS_METADATA>(public_inputs)[write_offset] = metadata;

    // Lookup counts
    kernel_output_selector_counter[write_offset]++;
}

// We want to be able to get the return value from the public inputs column
// Get the return value, this will be places in ia
// We read from the public inputs that were provided to the kernel
FF AvmKernelTraceBuilder::op_address(uint32_t clk)
{
    KernelTraceEntry entry = {
        .clk = clk,
        .operation = KernelTraceOpType::ADDRESS,
    };
    kernel_trace.push_back(entry);
    return perform_kernel_input_lookup(ADDRESS_KERNEL_INPUTS_COL_OFFSET);
}

FF AvmKernelTraceBuilder::op_sender(uint32_t clk)
{
    KernelTraceEntry entry = {
        .clk = clk,
        .operation = KernelTraceOpType::SENDER,
    };
    kernel_trace.push_back(entry);
    return perform_kernel_input_lookup(SENDER_KERNEL_INPUTS_COL_OFFSET);
}

FF AvmKernelTraceBuilder::op_function_selector(uint32_t clk)
{
    KernelTraceEntry entry = {
        .clk = clk,
        .operation = KernelTraceOpType::FUNCTION_SELECTOR,
    };
    kernel_trace.push_back(entry);
    return perform_kernel_input_lookup(FUNCTION_SELECTOR_KERNEL_INPUTS_COL_OFFSET);
}

FF AvmKernelTraceBuilder::op_transaction_fee(uint32_t clk)
{
    KernelTraceEntry entry = {
        .clk = clk,
        .operation = KernelTraceOpType::TRANSACTION_FEE,
    };
    kernel_trace.push_back(entry);
    return perform_kernel_input_lookup(TRANSACTION_FEE_KERNEL_INPUTS_COL_OFFSET);
}

FF AvmKernelTraceBuilder::op_chain_id(uint32_t clk)
{
    KernelTraceEntry entry = {
        .clk = clk,
        .operation = KernelTraceOpType::CHAIN_ID,
    };
    kernel_trace.push_back(entry);
    return perform_kernel_input_lookup(CHAIN_ID_KERNEL_INPUTS_COL_OFFSET);
}

FF AvmKernelTraceBuilder::op_version(uint32_t clk)
{
    KernelTraceEntry entry = {
        .clk = clk,
        .operation = KernelTraceOpType::VERSION,
    };
    kernel_trace.push_back(entry);
    return perform_kernel_input_lookup(VERSION_KERNEL_INPUTS_COL_OFFSET);
}

FF AvmKernelTraceBuilder::op_block_number(uint32_t clk)
{
    KernelTraceEntry entry = {
        .clk = clk,
        .operation = KernelTraceOpType::BLOCK_NUMBER,
    };
    kernel_trace.push_back(entry);
    return perform_kernel_input_lookup(BLOCK_NUMBER_KERNEL_INPUTS_COL_OFFSET);
}

FF AvmKernelTraceBuilder::op_timestamp(uint32_t clk)
{
    KernelTraceEntry entry = {
        .clk = clk,
        .operation = KernelTraceOpType::TIMESTAMP,
    };
    kernel_trace.push_back(entry);
    return perform_kernel_input_lookup(TIMESTAMP_KERNEL_INPUTS_COL_OFFSET);
}

FF AvmKernelTraceBuilder::op_fee_per_da_gas(uint32_t clk)
{
    KernelTraceEntry entry = {
        .clk = clk,
        .operation = KernelTraceOpType::FEE_PER_DA_GAS,
    };
    kernel_trace.push_back(entry);
    return perform_kernel_input_lookup(FEE_PER_DA_GAS_KERNEL_INPUTS_COL_OFFSET);
}

FF AvmKernelTraceBuilder::op_fee_per_l2_gas(uint32_t clk)
{
    KernelTraceEntry entry = {
        .clk = clk,
        .operation = KernelTraceOpType::FEE_PER_L2_GAS,
    };
    kernel_trace.push_back(entry);
    return perform_kernel_input_lookup(FEE_PER_L2_GAS_KERNEL_INPUTS_COL_OFFSET);
}

FF AvmKernelTraceBuilder::op_is_static_call(uint32_t clk)
{
    KernelTraceEntry entry = {
        .clk = clk,
        .operation = KernelTraceOpType::IS_STATIC_CALL,
    };
    kernel_trace.push_back(entry);
    return perform_kernel_input_lookup(IS_STATIC_CALL_KERNEL_INPUTS_COL_OFFSET);
}

// TODO(https://github.com/AztecProtocol/aztec-packages/issues/6481): need to process hint from avm in order to know if
// output should be set to true or not
void AvmKernelTraceBuilder::op_note_hash_exists(uint32_t clk,
                                                uint32_t side_effect_counter,
                                                const FF& note_hash,
                                                uint32_t result)
{

    uint32_t offset = START_NOTE_HASH_EXISTS_WRITE_OFFSET + note_hash_exists_offset;
    // TODO(#8287)Lookups are heavily underconstrained atm
    if (result == 1) {
        perform_kernel_output_lookup(offset, side_effect_counter, note_hash, FF(result));
    } else {
        // if the note_hash does NOT exist, the public inputs already contains the correct output value (i.e. the
        // actual value at the index), so we don't try to overwrite the value
        std::get<KERNEL_OUTPUTS_SIDE_EFFECT_COUNTER>(public_inputs)[offset] = side_effect_counter;
        std::get<KERNEL_OUTPUTS_METADATA>(public_inputs)[offset] = FF(result);
        kernel_output_selector_counter[offset]++;
    }
    note_hash_exists_offset++;

    KernelTraceEntry entry = {
        .clk = clk,
        .kernel_out_offset = offset,
        .operation = KernelTraceOpType::NOTE_HASH_EXISTS,
    };
    kernel_trace.push_back(entry);
}

void AvmKernelTraceBuilder::op_emit_note_hash(uint32_t clk, uint32_t side_effect_counter, const FF& note_hash)
{
    uint32_t offset = START_EMIT_NOTE_HASH_WRITE_OFFSET + emit_note_hash_offset;
    perform_kernel_output_lookup(offset, side_effect_counter, note_hash, FF(0));
    emit_note_hash_offset++;

    KernelTraceEntry entry = {
        .clk = clk,
        .kernel_out_offset = offset,
        .operation = KernelTraceOpType::EMIT_NOTE_HASH,
    };
    kernel_trace.push_back(entry);
}

// TODO(https://github.com/AztecProtocol/aztec-packages/issues/6481): need to process hint from avm in order to know if
// output should be set to true or not
void AvmKernelTraceBuilder::op_nullifier_exists(uint32_t clk,
                                                uint32_t side_effect_counter,
                                                const FF& nullifier,
                                                uint32_t result)
{
    uint32_t offset = 0;
    if (result == 1) {
        offset = START_NULLIFIER_EXISTS_OFFSET + nullifier_exists_offset;
        nullifier_exists_offset++;
    } else {
        offset = START_NULLIFIER_NON_EXISTS_OFFSET + nullifier_non_exists_offset;
        nullifier_non_exists_offset++;
    }
    perform_kernel_output_lookup(offset, side_effect_counter, nullifier, FF(result));

    KernelTraceEntry entry = {
        .clk = clk,
        .kernel_out_offset = offset,
        .operation = KernelTraceOpType::NULLIFIER_EXISTS,
    };
    kernel_trace.push_back(entry);
}

void AvmKernelTraceBuilder::op_emit_nullifier(uint32_t clk, uint32_t side_effect_counter, const FF& nullifier)
{
    uint32_t offset = START_EMIT_NULLIFIER_WRITE_OFFSET + emit_nullifier_offset;
    perform_kernel_output_lookup(offset, side_effect_counter, nullifier, FF(0));
    emit_nullifier_offset++;

    KernelTraceEntry entry = {
        .clk = clk,
        .kernel_out_offset = offset,
        .operation = KernelTraceOpType::EMIT_NULLIFIER,
    };
    kernel_trace.push_back(entry);
}

// TODO(https://github.com/AztecProtocol/aztec-packages/issues/6481): need to process hint from avm in order to know if
// output should be set to true or not
void AvmKernelTraceBuilder::op_l1_to_l2_msg_exists(uint32_t clk,
                                                   uint32_t side_effect_counter,
                                                   const FF& message,
                                                   uint32_t result)
{
    uint32_t offset = START_L1_TO_L2_MSG_EXISTS_WRITE_OFFSET + l1_to_l2_msg_exists_offset;
    // TODO(#8287)Lookups are heavily underconstrained atm
    if (result == 1) {
        perform_kernel_output_lookup(offset, side_effect_counter, message, FF(result));
    } else {
        // if the l1_to_l2_msg_exists is false, the public inputs already contains the correct output value (i.e. the
        // actual value at the index), so we don't try to overwrite the value
        std::get<KERNEL_OUTPUTS_SIDE_EFFECT_COUNTER>(public_inputs)[offset] = side_effect_counter;
        std::get<KERNEL_OUTPUTS_METADATA>(public_inputs)[offset] = FF(result);
        kernel_output_selector_counter[offset]++;
    }
    l1_to_l2_msg_exists_offset++;

    KernelTraceEntry entry = {
        .clk = clk,
        .kernel_out_offset = offset,
        .operation = KernelTraceOpType::L1_TO_L2_MSG_EXISTS,
    };
    kernel_trace.push_back(entry);
}

void AvmKernelTraceBuilder::op_emit_unencrypted_log(uint32_t clk,
                                                    uint32_t side_effect_counter,
                                                    const FF& log_hash,
                                                    const FF& log_length)
{
    uint32_t offset = START_EMIT_UNENCRYPTED_LOG_WRITE_OFFSET + emit_unencrypted_log_offset;
    perform_kernel_output_lookup(offset, side_effect_counter, log_hash, log_length);
    emit_unencrypted_log_offset++;

    KernelTraceEntry entry = {
        .clk = clk,
        .kernel_out_offset = offset,
        .operation = KernelTraceOpType::EMIT_UNENCRYPTED_LOG,
    };
    kernel_trace.push_back(entry);
}

void AvmKernelTraceBuilder::op_emit_l2_to_l1_msg(uint32_t clk,
                                                 uint32_t side_effect_counter,
                                                 const FF& l2_to_l1_msg,
                                                 const FF& recipient)
{
    uint32_t offset = START_EMIT_L2_TO_L1_MSG_WRITE_OFFSET + emit_l2_to_l1_msg_offset;
    perform_kernel_output_lookup(offset, side_effect_counter, l2_to_l1_msg, recipient);
    emit_l2_to_l1_msg_offset++;

    KernelTraceEntry entry = {
        .clk = clk,
        .kernel_out_offset = offset,
        .operation = KernelTraceOpType::EMIT_L2_TO_L1_MSG,
    };
    kernel_trace.push_back(entry);
}

void AvmKernelTraceBuilder::op_sload(uint32_t clk, uint32_t side_effect_counter, const FF& slot, const FF& value)
{
    uint32_t offset = START_SLOAD_WRITE_OFFSET + sload_write_offset;
    perform_kernel_output_lookup(offset, side_effect_counter, value, slot);
    sload_write_offset++;

    KernelTraceEntry entry = {
        .clk = clk,
        .kernel_out_offset = offset,
        .operation = KernelTraceOpType::SLOAD,
    };
    kernel_trace.push_back(entry);
}

void AvmKernelTraceBuilder::op_sstore(uint32_t clk, uint32_t side_effect_counter, const FF& slot, const FF& value)
{
    uint32_t offset = START_SSTORE_WRITE_OFFSET + sstore_write_offset;
    perform_kernel_output_lookup(offset, side_effect_counter, value, slot);
    sstore_write_offset++;

    KernelTraceEntry entry = {
        .clk = clk,
        .kernel_out_offset = offset,
        .operation = KernelTraceOpType::SSTORE,
    };
    kernel_trace.push_back(entry);
}

// void AvmKernelTraceBuilder::finalize(std::vector<AvmFullRow<FF>>& main_trace)
// {
//     // Write the kernel trace into the main trace
//     // 1. The write offsets are constrained to be non changing over the entire trace, so we fill in the values
//     // until we hit an operation that changes one of the write_offsets (a relevant opcode)
//     // 2. Upon hitting the clk of each kernel operation we copy the values into the main trace
//     // 3. When an increment is required, we increment the value in the next row, then continue the process until
//     // the end
//     // 4. Whenever we hit the last row, we zero all write_offsets such that the shift relation will succeed
//
//     // Index 0 corresponds here to the first active row of the main execution trace.
//     // Initialization of side_effect_counter occurs occurs on this row.
//     main_trace.at(0).main_side_effect_counter = initial_side_effect_counter;
//
//     // This index is required to retrieve the right side effect counter after an external call.
//     size_t external_call_cnt = 0;
//
//     iterate_with_actions(
//         kernel_trace,
//         main_trace,
//         // Action to be performed on each kernel trace entry
//         // and its corresponding row in the main trace (clk match)
//         [&](size_t src_idx, size_t dst_idx) {
//             const auto& src = kernel_trace.at(src_idx);
//             auto& dest = main_trace.at(dst_idx);
//
//             switch (src.operation) {
//             // IN
//             case KernelTraceOpType::ADDRESS:
//                 dest.main_kernel_in_offset = ADDRESS_KERNEL_INPUTS_COL_OFFSET;
//                 dest.main_sel_q_kernel_lookup = 1;
//                 break;
//             case KernelTraceOpType::SENDER:
//                 dest.main_kernel_in_offset = SENDER_KERNEL_INPUTS_COL_OFFSET;
//                 dest.main_sel_q_kernel_lookup = 1;
//                 break;
//             case KernelTraceOpType::FUNCTION_SELECTOR:
//                 dest.main_kernel_in_offset = FUNCTION_SELECTOR_KERNEL_INPUTS_COL_OFFSET;
//                 dest.main_sel_q_kernel_lookup = 1;
//                 break;
//             case KernelTraceOpType::TRANSACTION_FEE:
//                 dest.main_kernel_in_offset = TRANSACTION_FEE_KERNEL_INPUTS_COL_OFFSET;
//                 dest.main_sel_q_kernel_lookup = 1;
//                 break;
//             case KernelTraceOpType::CHAIN_ID:
//                 dest.main_kernel_in_offset = CHAIN_ID_KERNEL_INPUTS_COL_OFFSET;
//                 dest.main_sel_q_kernel_lookup = 1;
//                 break;
//             case KernelTraceOpType::VERSION:
//                 dest.main_kernel_in_offset = VERSION_KERNEL_INPUTS_COL_OFFSET;
//                 dest.main_sel_q_kernel_lookup = 1;
//                 break;
//             case KernelTraceOpType::BLOCK_NUMBER:
//                 dest.main_kernel_in_offset = BLOCK_NUMBER_KERNEL_INPUTS_COL_OFFSET;
//                 dest.main_sel_q_kernel_lookup = 1;
//                 break;
//             case KernelTraceOpType::TIMESTAMP:
//                 dest.main_kernel_in_offset = TIMESTAMP_KERNEL_INPUTS_COL_OFFSET;
//                 dest.main_sel_q_kernel_lookup = 1;
//                 break;
//             case KernelTraceOpType::FEE_PER_DA_GAS:
//                 dest.main_kernel_in_offset = FEE_PER_DA_GAS_KERNEL_INPUTS_COL_OFFSET;
//                 dest.main_sel_q_kernel_lookup = 1;
//                 break;
//             case KernelTraceOpType::FEE_PER_L2_GAS:
//                 dest.main_kernel_in_offset = FEE_PER_L2_GAS_KERNEL_INPUTS_COL_OFFSET;
//                 dest.main_sel_q_kernel_lookup = 1;
//                 break;
//             case KernelTraceOpType::IS_STATIC_CALL:
//                 dest.main_kernel_in_offset = IS_STATIC_CALL_KERNEL_INPUTS_COL_OFFSET;
//                 dest.main_sel_q_kernel_lookup = 1;
//                 break;
//             // OUT
//             case KernelTraceOpType::NOTE_HASH_EXISTS:
//                 dest.main_kernel_out_offset = src.kernel_out_offset;
//                 dest.main_sel_q_kernel_output_lookup = 1;
//                 break;
//             case KernelTraceOpType::EMIT_NOTE_HASH:
//                 dest.main_kernel_out_offset = src.kernel_out_offset;
//                 dest.main_sel_q_kernel_output_lookup = 1;
//                 break;
//             case KernelTraceOpType::NULLIFIER_EXISTS:
//                 dest.main_kernel_out_offset = src.kernel_out_offset;
//                 dest.main_sel_q_kernel_output_lookup = 1;
//                 break;
//             case KernelTraceOpType::EMIT_NULLIFIER:
//                 dest.main_kernel_out_offset = src.kernel_out_offset;
//                 dest.main_sel_q_kernel_output_lookup = 1;
//                 break;
//             case KernelTraceOpType::L1_TO_L2_MSG_EXISTS:
//                 dest.main_kernel_out_offset = src.kernel_out_offset;
//                 dest.main_sel_q_kernel_output_lookup = 1;
//                 break;
//             case KernelTraceOpType::EMIT_UNENCRYPTED_LOG:
//                 dest.main_kernel_out_offset = src.kernel_out_offset;
//                 dest.main_sel_q_kernel_output_lookup = 1;
//                 break;
//             case KernelTraceOpType::EMIT_L2_TO_L1_MSG:
//                 dest.main_kernel_out_offset = src.kernel_out_offset;
//                 dest.main_sel_q_kernel_output_lookup = 1;
//                 break;
//             case KernelTraceOpType::SLOAD:
//                 dest.main_kernel_out_offset = src.kernel_out_offset;
//                 dest.main_sel_q_kernel_output_lookup = 1;
//                 break;
//             case KernelTraceOpType::SSTORE:
//                 dest.main_kernel_out_offset = src.kernel_out_offset;
//                 dest.main_sel_q_kernel_output_lookup = 1;
//                 break;
//             default:
//                 throw_or_abort("Invalid operation selector");
//             }
//         },
//         // Action to be performed on every execution trace row.
//         [&](size_t dst_idx) {
//             const auto& curr = main_trace.at(dst_idx);
//             auto& next = main_trace.at(dst_idx + 1);
//
//             next.main_note_hash_exist_write_offset =
//                 curr.main_note_hash_exist_write_offset + curr.main_sel_op_note_hash_exists;
//             next.main_emit_note_hash_write_offset =
//                 curr.main_emit_note_hash_write_offset + curr.main_sel_op_emit_note_hash;
//             next.main_emit_nullifier_write_offset =
//                 curr.main_emit_nullifier_write_offset + curr.main_sel_op_emit_nullifier;
//             next.main_nullifier_exists_write_offset =
//                 curr.main_nullifier_exists_write_offset + (curr.main_sel_op_nullifier_exists * curr.main_ib);
//             next.main_nullifier_non_exists_write_offset = curr.main_nullifier_non_exists_write_offset +
//                                                           (curr.main_sel_op_nullifier_exists * (FF(1) -
//                                                           curr.main_ib));
//             next.main_l1_to_l2_msg_exists_write_offset =
//                 curr.main_l1_to_l2_msg_exists_write_offset + curr.main_sel_op_l1_to_l2_msg_exists;
//             next.main_emit_l2_to_l1_msg_write_offset =
//                 curr.main_emit_l2_to_l1_msg_write_offset + curr.main_sel_op_emit_l2_to_l1_msg;
//             next.main_emit_unencrypted_log_write_offset =
//                 curr.main_emit_unencrypted_log_write_offset + curr.main_sel_op_emit_unencrypted_log;
//             next.main_sload_write_offset = curr.main_sload_write_offset + curr.main_sel_op_sload;
//             next.main_sstore_write_offset = curr.main_sstore_write_offset + curr.main_sel_op_sstore;
//
//             // Adjust side effect counter after an external call
//             if (curr.main_sel_op_external_call == 1) {
//                 next.main_side_effect_counter =
//                 hints.externalcall_hints.at(external_call_cnt).end_side_effect_counter; external_call_cnt++;
//             } else {
//                 // The side effect counter will increment regardless of the offset value
//                 // (as long as the operation is an OUTPUT operation).
//                 next.main_side_effect_counter = curr.main_side_effect_counter + curr.main_sel_q_kernel_output_lookup;
//             }
//         });
// }

// Public Input Columns Inclusion ("fixed" part of the trace).
// Crucial to add these columns after the extra row was added.
// void AvmKernelTraceBuilder::finalize_columns(std::vector<AvmFullRow<FF>>& main_trace) const
// {
//     // Copy the kernel input public inputs
//     for (size_t i = 0; i < KERNEL_INPUTS_LENGTH; i++) {
//         auto& dest = main_trace.at(i);
//         dest.main_kernel_inputs = std::get<KERNEL_INPUTS>(public_inputs).at(i);
//         dest.main_sel_kernel_inputs = FF(1);
//     }
//
//     // Copy the kernel outputs counts into the main trace
//     for (size_t i = 0; i < KERNEL_OUTPUTS_LENGTH; i++) {
//         auto& dest = main_trace.at(i);
//         dest.main_kernel_value_out = std::get<KERNEL_OUTPUTS_VALUE>(public_inputs).at(i);
//         dest.main_kernel_side_effect_out = std::get<KERNEL_OUTPUTS_SIDE_EFFECT_COUNTER>(public_inputs).at(i);
//         dest.main_kernel_metadata_out = std::get<KERNEL_OUTPUTS_METADATA>(public_inputs).at(i);
//         dest.main_sel_kernel_out = FF(1);
//     }
//
//     // Kernel inputs gas selectors
//     main_trace.at(DA_START_GAS_KERNEL_INPUTS_COL_OFFSET).main_sel_da_start_gas_kernel_input = FF(1);
//     main_trace.at(L2_START_GAS_KERNEL_INPUTS_COL_OFFSET).main_sel_l2_start_gas_kernel_input = FF(1);
//     main_trace.at(DA_END_GAS_KERNEL_INPUTS_COL_OFFSET).main_sel_da_end_gas_kernel_input = FF(1);
//     main_trace.at(L2_END_GAS_KERNEL_INPUTS_COL_OFFSET).main_sel_l2_end_gas_kernel_input = FF(1);
//
//     // Write lookup counts for inputs
//     for (auto const& [selector, count] : kernel_input_selector_counter) {
//         main_trace.at(selector).lookup_into_kernel_counts = FF(count);
//     }
//
//     // Write lookup counts for outputs
//     for (auto const& [selector, count] : kernel_output_selector_counter) {
//         main_trace.at(selector).kernel_output_lookup_counts = FF(count);
//     }
// }

} // namespace bb::avm_trace
