#include <algorithm>
#include <array>
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <fuzzer/FuzzedDataProvider.h>
#include <memory>
#include <utility>
#include <vector>

#include "barretenberg/avm_fuzzer/harness/mutation_helper.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/calldata_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/calldata_hashing.hpp"
#include "barretenberg/vm2/simulation/interfaces/calldata_hashing.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/calldata_trace.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/poseidon2_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

using namespace bb::avm2::simulation;
using namespace bb::avm2::tracegen;
using namespace bb::avm2::constraining;
using namespace bb::avm2::fuzzing;

using bb::avm2::FF;

using calldata_rel = bb::avm2::calldata<FF>;
using calldata_hashing_rel = bb::avm2::calldata_hashing<FF>;

// We initialize it here once so it can be shared to other threads.
// We don't use LLVMFuzzerInitialize since (IIUC) it is not thread safe and we want to run this
// with multiple worker threads.
static const TestTraceContainer precomputed_trace = []() {
    TestTraceContainer t;
    PrecomputedTraceBuilder precomputed_builder;
    // Up to 16 bits for the context id diff range check:
    precomputed_builder.process_misc(t, 1 << 16);
    precomputed_builder.process_sel_range_16(t);
    return t;
}();

// Each worker thread gets its own trace, initialized from precomputed_trace
thread_local static TestTraceContainer trace = precomputed_trace;

const int max_num_events = 20;
const int max_calldata_fields = 20;
const uint8_t default_calldata_fields = 16;

// TODO(MW): Increase and track the below?
// extern "C" {
// __attribute__((section("__libfuzzer_extra_counters"))) uint8_t max_calldata_fields = 0;
// }

extern "C" {
__attribute__((section("__libfuzzer_extra_counters"))) uint8_t num_events = 1;
}

struct CalldataFuzzerInstance {
    uint8_t num_fields = default_calldata_fields; // The size of this calldata event
    uint64_t selection_encoding = 0;              // Element selection
    uint8_t mutation = 0;                         // Mutation selection

    CalldataFuzzerInstance() = default;

    void to_buffer(uint8_t* buffer) const
    {
        size_t offset = 0;
        std::memcpy(buffer + offset, &num_fields, sizeof(num_fields));
        offset += sizeof(num_fields);
        std::memcpy(buffer + offset, &selection_encoding, sizeof(selection_encoding));
        offset += sizeof(selection_encoding);
        std::memcpy(buffer + offset, &mutation, sizeof(mutation));
    }

    CalldataFuzzerInstance static from_buffer(const uint8_t* buffer)
    {
        CalldataFuzzerInstance input;
        size_t offset = 0;
        std::memcpy(&input.num_fields, buffer + offset, sizeof(input.num_fields));
        offset += sizeof(input.num_fields);
        std::memcpy(&input.selection_encoding, buffer + offset, sizeof(input.selection_encoding));
        offset += sizeof(input.selection_encoding);
        std::memcpy(&input.mutation, buffer + offset, sizeof(input.mutation));

        return input;
    }
};

struct CalldataFuzzerInput {
    uint8_t num_events_input = 1;  // The number of calldata events to process
    uint16_t start_context_id = 1; // We assume that the context id is always incrementing

    std::array<FF, default_calldata_fields> init_calldata_values{};
    std::array<CalldataFuzzerInstance, max_num_events> calldata_instances{};

    CalldataFuzzerInput() = default;

    void print() const
    {
        info("start_context_id: ", start_context_id);
        info("num_events_input: ", int(num_events_input));
        for (size_t i = 0; i < init_calldata_values.size(); i++) {
            info("init_calldata_value ", i, ": ", init_calldata_values[i]);
        }
        for (size_t i = 0; i < calldata_instances.size(); i++) {
            info("calldata_instances ",
                 i,
                 ": ",
                 int(calldata_instances[i].num_fields),
                 ", ",
                 int(calldata_instances[i].selection_encoding),
                 ", ",
                 int(calldata_instances[i].mutation));
        }
    }

    void to_buffer(uint8_t* buffer) const
    {
        size_t offset = 0;
        std::memcpy(buffer + offset, &num_events_input, sizeof(num_events_input));
        offset += sizeof(num_events_input);
        std::memcpy(buffer + offset, &start_context_id, sizeof(start_context_id));
        offset += sizeof(start_context_id);
        std::memcpy(buffer + offset, &init_calldata_values[0], sizeof(FF) * init_calldata_values.size());
        offset += sizeof(FF) * init_calldata_values.size();
        for (const auto& calldata_instance : calldata_instances) {
            calldata_instance.to_buffer(buffer + offset);
            offset += sizeof(CalldataFuzzerInstance);
        }
    }

    CalldataFuzzerInput static from_buffer(const uint8_t* buffer)
    {
        CalldataFuzzerInput input;
        size_t offset = 0;
        std::memcpy(&input.num_events_input, buffer + offset, sizeof(input.num_events_input));
        offset += sizeof(input.num_events_input);
        std::memcpy(&input.start_context_id, buffer + offset, sizeof(input.start_context_id));
        offset += sizeof(input.start_context_id);
        std::memcpy(&input.init_calldata_values[0], buffer + offset, sizeof(FF) * input.init_calldata_values.size());
        offset += sizeof(FF) * input.init_calldata_values.size();
        for (auto& calldata_instance : input.calldata_instances) {
            calldata_instance = CalldataFuzzerInstance::from_buffer(buffer + offset);
            offset += sizeof(CalldataFuzzerInstance);
        }

        return input;
    }
};

// TODO(MW): Use mutate_calldata_vec (modify BASIC_VEC_MUTATION_CONFIGURATION for this fuzzer?)
std::vector<std::vector<FF>> generate_calldata_values(const CalldataFuzzerInput& input)
{
    std::vector<std::vector<FF>> all_calldata_fields(input.num_events_input, std::vector<FF>(0));
    for (size_t i = 0; i < input.num_events_input; i++) {
        auto calldata_fuzzer_instance = input.calldata_instances[i];
        all_calldata_fields[i].reserve(calldata_fuzzer_instance.num_fields);
        size_t max_index =
            std::min(static_cast<size_t>(calldata_fuzzer_instance.num_fields), input.init_calldata_values.size());
        // Place initial values
        for (size_t j = 0; j < max_index; j++) {
            all_calldata_fields[i].emplace_back(input.init_calldata_values[j]);
        }
        // If size > init_calldata_values, fill gaps
        for (size_t j = input.init_calldata_values.size(); j < calldata_fuzzer_instance.num_fields; j++) {
            // Copied from memory.fuzzer:
            auto entry_idx = (calldata_fuzzer_instance.selection_encoding >> j) % all_calldata_fields[i].size();
            auto entry_value = all_calldata_fields[i].at(entry_idx);
            FF modified_value = entry_value + input.init_calldata_values[j % input.init_calldata_values.size()];
            all_calldata_fields[i].emplace_back(modified_value);
        }
        // If selected, mutate the calldata
        switch (calldata_fuzzer_instance.mutation) {
        case 1: {
            // Duplicate previous calldata (or final calldata if this is the first)
            all_calldata_fields[i] = all_calldata_fields[(i - 1) % input.num_events_input];
            break;
        }
        case 2: {
            // Set to empty calldata
            all_calldata_fields[i] = {};
            break;
        }
        case 0: // Do nothing
        default:
            break;
        }
    }

    return all_calldata_fields;
}

extern "C" size_t LLVMFuzzerCustomMutator(uint8_t* data, size_t size, size_t max_size, unsigned int seed)
{
    if (size < sizeof(CalldataFuzzerInput)) {
        // Initialize with default input
        CalldataFuzzerInput input;
        input.to_buffer(data);
        return sizeof(CalldataFuzzerInput);
    }

    std::mt19937 rng(seed);
    // Deserialize current input
    CalldataFuzzerInput input = CalldataFuzzerInput::from_buffer(data);

    // Choose random mutation
    std::uniform_int_distribution<int> mutation_dist(0, 3);
    int mutation_choice = mutation_dist(rng);

    /**
     * Mutation choices:
     *
     * We have a nested CalldataFuzzerInput struct. The top level configures:
     *   - starting context id (this will increment for each calldata instance)
     *   - number of events (i.e. number of calldata instances to retrieve and hash)
     *   - array of initial values (as in the memory gadget fuzzer, an array to fields to generate values from)
     * Then for each event, we have a CalldataFuzzerInstance which configures:
     *   - number of calldata fields
     *   - selection encoding (as in the memory gadget fuzzer, configures generation of calldata values from the parent
     * initial values)
     *   - mutation (a choice of test case for this calldata instance):
     *       - 0: do nothing to the calldata and emit as is
     *       - 1: modify this calldata to be a copy of another instance
     *       - 2: clear this calldata, so we emit an empty calldata array
     *
     * Every call to this custom mutator mutates **one** of:
     * 0: starting context id
     * 1: number of events
     * 2: a single initial value
     * 3: a single calldata instance
     *
     * If case 3 is chosen, one calldata instance is selected and **one** of the following is mutated for it:
     * 0: mutation (choice of test case for this one calldata instance)
     * 1: number of fields
     * 3: selection encoding (how to generate the calldata fields)
     *
     * This method may be too 'nested' and granular, so it may be better to move to using something like
     * mutate_calldata_vec rather than rely on initial values, where it is relatively slow to reach the case where we
     * actually change the fields in a calldata instance.
     */

    switch (mutation_choice) {
    case 0: {
        // Modify number of events
        std::uniform_int_distribution<uint8_t> num_events_dist(1, max_num_events);
        input.num_events_input = num_events_dist(rng);
        break;
    }
    case 1: {
        // Modify initial context id
        std::uniform_int_distribution<uint16_t> context_id_dist(
            0, std::numeric_limits<uint16_t>::max() - input.num_events_input - 1);
        input.start_context_id = context_id_dist(rng);
        break;
    }
    case 2: {
        // Modify a random initial value
        // TODO(MW): Use mutate_calldata_vec (modify BASIC_VEC_MUTATION_CONFIGURATION for this fuzzer?)
        std::uniform_int_distribution<size_t> index_dist(0, input.init_calldata_values.size() - 1);
        size_t value_idx = index_dist(rng);
        std::uniform_int_distribution<uint64_t> dist(0, std::numeric_limits<uint64_t>::max());
        FF value = FF(dist(rng), dist(rng), dist(rng), dist(rng));
        input.init_calldata_values[value_idx] = value;
        break;
    }
    case 3: {
        // Modify a random calldata instance (using num_events to ensure it's used in a run)
        std::uniform_int_distribution<size_t> index_dist(0, input.num_events_input - 1);
        size_t value_idx = index_dist(rng);
        std::uniform_int_distribution<int> inner_mutation_dist(0, 2);
        int inner_mutation_choice = inner_mutation_dist(rng);
        switch (inner_mutation_choice) {
        case 0: {
            // Set mutation choice for calldata fields (see generate_calldata_values)
            std::uniform_int_distribution<int> choice_dist(0, 2);
            input.calldata_instances[value_idx].mutation = uint8_t(choice_dist(rng));
            break;
        }
        case 1: {
            // Set the number of fields
            std::uniform_int_distribution<uint8_t> num_fields_dist(0, max_calldata_fields);
            input.calldata_instances[value_idx].num_fields = num_fields_dist(rng);
            break;
        }
        case 2: {
            // Set selection encoding:
            // TODO(MW): Use mutate_calldata_vec (modify BASIC_VEC_MUTATION_CONFIGURATION for this fuzzer?)
            std::uniform_int_distribution<size_t> entry_dist(0, input.calldata_instances[value_idx].num_fields - 1);
            size_t entry_idx = entry_dist(rng);
            input.calldata_instances[value_idx].selection_encoding ^= (1ULL << entry_idx);
            break;
        }
        default:
            break;
        }
        break;
    }
    default:
        break;
    }

    input.to_buffer(data);

    if (max_size > sizeof(CalldataFuzzerInput)) {
        return sizeof(CalldataFuzzerInput);
    }

    return sizeof(CalldataFuzzerInput);
}

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    if (size < sizeof(CalldataFuzzerInput)) {
        return 0;
    }

    const CalldataFuzzerInput input = CalldataFuzzerInput::from_buffer(data);

    // Set the libFuzzer extra counter from input
    // LibFuzzer will track increases in this value as coverage progress
    num_events = input.num_events_input;

    std::vector<std::vector<FF>> calldata_fields = generate_calldata_values(input);

    // Set up gadgets and event emitters
    EventEmitter<CalldataEvent> calldata_event_emitter;
    DeduplicatingEventEmitter<RangeCheckEvent> range_check_emitter;
    DeduplicatingEventEmitter<GreaterThanEvent> greater_than_emitter;
    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_emitter;
    uint32_t clk = 0;
    ExecutionIdManager execution_id_manager(clk);
    EventEmitter<Poseidon2HashEvent> hash_event_emitter;
    EventEmitter<Poseidon2PermutationEvent> perm_event_emitter;
    EventEmitter<Poseidon2PermutationMemoryEvent> perm_mem_event_emitter;

    RangeCheck range_check(range_check_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_emitter);
    GreaterThan greater_than(field_gt, range_check, greater_than_emitter);

    Poseidon2 poseidon2(
        execution_id_manager, greater_than, hash_event_emitter, perm_event_emitter, perm_mem_event_emitter);

    // Using provider/interface to generate more hashers, so we can use different context ids over the trace:
    CalldataHashingProvider calldata_hashing_provider(poseidon2, calldata_event_emitter);

    uint32_t context_id = input.start_context_id;

    // Execute operation
    try {
        for (size_t i = 0; i < num_events; i++) {
            auto calldata_interface = calldata_hashing_provider.make_calldata_hasher(context_id++);
            calldata_interface->compute_calldata_hash(calldata_fields[i]);
        }
    } catch (const std::exception& e) {
        // If any exception occurs, we cannot proceed further.
        return 0;
    }

    RangeCheckTraceBuilder range_check_builder;
    FieldGreaterThanTraceBuilder field_gt_builder;
    GreaterThanTraceBuilder gt_builder;
    CalldataTraceBuilder builder;
    Poseidon2TraceBuilder poseidon2_builder;

    range_check_builder.process(range_check_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_emitter.dump_events(), trace);
    gt_builder.process(greater_than_emitter.dump_events(), trace);

    poseidon2_builder.process_hash(hash_event_emitter.dump_events(), trace);

    // We reuse the calldata events:
    auto calldata_events = calldata_event_emitter.dump_events();
    builder.process_retrieval(calldata_events, trace);
    builder.process_hashing(calldata_events, trace);

    if (getenv("AVM_DEBUG") != nullptr) {
        info("Debugging trace:");
        bb::avm2::InteractiveDebugger debugger(trace);
        debugger.run();
    }

    check_relation<calldata_rel>(trace);
    check_relation<calldata_hashing_rel>(trace);
    // Individual for easily switching on/off hashing:
    check_interaction<CalldataTraceBuilder, bb::avm2::lookup_calldata_range_check_context_id_diff_settings>(trace);
    check_interaction<CalldataTraceBuilder, bb::avm2::lookup_calldata_hashing_get_calldata_field_0_settings>(trace);
    check_interaction<CalldataTraceBuilder, bb::avm2::lookup_calldata_hashing_get_calldata_field_1_settings>(trace);
    check_interaction<CalldataTraceBuilder, bb::avm2::lookup_calldata_hashing_get_calldata_field_2_settings>(trace);
    check_interaction<CalldataTraceBuilder, bb::avm2::lookup_calldata_hashing_check_final_size_settings>(trace);
    check_interaction<CalldataTraceBuilder, bb::avm2::lookup_calldata_hashing_poseidon2_hash_settings>(trace);
    // check_all_interactions<CalldataTraceBuilder>(trace);

    // Reset the shared trace for the next run
    for (uint32_t i = 1; i < trace.get_column_rows(avm2::Column::calldata_sel); i++) {
        trace.set(i,
                  { {
                      { avm2::Column::calldata_sel, 0 },
                      { avm2::Column::calldata_context_id, 0 },
                      { avm2::Column::calldata_value, 0 },
                      { avm2::Column::calldata_index, 0 },
                      { avm2::Column::calldata_latch, 0 },
                      { avm2::Column::calldata_diff_context_id, 0 },
                  } });
    }

    for (uint32_t i = 1; i < trace.get_column_rows(avm2::Column::calldata_hashing_sel); i++) {
        trace.set(i,
                  { {
                      { avm2::Column::calldata_hashing_sel, 0 },
                      { avm2::Column::calldata_hashing_start, 0 },
                      { avm2::Column::calldata_hashing_sel_not_start, 0 },
                      { avm2::Column::calldata_hashing_context_id, 0 },
                      { avm2::Column::calldata_hashing_calldata_size, 0 },
                      { avm2::Column::calldata_hashing_input_len, 0 },
                      { avm2::Column::calldata_hashing_rounds_rem, 0 },
                      { avm2::Column::calldata_hashing_index_0_, 0 },
                      { avm2::Column::calldata_hashing_index_1_, 0 },
                      { avm2::Column::calldata_hashing_index_2_, 0 },
                      { avm2::Column::calldata_hashing_input_0_, 0 },
                      { avm2::Column::calldata_hashing_input_1_, 0 },
                      { avm2::Column::calldata_hashing_input_2_, 0 },
                      { avm2::Column::calldata_hashing_output_hash, 0 },
                      { avm2::Column::calldata_hashing_sel_not_padding_1, 0 },
                      { avm2::Column::calldata_hashing_sel_not_padding_2, 0 },
                      { avm2::Column::calldata_hashing_latch, 0 },
                  } });
    }

    return 0;
}
