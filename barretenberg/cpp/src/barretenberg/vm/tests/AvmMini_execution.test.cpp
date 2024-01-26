#include "barretenberg/vm/avm_trace/AvmMini_execution.hpp"
#include "AvmMini_common.test.hpp"
#include "barretenberg/common/utils.hpp"
#include "barretenberg/vm/avm_trace/AvmMini_common.hpp"
#include "barretenberg/vm/avm_trace/AvmMini_helper.hpp"
#include "barretenberg/vm/avm_trace/AvmMini_opcode.hpp"
#include "barretenberg/vm/tests/helpers.test.hpp"
#include <cstdint>
#include <gtest/gtest.h>
#include <string>
#include <utility>

namespace tests_avm {
using namespace avm_trace;
using bb::utils::hex_to_bytes;

class AvmMiniExecutionTests : public ::testing::Test {
  public:
    AvmMiniTraceBuilder trace_builder;

  protected:
    // TODO(640): The Standard Honk on Grumpkin test suite fails unless the SRS is initialised for every test.
    void SetUp() override
    {
        srs::init_crs_factory("../srs_db/ignition");
        trace_builder = AvmMiniTraceBuilder(); // Clean instance for every run.
    };
};

// Basic positive test with an ADD and RETURN opcode.
// Parsing, trace generation and proving is verified.
TEST_F(AvmMiniExecutionTests, basicAddReturn)
{
    std::string bytecode_hex = "00"        // ADD
                               "01"        // U8
                               "00000007"  // addr a 7
                               "00000009"  // addr b 9
                               "00000001"  // addr c 1
                               "34"        // RETURN
                               "00000000"  // ret offset 0
                               "00000000"; // ret size 0

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto instructions = Execution::parse(bytecode);

    // 2 instructions
    EXPECT_EQ(instructions.size(), 2);

    // ADD
    EXPECT_EQ(instructions.at(0).op_code, OpCode::ADD);
    EXPECT_EQ(instructions.at(0).operands.size(), 3);
    EXPECT_EQ(instructions.at(0).operands.at(0), 7);
    EXPECT_EQ(instructions.at(0).operands.at(1), 9);
    EXPECT_EQ(instructions.at(0).operands.at(2), 1);
    EXPECT_EQ(instructions.at(0).in_tag, AvmMemoryTag::U8);

    // RETURN
    EXPECT_EQ(instructions.at(1).op_code, OpCode::RETURN);
    EXPECT_EQ(instructions.at(1).operands.size(), 2);
    EXPECT_EQ(instructions.at(1).operands.at(0), 0);
    EXPECT_EQ(instructions.at(1).operands.at(0), 0);

    auto trace = Execution::gen_trace(instructions, std::vector<FF>{});
    auto trace_verif = trace;
    validate_trace_proof(std::move(trace));

    auto circuit_builder = AvmMiniCircuitBuilder();
    circuit_builder.set_trace(std::move(trace_verif));
    auto composer = honk::AvmMiniComposer();
    auto verifier = composer.create_verifier(circuit_builder);

    auto proof = Execution::run_and_prove(bytecode, std::vector<FF>{});

    EXPECT_TRUE(verifier.verify_proof(proof));
}

// Positive test for SET and SUB opcodes
TEST_F(AvmMiniExecutionTests, setAndSubOpcodes)
{
    std::string bytecode_hex = "27"        // SET 39 = 0x27
                               "02"        // U16
                               "B813"      // val 47123
                               "000000AA"  // dst_offset 170
                               "27"        // SET 39 = 0x27
                               "02"        // U16
                               "9103"      // val 37123
                               "00000033"  // dst_offset 51
                               "01"        // SUB
                               "02"        // U16
                               "000000AA"  // addr a
                               "00000033"  // addr b
                               "00000001"  // addr c 1
                               "34"        // RETURN
                               "00000000"  // ret offset 0
                               "00000000"; // ret size 0

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto instructions = Execution::parse(bytecode);

    EXPECT_EQ(instructions.size(), 4);

    // SET
    EXPECT_EQ(instructions.at(0).op_code, OpCode::SET);
    EXPECT_EQ(instructions.at(0).operands.size(), 2);
    EXPECT_EQ(instructions.at(0).operands.at(0), 47123);
    EXPECT_EQ(instructions.at(0).operands.at(1), 170);
    EXPECT_EQ(instructions.at(0).in_tag, AvmMemoryTag::U16);

    // SET
    EXPECT_EQ(instructions.at(1).op_code, OpCode::SET);
    EXPECT_EQ(instructions.at(1).operands.size(), 2);
    EXPECT_EQ(instructions.at(1).operands.at(0), 37123);
    EXPECT_EQ(instructions.at(1).operands.at(1), 51);
    EXPECT_EQ(instructions.at(1).in_tag, AvmMemoryTag::U16);

    // SUB
    EXPECT_EQ(instructions.at(2).op_code, OpCode::SUB);
    EXPECT_EQ(instructions.at(2).operands.size(), 3);
    EXPECT_EQ(instructions.at(2).operands.at(0), 170);
    EXPECT_EQ(instructions.at(2).operands.at(1), 51);
    EXPECT_EQ(instructions.at(2).in_tag, AvmMemoryTag::U16);

    auto trace = Execution::gen_trace(instructions, std::vector<FF>{});

    // Find the first row enabling the subtraction selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avmMini_sel_op_sub == 1; });
    EXPECT_EQ(row->avmMini_ic, 10000); // 47123 - 37123 = 10000

    auto trace_verif = trace;
    validate_trace_proof(std::move(trace));

    auto circuit_builder = AvmMiniCircuitBuilder();
    circuit_builder.set_trace(std::move(trace_verif));
    auto composer = honk::AvmMiniComposer();
    auto verifier = composer.create_verifier(circuit_builder);

    auto proof = Execution::run_and_prove(bytecode, std::vector<FF>{});

    EXPECT_TRUE(verifier.verify_proof(proof));
}

// Positive test for multiple MUL opcodes
// We compute 5^12 based on U64 multiplications
// 5 is stored at offset 0 and 1 at offset 1
// Repeat 12 times a multiplication of value
// at offset 0 (5) with value at offset 1 and store
// the result at offset 1.
TEST_F(AvmMiniExecutionTests, powerWithMulOpcodes)
{
    std::string bytecode_hex = "27"        // SET 39 = 0x27
                               "04"        // U64
                               "00000000"  // val 5 higher 32 bits
                               "00000005"  // val 5 lower 32 bits
                               "00000000"  // dst_offset 0
                               "27"        // SET 39 = 0x27
                               "04"        // U64
                               "00000000"  // val 1 higher 32 bits
                               "00000001"  // val 1 lower 32 bits
                               "00000001"; // dst_offset 1

    std::string const mul_hex = "02"        // MUL
                                "04"        // U64
                                "00000000"  // addr a
                                "00000001"  // addr b
                                "00000001"; // addr c 1

    std::string const ret_hex = "34"        // RETURN
                                "00000000"  // ret offset 0
                                "00000000"; // ret size 0

    uint8_t num = 12;
    while (num-- > 0) {
        bytecode_hex.append(mul_hex);
    }

    bytecode_hex.append(ret_hex);

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto instructions = Execution::parse(bytecode);

    EXPECT_EQ(instructions.size(), 15);

    // MUL first pos
    EXPECT_EQ(instructions.at(2).op_code, OpCode::MUL);
    EXPECT_EQ(instructions.at(2).operands.size(), 3);
    EXPECT_EQ(instructions.at(2).operands.at(0), 0);
    EXPECT_EQ(instructions.at(2).operands.at(1), 1);
    EXPECT_EQ(instructions.at(2).operands.at(2), 1);
    EXPECT_EQ(instructions.at(2).in_tag, AvmMemoryTag::U64);

    // MUL last pos
    EXPECT_EQ(instructions.at(13).op_code, OpCode::MUL);
    EXPECT_EQ(instructions.at(13).operands.size(), 3);
    EXPECT_EQ(instructions.at(13).operands.at(0), 0);
    EXPECT_EQ(instructions.at(13).operands.at(1), 1);
    EXPECT_EQ(instructions.at(13).operands.at(2), 1);
    EXPECT_EQ(instructions.at(13).in_tag, AvmMemoryTag::U64);

    // RETURN
    EXPECT_EQ(instructions.at(14).op_code, OpCode::RETURN);
    EXPECT_EQ(instructions.at(14).operands.size(), 2);
    EXPECT_EQ(instructions.at(14).operands.at(0), 0);
    EXPECT_EQ(instructions.at(14).operands.at(0), 0);

    auto trace = Execution::gen_trace(instructions, std::vector<FF>{});

    // Find the first row enabling the multiplication selector and pc = 13
    auto row = std::ranges::find_if(
        trace.begin(), trace.end(), [](Row r) { return r.avmMini_sel_op_mul == 1 && r.avmMini_pc == 13; });
    EXPECT_EQ(row->avmMini_ic, 244140625); // 5^12 = 244140625

    auto trace_verif = trace;
    validate_trace_proof(std::move(trace));

    auto circuit_builder = AvmMiniCircuitBuilder();
    circuit_builder.set_trace(std::move(trace_verif));
    auto composer = honk::AvmMiniComposer();
    auto verifier = composer.create_verifier(circuit_builder);

    auto proof = Execution::run_and_prove(bytecode, std::vector<FF>{});

    EXPECT_TRUE(verifier.verify_proof(proof));
}

// Positive test about a single internal_call and internal_return
// Code of internal routine is SET U32 value 123456789 at memory address 7
// The bytecode execution is:
// SET U32 val. 222111000 at memory address 4
// CALL internal routine
// ADD M[4] with M[7] and output in M[9]
// Internal routine bytecode is at the end.
// Bytecode layout: SET INTERNAL_CALL ADD RETURN SET INTERNAL_RETURN
//                   0        1        2     3    4         5
TEST_F(AvmMiniExecutionTests, simpleInternalCall)
{
    std::string bytecode_hex = "27"       // SET 39 = 0x27
                               "03"       // U32
                               "0D3D2518" // val 222111000 = 0xD3D2518
                               "00000004" // dst_offset 4
                               "25"       // INTERNALCALL 37
                               "00000004" // jmp_dest
                               "00"       // ADD
                               "03"       // U32
                               "00000004" // addr a 4
                               "00000007" // addr b 7
                               "00000009" // addr c9
                               "34"       // RETURN
                               "00000000" // ret offset 0
                               "00000000" // ret size 0
                               "27"       // SET 39 = 0x27
                               "03"       // U32
                               "075BCD15" // val 123456789 = 0x75BCD15
                               "00000007" // dst_offset 7
                               "26"       // INTERNALRETURN 38
        ;

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto instructions = Execution::parse(bytecode);

    EXPECT_EQ(instructions.size(), 6);

    // We test parsing step for INTERNALCALL and INTERNALRETURN.

    // INTERNALCALL
    EXPECT_EQ(instructions.at(1).op_code, OpCode::INTERNALCALL);
    EXPECT_EQ(instructions.at(1).operands.size(), 1);
    EXPECT_EQ(instructions.at(1).operands.at(0), 4);

    // INTERNALRETURN
    EXPECT_EQ(instructions.at(5).op_code, OpCode::INTERNALRETURN);

    auto trace = Execution::gen_trace(instructions, std::vector<FF>{});

    // Find the first row enabling the addition selector.
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.avmMini_sel_op_add == 1; });
    EXPECT_EQ(row->avmMini_ic, 345567789);

    auto trace_verif = trace;
    validate_trace_proof(std::move(trace));

    // Expected PC sequence during execution
    std::vector<FF> pc_sequence{ 0, 1, 4, 5, 2, 3 };

    for (size_t i = 0; i < 6; i++) {
        EXPECT_EQ(trace_verif.at(i + 1).avmMini_pc, pc_sequence.at(i));
    }

    auto circuit_builder = AvmMiniCircuitBuilder();
    circuit_builder.set_trace(std::move(trace_verif));
    auto composer = honk::AvmMiniComposer();
    auto verifier = composer.create_verifier(circuit_builder);

    auto proof = Execution::run_and_prove(bytecode, std::vector<FF>{});

    EXPECT_TRUE(verifier.verify_proof(proof));
}

// Negative test detecting an invalid opcode byte.
TEST_F(AvmMiniExecutionTests, invalidOpcode)
{
    std::string bytecode_hex = "00"        // ADD
                               "02"        // U16
                               "00000007"  // addr a 7
                               "00000009"  // addr b 9
                               "00000001"  // addr c 1
                               "AB"        // Invalid opcode byte
                               "00000000"  // ret offset 0
                               "00000000"; // ret size 0

    auto bytecode = hex_to_bytes(bytecode_hex);
    EXPECT_THROW_WITH_MESSAGE(Execution::parse(bytecode), "opcode");
}

// Negative test detecting an invalid memmory instruction tag.
TEST_F(AvmMiniExecutionTests, invalidInstructionTag)
{
    std::string bytecode_hex = "00"        // ADD
                               "00"        // Wrong type
                               "00000007"  // addr a 7
                               "00000009"  // addr b 9
                               "00000001"  // addr c 1
                               "34"        // RETURN
                               "00000000"  // ret offset 0
                               "00000000"; // ret size 0

    auto bytecode = hex_to_bytes(bytecode_hex);
    EXPECT_THROW_WITH_MESSAGE(Execution::parse(bytecode), "Instruction tag is invalid");
}

// Negative test detecting SET opcode with instruction memory tag set to FF.
TEST_F(AvmMiniExecutionTests, ffInstructionTagSetOpcode)
{
    std::string bytecode_hex = "00"        // ADD
                               "05"        // U128
                               "00000007"  // addr a 7
                               "00000009"  // addr b 9
                               "00000001"  // addr c 1
                               "27"        // SET 39 = 0x27
                               "06"        // tag FF
                               "00002344"; //

    auto bytecode = hex_to_bytes(bytecode_hex);
    EXPECT_THROW_WITH_MESSAGE(Execution::parse(bytecode), "Instruction tag for SET opcode is invalid");
}

// Negative test detecting an incomplete instruction: missing instruction tag
TEST_F(AvmMiniExecutionTests, truncatedInstructionNoTag)
{
    std::string bytecode_hex = "00"       // ADD
                               "02"       // U16
                               "00000007" // addr a 7
                               "00000009" // addr b 9
                               "00000001" // addr c 1
                               "01";      // SUB

    auto bytecode = hex_to_bytes(bytecode_hex);
    EXPECT_THROW_WITH_MESSAGE(Execution::parse(bytecode), "Instruction tag missing");
}

// Negative test detecting an incomplete instruction: instruction tag present but an operand is missing
TEST_F(AvmMiniExecutionTests, truncatedInstructionNoOperand)
{
    std::string bytecode_hex = "00"        // ADD
                               "02"        // U16
                               "00000007"  // addr a 7
                               "00000009"  // addr b 9
                               "00000001"  // addr c 1
                               "01"        // SUB
                               "04"        // U64
                               "AB2373E7"  // addr a
                               "FFFFFFBB"; // addr b and missing address for c = a-b

    auto bytecode = hex_to_bytes(bytecode_hex);
    EXPECT_THROW_WITH_MESSAGE(Execution::parse(bytecode), "Operand is missing");
}

} // namespace tests_avm