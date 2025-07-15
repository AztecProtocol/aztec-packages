#include "barretenberg/vm2/tracegen/opcodes/get_contract_instance_trace.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/constraining/flavor_settings.hpp"
#include "barretenberg/vm2/constraining/full_row.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/get_contract_instance_event.hpp"
#include "barretenberg/vm2/testing/macros.hpp"
#include "barretenberg/vm2/tracegen/test_trace_container.hpp"

namespace bb::avm2::tracegen {
namespace {

using ::testing::AllOf;
using ::testing::ElementsAre;

TEST(GetContractInstanceTraceTest, ValidMemberEnum)
{
    // Test constants
    const uint32_t execution_clk = 42;
    const FF nullifier_tree_root = 0x1234;
    const FF public_data_tree_root = 0x5678;
    const FF contract_address = 0x1234;
    const uint32_t dst_offset = 100;
    const uint32_t space_id = 1;
    const FF deployer_addr = 0x5678;
    const FF class_id = 0x9ABC;
    const FF init_hash = 0xDEF0;
    const uint32_t dst_offset_plus_one = dst_offset + 1;
    const uint8_t deployer_enum = static_cast<uint8_t>(ContractInstanceMember::DEPLOYER);
    const uint8_t u1_tag = static_cast<uint8_t>(ValueTag::U1);
    const uint8_t ff_tag = static_cast<uint8_t>(ValueTag::FF);

    TestTraceContainer trace;
    GetContractInstanceTraceBuilder builder;
    simulation::EventEmitter<simulation::GetContractInstanceEvent> emitter;

    simulation::GetContractInstanceEvent event = {
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

    builder.process(events, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Row 0: Skippable gadget selector
                    AllOf(ROW_FIELD_EQ(get_contract_instance_sel, 0)),
                    // Row 1: Active GetContractInstance gadget
                    AllOf(ROW_FIELD_EQ(get_contract_instance_sel, 1),
                          ROW_FIELD_EQ(get_contract_instance_clk, execution_clk),
                          ROW_FIELD_EQ(get_contract_instance_contract_address, contract_address),
                          ROW_FIELD_EQ(get_contract_instance_dst_offset, dst_offset),
                          ROW_FIELD_EQ(get_contract_instance_member_enum, deployer_enum),
                          ROW_FIELD_EQ(get_contract_instance_space_id, space_id),
                          // Member selection flags
                          ROW_FIELD_EQ(get_contract_instance_is_valid_member_enum, 1),
                          ROW_FIELD_EQ(get_contract_instance_is_deployer, 1),
                          ROW_FIELD_EQ(get_contract_instance_is_class_id, 0),
                          ROW_FIELD_EQ(get_contract_instance_is_init_hash, 0),
                          // Error flags
                          ROW_FIELD_EQ(get_contract_instance_sel_error, 0),
                          // Retrieved members
                          ROW_FIELD_EQ(get_contract_instance_retrieved_deployer_addr, deployer_addr),
                          ROW_FIELD_EQ(get_contract_instance_retrieved_class_id, class_id),
                          ROW_FIELD_EQ(get_contract_instance_retrieved_init_hash, init_hash),
                          // Memory write columns
                          ROW_FIELD_EQ(get_contract_instance_member_write_offset, dst_offset_plus_one),
                          ROW_FIELD_EQ(get_contract_instance_exists_tag, u1_tag),
                          ROW_FIELD_EQ(get_contract_instance_member_tag, ff_tag))));
}

TEST(GetContractInstanceTraceTest, InvalidMemberEnum)
{
    // Test constants
    const uint32_t execution_clk = 42;
    const FF nullifier_tree_root = 0x1234;
    const FF public_data_tree_root = 0x5678;
    const FF contract_address = 0x1234;
    const uint32_t dst_offset = 100;
    const uint32_t space_id = 1;
    const FF deployer_addr = 0x5678;
    const FF class_id = 0x9ABC;
    const FF init_hash = 0xDEF0;
    const uint8_t invalid_enum = 5; // Invalid enum (> 2)

    TestTraceContainer trace;
    GetContractInstanceTraceBuilder builder;
    simulation::EventEmitter<simulation::GetContractInstanceEvent> emitter;

    simulation::GetContractInstanceEvent event = {
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

    builder.process(events, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Row 0: Skippable gadget selector
                    AllOf(ROW_FIELD_EQ(get_contract_instance_sel, 0)),
                    // Row 1: GetContractInstance gadget with invalid enum
                    AllOf(ROW_FIELD_EQ(get_contract_instance_sel, 1),
                          ROW_FIELD_EQ(get_contract_instance_clk, execution_clk),
                          ROW_FIELD_EQ(get_contract_instance_contract_address, contract_address),
                          ROW_FIELD_EQ(get_contract_instance_dst_offset, dst_offset),
                          ROW_FIELD_EQ(get_contract_instance_member_enum, invalid_enum),
                          ROW_FIELD_EQ(get_contract_instance_space_id, space_id),
                          // Error flags
                          ROW_FIELD_EQ(get_contract_instance_sel_error, 1), // Should have error
                          // Member selection flags (should all be false for invalid enum)
                          ROW_FIELD_EQ(get_contract_instance_is_valid_member_enum, 0),
                          ROW_FIELD_EQ(get_contract_instance_is_deployer, 0),
                          ROW_FIELD_EQ(get_contract_instance_is_class_id, 0),
                          ROW_FIELD_EQ(get_contract_instance_is_init_hash, 0))));
}

TEST(GetContractInstanceTraceTest, OutOfBoundsWrite)
{
    // Test constants
    const uint32_t execution_clk = 42;
    const FF nullifier_tree_root = 0x1234;
    const FF public_data_tree_root = 0x5678;
    const FF contract_address = 0x1234;
    const uint32_t dst_offset = AVM_HIGHEST_MEM_ADDRESS; // Max address, so +1 is out of bounds
    const uint32_t space_id = 1;
    const FF deployer_addr = 0x5678;
    const FF class_id = 0x9ABC;
    const FF init_hash = 0xDEF0;
    const uint8_t class_id_enum = static_cast<uint8_t>(ContractInstanceMember::CLASS_ID);
    const uint32_t out_of_bounds_write_offset = AVM_HIGHEST_MEM_ADDRESS + 1;
    const uint8_t zero_tag = 0;

    TestTraceContainer trace;
    GetContractInstanceTraceBuilder builder;
    simulation::EventEmitter<simulation::GetContractInstanceEvent> emitter;

    simulation::GetContractInstanceEvent event = {
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

    builder.process(events, trace);

    EXPECT_THAT(trace.as_rows(),
                ElementsAre(
                    // Row 0: Skippable gadget selector
                    AllOf(ROW_FIELD_EQ(get_contract_instance_sel, 0)),
                    // Row 1: GetContractInstance gadget with out-of-bounds destination
                    AllOf(ROW_FIELD_EQ(get_contract_instance_sel, 1),
                          ROW_FIELD_EQ(get_contract_instance_clk, execution_clk),
                          ROW_FIELD_EQ(get_contract_instance_contract_address, contract_address),
                          ROW_FIELD_EQ(get_contract_instance_dst_offset, dst_offset),
                          ROW_FIELD_EQ(get_contract_instance_member_enum, class_id_enum),
                          ROW_FIELD_EQ(get_contract_instance_space_id, space_id),
                          // Error flags
                          ROW_FIELD_EQ(get_contract_instance_sel_error, 1), // Should have error
                          // dst_offset_diff_max_inv calculation (when DST_OFFSET_DIFF_MAX = 0)
                          ROW_FIELD_EQ(get_contract_instance_dst_offset_diff_max_inv, 0),
                          // Memory write columns (should be 0 for invalid tags when out of bounds)
                          ROW_FIELD_EQ(get_contract_instance_member_write_offset, out_of_bounds_write_offset),
                          ROW_FIELD_EQ(get_contract_instance_exists_tag, zero_tag), // Should be 0 when out of bounds
                          ROW_FIELD_EQ(get_contract_instance_member_tag, zero_tag)  // Should be 0 when out of bounds
                          )));
}

} // namespace
} // namespace bb::avm2::tracegen
