#include "barretenberg/vm2/simulation/gadgets/data_copy.hpp"

#include <algorithm>
#include <cstdint>
#include <memory>
#include <stdexcept>
#include <vector>

#include "barretenberg/avm_fuzzer/common/fakes/dbs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/simulation/events/data_copy_events.hpp"
#include "barretenberg/vm2/simulation/gadgets/bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/gadgets/calldata_hashing.hpp"
#include "barretenberg/vm2/simulation/gadgets/context.hpp"
#include "barretenberg/vm2/simulation/gadgets/memory.hpp"
#include "barretenberg/vm2/simulation/interfaces/context.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/lib/side_effect_tracker.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_bytecode_manager.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_execution_components.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_gt.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_memory.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_poseidon2.hpp"
#include "barretenberg/vm2/simulation/standalone/written_public_data_slots_tree_check.hpp"
#include "barretenberg/vm2/tooling/debugger.hpp"
#include "barretenberg/vm2/tracegen/calldata_trace.hpp"
#include "barretenberg/vm2/tracegen/data_copy_trace.hpp"
#include "barretenberg/vm2/tracegen/field_gt_trace.hpp"
#include "barretenberg/vm2/tracegen/gt_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/range_check_trace.hpp"
#include "fuzzer/FuzzedDataProvider.h"

using namespace bb::avm2;
using namespace bb::avm2::simulation;
using data_copy_rel = bb::avm2::data_copy<bb::avm2::FF>;

namespace {

MemoryValue read_mem_value(FuzzedDataProvider& fdp)
{
    // Grab 32 bytes for a uint256
    uint64_t limb0 = fdp.ConsumeIntegral<uint64_t>();
    uint64_t limb1 = fdp.ConsumeIntegral<uint64_t>();
    uint64_t limb2 = fdp.ConsumeIntegral<uint64_t>();
    uint64_t limb3 = fdp.ConsumeIntegral<uint64_t>();

    uint256_t value = uint256_t(limb0, limb1, limb2, limb3);

    int tag_choice = fdp.ConsumeIntegralInRange<int>(0, 6);
    switch (tag_choice) {
    case 0:
        return MemoryValue::from_tag_truncating(MemoryTag::U1, FF(value));
        break;
    case 1:
        return MemoryValue::from_tag_truncating(MemoryTag::U8, FF(value));
        break;
    case 2:
        return MemoryValue::from_tag_truncating(MemoryTag::U16, FF(value));
        break;
    case 3:
        return MemoryValue::from_tag_truncating(MemoryTag::U32, FF(value));
        break;
    case 4:
        return MemoryValue::from_tag_truncating(MemoryTag::U64, FF(value));
        break;
    case 5:
        return MemoryValue::from_tag_truncating(MemoryTag::U128, FF(value));
        break;
    case 6:
        return MemoryValue::from_tag_truncating(MemoryTag::FF, FF(value));
        break;
    default:
        assert(false && "unreachable");
    }
    // To statisfy compiler
    return MemoryValue::from_tag_truncating(MemoryTag::FF, FF(0));
}

class DataCopyContext : public ContextInterface {
  public:
    DataCopyContext(uint32_t context_id_,
                    uint32_t parent_context_id_,
                    uint32_t last_child_context_id_,
                    uint32_t parent_cd_addr_,
                    uint32_t last_rd_addr_,
                    uint32_t data_size_,
                    const std::vector<MemoryValue>& calldata_,
                    MemoryInterface& memory_)
        : context_id(context_id_)
        , parent_context_id(parent_context_id_)
        , last_child_context_id(last_child_context_id_)
        , parent_cd_addr(parent_cd_addr_)
        , last_rd_addr(last_rd_addr_)
        , data_size_(data_size_)
        , data(calldata_)
        , memory(memory_)

    {}

    // Machine state.
    MemoryInterface& get_memory() override { return memory; }
    BytecodeManagerInterface& get_bytecode_manager() override
    {
        throw std::runtime_error("get_bytecode_manager called in fuzzer");
    }
    InternalCallStackManagerInterface& get_internal_call_stack_manager() override
    {
        throw std::runtime_error("get_internal_call_stack_manager called in fuzzer");
    }
    uint32_t get_pc() const override { return 0; }
    void set_pc(uint32_t) override {}
    uint32_t get_next_pc() const override { return 0; }
    void set_next_pc(uint32_t) override {}
    bool halted() const override { return false; }
    void halt() override {}
    uint32_t get_context_id() const override { return context_id; }
    uint32_t get_parent_id() const override { return parent_context_id; }
    uint32_t get_last_child_id() const override { return last_child_context_id; }
    bool has_parent() const override { return context_id == 0; }

    // Environment.
    const AztecAddress& get_address() const override
    {
        static AztecAddress address{ 1 };
        return address;
    }
    const AztecAddress& get_msg_sender() const override
    {
        static AztecAddress msg_sender{ 2 };
        return msg_sender;
    }
    const FF& get_transaction_fee() const override
    {
        static FF transaction_fee = FF(100);
        return transaction_fee;
    }
    bool get_is_static() const override { return false; }
    SideEffectTrackerInterface& get_side_effect_tracker() override
    {
        static SideEffectTracker side_effect_tracker;
        return side_effect_tracker;
    }
    AppendOnlyTreeSnapshot get_written_public_data_slots_tree_snapshot() override { return {}; }
    const GlobalVariables& get_globals() const override
    {
        static GlobalVariables globals{};
        return globals;
    }

    TransactionPhase get_phase() const override { return TransactionPhase::APP_LOGIC; }

    std::vector<MemoryValue> get_calldata(uint32_t cd_offset, uint32_t cd_copy_size) const override
    {
        uint64_t calldata_size = static_cast<uint64_t>(data.size());
        // We first take a slice of the data, the most we can slice is the actual size of the data
        uint64_t data_index_upper_bound = std::min(static_cast<uint64_t>(cd_offset) + cd_copy_size, calldata_size);

        std::vector<MemoryValue> padded_calldata;
        padded_calldata.reserve(cd_copy_size);

        for (size_t i = cd_offset; i < data_index_upper_bound; i++) {
            padded_calldata.push_back(data[i]);
        }
        // If we have some padding (read goes beyond the end of the calldata), fill the rest of the vector with zeros.
        padded_calldata.resize(cd_copy_size, MemoryValue::from<FF>(0));

        return padded_calldata;
    }
    std::vector<MemoryValue> get_returndata(uint32_t rd_offset, uint32_t rd_copy_size) override
    {
        uint64_t returndata_size = static_cast<uint64_t>(data.size());
        uint32_t data_index_upper_bound =
            static_cast<uint32_t>(std::min(static_cast<uint64_t>(rd_offset) + rd_copy_size, returndata_size));

        std::vector<MemoryValue> padded_returndata;
        padded_returndata.reserve(rd_copy_size);

        for (uint32_t i = rd_offset; i < data_index_upper_bound; i++) {
            padded_returndata.push_back(data[i]);
        }
        // If we have some padding (read goes beyond the end of the returndata), fill the rest of the vector with
        // zeros.
        padded_returndata.resize(rd_copy_size, MemoryValue::from<FF>(0));

        return padded_returndata;
    }
    ContextInterface& get_child_context() override { throw std::runtime_error("get_child_context called in fuzzer"); }
    void set_child_context(std::unique_ptr<ContextInterface>) override {}

    MemoryAddress get_parent_cd_addr() const override { return parent_cd_addr; }
    uint32_t get_parent_cd_size() const override { return data_size_; }

    MemoryAddress get_last_rd_addr() const override { return last_rd_addr; }
    void set_last_rd_addr(MemoryAddress) override {}

    uint32_t get_last_rd_size() const override { return data_size_; }
    void set_last_rd_size(MemoryAddress) override {}

    bool get_last_success() const override { return true; }
    void set_last_success(bool) override {}

    Gas get_gas_used() const override { return {}; }
    Gas get_gas_limit() const override { return {}; }
    void set_gas_used(Gas) override {}

    Gas get_parent_gas_used() const override { return {}; }
    Gas get_parent_gas_limit() const override { return {}; }

    Gas gas_left() const override { return {}; }

    uint32_t get_checkpoint_id_at_creation() const override { return 0; }

    // Events
    ContextEvent serialize_context_event() override { return {}; }

  private:
    uint32_t context_id;
    uint32_t parent_context_id;
    uint32_t last_child_context_id;
    uint32_t parent_cd_addr;
    uint32_t last_rd_addr;
    uint32_t data_size_;
    std::vector<MemoryValue> data;
    MemoryInterface& memory;
};

struct FuzzerInput {
    // Opcode inputs
    uint32_t copy_size = 0;
    uint32_t offset = 0;
    uint32_t dst_addr = 0;
    bool operation = false; // false = cd_copy, true = rd_copy
    // Context inputs
    uint32_t context_id = 0;
    uint32_t parent_context_id = 0;
    uint32_t last_child_context_id = 0;
    uint32_t parent_cd_addr = 0;
    uint32_t last_rd_addr = 0;
    uint32_t data_size = 0;
    bool is_top_level = false;
};

} // namespace

// Initialize with a valid input if the input is too small
extern "C" size_t LLVMFuzzerCustomMutator(uint8_t* data, size_t size, size_t max_size, unsigned int seed)
{
    // If input is too small, initialize with a valid FuzzerInput
    if (size < sizeof(FuzzerInput)) {
        if (max_size < sizeof(FuzzerInput)) {
            return 0; // Can't fit even a basic input
        }

        std::mt19937 rng(seed);
        FuzzerInput input{};
        std::memcpy(data, &input, sizeof(FuzzerInput));
        return sizeof(FuzzerInput);
    }

    if (size > max_size) {
        return 0;
    }

    std::mt19937 rng(seed);
    FuzzerInput input;
    // Read existing input
    input = *reinterpret_cast<FuzzerInput*>(data);

    std::uniform_int_distribution<int> mutation_dist(0, 5);
    int mutation_choice = mutation_dist(rng);

    // Used to expand/shrink fields
    std::uniform_int_distribution<int> change_dist(-16, 16);
    switch (mutation_choice) {
    case 0: {
        // Mutate copy size
        int change = change_dist(rng);
        int new_copy_size = static_cast<int>(input.copy_size) + change;
        input.copy_size = static_cast<uint32_t>(std::max(0, std::min(new_copy_size, 1024)));
        break;
    }
    case 1: {
        // Mutate offset
        int change = change_dist(rng);
        input.offset = static_cast<uint32_t>(static_cast<int>(input.offset) + change);
        break;
    }
    case 2: {
        // Mutate dst_addr
        int change = change_dist(rng);
        input.dst_addr = static_cast<uint32_t>(static_cast<int>(input.dst_addr) + change);
        break;
    }
    case 3: {
        // Mutate data size
        int change = change_dist(rng);
        int new_data_size = static_cast<int>(input.data_size) + change;
        input.data_size = static_cast<uint32_t>(std::max(0, std::min(new_data_size, 64)));
        break;
    }
    case 4: {
        // Toggle operation type
        input.operation = !input.operation;
        break;
    }
    case 5: {
        // Toggle nested/top-level
        input.is_top_level = !input.is_top_level;
        break;
    }
    default:
        break;
    }
    if (input.is_top_level) {
        // For top-level contexts, parent and last child IDs should be 0
        input.parent_context_id = 0;
        input.last_child_context_id = 0;
        input.context_id = 1;
    } else {
        // For nested contexts, randomize IDs within a reasonable range
        input.parent_context_id = 1;
        input.last_child_context_id = 2;
        input.context_id = 3;
    }

    // Write mutated input back to buffer
    std::memcpy(data, &input, sizeof(FuzzerInput));
    return sizeof(FuzzerInput);
}

extern "C" int LLVMFuzzerTestOneInput(const uint8_t* data, size_t size)
{
    if (size < sizeof(FuzzerInput)) {
        return 0;
    }

    // Extract fuzzer inputs
    FuzzerInput input = *reinterpret_cast<const FuzzerInput*>(data);
    FuzzedDataProvider fdp(data + sizeof(FuzzerInput), size - sizeof(FuzzerInput));

    // Set up minimal components needed for DataCopy and Context
    ExecutionIdManager execution_id_manager(1);
    EventEmitter<DataCopyEvent> data_copy_emitter;
    EventEmitter<GreaterThanEvent> gt_emitter;
    EventEmitter<FieldGreaterThanEvent> field_gt_emitter;
    EventEmitter<CalldataEvent> calldata_emitter;
    EventEmitter<RangeCheckEvent> range_check_emitter;

    RangeCheck range_check(range_check_emitter);
    FieldGreaterThan field_gt(range_check, field_gt_emitter);
    GreaterThan gt(field_gt, range_check, gt_emitter);

    DataCopy data_copy(execution_id_manager, gt, data_copy_emitter);

    // Set up memory provider
    EventEmitter<MemoryEvent> memory_emitter;
    MemoryProvider memory_provider(range_check, execution_id_manager, memory_emitter);

    try {
        // Create memory and initialize with calldata at parent_cd_addr
        auto memory = memory_provider.make_memory(/*space_id=*/0);

        std::vector<MemoryValue> initial_calldata;
        for (uint32_t i = 0; i < input.data_size; i++) {
            if (fdp.remaining_bytes() < 32) {
                // If we run out of bytes, fill with default values
                initial_calldata.push_back(MemoryValue::from<FF>(FF(i + 1)));
            } else {
                initial_calldata.push_back(read_mem_value(fdp));
            }
        }
        DataCopyContext context(input.context_id,
                                input.parent_context_id,
                                input.last_child_context_id,
                                input.parent_cd_addr,
                                input.last_rd_addr,
                                input.data_size,
                                initial_calldata,
                                *memory);

        // Execute the fuzzing operation
        if (!input.operation) {
            // Test cd_copy - copies from parent context's calldata
            if (!input.is_top_level) {
                // Write to memory at parent_cd_addr
                for (uint32_t i = 0; i < initial_calldata.size(); i++) {
                    memory->set(input.parent_cd_addr + i, initial_calldata[i]);
                }
            } else {
                bb::avm2::simulation::PurePoseidon2 poseidon2;
                // For top-level context, we need to hash the calldata first
                bb::avm2::simulation::CalldataHashingProvider cd_provider =
                    CalldataHashingProvider(poseidon2, calldata_emitter);
                auto cd_hasher = cd_provider.make_calldata_hasher(context.get_context_id());
                std::vector<FF> calldata_fields;
                for (const auto& mem_val : initial_calldata) {
                    calldata_fields.push_back(mem_val.as_ff());
                }

                cd_hasher->compute_calldata_hash(calldata_fields);
            }
            data_copy.cd_copy(context, input.copy_size, input.offset, input.dst_addr);

        } else {
            // Test rd_copy - copies from child context's returndata
            for (uint32_t i = 0; i < initial_calldata.size(); i++) {
                memory->set(input.last_rd_addr + i, initial_calldata[i]);
            }
            data_copy.rd_copy(context, input.copy_size, input.offset, input.dst_addr);
        }
    } catch (DataCopyException& e) {
        // Catch any exceptions to prevent fuzzer from crashing
        // Real bugs should be caught by assertions/sanitizers
        return 0;
    }
    bb::avm2::tracegen::TestTraceContainer trace;
    bb::avm2::tracegen::PrecomputedTraceBuilder precomputed_builder;
    bb::avm2::tracegen::RangeCheckTraceBuilder range_check_builder;
    bb::avm2::tracegen::FieldGreaterThanTraceBuilder field_gt_builder;
    bb::avm2::tracegen::GreaterThanTraceBuilder gt_builder;
    bb::avm2::tracegen::DataCopyTraceBuilder builder;
    bb::avm2::tracegen::CalldataTraceBuilder calldata_builder;

    range_check_builder.process(range_check_emitter.dump_events(), trace);
    field_gt_builder.process(field_gt_emitter.dump_events(), trace);
    gt_builder.process(gt_emitter.dump_events(), trace);
    calldata_builder.process_retrieval(calldata_emitter.dump_events(), trace);
    builder.process(data_copy_emitter.dump_events(), trace);

    // Precomputed values
    precomputed_builder.process_tag_parameters(trace);
    precomputed_builder.process_sel_range_8(trace);
    precomputed_builder.process_misc(trace, 256); // Need enough for 8-bit range checks
                                                  //
    // AVM DEBUG
    if (getenv("AVM_DEBUG") != nullptr) {
        bb::avm2::InteractiveDebugger debugger(trace);
        debugger.run();
    }

    bb::avm2::constraining::check_relation<data_copy_rel>(trace);
    bb::avm2::constraining::check_all_interactions<tracegen::DataCopyTraceBuilder>(trace);
    // check_interaction<ExecutionTraceBuilder, bb::avm2::lookup_execution_dispatch_to_alu_settings>(trace);

    return 0;
}
