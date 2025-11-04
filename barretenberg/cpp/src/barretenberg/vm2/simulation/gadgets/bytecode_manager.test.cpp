#include "barretenberg/vm2/simulation/gadgets/bytecode_manager.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>
#include <memory>
#include <optional>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/stringify.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/bytecode_hashing.hpp"
#include "barretenberg/vm2/simulation/gadgets/contract_instance_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_dbs.hpp"
#include "barretenberg/vm2/simulation/testing/mock_field_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_poseidon2.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_retrieved_bytecodes_tree_check.hpp"
#include "barretenberg/vm2/simulation/testing/mock_update_check.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"
#include "barretenberg/vm2/testing/macros.hpp"

using ::testing::_;
using ::testing::Return;
using ::testing::SizeIs;
using ::testing::StrictMock;

namespace bb::avm2::simulation {

namespace {

// Simple mock for ContractInstanceManagerInterface
class MockContractInstanceManager : public ContractInstanceManagerInterface {
  public:
    MOCK_METHOD(std::optional<ContractInstance>, get_contract_instance, (const FF& contract_address), (override));
};

class BytecodeManagerTest : public ::testing::Test {
  protected:
    BytecodeManagerTest()
        : bytecode_hasher(poseidon2, hashing_events)
    {}

    StrictMock<MockContractDB> contract_db;
    StrictMock<MockHighLevelMerkleDB> merkle_db;
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockRangeCheck> range_check;
    StrictMock<MockContractInstanceManager> contract_instance_manager;
    StrictMock<MockRetrievedBytecodesTreeCheck> retrieved_bytecodes_tree_check;

    EventEmitter<BytecodeRetrievalEvent> retrieval_events;
    EventEmitter<BytecodeDecompositionEvent> decomposition_events;
    EventEmitter<InstructionFetchingEvent> instruction_fetching_events;
    EventEmitter<BytecodeHashingEvent> hashing_events;
    BytecodeHasher bytecode_hasher;
};

TEST_F(BytecodeManagerTest, RetrievalAndDeduplication)
{
    TxBytecodeManager tx_bytecode_manager(contract_db,
                                          merkle_db,
                                          bytecode_hasher,
                                          range_check,
                                          contract_instance_manager,
                                          retrieved_bytecodes_tree_check,
                                          retrieval_events,
                                          decomposition_events,
                                          instruction_fetching_events);

    // Setup for base case
    AztecAddress address1 = AztecAddress::random_element();
    ContractInstance instance1 = testing::random_contract_instance();
    ContractClass klass = testing::random_contract_class();

    // Expected interactions for first retrieval

    EXPECT_CALL(retrieved_bytecodes_tree_check, get_snapshot()).Times(2);
    EXPECT_CALL(contract_instance_manager, get_contract_instance(address1))
        .WillOnce(Return(std::make_optional(instance1)));

    EXPECT_CALL(retrieved_bytecodes_tree_check, contains(instance1.current_class_id)).WillOnce(Return(false));
    EXPECT_CALL(retrieved_bytecodes_tree_check, size()).WillOnce(Return(0));
    EXPECT_CALL(retrieved_bytecodes_tree_check, insert(instance1.current_class_id));

    EXPECT_CALL(contract_db, get_contract_class(instance1.current_class_id))
        .WillOnce(Return(std::make_optional(klass)));

    // Let the real bytecode hasher run - it will emit hashing events
    EXPECT_CALL(poseidon2, hash(_)).WillOnce(Return(klass.public_bytecode_commitment));

    TreeStates tree_states = {};
    EXPECT_CALL(merkle_db, get_tree_state()).WillOnce(Return(tree_states));

    // Base case: First retrieval - should do full processing
    BytecodeId result1 = tx_bytecode_manager.get_bytecode(address1);
    EXPECT_EQ(result1, klass.public_bytecode_commitment);

    // Verify events after first retrieval
    // Verify retrieval events - should have exactly one retrieval event total
    auto retrieval_events_dump = retrieval_events.dump_events();
    EXPECT_THAT(retrieval_events_dump, SizeIs(1));
    EXPECT_EQ(retrieval_events_dump[0].address, address1);
    EXPECT_EQ(retrieval_events_dump[0].bytecode_id, klass.public_bytecode_commitment);
    EXPECT_FALSE(retrieval_events_dump[0].instance_not_found_error);
    EXPECT_FALSE(retrieval_events_dump[0].limit_error);
    // Verify hashing events - should have exactly one hashing event total
    auto hashing_events_dump = hashing_events.dump_events();
    EXPECT_THAT(hashing_events_dump, SizeIs(1));
    EXPECT_EQ(hashing_events_dump[0].bytecode_id, klass.public_bytecode_commitment);
    // Verify decomposition events - should have exactly one decomposition event total
    auto decomposition_events_dump = decomposition_events.dump_events();
    EXPECT_THAT(decomposition_events_dump, SizeIs(1));
    EXPECT_EQ(decomposition_events_dump[0].bytecode_id, klass.public_bytecode_commitment);

    // Deduplication case 1: Same address retrieval
    // Expected interactions for second retrieval of same address
    EXPECT_CALL(retrieved_bytecodes_tree_check, get_snapshot()).Times(2);
    EXPECT_CALL(contract_instance_manager, get_contract_instance(address1))
        .WillOnce(Return(std::make_optional(instance1)));
    EXPECT_CALL(retrieved_bytecodes_tree_check, contains(instance1.current_class_id)).WillOnce(Return(true));
    EXPECT_CALL(retrieved_bytecodes_tree_check, size()).WillOnce(Return(1));
    EXPECT_CALL(retrieved_bytecodes_tree_check, insert(instance1.current_class_id));

    EXPECT_CALL(contract_db, get_contract_class(instance1.current_class_id))
        .WillOnce(Return(std::make_optional(klass)));
    // No hashing should occur for duplicate retrieval
    EXPECT_CALL(merkle_db, get_tree_state()).WillOnce(Return(tree_states));

    // Second retrieval of same address - should be deduplicated
    BytecodeId result2 = tx_bytecode_manager.get_bytecode(address1);
    EXPECT_EQ(result2, klass.public_bytecode_commitment);

    // Verify events after second retrieval - retrieval event emitted, but no hashing or decomposition
    retrieval_events_dump = retrieval_events.dump_events();
    EXPECT_THAT(retrieval_events_dump, SizeIs(1));
    EXPECT_EQ(retrieval_events_dump[0].address, address1);
    EXPECT_EQ(retrieval_events_dump[0].bytecode_id, klass.public_bytecode_commitment);
    hashing_events_dump = hashing_events.dump_events();
    EXPECT_THAT(hashing_events_dump, SizeIs(0)); // No hashing for deduplicated bytecode
    decomposition_events_dump = decomposition_events.dump_events();
    EXPECT_THAT(decomposition_events_dump, SizeIs(0)); // No decomposition for deduplicated retrieval

    // Deduplication case 2: Different address with same bytecode
    AztecAddress address2 = address1 + 1; // force a different address
    ContractInstance instance2 = testing::random_contract_instance();
    instance2.current_class_id = instance1.current_class_id + 1; // force a different class id

    // Expected interactions for different address with same bytecode
    EXPECT_CALL(retrieved_bytecodes_tree_check, get_snapshot()).Times(2);
    EXPECT_CALL(contract_instance_manager, get_contract_instance(address2))
        .WillOnce(Return(std::make_optional(instance2)));
    EXPECT_CALL(retrieved_bytecodes_tree_check, contains(instance2.current_class_id)).WillOnce(Return(true));
    EXPECT_CALL(retrieved_bytecodes_tree_check, size()).WillOnce(Return(1));
    EXPECT_CALL(retrieved_bytecodes_tree_check, insert(instance2.current_class_id));

    EXPECT_CALL(contract_db, get_contract_class(instance2.current_class_id))
        .WillOnce(Return(std::make_optional(klass))); // Same class/bytecode
    // No hashing should occur since we've already processed this bytecode
    EXPECT_CALL(merkle_db, get_tree_state()).WillOnce(Return(tree_states));

    // Third retrieval with different address but same bytecode - should be deduplicated
    BytecodeId result3 = tx_bytecode_manager.get_bytecode(address2);
    EXPECT_EQ(result3, klass.public_bytecode_commitment);

    // Verify events after third retrieval - retrieval event emitted, but no hashing or decomposition
    retrieval_events_dump = retrieval_events.dump_events();
    EXPECT_THAT(retrieval_events_dump, SizeIs(1));
    EXPECT_EQ(retrieval_events_dump[0].address, address2);
    EXPECT_EQ(retrieval_events_dump[0].bytecode_id, klass.public_bytecode_commitment);
    hashing_events_dump = hashing_events.dump_events();
    EXPECT_THAT(hashing_events_dump, SizeIs(0)); // No hashing for deduplicated bytecode
    decomposition_events_dump = decomposition_events.dump_events();
    EXPECT_THAT(decomposition_events_dump, SizeIs(0)); // No decomposition for deduplicated bytecode
}

TEST_F(BytecodeManagerTest, TooManyBytecodes)
{
    TxBytecodeManager tx_bytecode_manager(contract_db,
                                          merkle_db,
                                          bytecode_hasher,
                                          range_check,
                                          contract_instance_manager,
                                          retrieved_bytecodes_tree_check,
                                          retrieval_events,
                                          decomposition_events,
                                          instruction_fetching_events);

    AztecAddress address1 = AztecAddress::random_element();
    ContractInstance instance1 = testing::random_contract_instance();
    ContractClass klass = testing::random_contract_class();

    EXPECT_CALL(retrieved_bytecodes_tree_check, get_snapshot());
    EXPECT_CALL(merkle_db, get_tree_state());

    EXPECT_CALL(contract_instance_manager, get_contract_instance(address1))
        .WillOnce(Return(std::make_optional(instance1)));

    EXPECT_CALL(retrieved_bytecodes_tree_check, contains(instance1.current_class_id)).WillOnce(Return(false));
    EXPECT_CALL(retrieved_bytecodes_tree_check, size()).WillOnce(Return(MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS));

    // Base case: First retrieval - should do full processing
    EXPECT_THROW_WITH_MESSAGE(tx_bytecode_manager.get_bytecode(address1),
                              "Can't retrieve more than " +
                                  std::to_string(MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS) + " bytecodes per tx");

    auto retrieval_events_dump = retrieval_events.dump_events();
    EXPECT_THAT(retrieval_events_dump, SizeIs(1));
    EXPECT_EQ(retrieval_events_dump[0].address, address1);
    EXPECT_EQ(retrieval_events_dump[0].bytecode_id, 0);
    EXPECT_FALSE(retrieval_events_dump[0].instance_not_found_error);
    EXPECT_TRUE(retrieval_events_dump[0].limit_error);
}

// Test about a contract address nullifier not found error (contract address not in nullifier tree)
TEST_F(BytecodeManagerTest, ContractAddressNullifierNotFoundError)
{
    StrictMock<MockUpdateCheck> update_check;
    StrictMock<MockFieldGreaterThan> field_gt;
    ProtocolContracts protocol_contracts = {};
    EventEmitter<ContractInstanceRetrievalEvent> contract_retrieval_events;

    ContractInstanceManager real_contract_instance_manager(
        contract_db, merkle_db, update_check, field_gt, protocol_contracts, contract_retrieval_events);

    TxBytecodeManager tx_bytecode_manager(contract_db,
                                          merkle_db,
                                          bytecode_hasher,
                                          range_check,
                                          real_contract_instance_manager,
                                          retrieved_bytecodes_tree_check,
                                          retrieval_events,
                                          decomposition_events,
                                          instruction_fetching_events);

    AztecAddress address = AztecAddress::random_element();
    ContractInstance instance = testing::random_contract_instance();
    EXPECT_CALL(contract_db, get_contract_instance(address)).WillOnce(Return(instance));
    EXPECT_CALL(field_gt, ff_gt(FF(MAX_PROTOCOL_CONTRACTS), address - 1)).WillOnce(Return(false));
    EXPECT_CALL(retrieved_bytecodes_tree_check, get_snapshot());
    EXPECT_CALL(merkle_db, get_tree_state()).Times(2);
    EXPECT_CALL(merkle_db, nullifier_exists(FF(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS), address))
        .WillOnce(Return(false));

    EXPECT_THROW_WITH_MESSAGE(tx_bytecode_manager.get_bytecode(address),
                              "Contract " + field_to_string(address) + " is not deployed");

    auto retrieval_events_dump = retrieval_events.dump_events();
    EXPECT_THAT(retrieval_events_dump, SizeIs(1));
    EXPECT_EQ(retrieval_events_dump[0].address, address);
    EXPECT_EQ(retrieval_events_dump[0].bytecode_id, 0);
    EXPECT_TRUE(retrieval_events_dump[0].instance_not_found_error);
    EXPECT_FALSE(retrieval_events_dump[0].limit_error);

    auto contract_retrieval_events_dump = contract_retrieval_events.dump_events();
    EXPECT_THAT(contract_retrieval_events_dump, SizeIs(1));
    EXPECT_EQ(contract_retrieval_events_dump[0].address, address);
    EXPECT_FALSE(contract_retrieval_events_dump[0].exists);
    EXPECT_FALSE(contract_retrieval_events_dump[0].is_protocol_contract);
    EXPECT_EQ(contract_retrieval_events_dump[0].deployment_nullifier, address);
    EXPECT_EQ(contract_retrieval_events_dump[0].contract_instance, ContractInstance{});
}

} // namespace
} // namespace bb::avm2::simulation
