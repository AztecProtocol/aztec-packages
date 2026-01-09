#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/testing/check_relation.hpp"
#include "barretenberg/vm2/generated/relations/get_contract_instance.hpp"
#include "barretenberg/vm2/generated/relations/lookups_get_contract_instance.hpp"
#include "barretenberg/vm2/generated/relations/perms_get_contract_instance.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/get_contract_instance_event.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/memory_trace.hpp"
#include "barretenberg/vm2/tracegen/opcodes/get_contract_instance_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using simulation::EventEmitter;
using simulation::GetContractInstanceEvent;
using tracegen::GetContractInstanceTraceBuilder;
using tracegen::MemoryTraceBuilder;
using tracegen::PrecomputedTraceBuilder;
using tracegen::TestTraceContainer;
using FF = AvmFlavorSettings::FF;
using C = Column;
using get_contract_instance = bb::avm2::get_contract_instance<FF>;

TEST(GetContractInstanceConstrainingTest, EmptyRow)
{
    check_relation<get_contract_instance>(testing::empty_trace());
}

TEST(GetContractInstanceConstrainingTest, WriteInBoundsCheck)
{
    // Test constants
    const FF dst_offset = FF(100);                                           // Use a smaller offset for clear testing
    const FF dst_offset_diff_max = FF(AVM_HIGHEST_MEM_ADDRESS) - dst_offset; // AVM_HIGHEST_MEM_ADDRESS - 100
    const FF dst_offset_diff_max_inv = dst_offset_diff_max.invert();         // 1/DST_OFFSET_DIFF_MAX
    const FF wrong_inv_value = FF(42);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_dst_offset, dst_offset },
          { C::get_contract_instance_is_valid_writes_in_bounds, 1 },
          { C::get_contract_instance_dst_offset_diff_max_inv, dst_offset_diff_max_inv } },
    });

    check_relation<get_contract_instance>(trace, get_contract_instance::SR_WRITE_OUT_OF_BOUNDS_CHECK);

    // Negative test: mutate to incorrect dst_offset_diff_max_inv
    trace.set(C::get_contract_instance_dst_offset_diff_max_inv, 1, wrong_inv_value); // Wrong inv value
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<get_contract_instance>(trace, get_contract_instance::SR_WRITE_OUT_OF_BOUNDS_CHECK),
        "WRITE_OUT_OF_BOUNDS_CHECK");
    // Reset
    trace.set(C::get_contract_instance_dst_offset_diff_max_inv, 1, dst_offset_diff_max_inv);

    // Negative test: mutate to incorrect sel_write_in_bounds
    trace.set(C::get_contract_instance_is_valid_writes_in_bounds, 1, 0); // Out of bounds
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<get_contract_instance>(trace, get_contract_instance::SR_WRITE_OUT_OF_BOUNDS_CHECK),
        "WRITE_OUT_OF_BOUNDS_CHECK");
    // Reset
    trace.set(C::get_contract_instance_is_valid_writes_in_bounds, 1, 1);
}

TEST(GetContractInstanceConstrainingTest, WriteOutOfBoundsCheck)
{
    // Test constants
    const FF dst_offset = FF(AVM_HIGHEST_MEM_ADDRESS); // Boundary case: dst_offset + 1 is out of bounds
    const FF dst_offset_diff_max_inv = FF(0);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_dst_offset, dst_offset },
          { C::get_contract_instance_is_valid_writes_in_bounds, 0 },
          { C::get_contract_instance_dst_offset_diff_max_inv, dst_offset_diff_max_inv } },
    });

    check_relation<get_contract_instance>(trace, get_contract_instance::SR_WRITE_OUT_OF_BOUNDS_CHECK);

    // Negative test: mutate to incorrect sel_write_in_bounds
    trace.set(C::get_contract_instance_is_valid_writes_in_bounds, 1, 1);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<get_contract_instance>(trace, get_contract_instance::SR_WRITE_OUT_OF_BOUNDS_CHECK),
        "WRITE_OUT_OF_BOUNDS_CHECK");
    // Reset
    trace.set(C::get_contract_instance_is_valid_writes_in_bounds, 1, 0);
}

TEST(GetContractInstanceConstrainingTest, ErrorAggregationConstraint)
{
    // Test error aggregation subrelation
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // No error case
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_sel_error, 0 },
          { C::get_contract_instance_is_valid_writes_in_bounds, 1 },
          { C::get_contract_instance_is_valid_member_enum, 1 } },
    });

    check_relation<get_contract_instance>(trace, get_contract_instance::SR_ERROR_AGGREGATION);

    // Test bounds error
    trace.set(C::get_contract_instance_sel_error, 1, 1);
    trace.set(C::get_contract_instance_is_valid_writes_in_bounds, 1, 0); // Out of bounds
    check_relation<get_contract_instance>(trace, get_contract_instance::SR_ERROR_AGGREGATION);

    // Test enum error
    trace.set(C::get_contract_instance_sel_error, 1, 1);
    trace.set(C::get_contract_instance_is_valid_writes_in_bounds, 1, 1); // In bounds
    trace.set(C::get_contract_instance_is_valid_member_enum, 1, 0);      // Invalid enum
    check_relation<get_contract_instance>(trace, get_contract_instance::SR_ERROR_AGGREGATION);

    // Test both errors
    trace.set(C::get_contract_instance_sel_error, 1, 1);
    trace.set(C::get_contract_instance_is_valid_writes_in_bounds, 1, 0); // Out of bounds
    trace.set(C::get_contract_instance_is_valid_member_enum, 1, 0);      // Invalid enum
    check_relation<get_contract_instance>(trace, get_contract_instance::SR_ERROR_AGGREGATION);

    // Negative test: wrong error value
    trace.set(C::get_contract_instance_sel_error, 1, 0);
    EXPECT_THROW_WITH_MESSAGE(check_relation<get_contract_instance>(trace, get_contract_instance::SR_ERROR_AGGREGATION),
                              "ERROR_AGGREGATION");
}

TEST(GetContractInstanceConstrainingTest, SelectedMemberConstraint)
{
    // Test constants
    const FF deployer_addr = 0x1234;
    const FF class_id = 0x5678;
    const FF init_hash = 0x9ABC;
    const FF wrong_value = 0x1111;

    // Test selected member subrelation
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // DEPLOYER selection
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_selected_member, deployer_addr },
          { C::get_contract_instance_is_deployer, 1 },
          { C::get_contract_instance_is_class_id, 0 },
          { C::get_contract_instance_is_init_hash, 0 },
          { C::get_contract_instance_retrieved_deployer_addr, deployer_addr },
          { C::get_contract_instance_retrieved_class_id, class_id },
          { C::get_contract_instance_retrieved_init_hash, init_hash } },
    });

    check_relation<get_contract_instance>(trace, get_contract_instance::SR_SELECTED_MEMBER);

    // Test CLASS_ID selection
    trace.set(C::get_contract_instance_selected_member, 1, class_id);
    trace.set(C::get_contract_instance_is_deployer, 1, 0);
    trace.set(C::get_contract_instance_is_class_id, 1, 1);
    check_relation<get_contract_instance>(trace, get_contract_instance::SR_SELECTED_MEMBER);

    // Test INIT_HASH selection
    trace.set(C::get_contract_instance_selected_member, 1, init_hash);
    trace.set(C::get_contract_instance_is_class_id, 1, 0);
    trace.set(C::get_contract_instance_is_init_hash, 1, 1);
    check_relation<get_contract_instance>(trace, get_contract_instance::SR_SELECTED_MEMBER);

    // Negative test: wrong selected member
    trace.set(C::get_contract_instance_selected_member, 1, wrong_value); // Wrong value
    EXPECT_THROW_WITH_MESSAGE(check_relation<get_contract_instance>(trace, get_contract_instance::SR_SELECTED_MEMBER),
                              "SELECTED_MEMBER");
}

TEST(GetContractInstanceConstrainingTest, ComplexMultiRowSequence)
{
    // Test constants
    const uint32_t dst_offset_1 = 100;
    const uint32_t dst_offset_2 = 200;
    const uint32_t dst_offset_3 = 300;
    const uint8_t deployer_enum = 0;
    const uint8_t class_id_enum = 1;
    const uint8_t invalid_enum = 5;
    const FF deployer_addr_1 = 0x1234;
    const FF class_id_1 = 0x5678;
    const FF init_hash_1 = 0x9ABC;
    const FF deployer_addr_2 = 0x1111;
    const FF class_id_2 = 0x2222;
    const FF init_hash_2 = 0x3333;
    const FF deployer_addr_3 = 0x4444;
    const FF class_id_3 = 0x5555;
    const FF init_hash_3 = 0x6666;
    const uint32_t member_write_offset_1 = 101;
    const uint32_t member_write_offset_2 = 201;
    const uint32_t member_write_offset_3 = 301;
    const uint8_t u1_tag = static_cast<uint8_t>(ValueTag::U1);
    const uint8_t ff_tag = static_cast<uint8_t>(ValueTag::FF);

    // Test multiple GetContractInstance operations in sequence
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Row 1: skippable gadget selector
        { { C::get_contract_instance_sel, 0 } }, // Must satisfy error constraint
        // Row 2: Valid DEPLOYER retrieval
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_dst_offset, dst_offset_1 },
          { C::get_contract_instance_member_enum, deployer_enum }, // DEPLOYER
          { C::get_contract_instance_is_valid_writes_in_bounds, 1 },
          { C::get_contract_instance_dst_offset_diff_max_inv, FF(AVM_HIGHEST_MEM_ADDRESS - dst_offset_1).invert() },
          { C::get_contract_instance_sel_error, 0 },
          { C::get_contract_instance_is_valid_member_enum, 1 },
          { C::get_contract_instance_is_deployer, 1 },
          { C::get_contract_instance_is_class_id, 0 },
          { C::get_contract_instance_is_init_hash, 0 },
          { C::get_contract_instance_retrieved_deployer_addr, deployer_addr_1 },
          { C::get_contract_instance_retrieved_class_id, class_id_1 },
          { C::get_contract_instance_retrieved_init_hash, init_hash_1 },
          { C::get_contract_instance_selected_member, deployer_addr_1 },
          { C::get_contract_instance_member_write_offset, member_write_offset_1 },
          { C::get_contract_instance_exists_tag, u1_tag },
          { C::get_contract_instance_member_tag, ff_tag } },
        // Row 3: Valid CLASS_ID retrieval
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_dst_offset, dst_offset_2 },
          { C::get_contract_instance_member_enum, class_id_enum }, // CLASS_ID
          { C::get_contract_instance_is_valid_writes_in_bounds, 1 },
          { C::get_contract_instance_dst_offset_diff_max_inv, FF(AVM_HIGHEST_MEM_ADDRESS - dst_offset_2).invert() },
          { C::get_contract_instance_sel_error, 0 },
          { C::get_contract_instance_is_valid_member_enum, 1 },
          { C::get_contract_instance_is_deployer, 0 },
          { C::get_contract_instance_is_class_id, 1 },
          { C::get_contract_instance_is_init_hash, 0 },
          { C::get_contract_instance_retrieved_deployer_addr, deployer_addr_2 },
          { C::get_contract_instance_retrieved_class_id, class_id_2 },
          { C::get_contract_instance_retrieved_init_hash, init_hash_2 },
          { C::get_contract_instance_selected_member, class_id_2 },
          { C::get_contract_instance_member_write_offset, member_write_offset_2 },
          { C::get_contract_instance_exists_tag, u1_tag },
          { C::get_contract_instance_member_tag, ff_tag } },
        // Row 4: Invalid member enum with error
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_dst_offset, dst_offset_3 },
          { C::get_contract_instance_member_enum, invalid_enum }, // Invalid
          { C::get_contract_instance_is_valid_writes_in_bounds, 1 },
          { C::get_contract_instance_dst_offset_diff_max_inv, FF(AVM_HIGHEST_MEM_ADDRESS - dst_offset_3).invert() },
          { C::get_contract_instance_sel_error, 1 }, // Error due to invalid enum
          { C::get_contract_instance_is_valid_member_enum, 0 },
          { C::get_contract_instance_is_deployer, 0 },
          { C::get_contract_instance_is_class_id, 0 },
          { C::get_contract_instance_is_init_hash, 0 },
          { C::get_contract_instance_retrieved_deployer_addr, deployer_addr_3 },
          { C::get_contract_instance_retrieved_class_id, class_id_3 },
          { C::get_contract_instance_retrieved_init_hash, init_hash_3 },
          { C::get_contract_instance_selected_member, 0 }, // No selection due to invalid enum
          { C::get_contract_instance_member_write_offset, member_write_offset_3 },
          { C::get_contract_instance_exists_tag, u1_tag },
          { C::get_contract_instance_member_tag, ff_tag } },
    });

    check_relation<get_contract_instance>(trace);
}

// Integration-style tests using tracegen components
TEST(GetContractInstanceConstrainingTest, IntegrationTracegenValid)
{
    // Test constants
    const uint32_t execution_clk = 42;
    const FF contract_address = 0x1234;
    const uint32_t dst_offset = 100;
    const uint8_t deployer_enum = static_cast<uint8_t>(ContractInstanceMember::DEPLOYER);
    const uint16_t space_id = 1;
    const FF nullifier_tree_root = 0x1234;
    const FF public_data_tree_root = 0x5678;
    const FF deployer_addr = 0x5678;
    const FF class_id = 0x9ABC;
    const FF init_hash = 0xDEF0;

    // Use real tracegen to generate a valid trace
    EventEmitter<GetContractInstanceEvent> emitter;

    GetContractInstanceEvent event{
        .execution_clk = execution_clk,
        .contract_address = contract_address,
        .dst_offset = dst_offset,
        .member_enum = deployer_enum,
        .space_id = space_id,
        .nullifier_tree_root = nullifier_tree_root,
        .public_data_tree_root = public_data_tree_root,
        .instance_exists = true,
        .retrieved_deployer_addr = deployer_addr,
        .retrieved_class_id = class_id,
        .retrieved_init_hash = init_hash,
    };

    emitter.emit(std::move(event));
    auto events = emitter.dump_events();

    TestTraceContainer trace;
    GetContractInstanceTraceBuilder builder;
    builder.process(events, trace);

    // Add precomputed table entries
    PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_get_contract_instance_table(trace);

    check_relation<get_contract_instance>(trace);
}

TEST(GetContractInstanceConstrainingTest, IntegrationTracegenInvalidEnum)
{
    // Test constants
    const uint32_t execution_clk = 42;
    const FF contract_address = 0x1234;
    const uint32_t dst_offset = 100;
    const uint8_t invalid_enum = 200;
    const uint16_t space_id = 1;
    const FF nullifier_tree_root = 0x1234;
    const FF public_data_tree_root = 0x5678;
    const FF deployer_addr = 0x5678;
    const FF class_id = 0x9ABC;
    const FF init_hash = 0xDEF0;

    // Test with invalid member enum
    EventEmitter<GetContractInstanceEvent> emitter;

    GetContractInstanceEvent event{
        .execution_clk = execution_clk,
        .contract_address = contract_address,
        .dst_offset = dst_offset,
        .member_enum = invalid_enum,
        .space_id = space_id,
        .nullifier_tree_root = nullifier_tree_root,
        .public_data_tree_root = public_data_tree_root,
        .instance_exists = true,
        .retrieved_deployer_addr = deployer_addr,
        .retrieved_class_id = class_id,
        .retrieved_init_hash = init_hash,
    };

    emitter.emit(std::move(event));
    auto events = emitter.dump_events();

    TestTraceContainer trace;
    GetContractInstanceTraceBuilder builder;
    builder.process(events, trace);

    // Add precomputed table entries
    PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_get_contract_instance_table(trace);

    check_relation<get_contract_instance>(trace);
}

TEST(GetContractInstanceConstrainingTest, IntegrationTracegenOutOfBounds)
{
    // Test constants
    const uint32_t execution_clk = 42;
    const FF contract_address = 0x1234;
    const uint32_t dst_offset = AVM_HIGHEST_MEM_ADDRESS;
    const uint8_t class_id_enum = static_cast<uint8_t>(ContractInstanceMember::CLASS_ID);
    const uint16_t space_id = 1;
    const FF nullifier_tree_root = 0x1234;
    const FF public_data_tree_root = 0x5678;
    const FF deployer_addr = 0x5678;
    const FF class_id = 0x9ABC;
    const FF init_hash = 0xDEF0;

    // Test with out-of-bounds destination
    EventEmitter<GetContractInstanceEvent> emitter;

    GetContractInstanceEvent event{
        .execution_clk = execution_clk,
        .contract_address = contract_address,
        .dst_offset = dst_offset,
        .member_enum = class_id_enum,
        .space_id = space_id,
        .nullifier_tree_root = nullifier_tree_root,
        .public_data_tree_root = public_data_tree_root,
        .instance_exists = true,
        .retrieved_deployer_addr = deployer_addr,
        .retrieved_class_id = class_id,
        .retrieved_init_hash = init_hash,
    };

    emitter.emit(std::move(event));
    auto events = emitter.dump_events();

    TestTraceContainer trace;
    GetContractInstanceTraceBuilder builder;
    builder.process(events, trace);

    // Add precomputed table entries
    PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_get_contract_instance_table(trace);

    check_relation<get_contract_instance>(trace);
}

// =====================================================================
// Ghost Row Injection Vulnerability Tests
// =====================================================================
// These tests verify that ghost rows (sel=0) cannot fire permutations.
// The vulnerability: is_valid_member_enum is only constrained via lookup
// and WRITES_OUT_OF_BOUNDS check, but NOT constrained to be 0 when sel=0.
// This allows ghost rows to fire the memory write permutations.
//
// See pil/vm2/claude-audits/ghost-row-injection/opcodes-audit.md for details.

// =====================================================================
// Full Attack Test with All Traces
// =====================================================================
// This test demonstrates a complete ghost row injection attack:
// 1. Create legitimate memory WRITE events (destination side)
// 2. Build memory trace from those events
// 3. Inject ghost get_contract_instance row with sel=0 but is_valid_member_enum=1
// 4. This fires the #[MEM_WRITE_CONTRACT_INSTANCE_EXISTS] permutation
// 5. Verify the permutation matches - attack succeeds!
//
// This follows the pattern from PR #19470 (NegativeFullAttackWithAllTraces).
TEST(GetContractInstanceConstrainingTest, NegativeFullAttackWithAllTraces)
{
    TestTraceContainer trace;
    MemoryTraceBuilder memory_trace_builder;
    PrecomputedTraceBuilder precomputed_trace_builder;

    // ========== STEP 1: Attacker-controlled values ==========
    uint32_t malicious_clk = 42;
    uint16_t malicious_space_id = 1;
    MemoryAddress malicious_dst_offset = 0x100; // dst_offset for exists write
    uint1_t malicious_instance_exists = 1;      // Arbitrary exists value (bool)
    MemoryTag exists_tag = MemoryTag::U1;       // U1 tag for exists

    // ========== STEP 2: Create legitimate memory events ==========
    // These events will be processed by the MemoryTraceBuilder to create
    // legitimate destination rows that the ghost source can match.
    // The permutation is for WRITES (rw=1), so we create WRITE events.
    std::vector<simulation::MemoryEvent> mem_events = {
        {
            .execution_clk = malicious_clk,
            .mode = simulation::MemoryMode::WRITE, // rw = 1 for memory writes
            .addr = malicious_dst_offset,
            .value = MemoryValue::from<uint1_t>(malicious_instance_exists),
            .space_id = malicious_space_id,
        },
    };

    // ========== STEP 3: Build memory trace (destination side) ==========
    precomputed_trace_builder.process_sel_range_8(trace);
    precomputed_trace_builder.process_sel_range_16(trace);
    precomputed_trace_builder.process_misc(trace, 1 << 16);
    precomputed_trace_builder.process_tag_parameters(trace);
    memory_trace_builder.process(mem_events, trace);

    // Find where the memory row was placed
    uint32_t memory_row = 0;
    for (uint32_t row = 0; row < trace.get_num_rows(); row++) {
        if (trace.get(C::memory_sel, row) == 1) {
            memory_row = row;
            break;
        }
    }

    // ========== STEP 4: Inject ghost get_contract_instance row ==========
    // The vulnerability: When sel=0, is_valid_member_enum can still be 1
    // which fires the #[MEM_WRITE_CONTRACT_INSTANCE_EXISTS] permutation.
    //
    // Key constraints to satisfy:
    // - is_valid_writes_in_bounds must be 1 (so WRITES_OUT_OF_BOUNDS = 0)
    // - WRITES_OUT_OF_BOUNDS * is_valid_member_enum = 0 is satisfied when WRITES_OUT_OF_BOUNDS = 0
    // - exists_tag = is_valid_writes_in_bounds * MEM_TAG_U1 = 1 * 1 = 1
    uint32_t ghost_row = 0;
    trace.set(ghost_row,
              std::vector<std::pair<Column, FF>>{
                  { C::precomputed_first_row, 1 },
                  { C::precomputed_clk, ghost_row },
                  // Ghost row: sel = 0, but is_valid_member_enum = 1
                  { C::get_contract_instance_sel, 0 },
                  { C::get_contract_instance_is_valid_member_enum, 1 },      // Vulnerability! Fires permutation
                  { C::get_contract_instance_is_valid_writes_in_bounds, 1 }, // Needed for derived constraints
                  // Derived constraint: exists_tag = is_valid_writes_in_bounds * MEM_TAG_U1
                  { C::get_contract_instance_exists_tag, static_cast<uint8_t>(exists_tag) },
                  // Permutation tuple values - must match memory destination
                  { C::get_contract_instance_clk, malicious_clk },
                  { C::get_contract_instance_space_id, malicious_space_id },
                  { C::get_contract_instance_dst_offset, malicious_dst_offset },
                  { C::get_contract_instance_instance_exists, static_cast<uint64_t>(malicious_instance_exists) },
                  // Additional columns needed for derived constraints
                  { C::get_contract_instance_sel_error,
                    0 }, // sel_error = sel * (1 - is_valid_writes_in_bounds * is_valid_member_enum)
                  { C::get_contract_instance_is_deployer, 0 },
                  { C::get_contract_instance_is_class_id, 0 },
                  { C::get_contract_instance_is_init_hash, 0 },
                  { C::get_contract_instance_selected_member, 0 }, // 0 since no is_* flags are set
                  { C::get_contract_instance_member_write_offset, malicious_dst_offset + 1 },
                  { C::get_contract_instance_member_tag, static_cast<uint8_t>(MemoryTag::FF) },
              });

    // Set the destination selector on the memory row to mark it as matching get_contract_instance
    trace.set(C::memory_sel_get_contract_instance_exists_write, memory_row, 1);

    // ========== STEP 5: Verify attack ==========
    std::cout << "\n=== GHOST ROW INJECTION ATTACK TEST (get_contract_instance) ===" << std::endl;
    std::cout << "Ghost get_contract_instance row at row " << ghost_row << " with sel=0, is_valid_member_enum=1"
              << std::endl;
    std::cout << "Memory destination row at row " << memory_row << " with clk=" << malicious_clk << std::endl;

    // Debug: Print source tuple
    std::cout << "\nSource tuple (get_contract_instance row " << ghost_row << "):" << std::endl;
    std::cout << "  clk = " << trace.get(C::get_contract_instance_clk, ghost_row) << std::endl;
    std::cout << "  space_id = " << trace.get(C::get_contract_instance_space_id, ghost_row) << std::endl;
    std::cout << "  dst_offset = " << trace.get(C::get_contract_instance_dst_offset, ghost_row) << std::endl;
    std::cout << "  instance_exists = " << trace.get(C::get_contract_instance_instance_exists, ghost_row) << std::endl;
    std::cout << "  exists_tag = " << trace.get(C::get_contract_instance_exists_tag, ghost_row) << std::endl;
    std::cout << "  is_valid_member_enum = " << trace.get(C::get_contract_instance_is_valid_member_enum, ghost_row)
              << std::endl;

    // Debug: Print destination tuple
    std::cout << "\nDestination tuple (memory row " << memory_row << "):" << std::endl;
    std::cout << "  memory_clk = " << trace.get(C::memory_clk, memory_row) << std::endl;
    std::cout << "  memory_space_id = " << trace.get(C::memory_space_id, memory_row) << std::endl;
    std::cout << "  memory_address = " << trace.get(C::memory_address, memory_row) << std::endl;
    std::cout << "  memory_value = " << trace.get(C::memory_value, memory_row) << std::endl;
    std::cout << "  memory_tag = " << trace.get(C::memory_tag, memory_row) << std::endl;
    std::cout << "  memory_rw = " << trace.get(C::memory_rw, memory_row) << std::endl;
    std::cout << "  memory_sel = " << trace.get(C::memory_sel, memory_row) << std::endl;
    std::cout << "  memory_sel_get_contract_instance_exists_write = "
              << trace.get(C::memory_sel_get_contract_instance_exists_write, memory_row) << std::endl;

    // get_contract_instance relation should PASS (this is the vulnerability)
    std::cout << "\nget_contract_instance relation: ";
    check_relation<get_contract_instance>(trace);
    std::cout << "PASSED (vulnerability confirmed)" << std::endl;

    // ========== STEP 6: Verify attack succeeded ==========
    // The attack succeeds because:
    // 1. get_contract_instance relation PASSED (no constraint prevents ghost rows from setting is_valid_member_enum=1)
    // 2. The source tuple values match a legitimate memory destination tuple
    // 3. The permutation would match if we ran the full permutation check

    // Verify tuples match
    // Source: clk, space_id, dst_offset, instance_exists, exists_tag, is_valid_member_enum
    // Dest:   memory_clk, memory_space_id, memory_address, memory_value, memory_tag, memory_rw
    bool tuples_match =
        (trace.get(C::get_contract_instance_clk, ghost_row) == trace.get(C::memory_clk, memory_row)) &&
        (trace.get(C::get_contract_instance_space_id, ghost_row) == trace.get(C::memory_space_id, memory_row)) &&
        (trace.get(C::get_contract_instance_dst_offset, ghost_row) == trace.get(C::memory_address, memory_row)) &&
        (trace.get(C::get_contract_instance_instance_exists, ghost_row) == trace.get(C::memory_value, memory_row)) &&
        (trace.get(C::get_contract_instance_exists_tag, ghost_row) == trace.get(C::memory_tag, memory_row)) &&
        (trace.get(C::get_contract_instance_is_valid_member_enum, ghost_row) ==
         trace.get(C::memory_rw, memory_row)); // rw=1 for writes

    std::cout << "\nTuples match: " << (tuples_match ? "YES" : "NO") << std::endl;

    // Attack succeeds if:
    // 1. get_contract_instance relation passed (no constraint prevents ghost row)
    // 2. Tuples match (permutation would match)
    bool attack_succeeded = tuples_match;

    std::cout << "\n=== ATTACK RESULT ===" << std::endl;
    if (attack_succeeded) {
        std::cout << "CRITICAL: Ghost row injection attack SUCCEEDED!" << std::endl;
        std::cout << "Attacker can inject arbitrary memory writes via get_contract_instance." << std::endl;
        std::cout << "\nRequired fix in get_contract_instance.pil:" << std::endl;
        std::cout << "  #[IS_VALID_MEMBER_ENUM_REQUIRES_SEL]" << std::endl;
        std::cout << "  is_valid_member_enum * (1 - sel) = 0;" << std::endl;
    } else {
        std::cout << "Attack blocked." << std::endl;
    }

    // Test documents vulnerability - we expect the attack to succeed until fixed
    EXPECT_TRUE(attack_succeeded) << "Ghost row injection attack should succeed (vulnerability exists)";
}

} // namespace
} // namespace bb::avm2::constraining
