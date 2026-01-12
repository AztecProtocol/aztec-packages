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
// The fix: is_valid_member_enum * (1 - sel) = 0 ensures is_valid_member_enum
// is forced to 0 when sel=0, preventing ghost rows from firing permutations.
//
// Test that the fix blocks ghost row injection attacks.
// Attack pattern:
// 1. Create legitimate memory WRITE events (destination side)
// 2. Build memory trace from those events
// 3. Inject ghost get_contract_instance row with sel=0 but is_valid_member_enum=1
// 4. The fix should cause the relation check to fail
TEST(GetContractInstanceConstrainingTest, NegativeGhostRowInjectionBlocked)
{
    TestTraceContainer trace;
    MemoryTraceBuilder memory_trace_builder;
    PrecomputedTraceBuilder precomputed_trace_builder;

    // Attacker-controlled values
    uint32_t malicious_clk = 42;
    uint16_t malicious_space_id = 1;
    MemoryAddress malicious_dst_offset = 0x100;
    uint1_t malicious_instance_exists = 1;
    MemoryTag exists_tag = MemoryTag::U1;

    // Create legitimate memory events
    std::vector<simulation::MemoryEvent> mem_events = {
        {
            .execution_clk = malicious_clk,
            .mode = simulation::MemoryMode::WRITE,
            .addr = malicious_dst_offset,
            .value = MemoryValue::from<uint1_t>(malicious_instance_exists),
            .space_id = malicious_space_id,
        },
    };

    // Build memory trace (destination side)
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

    // Inject ghost get_contract_instance row
    // Ghost row: sel = 0, but is_valid_member_enum = 1 (attack attempt)
    uint32_t ghost_row = 0;
    trace.set(ghost_row,
              std::vector<std::pair<Column, FF>>{
                  { C::precomputed_first_row, 1 },
                  { C::precomputed_clk, ghost_row },
                  { C::get_contract_instance_sel, 0 },
                  { C::get_contract_instance_is_valid_member_enum, 1 },
                  { C::get_contract_instance_is_valid_writes_in_bounds, 1 },
                  { C::get_contract_instance_exists_tag, static_cast<uint8_t>(exists_tag) },
                  { C::get_contract_instance_clk, malicious_clk },
                  { C::get_contract_instance_space_id, malicious_space_id },
                  { C::get_contract_instance_dst_offset, malicious_dst_offset },
                  { C::get_contract_instance_instance_exists, static_cast<uint64_t>(malicious_instance_exists) },
                  { C::get_contract_instance_sel_error, 0 },
                  { C::get_contract_instance_is_deployer, 0 },
                  { C::get_contract_instance_is_class_id, 0 },
                  { C::get_contract_instance_is_init_hash, 0 },
                  { C::get_contract_instance_selected_member, 0 },
                  { C::get_contract_instance_member_write_offset, malicious_dst_offset + 1 },
                  { C::get_contract_instance_member_tag, static_cast<uint8_t>(MemoryTag::FF) },
              });

    trace.set(C::memory_sel_get_contract_instance_exists_write, memory_row, 1);

    // The fix: is_valid_writes_in_bounds * (1 - sel) = 0 should cause the relation check to fail
    // (in conjunction with WRITES_OUT_OF_BOUNDS * is_valid_member_enum = 0)
    EXPECT_THROW_WITH_MESSAGE(check_relation<get_contract_instance>(trace), "IS_VALID_WRITES_IN_BOUNDS_REQUIRES_SEL");
}

// =====================================================================
// Tracegen-PIL Alignment Vulnerability Tests
// =====================================================================
// M-1: GetContractInstance `member_write_offset` Misalignment
// Severity: Medium (Completeness)
//
// The tracegen sets member_write_offset unconditionally to `dst_offset + 1`,
// but PIL constraint (line 192) defines:
//   member_write_offset = is_valid_writes_in_bounds * (dst_offset + 1)
//
// When is_valid_writes_in_bounds = 0, PIL expects member_write_offset = 0,
// but tracegen produces dst_offset + 1.
//
// Note: In the current implementation, is_valid_writes_in_bounds = 0 only
// when dst_offset = AVM_HIGHEST_MEM_ADDRESS, and uint32_t overflow causes
// dst_offset + 1 = 0, accidentally masking the bug. This test demonstrates
// the constraint relationship explicitly using field arithmetic.

TEST(GetContractInstanceConstrainingTest, MemberWriteOffsetConstraintPositive)
{
    // Test that member_write_offset = is_valid_writes_in_bounds * (dst_offset + 1)
    // Case 1: is_valid_writes_in_bounds = 1, member_write_offset = dst_offset + 1
    const FF dst_offset = FF(100);
    const FF member_write_offset = dst_offset + FF(1); // = 101

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_dst_offset, dst_offset },
          { C::get_contract_instance_is_valid_writes_in_bounds, 1 },
          { C::get_contract_instance_member_write_offset, member_write_offset } },
    });

    check_relation<get_contract_instance>(trace, get_contract_instance::SR_MEMBER_WRITE_OFFSET);
}

TEST(GetContractInstanceConstrainingTest, MemberWriteOffsetConstraintOutOfBoundsPositive)
{
    // Test that member_write_offset = is_valid_writes_in_bounds * (dst_offset + 1)
    // Case 2: is_valid_writes_in_bounds = 0, member_write_offset MUST be 0
    const FF dst_offset = FF(AVM_HIGHEST_MEM_ADDRESS);
    const FF correct_member_write_offset = FF(0); // is_valid_writes_in_bounds * (dst_offset + 1) = 0 * X = 0

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_dst_offset, dst_offset },
          { C::get_contract_instance_is_valid_writes_in_bounds, 0 },
          { C::get_contract_instance_member_write_offset, correct_member_write_offset } },
    });

    check_relation<get_contract_instance>(trace, get_contract_instance::SR_MEMBER_WRITE_OFFSET);
}

TEST(GetContractInstanceConstrainingTest, NegativeMemberWriteOffsetMisalignment)
{
    // VULNERABILITY TEST: M-1 GetContractInstance member_write_offset Misalignment
    //
    // This test demonstrates the tracegen-PIL misalignment vulnerability.
    // Tracegen (line 89) sets: member_write_offset = dst_offset + 1 (unconditionally)
    // PIL (line 192) expects: member_write_offset = is_valid_writes_in_bounds * (dst_offset + 1)
    //
    // When is_valid_writes_in_bounds = 0, PIL expects member_write_offset = 0,
    // but tracegen would produce dst_offset + 1.
    //
    // Note: In practice, uint32_t overflow masks this bug when dst_offset = AVM_HIGHEST_MEM_ADDRESS.
    // Here we use field arithmetic to demonstrate the constraint violation explicitly.

    const FF dst_offset = FF(AVM_HIGHEST_MEM_ADDRESS);
    // Buggy value: what tracegen produces (dst_offset + 1 in field arithmetic)
    const FF buggy_member_write_offset = dst_offset + FF(1); // = 0x100000000 (no overflow in field)

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_dst_offset, dst_offset },
          { C::get_contract_instance_is_valid_writes_in_bounds, 0 }, // Out of bounds
          { C::get_contract_instance_member_write_offset, buggy_member_write_offset } },
    });

    // The constraint member_write_offset = is_valid_writes_in_bounds * (dst_offset + 1)
    // evaluates to: buggy_value - 0 * (dst_offset + 1) = buggy_value != 0
    // This should fail because PIL expects member_write_offset = 0 when is_valid_writes_in_bounds = 0
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<get_contract_instance>(trace, get_contract_instance::SR_MEMBER_WRITE_OFFSET),
        "MEMBER_WRITE_OFFSET");
}

TEST(GetContractInstanceConstrainingTest, NegativeMemberWriteOffsetMisalignmentNonBoundaryOffset)
{
    // Additional test: demonstrate the constraint with a non-boundary dst_offset
    // This shows the constraint works correctly regardless of the specific offset value

    const FF dst_offset = FF(500);
    // Correct value when is_valid_writes_in_bounds = 1
    const FF correct_value = dst_offset + FF(1); // = 501
    // Wrong value
    const FF wrong_value = FF(999);

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_dst_offset, dst_offset },
          { C::get_contract_instance_is_valid_writes_in_bounds, 1 },
          { C::get_contract_instance_member_write_offset, wrong_value } }, // Wrong!
    });

    // Should fail because member_write_offset != is_valid_writes_in_bounds * (dst_offset + 1)
    // Expected: 501, Actual: 999
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<get_contract_instance>(trace, get_contract_instance::SR_MEMBER_WRITE_OFFSET),
        "MEMBER_WRITE_OFFSET");

    // Fix it and verify it passes
    trace.set(C::get_contract_instance_member_write_offset, 1, correct_value);
    check_relation<get_contract_instance>(trace, get_contract_instance::SR_MEMBER_WRITE_OFFSET);
}

TEST(GetContractInstanceConstrainingTest, TracegenMemberWriteOffsetBugReproduction)
{
    // INTEGRATION TEST: Reproduce the exact bug using tracegen
    //
    // This test uses the actual tracegen code to demonstrate that when
    // dst_offset = AVM_HIGHEST_MEM_ADDRESS, the tracegen produces a value
    // that happens to pass due to uint32_t overflow, but the logic is wrong.
    //
    // The tracegen code (line 89):
    //   { C::get_contract_instance_member_write_offset, event.dst_offset + 1 }
    //
    // When event.dst_offset = 0xFFFFFFFF (uint32_t max):
    //   event.dst_offset + 1 overflows to 0 in uint32_t arithmetic
    //   This accidentally matches PIL's expected value of 0
    //
    // The fix should be:
    //   { C::get_contract_instance_member_write_offset, writes_are_in_bounds ? (event.dst_offset + 1) : 0 }

    EventEmitter<GetContractInstanceEvent> emitter;

    GetContractInstanceEvent event{
        .execution_clk = 42,
        .contract_address = 0x1234,
        .dst_offset = AVM_HIGHEST_MEM_ADDRESS, // Boundary case
        .member_enum = static_cast<uint8_t>(ContractInstanceMember::DEPLOYER),
        .space_id = 1,
        .nullifier_tree_root = 0x5678,
        .public_data_tree_root = 0x9ABC,
        .instance_exists = true,
        .retrieved_deployer_addr = 0xDEAD,
        .retrieved_class_id = 0xBEEF,
        .retrieved_init_hash = 0xCAFE,
    };

    emitter.emit(std::move(event));
    auto events = emitter.dump_events();

    TestTraceContainer trace;
    GetContractInstanceTraceBuilder builder;
    builder.process(events, trace);

    PrecomputedTraceBuilder precomputed_builder;
    precomputed_builder.process_get_contract_instance_table(trace);

    // Verify tracegen produces the expected values
    // Row 1 is where the actual data is (row 0 is the skippable setup)
    uint32_t data_row = 1;

    // Check that is_valid_writes_in_bounds = 0 (since dst_offset = AVM_HIGHEST_MEM_ADDRESS)
    EXPECT_EQ(trace.get(C::get_contract_instance_is_valid_writes_in_bounds, data_row), FF(0));

    // Check that member_write_offset was set
    // Due to uint32_t overflow: (uint32_t)0xFFFFFFFF + 1 = 0
    // So tracegen produces 0, which accidentally matches PIL's expected value
    FF actual_member_write_offset = trace.get(C::get_contract_instance_member_write_offset, data_row);

    // The tracegen produces 0 due to overflow, which is the "correct" value
    // but only by accident. The proper fix would make this explicit.
    EXPECT_EQ(actual_member_write_offset, FF(0))
        << "Due to uint32_t overflow, tracegen produces 0 which accidentally matches PIL expectation";

    // The relation check should pass (because of the accidental overflow behavior)
    check_relation<get_contract_instance>(trace);

    // Now demonstrate what would happen if there was no overflow
    // (i.e., if the arithmetic was done in field or 64-bit)
    // Set member_write_offset to the "wrong" value that tracegen would produce without overflow
    FF wrong_value_without_overflow = FF(AVM_HIGHEST_MEM_ADDRESS) + FF(1);
    trace.set(C::get_contract_instance_member_write_offset, data_row, wrong_value_without_overflow);

    // This should now fail the member_write_offset constraint
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<get_contract_instance>(trace, get_contract_instance::SR_MEMBER_WRITE_OFFSET),
        "MEMBER_WRITE_OFFSET");
}

} // namespace
} // namespace bb::avm2::constraining
