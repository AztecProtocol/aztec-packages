#include "barretenberg/vm/avm/trace/execution.hpp"

#include <cstdint>
#include <gtest/gtest.h>
#include <memory>
#include <sys/types.h>

#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/utils.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/deserialization.hpp"
#include "barretenberg/vm/avm/trace/execution_hints.hpp"
#include "barretenberg/vm/avm/trace/fixed_gas.hpp"
#include "barretenberg/vm/avm/trace/helper.hpp"
#include "barretenberg/vm/avm/trace/kernel_trace.hpp"
#include "barretenberg/vm/avm/trace/opcode.hpp"
#include "barretenberg/vm/avm/trace/public_inputs.hpp"
#include "barretenberg/vm/constants.hpp"
#include "common.test.hpp"

#include "barretenberg/vm/aztec_constants.hpp"

namespace tests_avm {

using namespace bb;
using namespace bb::avm_trace;
using namespace testing;

using bb::utils::hex_to_bytes;

class AvmExecutionTests : public ::testing::Test {
  public:
    AvmPublicInputs public_inputs;

    AvmExecutionTests()
        : public_inputs(generate_base_public_inputs())
    {
        Execution::set_trace_builder_constructor(
            [](AvmPublicInputs public_inputs, ExecutionHints execution_hints, uint32_t side_effect_counter) {
                return AvmTraceBuilder(public_inputs, std::move(execution_hints), side_effect_counter)
                    .set_full_precomputed_tables(false)
                    .set_range_check_required(false);
            });
    };

  protected:
    const FixedGasTable& GAS_COST_TABLE = FixedGasTable::get();

    // TODO(640): The Standard Honk on Grumpkin test suite fails unless the SRS is initialised for every test.
    void SetUp() override
    {
        srs::init_crs_factory("../srs_db/ignition");
        public_inputs.gas_settings.gas_limits.l2_gas = DEFAULT_INITIAL_L2_GAS;
        public_inputs.gas_settings.gas_limits.da_gas = DEFAULT_INITIAL_DA_GAS;
        public_inputs.start_gas_used.l2_gas = 0;
        public_inputs.start_gas_used.da_gas = 0;

        // These values are magic because of how some tests work! Don't change them
        PublicCallRequest dummy_request = {
            /* msg_sender */ FF::one(),
            /* contract_address */ 0xdeadbeef,
            /* function_selector */ 3,
            /* is_static_call */ true,
            /* args_hash */ FF(12),
        };
        public_inputs.public_app_logic_call_requests[0] = dummy_request;
    };

    /**
     * @brief Generate the execution trace pertaining to the supplied bytecode.
     *
     * @param bytecode
     * @return The trace as a vector of Row.
     */
    std::vector<Row> gen_trace_from_bytecode(const std::vector<uint8_t>& bytecode) const
    {
        std::vector<FF> calldata{};
        std::vector<FF> returndata{};

        auto [contract_class_id, contract_instance] = gen_test_contract_hint(bytecode);
        auto execution_hints = ExecutionHints().with_avm_contract_bytecode(
            { AvmContractBytecode{ bytecode, contract_instance, contract_class_id } });

        vinfo("Calling execution::gen_trace");
        return AvmExecutionTests::gen_trace(bytecode, calldata, public_inputs, returndata, execution_hints);
    }

    static std::vector<Row> gen_trace(const std::vector<uint8_t>& bytecode,
                                      const std::vector<FF>& calldata,
                                      AvmPublicInputs public_inputs,
                                      std::vector<FF>& returndata,
                                      ExecutionHints execution_hints)
    {
        auto [contract_class_id, contract_instance] = gen_test_contract_hint(bytecode);
        execution_hints.with_avm_contract_bytecode(
            { AvmContractBytecode{ bytecode, contract_instance, contract_class_id } });

        // These are magic values because of how some tests work! Don't change them
        public_inputs.public_app_logic_call_requests[0].contract_address = contract_instance.address;
        execution_hints.enqueued_call_hints.push_back({
            .contract_address = contract_instance.address,
            .calldata = calldata,
        });
        return Execution::gen_trace(public_inputs, returndata, execution_hints, false);
    }

    static std::tuple<ContractClassIdHint, ContractInstanceHint> gen_test_contract_hint(
        const std::vector<uint8_t>& bytecode)
    {
        FF public_commitment = AvmBytecodeTraceBuilder::compute_public_bytecode_commitment(bytecode);
        FF class_id = AvmBytecodeTraceBuilder::compute_contract_class_id(
            FF::one() /*artifact_hash*/, FF(2) /*private_fn_root*/, public_commitment);
        auto nullifier_key = grumpkin::g1::affine_one;
        auto incoming_viewing_key = grumpkin::g1::affine_one;
        auto outgoing_viewing_key = grumpkin::g1::affine_one;
        auto tagging_key = grumpkin::g1::affine_one;
        PublicKeysHint public_keys{ nullifier_key, incoming_viewing_key, outgoing_viewing_key, tagging_key };
        ContractInstanceHint contract_instance = {
            FF::one() /* temp address */,    true /* exists */, FF(2) /* salt */, FF(3) /* deployer_addr */, class_id,
            FF(8) /* initialisation_hash */, public_keys,
            /*membership_hint=*/ { .low_leaf_preimage = { .nullifier = 0, .next_nullifier = 0, .next_index = 0, }, .low_leaf_index = 0, .low_leaf_sibling_path = {} },
        };
        FF address = AvmBytecodeTraceBuilder::compute_address_from_instance(contract_instance);
        contract_instance.address = address;
        return { ContractClassIdHint{ FF::one(), FF(2), public_commitment }, contract_instance };
    }
};

// Basic positive test with an ADD and RETURN opcode.
// Parsing, trace generation and proving is verified.
TEST_F(AvmExecutionTests, basicAddReturn)
{
    std::string bytecode_hex = to_hex(OpCode::SET_8) +           // opcode SET
                               "00"                              // Indirect flag
                               "07"                              // dst_offset 0
                               + to_hex(AvmMemoryTag::U8) + "00" // val
                               + to_hex(OpCode::SET_8) +         // opcode SET
                               "00"                              // Indirect flag
                               "09"                              // dst_offset 0
                               + to_hex(AvmMemoryTag::U8) +      //
                               "00"                              // val
                               + to_hex(OpCode::ADD_16) +        // opcode ADD
                               "00"                              // Indirect flag
                               "0007"                            // addr a 7
                               "0009"                            // addr b 9
                               "0001"                            // addr c 1
                               + to_hex(OpCode::SET_8) +         // opcode SET (for return size)
                               "00"                              // Indirect flag
                               "FF"                              // dst_offset=255
                               + to_hex(AvmMemoryTag::U32) +     //
                               "00"                              // val: 0
                               + to_hex(OpCode::RETURN) +        // opcode RETURN
                               "00"                              // Indirect flag
                               "0000"                            // ret offset 0
                               "00FF";                           // ret size offset 255

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    // 2 instructions
    ASSERT_THAT(instructions, SizeIs(5));

    // ADD
    EXPECT_THAT(instructions.at(2),
                AllOf(Field(&Instruction::op_code, OpCode::ADD_16),
                      Field(&Instruction::operands,
                            ElementsAre(VariantWith<uint8_t>(0),
                                        VariantWith<uint16_t>(7),
                                        VariantWith<uint16_t>(9),
                                        VariantWith<uint16_t>(1)))));
    // SET
    EXPECT_THAT(instructions.at(3),
                AllOf(Field(&Instruction::op_code, OpCode::SET_8),
                      Field(&Instruction::operands,
                            ElementsAre(VariantWith<uint8_t>(0),
                                        VariantWith<uint8_t>(255),
                                        VariantWith<AvmMemoryTag>(AvmMemoryTag::U32),
                                        VariantWith<uint8_t>(0)))));

    // RETURN
    EXPECT_THAT(
        instructions.at(4),
        AllOf(Field(&Instruction::op_code, OpCode::RETURN),
              Field(&Instruction::operands,
                    ElementsAre(VariantWith<uint8_t>(0), VariantWith<uint16_t>(0), VariantWith<uint16_t>(255)))));

    auto trace = gen_trace_from_bytecode(bytecode);
    validate_trace(std::move(trace), public_inputs, {}, {});
}

// Positive test for SET and SUB opcodes
TEST_F(AvmExecutionTests, setAndSubOpcodes)
{
    std::string bytecode_hex = to_hex(OpCode::SET_16) +      // opcode SET
                               "00"                          // Indirect flag
                               "00AA"                        // dst_offset 170
                               + to_hex(AvmMemoryTag::U16) + //
                               "B813"                        // val 47123
                               + to_hex(OpCode::SET_16) +    // opcode SET
                               "00"                          // Indirect flag
                               "0033"                        // dst_offset 51
                               + to_hex(AvmMemoryTag::U16) + //
                               "9103"                        // val 37123
                               + to_hex(OpCode::SUB_8) +     // opcode SUB
                               "00"                          // Indirect flag
                               "AA"                          // addr a
                               "33"                          // addr b
                               "01"                          // addr c 1
                               + to_hex(OpCode::SET_8) +     // opcode SET (for return size)
                               "00"                          // Indirect flag
                               "FF"                          // dst_offset=255
                               + to_hex(AvmMemoryTag::U32) + //
                               "00"                          // val: 0
                               + to_hex(OpCode::RETURN) +    // opcode RETURN
                               "00"                          // Indirect flag
                               "0000"                        // ret offset 0
                               "00FF";                       // ret size offset 255

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    ASSERT_THAT(instructions, SizeIs(5));

    // SET
    EXPECT_THAT(instructions.at(0),
                AllOf(Field(&Instruction::op_code, OpCode::SET_16),
                      Field(&Instruction::operands,
                            ElementsAre(VariantWith<uint8_t>(0),
                                        VariantWith<uint16_t>(170),
                                        VariantWith<AvmMemoryTag>(AvmMemoryTag::U16),
                                        VariantWith<uint16_t>(47123)))));

    // SET
    EXPECT_THAT(instructions.at(1),
                AllOf(Field(&Instruction::op_code, OpCode::SET_16),
                      Field(&Instruction::operands,
                            ElementsAre(VariantWith<uint8_t>(0),
                                        VariantWith<uint16_t>(51),
                                        VariantWith<AvmMemoryTag>(AvmMemoryTag::U16),
                                        VariantWith<uint16_t>(37123)))));

    // SUB
    EXPECT_THAT(instructions.at(2),
                AllOf(Field(&Instruction::op_code, OpCode::SUB_8),
                      Field(&Instruction::operands,
                            ElementsAre(VariantWith<uint8_t>(0),
                                        VariantWith<uint8_t>(170),
                                        VariantWith<uint8_t>(51),
                                        VariantWith<uint8_t>(1)))));

    auto trace = gen_trace_from_bytecode(bytecode);

    // Find the first row enabling the subtraction selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_sub == 1; });
    EXPECT_EQ(row->main_ic, 10000); // 47123 - 37123 = 10000
    validate_trace(std::move(trace), public_inputs, {}, {});
}

// Positive test for multiple MUL opcodes
// We compute 5^12 based on U64 multiplications
// 5 is stored at offset 0 and 1 at offset 1
// Repeat 12 times a multiplication of value
// at offset 0 (5) with value at offset 1 and store
// the result at offset 1.
TEST_F(AvmExecutionTests, powerWithMulOpcodes)
{
    const int NUM_MUL_ITERATIONS = 12;
    std::string bytecode_hex = to_hex(OpCode::SET_8) +             // opcode SET
                               "00"                                // Indirect flag
                               "00"                                // dst_offset 0
                               + to_hex(AvmMemoryTag::U64) + "05"  // val
                               + to_hex(OpCode::SET_8) +           // opcode SET
                               "00"                                // Indirect flag
                               "01"                                // dst_offset 1
                               + to_hex(AvmMemoryTag::U64) + "01"; // val

    std::string const mul_hex = to_hex(OpCode::MUL_8) + // opcode MUL
                                "00"                    // Indirect flag
                                "00"                    // addr a
                                "01"                    // addr b
                                "01";                   // addr c 1

    std::string const set_return_size_hex = to_hex(OpCode::SET_8) +       // opcode SET
                                            "00"                          // Indirect flag
                                            "FF"                          // dst_offset
                                            + to_hex(AvmMemoryTag::U32) + //
                                            "00";                         // val

    std::string const ret_hex = to_hex(OpCode::RETURN) + // opcode RETURN
                                "00"                     // Indirect flag
                                "0000"                   // ret offset 0
                                "00FF";                  // ret size offset 255

    for (int i = 0; i < NUM_MUL_ITERATIONS; i++) {
        bytecode_hex.append(mul_hex);
    }
    bytecode_hex.append(set_return_size_hex);
    bytecode_hex.append(ret_hex);

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    ASSERT_THAT(instructions, SizeIs(16));

    // MUL first pos
    EXPECT_THAT(instructions.at(2),
                AllOf(Field(&Instruction::op_code, OpCode::MUL_8),
                      Field(&Instruction::operands,
                            ElementsAre(VariantWith<uint8_t>(0),
                                        VariantWith<uint8_t>(0),
                                        VariantWith<uint8_t>(1),
                                        VariantWith<uint8_t>(1)))));

    // MUL last pos
    EXPECT_THAT(instructions.at(NUM_MUL_ITERATIONS + 1),
                AllOf(Field(&Instruction::op_code, OpCode::MUL_8),
                      Field(&Instruction::operands,
                            ElementsAre(VariantWith<uint8_t>(0),
                                        VariantWith<uint8_t>(0),
                                        VariantWith<uint8_t>(1),
                                        VariantWith<uint8_t>(1)))));

    // SET
    EXPECT_THAT(instructions.at(NUM_MUL_ITERATIONS + 2),
                AllOf(Field(&Instruction::op_code, OpCode::SET_8),
                      Field(&Instruction::operands,
                            ElementsAre(VariantWith<uint8_t>(0),
                                        VariantWith<uint8_t>(255),
                                        VariantWith<AvmMemoryTag>(AvmMemoryTag::U32),
                                        VariantWith<uint8_t>(0)))));

    // RETURN
    EXPECT_THAT(
        instructions.at(NUM_MUL_ITERATIONS + 3),
        AllOf(Field(&Instruction::op_code, OpCode::RETURN),
              Field(&Instruction::operands,
                    ElementsAre(VariantWith<uint8_t>(0), VariantWith<uint16_t>(0), VariantWith<uint16_t>(255)))));

    auto trace = gen_trace_from_bytecode(bytecode);

    // Find the first row enabling the multiplication selector and pc of last multiplication
    const auto last_mul_pc = 2 * Deserialization::get_pc_increment(OpCode::SET_8) +
                             (NUM_MUL_ITERATIONS - 1) * Deserialization::get_pc_increment(OpCode::MUL_8);

    auto row = std::ranges::find_if(trace.begin(), trace.end(), [last_mul_pc](Row r) {
        return r.main_sel_op_mul == 1 && r.main_pc == last_mul_pc;
    });

    int result = 1;
    // Compute 5 ^ NUM_MUL_ITERATIONS
    for (int i = 0; i < NUM_MUL_ITERATIONS; i++) {
        result *= 5;
    }

    EXPECT_EQ(row->main_ic, result);

    validate_trace(std::move(trace), public_inputs);
}

// Positive test about a single internal_call and internal_return
// Code of internal routine is SET U32 value 123456789 at memory address 7
// The bytecode execution is:
// SET U32 val. 222111000 at memory address 4
// CALL internal routine
// ADD M[4] with M[7] and output in M[9]
// Internal routine bytecode is at the end.
// Bytecode layout: SET_32 INTERNAL_CALL ADD_16 SET_8 RETURN SET_32 INTERNAL_RETURN
// Instr. Index      0           1        2       3      4      5         6
// PC Index          0           9        14      22     27     33        42
TEST_F(AvmExecutionTests, simpleInternalCall)
{
    std::string bytecode_hex = to_hex(OpCode::SET_32) +                 // opcode SET
                               "00"                                     // Indirect flag
                               "0004"                                   // dst_offset 4
                               + to_hex(AvmMemoryTag::U32) +            //
                               "0D3D2518"                               // val 222111000 = 0xD3D2518
                               + to_hex(OpCode::INTERNALCALL) +         // opcode INTERNALCALL
                               "00000021"                               // jmp_dest 33
                               + to_hex(OpCode::ADD_16) +               // opcode ADD
                               "00"                                     // Indirect flag
                               "0004"                                   // addr a 4
                               "0007"                                   // addr b 7
                               "0009"                                   // addr c9
                               + to_hex(OpCode::SET_8) +                // opcode SET (for return size)
                               "00"                                     // Indirect flag
                               "FF"                                     // dst_offset=255
                               + to_hex(AvmMemoryTag::U32) + "00"       // val: 0
                               + to_hex(OpCode::RETURN) +               // opcode RETURN
                               "00"                                     // Indirect flag
                               "0000"                                   // ret offset 0
                               "00FF"                                   // ret size offset 255
                               + to_hex(OpCode::SET_32) +               // opcode SET
                               "00"                                     // Indirect flag
                               "0007"                                   // dst_offset 7
                               + to_hex(AvmMemoryTag::U32) + "075BCD15" // val 123456789 = 0x75BCD15
                               + to_hex(OpCode::INTERNALRETURN)         // opcode INTERNALRETURN
        ;

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    EXPECT_THAT(instructions, SizeIs(7));

    // We test parsing step for INTERNALCALL and INTERNALRETURN.

    // INTERNALCALL
    EXPECT_THAT(instructions.at(1),
                AllOf(Field(&Instruction::op_code, OpCode::INTERNALCALL),
                      Field(&Instruction::operands, ElementsAre(VariantWith<uint32_t>(33)))));

    // INTERNALRETURN
    EXPECT_EQ(instructions.at(6).op_code, OpCode::INTERNALRETURN);

    auto trace = gen_trace_from_bytecode(bytecode);

    // Expected sequence of PCs during execution
    std::vector<FF> pc_sequence{ 0, 9, 33, 42, 14, 22, 27 };

    for (size_t i = 0; i < 7; i++) {
        EXPECT_EQ(trace.at(i + 1).main_pc, pc_sequence.at(i));
    }

    // Find the first row enabling the addition selector.
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_add == 1; });
    EXPECT_EQ(row->main_ic, 345567789);

    validate_trace(std::move(trace), public_inputs);
}

// Positive test with some nested internall calls
// We use the following functions (internal calls):
// F1: ADD(2,3,2)  M[2] = M[2] + M[3]
// F2: MUL(2,3,2)  M[2] = M[2] * M[3]
// G: F1 SET(17,3) F2  where SET(17,3) means M[3] = 17
// MAIN: SET(4,2) SET(7,3) G
// Whole execution should compute: (4 + 7) * 17 = 187
// Bytecode layout: SET(4,2) SET(7,3) INTERNAL_CALL_G SET_8 RETURN BYTECODE(F2) BYTECODE(F1) BYTECODE(G)
// Instr Index:        0         1            2        3      4         5           7            9
// PC Index:           0         9           18       23     28        34          40           46
// BYTECODE(F1): ADD(2,3,2) INTERNAL_RETURN
// BYTECODE(F2): MUL(2,3,2) INTERNAL_RETURN
// BYTECODE(G): INTERNAL_CALL(35) SET(17,3) INTERNAL_CALL(29) INTERNAL_RETURN
TEST_F(AvmExecutionTests, nestedInternalCalls)
{
    auto internalCallInstructionHex = [](std::string const& dst_offset) {
        return to_hex(OpCode::INTERNALCALL) // opcode INTERNALCALL
               + "000000" + dst_offset;
    };

    auto setInstructionHex = [](std::string const& val, std::string const& dst_offset) {
        // val and dst_offset is assumed to be 2 bytes
        return to_hex(OpCode::SET_32) // opcode SET
               + "00"                 // Indirect flag
               + "00" + dst_offset + to_hex(AvmMemoryTag::U8) + "000000" + val;
    };

    const std::string tag_address_arguments = "00"  // Indirect Flag
                                              "02"  // addr a 2
                                              "03"  // addr b 3
                                              "02"; // addr c 2

    std::string const set_return_size_hex = to_hex(OpCode::SET_8) +             // opcode SET
                                            "00"                                // Indirect flag
                                            "FF"                                // dst_offset 255
                                            + to_hex(AvmMemoryTag::U32) + "00"; // val

    const std::string return_instruction_hex = to_hex(OpCode::RETURN) // opcode RETURN
                                               + "00"                 // Indirect flag
                                                 "0000"               // ret offset 0
                                                 "00FF";              // ret size offset 255

    const std::string bytecode_f1 = to_hex(OpCode::ADD_8) + tag_address_arguments + to_hex(OpCode::INTERNALRETURN);
    const std::string bytecode_f2 = to_hex(OpCode::MUL_8) + tag_address_arguments + to_hex(OpCode::INTERNALRETURN);
    const std::string bytecode_g = internalCallInstructionHex("28") + setInstructionHex("11", "03") +
                                   internalCallInstructionHex("22") + to_hex(OpCode::INTERNALRETURN);
    std::string bytecode_hex = setInstructionHex("04", "02") + setInstructionHex("07", "03") +
                               internalCallInstructionHex("2E") + set_return_size_hex + return_instruction_hex +
                               bytecode_f2 + bytecode_f1 + bytecode_g;

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    ASSERT_THAT(instructions, SizeIs(13));

    // Expected sequence of opcodes
    std::vector<OpCode> const opcode_sequence{ OpCode::SET_32,         OpCode::SET_32, OpCode::INTERNALCALL,
                                               OpCode::SET_8,          OpCode::RETURN, OpCode::MUL_8,
                                               OpCode::INTERNALRETURN, OpCode::ADD_8,  OpCode::INTERNALRETURN,
                                               OpCode::INTERNALCALL,   OpCode::SET_32, OpCode::INTERNALCALL,
                                               OpCode::INTERNALRETURN };

    for (size_t i = 0; i < 13; i++) {
        EXPECT_EQ(instructions.at(i).op_code, opcode_sequence.at(i));
    }

    auto trace = gen_trace_from_bytecode(bytecode);

    // Expected sequence of PCs during execution
    std::vector<FF> pc_sequence{ 0, 9, 18, 46, 40, 45, 51, 60, 34, 39, 65, 23, 28 };

    for (size_t i = 0; i < 13; i++) {
        EXPECT_EQ(trace.at(i + 1).main_pc, pc_sequence.at(i));
    }

    // Find the first row enabling the multiplication selector.
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_mul == 1; });
    EXPECT_EQ(row->main_ic, 187);
    EXPECT_EQ(row->main_pc, 34);

    validate_trace(std::move(trace), public_inputs);
}

// Positive test with JUMP and CALLDATACOPY
// We test bytecode which first invokes CALLDATACOPY on a FF array of two values.
// Then, a JUMP call skips a SUB opcode to land to a FDIV operation and RETURN.
// Calldata: [13, 156]
// Bytecode layout: SET_8 SET_8 CALLDATACOPY  JUMP  SUB  FDIV  SET_8 RETURN
// Instr. Index:     0      1         2        3     4     5     6     7
// PC index:         0      5         10       18    23    28    33    38
TEST_F(AvmExecutionTests, jumpAndCalldatacopy)
{
    std::string bytecode_hex = to_hex(OpCode::SET_8) +          // opcode SET
                               "00"                             // Indirect flag
                               "00"                             // dst_offset
                               + to_hex(AvmMemoryTag::U32) +    //
                               "00"                             // val
                               + to_hex(OpCode::SET_8) +        // opcode SET
                               "00"                             // Indirect flag
                               "01"                             // dst_offset
                               + to_hex(AvmMemoryTag::U32) +    //
                               "02"                             // val
                               + to_hex(OpCode::CALLDATACOPY) + // opcode CALLDATACOPY (no in tag)
                               "00"                             // Indirect flag
                               "0000"                           // cd_offset
                               "0001"                           // copy_size offset 2 and copysize 2
                               "000A"                           // dst_offset // M[10] = 13, M[11] = 156
                               + to_hex(OpCode::JUMP_32) +      // opcode JUMP
                               "0000001C"                       // jmp_dest (FDIV located at 28)
                               + to_hex(OpCode::SUB_8) +        // opcode SUB
                               "00"                             // Indirect flag
                               "0B"                             // addr 11
                               "0A"                             // addr 10
                               "01"                             // addr c 1 (If executed would be 156 - 13 = 143)
                               + to_hex(OpCode::FDIV_8) +       // opcode FDIV
                               "00"                             // Indirect flag
                               "0B"                             // addr 11
                               "0A"                             // addr 10
                               "01"                             // addr c 1 (156 / 13 = 12)
                               + to_hex(OpCode::SET_8) +        // opcode SET (for return size)
                               "00"                             // Indirect flag
                               "FF"                             // dst_offset=255
                               + to_hex(AvmMemoryTag::U32) +    //
                               "00"                             // val: 0
                               + to_hex(OpCode::RETURN) +       // opcode RETURN
                               "00"                             // Indirect flag
                               "0000"                           // ret offset 0
                               "00FF"                           // ret size offset 255
        ;

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    ASSERT_THAT(instructions, SizeIs(8));

    // We test parsing steps for CALLDATACOPY and JUMP.

    // CALLDATACOPY
    EXPECT_THAT(instructions.at(2),
                AllOf(Field(&Instruction::op_code, OpCode::CALLDATACOPY),
                      Field(&Instruction::operands,
                            ElementsAre(VariantWith<uint8_t>(0),
                                        VariantWith<uint16_t>(0),
                                        VariantWith<uint16_t>(1),
                                        VariantWith<uint16_t>(10)))));

    // JUMP
    EXPECT_THAT(instructions.at(3),
                AllOf(Field(&Instruction::op_code, OpCode::JUMP_32),
                      Field(&Instruction::operands, ElementsAre(VariantWith<uint32_t>(28)))));

    std::vector<FF> returndata;
    ExecutionHints execution_hints;
    auto trace = gen_trace(bytecode, std::vector<FF>{ 13, 156 }, public_inputs, returndata, execution_hints);

    // Expected sequence of PCs during execution
    std::vector<FF> pc_sequence{ 0, 5, 10, 18, 28, 33, 38 };

    for (size_t i = 0; i < 7; i++) {
        EXPECT_EQ(trace.at(i + 1).main_pc, pc_sequence.at(i));
    }

    // Find the first row enabling the fdiv selector.
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_fdiv == 1; });
    ASSERT_TRUE(row != trace.end());
    EXPECT_EQ(row->main_ic, 12);

    // Find the first row enabling the subtraction selector.
    row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_sub == 1; });
    // It must have failed as subtraction was "jumped over".
    EXPECT_EQ(row, trace.end());

    validate_trace(std::move(trace), public_inputs, { 13, 156 });
}

// Positive test for JUMPI.
// We invoke CALLDATACOPY on a FF array of one value which will serve as the conditional value
// for JUMPI and set this value at memory offset 10.
// Then, we set value 20 (UINT16) at memory offset 101.
// Then, a JUMPI call is performed. Depending of the conditional value, the next opcode (ADD) is
// omitted or not, i.e., we jump to the subsequent opcode MUL.
// Bytecode layout: SET  SET  CALLDATACOPY  SET  JUMPI  ADD   MUL  SET_8 RETURN
// Instr. Index:     0    1        2         3     4     5     6     7     8
// PC Index:         0    5       10        18    23    31    39    44    49
// We test this bytecode with two calldatacopy inputs: {9873123} and {0}.
TEST_F(AvmExecutionTests, jumpiAndCalldatacopy)
{
    std::string bytecode_hex = to_hex(OpCode::SET_8) +          // opcode SET
                               "00"                             // Indirect flag
                               "00"                             // dst_offset
                               + to_hex(AvmMemoryTag::U32) +    //
                               "00"                             // val
                               + to_hex(OpCode::SET_8) +        // opcode SET
                               "00"                             // Indirect flag
                               "01"                             // dst_offset
                               + to_hex(AvmMemoryTag::U32) +    //
                               "01"                             // val
                               + to_hex(OpCode::CALLDATACOPY) + // opcode CALLDATACOPY (no in tag)
                               "00"                             // Indirect flag
                               "0000"                           // cd_offset
                               "0001"                           // copy_size
                               "000A"                           // dst_offset 10
                               + to_hex(OpCode::SET_8) +        // opcode SET
                               "00"                             // Indirect flag
                               "65"                             // dst_offset 101
                               + to_hex(AvmMemoryTag::U16) +    //
                               "14"                             // val 20
                               + to_hex(OpCode::JUMPI_32) +     // opcode JUMPI
                               "00"                             // Indirect flag
                               "000A"                           // cond_offset 10
                               "00000027"                       // jmp_dest (MUL located at 39)
                               + to_hex(OpCode::ADD_16) +       // opcode ADD
                               "00"                             // Indirect flag
                               "0065"                           // addr 101
                               "0065"                           // addr 101
                               "0065"                           // output addr 101
                               + to_hex(OpCode::MUL_8) +        // opcode MUL
                               "00"                             // Indirect flag
                               "65"                             // addr 101
                               "65"                             // addr 101
                               "66"                             // output of MUL addr 102
                               + to_hex(OpCode::SET_8) +        // opcode SET (for return size)
                               "00"                             // Indirect flag
                               "FF"                             // dst_offset=255
                               + to_hex(AvmMemoryTag::U32) +    //
                               "00"                             // val: 0
                               + to_hex(OpCode::RETURN) +       // opcode RETURN
                               "00"                             // Indirect flag
                               "0000"                           // ret offset 0
                               "00FF"                           // ret size offset 255
        ;

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    ASSERT_THAT(instructions, SizeIs(9));

    // We test parsing of JUMPI.

    // JUMPI
    EXPECT_THAT(
        instructions.at(4),
        AllOf(Field(&Instruction::op_code, OpCode::JUMPI_32),
              Field(&Instruction::operands,
                    ElementsAre(VariantWith<uint8_t>(0), VariantWith<uint16_t>(10), VariantWith<uint32_t>(39)))));

    std::vector<FF> returndata;
    ExecutionHints execution_hints;
    auto trace_jump = gen_trace(bytecode, std::vector<FF>{ 9873123 }, public_inputs, returndata, execution_hints);
    auto trace_no_jump = gen_trace(bytecode, std::vector<FF>{ 0 }, public_inputs, returndata, execution_hints);

    // Expected sequence of PCs during execution with jump
    std::vector<FF> pc_sequence_jump{ 0, 5, 10, 18, 23, 39, 44, 49 };
    // Expected sequence of PCs during execution without jump
    std::vector<FF> pc_sequence_no_jump{ 0, 5, 10, 18, 23, 31, 39, 44, 49 };

    for (size_t i = 0; i < 8; i++) {
        EXPECT_EQ(trace_jump.at(i + 1).main_pc, pc_sequence_jump.at(i));
    }

    for (size_t i = 0; i < 9; i++) {
        EXPECT_EQ(trace_no_jump.at(i + 1).main_pc, pc_sequence_no_jump.at(i));
    }

    // traces validation
    validate_trace(std::move(trace_jump), public_inputs, { 9873123 });
    validate_trace(std::move(trace_no_jump), public_inputs, { 0 });
}

// Positive test with MOV.
TEST_F(AvmExecutionTests, movOpcode)
{
    std::string bytecode_hex = to_hex(OpCode::SET_8) +            // opcode SET
                               "00"                               // Indirect flag
                               "AB"                               // dst_offset 171
                               + to_hex(AvmMemoryTag::U8) + "13"  // val 19
                               + to_hex(OpCode::MOV_8) +          // opcode MOV
                               "00"                               // Indirect flag
                               "AB"                               // src_offset 171
                               "21"                               // dst_offset 33
                               + to_hex(OpCode::SET_8) +          // opcode SET (for return size)
                               "00"                               // Indirect flag
                               "FF"                               // dst_offset=255
                               + to_hex(AvmMemoryTag::U32) + "00" // val: 0
                               + to_hex(OpCode::RETURN) +         // opcode RETURN
                               "00"                               // Indirect flag
                               "0000"                             // ret offset 0
                               "00FF";                            // ret size offset 255

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    ASSERT_THAT(instructions, SizeIs(4));

    // SET
    EXPECT_THAT(instructions.at(0),
                AllOf(Field(&Instruction::op_code, OpCode::SET_8),
                      Field(&Instruction::operands,
                            ElementsAre(VariantWith<uint8_t>(0),
                                        VariantWith<uint8_t>(171),
                                        VariantWith<AvmMemoryTag>(AvmMemoryTag::U8),
                                        VariantWith<uint8_t>(19)))));

    // MOV
    EXPECT_THAT(
        instructions.at(1),
        AllOf(Field(&Instruction::op_code, OpCode::MOV_8),
              Field(&Instruction::operands,
                    ElementsAre(VariantWith<uint8_t>(0), VariantWith<uint8_t>(171), VariantWith<uint8_t>(33)))));

    auto trace = gen_trace_from_bytecode(bytecode);

    // Find the first row enabling the MOV selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_mov == 1; });
    EXPECT_EQ(row->main_ia, 19);
    EXPECT_EQ(row->main_ic, 19);

    validate_trace(std::move(trace), public_inputs);
}

// Positive test with indirect MOV.
TEST_F(AvmExecutionTests, indMovOpcode)
{
    std::string bytecode_hex = to_hex(OpCode::SET_8) +            // opcode SET
                               "00"                               // Indirect flag
                               "01"                               // dst_offset 1
                               + to_hex(AvmMemoryTag::U32) + "0A" // val 10
                               + to_hex(OpCode::SET_8) +          // opcode SET
                               "00"                               // Indirect flag
                               "02"                               // dst_offset 2
                               + to_hex(AvmMemoryTag::U32) + "0B" // val 11
                               + to_hex(OpCode::SET_8) +          // opcode SET
                               "00"                               // Indirect flag
                               "0A"                               // dst_offset 10
                               + to_hex(AvmMemoryTag::U8) + "FF"  // val 255
                               + to_hex(OpCode::MOV_8) +          // opcode MOV
                               "01"                               // Indirect flag
                               "01"                               // src_offset 1 --> direct offset 10
                               "02"                               // dst_offset 2 --> direct offset 11
                               + to_hex(OpCode::SET_8) +          // opcode SET (for return size)
                               "00"                               // Indirect flag
                               "FF"                               // dst_offset=255
                               + to_hex(AvmMemoryTag::U32) + "00" // val: 0
                               + to_hex(OpCode::RETURN) +         // opcode RETURN
                               "00"                               // Indirect flag
                               "0000"                             // ret offset 0
                               "00FF";                            // ret size offset 255

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    ASSERT_THAT(instructions, SizeIs(6));

    // MOV
    EXPECT_THAT(instructions.at(3),
                AllOf(Field(&Instruction::op_code, OpCode::MOV_8),
                      Field(&Instruction::operands,
                            ElementsAre(VariantWith<uint8_t>(1), VariantWith<uint8_t>(1), VariantWith<uint8_t>(2)))));

    auto trace = gen_trace_from_bytecode(bytecode);

    // Find the first row enabling the MOV selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_mov == 1; });
    EXPECT_EQ(row->main_ia, 255);
    EXPECT_EQ(row->main_ic, 255);

    validate_trace(std::move(trace), public_inputs);
}

// Positive test for SET and CAST opcodes
TEST_F(AvmExecutionTests, setAndCastOpcodes)
{
    std::string bytecode_hex = to_hex(OpCode::SET_16) +             // opcode SET
                               "00"                                 // Indirect flag
                               "0011"                               // dst_offset 17
                               + to_hex(AvmMemoryTag::U16) + "B813" // val 47123
                               + to_hex(OpCode::CAST_8) +           // opcode CAST
                               "00"                                 // Indirect flag
                               "11"                                 // addr a
                               "12"                                 // addr casted a
                               + to_hex(AvmMemoryTag::U8)           //
                               + to_hex(OpCode::SET_8) +            // opcode SET (for return size)
                               "00"                                 // Indirect flag
                               "FF"                                 // dst_offset=255
                               + to_hex(AvmMemoryTag::U32) + "00"   // val: 0
                               + to_hex(OpCode::RETURN) +           // opcode RETURN
                               "00"                                 // Indirect flag
                               "0000"                               // ret offset 0
                               "00FF";                              // ret size offset 255

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    ASSERT_THAT(instructions, SizeIs(4));

    // CAST
    EXPECT_THAT(instructions.at(1),
                AllOf(Field(&Instruction::op_code, OpCode::CAST_8),
                      Field(&Instruction::operands,
                            ElementsAre(VariantWith<uint8_t>(0),
                                        VariantWith<uint8_t>(17),
                                        VariantWith<uint8_t>(18),
                                        VariantWith<AvmMemoryTag>(AvmMemoryTag::U8)))));

    auto trace = gen_trace_from_bytecode(bytecode);

    // Find the first row enabling the cast selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_cast == 1; });
    EXPECT_EQ(row->main_ic, 19); // 0XB813 --> 0X13 = 19

    validate_trace(std::move(trace), public_inputs);
}

// Positive test with TO_RADIX_BE.
TEST_F(AvmExecutionTests, toRadixBeOpcodeBytes)
{
    std::string bytecode_hex =
        to_hex(OpCode::SET_8) +            // opcode SET
        "00"                               // Indirect flag
        "00"                               // dst_offset
        + to_hex(AvmMemoryTag::U32) + "00" // val
        + to_hex(OpCode::SET_8) +          // opcode SET
        "00"                               // Indirect flag
        "01"                               // dst_offset
        + to_hex(AvmMemoryTag::U32) + "01" // val
        + to_hex(OpCode::CALLDATACOPY) +   // opcode CALLDATACOPY
        "00"                               // Indirect flag
        "0000"                             // cd_offset
        "0001"                             // copy_size
        "0001"                             // dst_offset
        + to_hex(OpCode::SET_8) +          // opcode SET for indirect src
        "00"                               // Indirect flag
        "11"                               // dst_offset 17
        + to_hex(AvmMemoryTag::U32) + "01" // value 1 (i.e. where the src from calldata is copied)
        + to_hex(OpCode::SET_8) +          // opcode SET for indirect dst
        "00"                               // Indirect flag
        "15"                               // dst_offset 21
        + to_hex(AvmMemoryTag::U32) + "05" // value 5 (i.e. where the dst will be written to)
        + to_hex(OpCode::SET_8) +          // opcode SET for indirect dst
        "00"                               // Indirect flag
        "80"                               // radix_offset 80
        + to_hex(AvmMemoryTag::U32) + "02" // value 2 (i.e. radix 2 - perform bitwise decomposition)
        + to_hex(OpCode::TORADIXBE) +      // opcode TO_RADIX_BE
        "03"                               // Indirect flag
        "0011"                             // src_offset 17 (indirect)
        "0015"                             // dst_offset 21 (indirect)
        "0080"                             // radix_offset 80 (direct)
        "0100"                             // limbs: 256
        "00"                               // output_bits: false
        + to_hex(OpCode::SET_16) +         // opcode SET (for return size)
        "00"                               // Indirect flag
        "0200"                             // dst_offset=512
        + to_hex(AvmMemoryTag::U32) +      //
        "0100"                             // val: 256
        + to_hex(OpCode::RETURN) +         // opcode RETURN
        "00"                               // Indirect flag
        "0005"                             // ret offset 5
        "0200";                            // ret size offset 512

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    // Assign a vector that we will mutate internally in gen_trace to store the return values;
    std::vector<FF> returndata;
    ExecutionHints execution_hints;
    auto trace =
        gen_trace(bytecode, std::vector<FF>{ FF::modulus - FF(1) }, public_inputs, returndata, execution_hints);

    // Find the first row enabling the TORADIXBE selector
    // Expected output is bitwise decomposition of MODULUS - 1..could hardcode the result but it's a bit long
    size_t num_limbs = 256;
    std::vector<FF> expected_output(num_limbs);
    // Extract each bit.
    for (size_t i = 0; i < num_limbs; i++) {
        auto byte_index = num_limbs - i - 1;
        FF expected_limb = (FF::modulus - 1) >> i & 1;
        expected_output[byte_index] = expected_limb;
    }
    EXPECT_EQ(returndata, expected_output);

    validate_trace(std::move(trace), public_inputs, { FF::modulus - FF(1) }, returndata);
}

// Positive test with TO_RADIX_BE.
TEST_F(AvmExecutionTests, toRadixBeOpcodeBitsMode)
{
    std::string bytecode_hex = to_hex(OpCode::SET_8) +          // opcode SET
                               "00"                             // Indirect flag
                               "00"                             // dst_offset
                               + to_hex(AvmMemoryTag::U32)      //
                               + "00"                           // val
                               + to_hex(OpCode::SET_8) +        // opcode SET
                               "00"                             // Indirect flag
                               "01"                             // dst_offset
                               + to_hex(AvmMemoryTag::U32) +    //
                               "01"                             // val
                               + to_hex(OpCode::CALLDATACOPY) + // opcode CALLDATACOPY
                               "00"                             // Indirect flag
                               "0000"                           // cd_offset
                               "0001"                           // copy_size
                               "0001"                           // dst_offset
                               + to_hex(OpCode::SET_8) +        // opcode SET for indirect src
                               "00"                             // Indirect flag
                               "11"                             // dst_offset 17
                               + to_hex(AvmMemoryTag::U32) +    //
                               "01"                             // value 1 (i.e. where the src from calldata is copied)
                               + to_hex(OpCode::SET_8) +        // opcode SET for indirect dst
                               "00"                             // Indirect flag
                               "15"                             // dst_offset 21
                               + to_hex(AvmMemoryTag::U32) +    //
                               "05"                             // value 5 (i.e. where the dst will be written to)
                               + to_hex(OpCode::SET_8) +        // opcode SET for indirect dst
                               "00"                             // Indirect flag
                               "80"                             // radix_offset 80
                               + to_hex(AvmMemoryTag::U32) +    //
                               "02"                          // value 2 (i.e. radix 2 - perform bitwise decomposition)
                               + to_hex(OpCode::TORADIXBE) + // opcode TO_RADIX_BE
                               "03"                          // Indirect flag
                               "0011"                        // src_offset 17 (indirect)
                               "0015"                        // dst_offset 21 (indirect)
                               "0080"                        // radix_offset 80 (direct)
                               "0100"                        // limbs: 256
                               "01"                          // output_bits: true
                               + to_hex(OpCode::SET_16) +    // opcode SET (for return size)
                               "00"                          // Indirect flag
                               "0200"                        // dst_offset=512
                               + to_hex(AvmMemoryTag::U32) + //
                               "0100"                        // val: 256
                               + to_hex(OpCode::RETURN) +    // opcode RETURN
                               "00"                          // Indirect flag
                               "0005"                        // ret offset 5
                               "0200";                       // ret size offset 512

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    // Assign a vector that we will mutate internally in gen_trace to store the return values;
    std::vector<FF> returndata;
    ExecutionHints execution_hints;
    auto trace =
        gen_trace(bytecode, std::vector<FF>{ FF::modulus - FF(1) }, public_inputs, returndata, execution_hints);

    // Find the first row enabling the TORADIXBE selector
    // Expected output is bitwise decomposition of MODULUS - 1..could hardcode the result but it's a bit long
    size_t num_limbs = 256;
    std::vector<FF> expected_output(num_limbs);
    // Extract each bit.
    for (size_t i = 0; i < num_limbs; i++) {
        auto byte_index = num_limbs - i - 1;
        FF expected_limb = (FF::modulus - 1) >> i & 1;
        expected_output[byte_index] = expected_limb;
    }
    EXPECT_EQ(returndata, expected_output);

    validate_trace(std::move(trace), public_inputs, { FF::modulus - FF(1) }, returndata);
}

// // Positive test with SHA256COMPRESSION.
TEST_F(AvmExecutionTests, sha256CompressionOpcode)
{
    std::string bytecode_preamble;
    // Set operations for sha256 state
    // Test vectors taken from noir black_box_solver
    // State = Uint32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]),
    for (uint8_t i = 1; i <= 8; i++) {
        bytecode_preamble += to_hex(OpCode::SET_8) +                           // opcode SET
                             "00"                                              // Indirect flag
                             + to_hex<uint8_t>(i)                              // offset i
                             + to_hex(AvmMemoryTag::U32) + to_hex<uint8_t>(i); // val i
    }
    // Set operations for sha256 input
    // Test vectors taken from noir black_box_solver
    // Input = Uint32Array.from([1, 2, 3, 4, 5, 6, 7, 8]),
    for (uint8_t i = 1; i <= 16; i++) {
        bytecode_preamble += to_hex(OpCode::SET_8) +                           // opcode SET
                             "00"                                              // Indirect flag
                             + to_hex<uint8_t>(i + 8)                          // offset i + 8
                             + to_hex(AvmMemoryTag::U32) + to_hex<uint8_t>(i); // val i
    }
    std::string bytecode_hex = bytecode_preamble                    // Initial SET operations to store state and input
                               + to_hex(OpCode::SET_16) +           // opcode SET for indirect dst (output)
                               "00"                                 // Indirect flag
                               "0024"                               // dst_offset 36
                               + to_hex(AvmMemoryTag::U32) + "0100" // value 256 (i.e. where the dst will be written to)
                               + to_hex(OpCode::SET_8) +            // opcode SET for indirect state
                               "00"                                 // Indirect flag
                               "22"                                 // dst_offset 34
                               + to_hex(AvmMemoryTag::U32) + "01"   // value 1 (i.e. where the state will be read from)
                               + to_hex(OpCode::SET_8) +            // opcode SET for indirect input
                               "00"                                 // Indirect flag
                               "23"                                 // dst_offset 35
                               + to_hex(AvmMemoryTag::U32) + "09"   // value 9 (i.e. where the input will be read from)
                               + to_hex(OpCode::SHA256COMPRESSION) + // opcode SHA256COMPRESSION
                               "00"                                  // Indirect flag
                               "0100"                                // output offset
                               "0001"                                // state offset
                               "0009"                                // input offset
                               + to_hex(OpCode::SET_16) +            // opcode SET (for return size)
                               "00"                                  // Indirect flag
                               "0200"                                // dst_offset=512
                               + to_hex(AvmMemoryTag::U32) + "0008"  // val: 8
                               + to_hex(OpCode::RETURN) +            // opcode RETURN
                               "00"                                  // Indirect flag
                               "0100"                                // ret offset 256
                               "0200";                               // ret size offset 512

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    // Assign a vector that we will mutate internally in gen_trace to store the return values;
    std::vector<FF> calldata = std::vector<FF>();
    std::vector<FF> returndata = std::vector<FF>();
    // Test vector output taken from noir black_box_solver
    // Uint32Array.from([1862536192, 526086805, 2067405084, 593147560, 726610467, 813867028,
    // 4091010797,3974542186]),
    std::vector<FF> expected_output = { 1862536192, 526086805, 2067405084,    593147560,
                                        726610467,  813867028, 4091010797ULL, 3974542186ULL };
    ExecutionHints execution_hints;
    auto trace = gen_trace(bytecode, calldata, public_inputs, returndata, execution_hints);

    EXPECT_EQ(returndata, expected_output);

    validate_trace(std::move(trace), public_inputs, calldata, returndata);
}

// Positive test with POSEIDON2_PERM.
TEST_F(AvmExecutionTests, poseidon2PermutationOpCode)
{
    // Test vectors taken from barretenberg/permutation/test
    std::vector<FF> calldata{ FF(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789")),
                              FF(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789")),
                              FF(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789")),
                              FF(std::string("9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789")) };

    std::string bytecode_hex = to_hex(OpCode::SET_8) +              // opcode SET
                               "00"                                 // Indirect flag
                               "00"                                 // dst_offset
                               + to_hex(AvmMemoryTag::U32) + "00"   // val
                               + to_hex(OpCode::SET_8) +            // opcode SET
                               "00"                                 // Indirect flag
                               "01"                                 // dst_offset
                               + to_hex(AvmMemoryTag::U32) + "04"   // val
                               + to_hex(OpCode::CALLDATACOPY) +     // opcode CALL DATA COPY
                               "00"                                 // Indirect Flag
                               "0000"                               // cd_offset
                               "0001"                               // copy_size
                               "0001"                               // dst_offset 1
                               + to_hex(OpCode::SET_8) +            // opcode SET for indirect src (input)
                               "00"                                 // Indirect flag
                               "24"                                 // dst_offset 36
                               + to_hex(AvmMemoryTag::U32) + "01"   // value 1 (i.e. where the src will be read from)
                               + to_hex(OpCode::SET_8) +            // opcode SET for indirect dst (output)
                               "00"                                 // Indirect flag
                               "23"                                 // dst_offset 35
                               + to_hex(AvmMemoryTag::U32) + "09"   // value 9 (i.e. where the ouput will be written to)
                               + to_hex(OpCode::POSEIDON2PERM) +    // opcode POSEIDON2
                               "03"                                 // Indirect flag (first 2 operands indirect)
                               "0024"                               // input offset (indirect 36)
                               "0023"                               // output offset (indirect 35)
                               + to_hex(OpCode::SET_16) +           // opcode SET (for return size)
                               "00"                                 // Indirect flag
                               "0200"                               // dst_offset=512
                               + to_hex(AvmMemoryTag::U32) + "0004" // val: 4
                               + to_hex(OpCode::RETURN) +           // opcode RETURN
                               "00"                                 // Indirect flag
                               "0009"                               // ret offset 256
                               "0200";                              // ret size offset 512

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    // Assign a vector that we will mutate internally in gen_trace to store the return values;
    std::vector<FF> returndata = std::vector<FF>();
    std::vector<FF> expected_output = {
        FF(std::string("0x2bf1eaf87f7d27e8dc4056e9af975985bccc89077a21891d6c7b6ccce0631f95")),
        FF(std::string("0x0c01fa1b8d0748becafbe452c0cb0231c38224ea824554c9362518eebdd5701f")),
        FF(std::string("0x018555a8eb50cf07f64b019ebaf3af3c925c93e631f3ecd455db07bbb52bbdd3")),
        FF(std::string("0x0cbea457c91c22c6c31fd89afd2541efc2edf31736b9f721e823b2165c90fd41"))
    };
    ExecutionHints execution_hints;
    auto trace = gen_trace(bytecode, calldata, public_inputs, returndata, execution_hints);

    EXPECT_EQ(returndata, expected_output);

    validate_trace(std::move(trace), public_inputs, calldata, returndata);
}

// Positive test with Keccakf1600.
TEST_F(AvmExecutionTests, keccakf1600OpCode)
{
    // Test vectors taken noir/noir-repo/acvm-repo/blackbox_solver/src/hash.rs
    std::vector<uint64_t> state = {
        0xF1258F7940E1DDE7LLU, 0x84D5CCF933C0478ALLU, 0xD598261EA65AA9EELLU, 0xBD1547306F80494DLLU,
        0x8B284E056253D057LLU, 0xFF97A42D7F8E6FD4LLU, 0x90FEE5A0A44647C4LLU, 0x8C5BDA0CD6192E76LLU,
        0xAD30A6F71B19059CLLU, 0x30935AB7D08FFC64LLU, 0xEB5AA93F2317D635LLU, 0xA9A6E6260D712103LLU,
        0x81A57C16DBCF555FLLU, 0x43B831CD0347C826LLU, 0x01F22F1A11A5569FLLU, 0x05E5635A21D9AE61LLU,
        0x64BEFEF28CC970F2LLU, 0x613670957BC46611LLU, 0xB87C5A554FD00ECBLLU, 0x8C3EE88A1CCF32C8LLU,
        0x940C7922AE3A2614LLU, 0x1841F924A2C509E4LLU, 0x16F53526E70465C2LLU, 0x75F644E97F30A13BLLU,
        0xEAF1FF7B5CECA249LLU,
    };
    std::vector<FF> expected_output = {
        FF(0x2D5C954DF96ECB3CLLU), FF(0x6A332CD07057B56DLLU), FF(0x093D8D1270D76B6CLLU), FF(0x8A20D9B25569D094LLU),
        FF(0x4F9C4F99E5E7F156LLU), FF(0xF957B9A2DA65FB38LLU), FF(0x85773DAE1275AF0DLLU), FF(0xFAF4F247C3D810F7LLU),
        FF(0x1F1B9EE6F79A8759LLU), FF(0xE4FECC0FEE98B425LLU), FF(0x68CE61B6B9CE68A1LLU), FF(0xDEEA66C4BA8F974FLLU),
        FF(0x33C43D836EAFB1F5LLU), FF(0xE00654042719DBD9LLU), FF(0x7CF8A9F009831265LLU), FF(0xFD5449A6BF174743LLU),
        FF(0x97DDAD33D8994B40LLU), FF(0x48EAD5FC5D0BE774LLU), FF(0xE3B8C8EE55B7B03CLLU), FF(0x91A0226E649E42E9LLU),
        FF(0x900E3129E7BADD7BLLU), FF(0x202A9EC5FAA3CCE8LLU), FF(0x5B3402464E1C3DB6LLU), FF(0x609F4E62A44C1059LLU),
        FF(0x20D06CD26A8FBF5CLLU),
    };

    std::string bytecode_preamble;
    // Set operations for keccak state
    for (uint8_t i = 0; i < KECCAKF1600_INPUT_SIZE; i++) {
        bytecode_preamble += to_hex(OpCode::SET_64) +                                  // opcode SET
                             "00"                                                      // Indirect flag
                             + to_hex<uint16_t>(i + 1)                                 // dst offset
                             + to_hex(AvmMemoryTag::U64) + to_hex<uint64_t>(state[i]); // val i
    }

    // We use calldatacopy twice because we need to set up 4 inputs
    std::string bytecode_hex = bytecode_preamble +                // Initial SET operations to store state and input
                               to_hex(OpCode::SET_8) +            // opcode SET for indirect src (input)
                               "00"                               // Indirect flag
                               "24"                               // input_offset 36
                               + to_hex(AvmMemoryTag::U32) + "01" // value 1 (i.e. where the src will be read from)
                               + to_hex(OpCode::SET_16) +         // opcode SET for indirect dst (output)
                               "00"                               // Indirect flag
                               "0023"                             // dst_offset 35
                               + to_hex(AvmMemoryTag::U32) +
                               "0100"                          // value 256 (i.e. where the ouput will be written to)
                               + to_hex(OpCode::KECCAKF1600) + // opcode KECCAKF1600
                               "03"                            // Indirect flag (first 2 operands indirect)
                               "0023"                          // output offset (indirect 35)
                               "0024"                          // input offset (indirect 36)
                               + to_hex(OpCode::SET_16) +      // opcode SET (for return size)
                               "00"                            // Indirect flag
                               "0200"                          // dst_offset=512
                               + to_hex(AvmMemoryTag::U32) + "0019" // val: 25
                               + to_hex(OpCode::RETURN) +           // opcode RETURN
                               "00"                                 // Indirect flag
                               "0100"                               // ret offset 256
                               "0200";                              // ret size offset 512

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    // Assign a vector that we will mutate internally in gen_trace to store the return values;
    std::vector<FF> calldata = std::vector<FF>();
    std::vector<FF> returndata = std::vector<FF>();
    ExecutionHints execution_hints;
    auto trace = gen_trace(bytecode, calldata, public_inputs, returndata, execution_hints);

    EXPECT_EQ(returndata, expected_output);

    validate_trace(std::move(trace), public_inputs, calldata, returndata);
}

// Positive test with EmbeddedCurveAdd
TEST_F(AvmExecutionTests, embeddedCurveAddOpCode)
{
    // TODO: Look for hardcoded test vectors since bb is missing them
    grumpkin::g1::affine_element a = grumpkin::g1::affine_element::random_element();
    auto a_is_inf = a.is_point_at_infinity();
    grumpkin::g1::affine_element b = grumpkin::g1::affine_element::random_element();
    auto b_is_inf = b.is_point_at_infinity();
    grumpkin::g1::affine_element res = a + b;
    auto expected_output = std::vector<FF>{ res.x, res.y, res.is_point_at_infinity() };
    std::string bytecode_hex = to_hex(OpCode::SET_8) +          // opcode SET
                               "00"                             // Indirect flag
                               "00"                             // dst_offset
                               + to_hex(AvmMemoryTag::U32) +    //
                               "00"                             // val
                               + to_hex(OpCode::SET_8) +        // opcode SET
                               "00"                             // Indirect flag
                               "01"                             // dst_offset
                               + to_hex(AvmMemoryTag::U32) +    //
                               "06"                             // val
                               + to_hex(OpCode::CALLDATACOPY) + // Calldatacopy
                               "00"                             // Indirect flag
                               "0000"                           // cd_offset
                               "0001"                           // copy_size
                               "0000"                           // dst_offset
                               + to_hex(OpCode::CAST_8) +       // opcode CAST inf to U8
                               "00"                             // Indirect flag
                               "02"                             // a_is_inf
                               "02"                             // a_is_inf
                               + to_hex(AvmMemoryTag::U1)       //
                               + to_hex(OpCode::CAST_8) +       // opcode CAST inf to U8
                               "00"                             // Indirect flag
                               "05"                             // b_is_inf
                               "05"                             // b_is_inf
                               + to_hex(AvmMemoryTag::U1)       //
                               + to_hex(OpCode::SET_8) +        // opcode SET for direct src_length
                               "00"                             // Indirect flag
                               "06"                             // dst_offset
                               + to_hex(AvmMemoryTag::U32) +    //
                               "07"                             // value
                               + to_hex(OpCode::ECADD) +        // opcode ECADD
                               "0040"                           // Indirect flag (sixth operand indirect)
                               "0000"                           // lhs_x_offset (direct)
                               "0001"                           // lhs_y_offset (direct)
                               "0002"                           // lhs_is_inf_offset (direct)
                               "0003"                           // rhs_x_offset (direct)
                               "0004"                           // rhs_y_offset (direct)
                               "0005"                           // rhs_is_inf_offset (direct)
                               "0006"                           // output_offset (indirect) and resolves to 7
                               + to_hex(OpCode::SET_16) +       // opcode SET (for return size)
                               "00"                             // Indirect flag
                               "0200"                           // dst_offset=512
                               + to_hex(AvmMemoryTag::U32) +    //
                               "0003"                           // val: 3
                               + to_hex(OpCode::RETURN) +       // opcode RETURN
                               "00"                             // Indirect flag
                               "0007"                           // ret offset 7
                               "0200";                          // ret size offset 512

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    // Assign a vector that we will mutate internally in gen_trace to store the return values;
    std::vector<FF> returndata;
    std::vector<FF> calldata = { a.x, a.y, FF(a_is_inf ? 1 : 0), b.x, b.y, FF(b_is_inf ? 1 : 0) };
    ExecutionHints execution_hints;
    auto trace = gen_trace(bytecode, calldata, public_inputs, returndata, execution_hints);

    EXPECT_EQ(returndata, expected_output);

    validate_trace(std::move(trace), public_inputs, calldata, returndata);
}

// Positive test with MSM
TEST_F(AvmExecutionTests, msmOpCode)
{
    grumpkin::g1::affine_element a = grumpkin::g1::affine_element::random_element();
    FF a_is_inf = a.is_point_at_infinity();
    grumpkin::g1::affine_element b = grumpkin::g1::affine_element::random_element();
    FF b_is_inf = b.is_point_at_infinity();

    grumpkin::g1::Fr scalar_a = grumpkin::g1::Fr::random_element();
    FF scalar_a_lo = uint256_t::from_uint128(uint128_t(scalar_a));
    FF scalar_a_hi = uint256_t(scalar_a) >> 128;
    grumpkin::g1::Fr scalar_b = grumpkin::g1::Fr::random_element();
    FF scalar_b_lo = uint256_t::from_uint128(uint128_t(scalar_b));
    FF scalar_b_hi = uint256_t(scalar_b) >> 128;
    auto expected_result = a * scalar_a + b * scalar_b;
    std::vector<FF> expected_output = { expected_result.x, expected_result.y, expected_result.is_point_at_infinity() };
    // Send all the input as Fields and cast them to U8 later
    std::vector<FF> calldata = { FF(a.x),  FF(a.y),     a_is_inf,    FF(b.x),     FF(b.y),
                                 b_is_inf, scalar_a_lo, scalar_a_hi, scalar_b_lo, scalar_b_hi };

    std::string bytecode_hex = to_hex(OpCode::SET_8) +          // opcode SET
                               "00"                             // Indirect flag
                               "00"                             // dst_offset
                               + to_hex(AvmMemoryTag::U32) +    //
                               "00"                             // val
                               + to_hex(OpCode::SET_8) +        // opcode SET
                               "00"                             // Indirect flag
                               "01"                             //
                               + to_hex(AvmMemoryTag::U32) +    //
                               "0A"                             // val
                               + to_hex(OpCode::CALLDATACOPY) + // Calldatacopy
                               "00"                             // Indirect flag
                               "0000"                           // cd_offset 0
                               "0001"                           // copy_size (10 elements)
                               "0000"                           // dst_offset 0
                               + to_hex(OpCode::CAST_8) +       // opcode CAST inf to U8
                               "00"                             // Indirect flag
                               "02"                             // a_is_inf
                               "02"                             //
                               + to_hex(AvmMemoryTag::U1) +     //
                               to_hex(OpCode::CAST_8) +         // opcode CAST inf to U8
                               "00"                             // Indirect flag
                               "05"                             // b_is_inf
                               "05"                             //
                               + to_hex(AvmMemoryTag::U1) +     //
                               to_hex(OpCode::SET_8) +          // opcode SET for length
                               "00"                             // Indirect flag
                               "0b"                             // dst offset (11)
                               + to_hex(AvmMemoryTag::U32) +    //
                               "06"                             // Length of point elements (6)
                               + to_hex(OpCode::SET_8) +        // SET Indirects
                               "00"                             // Indirect flag
                               "0d"                             // dst offset +
                               + to_hex(AvmMemoryTag::U32) +    //
                               "00"                             // points offset
                               + to_hex(OpCode::SET_8) +        // SET Indirects
                               "00"                             // Indirect flag
                               "0e"                             // dst offset
                               + to_hex(AvmMemoryTag::U32) +    //
                               "06"                             // scalars offset
                               + to_hex(OpCode::SET_8) +        // SET Indirects
                               "00"                             // Indirect flag
                               "0f"                             // dst offset
                               + to_hex(AvmMemoryTag::U32) +    //
                               "0c"                             // output offset
                               + to_hex(OpCode::MSM) +          // opcode MSM
                               "07"                             // Indirect flag (first 3 indirect)
                               "000d"                           // points offset
                               "000e"                           // scalars offset
                               "000f"                           // output offset
                               "000b"                           // length offset
                               + to_hex(OpCode::SET_16) +       // opcode SET (for return size)
                               "00"                             // Indirect flag
                               "0200"                           // dst_offset=512
                               + to_hex(AvmMemoryTag::U32) +    //
                               "0003"                           // val: 3
                               + to_hex(OpCode::RETURN) +       // opcode RETURN
                               "00"                             // Indirect flag
                               "000c"                           // ret offset 12 (this overwrites)
                               "0200";                          // ret size offset 512

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    // Assign a vector that we will mutate internally in gen_trace to store the return values;
    std::vector<FF> returndata;
    ExecutionHints execution_hints;
    auto trace = gen_trace(bytecode, calldata, public_inputs, returndata, execution_hints);

    EXPECT_EQ(returndata, expected_output);

    validate_trace(std::move(trace), public_inputs, calldata, returndata);
}

// Positive test for Kernel Input opcodes
TEST_F(AvmExecutionTests, getEnvOpcode)
{
    std::string bytecode_hex =
        to_hex(OpCode::GETENVVAR_16) +                                      // opcode GETENVVAR_16
        "00"                                                                // Indirect flag
        "0001"                                                              // dst_offset
        + to_hex(static_cast<uint8_t>(EnvironmentVariable::ADDRESS))        // envvar ADDRESS
        + to_hex(OpCode::GETENVVAR_16) +                                    // opcode GETENVVAR_16
        "00"                                                                // Indirect flag
        "0002"                                                              // dst_offset
        + to_hex(static_cast<uint8_t>(EnvironmentVariable::SENDER))         // envvar SENDER
        + to_hex(OpCode::GETENVVAR_16) +                                    // opcode GETENVVAR_16
        "00"                                                                // Indirect flag
        "0003"                                                              // dst_offset
        + to_hex(static_cast<uint8_t>(EnvironmentVariable::TRANSACTIONFEE)) // envvar TRANSACTIONFEE
        + to_hex(OpCode::GETENVVAR_16) +                                    // opcode GETENVVAR_16
        "00"                                                                // Indirect flag
        "0004"                                                              // dst_offset
        + to_hex(static_cast<uint8_t>(EnvironmentVariable::CHAINID))        // envvar CHAINID
        + to_hex(OpCode::GETENVVAR_16) +                                    // opcode GETENVVAR_16
        "00"                                                                // Indirect flag
        "0005"                                                              // dst_offset
        + to_hex(static_cast<uint8_t>(EnvironmentVariable::VERSION))        // envvar VERSION
        + to_hex(OpCode::GETENVVAR_16) +                                    // opcode GETENVVAR_16
        "00"                                                                // Indirect flag
        "0006"                                                              // dst_offset
        + to_hex(static_cast<uint8_t>(EnvironmentVariable::BLOCKNUMBER))    // envvar BLOCKNUMBER
        + to_hex(OpCode::GETENVVAR_16) +                                    // opcode GETENVVAR_16
        "00"                                                                // Indirect flag
        "0007"                                                              // dst_offset
        + to_hex(static_cast<uint8_t>(EnvironmentVariable::TIMESTAMP))      // envvar TIMESTAMP
        + to_hex(OpCode::GETENVVAR_16) +                                    // opcode GETENVVAR_16
        "00"                                                                // Indirect flag
        "0008"                                                              // dst_offset
        + to_hex(static_cast<uint8_t>(EnvironmentVariable::FEEPERL2GAS))    // envvar FEEPERL2GAS
        + to_hex(OpCode::GETENVVAR_16) +                                    // opcode GETENVVAR_16
        "00"                                                                // Indirect flag
        "0009"                                                              // dst_offset
        + to_hex(static_cast<uint8_t>(EnvironmentVariable::FEEPERDAGAS))    // envvar FEEPERDAGAS
        + to_hex(OpCode::GETENVVAR_16) +                                    // opcode GETENVVAR_16
        "00"                                                                // Indirect flag
        "000A"                                                              // dst_offset
        + to_hex(static_cast<uint8_t>(EnvironmentVariable::ISSTATICCALL))   // envvar ISSTATICCALL
        + to_hex(OpCode::SET_16) +                                          // opcode SET (for return size)
        "00"                                                                // Indirect flag
        "0200"                                                              // dst_offset=512
        + to_hex(AvmMemoryTag::U32) +                                       // tag U32
        "000A"                                                              // val: 12
        + to_hex(OpCode::RETURN) +                                          // opcode RETURN
        "00"                                                                // Indirect flag
        "0001"                                                              // ret offset 1
        "0200";                                                             // ret size offset 512

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    ASSERT_THAT(instructions, SizeIs(12));

    // ADDRESS
    EXPECT_THAT(instructions.at(0),
                AllOf(Field(&Instruction::op_code, OpCode::GETENVVAR_16),
                      Field(&Instruction::operands,
                            ElementsAre(VariantWith<uint8_t>(0),
                                        VariantWith<uint16_t>(1),
                                        VariantWith<uint8_t>(static_cast<uint8_t>(EnvironmentVariable::ADDRESS))))));

    // SENDER
    EXPECT_THAT(instructions.at(1),
                AllOf(Field(&Instruction::op_code, OpCode::GETENVVAR_16),
                      Field(&Instruction::operands,
                            ElementsAre(VariantWith<uint8_t>(0),
                                        VariantWith<uint16_t>(2),
                                        VariantWith<uint8_t>(static_cast<uint8_t>(EnvironmentVariable::SENDER))))));

    // TRANSACTIONFEE
    EXPECT_THAT(
        instructions.at(2),
        AllOf(Field(&Instruction::op_code, OpCode::GETENVVAR_16),
              Field(&Instruction::operands,
                    ElementsAre(VariantWith<uint8_t>(0),
                                VariantWith<uint16_t>(3),
                                VariantWith<uint8_t>(static_cast<uint8_t>(EnvironmentVariable::TRANSACTIONFEE))))));

    // CHAINID
    EXPECT_THAT(instructions.at(3),
                AllOf(Field(&Instruction::op_code, OpCode::GETENVVAR_16),
                      Field(&Instruction::operands,
                            ElementsAre(VariantWith<uint8_t>(0),
                                        VariantWith<uint16_t>(4),
                                        VariantWith<uint8_t>(static_cast<uint8_t>(EnvironmentVariable::CHAINID))))));

    // VERSION
    EXPECT_THAT(instructions.at(4),
                AllOf(Field(&Instruction::op_code, OpCode::GETENVVAR_16),
                      Field(&Instruction::operands,
                            ElementsAre(VariantWith<uint8_t>(0),
                                        VariantWith<uint16_t>(5),
                                        VariantWith<uint8_t>(static_cast<uint8_t>(EnvironmentVariable::VERSION))))));

    // BLOCKNUMBER
    EXPECT_THAT(
        instructions.at(5),
        AllOf(Field(&Instruction::op_code, OpCode::GETENVVAR_16),
              Field(&Instruction::operands,
                    ElementsAre(VariantWith<uint8_t>(0),
                                VariantWith<uint16_t>(6),
                                VariantWith<uint8_t>(static_cast<uint8_t>(EnvironmentVariable::BLOCKNUMBER))))));

    // TIMESTAMP
    EXPECT_THAT(instructions.at(6),
                AllOf(Field(&Instruction::op_code, OpCode::GETENVVAR_16),
                      Field(&Instruction::operands,
                            ElementsAre(VariantWith<uint8_t>(0),
                                        VariantWith<uint16_t>(7),
                                        VariantWith<uint8_t>(static_cast<uint8_t>(EnvironmentVariable::TIMESTAMP))))));

    // FEEPERL2GAS
    EXPECT_THAT(
        instructions.at(7),
        AllOf(Field(&Instruction::op_code, OpCode::GETENVVAR_16),
              Field(&Instruction::operands,
                    ElementsAre(VariantWith<uint8_t>(0),
                                VariantWith<uint16_t>(8),
                                VariantWith<uint8_t>(static_cast<uint8_t>(EnvironmentVariable::FEEPERL2GAS))))));

    // FEEPERDAGAS
    EXPECT_THAT(
        instructions.at(8),
        AllOf(Field(&Instruction::op_code, OpCode::GETENVVAR_16),
              Field(&Instruction::operands,
                    ElementsAre(VariantWith<uint8_t>(0),
                                VariantWith<uint16_t>(9),
                                VariantWith<uint8_t>(static_cast<uint8_t>(EnvironmentVariable::FEEPERDAGAS))))));

    // ISSTATICCALL
    EXPECT_THAT(
        instructions.at(9),
        AllOf(Field(&Instruction::op_code, OpCode::GETENVVAR_16),
              Field(&Instruction::operands,
                    ElementsAre(VariantWith<uint8_t>(0),
                                VariantWith<uint16_t>(10),
                                VariantWith<uint8_t>(static_cast<uint8_t>(EnvironmentVariable::ISSTATICCALL))))));

    // Public inputs for the circuit
    std::vector<FF> calldata;
    auto [contract_class_id, contract_instance] = gen_test_contract_hint(bytecode);

    FF sender = 1;
    FF address = contract_instance.address;
    FF transaction_fee = 5;
    FF chainid = 6;
    FF version = 7;
    FF blocknumber = 8;
    FF timestamp = 9;
    FF feeperl2gas = 10;
    FF feeperdagas = 11;
    FF is_static_call = 1;

    // The return data for this test should be a the opcodes in sequence, as the opcodes dst address lines up with
    // this array The returndata call above will then return this array
    std::vector<FF> const expected_returndata = {
        address,     sender,    transaction_fee, chainid,     version,
        blocknumber, timestamp, feeperl2gas,     feeperdagas, is_static_call,
    };

    // Set up public inputs to contain the above values
    // TODO: maybe have a javascript like object construction so that this is readable
    // Reduce the amount of times we have similar code to this
    //
    public_inputs.public_app_logic_call_requests[0].contract_address = address;
    public_inputs.public_app_logic_call_requests[0].msg_sender = sender;
    public_inputs.transaction_fee = transaction_fee;
    public_inputs.public_app_logic_call_requests[0].is_static_call = is_static_call > FF::zero();

    // Global variables
    public_inputs.global_variables.chain_id = chainid;
    public_inputs.global_variables.version = version;
    public_inputs.global_variables.block_number = blocknumber;
    public_inputs.global_variables.timestamp = timestamp;

    // Global variables - Gas
    public_inputs.global_variables.gas_fees.fee_per_da_gas = feeperdagas;
    public_inputs.global_variables.gas_fees.fee_per_l2_gas = feeperl2gas;

    std::vector<FF> returndata;
    ExecutionHints execution_hints;
    auto trace = gen_trace(bytecode, calldata, public_inputs, returndata, execution_hints);

    // Validate returndata
    EXPECT_EQ(returndata, expected_returndata);

    // Validate that the opcode read the correct value into ia
    // Check address
    auto address_row =
        std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_address == 1; });
    EXPECT_EQ(address_row->main_ia, address);

    // Check sender
    auto sender_row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_sender == 1; });
    EXPECT_EQ(sender_row->main_ia, sender);

    // Check transactionfee
    auto transaction_fee_row =
        std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_transaction_fee == 1; });
    EXPECT_EQ(transaction_fee_row->main_ia, transaction_fee);

    // Check chain id
    auto chainid_row =
        std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_chain_id == 1; });
    EXPECT_EQ(chainid_row->main_ia, chainid);

    // Check version
    auto version_row =
        std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_version == 1; });
    EXPECT_EQ(version_row->main_ia, version);

    // Check blocknumber
    auto blocknumber_row =
        std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_block_number == 1; });
    EXPECT_EQ(blocknumber_row->main_ia, blocknumber);

    // Check timestamp
    auto timestamp_row =
        std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_timestamp == 1; });
    EXPECT_EQ(timestamp_row->main_ia, timestamp);

    // Check feeperdagas
    auto feeperdagas_row =
        std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_fee_per_da_gas == 1; });
    EXPECT_EQ(feeperdagas_row->main_ia, feeperdagas);

    // Check feeperl2gas
    auto feeperl2gas_row =
        std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_fee_per_l2_gas == 1; });
    EXPECT_EQ(feeperl2gas_row->main_ia, feeperl2gas);

    // Check is_static_call
    auto is_static_call_row =
        std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_is_static_call == 1; });
    EXPECT_EQ(is_static_call_row->main_ia, is_static_call);

    validate_trace(std::move(trace), public_inputs, calldata, returndata);
}

// TODO(9395): allow this intruction to raise error flag in main.pil
// TEST_F(AvmExecutionTests, getEnvOpcodeBadEnum)
//{
//    std::string bytecode_hex =
//        to_hex(OpCode::GETENVVAR_16) +                                          // opcode GETENVVAR_16
//        "00"                                                                    // Indirect flag
//        + to_hex(static_cast<uint8_t>(EnvironmentVariable::MAX_ENV_VAR)) +      // envvar ADDRESS
//        "0001";                                                                 // dst_offset
//
//    auto bytecode = hex_to_bytes(bytecode_hex);
//    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
//    ASSERT_TRUE(is_ok(error));
//
//    // Public inputs for the circuit
//    std::vector<FF> calldata;
//    std::vector<FF> returndata;
//    ExecutionHints execution_hints;
//    auto trace = gen_trace(bytecode, calldata, public_inputs, returndata, execution_hints);
//
//    // Bad enum should raise error flag
//    auto address_row =
//        std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_address == 1; });
//    EXPECT_EQ(address_row->main_op_err, FF(1));
//
//    validate_trace(std::move(trace), convert_public_inputs(public_inputs), calldata, returndata);
//}

// Positive test for L2GASLEFT opcode
TEST_F(AvmExecutionTests, l2GasLeft)
{
    std::string bytecode_hex = to_hex(OpCode::SET_16) +             // opcode SET
                               "00"                                 // Indirect flag
                               "0011"                               // dst_offset 17
                               + to_hex(AvmMemoryTag::U32) + "0101" // val 257
                               + to_hex(OpCode::GETENVVAR_16) +     // opcode L2GASLEFT
                               "01"                                 // Indirect flag
                               "0011"                               // dst_offset (indirect addr: 17)
                               + to_hex(static_cast<uint8_t>(EnvironmentVariable::L2GASLEFT)) +
                               to_hex(OpCode::SET_8) +            // opcode SET (for return size)
                               "00"                               // Indirect flag
                               "FF"                               // dst_offset=255
                               + to_hex(AvmMemoryTag::U32) + "00" // val: 0
                               + to_hex(OpCode::RETURN) +         // opcode RETURN
                               "00"                               // Indirect flag
                               "0000"                             // ret offset 0
                               "00FF";                            // ret size offset 255

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    ASSERT_THAT(instructions, SizeIs(4));

    // L2GASLEFT
    EXPECT_THAT(instructions.at(1),
                AllOf(Field(&Instruction::op_code, OpCode::GETENVVAR_16),
                      Field(&Instruction::operands,
                            ElementsAre(VariantWith<uint8_t>(1),
                                        VariantWith<uint16_t>(17),
                                        VariantWith<uint8_t>(static_cast<uint8_t>(EnvironmentVariable::L2GASLEFT))))));

    auto trace = gen_trace_from_bytecode(bytecode);

    // Find the first row enabling the L2GASLEFT selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_l2gasleft == 1; });

    uint32_t expected_rem_gas = DEFAULT_INITIAL_L2_GAS -
                                static_cast<uint32_t>(GAS_COST_TABLE.at(OpCode::SET_8).base_l2_gas_fixed_table) -
                                static_cast<uint32_t>(GAS_COST_TABLE.at(OpCode::GETENVVAR_16).base_l2_gas_fixed_table);

    EXPECT_EQ(row->main_ia, expected_rem_gas);
    EXPECT_EQ(row->main_mem_addr_a, 257); // Resolved direct address: 257

    validate_trace(std::move(trace), public_inputs);
}

// Positive test for DAGASLEFT opcode
TEST_F(AvmExecutionTests, daGasLeft)
{
    std::string bytecode_hex = to_hex(OpCode::MOV_8) +          // opcode MOV
                               "00"                             // Indirect flag
                               "07"                             // addr a 7
                               "09"                             // addr b 9
                               + to_hex(OpCode::GETENVVAR_16) + // opcode DAGASLEFT
                               "00"                             // Indirect flag
                               "0027"                           // dst_offset (indirect addr: 17)
                               + to_hex(static_cast<uint8_t>(EnvironmentVariable::DAGASLEFT)) +
                               to_hex(OpCode::SET_8) +            // opcode SET (for return size)
                               "00"                               // Indirect flag
                               "FF"                               // dst_offset=255
                               + to_hex(AvmMemoryTag::U32) + "00" // val: 0
                               + to_hex(OpCode::RETURN) +         // opcode RETURN
                               "00"                               // Indirect flag
                               "0000"                             // ret offset 0
                               "00FF";                            // ret size offset 255

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    ASSERT_THAT(instructions, SizeIs(4));

    // DAGASLEFT
    EXPECT_THAT(instructions.at(1),
                AllOf(Field(&Instruction::op_code, OpCode::GETENVVAR_16),
                      Field(&Instruction::operands,
                            ElementsAre(VariantWith<uint8_t>(0),
                                        VariantWith<uint16_t>(39),
                                        VariantWith<uint8_t>(static_cast<uint8_t>(EnvironmentVariable::DAGASLEFT))))));

    auto trace = gen_trace_from_bytecode(bytecode);

    // Find the first row enabling the DAGASLEFT selector
    auto row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_dagasleft == 1; });

    uint32_t expected_rem_gas = DEFAULT_INITIAL_DA_GAS -
                                static_cast<uint32_t>(GAS_COST_TABLE.at(OpCode::MOV_8).base_da_gas_fixed_table) -
                                static_cast<uint32_t>(GAS_COST_TABLE.at(OpCode::GETENVVAR_16).base_da_gas_fixed_table);

    EXPECT_EQ(row->main_ia, expected_rem_gas);
    EXPECT_EQ(row->main_mem_addr_a, 39);

    validate_trace(std::move(trace), public_inputs);
}

// Should throw whenever the wrong number of public inputs are provided
// TEST_F(AvmExecutionTests, ExecutorThrowsWithIncorrectNumberOfPublicInputs)
// {
//     std::string bytecode_hex = to_hex(OpCode::GETENVVAR_16) + // opcode GETENVVAR_16(sender)
//                                "00"                           // Indirect flag
//                                + to_hex(static_cast<uint8_t>(EnvironmentVariable::SENDER)) + "0007"; // addr 7
//
//     std::vector<FF> calldata = {};
//     std::vector<FF> returndata = {};
//     std::vector<FF> public_inputs = { 1 };
//
//     auto bytecode = hex_to_bytes(bytecode_hex);
//     auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
//    ASSERT_TRUE(is_ok(error));
//
//     ExecutionHints execution_hints;
//     EXPECT_THROW_WITH_MESSAGE(gen_trace(bytecode, calldata, public_inputs, returndata, execution_hints),
//                               "Public inputs vector is not of PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH");
// }

TEST_F(AvmExecutionTests, kernelOutputEmitOpcodes)
{
    // Skipping this test for now
    GTEST_SKIP();
    // Set values into the first register to emit
    std::string bytecode_hex = to_hex(OpCode::SET_8) +                // opcode Set
                               "00"                                   // Indirect flag
                               "02"                                   // dst_offset 2
                               + to_hex(AvmMemoryTag::U32) +          // tag U32
                               "00"                                   // value 0
                               + to_hex(OpCode::SET_8) +              // opcode Set
                               "00"                                   // Indirect flag
                               "01"                                   // dst_offset 1
                               + to_hex(AvmMemoryTag::U32) +          // tag U32
                               "01"                                   // value 1
                               + to_hex(OpCode::CAST_8) +             // opcode CAST (to field)
                               "00"                                   // Indirect flag
                               "01"                                   // dst 1
                               "01"                                   // dst 1
                               + to_hex(AvmMemoryTag::FF)             // tag FF
                               + to_hex(OpCode::EMITNOTEHASH) +       // opcode EMITNOTEHASH
                               "00"                                   // Indirect flag
                               "0001"                                 // src offset 1
                               + to_hex(OpCode::EMITNULLIFIER) +      // opcode EMITNULLIFIER
                               "00"                                   // Indirect flag
                               "0001"                                 // src offset 1
                               + to_hex(OpCode::EMITUNENCRYPTEDLOG) + // opcode EMITUNENCRYPTEDLOG
                               "00"                                   // Indirect flag
                               "0001"                                 // src offset 1
                               "0002"                                 // src size offset
                               + to_hex(OpCode::SENDL2TOL1MSG) +      // opcode SENDL2TOL1MSG
                               "00"                                   // Indirect flag
                               "0001"                                 // src offset 1
                               "0001"                                 // src offset 1
                               + to_hex(OpCode::RETURN) +             // opcode RETURN
                               "00"                                   // Indirect flag
                               "0000"                                 // ret offset 0
                               "0000";                                // ret size 0

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    ASSERT_THAT(instructions, SizeIs(8));

    std::vector<FF> calldata = {};
    std::vector<FF> returndata = {};
    ExecutionHints execution_hints;
    auto trace = gen_trace(bytecode, calldata, public_inputs, returndata, execution_hints);

    // CHECK EMIT NOTE HASH
    // Check output data + side effect counters have been set correctly
    auto emit_note_hash_row =
        std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_emit_note_hash == 1; });
    EXPECT_EQ(emit_note_hash_row->main_ia, 1);
    // EXPECT_EQ(emit_note_hash_row->main_side_effect_counter, 0);

    // Get the row of the first note hash out
    // uint32_t emit_note_hash_out_offset = START_EMIT_NOTE_HASH_WRITE_OFFSET;
    // auto emit_note_hash_kernel_out_row = std::ranges::find_if(
    //     trace.begin(), trace.end(), [&](Row r) { return r.main_clk == emit_note_hash_out_offset; });
    // EXPECT_EQ(emit_note_hash_kernel_out_row->main_kernel_value_out, 1);
    // TODO(#8287)
    // EXPECT_EQ(emit_note_hash_kernel_out_row->main_kernel_side_effect_out, 0);
    // feed_output(emit_note_hash_out_offset, 1, 0, 0);

    // CHECK EMIT NULLIFIER
    auto emit_nullifier_row =
        std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_emit_nullifier == 1; });
    ASSERT_TRUE(emit_nullifier_row != trace.end());
    EXPECT_EQ(emit_nullifier_row->main_ia, 1);
    // EXPECT_EQ(emit_nullifier_row->main_side_effect_counter, 1);

    // uint32_t emit_nullifier_out_offset = START_EMIT_NULLIFIER_WRITE_OFFSET;
    // auto emit_nullifier_kernel_out_row = std::ranges::find_if(
    //     trace.begin(), trace.end(), [&](Row r) { return r.main_clk == emit_nullifier_out_offset; });
    // ASSERT_TRUE(emit_nullifier_kernel_out_row != trace.end());
    // EXPECT_EQ(emit_nullifier_kernel_out_row->main_kernel_value_out, 1);
    // EXPECT_EQ(emit_nullifier_kernel_out_row->main_kernel_side_effect_out, 1);
    // feed_output(emit_nullifier_out_offset, 1, 1, 0);

    // CHECK EMIT UNENCRYPTED LOG
    // Unencrypted logs are hashed with sha256 and truncated to 31 bytes - and then padded back to 32 bytes
    auto [contract_class_id, contract_instance] = gen_test_contract_hint(bytecode);
    FF address = AvmBytecodeTraceBuilder::compute_address_from_instance(contract_instance);

    std::vector<uint8_t> contract_address_bytes = address.to_buffer();
    // Test log is empty, so just have to hash the contract address with 0
    //
    std::vector<uint8_t> bytes_to_hash;
    bytes_to_hash.insert(bytes_to_hash.end(),
                         std::make_move_iterator(contract_address_bytes.begin()),
                         std::make_move_iterator(contract_address_bytes.end()));
    uint32_t num_bytes = 0;
    std::vector<uint8_t> log_size_bytes = to_buffer(num_bytes);
    // Add the log size to the hash to bytes
    bytes_to_hash.insert(bytes_to_hash.end(),
                         std::make_move_iterator(log_size_bytes.begin()),
                         std::make_move_iterator(log_size_bytes.end()));

    std::array<uint8_t, 32> output = crypto::sha256(bytes_to_hash);
    // Truncate the hash to 31 bytes so it will be a valid field element
    FF expected_hash = FF(from_buffer<uint256_t>(output.data()) >> 8);

    auto emit_log_row =
        std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_emit_unencrypted_log == 1; });
    ASSERT_TRUE(emit_log_row != trace.end());

    EXPECT_EQ(emit_log_row->main_ia, expected_hash);
    // EXPECT_EQ(emit_log_row->main_side_effect_counter, 2);
    // Value is 40 = 32 * log_length + 40 (and log_length is 0 in this case).
    EXPECT_EQ(emit_log_row->main_ib, 40);

    uint32_t emit_log_out_offset = START_EMIT_UNENCRYPTED_LOG_WRITE_OFFSET;
    auto emit_log_kernel_out_row =
        std::ranges::find_if(trace.begin(), trace.end(), [&](Row r) { return r.main_clk == emit_log_out_offset; });
    ASSERT_TRUE(emit_log_kernel_out_row != trace.end());
    EXPECT_EQ(emit_log_kernel_out_row->main_kernel_value_out, expected_hash);
    EXPECT_EQ(emit_log_kernel_out_row->main_kernel_side_effect_out, 2);
    EXPECT_EQ(emit_log_kernel_out_row->main_kernel_metadata_out, 40);
    // feed_output(emit_log_out_offset, expected_hash, 2, 40);

    // CHECK SEND L2 TO L1 MSG
    auto send_row =
        std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_emit_l2_to_l1_msg == 1; });
    ASSERT_TRUE(send_row != trace.end());
    EXPECT_EQ(send_row->main_ia, 1);
    EXPECT_EQ(send_row->main_ib, 1);
    // EXPECT_EQ(send_row->main_side_effect_counter, 3);

    auto msg_out_row = std::ranges::find_if(
        trace.begin(), trace.end(), [&](Row r) { return r.main_clk == START_EMIT_L2_TO_L1_MSG_WRITE_OFFSET; });
    ASSERT_TRUE(msg_out_row != trace.end());
    EXPECT_EQ(msg_out_row->main_kernel_value_out, 1);
    EXPECT_EQ(msg_out_row->main_kernel_side_effect_out, 3);
    EXPECT_EQ(msg_out_row->main_kernel_metadata_out, 1);
    // feed_output(START_EMIT_L2_TO_L1_MSG_WRITE_OFFSET, 1, 3, 1);

    validate_trace(std::move(trace), public_inputs);
}

// SLOAD
TEST_F(AvmExecutionTests, kernelOutputStorageLoadOpcodeSimple)
{
    GTEST_SKIP();
    // Sload from a value that has not previously been written to will require a hint to process
    std::string bytecode_hex = to_hex(OpCode::SET_8) +            // opcode SET
                               "00"                               // Indirect flag
                               "01"                               // dst_offset 1
                               + to_hex(AvmMemoryTag::U32) + "09" // value 9
                               + to_hex(OpCode::CAST_8) +         // opcode CAST (Cast set to field)
                               "00"                               // Indirect flag
                               "01"                               // dst 1
                               "01"                               // dst 1
                               + to_hex(AvmMemoryTag::FF)         //
                               + to_hex(OpCode::SLOAD) +          // opcode SLOAD
                               "00"                               // Indirect flag
                               "0001"                             // slot offset 1
                               "0002"                             // write storage value to offset 2
                               + to_hex(OpCode::SET_8) +          // opcode SET (for return size)
                               "00"                               // Indirect flag
                               "FF"                               // dst_offset=255
                               + to_hex(AvmMemoryTag::U32) +      //
                               "00"                               // val: 0
                               + to_hex(OpCode::RETURN) +         // opcode RETURN
                               "00"                               // Indirect flag
                               "0000"                             // ret offset 0
                               "00FF";                            // ret size offset 255

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    ASSERT_THAT(instructions, SizeIs(5));

    std::vector<FF> calldata = {};
    std::vector<FF> returndata = {};

    // Generate Hint for Sload operation
    // side effect counter 0 = value 42
    auto execution_hints = ExecutionHints().with_storage_value_hints({ { 0, 42 } });

    auto trace = gen_trace(bytecode, calldata, public_inputs, returndata, execution_hints);

    // CHECK SLOAD
    // Check output data + side effect counters have been set correctly
    auto sload_row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_sload == 1; });
    EXPECT_EQ(sload_row->main_ia, 42); // Read value
    EXPECT_EQ(sload_row->main_ib, 9);  // Storage slot
    // EXPECT_EQ(sload_row->main_side_effect_counter, 0);

    // Get the row of the first read storage read out
    uint32_t sload_out_offset = START_SLOAD_WRITE_OFFSET;
    auto sload_kernel_out_row =
        std::ranges::find_if(trace.begin(), trace.end(), [&](Row r) { return r.main_clk == sload_out_offset; });
    EXPECT_EQ(sload_kernel_out_row->main_kernel_value_out, 42); // value
    EXPECT_EQ(sload_kernel_out_row->main_kernel_side_effect_out, 0);
    EXPECT_EQ(sload_kernel_out_row->main_kernel_metadata_out, 9); // slot
    // feed_output(sload_out_offset, 42, 0, 9);
    validate_trace(std::move(trace), public_inputs);
}

// SSTORE
TEST_F(AvmExecutionTests, kernelOutputStorageStoreOpcodeSimple)
{
    GTEST_SKIP();
    // SSTORE, write 2 elements of calldata to dstOffset 1 and 2.
    std::vector<FF> calldata = { 42, 123, 9, 10 };
    std::string bytecode_hex = to_hex(OpCode::SET_8) +          // opcode SET
                               "00"                             // Indirect flag
                               "00"                             // dst_offset
                               + to_hex(AvmMemoryTag::U32)      //
                               + "00"                           // val
                               + to_hex(OpCode::SET_8) +        // opcode SET
                               "00"                             // Indirect flag
                               "01"                             //
                               + to_hex(AvmMemoryTag::U32) +    //
                               "04"                             // val
                               + to_hex(OpCode::CALLDATACOPY) + // opcode CALLDATACOPY
                               "00"                             // Indirect flag
                               "0000"                           // cd_offset
                               "0001"                           // copy_size
                               "0001"                           // dst_offset, (i.e. where we store the addr)
                               + to_hex(OpCode::SSTORE) +       // opcode SSTORE
                               "00"                             // Indirect flag
                               "0001"                           // src offset
                               "0003"                           // slot offset
                               + to_hex(OpCode::SET_16) +       // opcode SET (for return size)
                               "00"                             // Indirect flag
                               "0200"                           // dst_offset=512
                               + to_hex(AvmMemoryTag::U32) +    // tag U32
                               "0000"                           // val: 0
                               + to_hex(OpCode::RETURN) +       // opcode RETURN
                               "00"                             // Indirect flag
                               "0000"                           // ret offset 0
                               "0200";                          // ret size offset 512

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    std::vector<FF> returndata;

    ExecutionHints execution_hints;
    auto trace = gen_trace(bytecode, calldata, public_inputs, returndata, execution_hints);
    // CHECK SSTORE
    auto sstore_row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_sstore == 1; });
    EXPECT_EQ(sstore_row->main_ia, 42); // Read value
    EXPECT_EQ(sstore_row->main_ib, 9);  // Storage slot
    // EXPECT_EQ(sstore_row->main_side_effect_counter, 0);

    // Get the row of the first storage write out
    uint32_t sstore_out_offset = START_SSTORE_WRITE_OFFSET;
    auto sstore_kernel_out_row =
        std::ranges::find_if(trace.begin(), trace.end(), [&](Row r) { return r.main_clk == sstore_out_offset; });

    auto value_out = sstore_kernel_out_row->main_kernel_value_out;
    auto side_effect_out = sstore_kernel_out_row->main_kernel_side_effect_out;
    auto metadata_out = sstore_kernel_out_row->main_kernel_metadata_out;
    EXPECT_EQ(value_out, 42); // value
    EXPECT_EQ(side_effect_out, 0);
    EXPECT_EQ(metadata_out, 9); // slot

    // feed_output(sstore_out_offset, value_out, side_effect_out, metadata_out);
    validate_trace(std::move(trace), public_inputs, calldata);
}

// SLOAD and SSTORE
TEST_F(AvmExecutionTests, kernelOutputStorageOpcodes)
{
    GTEST_SKIP();
    // Sload from a value that has not previously been written to will require a hint to process
    std::string bytecode_hex = to_hex(OpCode::SET_8) +       // opcode SET
                               "00"                          // Indirect flag
                               "01"                          // dst_offset 1
                               + to_hex(AvmMemoryTag::U32) + //
                               "09"                          // value 9
                               // Cast set to field
                               + to_hex(OpCode::CAST_8) +         // opcode CAST
                               "00"                               // Indirect flag
                               "01"                               // dst 1
                               "01"                               // dst 1
                               + to_hex(AvmMemoryTag::FF)         //
                               + to_hex(OpCode::SLOAD) +          // opcode SLOAD
                               "00"                               // Indirect flag
                               "0001"                             // slot offset 1
                               "0002"                             // write storage value to offset 2
                               + to_hex(OpCode::SSTORE) +         // opcode SSTORE
                               "00"                               // Indirect flag
                               "0002"                             // src offset 2 (since the sload writes to 2)
                               "0001"                             // slot offset is 1
                               + to_hex(OpCode::SET_8) +          // opcode SET (for return size)
                               "00"                               // Indirect flag
                               "FF"                               // dst_offset=255
                               + to_hex(AvmMemoryTag::U32) + "00" // val: 0
                               + to_hex(OpCode::RETURN) +         // opcode RETURN
                               "00"                               // Indirect flag
                               "0000"                             // ret offset 0
                               "00FF";                            // ret size offset 255

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    ASSERT_THAT(instructions, SizeIs(6));

    std::vector<FF> calldata = {};
    std::vector<FF> returndata = {};

    // Generate Hint for Sload operation
    // side effect counter 0 = value 42
    auto execution_hints = ExecutionHints().with_storage_value_hints({ { 0, 42 } });

    auto trace = gen_trace(bytecode, calldata, public_inputs, returndata, execution_hints);

    // CHECK SLOAD
    // Check output data + side effect counters have been set correctly
    auto sload_row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_sload == 1; });
    EXPECT_EQ(sload_row->main_ia, 42); // Read value
    EXPECT_EQ(sload_row->main_ib, 9);  // Storage slot
    // EXPECT_EQ(sload_row->main_side_effect_counter, 0);

    // Get the row of the first storage read out
    uint32_t sload_out_offset = START_SLOAD_WRITE_OFFSET;
    auto sload_kernel_out_row =
        std::ranges::find_if(trace.begin(), trace.end(), [&](Row r) { return r.main_clk == sload_out_offset; });
    EXPECT_EQ(sload_kernel_out_row->main_kernel_value_out, 42); // value
    EXPECT_EQ(sload_kernel_out_row->main_kernel_side_effect_out, 0);
    EXPECT_EQ(sload_kernel_out_row->main_kernel_metadata_out, 9); // slot
    // feed_output(sload_out_offset, 42, 0, 9);

    // CHECK SSTORE
    auto sstore_row = std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_sstore == 1; });
    EXPECT_EQ(sstore_row->main_ia, 42); // Read value
    EXPECT_EQ(sstore_row->main_ib, 9);  // Storage slot
    // EXPECT_EQ(sstore_row->main_side_effect_counter, 1);

    // Get the row of the first storage write out
    uint32_t sstore_out_offset = START_SSTORE_WRITE_OFFSET;
    auto sstore_kernel_out_row =
        std::ranges::find_if(trace.begin(), trace.end(), [&](Row r) { return r.main_clk == sstore_out_offset; });
    EXPECT_EQ(sstore_kernel_out_row->main_kernel_value_out, 42); // value
    EXPECT_EQ(sstore_kernel_out_row->main_kernel_side_effect_out, 1);
    EXPECT_EQ(sstore_kernel_out_row->main_kernel_metadata_out, 9); // slot
    // feed_output(sstore_out_offset, 42, 1, 9);

    validate_trace(std::move(trace), public_inputs);
}

TEST_F(AvmExecutionTests, kernelOutputHashExistsOpcodes)
{
    GTEST_SKIP();
    // hash exists from a value that has not previously been written to will require a hint to process
    std::string bytecode_hex = to_hex(OpCode::SET_8) +             // opcode SET
                               "00"                                // Indirect flag
                               "01"                                // dst_offset 1
                               + to_hex(AvmMemoryTag::U32) +       //
                               "01"                                // value 1
                               + to_hex(OpCode::CAST_8) +          // opcode CAST to field
                               "00"                                // Indirect flag
                               "01"                                // dst 1
                               "01"                                // dst 1
                               + to_hex(AvmMemoryTag::FF)          //
                               + to_hex(OpCode::NOTEHASHEXISTS) +  // opcode NOTEHASHEXISTS
                               "00"                                // Indirect flag
                               "0001"                              // slot offset 1
                               "0002"                              // Leaf index offset 2
                               "0003"                              // write storage value to offset 2 (exists value)
                               + to_hex(OpCode::NULLIFIEREXISTS) + // opcode NULLIFIEREXISTS
                               "00"                                // Indirect flag
                               "0001"                              // slot offset 1
                               "0002"                              // Contract offset 2
                               "0003"                              // value write offset 2 (exists value)
                               + to_hex(OpCode::L1TOL2MSGEXISTS) + // opcode L1TOL2MSGEXISTS
                               "00"                                // Indirect flag
                               "0001"                              // slot offset 1
                               "0002"                              // Lead offset 2
                               "0003"                              // value write offset 2 (exists value)
                               + to_hex(OpCode::SET_16) +          // opcode SET (for return size)
                               "00"                                // Indirect flag
                               "0200"                              // dst_offset=512
                               + to_hex(AvmMemoryTag::U32) +       // tag U32
                               "0000"                              // val: 0
                               + to_hex(OpCode::RETURN) +          // opcode RETURN
                               "00"                                // Indirect flag
                               "0000"                              // ret offset 0
                               "0200";                             // ret size offset 512

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    ASSERT_THAT(instructions, SizeIs(7));

    std::vector<FF> calldata = {};
    std::vector<FF> returndata = {};

    // Generate Hint for hash exists operation
    auto execution_hints = ExecutionHints()
                               .with_storage_value_hints({ { 0, 1 }, { 1, 1 }, { 2, 1 } })
                               .with_note_hash_exists_hints({ { 0, 1 }, { 1, 1 }, { 2, 1 } });

    auto trace = gen_trace(bytecode, calldata, public_inputs, returndata, execution_hints);

    // CHECK NOTEHASHEXISTS
    auto note_hash_row =
        std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_note_hash_exists == 1; });
    ASSERT_TRUE(note_hash_row != trace.end());
    EXPECT_EQ(note_hash_row->main_ia, 1); // Read value
    EXPECT_EQ(note_hash_row->main_ib, 1); // Storage slot
    // EXPECT_EQ(note_hash_row->main_side_effect_counter, 0);

    auto note_hash_out_row = std::ranges::find_if(
        trace.begin(), trace.end(), [&](Row r) { return r.main_clk == START_NOTE_HASH_EXISTS_WRITE_OFFSET; });
    ASSERT_TRUE(note_hash_out_row != trace.end());
    EXPECT_EQ(note_hash_out_row->main_kernel_value_out, 1); // value
    EXPECT_EQ(note_hash_out_row->main_kernel_side_effect_out, 0);
    EXPECT_EQ(note_hash_out_row->main_kernel_metadata_out, 1); // exists
    // feed_output(START_NOTE_HASH_EXISTS_WRITE_OFFSET, 1, 0, 1);

    // CHECK NULLIFIEREXISTS
    auto nullifier_row =
        std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_nullifier_exists == 1; });
    ASSERT_TRUE(nullifier_row != trace.end());
    EXPECT_EQ(nullifier_row->main_ia, 1); // Read value
    EXPECT_EQ(nullifier_row->main_ib, 1); // Storage slot
    // EXPECT_EQ(nullifier_row->main_side_effect_counter, 1);

    auto nullifier_out_row = std::ranges::find_if(
        trace.begin(), trace.end(), [&](Row r) { return r.main_clk == START_NULLIFIER_EXISTS_OFFSET; });
    ASSERT_TRUE(nullifier_out_row != trace.end());
    EXPECT_EQ(nullifier_out_row->main_kernel_value_out, 1); // value
    // TODO(#8287)
    EXPECT_EQ(nullifier_out_row->main_kernel_side_effect_out, 0);
    EXPECT_EQ(nullifier_out_row->main_kernel_metadata_out, 1); // exists
    // feed_output(START_NULLIFIER_EXISTS_OFFSET, 1, 0, 1);

    // CHECK L1TOL2MSGEXISTS
    auto l1_to_l2_row =
        std::ranges::find_if(trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_l1_to_l2_msg_exists == 1; });
    ASSERT_TRUE(l1_to_l2_row != trace.end());
    EXPECT_EQ(l1_to_l2_row->main_ia, 1); // Read value
    EXPECT_EQ(l1_to_l2_row->main_ib, 1); // Storage slot
    // EXPECT_EQ(l1_to_l2_row->main_side_effect_counter, 2);

    auto msg_out_row = std::ranges::find_if(
        trace.begin(), trace.end(), [&](Row r) { return r.main_clk == START_L1_TO_L2_MSG_EXISTS_WRITE_OFFSET; });
    ASSERT_TRUE(msg_out_row != trace.end());
    EXPECT_EQ(msg_out_row->main_kernel_value_out, 1); // value
    // TODO(#8287)
    EXPECT_EQ(msg_out_row->main_kernel_side_effect_out, 0);
    EXPECT_EQ(msg_out_row->main_kernel_metadata_out, 1); // exists
    // feed_output(START_L1_TO_L2_MSG_EXISTS_WRITE_OFFSET, 1, 0, 1);

    validate_trace(std::move(trace), public_inputs);
}

TEST_F(AvmExecutionTests, opCallOpcodes)
{
    // This test fails because it is not writing the right contract address to memory that is expected by the hints/PI
    // (0xdeadbeef). We can fix it but that involves unpicking the hand-rolled bytecode below
    GTEST_SKIP();
    // Calldata for l2_gas, da_gas, contract_address, nested_call_args (4 elements),
    std::vector<FF> calldata = { 17, 10, 34802342, 1, 2, 3, 4 };
    std::string bytecode_preamble;

    // Set up Gas offsets
    bytecode_preamble += to_hex(OpCode::SET_8) +       // opcode SET for gas offset indirect
                         "00"                          // Indirect flag
                         "11"                          // dst_offset 17
                         + to_hex(AvmMemoryTag::U32) + //
                         "00";                         // val 0 (address where gas tuple is located)
    // Set up contract address offset
    bytecode_preamble += to_hex(OpCode::SET_8) +       // opcode SET for args offset indirect
                         "00"                          // Indirect flag
                         "12"                          // dst_offset 18
                         + to_hex(AvmMemoryTag::U32) + //
                         "02";                         // val 2 (where contract address is located)
    // Set up args offset
    bytecode_preamble += to_hex(OpCode::SET_8) +       // opcode SET for ret offset indirect
                         "00"                          // Indirect flag
                         "13"                          // dst_offset 19
                         + to_hex(AvmMemoryTag::U32) + //
                         "03";                         // val 3 (the start of the args array)
    // Set up args size offset
    bytecode_preamble += to_hex(OpCode::SET_8) +       // opcode SET for args size indirect
                         "00"                          // Indirect flag
                         "14"                          // dst_offset 20
                         + to_hex(AvmMemoryTag::U32) + //
                         "04";                         // val 4 - resolved address
    bytecode_preamble += to_hex(OpCode::SET_8) +       // opcode SET
                         "00"                          // Indirect flag
                         "04"                          // dst_offset 4
                         + to_hex(AvmMemoryTag::U32) + //
                         "00";                         // val 0 (args size)
    // Set up the ret offset
    bytecode_preamble += to_hex(OpCode::SET_16) +    // opcode SET for ret offset indirect
                         "00"                        // Indirect flag
                         "0015"                      // dst_offset 21
                         + to_hex(AvmMemoryTag::U32) //
                         + "0100";                   // val 256 (the start of where to write the return data)
    // Set up the success offset
    bytecode_preamble += to_hex(OpCode::SET_16) + // opcode SET for success offset indirect
                         "00"                     // Indirect flag
                         "0016"                   // dst_offset 22
                         + to_hex(AvmMemoryTag::U32) +
                         "0102"; // val 258 (write the success flag at ret_offset + ret_size)

    std::string bytecode_hex = to_hex(OpCode::SET_8) +            // opcode SET
                               "00"                               // Indirect flag
                               "00"                               // dst_offset
                               + to_hex(AvmMemoryTag::U32) +      //
                               "00"                               // val
                               + to_hex(OpCode::SET_8) +          // opcode SET
                               "00"                               // Indirect flag
                               "01"                               //
                               + to_hex(AvmMemoryTag::U32) +      //
                               "07"                               // val
                               + to_hex(OpCode::CALLDATACOPY) +   // opcode CALLDATACOPY
                               "00"                               // Indirect flag
                               "0000"                             // cd_offset
                               "0001"                             // copy_size
                               "0000"                             // dst_offset
                               + bytecode_preamble                // Load up memory offsets
                               + to_hex(OpCode::CALL) +           // opcode CALL
                               "001f"                             // Indirect flag
                               "0011"                             // gas offset
                               "0012"                             // addr offset
                               "0013"                             // args offset
                               "0014"                             // args size offset
                               "0016"                             // success offset
                               + to_hex(OpCode::RETURNDATACOPY) + // opcode RETURNDATACOPY
                               "00"                               // Indirect flag
                               "0011"                             // start offset (0)
                               "0012"                             // ret size (2)
                               "0100"                             // dst offset
                               + to_hex(OpCode::SET_16) +         // opcode SET (for return size)
                               "00"                               // Indirect flag
                               "0200"                             // dst_offset=512
                               + to_hex(AvmMemoryTag::U32) +      // tag U32
                               "0003"                             // val: 3 (extra read is for the success flag)
                               + to_hex(OpCode::RETURN) +         // opcode RETURN
                               "00"                               // Indirect flag
                               "0100"                             // ret offset 8
                               "0200";                            // ret size offset 512

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    std::vector<FF> returndata;

    ExecutionHints execution_hints;
    auto trace = gen_trace(bytecode, calldata, public_inputs, returndata, execution_hints);
    EXPECT_EQ(returndata, std::vector<FF>({ 9, 8, 1 })); // The 1 represents the success

    validate_trace(std::move(trace), public_inputs, calldata, returndata);
}

TEST_F(AvmExecutionTests, opGetContractInstanceOpcode)
{
    // FIXME: Skip until we have an easy way to mock contract instance nullifier memberhip
    GTEST_SKIP();
    const uint8_t address_byte = 0x42;
    const FF address(address_byte);

    // Generate Hint for call operation
    // Note: opcode does not write 'address' into memory
    // We store this random value since it's part of the return - we could return the rest as well but we don't need to.
    auto returned_point = grumpkin::g1::affine_element::random_element();
    PublicKeysHint public_keys_hints = {
        returned_point,
        grumpkin::g1::affine_element::random_element(),
        grumpkin::g1::affine_element::random_element(),
        grumpkin::g1::affine_element::random_element(),
    };
    const ContractInstanceHint instance = ContractInstanceHint{
        .address = address,
        .exists = true,
        .salt = 2,
        .deployer_addr = 42,
        .contract_class_id = 66,
        .initialisation_hash = 99,
        .public_keys = public_keys_hints,
        .membership_hint = { .low_leaf_preimage = { .nullifier = 0, .next_nullifier = 0, .next_index = 0, }, .low_leaf_index = 0, .low_leaf_sibling_path = {} },
    };
    auto execution_hints = ExecutionHints().with_contract_instance_hints({ { address, instance } });

    std::string bytecode_hex = to_hex(OpCode::SET_8) +                           // opcode SET
                               "00"                                              // Indirect flag
                               "01"                                              // dst_offset 1
                               + to_hex(AvmMemoryTag::FF) + to_hex(address_byte) // val
                               + to_hex(OpCode::GETCONTRACTINSTANCE) +           // opcode GETCONTRACTINSTANCE
                               "00"                                              // Indirect flag
                               "0001"                                            // address offset
                               "0010"                                            // dst offset
                               "0011"                                            // exists offset
                               + to_hex(static_cast<uint8_t>(ContractInstanceMember::DEPLOYER)) // member enum
                               + to_hex(OpCode::GETCONTRACTINSTANCE) + // opcode GETCONTRACTINSTANCE
                               "00"                                    // Indirect flag
                               "0001"                                  // address offset
                               "0012"                                  // dst offset
                               "0013"                                  // exists offset
                               + to_hex(static_cast<uint8_t>(ContractInstanceMember::CLASS_ID)) // member enum
                               + to_hex(OpCode::GETCONTRACTINSTANCE) + // opcode GETCONTRACTINSTANCE
                               "00"                                    // Indirect flag
                               "0001"                                  // address offset
                               "0014"                                  // dst offset
                               "0015"                                  // exists offset
                               + to_hex(static_cast<uint8_t>(ContractInstanceMember::INIT_HASH)) // member enum
                               + to_hex(OpCode::SET_16) +    // opcode SET (for return size)
                               "00"                          // Indirect flag
                               "0200"                        // dst_offset=512
                               + to_hex(AvmMemoryTag::U32) + // tag U32
                               "0006"                        // val: 6 (dst & exists for all 3)
                               + to_hex(OpCode::RETURN) +    // opcode RETURN
                               "00"                          // Indirect flag
                               "0010"                        // ret offset 1
                               "0200";                       // ret size offset 512

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    ASSERT_THAT(instructions, SizeIs(6));

    std::vector<FF> const calldata{};
    // alternating member value, exists bool
    std::vector<FF> const expected_returndata = {
        instance.deployer_addr, 1, instance.contract_class_id, 1, instance.initialisation_hash, 1,
    };

    std::vector<FF> returndata{};
    auto trace = gen_trace(bytecode, calldata, public_inputs, returndata, execution_hints);

    validate_trace(std::move(trace), public_inputs, calldata, returndata);

    // Validate returndata
    EXPECT_EQ(returndata, expected_returndata);
} // namespace tests_avm

TEST_F(AvmExecutionTests, opGetContractInstanceOpcodeBadEnum)
{
    const uint8_t address_byte = 0x42;

    std::string bytecode_hex = to_hex(OpCode::SET_8) +                           // opcode SET
                               "00"                                              // Indirect flag
                               "01"                                              // dst_offset 0
                               + to_hex(AvmMemoryTag::U8) + to_hex(address_byte) // val
                               + to_hex(OpCode::GETCONTRACTINSTANCE) +           // opcode GETCONTRACTINSTANCE
                               "00"                                              // Indirect flag
                               "0001"                                            // address offset
                               "0010"                                            // dst offset
                               "0011"                                            // exists offset
                               + to_hex(static_cast<uint8_t>(ContractInstanceMember::MAX_MEMBER)); // member enum

    auto bytecode = hex_to_bytes(bytecode_hex);
    auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_TRUE(is_ok(error));

    ASSERT_THAT(instructions, SizeIs(2));

    std::vector<FF> calldata;
    std::vector<FF> returndata;
    ExecutionHints execution_hints;
    auto trace = gen_trace(bytecode, calldata, public_inputs, returndata, execution_hints);

    // Bad enum should raise error flag
    auto address_row = std::ranges::find_if(
        trace.begin(), trace.end(), [](Row r) { return r.main_sel_op_get_contract_instance == 1; });
    ASSERT_TRUE(address_row != trace.end());
    EXPECT_EQ(address_row->main_op_err, FF(1));

    validate_trace(std::move(trace), public_inputs, calldata, returndata);
}

// Negative test detecting an invalid opcode byte.
TEST_F(AvmExecutionTests, invalidOpcode)
{
    std::string bytecode_hex = to_hex(OpCode::ADD_16) + // opcode ADD
                               "00"                     // Indirect flag
                               "0007"                   // addr a 7
                               "0009"                   // addr b 9
                               "0001"                   // addr c 1
                               "AB"                     // Invalid opcode byte
                               "0000"                   // ret offset 0
                               "0000";                  // ret size 0

    auto bytecode = hex_to_bytes(bytecode_hex);
    const auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_EQ(error, AvmError::INVALID_OPCODE);
}

// Negative test detecting an incomplete instruction: instruction tag present but an operand is missing
TEST_F(AvmExecutionTests, truncatedInstructionNoOperand)
{
    std::string bytecode_hex = to_hex(OpCode::ADD_16) +  // opcode ADD
                               "00"                      // Indirect flag
                               "0007"                    // addr a 7
                               "0009"                    // addr b 9
                               "0001"                    // addr c 1
                               + to_hex(OpCode::SUB_8) + // opcode SUB
                               "00"                      // Indirect flag
                               "AB"                      // addr a
                               "FF";                     // addr b and missing address for c = a-b

    auto bytecode = hex_to_bytes(bytecode_hex);
    const auto [instructions, error] = Deserialization::parse_bytecode_statically(bytecode);
    ASSERT_EQ(error, AvmError::PARSING_ERROR);
}

} // namespace tests_avm
