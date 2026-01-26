#include "barretenberg/avm_fuzzer/mutations/instructions/instruction.hpp"

#include <optional>
#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_context.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/memory_tag.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint16_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint32_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint64_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint8_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint_mutations.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace {

// Maximum operand values based on instruction operand size
constexpr uint32_t MAX_8BIT_OPERAND = 255;
constexpr uint32_t MAX_16BIT_OPERAND = 65535;

// Helper to generate a SET instruction for a given tag at a given address
FuzzInstruction generate_set_for_tag(bb::avm2::MemoryTag tag, AddressRef addr, std::mt19937_64& rng)
{
    switch (tag) {
        // We use set 16 for u1 and u8 because using set_8 will limit the address range to 255.
    case bb::avm2::MemoryTag::U1:
        return SET_16_Instruction{ .value_tag = tag, .result_address = addr, .value = static_cast<uint8_t>(rng() & 1) };
    case bb::avm2::MemoryTag::U8:
        return SET_16_Instruction{ .value_tag = tag, .result_address = addr, .value = generate_random_uint8(rng) };
    case bb::avm2::MemoryTag::U16:
        return SET_16_Instruction{ .value_tag = tag, .result_address = addr, .value = generate_random_uint16(rng) };
    case bb::avm2::MemoryTag::U32:
        return SET_32_Instruction{ .value_tag = tag, .result_address = addr, .value = generate_random_uint32(rng) };
    case bb::avm2::MemoryTag::U64:
        return SET_64_Instruction{ .value_tag = tag, .result_address = addr, .value = generate_random_uint64(rng) };
    case bb::avm2::MemoryTag::U128:
        return SET_128_Instruction{ .value_tag = tag,
                                    .result_address = addr,
                                    .value_low = generate_random_uint64(rng),
                                    .value_high = generate_random_uint64(rng) };
    case bb::avm2::MemoryTag::FF:
    default:
        return SET_FF_Instruction{ .value_tag = tag, .result_address = addr, .value = generate_random_field(rng) };
    }
}

uint8_t generate_envvar_type(std::mt19937_64& rng)
{
    bool valid_type = std::uniform_int_distribution<int>(0, 9)(rng) != 0;

    if (valid_type) {
        // 0 -> ADDRESS, 1 -> SENDER, 2 -> TRANSACTIONFEE, 3 -> CHAINID, 4 -> VERSION, 5 -> BLOCKNUMBER, 6 -> TIMESTAMP,
        // 7 -> MINFEEPERDAGAS, 8 -> MINFEEPERL2GAS, 9 -> ISSTATICCALL, 10 -> L2GASLEFT, 11 -> DAGASLEFT
        return std::uniform_int_distribution<uint8_t>(0, 11)(rng);
    } else {
        return generate_random_uint8(rng);
    }
}

std::optional<MemoryTag> get_param_ref_tag(const ParamRef& param)
{
    return std::visit(overloaded{ [](const VariableRef& var) -> std::optional<MemoryTag> { return var.tag.value; },
                                  [](const AddressRef&) -> std::optional<MemoryTag> { return std::nullopt; } },
                      param);
}

void sanitize_address_ref(AddressRef& address_ref, uint32_t base_offset, uint32_t max_operand_value)
{

    // For Direct mode, constrain address to fit in the operand
    if (address_ref.mode == AddressingMode::Direct) {
        address_ref.address = address_ref.address % (max_operand_value + 1);
    }
    // For Relative mode, we can reach from base_pointer to base_pointer + max_operand_value
    if (address_ref.mode == AddressingMode::Relative) {
        address_ref.address = base_offset + (address_ref.address % (max_operand_value + 1));
    }
}

uint32_t generate_address(std::mt19937_64& rng)
{
    if (std::uniform_int_distribution<int>(0, 19)(rng) == 0) { // 5% chance to generate the highest address
        return AVM_HIGHEST_MEM_ADDRESS;
    }
    return generate_random_uint32(rng);
}

} // namespace

namespace bb::avm2::fuzzer {

std::vector<FuzzInstruction> InstructionMutator::generate_instruction(std::mt19937_64& rng)
{
    InstructionGenerationOptions option = BASIC_INSTRUCTION_GENERATION_CONFIGURATION.select(rng);
    // forgive me
    switch (option) {
    case InstructionGenerationOptions::ADD_8:
        return generate_alu_with_matching_tags<ADD_8_Instruction>(rng, MAX_8BIT_OPERAND);
    case InstructionGenerationOptions::SUB_8:
        return generate_alu_with_matching_tags<SUB_8_Instruction>(rng, MAX_8BIT_OPERAND);
    case InstructionGenerationOptions::MUL_8:
        return generate_alu_with_matching_tags<MUL_8_Instruction>(rng, MAX_8BIT_OPERAND);
    case InstructionGenerationOptions::DIV_8:
        return generate_alu_with_matching_tags_not_ff<DIV_8_Instruction>(rng, MAX_8BIT_OPERAND);
    case InstructionGenerationOptions::FDIV_8:
        return generate_fdiv_instruction(rng, MAX_8BIT_OPERAND);
    case InstructionGenerationOptions::EQ_8:
        return { EQ_8_Instruction{ .a_address = generate_variable_ref(rng),
                                   .b_address = generate_variable_ref(rng),
                                   .result_address = generate_address_ref(rng, MAX_8BIT_OPERAND) } };
    case InstructionGenerationOptions::LT_8:
        return { LT_8_Instruction{ .a_address = generate_variable_ref(rng),
                                   .b_address = generate_variable_ref(rng),
                                   .result_address = generate_address_ref(rng, MAX_8BIT_OPERAND) } };
    case InstructionGenerationOptions::LTE_8:
        return { LTE_8_Instruction{ .a_address = generate_variable_ref(rng),
                                    .b_address = generate_variable_ref(rng),
                                    .result_address = generate_address_ref(rng, MAX_8BIT_OPERAND) } };
    case InstructionGenerationOptions::AND_8:
        return generate_alu_with_matching_tags_not_ff<AND_8_Instruction>(rng, MAX_8BIT_OPERAND);
    case InstructionGenerationOptions::OR_8:
        return generate_alu_with_matching_tags_not_ff<OR_8_Instruction>(rng, MAX_8BIT_OPERAND);
    case InstructionGenerationOptions::XOR_8:
        return generate_alu_with_matching_tags_not_ff<XOR_8_Instruction>(rng, MAX_8BIT_OPERAND);
    case InstructionGenerationOptions::NOT_8:
        return { NOT_8_Instruction{ .a_address = generate_variable_ref(rng),
                                    .result_address = generate_address_ref(rng, MAX_8BIT_OPERAND) } };
    case InstructionGenerationOptions::SHL_8:
        return { SHL_8_Instruction{ .a_address = generate_variable_ref(rng),
                                    .b_address = generate_variable_ref(rng),
                                    .result_address = generate_address_ref(rng, MAX_8BIT_OPERAND) } };

    case InstructionGenerationOptions::SHR_8:
        return { SHR_8_Instruction{ .a_address = generate_variable_ref(rng),
                                    .b_address = generate_variable_ref(rng),
                                    .result_address = generate_address_ref(rng, MAX_8BIT_OPERAND) } };
    case InstructionGenerationOptions::SET_8:
        return { SET_8_Instruction{ .value_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                    .result_address = generate_address_ref(rng, MAX_8BIT_OPERAND),
                                    .value = generate_random_uint8(rng) } };
    case InstructionGenerationOptions::SET_16:
        return { SET_16_Instruction{ .value_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                     .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND),
                                     .value = generate_random_uint16(rng) } };
    case InstructionGenerationOptions::SET_32:
        return { SET_32_Instruction{ .value_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                     .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND),
                                     .value = generate_random_uint32(rng) } };
    case InstructionGenerationOptions::SET_64:
        return { SET_64_Instruction{ .value_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                     .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND),
                                     .value = generate_random_uint64(rng) } };
    case InstructionGenerationOptions::SET_128:
        return { SET_128_Instruction{ .value_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                      .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND),
                                      .value_low = generate_random_uint64(rng),
                                      .value_high = generate_random_uint64(rng) } };
    case InstructionGenerationOptions::SET_FF:
        return { SET_FF_Instruction{ .value_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                     .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND),
                                     .value = generate_random_field(rng) } };
    case InstructionGenerationOptions::MOV_8:
        return { MOV_8_Instruction{ .value_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                    .src_address = generate_variable_ref(rng),
                                    .result_address = generate_address_ref(rng, MAX_8BIT_OPERAND) } };
    case InstructionGenerationOptions::MOV_16:
        return { MOV_16_Instruction{ .value_tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION),
                                     .src_address = generate_variable_ref(rng),
                                     .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
    case InstructionGenerationOptions::ADD_16:
        return generate_alu_with_matching_tags<ADD_16_Instruction>(rng, MAX_16BIT_OPERAND);
    case InstructionGenerationOptions::SUB_16:
        return generate_alu_with_matching_tags<SUB_16_Instruction>(rng, MAX_16BIT_OPERAND);
    case InstructionGenerationOptions::MUL_16:
        return generate_alu_with_matching_tags<MUL_16_Instruction>(rng, MAX_16BIT_OPERAND);
    case InstructionGenerationOptions::DIV_16:
        return generate_alu_with_matching_tags_not_ff<DIV_16_Instruction>(rng, MAX_16BIT_OPERAND);
    case InstructionGenerationOptions::FDIV_16:
        return { FDIV_16_Instruction{ .a_address = generate_variable_ref(rng),
                                      .b_address = generate_variable_ref(rng),
                                      .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
    case InstructionGenerationOptions::EQ_16:
        return { EQ_16_Instruction{ .a_address = generate_variable_ref(rng),
                                    .b_address = generate_variable_ref(rng),
                                    .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
    case InstructionGenerationOptions::LT_16:
        return { LT_16_Instruction{ .a_address = generate_variable_ref(rng),
                                    .b_address = generate_variable_ref(rng),
                                    .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
    case InstructionGenerationOptions::LTE_16:
        return { LTE_16_Instruction{ .a_address = generate_variable_ref(rng),
                                     .b_address = generate_variable_ref(rng),
                                     .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
    case InstructionGenerationOptions::AND_16:
        return generate_alu_with_matching_tags_not_ff<AND_16_Instruction>(rng, MAX_16BIT_OPERAND);
    case InstructionGenerationOptions::OR_16:
        return generate_alu_with_matching_tags_not_ff<OR_16_Instruction>(rng, MAX_16BIT_OPERAND);
    case InstructionGenerationOptions::XOR_16:
        return generate_alu_with_matching_tags_not_ff<XOR_16_Instruction>(rng, MAX_16BIT_OPERAND);
    case InstructionGenerationOptions::NOT_16:
        return { NOT_16_Instruction{ .a_address = generate_variable_ref(rng),
                                     .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
    case InstructionGenerationOptions::SHL_16:
        return { SHL_16_Instruction{ .a_address = generate_variable_ref(rng),
                                     .b_address = generate_variable_ref(rng),
                                     .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
    case InstructionGenerationOptions::SHR_16:
        return { SHR_16_Instruction{ .a_address = generate_variable_ref(rng),
                                     .b_address = generate_variable_ref(rng),
                                     .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
    case InstructionGenerationOptions::CAST_8:
        return { CAST_8_Instruction{ .src_address = generate_variable_ref(rng),
                                     .result_address = generate_address_ref(rng, MAX_8BIT_OPERAND),
                                     .target_tag =
                                         generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION) } };
    case InstructionGenerationOptions::CAST_16:
        return { CAST_16_Instruction{ .src_address = generate_variable_ref(rng),
                                      .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND),
                                      .target_tag =
                                          generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION) } };
    case InstructionGenerationOptions::SSTORE:
        return { SSTORE_Instruction{ .src_address = generate_variable_ref(rng),
                                     .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND),
                                     .slot = generate_random_field(rng) } };
    case InstructionGenerationOptions::SLOAD:
        return generate_sload_instruction(rng);
    case InstructionGenerationOptions::GETENVVAR:
        return { GETENVVAR_Instruction{ .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND),
                                        .type = generate_envvar_type(rng) } };
    case InstructionGenerationOptions::EMITNULLIFIER:
        return { EMITNULLIFIER_Instruction{ .nullifier_address = generate_variable_ref(rng) } };
    case InstructionGenerationOptions::NULLIFIEREXISTS:
        return { NULLIFIEREXISTS_Instruction{ .nullifier_address = generate_variable_ref(rng),
                                              .contract_address_address = generate_address_ref(rng, MAX_16BIT_OPERAND),
                                              .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
    case InstructionGenerationOptions::L1TOL2MSGEXISTS:
        return { L1TOL2MSGEXISTS_Instruction{ .msg_hash_address = generate_variable_ref(rng),
                                              .leaf_index_address = generate_variable_ref(rng),
                                              .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
    case InstructionGenerationOptions::EMITNOTEHASH:
        return { EMITNOTEHASH_Instruction{ .note_hash_address = generate_address_ref(rng, MAX_16BIT_OPERAND),
                                           .note_hash = generate_random_field(rng) } };
    case InstructionGenerationOptions::NOTEHASHEXISTS:
        return generate_notehashexists_instruction(rng);
    case InstructionGenerationOptions::CALLDATACOPY:
        return generate_calldatacopy_instruction(rng);
    case InstructionGenerationOptions::SENDL2TOL1MSG:
        return { SENDL2TOL1MSG_Instruction{ .recipient = generate_random_field(rng),
                                            .recipient_address = generate_address_ref(rng, MAX_16BIT_OPERAND),
                                            .content = generate_random_field(rng),
                                            .content_address = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
    case InstructionGenerationOptions::EMITUNENCRYPTEDLOG:
        return generate_emitunencryptedlog_instruction(rng);
    case InstructionGenerationOptions::CALL:
        return generate_call_instruction(rng);
    case InstructionGenerationOptions::RETURNDATASIZE:
        return generate_returndatasize_instruction(rng);
    case InstructionGenerationOptions::RETURNDATACOPY:
        return generate_returndatacopy_instruction(rng);
    case InstructionGenerationOptions::GETCONTRACTINSTANCE:
        return generate_getcontractinstance_instruction(rng);
    case InstructionGenerationOptions::SUCCESSCOPY:
        return { SUCCESSCOPY_Instruction{ .dst_address = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
    case InstructionGenerationOptions::ECADD:
        return generate_ecadd_instruction(rng);
    case InstructionGenerationOptions::POSEIDON2PERM:
        return { POSEIDON2PERM_Instruction{ .src_address = generate_address_ref(rng, MAX_16BIT_OPERAND),
                                            .dst_address = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
    case InstructionGenerationOptions::KECCAKF1600:
        return generate_keccakf_instruction(rng);
    case InstructionGenerationOptions::SHA256COMPRESSION:
        return generate_sha256compression_instruction(rng);
    case InstructionGenerationOptions::TORADIXBE:
        return generate_toradixbe_instruction(rng);
    case InstructionGenerationOptions::DEBUGLOG:
        return { { DEBUGLOG_Instruction{ .level_offset = generate_variable_ref(rng),
                                         .message_offset = generate_variable_ref(rng),
                                         .fields_offset = generate_variable_ref(rng),
                                         .fields_size_offset = generate_variable_ref(rng),
                                         .message_size = generate_random_uint16(rng) } } };
    }
}

void InstructionMutator::mutate_instruction(FuzzInstruction& instruction, std::mt19937_64& rng)
{
    std::visit(
        overloaded{
            [&rng, this](ADD_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
            [&rng, this](SUB_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
            [&rng, this](MUL_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
            [&rng, this](DIV_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
            [&rng, this](EQ_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
            [&rng, this](LT_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
            [&rng, this](LTE_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
            [&rng, this](AND_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
            [&rng, this](OR_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
            [&rng, this](XOR_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
            [&rng, this](SHL_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
            [&rng, this](SHR_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
            [&rng, this](SET_8_Instruction& instr) { mutate_set_8_instruction(instr, rng); },
            [&rng, this](SET_16_Instruction& instr) { mutate_set_16_instruction(instr, rng); },
            [&rng, this](SET_32_Instruction& instr) { mutate_set_32_instruction(instr, rng); },
            [&rng, this](SET_64_Instruction& instr) { mutate_set_64_instruction(instr, rng); },
            [&rng, this](SET_128_Instruction& instr) { mutate_set_128_instruction(instr, rng); },
            [&rng, this](SET_FF_Instruction& instr) { mutate_set_ff_instruction(instr, rng); },
            [&rng, this](MOV_8_Instruction& instr) { mutate_mov_8_instruction(instr, rng); },
            [&rng, this](MOV_16_Instruction& instr) { mutate_mov_16_instruction(instr, rng); },
            [&rng, this](FDIV_8_Instruction& instr) { mutate_binary_instruction_8(instr, rng); },
            [&rng, this](NOT_8_Instruction& instr) { mutate_not_8_instruction(instr, rng); },
            [&rng, this](ADD_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
            [&rng, this](SUB_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
            [&rng, this](MUL_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
            [&rng, this](DIV_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
            [&rng, this](FDIV_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
            [&rng, this](EQ_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
            [&rng, this](LT_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
            [&rng, this](LTE_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
            [&rng, this](AND_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
            [&rng, this](OR_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
            [&rng, this](XOR_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
            [&rng, this](NOT_16_Instruction& instr) { mutate_not_16_instruction(instr, rng); },
            [&rng, this](SHL_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
            [&rng, this](SHR_16_Instruction& instr) { mutate_binary_instruction_16(instr, rng); },
            [&rng, this](CAST_8_Instruction& instr) { mutate_cast_8_instruction(instr, rng); },
            [&rng, this](CAST_16_Instruction& instr) { mutate_cast_16_instruction(instr, rng); },
            [&rng, this](SSTORE_Instruction& instr) { mutate_sstore_instruction(instr, rng); },
            [&rng, this](SLOAD_Instruction& instr) { mutate_sload_instruction(instr, rng); },
            [&rng, this](GETENVVAR_Instruction& instr) { mutate_getenvvar_instruction(instr, rng); },
            [&rng, this](EMITNULLIFIER_Instruction& instr) { mutate_emit_nullifier_instruction(instr, rng); },
            [&rng, this](NULLIFIEREXISTS_Instruction& instr) { mutate_nullifier_exists_instruction(instr, rng); },
            [&rng, this](L1TOL2MSGEXISTS_Instruction& instr) { mutate_l1tol2msgexists_instruction(instr, rng); },
            [&rng, this](EMITNOTEHASH_Instruction& instr) { mutate_emit_note_hash_instruction(instr, rng); },
            [&rng, this](NOTEHASHEXISTS_Instruction& instr) { mutate_note_hash_exists_instruction(instr, rng); },
            [&rng, this](CALLDATACOPY_Instruction& instr) { mutate_calldatacopy_instruction(instr, rng); },
            [&rng, this](SENDL2TOL1MSG_Instruction& instr) { mutate_sendl2tol1msg_instruction(instr, rng); },
            [&rng, this](EMITUNENCRYPTEDLOG_Instruction& instr) { mutate_emitunencryptedlog_instruction(instr, rng); },
            [&rng, this](CALL_Instruction& instr) { mutate_call_instruction(instr, rng); },
            [&rng, this](RETURNDATASIZE_Instruction& instr) { mutate_returndatasize_instruction(instr, rng); },
            [&rng, this](RETURNDATACOPY_Instruction& instr) { mutate_returndatacopy_instruction(instr, rng); },
            [&rng, this](GETCONTRACTINSTANCE_Instruction& instr) {
                mutate_getcontractinstance_instruction(instr, rng);
            },
            [&rng, this](SUCCESSCOPY_Instruction& instr) { mutate_successcopy_instruction(instr, rng); },
            [&rng, this](ECADD_Instruction& instr) { mutate_ecadd_instruction(instr, rng); },
            [&rng, this](POSEIDON2PERM_Instruction& instr) { mutate_poseidon2perm_instruction(instr, rng); },
            [&rng, this](KECCAKF1600_Instruction& instr) { mutate_keccakf1600_instruction(instr, rng); },
            [&rng, this](SHA256COMPRESSION_Instruction& instr) { mutate_sha256compression_instruction(instr, rng); },
            [&rng, this](TORADIXBE_Instruction& instr) { mutate_toradixbe_instruction(instr, rng); },
            [&rng, this](DEBUGLOG_Instruction& instr) { mutate_debuglog_instruction(instr, rng); },
            [](auto&) { throw std::runtime_error("Unknown instruction"); } },
        instruction);
}

AddressingMode InstructionMutator::generate_addressing_mode(std::mt19937_64& rng)
{
    return static_cast<AddressingMode>(generate_random_uint8(rng) % 4);
}

AddressRef InstructionMutator::generate_address_ref(std::mt19937_64& rng, uint32_t max_operand_value)
{
    AddressRef address_ref = AddressRef{ .address = generate_address(rng),
                                         .pointer_address_seed = generate_random_uint16(rng),
                                         .mode = generate_addressing_mode(rng) };
    sanitize_address_ref(address_ref, base_offset, max_operand_value);
    return address_ref;
}

void InstructionMutator::mutate_address_ref(AddressRef& address, std::mt19937_64& rng, uint32_t max_operand_value)
{
    AddressRefMutationOptions option = BASIC_ADDRESS_REF_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case AddressRefMutationOptions::address:
        mutate_uint32_t(address.address, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case AddressRefMutationOptions::pointer_address:
        mutate_uint16_t(address.pointer_address_seed, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case AddressRefMutationOptions::mode:
        address.mode = generate_addressing_mode(rng);
        break;
    }
    sanitize_address_ref(address, base_offset, max_operand_value);
}

VariableRef InstructionMutator::generate_variable_ref(std::mt19937_64& rng)
{
    auto tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION);
    auto index = generate_random_uint32(rng);
    auto pointer_address = generate_random_uint16(rng);
    auto mode = generate_addressing_mode(rng);
    return VariableRef{ .tag = tag, .index = index, .pointer_address_seed = pointer_address, .mode = mode };
}

/// Most of the tags will be equal to the default tag
void InstructionMutator::mutate_variable_ref(VariableRef& variable,
                                             std::mt19937_64& rng,
                                             std::optional<MemoryTag> default_tag)
{
    VariableRefMutationOptions option = BASIC_VARIABLE_REF_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case VariableRefMutationOptions::tag:
        if (default_tag.has_value()) {
            mutate_or_default_tag(variable.tag.value, rng, default_tag.value());
        } else {
            mutate_memory_tag(variable.tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        }
        break;
    case VariableRefMutationOptions::index:
        mutate_uint32_t(variable.index, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case VariableRefMutationOptions::pointer_address:
        mutate_uint16_t(variable.pointer_address_seed, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case VariableRefMutationOptions::mode:
        variable.mode = generate_addressing_mode(rng);
        break;
    }
}

std::vector<FuzzInstruction> InstructionMutator::generate_ecadd_instruction(std::mt19937_64& rng)
{
    // 80% chance to use backfill (4 out of 5) to increase success rate
    bool use_backfill = std::uniform_int_distribution<int>(0, 4)(rng) != 0;

    if (!use_backfill) {
        // Random mode: use existing memory values (may fail if not valid points on curve)
        return { ECADD_Instruction{ .p1_x = generate_variable_ref(rng),
                                    .p1_y = generate_variable_ref(rng),
                                    .p1_infinite = generate_variable_ref(rng),
                                    .p2_x = generate_variable_ref(rng),
                                    .p2_y = generate_variable_ref(rng),
                                    .p2_infinite = generate_variable_ref(rng),
                                    .result = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
    }

    // Backfill mode: generate valid points on the Grumpkin curve and SET them
    // 6 SET instructions (2 points * 3 fields each) + 1 ECADD = 7 instructions
    std::vector<FuzzInstruction> instructions;
    instructions.reserve(7);

    // Generate a valid point via scalar multiplication of the generator (always on curve)
    auto generate_point = [&rng]() {
        bb::avm2::Fq scalar(generate_random_field(rng));
        return bb::avm2::EmbeddedCurvePoint::one() * scalar;
    };

    // Generate SET instructions to backfill a point at the given addresses
    auto backfill_point = [&instructions](const bb::avm2::EmbeddedCurvePoint& point,
                                          AddressRef x_addr,
                                          AddressRef y_addr,
                                          AddressRef inf_addr) {
        instructions.push_back(
            SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF, .result_address = x_addr, .value = point.x() });
        instructions.push_back(
            SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF, .result_address = y_addr, .value = point.y() });
        instructions.push_back(SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U1,
                                                  .result_address = inf_addr,
                                                  .value = static_cast<uint8_t>(point.is_infinity() ? 1 : 0) });
    };

    auto p1 = generate_point();
    auto p2 = generate_point();

    // Generate addresses (SET_FF uses 16-bit, SET_8 uses 8-bit operands)
    AddressRef p1_x_addr = generate_address_ref(rng, MAX_16BIT_OPERAND);
    AddressRef p1_y_addr = generate_address_ref(rng, MAX_16BIT_OPERAND);
    AddressRef p1_inf_addr = generate_address_ref(rng, MAX_8BIT_OPERAND);
    AddressRef p2_x_addr = generate_address_ref(rng, MAX_16BIT_OPERAND);
    AddressRef p2_y_addr = generate_address_ref(rng, MAX_16BIT_OPERAND);
    AddressRef p2_inf_addr = generate_address_ref(rng, MAX_8BIT_OPERAND);

    backfill_point(p1, p1_x_addr, p1_y_addr, p1_inf_addr);
    backfill_point(p2, p2_x_addr, p2_y_addr, p2_inf_addr);

    instructions.push_back(ECADD_Instruction{ .p1_x = p1_x_addr,
                                              .p1_y = p1_y_addr,
                                              .p1_infinite = p1_inf_addr,
                                              .p2_x = p2_x_addr,
                                              .p2_y = p2_y_addr,
                                              .p2_infinite = p2_inf_addr,
                                              .result = generate_address_ref(rng, MAX_16BIT_OPERAND) });

    return instructions;
}

// Generate binary ALU instruction with optional backfill for matching tagged operands
template <typename InstructionType>
std::vector<FuzzInstruction> InstructionMutator::generate_alu_with_matching_tags(std::mt19937_64& rng,
                                                                                 uint32_t max_operand)
{
    // 80% chance to use backfill (4 out of 5) to increase success rate
    bool use_backfill = std::uniform_int_distribution<int>(0, 4)(rng) != 0;

    if (!use_backfill) {
        return { InstructionType{ .a_address = generate_variable_ref(rng),
                                  .b_address = generate_variable_ref(rng),
                                  .result_address = generate_address_ref(rng, max_operand) } };
    }

    auto tag = generate_memory_tag(rng, BASIC_MEMORY_TAG_GENERATION_CONFIGURATION);
    AddressRef a_addr = generate_address_ref(rng, max_operand);
    AddressRef b_addr = generate_address_ref(rng, max_operand);

    std::vector<FuzzInstruction> instructions;
    instructions.push_back(generate_set_for_tag(tag, a_addr, rng));
    instructions.push_back(generate_set_for_tag(tag, b_addr, rng));
    instructions.push_back(InstructionType{
        .a_address = a_addr, .b_address = b_addr, .result_address = generate_address_ref(rng, max_operand) });
    return instructions;
}

// Generate binary ALU instruction with optional backfill for matching non-FF tagged operands
// Used for bitwise operations (AND, OR, XOR) and integer DIV which don't support FF
template <typename InstructionType>
std::vector<FuzzInstruction> InstructionMutator::generate_alu_with_matching_tags_not_ff(std::mt19937_64& rng,
                                                                                        uint32_t max_operand)
{
    // 80% chance to use backfill (4 out of 5) to increase success rate
    bool use_backfill = std::uniform_int_distribution<int>(0, 4)(rng) != 0;

    if (!use_backfill) {
        return { InstructionType{ .a_address = generate_variable_ref(rng),
                                  .b_address = generate_variable_ref(rng),
                                  .result_address = generate_address_ref(rng, max_operand) } };
    }

    // Pick a random non-FF tag (U1, U8, U16, U32, U64, U128)
    static constexpr std::array<bb::avm2::MemoryTag, 6> int_tags = {
        bb::avm2::MemoryTag::U1,  bb::avm2::MemoryTag::U8,  bb::avm2::MemoryTag::U16,
        bb::avm2::MemoryTag::U32, bb::avm2::MemoryTag::U64, bb::avm2::MemoryTag::U128
    };
    auto tag = int_tags[std::uniform_int_distribution<size_t>(0, int_tags.size() - 1)(rng)];

    AddressRef a_addr = generate_address_ref(rng, max_operand);
    AddressRef b_addr = generate_address_ref(rng, max_operand);

    std::vector<FuzzInstruction> instructions;
    instructions.push_back(generate_set_for_tag(tag, a_addr, rng));
    instructions.push_back(generate_set_for_tag(tag, b_addr, rng));
    instructions.push_back(InstructionType{
        .a_address = a_addr, .b_address = b_addr, .result_address = generate_address_ref(rng, max_operand) });
    return instructions;
}

std::vector<FuzzInstruction> InstructionMutator::generate_fdiv_instruction(std::mt19937_64& rng, uint32_t max_operand)
{
    // 80% chance to use backfill (4 out of 5) to increase success rate
    bool use_backfill = std::uniform_int_distribution<int>(0, 4)(rng) != 0;

    if (!use_backfill) {
        // Random mode: use existing memory values
        return { FDIV_8_Instruction{ .a_address = generate_variable_ref(rng),
                                     .b_address = generate_variable_ref(rng),
                                     .result_address = generate_address_ref(rng, max_operand) } };
    }

    // Backfill mode: generate two non-zero FF values
    std::vector<FuzzInstruction> instructions;
    instructions.reserve(3);

    // Generate non-zero field values (avoid division by zero)
    auto generate_nonzero_field = [&rng]() {
        bb::avm2::FF value;
        do {
            value = generate_random_field(rng);
        } while (value.is_zero());
        return value;
    };

    AddressRef a_addr = generate_address_ref(rng, max_operand);
    AddressRef b_addr = generate_address_ref(rng, max_operand);

    // SET the dividend (a)
    instructions.push_back(SET_FF_Instruction{
        .value_tag = bb::avm2::MemoryTag::FF, .result_address = a_addr, .value = generate_nonzero_field() });

    // SET the divisor (b) - must be non-zero
    instructions.push_back(SET_FF_Instruction{
        .value_tag = bb::avm2::MemoryTag::FF, .result_address = b_addr, .value = generate_nonzero_field() });

    // FDIV instruction
    instructions.push_back(FDIV_8_Instruction{
        .a_address = a_addr, .b_address = b_addr, .result_address = generate_address_ref(rng, max_operand) });

    return instructions;
}

std::vector<FuzzInstruction> InstructionMutator::generate_keccakf_instruction(std::mt19937_64& rng)
{
    // 80% chance to use backfill (4 out of 5) to increase success rate
    bool use_backfill = std::uniform_int_distribution<int>(0, 4)(rng) != 0;
    if (!use_backfill) {
        // Random mode
        return { KECCAKF1600_Instruction{ .src_address = generate_variable_ref(rng),
                                          .dst_address = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
    }
    // Backfill mode
    std::vector<FuzzInstruction> instructions;

    // Keccak needs to backfill 25 U64 values, these need be contiguous in memory
    AddressRef src_address = generate_address_ref(rng, MAX_16BIT_OPERAND - 24);
    for (size_t i = 0; i < 25; i++) {
        AddressRef item_address = src_address;
        item_address.address += static_cast<uint32_t>(i);
        instructions.push_back(SET_64_Instruction{ .value_tag = bb::avm2::MemoryTag::U64,
                                                   .result_address = item_address,
                                                   .value = generate_random_uint64(rng) });
    }
    instructions.push_back(KECCAKF1600_Instruction{ .src_address = src_address,
                                                    .dst_address = generate_address_ref(rng, MAX_16BIT_OPERAND) });
    return instructions;
}

std::vector<FuzzInstruction> InstructionMutator::generate_sha256compression_instruction(std::mt19937_64& rng)
{
    // 80% chance to use backfill (4 out of 5) to increase success rate
    bool use_backfill = std::uniform_int_distribution<int>(0, 4)(rng) != 0;
    if (!use_backfill) {
        // Random mode
        return { SHA256COMPRESSION_Instruction{ .state_address = generate_variable_ref(rng),
                                                .input_address = generate_variable_ref(rng),
                                                .dst_address = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
    }
    // Backfill mode
    // SHA256 compression needs 8 U32 values for state and 16 U32 values for input (contiguous)
    std::vector<FuzzInstruction> instructions;
    instructions.reserve(8 + 16 + 1);

    // Generate state address (8 contiguous U32 values)
    AddressRef state_address = generate_address_ref(rng, MAX_16BIT_OPERAND - 7);

    for (size_t i = 0; i < 8; i++) {
        AddressRef item_address = state_address;
        item_address.address += static_cast<uint32_t>(i);
        instructions.push_back(SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                                                   .result_address = item_address,
                                                   .value = generate_random_uint32(rng) });
    }

    // Generate input address (16 contiguous U32 values)
    AddressRef input_address = generate_address_ref(rng, MAX_16BIT_OPERAND - 15);

    for (size_t i = 0; i < 16; i++) {
        AddressRef item_address = input_address;
        item_address.address += static_cast<uint32_t>(i);
        instructions.push_back(SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                                                   .result_address = item_address,
                                                   .value = generate_random_uint32(rng) });
    }

    instructions.push_back(
        SHA256COMPRESSION_Instruction{ .state_address = state_address,
                                       .input_address = input_address,
                                       .dst_address = generate_address_ref(rng, MAX_16BIT_OPERAND) });
    return instructions;
}

std::vector<FuzzInstruction> InstructionMutator::generate_toradixbe_instruction(std::mt19937_64& rng)
{
    // 80% chance to use backfill (4 out of 5) to increase success rate
    bool use_backfill = std::uniform_int_distribution<int>(0, 4)(rng) != 0;
    if (!use_backfill) {
        // Random mode
        return { TORADIXBE_Instruction{ .value_address = generate_variable_ref(rng),
                                        .radix_address = generate_variable_ref(rng),
                                        .num_limbs_address = generate_variable_ref(rng),
                                        .output_bits_address = generate_variable_ref(rng),
                                        .dst_address = generate_address_ref(rng, MAX_16BIT_OPERAND),
                                        .is_output_bits = std::uniform_int_distribution<int>(0, 1)(rng) == 0 } };
    }
    // Backfill mode: set up proper typed values
    // value: FF, radix: U32, num_limbs: U32, output_bits: U1
    std::vector<FuzzInstruction> instructions;
    instructions.reserve(5);

    AddressRef value_addr = generate_address_ref(rng, MAX_16BIT_OPERAND);
    AddressRef radix_addr = generate_address_ref(rng, MAX_16BIT_OPERAND);
    AddressRef num_limbs_addr = generate_address_ref(rng, MAX_16BIT_OPERAND);
    AddressRef output_bits_addr = generate_address_ref(rng, MAX_8BIT_OPERAND);

    // SET the radix (U32) - pick radix between 2 and 256
    uint32_t radix = std::uniform_int_distribution<uint32_t>(2, 256)(rng);
    instructions.push_back(
        SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32, .result_address = radix_addr, .value = radix });

    // SET the output_bits (U1)
    bool is_output_bits = radix == 2;
    instructions.push_back(SET_8_Instruction{ .value_tag = bb::avm2::MemoryTag::U1,
                                              .result_address = output_bits_addr,
                                              .value = static_cast<uint8_t>(is_output_bits ? 1 : 0) });

    // Generate value with num_limbs digits
    uint32_t num_limbs = std::uniform_int_distribution<uint32_t>(0, 256)(rng);
    bb::avm2::FF value = 0;
    bb::avm2::FF exponent = 1;
    for (uint32_t i = 0; i < num_limbs; i++) {
        uint32_t digit = std::uniform_int_distribution<uint32_t>(0, radix - 1)(rng);
        value += bb::avm2::FF(digit) * exponent;
        exponent *= radix;
    }

    // 20% chance to truncate - reduce the number of limbs we request or increment the value if we have 0 limbs
    if (std::uniform_int_distribution<int>(0, 4)(rng) == 0) {
        if (num_limbs > 0) {
            num_limbs--;
        } else {
            value++;
        }
    }

    // SET the num_limbs (U32)
    instructions.push_back(SET_32_Instruction{
        .value_tag = bb::avm2::MemoryTag::U32, .result_address = num_limbs_addr, .value = num_limbs });

    // SET the value (FF)
    instructions.push_back(
        SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF, .result_address = value_addr, .value = value });

    // TORADIXBE instruction
    instructions.push_back(TORADIXBE_Instruction{ .value_address = value_addr,
                                                  .radix_address = radix_addr,
                                                  .num_limbs_address = num_limbs_addr,
                                                  .output_bits_address = output_bits_addr,
                                                  .dst_address = generate_address_ref(rng, MAX_16BIT_OPERAND),
                                                  .is_output_bits = is_output_bits });
    return instructions;
}

// A better way in the future is to pass in a vector of possible slots that have been written to,
// this would allow us to supply external world state info.
std::vector<FuzzInstruction> InstructionMutator::generate_sload_instruction(std::mt19937_64& rng)
{
    // 80% chance to use backfill (4 out of 5) to increase success rate
    bool use_backfill = std::uniform_int_distribution<int>(0, 4)(rng) != 0;

    if (!use_backfill) {
        // Random mode: requires at least one prior SSTORE to have been processed
        return { SLOAD_Instruction{ .slot_index = generate_random_uint16(rng),
                                    .slot_address = generate_address_ref(rng, MAX_16BIT_OPERAND),
                                    .contract_address_address = generate_variable_ref(rng),
                                    .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
    }

    // Backfill mode: generate SSTORE first to ensure storage_addresses is non-empty
    // This guarantees SLOAD will find a valid slot (get_slot uses modulo on non-empty vector)
    std::vector<FuzzInstruction> instructions;
    instructions.reserve(4);

    AddressRef sstore_src = generate_address_ref(rng, MAX_16BIT_OPERAND);

    // SET a value to store
    instructions.push_back(SET_FF_Instruction{
        .value_tag = bb::avm2::MemoryTag::FF, .result_address = sstore_src, .value = generate_random_field(rng) });

    // SSTORE - appends to storage_addresses in memory_manager
    instructions.push_back(SSTORE_Instruction{ .src_address = sstore_src,
                                               .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND),
                                               .slot = generate_random_field(rng) });

    // Now set our own contract address
    AddressRef contract_address_address = generate_address_ref(rng, MAX_16BIT_OPERAND);
    instructions.push_back(
        GETENVVAR_Instruction{ .result_address = contract_address_address, /* contract address */ .type = 0 });

    // SLOAD - now guaranteed to succeed (storage_addresses not empty, get_slot uses modulo)
    instructions.push_back(SLOAD_Instruction{ .slot_index = generate_random_uint16(rng),
                                              .slot_address = generate_address_ref(rng, MAX_16BIT_OPERAND),
                                              .contract_address_address = contract_address_address,
                                              .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND) });

    return instructions;
}

std::vector<FuzzInstruction> InstructionMutator::generate_emitunencryptedlog_instruction(std::mt19937_64& rng)
{
    // 80% chance to use backfill (4 out of 5) to increase success rate
    bool use_backfill = std::uniform_int_distribution<int>(0, 4)(rng) != 0;

    if (!use_backfill) {
        return { EMITUNENCRYPTEDLOG_Instruction{ .log_size_address = generate_variable_ref(rng),
                                                 .log_values_address = generate_variable_ref(rng) } };
    }

    uint32_t log_size = std::uniform_int_distribution<uint32_t>(0, FLAT_PUBLIC_LOGS_PAYLOAD_LENGTH)(rng);
    std::vector<FuzzInstruction> instructions;
    instructions.reserve(3);

    auto log_size_address = generate_address_ref(rng, MAX_16BIT_OPERAND);
    auto log_values_address = generate_address_ref(rng, MAX_16BIT_OPERAND - log_size);

    instructions.push_back(SET_32_Instruction{
        .value_tag = bb::avm2::MemoryTag::U32, .result_address = log_size_address, .value = log_size });

    // Write one random FF in the log
    instructions.push_back(SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                               .result_address = log_values_address,
                                               .value = generate_random_field(rng) });

    instructions.push_back(EMITUNENCRYPTEDLOG_Instruction{ .log_size_address = log_size_address,
                                                           .log_values_address = log_values_address });

    return instructions;
}

std::vector<FuzzInstruction> InstructionMutator::generate_call_instruction(std::mt19937_64& rng)
{
    // 80% chance to use backfill (4 out of 5) to increase success rate
    bool use_backfill = std::uniform_int_distribution<int>(0, 4)(rng) != 0;

    if (!use_backfill) {

        return { CALL_Instruction{ .l2_gas_address = generate_variable_ref(rng),
                                   .da_gas_address = generate_variable_ref(rng),
                                   .contract_address_address = generate_variable_ref(rng),
                                   .calldata_address = generate_variable_ref(rng),
                                   .calldata_size_address = generate_address_ref(rng, MAX_16BIT_OPERAND),
                                   .calldata_size = generate_random_uint16(rng),
                                   .is_static_call = rng() % 2 == 0 } };
    }

    std::vector<FuzzInstruction> instructions;
    instructions.reserve(5);

    auto contract_address_address = generate_address_ref(rng, MAX_16BIT_OPERAND);
    instructions.push_back(SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                               .result_address = contract_address_address,
                                               .value = context.get_contract_address(generate_random_uint16(rng)) });

    auto l2_gas_address = generate_address_ref(rng, MAX_16BIT_OPERAND);
    instructions.push_back(SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                                               .result_address = l2_gas_address,
                                               .value = generate_random_uint32(rng) });

    auto da_gas_address = generate_address_ref(rng, MAX_16BIT_OPERAND);
    instructions.push_back(SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                                               .result_address = da_gas_address,
                                               .value = generate_random_uint32(rng) });

    auto calldata_size = generate_random_uint16(rng);
    auto calldata_size_address = generate_address_ref(rng, MAX_16BIT_OPERAND);

    auto calldata_address = generate_address_ref(rng, MAX_16BIT_OPERAND);
    // Write one random FF in the calldata
    instructions.push_back(SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                               .result_address = calldata_address,
                                               .value = generate_random_field(rng) });

    instructions.push_back(CALL_Instruction{ .l2_gas_address = l2_gas_address,
                                             .da_gas_address = da_gas_address,
                                             .contract_address_address = contract_address_address,
                                             .calldata_address = calldata_address,
                                             .calldata_size_address = calldata_size_address,
                                             .calldata_size = calldata_size,
                                             .is_static_call = rng() % 2 == 0 });

    return instructions;
}

std::vector<FuzzInstruction> InstructionMutator::generate_getcontractinstance_instruction(std::mt19937_64& rng)
{
    bool use_backfill = std::uniform_int_distribution<int>(0, 4)(rng) != 0;
    if (!use_backfill) {
        return { GETCONTRACTINSTANCE_Instruction{
            .contract_address_address = generate_variable_ref(rng),
            .member_enum = generate_random_uint8(rng),
            .dst_address = generate_address_ref(rng, MAX_16BIT_OPERAND),
        } };
    }

    std::vector<FuzzInstruction> instructions;
    instructions.reserve(2);

    auto contract_address_address = generate_address_ref(rng, MAX_16BIT_OPERAND);
    instructions.push_back(SET_FF_Instruction{ .value_tag = bb::avm2::MemoryTag::FF,
                                               .result_address = contract_address_address,
                                               .value = context.get_contract_address(generate_random_uint16(rng)) });
    uint8_t member_enum = std::uniform_int_distribution<uint8_t>(0, 2)(rng);

    instructions.push_back(GETCONTRACTINSTANCE_Instruction{
        .contract_address_address = contract_address_address,
        .member_enum = member_enum,
        .dst_address = generate_address_ref(rng, MAX_16BIT_OPERAND),
    });

    return instructions;
}

std::vector<FuzzInstruction> InstructionMutator::generate_notehashexists_instruction(std::mt19937_64& rng)
{
    bool use_backfill = std::uniform_int_distribution<int>(0, 4)(rng) != 0;
    if (!use_backfill) {
        return { NOTEHASHEXISTS_Instruction{ .notehash_address = generate_variable_ref(rng),
                                             .leaf_index_address = generate_variable_ref(rng),
                                             .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
    }
    auto existing_note_hash = context.get_existing_note_hash(generate_random_uint16(rng));
    FF note_hash = existing_note_hash.has_value() ? existing_note_hash.value().first : generate_random_field(rng);
    uint64_t leaf_index =
        existing_note_hash.has_value() ? existing_note_hash.value().second : generate_random_uint64(rng);
    AddressRef note_hash_address = generate_address_ref(rng, MAX_16BIT_OPERAND);
    AddressRef leaf_index_address = generate_address_ref(rng, MAX_16BIT_OPERAND);

    std::vector<FuzzInstruction> instructions;
    instructions.reserve(3);

    instructions.push_back(SET_FF_Instruction{
        .value_tag = bb::avm2::MemoryTag::FF, .result_address = note_hash_address, .value = note_hash });
    instructions.push_back(SET_64_Instruction{
        .value_tag = bb::avm2::MemoryTag::U64, .result_address = leaf_index_address, .value = leaf_index });

    instructions.push_back(
        NOTEHASHEXISTS_Instruction{ .notehash_address = note_hash_address,
                                    .leaf_index_address = leaf_index_address,
                                    .result_address = generate_address_ref(rng, MAX_16BIT_OPERAND) });

    return instructions;
}

std::vector<FuzzInstruction> InstructionMutator::generate_returndatasize_instruction(std::mt19937_64& rng)
{
    return { RETURNDATASIZE_Instruction{ .dst_address = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
}

std::vector<FuzzInstruction> InstructionMutator::generate_returndatacopy_instruction(std::mt19937_64& rng)
{
    bool use_backfill = std::uniform_int_distribution<int>(0, 4)(rng) != 0;
    if (!use_backfill) {
        return { RETURNDATACOPY_Instruction{ .copy_size_address = generate_variable_ref(rng),
                                             .rd_offset_address = generate_variable_ref(rng),
                                             .dst_address = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
    }
    std::vector<FuzzInstruction> instructions;
    instructions.reserve(3);
    auto copy_size_address = generate_address_ref(rng, MAX_16BIT_OPERAND);
    instructions.push_back(SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                                               .result_address = copy_size_address,
                                               // We generate small sizes so we fail less often due to gas
                                               // Mutations might change this to a larger value.
                                               .value = generate_random_uint8(rng) });

    auto rd_offset_address = generate_address_ref(rng, MAX_16BIT_OPERAND);
    instructions.push_back(SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                                               .result_address = rd_offset_address,
                                               .value = generate_random_uint8(rng) });

    instructions.push_back(RETURNDATACOPY_Instruction{ .copy_size_address = copy_size_address,
                                                       .rd_offset_address = rd_offset_address,
                                                       .dst_address = generate_address_ref(rng, MAX_16BIT_OPERAND) });

    return instructions;
}

std::vector<FuzzInstruction> InstructionMutator::generate_calldatacopy_instruction(std::mt19937_64& rng)
{
    bool use_backfill = std::uniform_int_distribution<int>(0, 4)(rng) != 0;
    if (!use_backfill) {
        return { CALLDATACOPY_Instruction{ .copy_size_address = generate_variable_ref(rng),
                                           .cd_offset_address = generate_variable_ref(rng),
                                           .dst_address = generate_address_ref(rng, MAX_16BIT_OPERAND) } };
    }
    std::vector<FuzzInstruction> instructions;
    instructions.reserve(3);
    auto copy_size_address = generate_address_ref(rng, MAX_16BIT_OPERAND);
    instructions.push_back(SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                                               .result_address = copy_size_address,
                                               // We generate small sizes so we fail less often due to gas
                                               // Mutations might change this to a larger value.
                                               .value = generate_random_uint8(rng) });

    auto cd_offset_address = generate_address_ref(rng, MAX_16BIT_OPERAND);
    instructions.push_back(SET_32_Instruction{ .value_tag = bb::avm2::MemoryTag::U32,
                                               .result_address = cd_offset_address,
                                               .value = generate_random_uint8(rng) });

    instructions.push_back(CALLDATACOPY_Instruction{ .copy_size_address = copy_size_address,
                                                     .cd_offset_address = cd_offset_address,
                                                     .dst_address = generate_address_ref(rng, MAX_16BIT_OPERAND) });

    return instructions;
}

void InstructionMutator::mutate_param_ref(ParamRef& param,
                                          std::mt19937_64& rng,
                                          std::optional<MemoryTag> default_tag,
                                          uint32_t max_operand_value)
{
    std::visit(overloaded{ [&](VariableRef& var) { mutate_variable_ref(var, rng, default_tag); },
                           [&](AddressRef& addr) { mutate_address_ref(addr, rng, max_operand_value); } },
               param);
}

template <typename BinaryInstructionType>
void InstructionMutator::mutate_binary_instruction_8(BinaryInstructionType& instruction, std::mt19937_64& rng)
{
    BinaryInstruction8MutationOptions option = BASIC_BINARY_INSTRUCTION_8_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case BinaryInstruction8MutationOptions::a_address:
        mutate_param_ref(instruction.a_address, rng, std::nullopt, MAX_8BIT_OPERAND);
        break;
    case BinaryInstruction8MutationOptions::b_address:
        mutate_param_ref(instruction.b_address, rng, get_param_ref_tag(instruction.a_address), MAX_8BIT_OPERAND);
        break;
    case BinaryInstruction8MutationOptions::result_address:
        mutate_address_ref(instruction.result_address, rng, MAX_8BIT_OPERAND);
        break;
    }
}

template <typename BinaryInstructionType>
void InstructionMutator::mutate_binary_instruction_16(BinaryInstructionType& instruction, std::mt19937_64& rng)
{
    BinaryInstruction8MutationOptions option = BASIC_BINARY_INSTRUCTION_8_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case BinaryInstruction8MutationOptions::a_address:
        mutate_param_ref(instruction.a_address, rng, std::nullopt, MAX_16BIT_OPERAND);
        break;
    case BinaryInstruction8MutationOptions::b_address:
        mutate_param_ref(instruction.b_address, rng, get_param_ref_tag(instruction.a_address), MAX_16BIT_OPERAND);
        break;
    case BinaryInstruction8MutationOptions::result_address:
        mutate_address_ref(instruction.result_address, rng, MAX_16BIT_OPERAND);
        break;
    }
}

void InstructionMutator::mutate_not_8_instruction(NOT_8_Instruction& instruction, std::mt19937_64& rng)
{
    UnaryInstruction8MutationOptions option = BASIC_UNARY_INSTRUCTION_8_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case UnaryInstruction8MutationOptions::a_address:
        mutate_param_ref(instruction.a_address, rng, std::nullopt, MAX_8BIT_OPERAND);
        break;
    case UnaryInstruction8MutationOptions::result_address:
        mutate_address_ref(instruction.result_address, rng, MAX_8BIT_OPERAND);
        break;
    }
}

void InstructionMutator::mutate_set_8_instruction(SET_8_Instruction& instruction, std::mt19937_64& rng)
{
    Set8MutationOptions option = BASIC_SET_8_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case Set8MutationOptions::value_tag:
        mutate_memory_tag(instruction.value_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case Set8MutationOptions::result_address:
        mutate_address_ref(instruction.result_address, rng, MAX_8BIT_OPERAND);
        break;
    case Set8MutationOptions::value:
        mutate_uint8_t(instruction.value, rng, BASIC_UINT8_T_MUTATION_CONFIGURATION);
        break;
    }
}

void InstructionMutator::mutate_set_16_instruction(SET_16_Instruction& instruction, std::mt19937_64& rng)
{
    Set16MutationOptions option = BASIC_SET_16_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case Set16MutationOptions::value_tag:
        mutate_memory_tag(instruction.value_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case Set16MutationOptions::result_address:
        mutate_address_ref(instruction.result_address, rng, MAX_16BIT_OPERAND);
        break;
    case Set16MutationOptions::value:
        mutate_uint16_t(instruction.value, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    }
}

void InstructionMutator::mutate_set_32_instruction(SET_32_Instruction& instruction, std::mt19937_64& rng)
{
    Set32MutationOptions option = BASIC_SET_32_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case Set32MutationOptions::value_tag:
        mutate_memory_tag(instruction.value_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case Set32MutationOptions::result_address:
        mutate_address_ref(instruction.result_address, rng, MAX_16BIT_OPERAND);
        break;
    case Set32MutationOptions::value:
        mutate_uint32_t(instruction.value, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    }
}

void InstructionMutator::mutate_set_64_instruction(SET_64_Instruction& instruction, std::mt19937_64& rng)
{
    Set64MutationOptions option = BASIC_SET_64_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case Set64MutationOptions::value_tag:
        mutate_memory_tag(instruction.value_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case Set64MutationOptions::result_address:
        mutate_address_ref(instruction.result_address, rng, MAX_16BIT_OPERAND);
        break;
    case Set64MutationOptions::value:
        mutate_uint64_t(instruction.value, rng, BASIC_UINT64_T_MUTATION_CONFIGURATION);
        break;
    }
}

void InstructionMutator::mutate_set_128_instruction(SET_128_Instruction& instruction, std::mt19937_64& rng)
{
    Set128MutationOptions option = BASIC_SET_128_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case Set128MutationOptions::value_tag:
        mutate_memory_tag(instruction.value_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case Set128MutationOptions::result_address:
        mutate_address_ref(instruction.result_address, rng, MAX_16BIT_OPERAND);
        break;
    case Set128MutationOptions::value_low:
        mutate_uint64_t(instruction.value_low, rng, BASIC_UINT64_T_MUTATION_CONFIGURATION);
        break;
    case Set128MutationOptions::value_high:
        mutate_uint64_t(instruction.value_high, rng, BASIC_UINT64_T_MUTATION_CONFIGURATION);
        break;
    }
}

void InstructionMutator::mutate_set_ff_instruction(SET_FF_Instruction& instruction, std::mt19937_64& rng)
{
    SetFFMutationOptions option = BASIC_SET_FF_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case SetFFMutationOptions::value_tag:
        mutate_memory_tag(instruction.value_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case SetFFMutationOptions::result_address:
        mutate_address_ref(instruction.result_address, rng, MAX_16BIT_OPERAND);
        break;
    case SetFFMutationOptions::value:
        mutate_field(instruction.value, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    }
}

void InstructionMutator::mutate_mov_8_instruction(MOV_8_Instruction& instruction, std::mt19937_64& rng)
{
    int choice = std::uniform_int_distribution<int>(0, 2)(rng);
    switch (choice) {
    case 0:
        mutate_memory_tag(instruction.value_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case 1:
        mutate_param_ref(instruction.src_address, rng, std::nullopt, MAX_8BIT_OPERAND);
        break;
    case 2:
        mutate_address_ref(instruction.result_address, rng, MAX_8BIT_OPERAND);
        break;
    }
}

void InstructionMutator::mutate_mov_16_instruction(MOV_16_Instruction& instruction, std::mt19937_64& rng)
{
    int choice = std::uniform_int_distribution<int>(0, 2)(rng);
    switch (choice) {
    case 0:
        mutate_memory_tag(instruction.value_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case 1:
        mutate_param_ref(instruction.src_address, rng, std::nullopt, MAX_16BIT_OPERAND);
        break;
    case 2:
        mutate_address_ref(instruction.result_address, rng, MAX_16BIT_OPERAND);
        break;
    }
}

void InstructionMutator::mutate_not_16_instruction(NOT_16_Instruction& instruction, std::mt19937_64& rng)
{
    UnaryInstruction8MutationOptions option = BASIC_UNARY_INSTRUCTION_8_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case UnaryInstruction8MutationOptions::a_address:
        mutate_param_ref(instruction.a_address, rng, std::nullopt, MAX_16BIT_OPERAND);
        break;
    case UnaryInstruction8MutationOptions::result_address:
        mutate_address_ref(instruction.result_address, rng, MAX_16BIT_OPERAND);
        break;
    }
}

void InstructionMutator::mutate_cast_8_instruction(CAST_8_Instruction& instruction, std::mt19937_64& rng)
{
    BinaryInstruction8MutationOptions option = BASIC_BINARY_INSTRUCTION_8_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case BinaryInstruction8MutationOptions::a_address:
        mutate_param_ref(instruction.src_address, rng, std::nullopt, MAX_8BIT_OPERAND);
        break;
    case BinaryInstruction8MutationOptions::b_address:
        mutate_address_ref(instruction.result_address, rng, MAX_8BIT_OPERAND);
        break;
    case BinaryInstruction8MutationOptions::result_address:
        mutate_memory_tag(instruction.target_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    }
}

void InstructionMutator::mutate_cast_16_instruction(CAST_16_Instruction& instruction, std::mt19937_64& rng)
{
    BinaryInstruction8MutationOptions option = BASIC_BINARY_INSTRUCTION_8_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case BinaryInstruction8MutationOptions::a_address:
        mutate_param_ref(instruction.src_address, rng, std::nullopt, MAX_16BIT_OPERAND);
        break;
    case BinaryInstruction8MutationOptions::b_address:
        mutate_address_ref(instruction.result_address, rng, MAX_16BIT_OPERAND);
        break;
    case BinaryInstruction8MutationOptions::result_address:
        mutate_memory_tag(instruction.target_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    }
}

void InstructionMutator::mutate_sstore_instruction(SSTORE_Instruction& instruction, std::mt19937_64& rng)
{
    SStoreMutationOptions option = BASIC_SSTORE_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case SStoreMutationOptions::src_address:
        mutate_param_ref(instruction.src_address, rng, MemoryTag::FF, MAX_16BIT_OPERAND);
        break;
    case SStoreMutationOptions::result_address:
        mutate_address_ref(instruction.result_address, rng, MAX_16BIT_OPERAND);
        break;
    case SStoreMutationOptions::slot:
        mutate_field(instruction.slot, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    }
}

void InstructionMutator::mutate_sload_instruction(SLOAD_Instruction& instruction, std::mt19937_64& rng)
{
    SLoadMutationOptions option = BASIC_SLOAD_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case SLoadMutationOptions::slot_index:
        mutate_uint16_t(instruction.slot_index, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case SLoadMutationOptions::slot_address:
        mutate_address_ref(instruction.slot_address, rng, MAX_16BIT_OPERAND);
        break;
    case SLoadMutationOptions::contract_address_address:
        mutate_param_ref(instruction.contract_address_address, rng, MemoryTag::FF, MAX_16BIT_OPERAND);
        break;
    case SLoadMutationOptions::result_address:
        mutate_address_ref(instruction.result_address, rng, MAX_16BIT_OPERAND);
        break;
    }
}

void InstructionMutator::mutate_getenvvar_instruction(GETENVVAR_Instruction& instruction, std::mt19937_64& rng)
{
    GetEnvVarMutationOptions option = BASIC_GETENVVAR_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case GetEnvVarMutationOptions::result_address:
        mutate_address_ref(instruction.result_address, rng, MAX_16BIT_OPERAND);
        break;
    case GetEnvVarMutationOptions::type:
        instruction.type = generate_envvar_type(rng);
        break;
    }
}

void InstructionMutator::mutate_emit_nullifier_instruction(EMITNULLIFIER_Instruction& instruction, std::mt19937_64& rng)
{
    // emitnulifier only has one field

    mutate_param_ref(instruction.nullifier_address, rng, MemoryTag::FF, MAX_16BIT_OPERAND);
}

void InstructionMutator::mutate_nullifier_exists_instruction(NULLIFIEREXISTS_Instruction& instruction,
                                                             std::mt19937_64& rng)
{
    NullifierExistsMutationOptions option = BASIC_NULLIFIER_EXISTS_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case NullifierExistsMutationOptions::nullifier_address:
        mutate_param_ref(instruction.nullifier_address, rng, MemoryTag::FF, MAX_16BIT_OPERAND);
        break;
    case NullifierExistsMutationOptions::contract_address_address:
        mutate_address_ref(instruction.contract_address_address, rng, MAX_16BIT_OPERAND);
        break;
    case NullifierExistsMutationOptions::result_address:
        mutate_address_ref(instruction.result_address, rng, MAX_16BIT_OPERAND);
        break;
    }
}

void InstructionMutator::mutate_l1tol2msgexists_instruction(L1TOL2MSGEXISTS_Instruction& instruction,
                                                            std::mt19937_64& rng)
{
    L1ToL2MsgExistsMutationOptions option = BASIC_L1TOL2MSGEXISTS_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case L1ToL2MsgExistsMutationOptions::msg_hash_address:
        mutate_param_ref(instruction.msg_hash_address, rng, MemoryTag::FF, MAX_16BIT_OPERAND);
        break;
    case L1ToL2MsgExistsMutationOptions::leaf_index_address:
        mutate_param_ref(instruction.leaf_index_address, rng, MemoryTag::U64, MAX_16BIT_OPERAND);
        break;
    case L1ToL2MsgExistsMutationOptions::result_address:
        mutate_address_ref(instruction.result_address, rng, MAX_16BIT_OPERAND);
        break;
    }
}

void InstructionMutator::mutate_emit_note_hash_instruction(EMITNOTEHASH_Instruction& instruction, std::mt19937_64& rng)
{
    EmitNoteHashMutationOptions option = BASIC_EMITNOTEHASH_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case EmitNoteHashMutationOptions::note_hash_address:
        mutate_address_ref(instruction.note_hash_address, rng, MAX_16BIT_OPERAND);
        break;
    case EmitNoteHashMutationOptions::note_hash:
        mutate_field(instruction.note_hash, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    }
}
void InstructionMutator::mutate_note_hash_exists_instruction(NOTEHASHEXISTS_Instruction& instruction,
                                                             std::mt19937_64& rng)
{
    NoteHashExistsMutationOptions option = BASIC_NOTEHASHEXISTS_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case NoteHashExistsMutationOptions::notehash_address:
        mutate_param_ref(instruction.notehash_address, rng, MemoryTag::FF, MAX_16BIT_OPERAND);
        break;
    case NoteHashExistsMutationOptions::leaf_index_address:
        mutate_param_ref(instruction.leaf_index_address, rng, MemoryTag::U64, MAX_16BIT_OPERAND);
        break;
    case NoteHashExistsMutationOptions::result_address:
        mutate_address_ref(instruction.result_address, rng, MAX_16BIT_OPERAND);
        break;
    }
}

void InstructionMutator::mutate_calldatacopy_instruction(CALLDATACOPY_Instruction& instruction, std::mt19937_64& rng)
{
    CalldataCopyMutationOptions option = BASIC_CALLDATACOPY_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case CalldataCopyMutationOptions::copy_size_address:
        mutate_param_ref(instruction.copy_size_address, rng, MemoryTag::U32, MAX_16BIT_OPERAND);
        break;
    case CalldataCopyMutationOptions::cd_offset_address:
        mutate_param_ref(instruction.cd_offset_address, rng, MemoryTag::U32, MAX_16BIT_OPERAND);
        break;
    case CalldataCopyMutationOptions::dst_address:
        mutate_address_ref(instruction.dst_address, rng, MAX_16BIT_OPERAND);
        break;
    }
}

void InstructionMutator::mutate_sendl2tol1msg_instruction(SENDL2TOL1MSG_Instruction& instruction, std::mt19937_64& rng)
{
    SendL2ToL1MsgMutationOptions option = BASIC_SENDL2TOL1MSG_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case SendL2ToL1MsgMutationOptions::recipient:
        mutate_field(instruction.recipient, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case SendL2ToL1MsgMutationOptions::recipient_address:
        mutate_address_ref(instruction.recipient_address, rng, MAX_16BIT_OPERAND);
        break;
    case SendL2ToL1MsgMutationOptions::content:
        mutate_field(instruction.content, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case SendL2ToL1MsgMutationOptions::content_address:
        mutate_address_ref(instruction.content_address, rng, MAX_16BIT_OPERAND);
        break;
    }
}

void InstructionMutator::mutate_emitunencryptedlog_instruction(EMITUNENCRYPTEDLOG_Instruction& instruction,
                                                               std::mt19937_64& rng)
{
    EmitUnencryptedLogMutationOptions option = BASIC_EMITUNENCRYPTEDLOG_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case EmitUnencryptedLogMutationOptions::log_size_address:
        mutate_param_ref(instruction.log_size_address, rng, MemoryTag::U32, MAX_16BIT_OPERAND);
        break;
    case EmitUnencryptedLogMutationOptions::log_values_address:
        mutate_param_ref(instruction.log_values_address, rng, MemoryTag::FF, MAX_16BIT_OPERAND);
        break;
    }
}

void InstructionMutator::mutate_call_instruction(CALL_Instruction& instruction, std::mt19937_64& rng)
{
    CallMutationOptions option = BASIC_CALL_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case CallMutationOptions::l2_gas_address:
        mutate_param_ref(instruction.l2_gas_address, rng, MemoryTag::U32, MAX_16BIT_OPERAND);
        break;
    case CallMutationOptions::da_gas_address:
        mutate_param_ref(instruction.da_gas_address, rng, MemoryTag::U32, MAX_16BIT_OPERAND);
        break;
    case CallMutationOptions::contract_address_address:
        mutate_param_ref(instruction.contract_address_address, rng, MemoryTag::FF, MAX_16BIT_OPERAND);
        break;
    case CallMutationOptions::calldata_size_address:
        mutate_address_ref(instruction.calldata_size_address, rng, MAX_16BIT_OPERAND);
        break;
    case CallMutationOptions::calldata_size:
        mutate_uint16_t(instruction.calldata_size, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case CallMutationOptions::calldata_address:
        mutate_param_ref(instruction.calldata_address, rng, MemoryTag::FF, MAX_16BIT_OPERAND);
        break;
    case CallMutationOptions::is_static_call:
        // with 0.5 probability, set to true, otherwise false
        instruction.is_static_call = rng() % 2 == 0;
    }
}

void InstructionMutator::mutate_returndatasize_instruction(RETURNDATASIZE_Instruction& instruction,
                                                           std::mt19937_64& rng)
{
    mutate_address_ref(instruction.dst_address, rng, MAX_16BIT_OPERAND);
}

void InstructionMutator::mutate_returndatacopy_instruction(RETURNDATACOPY_Instruction& instruction,
                                                           std::mt19937_64& rng)
{
    ReturndataCopyMutationOptions option = BASIC_RETURNDATACOPY_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case ReturndataCopyMutationOptions::copy_size_address:
        mutate_param_ref(instruction.copy_size_address, rng, MemoryTag::U32, MAX_16BIT_OPERAND);
        break;
    case ReturndataCopyMutationOptions::rd_offset_address:
        mutate_param_ref(instruction.rd_offset_address, rng, MemoryTag::U32, MAX_16BIT_OPERAND);
        break;
    case ReturndataCopyMutationOptions::dst_address:
        mutate_address_ref(instruction.dst_address, rng, MAX_16BIT_OPERAND);
        break;
    }
}

void InstructionMutator::mutate_getcontractinstance_instruction(GETCONTRACTINSTANCE_Instruction& instruction,
                                                                std::mt19937_64& rng)
{
    GetContractInstanceMutationOptions option = BASIC_GETCONTRACTINSTANCE_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case GetContractInstanceMutationOptions::contract_address_address:
        mutate_param_ref(instruction.contract_address_address, rng, MemoryTag::FF, MAX_16BIT_OPERAND);
        break;
    case GetContractInstanceMutationOptions::dst_address:
        mutate_address_ref(instruction.dst_address, rng, MAX_16BIT_OPERAND);
        break;
    case GetContractInstanceMutationOptions::member_enum:
        mutate_uint8_t(instruction.member_enum, rng, BASIC_UINT8_T_MUTATION_CONFIGURATION);
        break;
    }
}

void InstructionMutator::mutate_successcopy_instruction(SUCCESSCOPY_Instruction& instruction, std::mt19937_64& rng)
{
    SuccessCopyMutationOptions option = BASIC_SUCCESSCOPY_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case SuccessCopyMutationOptions::dst_address:
        mutate_address_ref(instruction.dst_address, rng, MAX_16BIT_OPERAND);
        break;
    }
}

void InstructionMutator::mutate_ecadd_instruction(ECADD_Instruction& instruction, std::mt19937_64& rng)
{
    // ECADD has 7 operands, select one to mutate
    int choice = std::uniform_int_distribution<int>(0, 6)(rng);
    switch (choice) {
    case 0:
        mutate_param_ref(instruction.p1_x, rng, MemoryTag::FF, MAX_16BIT_OPERAND);
        break;
    case 1:
        mutate_param_ref(instruction.p1_y, rng, MemoryTag::FF, MAX_16BIT_OPERAND);
        break;
    case 2:
        mutate_param_ref(instruction.p1_infinite, rng, MemoryTag::U1, MAX_16BIT_OPERAND);
        break;
    case 3:
        mutate_param_ref(instruction.p2_x, rng, MemoryTag::FF, MAX_16BIT_OPERAND);
        break;
    case 4:
        mutate_param_ref(instruction.p2_y, rng, MemoryTag::FF, MAX_16BIT_OPERAND);
        break;
    case 5:
        mutate_param_ref(instruction.p2_infinite, rng, MemoryTag::U1, MAX_16BIT_OPERAND);
        break;
    case 6:
        mutate_address_ref(instruction.result, rng, MAX_16BIT_OPERAND);
        break;
    }
}

void InstructionMutator::mutate_poseidon2perm_instruction(POSEIDON2PERM_Instruction& instruction, std::mt19937_64& rng)
{
    int choice = std::uniform_int_distribution<int>(0, 1)(rng);
    switch (choice) {
    case 0:
        mutate_param_ref(instruction.src_address, rng, MemoryTag::U32, MAX_16BIT_OPERAND);
        break;
    case 1:
        mutate_address_ref(instruction.dst_address, rng, MAX_16BIT_OPERAND);
        break;
    }
}

void InstructionMutator::mutate_keccakf1600_instruction(KECCAKF1600_Instruction& instruction, std::mt19937_64& rng)
{
    int choice = std::uniform_int_distribution<int>(0, 1)(rng);
    switch (choice) {
    case 0:
        mutate_param_ref(instruction.src_address, rng, MemoryTag::U32, MAX_16BIT_OPERAND);
        break;
    case 1:
        mutate_address_ref(instruction.dst_address, rng, MAX_16BIT_OPERAND);
        break;
    }
}

void InstructionMutator::mutate_sha256compression_instruction(SHA256COMPRESSION_Instruction& instruction,
                                                              std::mt19937_64& rng)
{
    int choice = std::uniform_int_distribution<int>(0, 2)(rng);
    switch (choice) {
    case 0:
        mutate_param_ref(instruction.state_address, rng, MemoryTag::U32, MAX_16BIT_OPERAND);
        break;
    case 1:
        mutate_param_ref(instruction.input_address, rng, MemoryTag::U32, MAX_16BIT_OPERAND);
        break;
    case 2:
        mutate_address_ref(instruction.dst_address, rng, MAX_16BIT_OPERAND);
        break;
    }
}

void InstructionMutator::mutate_toradixbe_instruction(TORADIXBE_Instruction& instruction, std::mt19937_64& rng)
{
    ToRadixBEMutationOptions option = BASIC_TORADIXBE_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case ToRadixBEMutationOptions::value_address:
        mutate_param_ref(instruction.value_address, rng, MemoryTag::FF, MAX_16BIT_OPERAND);
        break;
    case ToRadixBEMutationOptions::radix_address:
        mutate_param_ref(instruction.radix_address, rng, MemoryTag::U32, MAX_16BIT_OPERAND);
        break;
    case ToRadixBEMutationOptions::num_limbs_address:
        mutate_param_ref(instruction.num_limbs_address, rng, MemoryTag::U32, MAX_16BIT_OPERAND);
        break;
    case ToRadixBEMutationOptions::output_bits_address:
        mutate_param_ref(instruction.output_bits_address, rng, MemoryTag::U1, MAX_16BIT_OPERAND);
        break;
    case ToRadixBEMutationOptions::dst_address:
        mutate_address_ref(instruction.dst_address, rng, MAX_16BIT_OPERAND);
        break;
    case ToRadixBEMutationOptions::is_output_bits:
        instruction.is_output_bits = !instruction.is_output_bits;
        break;
    }
}

void InstructionMutator::mutate_debuglog_instruction(DEBUGLOG_Instruction& instruction, std::mt19937_64& rng)
{
    DebugLogMutationOptions option = BASIC_DEBUGLOG_MUTATION_CONFIGURATION.select(rng);
    switch (option) {
    case DebugLogMutationOptions::level_offset:
        mutate_param_ref(instruction.level_offset, rng, MemoryTag::U32, MAX_16BIT_OPERAND);
        break;
    case DebugLogMutationOptions::message_offset:
        mutate_param_ref(instruction.message_offset, rng, MemoryTag::U32, MAX_16BIT_OPERAND);
        break;
    case DebugLogMutationOptions::fields_offset:
        mutate_param_ref(instruction.fields_offset, rng, MemoryTag::U32, MAX_16BIT_OPERAND);
        break;
    case DebugLogMutationOptions::fields_size_offset:
        mutate_param_ref(instruction.fields_size_offset, rng, MemoryTag::U32, MAX_16BIT_OPERAND);
        break;
    case DebugLogMutationOptions::message_size:
        mutate_uint16_t(instruction.message_size, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    }
}

} // namespace bb::avm2::fuzzer
