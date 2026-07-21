#include "barretenberg/vm2/generated/relations/memory.hpp"
#include <algorithm>
#include <cassert>
#include <cstdint>
#include <cstring>
#include <random>

#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/memory.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/execution_trace.hpp"
#include "barretenberg/vm2/tracegen/memory_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

using namespace bb::avm2::simulation;
using namespace bb::avm2::tracegen;
using namespace bb::avm2::constraining;

using bb::avm2::Column;
using bb::avm2::FF;
using bb::avm2::MemoryAddress;
using bb::avm2::MemoryTag;
using bb::avm2::MemoryValue;

using memory_rel = bb::avm2::memory<FF>;

// Useful array of all memory tags for cycling through during upcast/downcast
const std::array<MemoryTag, 7> memory_tags = {
    MemoryTag::FF, MemoryTag::U1, MemoryTag::U8, MemoryTag::U16, MemoryTag::U32, MemoryTag::U64, MemoryTag::U128,
};

struct MemoryFuzzerInput {
    uint8_t num_of_entries_input = 1; // The number of read/write operations to perform
    uint64_t read_write_encoding = 0; // Bitmask: 1 = write, 0 = read
    uint64_t upcast_encoding = 0;     // Bitmask: 1 = upcast on write
    uint64_t downcast_encoding = 0;   // Bitmask: 1 = downcast on read
    uint64_t selection_encoding = 0;  // element selection
    uint8_t space_ids = 0;            //

    std::array<MemoryValue, 16> init_memory_values{};
    std::array<MemoryAddress, 16> memory_addresses{};

    MemoryFuzzerInput() = default;

    void to_buffer(uint8_t* buffer) const
    {
        size_t offset = 0;
        std::memcpy(buffer + offset, &num_of_entries_input, sizeof(num_of_entries_input));
        offset += sizeof(num_of_entries_input);
        std::memcpy(buffer + offset, &read_write_encoding, sizeof(read_write_encoding));
        offset += sizeof(read_write_encoding);
        std::memcpy(buffer + offset, &upcast_encoding, sizeof(upcast_encoding));
        offset += sizeof(upcast_encoding);
        std::memcpy(buffer + offset, &downcast_encoding, sizeof(downcast_encoding));
        offset += sizeof(downcast_encoding);
        std::memcpy(buffer + offset, &selection_encoding, sizeof(selection_encoding));
        offset += sizeof(selection_encoding);
        std::memcpy(buffer + offset, &space_ids, sizeof(space_ids));
        offset += sizeof(space_ids);
        std::memcpy(buffer + offset, &init_memory_values[0], sizeof(MemoryValue) * init_memory_values.size());
        offset += sizeof(MemoryValue) * init_memory_values.size();
        std::memcpy(buffer + offset, &memory_addresses[0], sizeof(MemoryAddress) * memory_addresses.size());
    }

    MemoryFuzzerInput static from_buffer(const uint8_t* buffer)
    {
        MemoryFuzzerInput input;
        size_t offset = 0;
        std::memcpy(&input.num_of_entries_input, buffer + offset, sizeof(input.num_of_entries_input));
        offset += sizeof(input.num_of_entries_input);
        std::memcpy(&input.read_write_encoding, buffer + offset, sizeof(input.read_write_encoding));
        offset += sizeof(input.read_write_encoding);
        std::memcpy(&input.upcast_encoding, buffer + offset, sizeof(input.upcast_encoding));
        offset += sizeof(input.upcast_encoding);
        std::memcpy(&input.downcast_encoding, buffer + offset, sizeof(input.downcast_encoding));
        offset += sizeof(input.downcast_encoding);
        std::memcpy(&input.selection_encoding, buffer + offset, sizeof(input.selection_encoding));
        offset += sizeof(input.selection_encoding);
        std::memcpy(&input.space_ids, buffer + offset, sizeof(input.space_ids));
        offset += sizeof(input.space_ids);
        std::memcpy(
            &input.init_memory_values[0], buffer + offset, sizeof(MemoryValue) * input.init_memory_values.size());
        offset += sizeof(MemoryValue) * input.init_memory_values.size();
        std::memcpy(&input.memory_addresses[0], buffer + offset, sizeof(MemoryAddress) * input.memory_addresses.size());

        return input;
    }
};

extern "C" {
__attribute__((section("__libfuzzer_extra_counters"))) uint8_t num_of_entries = 0;
}

std::vector<MemoryValue> generate_memory_values(const MemoryFuzzerInput& input)
{
    std::vector<MemoryValue> values;
    values.reserve(num_of_entries);

    // Place initial values
    for (const auto& val : input.init_memory_values) {
        values.emplace_back(val);
    }

    // Generate additional values based on encodings
    for (size_t i = input.init_memory_values.size(); i < num_of_entries; ++i) {
        auto entry_idx = (input.selection_encoding >> i) % values.size();
        auto entry_value = values[entry_idx];

        FF modified_value = entry_value.as_ff() + input.init_memory_values[i % input.init_memory_values.size()].as_ff();

        auto should_upcast = (input.upcast_encoding >> i) & 1;
        auto should_downcast = (input.downcast_encoding >> i) & 1;
        if (should_upcast == 1) {
            // Upcast logic (example: change tag to a larger type)
            auto new_tag_index = (static_cast<uint8_t>(entry_value.get_tag()) + 1) % memory_tags.size();
            auto memory_tag = memory_tags[new_tag_index];
            entry_value = MemoryValue::from_tag_truncating(memory_tag, modified_value);
        }
        if (should_downcast == 1) {
            // Downcast logic (example: change tag to a smaller type)
            auto new_tag_index = (static_cast<uint8_t>(entry_value.get_tag()) - 1) % memory_tags.size();
            auto memory_tag = memory_tags[new_tag_index];
            entry_value = MemoryValue::from_tag_truncating(memory_tag, modified_value);
        }
        values.emplace_back(entry_value);
    }
    return values;
}

std::vector<MemoryAddress> generate_memory_addresses(const MemoryFuzzerInput& input)
{
    std::vector<MemoryAddress> addresses;
    addresses.reserve(num_of_entries);

    // Place initial addresses
    for (const auto& addr : input.memory_addresses) {
        addresses.emplace_back(addr);
    }

    for (size_t i = 0; i < num_of_entries; ++i) {
        // Select addresses in a round-robin fashion
        auto addr = input.memory_addresses[i % input.memory_addresses.size()];
        addresses.emplace_back(addr + addr);
    }
    return addresses;
}

extern "C" size_t LLVMFuzzerCustomMutator(uint8_t* data, size_t size, size_t, unsigned int seed)
{
    if (size < sizeof(MemoryFuzzerInput)) {
        // Initialize with default input
        MemoryFuzzerInput input;
        input.to_buffer(data);
        return sizeof(MemoryFuzzerInput);
    }

    std::mt19937 rng(seed);
    MemoryFuzzerInput input = MemoryFuzzerInput::from_buffer(data);
    std::uniform_int_distribution<int> mutation_dist(0, 7);
    int mutation_choice = mutation_dist(rng);

    switch (mutation_choice) {
    case 0: {
        // Modify num_of_entries
        std::uniform_int_distribution<int> num_entries_dist(-8, 8);
        int new_val = static_cast<int>(input.num_of_entries_input) + num_entries_dist(rng);
        input.num_of_entries_input = static_cast<uint8_t>(std::clamp(new_val, 0, 63));
        break;
    }
    case 1: {
        // Toggle a rw at a certain entry
        std::uniform_int_distribution<size_t> entry_dist(0, input.num_of_entries_input - 1);
        size_t entry_idx = entry_dist(rng);
        input.read_write_encoding ^= (1ULL << entry_idx);
        break;
    }
    case 2: {
        // Toggle upcast for a random entry
        std::uniform_int_distribution<size_t> entry_dist(0, input.num_of_entries_input - 1);
        size_t entry_idx = entry_dist(rng);
        input.upcast_encoding ^= (1ULL << entry_idx);
        break;
    }
    case 3: {
        // Toggle downcast for a random entry
        std::uniform_int_distribution<size_t> entry_dist(0, input.num_of_entries_input - 1);
        size_t entry_idx = entry_dist(rng);
        input.downcast_encoding ^= (1ULL << entry_idx);
        break;
    }
    case 4: {
        // Toggle selection encoding for a random entry
        std::uniform_int_distribution<size_t> entry_dist(0, input.num_of_entries_input - 1);
        size_t entry_idx = entry_dist(rng);
        input.selection_encoding ^= (1ULL << entry_idx);
        break;
    }
    case 5: {
        // Modify a random initial memory value
        std::uniform_int_distribution<size_t> value_dist(0, input.init_memory_values.size() - 1);
        size_t value_idx = value_dist(rng);
        // Random Tag from memory_tags
        std::uniform_int_distribution<size_t> tag_dist(0, memory_tags.size() - 1);
        size_t tag_idx = tag_dist(rng);
        std::uniform_int_distribution<uint64_t> dist(0, std::numeric_limits<uint64_t>::max());

        std::array<uint64_t, 4> limbs;
        for (size_t i = 0; i < 4; ++i) {
            limbs[i] = dist(rng);
        }
        auto random_value = FF(limbs[0], limbs[1], limbs[2], limbs[3]);
        input.init_memory_values[value_idx] = MemoryValue::from_tag_truncating(memory_tags[tag_idx], random_value);
        break;
    }
    case 6: {
        // Incr/Decr a random memory address
        std::uniform_int_distribution<size_t> addr_idx_dist(0, input.memory_addresses.size() - 1);
        size_t addr_idx = addr_idx_dist(rng);
        std::uniform_int_distribution<int> addr_change(-1000, 1000);
        int new_addr = static_cast<int>(input.memory_addresses[addr_idx]) + addr_change(rng);
        input.memory_addresses[addr_idx] = static_cast<uint32_t>(new_addr);
        break;
    }
    case 7: {
        // Incr/Decr space_ids
        std::uniform_int_distribution<int> context_dist(-4, 4);
        int new_val = static_cast<int>(input.space_ids) + context_dist(rng);
        input.space_ids = static_cast<uint8_t>(new_val);
        break;
    }
    default:
        break;
    }

    input.to_buffer(data);
    return sizeof(MemoryFuzzerInput);
}

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    using bb::avm2::MemoryValue;

    if (size < sizeof(MemoryFuzzerInput)) {
        info("Input size too small");
        return 0;
    }

    // Parse input
    const MemoryFuzzerInput input = MemoryFuzzerInput::from_buffer(data);

    // Set the libFuzzer extra counter from input
    // LibFuzzer will track increases in this value as coverage progress
    num_of_entries = input.num_of_entries_input;

    // Set up gadgets and event emitters
    DeduplicatingEventEmitter<RangeCheckEvent> range_check_emitter;
    EventEmitter<MemoryEvent> memory_emitter;
    RangeCheck range_check(range_check_emitter);

    uint32_t clk = 0;
    ExecutionIdManager execution_id_manager(clk);
    MemoryProvider mem_provider(range_check, execution_id_manager, memory_emitter);
    // Ensure at least 1 memory context exists
    size_t num_contexts = std::max(static_cast<size_t>(input.space_ids), 1UL);
    std::vector<std::unique_ptr<MemoryInterface>> memories;
    memories.reserve(num_contexts);

    for (size_t i = 0; i < num_contexts; ++i) {
        memories.push_back(mem_provider.make_memory(static_cast<uint8_t>(i)));
    }

    std::vector<MemoryValue> memory_contents = generate_memory_values(input);
    std::vector<MemoryAddress> memory_addresses = generate_memory_addresses(input);

    std::unordered_map<uint16_t, std::unordered_map<MemoryAddress, MemoryValue>> running_memory_states;

    for (size_t i = 0; i < num_of_entries; ++i) {
        // Pick a memory partition in round-robin fashion
        MemoryInterface* mem = memories[i % memories.size()].get();
        // Determine if read or write
        bool is_write = ((input.read_write_encoding >> i) & 1) != 0;
        MemoryAddress addr = memory_addresses[i];
        if (is_write) {
            mem->set(addr, memory_contents[i]);
            // Update running memory state
            running_memory_states[mem->get_space_id()][addr] = memory_contents[i];
        } else {
            auto retrieved_val = mem->get(addr);
            // Verify against running memory state
            if (running_memory_states[mem->get_space_id()].contains(addr)) {
                auto expected_val = running_memory_states[mem->get_space_id()][addr];
                assert(retrieved_val == expected_val);
            } else {
                // If address was never written to, assume default value is FF(0)
                assert(retrieved_val == MemoryValue::from_tag_truncating(MemoryTag::FF, FF(0)));
            }
        }
        execution_id_manager.increment_execution_id();
    }

    TestTraceContainer trace;
    MemoryTraceBuilder memory_trace_builder;
    PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_misc(trace, execution_id_manager.get_execution_id());

    memory_trace_builder.process(memory_emitter.dump_events(), trace);

    // Memory is not entirely standalone, we need to set a relation  #[ACTIVE_ROW_NEEDS_PERM_SELECTOR]
    for (uint32_t i = 1; i <= num_of_entries; ++i) {
        trace.set(Column::memory_sel_register_op_0_, i, 1);
    }
    check_relation<memory_rel>(trace);

    // This makes it all realllllly slow
    // RangeCheckTraceBuilder range_check_builder;
    // precomputed_builder.process_tag_parameters(trace);
    // precomputed_builder.process_sel_range_16(trace);
    // precomputed_builder.process_misc(trace, 1 << 16);
    // range_check_builder.process(range_check_emitter.dump_events(), trace);

    // check_all_interactions<MemoryTraceBuilder>(trace);

    return 0;
}
