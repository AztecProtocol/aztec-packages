#include "barretenberg/vm2/simulation/gadgets/bytecode_manager.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>
#include <memory>
#include <optional>
#include <vector>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/common/stringify.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/bytecode_hashing.hpp"
#include "barretenberg/vm2/simulation/gadgets/contract_instance_manager.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation/testing/mock_class_id_derivation.hpp"
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
    StrictMock<MockClassIdDerivation> class_id_derivation;
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
    FF bytecode_commitment = FF::random_element();

    // Expected interactions for first retrieval

    EXPECT_CALL(retrieved_bytecodes_tree_check, get_snapshot()).Times(2);
    EXPECT_CALL(contract_instance_manager, get_contract_instance(address1))
        .WillOnce(Return(std::make_optional(instance1)));

    EXPECT_CALL(retrieved_bytecodes_tree_check, contains(instance1.current_contract_class_id)).WillOnce(Return(false));
    EXPECT_CALL(retrieved_bytecodes_tree_check, size()).WillOnce(Return(0));
    EXPECT_CALL(retrieved_bytecodes_tree_check, insert(instance1.current_contract_class_id));

    EXPECT_CALL(contract_db, get_contract_class(instance1.current_contract_class_id))
        .WillOnce(Return(std::make_optional(klass)));
    EXPECT_CALL(contract_db, get_bytecode_commitment(instance1.current_contract_class_id))
        .WillRepeatedly(Return(std::make_optional(bytecode_commitment)));

    // Let the real bytecode hasher run - it will emit hashing events
    EXPECT_CALL(poseidon2, hash(_)).WillOnce(Return(bytecode_commitment));

    TreeStates tree_states = {};
    EXPECT_CALL(merkle_db, get_tree_state()).WillOnce(Return(tree_states));

    // Base case: First retrieval - should do full processing
    BytecodeId result1 = tx_bytecode_manager.get_bytecode(address1);
    EXPECT_EQ(result1, bytecode_commitment);

    // Verify events after first retrieval
    // Verify retrieval events - should have exactly one retrieval event total
    auto retrieval_events_dump = retrieval_events.dump_events();
    EXPECT_THAT(retrieval_events_dump, SizeIs(1));
    EXPECT_EQ(retrieval_events_dump[0].address, address1);
    EXPECT_EQ(retrieval_events_dump[0].bytecode_id, bytecode_commitment);
    EXPECT_TRUE(retrieval_events_dump[0].is_new_class);
    EXPECT_FALSE(retrieval_events_dump[0].error.has_value());
    // Verify hashing events - should have exactly one hashing event total
    auto hashing_events_dump = hashing_events.dump_events();
    EXPECT_THAT(hashing_events_dump, SizeIs(1));
    EXPECT_EQ(hashing_events_dump[0].bytecode_id, bytecode_commitment);
    // Verify decomposition events - should have exactly one decomposition event total
    auto decomposition_events_dump = decomposition_events.dump_events();
    EXPECT_THAT(decomposition_events_dump, SizeIs(1));
    EXPECT_EQ(decomposition_events_dump[0].bytecode_id, bytecode_commitment);

    // Deduplication case 1: Same address retrieval
    // Expected interactions for second retrieval of same address
    EXPECT_CALL(retrieved_bytecodes_tree_check, get_snapshot()).Times(2);
    EXPECT_CALL(contract_instance_manager, get_contract_instance(address1))
        .WillOnce(Return(std::make_optional(instance1)));
    EXPECT_CALL(retrieved_bytecodes_tree_check, contains(instance1.current_contract_class_id)).WillOnce(Return(true));
    EXPECT_CALL(retrieved_bytecodes_tree_check, size()).WillOnce(Return(1));
    EXPECT_CALL(retrieved_bytecodes_tree_check, insert(instance1.current_contract_class_id));

    EXPECT_CALL(contract_db, get_contract_class(instance1.current_contract_class_id))
        .WillOnce(Return(std::make_optional(klass)));
    // get_bytecode_commitment is called even for deduplicated retrievals
    // (already set up with WillRepeatedly above)
    // No hashing should occur for duplicate retrieval
    EXPECT_CALL(merkle_db, get_tree_state()).WillOnce(Return(tree_states));

    // Second retrieval of same address - should be deduplicated
    BytecodeId result2 = tx_bytecode_manager.get_bytecode(address1);
    EXPECT_EQ(result2, bytecode_commitment);

    // Verify events after second retrieval - retrieval event emitted, but no hashing or decomposition
    retrieval_events_dump = retrieval_events.dump_events();
    EXPECT_THAT(retrieval_events_dump, SizeIs(1));
    EXPECT_EQ(retrieval_events_dump[0].address, address1);
    EXPECT_EQ(retrieval_events_dump[0].bytecode_id, bytecode_commitment);
    EXPECT_FALSE(retrieval_events_dump[0].is_new_class);
    hashing_events_dump = hashing_events.dump_events();
    EXPECT_THAT(hashing_events_dump, SizeIs(0)); // No hashing for deduplicated bytecode
    decomposition_events_dump = decomposition_events.dump_events();
    EXPECT_THAT(decomposition_events_dump, SizeIs(0)); // No decomposition for deduplicated retrieval

    // Deduplication case 2: Different address with same bytecode
    AztecAddress address2 = address1 + 1; // force a different address
    ContractInstance instance2 = testing::random_contract_instance();
    instance2.current_contract_class_id = instance1.current_contract_class_id + 1; // force a different class id

    // Expected interactions for different address with same bytecode
    EXPECT_CALL(retrieved_bytecodes_tree_check, get_snapshot()).Times(2);
    EXPECT_CALL(contract_instance_manager, get_contract_instance(address2))
        .WillOnce(Return(std::make_optional(instance2)));
    EXPECT_CALL(retrieved_bytecodes_tree_check, contains(instance2.current_contract_class_id)).WillOnce(Return(true));
    EXPECT_CALL(retrieved_bytecodes_tree_check, size()).WillOnce(Return(1));
    EXPECT_CALL(retrieved_bytecodes_tree_check, insert(instance2.current_contract_class_id));

    EXPECT_CALL(contract_db, get_contract_class(instance2.current_contract_class_id))
        .WillOnce(Return(std::make_optional(klass))); // Same class/bytecode
    EXPECT_CALL(contract_db, get_bytecode_commitment(instance2.current_contract_class_id))
        .WillOnce(Return(std::make_optional(bytecode_commitment)));
    // No hashing should occur since we've already processed this bytecode
    EXPECT_CALL(merkle_db, get_tree_state()).WillOnce(Return(tree_states));

    // Third retrieval with different address but same bytecode - should be deduplicated
    BytecodeId result3 = tx_bytecode_manager.get_bytecode(address2);
    EXPECT_EQ(result3, bytecode_commitment);

    // Verify events after third retrieval - retrieval event emitted, but no hashing or decomposition
    retrieval_events_dump = retrieval_events.dump_events();
    EXPECT_THAT(retrieval_events_dump, SizeIs(1));
    EXPECT_EQ(retrieval_events_dump[0].address, address2);
    EXPECT_EQ(retrieval_events_dump[0].bytecode_id, bytecode_commitment);
    EXPECT_FALSE(retrieval_events_dump[0].is_new_class);
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

    EXPECT_CALL(retrieved_bytecodes_tree_check, contains(instance1.current_contract_class_id)).WillOnce(Return(false));
    EXPECT_CALL(retrieved_bytecodes_tree_check, size()).WillOnce(Return(MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS));

    // Base case: First retrieval - should do full processing
    EXPECT_THROW_WITH_MESSAGE(tx_bytecode_manager.get_bytecode(address1),
                              "Can't retrieve more than " +
                                  std::to_string(MAX_PUBLIC_CALLS_TO_UNIQUE_CONTRACT_CLASS_IDS) + " bytecodes per tx");

    auto retrieval_events_dump = retrieval_events.dump_events();
    EXPECT_THAT(retrieval_events_dump, SizeIs(1));
    EXPECT_EQ(retrieval_events_dump[0].address, address1);
    EXPECT_EQ(retrieval_events_dump[0].bytecode_id, 0);
    EXPECT_EQ(retrieval_events_dump[0].error, BytecodeRetrievalEventError::TOO_MANY_BYTECODES);
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
    EXPECT_EQ(retrieval_events_dump[0].error, BytecodeRetrievalEventError::INSTANCE_NOT_FOUND);

    auto contract_retrieval_events_dump = contract_retrieval_events.dump_events();
    EXPECT_THAT(contract_retrieval_events_dump, SizeIs(1));
    EXPECT_EQ(contract_retrieval_events_dump[0].address, address);
    EXPECT_FALSE(contract_retrieval_events_dump[0].exists);
    EXPECT_FALSE(contract_retrieval_events_dump[0].is_protocol_contract);
    EXPECT_EQ(contract_retrieval_events_dump[0].deployment_nullifier, address);
    EXPECT_EQ(contract_retrieval_events_dump[0].contract_instance, ContractInstance{});
}

TEST_F(BytecodeManagerTest, InstructionFetching)
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

    // Taken from /constraining/relations/instr_fetching.test.cpp:
    Instruction add_8_instruction = {
        .opcode = WireOpCode::ADD_8,
        .addressing_mode = 3,
        .operands = { Operand::from<uint8_t>(0x34), Operand::from<uint8_t>(0x35), Operand::from<uint8_t>(0x36) },
    };

    std::vector<uint8_t> bytecode = add_8_instruction.serialize();
    FF bytecode_commitment = FF::random_element();
    PC pc = 0;

    EXPECT_CALL(range_check, assert_range(bytecode.size() - pc - 1, AVM_PC_SIZE_IN_BITS));

    // Base case - simple successful fetching.
    Instruction result = tx_bytecode_manager.read_instruction(
        bytecode_commitment, std::make_shared<std::vector<uint8_t>>((bytecode)), pc);

    // Verify the decoded instruction.
    EXPECT_EQ(result.opcode, WireOpCode::ADD_8);
    EXPECT_EQ(result.addressing_mode, add_8_instruction.addressing_mode);
    ASSERT_THAT(result.operands, SizeIs(3));
    EXPECT_EQ(result.operands[0], add_8_instruction.operands[0]);
    EXPECT_EQ(result.operands[1], add_8_instruction.operands[1]);
    EXPECT_EQ(result.operands[2], add_8_instruction.operands[2]);

    // Verify one InstructionFetchingEvent was emitted with no error.
    auto fetching_events_dump = instruction_fetching_events.dump_events();
    ASSERT_THAT(fetching_events_dump, SizeIs(1));
    EXPECT_EQ(fetching_events_dump[0].bytecode_id, bytecode_commitment);
    EXPECT_EQ(fetching_events_dump[0].pc, pc);
    EXPECT_FALSE(fetching_events_dump[0].error.has_value());

    // Error cases - PC_OUT_OF_RANGE (set pc to be above the bytecode size).
    pc = static_cast<PC>(bytecode.size() + 2);
    // The absolute diff between bytecode size and pc is now 2:
    EXPECT_CALL(range_check, assert_range(2, AVM_PC_SIZE_IN_BITS));
    EXPECT_THROW_WITH_MESSAGE(tx_bytecode_manager.read_instruction(
                                  bytecode_commitment, std::make_shared<std::vector<uint8_t>>((bytecode)), pc),
                              "Instruction fetching error: .*");

    // Error cases - OPCODE_OUT_OF_RANGE (set the opcode byte to be above LAST_OPCODE_SENTINEL).
    pc = 0;
    bytecode[0] = static_cast<uint8_t>(WireOpCode::LAST_OPCODE_SENTINEL) + 2;
    EXPECT_CALL(range_check, assert_range(bytecode.size() - pc - 1, AVM_PC_SIZE_IN_BITS));
    EXPECT_THROW_WITH_MESSAGE(tx_bytecode_manager.read_instruction(
                                  bytecode_commitment, std::make_shared<std::vector<uint8_t>>((bytecode)), pc),
                              "Instruction fetching error: .*");

    // Error cases - INSTRUCTION_OUT_OF_RANGE (set pc such that pc + instruction_size > bytecode_size, but pc <
    // bytecode_size to avoid triggering PC_OUT_OF_RANGE).
    bytecode[0] = static_cast<uint8_t>(add_8_instruction.opcode);
    pc = static_cast<PC>(bytecode.size() - add_8_instruction.size_in_bytes() + 1);
    EXPECT_CALL(range_check, assert_range(bytecode.size() - pc - 1, AVM_PC_SIZE_IN_BITS));
    EXPECT_THROW_WITH_MESSAGE(tx_bytecode_manager.read_instruction(
                                  bytecode_commitment, std::make_shared<std::vector<uint8_t>>((bytecode)), pc),
                              "Instruction fetching error: .*");

    // Error cases - TAG_OUT_OF_RANGE (set the tag operand to be above the maximum value).

    // Taken from /constraining/relations/instr_fetching.test.cpp (SET_16 has a tag operand at op2 = index 1):
    Instruction set_16_instruction = {
        .opcode = WireOpCode::SET_16,
        .addressing_mode = 0,
        .operands = { Operand::from<uint16_t>(0x1234),
                      Operand::from<uint8_t>(static_cast<uint8_t>(MemoryTag::MAX) + 1),
                      Operand::from<uint16_t>(0x5678) },
    };

    pc = 0;
    bytecode = set_16_instruction.serialize();
    EXPECT_CALL(range_check, assert_range(bytecode.size() - pc - 1, AVM_PC_SIZE_IN_BITS));
    EXPECT_THROW_WITH_MESSAGE(tx_bytecode_manager.read_instruction(
                                  bytecode_commitment, std::make_shared<std::vector<uint8_t>>((bytecode)), pc),
                              "Instruction fetching error.*");

    fetching_events_dump = instruction_fetching_events.dump_events();
    ASSERT_THAT(fetching_events_dump, SizeIs(4));

    EXPECT_EQ(fetching_events_dump[0].error.value(), InstrDeserializationEventError::PC_OUT_OF_RANGE);
    EXPECT_EQ(fetching_events_dump[1].error.value(), InstrDeserializationEventError::OPCODE_OUT_OF_RANGE);
    EXPECT_EQ(fetching_events_dump[2].error.value(), InstrDeserializationEventError::INSTRUCTION_OUT_OF_RANGE);
    EXPECT_EQ(fetching_events_dump[3].error.value(), InstrDeserializationEventError::TAG_OUT_OF_RANGE);
}

} // namespace
} // namespace bb::avm2::simulation
