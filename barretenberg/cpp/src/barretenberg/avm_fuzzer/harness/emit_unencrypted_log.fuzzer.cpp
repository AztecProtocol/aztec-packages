#include "barretenberg/vm2/simulation/gadgets/emit_unencrypted_log.hpp"
#include <cassert>
#include <cstdint>

#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/harness/context_helper.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/emit_unencrypted_log.hpp"
#include "barretenberg/vm2/simulation/events/emit_unencrypted_log_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/interfaces/memory.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/opcodes/emit_unencrypted_log_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

using namespace bb::avm2::simulation;
using namespace bb::avm2::tracegen;
using namespace bb::avm2::constraining;
using namespace bb::avm2::fuzzing;

using bb::avm2::FF;
using bb::avm2::MemoryTag;
using bb::avm2::MemoryValue;

using emit_log_rel = bb::avm2::emit_unencrypted_log<FF>;

const uint8_t default_log_fields = 16;
// Set to slightly above the maximum size so we hit error_too_many_log_fields
const uint32_t max_log_fields = FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH + 5;

struct EmitUnencryptedLogFuzzerInput {
    AztecAddress contract_address;
    MemoryAddress log_offset = 1;
    uint32_t log_size = 0;
    uint64_t selection_encoding = 0;
    bool is_static = false;
    bool tag_mismatch =
        false; // Since we generate log_size values in the test, we must pass a flag to modify their tag(s)

    std::array<FF, default_log_fields> init_log_values{};

    void print() const
    {
        info("contract_address: ", contract_address);
        info("log_offset: ", log_offset);
        info("log_size: ", log_size);
        info("selection_encoding: ", selection_encoding);
        info("is_static: ", is_static);
        info("tag_mismatch: ", tag_mismatch);
        for (size_t i = 0; i < init_log_values.size(); i++) {
            info("init_log_value ", i, ": ", init_log_values[i]);
        }
    }

    void to_buffer(uint8_t* buffer) const
    {
        size_t offset = 0;
        std::memcpy(buffer + offset, &contract_address, sizeof(contract_address));
        offset += sizeof(contract_address);
        std::memcpy(buffer + offset, &log_offset, sizeof(log_offset));
        offset += sizeof(log_offset);
        std::memcpy(buffer + offset, &log_size, sizeof(log_size));
        offset += sizeof(log_size);
        std::memcpy(buffer + offset, &selection_encoding, sizeof(selection_encoding));
        offset += sizeof(selection_encoding);
        std::memcpy(buffer + offset, &is_static, sizeof(is_static));
        offset += sizeof(is_static);
        std::memcpy(buffer + offset, &tag_mismatch, sizeof(tag_mismatch));
        offset += sizeof(tag_mismatch);
        std::memcpy(buffer + offset, &init_log_values[0], sizeof(FF) * init_log_values.size());
    }

    static EmitUnencryptedLogFuzzerInput from_buffer(const uint8_t* buffer)
    {
        EmitUnencryptedLogFuzzerInput input;
        size_t offset = 0;
        std::memcpy(&input.contract_address, buffer + offset, sizeof(input.contract_address));
        offset += sizeof(input.contract_address);
        std::memcpy(&input.log_offset, buffer + offset, sizeof(input.log_offset));
        offset += sizeof(input.log_offset);
        std::memcpy(&input.log_size, buffer + offset, sizeof(input.log_size));
        offset += sizeof(input.log_size);
        std::memcpy(&input.selection_encoding, buffer + offset, sizeof(input.selection_encoding));
        offset += sizeof(input.selection_encoding);
        std::memcpy(&input.is_static, buffer + offset, sizeof(input.is_static));
        offset += sizeof(input.is_static);
        std::memcpy(&input.tag_mismatch, buffer + offset, sizeof(input.tag_mismatch));
        offset += sizeof(input.tag_mismatch);
        std::memcpy(&input.init_log_values[0], buffer + offset, sizeof(FF) * input.init_log_values.size());

        return input;
    }

    bool is_error() const
    {
        uint64_t end_log_address = static_cast<uint64_t>(log_offset) + static_cast<uint64_t>(log_size) - 1;
        bool error_memory_out_of_bounds = end_log_address > AVM_HIGHEST_MEM_ADDRESS;
        // TODO(MW): Since this fuzzer only emits one log for now, we just check its size, once it emits multiple
        // we would need to check prev_emitted_log_fields + total_size:
        bool error_too_many_log_fields = PUBLIC_LOG_HEADER_LENGTH + log_size > FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH;
        return error_memory_out_of_bounds || error_too_many_log_fields || tag_mismatch || is_static;
    }
};

ContextEvent fill_context_event(std::unique_ptr<ContextInterface>& context)
{
    return { .id = context->get_context_id(),
             .pc = context->get_pc(),
             .contract_addr = context->get_address(),
             .is_static = context->get_is_static(),
             .numUnencryptedLogFields =
                 context->get_side_effect_tracker().get_side_effects().get_num_unencrypted_log_fields() };
}

// TODO(MW): multiple events, std::vector<std::vector<FF>>
std::vector<FF> generate_and_set_log_fields(const EmitUnencryptedLogFuzzerInput& input, MemoryInterface* mem)
{
    std::vector<FF> log_fields;
    auto total_log_fields_size = input.log_size + PUBLIC_LOG_HEADER_LENGTH;
    log_fields.reserve(total_log_fields_size);
    // Assign log length and address
    log_fields.emplace_back(input.log_size);
    log_fields.emplace_back(input.contract_address);

    size_t max_index = std::min(static_cast<size_t>(input.log_size), input.init_log_values.size());
    // Place initial values
    for (size_t j = 0; j < max_index; j++) {
        log_fields.emplace_back(input.init_log_values[j]);
    }
    // If size > init_log_values, fill gaps
    for (size_t j = input.init_log_values.size(); j < input.log_size; j++) {
        // Copied from memory.fuzzer:
        auto entry_idx = (input.selection_encoding >> j) % log_fields.size();
        // TODO(MW): make sure to exclude size/address fields?
        auto entry_value = log_fields[entry_idx];
        FF modified_value = entry_value + input.init_log_values[j % input.init_log_values.size()];
        log_fields.emplace_back(modified_value);
    }
    // The first two fields are size (IS_WRITE_LOG_LENGTH) and contract address (is_write_contract_address), which are
    // not read from memory, so we start at j = PUBLIC_LOG_HEADER_LENGTH
    MemoryAddress addr = input.log_offset;
    for (size_t j = PUBLIC_LOG_HEADER_LENGTH; j < total_log_fields_size; j++) {
        mem->set(addr++, MemoryValue::from(log_fields[j]));
    }

    // Choose an index to set to an incorrect tag if we are testing a mismatch
    if (input.tag_mismatch) {
        size_t set_incorrect_tag_at = ((input.selection_encoding >> max_index) % log_fields.size()) + 2;
        MemoryAddress addr = static_cast<MemoryAddress>(input.log_offset + set_incorrect_tag_at - 2);
        MemoryTag incorrect_tag = MemoryTag::FF;
        uint64_t incr = 0;
        while (incorrect_tag == MemoryTag::FF) {
            // TODO(MW): use rng here?
            incorrect_tag =
                static_cast<MemoryTag>((static_cast<uint64_t>(incorrect_tag) + input.selection_encoding + incr++) %
                                       static_cast<uint64_t>(MemoryTag::MAX));
        }
        mem->set(addr, MemoryValue::from_tag_truncating(incorrect_tag, log_fields[set_incorrect_tag_at]));
    }

    return log_fields;
}

extern "C" size_t LLVMFuzzerCustomMutator(uint8_t* data, size_t size, size_t max_size, unsigned int seed)
{
    if (size < sizeof(EmitUnencryptedLogFuzzerInput)) {
        // Initialize with default input
        EmitUnencryptedLogFuzzerInput input;
        input.to_buffer(data);
        return sizeof(EmitUnencryptedLogFuzzerInput);
    }

    std::mt19937_64 rng(seed);

    // Deserialize current input
    EmitUnencryptedLogFuzzerInput input = EmitUnencryptedLogFuzzerInput::from_buffer(data);

    // Choose mutation case
    std::uniform_int_distribution<int> dist(0, 5);
    int choice = dist(rng);
    switch (choice) {
    case 0: {
        // Set contract address
        std::uniform_int_distribution<uint64_t> addr_dist(0, std::numeric_limits<uint64_t>::max());
        input.contract_address = FF(addr_dist(rng), addr_dist(rng), addr_dist(rng), addr_dist(rng));
        break;
    }
    case 1: {
        // Set log address
        std::uniform_int_distribution<int> addr_change(-4000, 4000);
        int new_addr = static_cast<int>(input.log_offset) + addr_change(rng);
        input.log_offset = static_cast<uint32_t>(new_addr);
        break;
    }
    case 2: {
        // Set log size
        std::uniform_int_distribution<uint32_t> num_fields_dist(0, max_log_fields);
        input.log_size = num_fields_dist(rng);
        break;
    }
    case 3: {
        // Toggle selection encoding for a random entry, as long as this log is not empty
        if (input.log_size != 0) {
            std::uniform_int_distribution<size_t> entry_dist(0, input.log_size - 1);
            size_t entry_idx = entry_dist(rng);
            input.selection_encoding ^= (1ULL << entry_idx);
        }
        break;
    }
    case 4: {
        // Modify a random initial value
        std::uniform_int_distribution<size_t> index_dist(0, input.init_log_values.size() - 1);
        size_t value_idx = index_dist(rng);
        std::uniform_int_distribution<uint64_t> dist(0, std::numeric_limits<uint64_t>::max());
        FF value = FF(dist(rng), dist(rng), dist(rng), dist(rng));
        input.init_log_values[value_idx] = value;
        break;
    }
    case 5: {
        // Toggle error cases
        // Note that memory out of bounds and too many log fields are already covered by other mutations
        // TODO(MW): Add more? E.g. set incorrect log_size/log_offset in emit_unencrypted_log call?
        std::uniform_int_distribution<int> err_dist(0, 1);
        int choice = err_dist(rng);
        switch (choice) {
        case 0: {
            // Toggle is_static
            input.is_static = !input.is_static;
            break;
        }
        case 1: {
            // Toggle tag_mismatch
            input.tag_mismatch = !input.tag_mismatch;
            break;
        }
        default:
            break;
        }
    }
    default:
        break;
    }

    // Serialize mutated input back to buffer
    input.to_buffer(data);

    if (max_size > sizeof(EmitUnencryptedLogFuzzerInput)) {
        return sizeof(EmitUnencryptedLogFuzzerInput);
    }

    return sizeof(EmitUnencryptedLogFuzzerInput);
}

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    using bb::avm2::MemoryValue;

    if (size < sizeof(EmitUnencryptedLogFuzzerInput)) {
        return 0;
    }

    EmitUnencryptedLogFuzzerInput input = EmitUnencryptedLogFuzzerInput::from_buffer(data);
    bool error = false;

    // Set up gadgets and event emitters
    EventEmitter<EmitUnencryptedLogEvent> emit_log_emitter;

    GadgetFuzzerContextHelper context_helper(input.contract_address, input.is_static, 1);
    EmitUnencryptedLog emit_unencrypted_log(
        context_helper.execution_id_manager, context_helper.greater_than, emit_log_emitter);

    auto context =
        context_helper.make_enqueued_fuzzing_context(input.contract_address, input.contract_address, input.is_static);

    // TODO(MW): multiple log events
    std::vector<FF> log_fields = generate_and_set_log_fields(input, &context->get_memory());

    try {
        emit_unencrypted_log.emit_unencrypted_log(
            context->get_memory(), *context, input.contract_address, input.log_offset, input.log_size);
    } catch (const EmitUnencryptedLogException& e) {
        // TODO(MW): Ensure error is expected
        error = true;
    }

    TestTraceContainer trace;

    PrecomputedTraceBuilder precomputed_builder;
    RangeCheckTraceBuilder range_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    GreaterThanTraceBuilder gt_builder;
    ExecutionTraceBuilder ex_builder;
    EmitUnencryptedLogTraceBuilder builder;

    uint32_t pi_row = AVM_PUBLIC_INPUTS_AVM_ACCUMULATED_DATA_PUBLIC_LOGS_ROW_IDX;

    if (!error) {
        // TODO(MW): use below to check values:
        // auto public_logs = side_effect_tracker.get_side_effects().public_logs;
        trace.set(avm2::Column::public_inputs_cols_0_, pi_row, log_fields.size());
        trace.set(avm2::Column::public_inputs_sel, pi_row, 1);

        // Set public input columns
        for (FF log_field : log_fields) {
            pi_row++;
            trace.set(avm2::Column::public_inputs_sel, pi_row, 1);
            // Logs only use cols_0
            trace.set(avm2::Column::public_inputs_cols_0_, pi_row, log_field);
        }
    }

    // Precomputed values
    precomputed_builder.process_tag_parameters(trace);
    precomputed_builder.process_sel_range_8(trace);
    precomputed_builder.process_power_of_2(trace);
    precomputed_builder.process_misc(trace, pi_row + 1); // Need enough for public input columns

    // TODO(MW): Properly set these via calls (lookup changed to perm recently)
    // TODO(MW): Set before_context_event.prev_num_unencrypted_log_fields in multiple calls
    ExecutionEvent ex_event = { .wire_instruction =
                                    bb::avm2::testing::InstructionBuilder(WireOpCode::EMITUNENCRYPTEDLOG).build(),
                                .inputs = { MemoryValue::from<uint32_t>(input.log_size) },
                                .after_context_event = fill_context_event(context) };
    ex_builder.process({ ex_event }, trace);
    auto exec_log_row = trace.get_column_rows(avm2::Column::execution_sel_exec_dispatch_emit_unencrypted_log);
    trace.set(avm2::Column::execution_rop_1_, exec_log_row - 1, input.log_offset);
    trace.set(avm2::Column::execution_register_0_, exec_log_row - 1, input.log_size);
    trace.set(avm2::Column::execution_sel_opcode_error, exec_log_row - 1, error ? 1 : 0);

    range_check_builder.process(context_helper.range_check_emitter.dump_events(), trace);
    field_gt_builder.process(context_helper.field_gt_emitter.dump_events(), trace);
    gt_builder.process(context_helper.greater_than_emitter.dump_events(), trace);
    builder.process(emit_log_emitter.dump_events(), trace);

    if (getenv("AVM_DEBUG") != nullptr) {
        info("Debugging trace:");
        bb::avm2::InteractiveDebugger debugger(trace);
        debugger.run();
    }

    check_relation<emit_log_rel>(trace);
    check_all_interactions<EmitUnencryptedLogTraceBuilder>(trace);
    check_interaction<ExecutionTraceBuilder, bb::avm2::perm_execution_dispatch_to_emit_unencrypted_log_settings>(trace);

    return 0;
}
