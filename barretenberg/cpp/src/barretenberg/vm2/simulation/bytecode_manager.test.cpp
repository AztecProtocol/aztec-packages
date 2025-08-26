#include "barretenberg/vm2/simulation/bytecode_manager.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>
#include <memory>
#include <optional>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/bytecode_hashing.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/testing/mock_dbs.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_poseidon2.hpp"
#include "barretenberg/vm2/testing/fixtures.hpp"

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
    StrictMock<MockGreaterThan> gt;
    StrictMock<MockContractInstanceManager> contract_instance_manager;

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
                                          gt,
                                          contract_instance_manager,
                                          retrieval_events,
                                          decomposition_events,
                                          instruction_fetching_events);

    // Setup for base case
    AztecAddress address1 = AztecAddress::random_element();
    ContractInstance instance1 = testing::random_contract_instance();
    ContractClass klass = testing::random_contract_class();

    // Expected interactions for first retrieval
    EXPECT_CALL(contract_instance_manager, get_contract_instance(address1))
        .WillOnce(Return(std::make_optional(instance1)));

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
    EXPECT_FALSE(retrieval_events_dump[0].error);
    // Verify hashing events - should have exactly one hashing event total
    // TODO(dbanks12): re-enable once C++ and PIL use standard poseidon2 hashing for bytecode commitments.
    // auto hashing_events_dump = hashing_events.dump_events();
    // EXPECT_THAT(hashing_events_dump, SizeIs(1));
    // EXPECT_EQ(hashing_events_dump[0].bytecode_id, klass.public_bytecode_commitment);
    // Verify decomposition events - should have exactly one decomposition event total
    auto decomposition_events_dump = decomposition_events.dump_events();
    EXPECT_THAT(decomposition_events_dump, SizeIs(1));
    EXPECT_EQ(decomposition_events_dump[0].bytecode_id, klass.public_bytecode_commitment);

    // Deduplication case 1: Same address retrieval
    // Expected interactions for second retrieval of same address
    EXPECT_CALL(contract_instance_manager, get_contract_instance(address1))
        .WillOnce(Return(std::make_optional(instance1)));
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
    auto hashing_events_dump = hashing_events.dump_events();
    EXPECT_THAT(hashing_events_dump, SizeIs(0)); // No hashing for deduplicated bytecode
    decomposition_events_dump = decomposition_events.dump_events();
    EXPECT_THAT(decomposition_events_dump, SizeIs(0)); // No decomposition for deduplicated retrieval

    // Deduplication case 2: Different address with same bytecode
    AztecAddress address2 = address1 + 1; // force a different address
    ContractInstance instance2 = testing::random_contract_instance();
    instance2.current_class_id = instance1.current_class_id + 1; // force a different class id

    // Expected interactions for different address with same bytecode
    EXPECT_CALL(contract_instance_manager, get_contract_instance(address2))
        .WillOnce(Return(std::make_optional(instance2)));
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

} // namespace
} // namespace bb::avm2::simulation
