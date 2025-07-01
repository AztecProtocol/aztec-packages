#include "barretenberg/vm2/tracegen/opcodes/get_contract_instance_trace.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/get_contract_instance_events.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using ::testing::AllOf;
using ::testing::ElementsAre;

TEST(GetContractInstanceTraceTest, ValidMemberEnumDeployer)
{
    // Test constants
    const uint32_t executionClk = 42;
    const uint32_t timestamp = 1000;
    const FF contractAddress = 0x1234;
    const uint32_t dstOffset = 100;
    const uint32_t spaceId = 1;
    const FF deployerAddr = 0x5678;
    const FF classId = 0x9ABC;
    const FF initHash = 0xDEF0;
    const uint32_t dstOffsetPlusOne = dstOffset + 1;
    const uint8_t deployerEnum = static_cast<uint8_t>(ContractInstanceMember::DEPLOYER);
    const uint8_t u1Tag = static_cast<uint8_t>(ValueTag::U1);
    const uint8_t ffTag = static_cast<uint8_t>(ValueTag::FF);

    TestTraceContainer trace;
    GetContractInstanceTraceBuilder builder;
    simulation::EventEmitter<simulation::GetContractInstanceEvent> emitter;

    simulation::GetContractInstanceEvent event = {
        .execution_clk = executionClk,
        .timestamp = timestamp,
        .contract_address = contractAddress,
        .dst_offset = dstOffset,
        .member_enum = deployerEnum,
        .space_id = spaceId,
        .dst_out_of_bounds = false,
        .member_enum_error = false,
        .instance_exists = true,
        .retrieved_deployer_addr = deployerAddr,
        .retrieved_class_id = classId,
        .retrieved_init_hash = initHash,
        .selected_member = deployerAddr, // deployer_addr for DEPLOYER enum
    };

    emitter.emit(std::move(event));
    auto events = emitter.dump_events();

    builder.process(events, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Row 0: Skippable gadget selector
                    AllOf(ROW_FIELD_EQ(get_contract_instance_sel, 0)),
                    // Row 1: Active GetContractInstance gadget
                    AllOf(ROW_FIELD_EQ(get_contract_instance_sel, 1),
                          ROW_FIELD_EQ(get_contract_instance_clk, executionClk),
                          ROW_FIELD_EQ(get_contract_instance_contract_address, contractAddress),
                          ROW_FIELD_EQ(get_contract_instance_dst_offset, dstOffset),
                          ROW_FIELD_EQ(get_contract_instance_member_enum, deployerEnum),
                          ROW_FIELD_EQ(get_contract_instance_space_id, spaceId),
                          // Member selection flags
                          ROW_FIELD_EQ(get_contract_instance_is_valid_member_enum, 1),
                          ROW_FIELD_EQ(get_contract_instance_is_deployer, 1),
                          ROW_FIELD_EQ(get_contract_instance_is_class_id, 0),
                          ROW_FIELD_EQ(get_contract_instance_is_init_hash, 0),
                          // Error flags
                          ROW_FIELD_EQ(get_contract_instance_error, 0),
                          ROW_FIELD_EQ(get_contract_instance_dst_out_of_bounds, 0),
                          ROW_FIELD_EQ(get_contract_instance_member_enum_error, 0),
                          // Retrieved members
                          ROW_FIELD_EQ(get_contract_instance_retrieved_deployer_addr, deployerAddr),
                          ROW_FIELD_EQ(get_contract_instance_retrieved_class_id, classId),
                          ROW_FIELD_EQ(get_contract_instance_retrieved_init_hash, initHash),
                          ROW_FIELD_EQ(get_contract_instance_selected_member, deployerAddr),
                          // Memory write columns
                          ROW_FIELD_EQ(get_contract_instance_member_write_offset, dstOffsetPlusOne),
                          ROW_FIELD_EQ(get_contract_instance_exists_tag, u1Tag),
                          ROW_FIELD_EQ(get_contract_instance_member_tag, ffTag))));
}

TEST(GetContractInstanceTraceTest, InvalidMemberEnum)
{
    // Test constants
    const uint32_t executionClk = 42;
    const uint32_t timestamp = 1000;
    const FF contractAddress = 0x1234;
    const uint32_t dstOffset = 100;
    const uint32_t spaceId = 1;
    const FF deployerAddr = 0x5678;
    const FF classId = 0x9ABC;
    const FF initHash = 0xDEF0;
    const uint8_t invalidEnum = 5; // Invalid enum (> 2)
    const FF noSelection = 0;      // No selection for invalid enum

    TestTraceContainer trace;
    GetContractInstanceTraceBuilder builder;
    simulation::EventEmitter<simulation::GetContractInstanceEvent> emitter;

    simulation::GetContractInstanceEvent event = {
        .execution_clk = executionClk,
        .timestamp = timestamp,
        .contract_address = contractAddress,
        .dst_offset = dstOffset,
        .member_enum = invalidEnum,
        .space_id = spaceId,
        .dst_out_of_bounds = false,
        .member_enum_error = true,
        .instance_exists = true,
        .retrieved_deployer_addr = deployerAddr,
        .retrieved_class_id = classId,
        .retrieved_init_hash = initHash,
        .selected_member = noSelection,
    };

    emitter.emit(std::move(event));
    auto events = emitter.dump_events();

    builder.process(events, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Row 0: Skippable gadget selector
                    AllOf(ROW_FIELD_EQ(get_contract_instance_sel, 0)),
                    // Row 1: GetContractInstance gadget with invalid enum
                    AllOf(ROW_FIELD_EQ(get_contract_instance_sel, 1),
                          ROW_FIELD_EQ(get_contract_instance_clk, executionClk),
                          ROW_FIELD_EQ(get_contract_instance_contract_address, contractAddress),
                          ROW_FIELD_EQ(get_contract_instance_dst_offset, dstOffset),
                          ROW_FIELD_EQ(get_contract_instance_member_enum, invalidEnum),
                          ROW_FIELD_EQ(get_contract_instance_space_id, spaceId),
                          // Error flags
                          ROW_FIELD_EQ(get_contract_instance_error, 1), // Should have error
                          ROW_FIELD_EQ(get_contract_instance_member_enum_error, 1),
                          // Member selection flags (should all be false for invalid enum)
                          ROW_FIELD_EQ(get_contract_instance_is_valid_member_enum, 0),
                          ROW_FIELD_EQ(get_contract_instance_is_deployer, 0),
                          ROW_FIELD_EQ(get_contract_instance_is_class_id, 0),
                          ROW_FIELD_EQ(get_contract_instance_is_init_hash, 0),
                          // Selected member (should be 0 for invalid enum)
                          ROW_FIELD_EQ(get_contract_instance_selected_member, noSelection))));
}

TEST(GetContractInstanceTraceTest, ValidMemberEnumInitHash)
{
    // Test constants
    const uint32_t EXECUTION_CLK = 42;
    const uint32_t TIMESTAMP = 1000;
    const FF CONTRACT_ADDRESS = 0x1234;
    const uint32_t DST_OFFSET = 100;
    const uint32_t SPACE_ID = 1;
    const FF DEPLOYER_ADDR = 0x5678;
    const FF CLASS_ID = 0x9ABC;
    const FF INIT_HASH = 0xDEF0;
    const uint8_t INIT_HASH_ENUM = static_cast<uint8_t>(ContractInstanceMember::INIT_HASH);

    TestTraceContainer trace;
    GetContractInstanceTraceBuilder builder;
    simulation::EventEmitter<simulation::GetContractInstanceEvent> emitter;

    simulation::GetContractInstanceEvent event = {
        .execution_clk = EXECUTION_CLK,
        .timestamp = TIMESTAMP,
        .contract_address = CONTRACT_ADDRESS,
        .dst_offset = DST_OFFSET,
        .member_enum = INIT_HASH_ENUM,
        .space_id = SPACE_ID,
        .dst_out_of_bounds = false,
        .member_enum_error = false,
        .instance_exists = true,
        .retrieved_deployer_addr = DEPLOYER_ADDR,
        .retrieved_class_id = CLASS_ID,
        .retrieved_init_hash = INIT_HASH,
        .selected_member = INIT_HASH, // init_hash for INIT_HASH enum
    };

    emitter.emit(std::move(event));
    auto events = emitter.dump_events();

    builder.process(events, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Row 0: Skippable gadget selector
                    AllOf(ROW_FIELD_EQ(get_contract_instance_sel, 0)),
                    // Row 1: GetContractInstance gadget with INIT_HASH
                    AllOf(ROW_FIELD_EQ(get_contract_instance_sel, 1),
                          ROW_FIELD_EQ(get_contract_instance_clk, EXECUTION_CLK),
                          ROW_FIELD_EQ(get_contract_instance_contract_address, CONTRACT_ADDRESS),
                          ROW_FIELD_EQ(get_contract_instance_dst_offset, DST_OFFSET),
                          ROW_FIELD_EQ(get_contract_instance_member_enum, INIT_HASH_ENUM),
                          ROW_FIELD_EQ(get_contract_instance_space_id, SPACE_ID),
                          // Member selection flags
                          ROW_FIELD_EQ(get_contract_instance_is_valid_member_enum, 1),
                          ROW_FIELD_EQ(get_contract_instance_is_deployer, 0),
                          ROW_FIELD_EQ(get_contract_instance_is_class_id, 0),
                          ROW_FIELD_EQ(get_contract_instance_is_init_hash, 1),
                          // Selected member (should be init_hash since member_enum == 2)
                          ROW_FIELD_EQ(get_contract_instance_selected_member, INIT_HASH),
                          // No error
                          ROW_FIELD_EQ(get_contract_instance_error, 0))));
}

TEST(GetContractInstanceTraceTest, OutOfBoundsDestination)
{
    // Test constants
    const uint32_t EXECUTION_CLK = 42;
    const uint32_t TIMESTAMP = 1000;
    const FF CONTRACT_ADDRESS = 0x1234;
    const uint32_t DST_OFFSET = AVM_HIGHEST_MEM_ADDRESS; // Max address, so +1 is out of bounds
    const uint32_t SPACE_ID = 1;
    const FF DEPLOYER_ADDR = 0x5678;
    const FF CLASS_ID = 0x9ABC;
    const FF INIT_HASH = 0xDEF0;
    const uint8_t CLASS_ID_ENUM = static_cast<uint8_t>(ContractInstanceMember::CLASS_ID);
    const uint32_t OUT_OF_BOUNDS_WRITE_OFFSET = AVM_HIGHEST_MEM_ADDRESS + 1;
    const uint8_t ZERO_TAG = 0;

    TestTraceContainer trace;
    GetContractInstanceTraceBuilder builder;
    simulation::EventEmitter<simulation::GetContractInstanceEvent> emitter;

    simulation::GetContractInstanceEvent event = {
        .execution_clk = EXECUTION_CLK,
        .timestamp = TIMESTAMP,
        .contract_address = CONTRACT_ADDRESS,
        .dst_offset = DST_OFFSET,
        .member_enum = CLASS_ID_ENUM,
        .space_id = SPACE_ID,
        .dst_out_of_bounds = true,
        .member_enum_error = false,
        .instance_exists = true,
        .retrieved_deployer_addr = DEPLOYER_ADDR,
        .retrieved_class_id = CLASS_ID,
        .retrieved_init_hash = INIT_HASH,
        .selected_member = CLASS_ID, // class_id for CLASS_ID enum
    };

    emitter.emit(std::move(event));
    auto events = emitter.dump_events();

    builder.process(events, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Row 0: Skippable gadget selector
                    AllOf(ROW_FIELD_EQ(get_contract_instance_sel, 0)),
                    // Row 1: GetContractInstance gadget with out-of-bounds destination
                    AllOf(ROW_FIELD_EQ(get_contract_instance_sel, 1),
                          ROW_FIELD_EQ(get_contract_instance_clk, EXECUTION_CLK),
                          ROW_FIELD_EQ(get_contract_instance_contract_address, CONTRACT_ADDRESS),
                          ROW_FIELD_EQ(get_contract_instance_dst_offset, DST_OFFSET),
                          ROW_FIELD_EQ(get_contract_instance_member_enum, CLASS_ID_ENUM),
                          ROW_FIELD_EQ(get_contract_instance_space_id, SPACE_ID),
                          // Error flags
                          ROW_FIELD_EQ(get_contract_instance_error, 1), // Should have error
                          ROW_FIELD_EQ(get_contract_instance_dst_out_of_bounds, 1),
                          ROW_FIELD_EQ(get_contract_instance_sel_writes_in_bounds, 0),
                          // dst_offset_diff_max_inv calculation (when DST_OFFSET_DIFF_MAX = 0)
                          ROW_FIELD_EQ(get_contract_instance_dst_offset_diff_max_inv, 0),
                          // Selected member (still computed correctly)
                          ROW_FIELD_EQ(get_contract_instance_selected_member, CLASS_ID),
                          // Memory write columns (should be 0 for invalid tags when out of bounds)
                          ROW_FIELD_EQ(get_contract_instance_member_write_offset, OUT_OF_BOUNDS_WRITE_OFFSET),
                          ROW_FIELD_EQ(get_contract_instance_exists_tag, ZERO_TAG), // Should be 0 when out of bounds
                          ROW_FIELD_EQ(get_contract_instance_member_tag, ZERO_TAG)  // Should be 0 when out of bounds
                          )));
}

} // namespace
} // namespace bb::avm2::tracegen
