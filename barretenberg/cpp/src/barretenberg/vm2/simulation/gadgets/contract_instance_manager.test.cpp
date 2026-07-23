#include "barretenberg/vm2/simulation/gadgets/contract_instance_manager.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>
#include <optional>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/contract_instance_retrieval_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/testing/mock_dbs.hpp"
#include "barretenberg/vm2/simulation/testing/mock_field_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_update_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"

using ::testing::_;
using ::testing::Return;
using ::testing::SizeIs;
using ::testing::StrictMock;

namespace bb::avm2::simulation {
namespace {

class ContractInstanceManagerTest : public ::testing::Test {
  protected:
    StrictMock<MockContractDB> contract_db;
    StrictMock<MockHighLevelMerkleDB> merkle_db;
    StrictMock<MockUpdateCheck> update_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    EventEmitter<ContractInstanceRetrievalEvent> event_emitter;
};

// Test that querying an empty protocol contract slot (addresses 7-11 are currently unused)
// correctly returns nullopt with exists=false, rather than crashing.
TEST_F(ContractInstanceManagerTest, EmptyProtocolContractSlotReturnsNullopt)
{
    // Create protocol contracts with only first 6 slots filled (matching real configuration)
    // Slots 7-11 are zero (empty).
    ProtocolContracts protocol_contracts;
    for (uint32_t i = 0; i < 6; i++) {
        // Fill slots 0-5 (addresses 1-6) with non-zero derived addresses
        protocol_contracts.derived_addresses[i] = AztecAddress(FF(0x1000 + i));
    }
    // Slots 6-10 (addresses 7-11) are left as zero (default)

    ContractInstanceManager manager(contract_db, merkle_db, update_check, field_gt, protocol_contracts, event_emitter);

    // Query address 7 - an empty protocol contract slot
    AztecAddress empty_slot_address = AztecAddress(7);

    // Setup mocks
    TreeStates tree_states = {};
    EXPECT_CALL(merkle_db, get_tree_state()).WillOnce(Return(tree_states));

    // The contract DB should return nullopt since the instance doesn't exist
    EXPECT_CALL(contract_db, get_contract_instance(empty_slot_address)).WillOnce(Return(std::nullopt));

    // ff_gt(MAX_PROTOCOL_CONTRACTS=11, 7-1=6) returns true because 11 > 6
    // This means address 7 IS in the protocol contract range
    EXPECT_CALL(field_gt, ff_gt(FF(MAX_PROTOCOL_CONTRACTS), FF(6))).WillOnce(Return(true));

    // The call should NOT crash and should return nullopt
    auto result = manager.get_contract_instance(empty_slot_address);

    // Verify the result
    EXPECT_FALSE(result.has_value());

    // Verify the event was emitted correctly
    auto events = event_emitter.dump_events();
    ASSERT_THAT(events, SizeIs(1));
    EXPECT_EQ(events[0].address, empty_slot_address);
    EXPECT_FALSE(events[0].exists);
    EXPECT_TRUE(events[0].is_protocol_contract);
    EXPECT_EQ(events[0].contract_instance, ContractInstance{});
}

// Test that a valid protocol contract (e.g., address 1) works correctly
TEST_F(ContractInstanceManagerTest, ValidProtocolContractReturnsInstance)
{
    // Create protocol contracts with first slot filled
    ProtocolContracts protocol_contracts;
    AztecAddress derived_addr = AztecAddress(FF(0x12345));
    protocol_contracts.derived_addresses[0] = derived_addr; // Address 1 -> index 0

    ContractInstanceManager manager(contract_db, merkle_db, update_check, field_gt, protocol_contracts, event_emitter);

    // Query address 1 - a valid protocol contract
    AztecAddress protocol_address = AztecAddress(1);

    // Create a contract instance
    ContractInstance instance = testing::random_protocol_contract_instance();

    // Setup mocks
    TreeStates tree_states = {};
    EXPECT_CALL(merkle_db, get_tree_state()).WillOnce(Return(tree_states));
    EXPECT_CALL(contract_db, get_contract_instance(protocol_address)).WillOnce(Return(instance));

    // ff_gt(MAX_PROTOCOL_CONTRACTS=11, 1-1=0) returns true because 11 > 0
    EXPECT_CALL(field_gt, ff_gt(FF(MAX_PROTOCOL_CONTRACTS), FF(0))).WillOnce(Return(true));

    // The call should succeed and return the instance
    auto result = manager.get_contract_instance(protocol_address);

    // Verify the result
    ASSERT_TRUE(result.has_value());
    EXPECT_EQ(result.value(), instance);

    // Verify the event was emitted correctly
    auto events = event_emitter.dump_events();
    ASSERT_THAT(events, SizeIs(1));
    EXPECT_EQ(events[0].address, protocol_address);
    EXPECT_TRUE(events[0].exists);
    EXPECT_TRUE(events[0].is_protocol_contract);
    EXPECT_EQ(events[0].contract_instance, instance);
}

// Test that a regular (non-protocol) contract that exists works correctly
TEST_F(ContractInstanceManagerTest, RegularContractExistsReturnsInstance)
{
    ProtocolContracts protocol_contracts; // Empty - no protocol contracts

    ContractInstanceManager manager(contract_db, merkle_db, update_check, field_gt, protocol_contracts, event_emitter);

    // Query a regular address (outside protocol contract range)
    AztecAddress regular_address = AztecAddress(FF(0x1234567890ULL));

    // Create a contract instance
    ContractInstance instance = testing::random_contract_instance();

    // Setup mocks
    TreeStates tree_states = {};
    EXPECT_CALL(merkle_db, get_tree_state()).WillOnce(Return(tree_states));
    EXPECT_CALL(contract_db, get_contract_instance(regular_address)).WillOnce(Return(instance));

    // ff_gt(11, large_address - 1) returns false - not in protocol range
    EXPECT_CALL(field_gt, ff_gt(FF(MAX_PROTOCOL_CONTRACTS), regular_address - 1)).WillOnce(Return(false));

    // Nullifier exists - contract is deployed
    EXPECT_CALL(merkle_db, nullifier_exists(FF(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS), regular_address))
        .WillOnce(Return(true));

    // Update check is performed for regular contracts
    EXPECT_CALL(update_check, check_current_class_id(regular_address, instance));

    // The call should succeed
    auto result = manager.get_contract_instance(regular_address);

    // Verify the result
    ASSERT_TRUE(result.has_value());
    EXPECT_EQ(result.value(), instance);

    // Verify the event
    auto events = event_emitter.dump_events();
    ASSERT_THAT(events, SizeIs(1));
    EXPECT_EQ(events[0].address, regular_address);
    EXPECT_TRUE(events[0].exists);
    EXPECT_FALSE(events[0].is_protocol_contract);
}

// Test that a regular contract that doesn't exist returns nullopt
TEST_F(ContractInstanceManagerTest, RegularContractNotExistsReturnsNullopt)
{
    ProtocolContracts protocol_contracts; // Empty

    ContractInstanceManager manager(contract_db, merkle_db, update_check, field_gt, protocol_contracts, event_emitter);

    AztecAddress non_existent_address = AztecAddress(FF(0xDEADBEEFULL));

    // Setup mocks
    TreeStates tree_states = {};
    EXPECT_CALL(merkle_db, get_tree_state()).WillOnce(Return(tree_states));
    EXPECT_CALL(contract_db, get_contract_instance(non_existent_address)).WillOnce(Return(std::nullopt));

    // Not in protocol range
    EXPECT_CALL(field_gt, ff_gt(FF(MAX_PROTOCOL_CONTRACTS), non_existent_address - 1)).WillOnce(Return(false));

    // Nullifier doesn't exist - contract not deployed
    EXPECT_CALL(merkle_db, nullifier_exists(FF(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS), non_existent_address))
        .WillOnce(Return(false));

    // The call should return nullopt
    auto result = manager.get_contract_instance(non_existent_address);

    EXPECT_FALSE(result.has_value());

    // Verify the event
    auto events = event_emitter.dump_events();
    ASSERT_THAT(events, SizeIs(1));
    EXPECT_EQ(events[0].address, non_existent_address);
    EXPECT_FALSE(events[0].exists);
    EXPECT_FALSE(events[0].is_protocol_contract);
}

} // namespace
} // namespace bb::avm2::simulation
