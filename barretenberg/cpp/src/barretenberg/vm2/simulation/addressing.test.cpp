#include "barretenberg/vm2/simulation/addressing.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_range_check.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"

namespace bb::avm2::simulation {
namespace {

using ::bb::avm2::testing::InstructionBuilder;
using enum ::bb::avm2::WireOpCode;
using ::testing::ElementsAre;
using ::testing::ReturnRef;
using ::testing::StrictMock;

template <typename T> auto from = ::bb::avm2::simulation::Operand::from<T>;

TEST(AvmSimulationAddressingTest, AllDirectAndNonRelative)
{
    InstructionInfoDB instruction_info_db;
    NoopEventEmitter<AddressingEvent> event_emitter;

    // No calls to range checks.
    StrictMock<MockRangeCheck> range_check;

    Addressing addressing(instruction_info_db, range_check, event_emitter);

    {
        const auto instr = InstructionBuilder(SET_8)
                               // dstOffset
                               .operand<uint8_t>(1)
                               // tag
                               .operand(MemoryTag::FF)
                               // value
                               .operand<uint8_t>(1)
                               .build();

        // No calls to get the base address.
        StrictMock<MockMemory> memory;

        const auto operands = addressing.resolve(instr, memory);
        EXPECT_THAT(operands,
                    ElementsAre(
                        // dstOffset has been resolved and is now a MemoryAddress.
                        from<MemoryAddress>(1),
                        // tag is unchanged.
                        instr.operands.at(1),
                        // value is unchanged.
                        instr.operands.at(2)));
    }
    {
        const auto instr = InstructionBuilder(ADD_16)
                               // aOffset
                               .operand<uint16_t>(1)
                               // bOffset
                               .operand<uint16_t>(2)
                               // dstOffset
                               .operand<uint16_t>(3)
                               .build();

        // No calls to get the base address.
        StrictMock<MockMemory> memory;

        const auto operands = addressing.resolve(instr, memory);
        EXPECT_THAT(operands, ElementsAre(from<MemoryAddress>(1), from<MemoryAddress>(2), from<MemoryAddress>(3)));
    }
}

TEST(AvmSimulationAddressingTest, RelativeAddressing)
{
    InstructionInfoDB instruction_info_db;
    NoopEventEmitter<AddressingEvent> event_emitter;
    StrictMock<MockRangeCheck> range_check;
    Addressing addressing(instruction_info_db, range_check, event_emitter);

    // For relative addressing, we need a base address other than 0
    // Base pointer at address 100
    MemoryValue base_addr = MemoryValue::from<uint32_t>(100);

    // Set up the ADD_8 instruction with relative addressing
    const auto instr = InstructionBuilder(ADD_8)
                           // aOffset
                           .operand<uint8_t>(10)
                           .relative()
                           // bOffset
                           .operand<uint8_t>(20)
                           // dstOffset
                           .operand<uint8_t>(30)
                           .relative()
                           .build();

    StrictMock<MockMemory> memory;
    EXPECT_CALL(memory, get(0)).WillOnce(ReturnRef(base_addr));
    // Range check calls. This leaks information from the circuit.
    EXPECT_CALL(range_check, assert_range((1ULL << 32) - 110 - 1, /*num_bits=*/32));
    EXPECT_CALL(range_check, assert_range((1ULL << 32) - 130 - 1, /*num_bits=*/32));

    const auto operands = addressing.resolve(instr, memory);

    EXPECT_THAT(operands,
                ElementsAre(
                    // aOffset resolved as base + 10 = 110
                    from<MemoryAddress>(110),
                    // bOffset stays the same
                    from<MemoryAddress>(20),
                    // dstOffset resolved as base + 30 = 130
                    from<MemoryAddress>(130)));
}

TEST(AvmSimulationAddressingTest, IndirectAddressing)
{
    InstructionInfoDB instruction_info_db;
    NoopEventEmitter<AddressingEvent> event_emitter;
    // No calls to range checks.
    StrictMock<MockRangeCheck> range_check;
    Addressing addressing(instruction_info_db, range_check, event_emitter);

    // Set up the ADD_8 instruction with indirect addressing
    const auto instr = InstructionBuilder(ADD_8)
                           // aOffset - address 5 contains the actual address
                           .operand<uint8_t>(5)
                           .indirect()
                           // bOffset
                           .operand<uint8_t>(10)
                           // dstOffset - address 15 contains the actual address
                           .operand<uint8_t>(15)
                           .indirect()
                           .build();

    StrictMock<MockMemory> memory;
    MemoryValue addr_5_value = MemoryValue::from<uint32_t>(50);
    EXPECT_CALL(memory, get(5)).WillOnce(ReturnRef(addr_5_value));
    MemoryValue addr_15_value = MemoryValue::from<uint32_t>(60);
    EXPECT_CALL(memory, get(15)).WillOnce(ReturnRef(addr_15_value));

    const auto operands = addressing.resolve(instr, memory);

    // Expect indirect offsets to be resolved by looking up their values in memory
    EXPECT_THAT(operands,
                ElementsAre(
                    // aOffset resolved indirectly: memory[5] = 50
                    from<MemoryAddress>(50),
                    // bOffset stays the same
                    from<MemoryAddress>(10),
                    // dstOffset resolved indirectly: memory[15] = 60
                    from<MemoryAddress>(60)));
}

TEST(AvmSimulationAddressingTest, IndirectAndRelativeAddressing)
{
    InstructionInfoDB instruction_info_db;
    NoopEventEmitter<AddressingEvent> event_emitter;
    StrictMock<MockRangeCheck> range_check;
    Addressing addressing(instruction_info_db, range_check, event_emitter);

    // Base address is 100
    MemoryValue base_addr = MemoryValue::from<uint32_t>(100);

    // Set up the ADD_8 instruction with both indirect and relative addressing
    const auto instr = InstructionBuilder(ADD_8)
                           // aOffset (indirect and relative): address base+5 contains value
                           .operand<uint8_t>(5)
                           .indirect()
                           .relative()
                           // bOffset (indirect only): address 10 contains value
                           .operand<uint8_t>(10)
                           .indirect()
                           // dstOffset (relative only)
                           .operand<uint8_t>(15)
                           .relative()
                           .build();

    StrictMock<MockMemory> memory;
    EXPECT_CALL(memory, get(0)).WillOnce(ReturnRef(base_addr)); // Base address (100)
    // Address 105 (base+5) contains value 200
    MemoryValue addr_105_value = MemoryValue::from<uint32_t>(200);
    EXPECT_CALL(memory, get(105)).WillOnce(ReturnRef(addr_105_value));
    // Address 10 contains value 60
    MemoryValue addr_10_value = MemoryValue::from<uint32_t>(60);
    EXPECT_CALL(memory, get(10)).WillOnce(ReturnRef(addr_10_value));
    // Range check calls. This leaks information from the circuit.
    EXPECT_CALL(range_check, assert_range((1ULL << 32) - 105 - 1, /*num_bits=*/32));
    EXPECT_CALL(range_check, assert_range((1ULL << 32) - 115 - 1, /*num_bits=*/32));

    const auto operands = addressing.resolve(instr, memory);

    // Expect combined indirect and relative addressing
    EXPECT_THAT(operands,
                ElementsAre(
                    // aOffset: relative (base+5=105) and indirect (memory[105]=200)
                    from<MemoryAddress>(200),
                    // bOffset: indirect only (memory[10]=60)
                    from<MemoryAddress>(60),
                    // dstOffset: relative only (base+15=115)
                    from<MemoryAddress>(115)));
}

} // namespace
} // namespace bb::avm2::simulation
