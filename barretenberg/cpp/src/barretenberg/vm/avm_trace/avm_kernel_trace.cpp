#include "avm_kernel_trace.hpp"
#include "barretenberg/vm/avm_trace/avm_common.hpp"
#include "barretenberg/vm/avm_trace/avm_trace.hpp"
#include "constants.hpp"
#include <cstdint>
#include <sys/types.h>

// For the meantime, we do not fire around the public inputs as a vector or otherwise
// Instead we fire them around as a fixed length array from the kernel, as that is how they will be

namespace bb::avm_trace {

AvmKernelTraceBuilder::AvmKernelTraceBuilder(VM_PUBLIC_INPUTS public_inputs)
    : public_inputs(public_inputs)
{}

void AvmKernelTraceBuilder::reset()
{
    kernel_input_selector_counter.clear();
    kernel_output_selector_counter.clear();
}

std::vector<AvmKernelTraceBuilder::KernelTraceEntry> AvmKernelTraceBuilder::finalize()
{
    return std::move(kernel_trace);
}

FF AvmKernelTraceBuilder::perform_kernel_input_lookup(uint32_t selector)
{
    FF result = std::get<0>(public_inputs)[selector];
    kernel_input_selector_counter[selector]++;
    return result;
}

void AvmKernelTraceBuilder::perform_kernel_output_lookup(uint32_t write_offset, FF value, FF metadata)
{
    std::get<KERNEL_OUTPUTS_VALUE>(public_inputs)[write_offset] = value;
    std::get<KERNEL_OUTPUTS_SIDE_EFFECT_COUNTER>(public_inputs)[write_offset] = side_effect_counter;
    std::get<KERNEL_OUTPUTS_METADATA>(public_inputs)[write_offset] = metadata;

    // Lookup counts
    kernel_output_selector_counter[write_offset]++;

    side_effect_counter++;
}

// We want to be able to get the return value from the public inputs column
// Get the return value, this will be places in ia
// We read from the public inputs that were provided to the kernel
FF AvmKernelTraceBuilder::op_sender()
{
    return perform_kernel_input_lookup(SENDER_SELECTOR);
}

FF AvmKernelTraceBuilder::op_address()
{
    return perform_kernel_input_lookup(ADDRESS_SELECTOR);
}

FF AvmKernelTraceBuilder::op_portal()
{
    return perform_kernel_input_lookup(PORTAL_SELECTOR);
}

FF AvmKernelTraceBuilder::op_fee_per_da_gas()
{
    return perform_kernel_input_lookup(FEE_PER_DA_GAS_SELECTOR);
}

FF AvmKernelTraceBuilder::op_fee_per_l2_gas()
{
    return perform_kernel_input_lookup(FEE_PER_L2_GAS_SELECTOR);
}

FF AvmKernelTraceBuilder::op_transaction_fee()
{
    return perform_kernel_input_lookup(TRANSACTION_FEE_SELECTOR);
}

FF AvmKernelTraceBuilder::op_chain_id()
{
    return perform_kernel_input_lookup(CHAIN_ID_SELECTOR);
}

FF AvmKernelTraceBuilder::op_version()
{
    return perform_kernel_input_lookup(VERSION_SELECTOR);
}

FF AvmKernelTraceBuilder::op_block_number()
{
    return perform_kernel_input_lookup(BLOCK_NUMBER_SELECTOR);
}

FF AvmKernelTraceBuilder::op_coinbase()
{
    return perform_kernel_input_lookup(COINBASE_SELECTOR);
}

FF AvmKernelTraceBuilder::op_timestamp()
{
    return perform_kernel_input_lookup(TIMESTAMP_SELECTOR);
}

uint32_t AvmKernelTraceBuilder::op_note_hash_exists(uint32_t clk, FF note_hash)
{

    uint32_t offset = START_NOTE_HASH_EXISTS_WRITE_OFFSET + note_hash_exists_offset;
    perform_kernel_output_lookup(offset, note_hash, FF(0));
    note_hash_exists_offset++;
    // TODO: max offset check

    KernelTraceEntry entry = {
        .clk = clk,
        .kernel_out_selector = offset,
        .q_kernel_output_lookup = true,
        .op_note_hash_exists = true,
    };
    kernel_trace.push_back(entry);

    return offset;
}

void AvmKernelTraceBuilder::op_emit_note_hash(uint32_t clk, FF note_hash)
{
    uint32_t offset = START_EMIT_NOTE_HASH_WRITE_OFFSET + emit_note_hash_offset;
    perform_kernel_output_lookup(offset, note_hash, FF(0));
    emit_note_hash_offset++;

    KernelTraceEntry entry = {
        .clk = clk,
        .kernel_out_selector = offset,
        .q_kernel_output_lookup = true,
        .op_emit_note_hash = true,
    };
    kernel_trace.push_back(entry);
}

uint32_t AvmKernelTraceBuilder::op_nullifier_exists(FF nullifier)
{
    uint32_t offset = START_NULLIFIER_EXISTS_OFFSET + nullifier_exists_offset;
    perform_kernel_output_lookup(offset, nullifier, FF(0));
    nullifier_exists_offset++;
    return offset;
}

uint32_t AvmKernelTraceBuilder::op_emit_nullifier(FF nullifier)
{
    uint32_t offset = START_EMIT_NULLIFIER_WRITE_OFFSET + emit_nullifier_offset;
    perform_kernel_output_lookup(offset, nullifier, FF(0));
    emit_nullifier_offset++;
    return offset;
}

uint32_t AvmKernelTraceBuilder::op_emit_l2_to_l1_msg(FF l2_to_l1_msg)
{
    uint32_t offset = START_L2_TO_L1_MSG_WRITE_OFFSET + l2_to_l1_msg_offset;
    perform_kernel_output_lookup(offset, l2_to_l1_msg, FF(0));
    l2_to_l1_msg_offset++;
    return offset;
}

uint32_t AvmKernelTraceBuilder::op_emit_unencrypted_log(FF log_hash)
{
    uint32_t offset = START_EMIT_UNENCRYPTED_LOG_WRITE_OFFSET + emit_unencrypted_log_offset;
    perform_kernel_output_lookup(offset, log_hash, FF(0));
    emit_unencrypted_log_offset++;
    return offset;
}

uint32_t AvmKernelTraceBuilder::op_sload(FF slot, FF value)
{
    uint32_t offset = START_SLOAD_WRITE_OFFSET + sload_write_offset;
    perform_kernel_output_lookup(offset, value, slot);
    sload_write_offset++;
    return offset;
}

uint32_t AvmKernelTraceBuilder::op_sstore(FF slot, FF value)
{
    uint32_t offset = START_SSTORE_WRITE_OFFSET + sstore_write_offset;
    perform_kernel_output_lookup(offset, value, slot);
    sstore_write_offset++;
    return offset;
}

// Getters
uint32_t AvmKernelTraceBuilder::get_note_hash_exists_offset()
{
    return note_hash_exists_offset;
}

uint32_t AvmKernelTraceBuilder::get_emit_note_hash_offset()
{
    return emit_note_hash_offset;
}

uint32_t AvmKernelTraceBuilder::get_nullifier_exists_offset()
{
    return nullifier_exists_offset;
}

uint32_t AvmKernelTraceBuilder::get_emit_nullifier_offset()
{
    return emit_nullifier_offset;
}

uint32_t AvmKernelTraceBuilder::get_l2_to_l1_msg_offset()
{
    return l2_to_l1_msg_offset;
}

uint32_t AvmKernelTraceBuilder::get_emit_unencrypted_log_offset()
{
    return emit_unencrypted_log_offset;
}

uint32_t AvmKernelTraceBuilder::get_sload_offset()
{
    return sload_write_offset;
}

uint32_t AvmKernelTraceBuilder::get_sstore_offset()
{
    return sstore_write_offset;
}

} // namespace bb::avm_trace