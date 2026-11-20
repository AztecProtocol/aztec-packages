#include "barretenberg/vm2/simulation/gadgets/to_radix.hpp"
#include <random>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_execution.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/field_gt_event.hpp"
#include "barretenberg/vm2/simulation/events/gt_event.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/events/to_radix_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/alu.hpp"
#include "barretenberg/vm2/simulation/gadgets/field_gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/gt.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"
#include "barretenberg/vm2/tracegen/to_radix_trace.hpp"

using namespace bb::avm2::simulation;
using namespace bb::avm2::tracegen;
using namespace bb::avm2::constraining;

using bb::avm2::FF;
using bb::avm2::MemoryAddress;
using to_radix_mem_rel = bb::avm2::to_radix_mem<FF>;
using to_radix_rel = bb::avm2::to_radix<FF>;

// A helper to return the number of limbs to decompose value based on the inputs, prevents truncation
size_t limb_size_helper(const FF& value, uint32_t num_limbs, uint32_t radix)
{
    if (radix < 2 || radix > 256) {
        return num_limbs; // Invalid radix, just return num_limbs
    }
    std::vector<uint8_t> limbs;
    uint32_t num_p_limbs = static_cast<uint32_t>(bb::avm2::get_p_limbs_per_radix_size(radix));
    limbs.reserve(std::max(num_limbs, num_p_limbs));

    uint256_t value_integer = static_cast<uint256_t>(value);
    while (value_integer != 0) {
        auto [quotient, remainder] = value_integer.divmod(radix);
        limbs.push_back(static_cast<uint8_t>(remainder));
        value_integer = quotient;
    }

    if (num_limbs > limbs.size()) {
        limbs.insert(limbs.end(), num_limbs - limbs.size(), 0);
    }

    return limbs.size();
}

struct ToRadixFuzzerInput {
    bool is_output_bits;
    FF value{};
    uint32_t radix;
    uint32_t num_limbs;
    MemoryAddress dst_addr;

    bool truncate;

    ToRadixFuzzerInput() = default;

    void to_buffer(uint8_t* buffer) const
    {
        size_t offset = 0;
        std::memcpy(buffer + offset, &is_output_bits, sizeof(is_output_bits));
        offset += sizeof(is_output_bits);
        std::memcpy(buffer + offset, &value, sizeof(value));
        offset += sizeof(value);
        std::memcpy(buffer + offset, &radix, sizeof(radix));
        offset += sizeof(radix);
        std::memcpy(buffer + offset, &num_limbs, sizeof(num_limbs));
        offset += sizeof(num_limbs);
        std::memcpy(buffer + offset, &dst_addr, sizeof(dst_addr));
    }

    static ToRadixFuzzerInput from_buffer(const uint8_t* buffer)
    {
        ToRadixFuzzerInput input;
        size_t offset = 0;
        uint8_t bool_byte;
        std::memcpy(&bool_byte, buffer + offset, sizeof(bool_byte));
        input.is_output_bits = (bool_byte != 0); // Normalize to proper boolean value
        offset += sizeof(input.is_output_bits);
        std::memcpy(&input.value, buffer + offset, sizeof(input.value));
        offset += sizeof(input.value);
        std::memcpy(&input.radix, buffer + offset, sizeof(input.radix));
        offset += sizeof(input.radix);
        std::memcpy(&input.num_limbs, buffer + offset, sizeof(input.num_limbs));
        offset += sizeof(input.num_limbs);
        std::memcpy(&input.dst_addr, buffer + offset, sizeof(input.dst_addr));
        return input;
    }
};

extern "C" size_t LLVMFuzzerCustomMutator(uint8_t* data, size_t size, size_t, unsigned int seed)
{
    if (size < sizeof(ToRadixFuzzerInput)) {
        // Return a dummy input
        ToRadixFuzzerInput input;
        input.to_buffer(data);
        return sizeof(ToRadixFuzzerInput); // Not enough data to mutate
    }

    ToRadixFuzzerInput input = ToRadixFuzzerInput::from_buffer(data);
    // Definte custom mutations
    // 1) Mutate is_output_bits (flip the boolean)
    // 2) Mutate radix in the valid range [2, 256]
    // 3) Mutate radix to an invalid value (<2 or >256)
    // 4) Mutate num_limbs by adding or subtracting a small value
    // 5) Mutate value randomly
    // 6) Mutate dst_addr so it is close to the boundary
    // 7) Mutate num_limbs to match value

    std::mt19937 rng(seed);
    std::uniform_int_distribution<int> bool_dist(0, 6);
    int mutation_choice = bool_dist(rng);
    switch (mutation_choice) {
    case 0: // Mutate is_output_bits
        input.is_output_bits = !input.is_output_bits;
        input.radix = input.is_output_bits ? 2 : input.radix; // Ensure radix is 2 if is_output_bits is true
        break;
    case 1: // Mutate radix in valid range
    {
        std::uniform_int_distribution<uint32_t> radix_dist(2, 256);
        input.radix = radix_dist(rng);
        break;
    }
    case 2: // Mutate radix to invalid value
    {
        std::uniform_int_distribution<uint32_t> invalid_radix_dist(0, 1);
        if (invalid_radix_dist(rng) == 0) {
            input.radix = 1; // less than 2
        } else {
            std::uniform_int_distribution<uint32_t> high_radix_dist(257, UINT32_MAX);
            input.radix = high_radix_dist(rng); // greater than 256
        }
        break;
    }
    case 3: // Mutate num_limbs
    {
        std::uniform_int_distribution<int> num_limbs_mutation_dist(-5, 5);
        int mutation = num_limbs_mutation_dist(rng);
        int new_num_limbs = static_cast<int>(input.num_limbs) + mutation;
        input.num_limbs = static_cast<uint32_t>(std::clamp(new_num_limbs, 0, 400));
        break;
    }
    case 4: // Mutate value randomly
    {
        std::uniform_int_distribution<uint64_t> value_dist(0, UINT64_MAX);
        uint64_t random_value = value_dist(rng); // Fix me
        input.value = FF(random_value);
        break;
    }
    case 5: // Mutate dst_addr
    {
        std::uniform_int_distribution<int32_t> addr_mutation_dist(-10, 10);
        int32_t mutation = addr_mutation_dist(rng);
        int32_t new_addr = static_cast<int32_t>(input.dst_addr) + mutation;
        input.dst_addr = static_cast<MemoryAddress>(new_addr);
        break;
    }
    case 6: // Flip truncate
    {
        input.truncate = !input.truncate;
        break;
    }
    default:
        break; // No mutation
    }
    input.to_buffer(data);
    return sizeof(ToRadixFuzzerInput);
}

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    if (size < sizeof(ToRadixFuzzerInput)) {
        return 0; // Not enough data to process
    }

    ToRadixFuzzerInput input = ToRadixFuzzerInput::from_buffer(data);

    ExecutionIdManager execution_id_manager(0);
    DeduplicatingEventEmitter<RangeCheckEvent> range_check_emitter;
    DeduplicatingEventEmitter<GreaterThanEvent> greater_than_emitter;
    DeduplicatingEventEmitter<FieldGreaterThanEvent> field_gt_emitter;
    EventEmitter<ToRadixEvent> to_radix_emitter;
    EventEmitter<ToRadixMemoryEvent> to_radix_mem_emitter;
    EventEmitter<MemoryEvent> mem_event_emitter;

    RangeCheck range_check(range_check_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_emitter);
    GreaterThan greater_than(field_gt, range_check, greater_than_emitter);
    ToRadix to_radix(execution_id_manager, greater_than, to_radix_emitter, to_radix_mem_emitter);

    MemoryProvider mem_provider(range_check, execution_id_manager, mem_event_emitter);

    auto memory = mem_provider.make_memory(0);

    bool error = false;
    try {
        if (!input.truncate) {
            // Adjust num_limbs to prevent truncation
            input.num_limbs = static_cast<uint32_t>(limb_size_helper(input.value, input.num_limbs, input.radix));
        }
        to_radix.to_be_radix(*memory, input.value, input.radix, input.num_limbs, input.is_output_bits, input.dst_addr);
    } catch (const ToRadixException& e) {
        // Handle exception (e.g., log it, ignore it, etc.)
        error = true;
    }

    TestTraceContainer trace = TestTraceContainer({ {
        { bb::avm2::Column::execution_context_id, 0 },
        { bb::avm2::Column::execution_register_0_, input.value },                  // = value_to_decompose
        { bb::avm2::Column::execution_register_1_, input.radix },                  // = radix
        { bb::avm2::Column::execution_register_2_, input.num_limbs },              // = num_limbs
        { bb::avm2::Column::execution_register_3_, input.is_output_bits ? 1 : 0 }, // = is_output_bits
        { bb::avm2::Column::execution_rop_4_, input.dst_addr },                    // = dst_addr
        { bb::avm2::Column::execution_sel_exec_dispatch_to_radix, 1 },             // = sel
        { bb::avm2::Column::execution_sel_opcode_error, error ? 1 : 0 },           // = sel_err
    } });

    PrecomputedTraceBuilder precomputed_builder;
    GreaterThanTraceBuilder gt_builder;
    ToRadixTraceBuilder to_radix_builder;

    precomputed_builder.process_sel_range_8(trace);
    precomputed_builder.process_to_radix_safe_limbs(trace);
    precomputed_builder.process_to_radix_p_decompositions(trace);
    precomputed_builder.process_misc(trace, 1 << 8); // Need enough for 8-bit range checks

    gt_builder.process(greater_than_emitter.dump_events(), trace);
    to_radix_builder.process(to_radix_emitter.dump_events(), trace);
    to_radix_builder.process_with_memory(to_radix_mem_emitter.dump_events(), trace);

    if (getenv("AVM_DEBUG") != nullptr) {
        info("Debugging trace:");
        bb::avm2::InteractiveDebugger debugger(trace);
        debugger.run();
    }

    check_relation<to_radix_mem_rel>(trace);
    check_relation<to_radix_rel>(trace);
    // check_all_interactions<ToRadixTraceBuilder>(trace);

    // check_interaction<ExecutionTraceBuilder, bb::avm2::perm_execution_dispatch_to_to_radix_settings>(trace);

    return 0;
}
