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
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/get_contract_instance_events.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/opcodes/get_contract_instance_trace.hpp"
#include "barretenberg/vm2/tracegen/precomputed_trace.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::constraining {
namespace {

using simulation::EventEmitter;
using simulation::GetContractInstanceEvent;
using tracegen::GetContractInstanceTraceBuilder;
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
    const FF dstOffset = FF(100);                                        // Use a smaller offset for clear testing
    const FF dstOffsetDiffMax = FF(AVM_HIGHEST_MEM_ADDRESS) - dstOffset; // AVM_HIGHEST_MEM_ADDRESS - 100
    const FF dstOffsetDiffMaxInv = dstOffsetDiffMax.invert();            // 1/DST_OFFSET_DIFF_MAX
    const FF wrongInvValue = FF(42);

    // New constraint: DST_OFFSET_DIFF_MAX * dst_offset_diff_max_inv - sel_writes_in_bounds = 0
    // For valid in-bounds case: sel_writes_in_bounds=1 requires dst_offset_diff_max_inv = 1/DST_OFFSET_DIFF_MAX

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_dst_offset, dstOffset },
          { C::get_contract_instance_sel_writes_in_bounds, 1 },
          { C::get_contract_instance_dst_offset_diff_max_inv, dstOffsetDiffMaxInv } },
    });

    check_relation<get_contract_instance>(trace, get_contract_instance::SR_WRITE_OUT_OF_BOUNDS_CHECK);

    // Negative test: mutate to incorrect dst_offset_diff_max_inv
    trace.set(C::get_contract_instance_dst_offset_diff_max_inv, 1, wrongInvValue); // Wrong inv value
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<get_contract_instance>(trace, get_contract_instance::SR_WRITE_OUT_OF_BOUNDS_CHECK),
        "WRITE_OUT_OF_BOUNDS_CHECK");
    // Reset
    trace.set(C::get_contract_instance_dst_offset_diff_max_inv, 1, dstOffsetDiffMaxInv);

    // Negative test: mutate to incorrect sel_write_in_bounds
    trace.set(C::get_contract_instance_sel_writes_in_bounds, 1, 0); // Out of bounds
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<get_contract_instance>(trace, get_contract_instance::SR_WRITE_OUT_OF_BOUNDS_CHECK),
        "WRITE_OUT_OF_BOUNDS_CHECK");
    // Reset
    trace.set(C::get_contract_instance_sel_writes_in_bounds, 1, 1);
}

TEST(GetContractInstanceConstrainingTest, WriteOutOfBoundsCheck)
{
    // Test constants
    const FF dstOffset = FF(AVM_HIGHEST_MEM_ADDRESS); // Boundary case: dst_offset + 1 would be out of bounds
    const FF dstOffsetDiffMaxInv = FF(0);             // Any value works when DST_OFFSET_DIFF_MAX = 0

    // New constraint: DST_OFFSET_DIFF_MAX * ((1 - sel_writes_in_bounds) * (1 - dst_offset_diff_max_inv) +
    // dst_offset_diff_max_inv) - sel_writes_in_bounds = 0 For valid out-of-bounds case: sel_writes_in_bounds=0 requires
    // DST_OFFSET_DIFF_MAX * (1 - dst_offset_diff_max_inv + dst_offset_diff_max_inv) = 0 This means DST_OFFSET_DIFF_MAX
    // = 0, which happens when dst_offset = AVM_HIGHEST_MEM_ADDRESS

    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_dst_offset, dstOffset },
          { C::get_contract_instance_sel_writes_in_bounds, 0 },
          { C::get_contract_instance_dst_offset_diff_max_inv, dstOffsetDiffMaxInv } },
    });

    check_relation<get_contract_instance>(trace, get_contract_instance::SR_WRITE_OUT_OF_BOUNDS_CHECK);

    // Negative test: mutate to incorrect sel_write_in_bounds
    trace.set(C::get_contract_instance_sel_writes_in_bounds, 1, 1);
    EXPECT_THROW_WITH_MESSAGE(
        check_relation<get_contract_instance>(trace, get_contract_instance::SR_WRITE_OUT_OF_BOUNDS_CHECK),
        "WRITE_OUT_OF_BOUNDS_CHECK");
    // Reset
    trace.set(C::get_contract_instance_sel_writes_in_bounds, 1, 0);
}

TEST(GetContractInstanceConstrainingTest, ErrorAggregationConstraint)
{
    // Test subrelation 2: error = (1 - sel_writes_in_bounds) + (1 - is_valid_member_enum)
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // No error case
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_error, 0 },
          { C::get_contract_instance_sel_writes_in_bounds, 1 },
          { C::get_contract_instance_is_valid_member_enum, 1 } },
    });

    check_relation<get_contract_instance>(trace, static_cast<size_t>(2)); // Test subrelation 2

    // Test bounds error
    trace.set(C::get_contract_instance_error, 1, 1);
    trace.set(C::get_contract_instance_sel_writes_in_bounds, 1, 0); // Out of bounds
    check_relation<get_contract_instance>(trace, static_cast<size_t>(2));

    // Test enum error
    trace.set(C::get_contract_instance_sel_writes_in_bounds, 1, 1); // Fix bounds
    trace.set(C::get_contract_instance_is_valid_member_enum, 1, 0); // Invalid enum
    check_relation<get_contract_instance>(trace, static_cast<size_t>(2));

    // Test both errors
    trace.set(C::get_contract_instance_error, 1, 2);
    trace.set(C::get_contract_instance_sel_writes_in_bounds, 1, 0); // Out of bounds
    trace.set(C::get_contract_instance_is_valid_member_enum, 1, 0); // Invalid enum
    check_relation<get_contract_instance>(trace, static_cast<size_t>(2));

    // Negative test: wrong error value
    trace.set(C::get_contract_instance_error, 1, 1); // Should be 2
    EXPECT_THROW_WITH_MESSAGE(check_relation<get_contract_instance>(trace, static_cast<size_t>(2)), "2");
}

TEST(GetContractInstanceConstrainingTest, SelectedMemberConstraint)
{
    // Test constants
    const FF deployerAddr = 0x1234;
    const FF classId = 0x5678;
    const FF initHash = 0x9ABC;
    const FF wrongValue = 0x1111;

    // Test subrelation 3: selected_member = is_deployer * deployer + is_class_id * class_id + is_init_hash * init_hash
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // DEPLOYER selection
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_selected_member, deployerAddr },
          { C::get_contract_instance_is_deployer, 1 },
          { C::get_contract_instance_is_class_id, 0 },
          { C::get_contract_instance_is_init_hash, 0 },
          { C::get_contract_instance_retrieved_deployer_addr, deployerAddr },
          { C::get_contract_instance_retrieved_class_id, classId },
          { C::get_contract_instance_retrieved_init_hash, initHash } },
    });

    check_relation<get_contract_instance>(trace, static_cast<size_t>(3)); // Test subrelation 3

    // Test CLASS_ID selection
    trace.set(C::get_contract_instance_selected_member, 1, classId);
    trace.set(C::get_contract_instance_is_deployer, 1, 0);
    trace.set(C::get_contract_instance_is_class_id, 1, 1);
    check_relation<get_contract_instance>(trace, static_cast<size_t>(3));

    // Test INIT_HASH selection
    trace.set(C::get_contract_instance_selected_member, 1, initHash);
    trace.set(C::get_contract_instance_is_class_id, 1, 0);
    trace.set(C::get_contract_instance_is_init_hash, 1, 1);
    check_relation<get_contract_instance>(trace, static_cast<size_t>(3));

    // Negative test: wrong selected member
    trace.set(C::get_contract_instance_selected_member, 1, wrongValue); // Wrong value
    EXPECT_THROW_WITH_MESSAGE(check_relation<get_contract_instance>(trace, static_cast<size_t>(3)), "3");
}

TEST(GetContractInstanceConstrainingTest, MemberWriteOffsetConstraint)
{
    // Test constants
    const uint32_t dstOffset = 100;
    const uint32_t memberWriteOffset = 101;
    const uint32_t wrongOffset = 99;

    // Test subrelation 4: member_write_offset = sel_writes_in_bounds * (dst_offset + 1)
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // In bounds case
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_member_write_offset, memberWriteOffset },
          { C::get_contract_instance_sel_writes_in_bounds, 1 },
          { C::get_contract_instance_dst_offset, dstOffset } },
    });

    check_relation<get_contract_instance>(trace, static_cast<size_t>(4)); // Test subrelation 4

    // Out of bounds case (should be 0)
    trace.set(C::get_contract_instance_member_write_offset, 1, 0);
    trace.set(C::get_contract_instance_sel_writes_in_bounds, 1, 0);
    check_relation<get_contract_instance>(trace, static_cast<size_t>(4));

    // Negative test: wrong offset calculation
    trace.set(C::get_contract_instance_sel_writes_in_bounds, 1, 1);          // Back to in bounds
    trace.set(C::get_contract_instance_member_write_offset, 1, wrongOffset); // Wrong: should be 101
    EXPECT_THROW_WITH_MESSAGE(check_relation<get_contract_instance>(trace, static_cast<size_t>(4)), "4");
}

TEST(GetContractInstanceConstrainingTest, ExistsTagConstraint)
{
    // Test constants
    const uint8_t u1Tag = static_cast<uint8_t>(ValueTag::U1);
    const uint8_t ffTag = static_cast<uint8_t>(ValueTag::FF);

    // Test subrelation 5: exists_tag = sel_writes_in_bounds * MEM_TAG_U1
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // In bounds case
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_exists_tag, u1Tag },
          { C::get_contract_instance_sel_writes_in_bounds, 1 } },
    });

    check_relation<get_contract_instance>(trace, static_cast<size_t>(5)); // Test subrelation 5

    // Out of bounds case (should be 0)
    trace.set(C::get_contract_instance_exists_tag, 1, 0);
    trace.set(C::get_contract_instance_sel_writes_in_bounds, 1, 0);
    check_relation<get_contract_instance>(trace, static_cast<size_t>(5));

    // Negative test: wrong tag when in bounds
    trace.set(C::get_contract_instance_sel_writes_in_bounds, 1, 1);
    trace.set(C::get_contract_instance_exists_tag, 1, ffTag); // Wrong tag
    EXPECT_THROW_WITH_MESSAGE(check_relation<get_contract_instance>(trace, static_cast<size_t>(5)), "5");
}

TEST(GetContractInstanceConstrainingTest, MemberTagConstraint)
{
    // Test constants
    const uint8_t ffTag = static_cast<uint8_t>(ValueTag::FF);
    const uint8_t u32Tag = static_cast<uint8_t>(ValueTag::U32);

    // Test subrelation 6: member_tag = sel_writes_in_bounds * MEM_TAG_FF
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // In bounds case
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_member_tag, ffTag },
          { C::get_contract_instance_sel_writes_in_bounds, 1 } },
    });

    check_relation<get_contract_instance>(trace, static_cast<size_t>(6)); // Test subrelation 6

    // Out of bounds case (should be 0)
    trace.set(C::get_contract_instance_member_tag, 1, 0);
    trace.set(C::get_contract_instance_sel_writes_in_bounds, 1, 0);
    check_relation<get_contract_instance>(trace, static_cast<size_t>(6));

    // Negative test: wrong tag when in bounds
    trace.set(C::get_contract_instance_sel_writes_in_bounds, 1, 1);
    trace.set(C::get_contract_instance_member_tag, 1, u32Tag); // Wrong tag
    EXPECT_THROW_WITH_MESSAGE(check_relation<get_contract_instance>(trace, static_cast<size_t>(6)), "6");
}

TEST(GetContractInstanceConstrainingTest, ComplexMultiRowSequence)
{
    // Test constants
    const uint32_t dstOffset1 = 100;
    const uint32_t dstOffset2 = 200;
    const uint32_t dstOffset3 = 300;
    const uint8_t deployerEnum = 0;
    const uint8_t classIdEnum = 1;
    const uint8_t invalidEnum = 5;
    const FF deployerAddr1 = 0x1234;
    const FF classId1 = 0x5678;
    const FF initHash1 = 0x9ABC;
    const FF deployerAddr2 = 0x1111;
    const FF classId2 = 0x2222;
    const FF initHash2 = 0x3333;
    const FF deployerAddr3 = 0x4444;
    const FF classId3 = 0x5555;
    const FF initHash3 = 0x6666;
    const uint32_t memberWriteOffset1 = 101;
    const uint32_t memberWriteOffset2 = 201;
    const uint32_t memberWriteOffset3 = 301;
    const uint8_t u1Tag = static_cast<uint8_t>(ValueTag::U1);
    const uint8_t ffTag = static_cast<uint8_t>(ValueTag::FF);

    // Test multiple GetContractInstance operations in sequence
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        // Row 1: skippable gadget selector
        { { C::get_contract_instance_sel, 0 } }, // Must satisfy error constraint
        // Row 2: Valid DEPLOYER retrieval
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_dst_offset, dstOffset1 },
          { C::get_contract_instance_member_enum, deployerEnum }, // DEPLOYER
          { C::get_contract_instance_sel_writes_in_bounds, 1 },
          { C::get_contract_instance_dst_offset_diff_max_inv, FF(AVM_HIGHEST_MEM_ADDRESS - dstOffset1).invert() },
          { C::get_contract_instance_error, 0 },
          { C::get_contract_instance_is_valid_member_enum, 1 },
          { C::get_contract_instance_is_deployer, 1 },
          { C::get_contract_instance_is_class_id, 0 },
          { C::get_contract_instance_is_init_hash, 0 },
          { C::get_contract_instance_retrieved_deployer_addr, deployerAddr1 },
          { C::get_contract_instance_retrieved_class_id, classId1 },
          { C::get_contract_instance_retrieved_init_hash, initHash1 },
          { C::get_contract_instance_selected_member, deployerAddr1 },
          { C::get_contract_instance_member_write_offset, memberWriteOffset1 },
          { C::get_contract_instance_exists_tag, u1Tag },
          { C::get_contract_instance_member_tag, ffTag } },
        // Row 3: Valid CLASS_ID retrieval
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_dst_offset, dstOffset2 },
          { C::get_contract_instance_member_enum, classIdEnum }, // CLASS_ID
          { C::get_contract_instance_sel_writes_in_bounds, 1 },
          { C::get_contract_instance_dst_offset_diff_max_inv, FF(AVM_HIGHEST_MEM_ADDRESS - dstOffset2).invert() },
          { C::get_contract_instance_error, 0 },
          { C::get_contract_instance_is_valid_member_enum, 1 },
          { C::get_contract_instance_is_deployer, 0 },
          { C::get_contract_instance_is_class_id, 1 },
          { C::get_contract_instance_is_init_hash, 0 },
          { C::get_contract_instance_retrieved_deployer_addr, deployerAddr2 },
          { C::get_contract_instance_retrieved_class_id, classId2 },
          { C::get_contract_instance_retrieved_init_hash, initHash2 },
          { C::get_contract_instance_selected_member, classId2 },
          { C::get_contract_instance_member_write_offset, memberWriteOffset2 },
          { C::get_contract_instance_exists_tag, u1Tag },
          { C::get_contract_instance_member_tag, ffTag } },
        // Row 4: Invalid member enum with error
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_dst_offset, dstOffset3 },
          { C::get_contract_instance_member_enum, invalidEnum }, // Invalid
          { C::get_contract_instance_sel_writes_in_bounds, 1 },
          { C::get_contract_instance_dst_offset_diff_max_inv, FF(AVM_HIGHEST_MEM_ADDRESS - dstOffset3).invert() },
          { C::get_contract_instance_error, 1 }, // Error due to invalid enum
          { C::get_contract_instance_is_valid_member_enum, 0 },
          { C::get_contract_instance_is_deployer, 0 },
          { C::get_contract_instance_is_class_id, 0 },
          { C::get_contract_instance_is_init_hash, 0 },
          { C::get_contract_instance_retrieved_deployer_addr, deployerAddr3 },
          { C::get_contract_instance_retrieved_class_id, classId3 },
          { C::get_contract_instance_retrieved_init_hash, initHash3 },
          { C::get_contract_instance_selected_member, 0 }, // No selection due to invalid enum
          { C::get_contract_instance_member_write_offset, memberWriteOffset3 },
          { C::get_contract_instance_exists_tag, u1Tag },
          { C::get_contract_instance_member_tag, ffTag } },
    });

    check_relation<get_contract_instance>(trace);
}

TEST(GetContractInstanceConstrainingTest, OutOfBoundsComplexCase)
{
    // Test constants
    const uint32_t dstOffset = AVM_HIGHEST_MEM_ADDRESS; // At boundary
    const uint8_t initHashEnum = 2;                     // INIT_HASH
    const FF dstOffsetDiffMaxInv = 0;                   // Out of bounds: DST_OFFSET_DIFF_MAX = 0, so any value works
    const FF deployerAddr = 0x1111;
    const FF classId = 0x2222;
    const FF initHash = 0x3333;

    // Test out-of-bounds case with proper constraint satisfaction
    TestTraceContainer trace({
        { { C::precomputed_first_row, 1 } },
        { { C::get_contract_instance_sel, 0 } },
        { { C::get_contract_instance_sel, 1 },
          { C::get_contract_instance_dst_offset, dstOffset },
          { C::get_contract_instance_member_enum, initHashEnum },
          { C::get_contract_instance_sel_writes_in_bounds, 0 }, // Out of bounds
          { C::get_contract_instance_dst_offset_diff_max_inv, dstOffsetDiffMaxInv },
          { C::get_contract_instance_error, 1 },                // Error due to bounds
          { C::get_contract_instance_is_valid_member_enum, 1 }, // Valid enum
          { C::get_contract_instance_is_deployer, 0 },
          { C::get_contract_instance_is_class_id, 0 },
          { C::get_contract_instance_is_init_hash, 1 },
          { C::get_contract_instance_retrieved_deployer_addr, deployerAddr },
          { C::get_contract_instance_retrieved_class_id, classId },
          { C::get_contract_instance_retrieved_init_hash, initHash },
          { C::get_contract_instance_selected_member, initHash }, // Still computed correctly
          { C::get_contract_instance_member_write_offset, 0 },    // 0 when out of bounds
          { C::get_contract_instance_exists_tag, 0 },             // 0 when out of bounds
          { C::get_contract_instance_member_tag, 0 } },           // 0 when out of bounds
    });

    check_relation<get_contract_instance>(trace);
}

// Integration-style tests using tracegen components
TEST(GetContractInstanceConstrainingTest, IntegrationTracegenValid)
{
    // Test constants
    const uint32_t executionClk = 42;
    const uint32_t timestamp = 1000;
    const FF contractAddress = 0x1234;
    const uint32_t dstOffset = 100;
    const uint8_t deployerEnum = static_cast<uint8_t>(ContractInstanceMember::DEPLOYER);
    const uint32_t spaceId = 1;
    const FF deployerAddr = 0x5678;
    const FF classId = 0x9ABC;
    const FF initHash = 0xDEF0;

    // Use real tracegen to generate a valid trace
    EventEmitter<GetContractInstanceEvent> emitter;

    GetContractInstanceEvent event;
    event.execution_clk = executionClk;
    event.timestamp = timestamp;
    event.contract_address = contractAddress;
    event.dst_offset = dstOffset;
    event.member_enum = deployerEnum;
    event.space_id = spaceId;
    event.dst_out_of_bounds = false;
    event.member_enum_error = false;
    event.instance_exists = true;
    event.retrieved_deployer_addr = deployerAddr;
    event.retrieved_class_id = classId;
    event.retrieved_init_hash = initHash;
    event.selected_member = deployerAddr;

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
    const uint32_t executionClk = 42;
    const uint32_t timestamp = 1000;
    const FF contractAddress = 0x1234;
    const uint32_t dstOffset = 100;
    const uint8_t invalidEnum = 5; // Invalid enum
    const uint32_t spaceId = 1;
    const FF deployerAddr = 0x5678;
    const FF classId = 0x9ABC;
    const FF initHash = 0xDEF0;
    const FF noSelection = 0; // No selection for invalid enum

    // Test with invalid member enum
    EventEmitter<GetContractInstanceEvent> emitter;

    GetContractInstanceEvent event;
    event.execution_clk = executionClk;
    event.timestamp = timestamp;
    event.contract_address = contractAddress;
    event.dst_offset = dstOffset;
    event.member_enum = invalidEnum;
    event.space_id = spaceId;
    event.dst_out_of_bounds = false;
    event.member_enum_error = true;
    event.instance_exists = true;
    event.retrieved_deployer_addr = deployerAddr;
    event.retrieved_class_id = classId;
    event.retrieved_init_hash = initHash;
    event.selected_member = noSelection;

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
    const uint32_t executionClk = 42;
    const uint32_t timestamp = 1000;
    const FF contractAddress = 0x1234;
    const uint32_t dstOffset = AVM_HIGHEST_MEM_ADDRESS;
    const uint8_t classIdEnum = static_cast<uint8_t>(ContractInstanceMember::CLASS_ID);
    const uint32_t spaceId = 1;
    const FF deployerAddr = 0x5678;
    const FF classId = 0x9ABC;
    const FF initHash = 0xDEF0;

    // Test with out-of-bounds destination
    EventEmitter<GetContractInstanceEvent> emitter;

    GetContractInstanceEvent event;
    event.execution_clk = executionClk;
    event.timestamp = timestamp;
    event.contract_address = contractAddress;
    event.dst_offset = dstOffset;
    event.member_enum = classIdEnum;
    event.space_id = spaceId;
    event.dst_out_of_bounds = true;
    event.member_enum_error = false;
    event.instance_exists = true;
    event.retrieved_deployer_addr = deployerAddr;
    event.retrieved_class_id = classId;
    event.retrieved_init_hash = initHash;
    event.selected_member = classId; // CLASS_ID selected

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

} // namespace
} // namespace bb::avm2::constraining
