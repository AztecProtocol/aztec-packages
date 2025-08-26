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
#include "barretenberg/vm2/simulation/testing/mock_contract_instance_manager.hpp"
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

// Serialization tests
namespace {

Instruction deserialize_instruction_no_events(std::span<const uint8_t> bytecode, size_t pos)
{
    NoopEventEmitter<RangeCheckEvent> range_check_event_emitter;
    RangeCheck range_check(range_check_event_emitter);
    NoopEventEmitter<FieldGreaterThanEvent> field_gt_event_emitter;
    FieldGreaterThan field_gt(range_check, field_gt_event_emitter);
    NoopEventEmitter<GreaterThanEvent> gt_event_emitter;
    GreaterThan gt(field_gt, range_check, gt_event_emitter);

    StrictMock<MockContractDB> contract_db;
    StrictMock<MockHighLevelMerkleDB> merkle_db;
    StrictMock<MockPoseidon2> poseidon2;
    StrictMock<MockContractInstanceManager> contract_instance_manager;

    NoopEventEmitter<BytecodeRetrievalEvent> retrieval_events;
    NoopEventEmitter<BytecodeDecompositionEvent> decomposition_events;
    NoopEventEmitter<InstructionFetchingEvent> instruction_fetching_events;
    NoopEventEmitter<BytecodeHashingEvent> hashing_events;
    BytecodeHasher bytecode_hasher(poseidon2, hashing_events);

    TxBytecodeManager tx_bytecode_manager(contract_db,
                                          merkle_db,
                                          bytecode_hasher,
                                          gt,
                                          contract_instance_manager,
                                          retrieval_events,
                                          decomposition_events,
                                          instruction_fetching_events);

    return tx_bytecode_manager.deserialize_instruction(bytecode, pos);
}

// Testing serialization with some u8 variants
TEST(SerializationTest, Not8RoundTrip)
{
    const Instruction instr = { .opcode = WireOpCode::NOT_8,
                                .indirect = 5,
                                .operands = { Operand::from<uint8_t>(123), Operand::from<uint8_t>(45) } };
    const auto decoded = deserialize_instruction_no_events(instr.serialize(), 0);
    EXPECT_EQ(instr, decoded);
}

// Testing serialization with some u16 variants
TEST(SerializationTest, Add16RoundTrip)
{
    const Instruction instr = {
        .opcode = WireOpCode::ADD_16,
        .indirect = 3,
        .operands = { Operand::from<uint16_t>(1000), Operand::from<uint16_t>(1001), Operand::from<uint16_t>(1002) }
    };
    const auto decoded = deserialize_instruction_no_events(instr.serialize(), 0);
    EXPECT_EQ(instr, decoded);
}

// Testing serialization with a u32 variant
TEST(SerializationTest, Jumpi32RoundTrip)
{
    const Instruction instr = { .opcode = WireOpCode::JUMPI_32,
                                .indirect = 7,
                                .operands = { Operand::from<uint16_t>(12345), Operand::from<uint32_t>(678901234) } };
    const auto decoded = deserialize_instruction_no_events(instr.serialize(), 0);
    EXPECT_EQ(instr, decoded);
}

// Testing serialization with a u64 variant
TEST(SerializationTest, Set64RoundTrip)
{
    const uint64_t value_64 = 0xABCDEF0123456789LLU;

    const Instruction instr = { .opcode = WireOpCode::SET_64,
                                .indirect = 2,
                                .operands = { Operand::from<uint16_t>(1002),
                                              Operand::from<uint8_t>(static_cast<uint8_t>(MemoryTag::U64)),
                                              Operand::from<uint64_t>(value_64) } };
    const auto decoded = deserialize_instruction_no_events(instr.serialize(), 0);
    EXPECT_EQ(instr, decoded);
}

// Testing serialization with a u128 variant
TEST(SerializationTest, Set128RoundTrip)
{
    const uint128_t value_128 = (uint128_t{ 0x123456789ABCDEF0LLU } << 64) + uint128_t{ 0xABCDEF0123456789LLU };

    const Instruction instr = { .opcode = WireOpCode::SET_128,
                                .indirect = 2,
                                .operands = { Operand::from<uint16_t>(1002),
                                              Operand::from<uint8_t>(static_cast<uint8_t>(MemoryTag::U128)),
                                              Operand::from<uint128_t>(value_128) } };
    const auto decoded = deserialize_instruction_no_events(instr.serialize(), 0);
    EXPECT_EQ(instr, decoded);
}

// Testing serialization with ff variant
TEST(SerializationTest, SetFFRoundTrip)
{
    const FF large_ff = FF::modulus - 981723;

    const Instruction instr = { .opcode = WireOpCode::SET_FF,
                                .indirect = 2,
                                .operands = { Operand::from<uint16_t>(1002),
                                              Operand::from<uint8_t>(static_cast<uint8_t>(MemoryTag::FF)),
                                              Operand::from<FF>(large_ff) } };
    const auto decoded = deserialize_instruction_no_events(instr.serialize(), 0);
    EXPECT_EQ(instr, decoded);
}

// Testing serialization with ff variant which is larger than the modulus.
// Round trip would not work as multiple equivalent values over 256 bits map
// to the same FF value.
TEST(SerializationTest, DeserializeLargeFF)
{
    const uint256_t value_256 = FF::modulus + 145;

    // We first serialize a "dummy" instruction and then substitute the immediate value encoded as the last 32 bytes.
    const Instruction instr = { .opcode = WireOpCode::SET_FF,
                                .indirect = 0,
                                .operands = { Operand::from<uint16_t>(1002),
                                              Operand::from<uint8_t>(static_cast<uint8_t>(MemoryTag::U8)),
                                              Operand::from<FF>(FF::modulus - 1) } };
    auto serialized_instruction = instr.serialize();

    const auto buf = to_buffer(value_256);
    serialized_instruction.insert(serialized_instruction.end() - 32, buf.begin(), buf.end());

    const auto decoded = deserialize_instruction_no_events(serialized_instruction, 0);
    ASSERT_EQ(3, decoded.operands.size());
    EXPECT_EQ(decoded.operands[2].as<FF>(), 145);
}

// Testing deserialization pc out of range error
TEST(SerializationTest, PCOutOfRange)
{
    std::vector<uint8_t> bytecode;
    bytecode.resize(35, 0);

    try {
        deserialize_instruction_no_events(bytecode, bytecode.size() + 1);
    } catch (const InstrDeserializationError& error) {
        EXPECT_EQ(error, InstrDeserializationError::PC_OUT_OF_RANGE);
    }
}

// Testing deserialization wire opcode out of range error
TEST(SerializationTest, OpcodeOutOfRange)
{
    std::vector<uint8_t> bytecode;
    bytecode.push_back(static_cast<uint8_t>(WireOpCode::LAST_OPCODE_SENTINEL) + 1); // Invalid opcode

    try {
        deserialize_instruction_no_events(bytecode, 0);
    } catch (const InstrDeserializationError& error) {
        EXPECT_EQ(error, InstrDeserializationError::OPCODE_OUT_OF_RANGE);
    }
}

// Testing deserialization instruction out of range error
TEST(SerializationTest, InstructionOutOfRange)
{
    // Create a valid SET_16 instruction
    Instruction instr = { .opcode = WireOpCode::SET_16,
                          .indirect = 2,
                          .operands = { Operand::from<uint16_t>(1002),
                                        Operand::from<uint8_t>(static_cast<uint8_t>(MemoryTag::U16)),
                                        Operand::from<uint16_t>(12345) } };

    auto bytecode = instr.serialize();

    // Truncate the bytecode
    bytecode.resize(bytecode.size() - 1);

    try {
        deserialize_instruction_no_events(bytecode, 0);
    } catch (const InstrDeserializationError& error) {
        EXPECT_EQ(error, InstrDeserializationError::INSTRUCTION_OUT_OF_RANGE);
    }
}

} // namespace
} // namespace bb::avm2::simulation
