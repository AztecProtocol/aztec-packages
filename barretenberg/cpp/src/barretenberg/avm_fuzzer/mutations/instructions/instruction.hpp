#pragma once

#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_context.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/avm_fuzzer/mutations/instructions/instruction_block.hpp"

namespace bb::avm2::fuzzer {

class InstructionMutator {
  public:
    InstructionMutator(uint32_t base_offset, const FuzzerContext& context)
        : base_offset(base_offset)
        , context(context)
    {}

    InstructionMutator(const InstructionBlock& instruction_block, const FuzzerContext& context)
        : base_offset(instruction_block.base_offset)
        , context(context)
    {}

    /// @brief Generate one instruction and optionally backfill
    std::vector<FuzzInstruction> generate_instruction(std::mt19937_64& rng);
    void mutate_instruction(FuzzInstruction& instruction, std::mt19937_64& rng);

    uint32_t base_offset;
    const FuzzerContext& context;

  private:
    AddressingMode generate_addressing_mode(std::mt19937_64& rng);
    VariableRef generate_variable_ref(std::mt19937_64& rng);
    AddressRef generate_address_ref(std::mt19937_64& rng, uint32_t max_operand_value);

    std::vector<FuzzInstruction> generate_ecadd_instruction(std::mt19937_64& rng);
    template <typename InstructionType>
    std::vector<FuzzInstruction> generate_alu_with_matching_tags(std::mt19937_64& rng, uint32_t max_operand);
    template <typename InstructionType>
    std::vector<FuzzInstruction> generate_alu_with_matching_tags_not_ff(std::mt19937_64& rng, uint32_t max_operand);
    std::vector<FuzzInstruction> generate_fdiv_instruction(std::mt19937_64& rng, uint32_t max_operand);
    std::vector<FuzzInstruction> generate_keccakf_instruction(std::mt19937_64& rng);
    std::vector<FuzzInstruction> generate_sha256compression_instruction(std::mt19937_64& rng);
    std::vector<FuzzInstruction> generate_toradixbe_instruction(std::mt19937_64& rng);
    std::vector<FuzzInstruction> generate_sload_instruction(std::mt19937_64& rng);
    std::vector<FuzzInstruction> generate_emitpubliclog_instruction(std::mt19937_64& rng);
    std::vector<FuzzInstruction> generate_call_instruction(std::mt19937_64& rng);
    std::vector<FuzzInstruction> generate_getcontractinstance_instruction(std::mt19937_64& rng);
    std::vector<FuzzInstruction> generate_notehashexists_instruction(std::mt19937_64& rng);
    std::vector<FuzzInstruction> generate_returndatasize_instruction(std::mt19937_64& rng);
    std::vector<FuzzInstruction> generate_returndatacopy_instruction(std::mt19937_64& rng);
    std::vector<FuzzInstruction> generate_calldatacopy_instruction(std::mt19937_64& rng);
    std::vector<FuzzInstruction> generate_sendl2tol1msg_instruction(std::mt19937_64& rng);

    void mutate_variable_ref(VariableRef& variable, std::mt19937_64& rng, std::optional<MemoryTag> default_tag);
    void mutate_address_ref(AddressRef& address, std::mt19937_64& rng, uint32_t max_operand_value);
    void mutate_param_ref(ParamRef& param,
                          std::mt19937_64& rng,
                          std::optional<MemoryTag> default_tag,
                          uint32_t max_operand_value);
    template <typename BinaryInstructionType>
    void mutate_binary_instruction_8(BinaryInstructionType& instruction, std::mt19937_64& rng);
    template <typename BinaryInstructionType>
    void mutate_binary_instruction_16(BinaryInstructionType& instruction, std::mt19937_64& rng);
    void mutate_not_8_instruction(NOT_8_Instruction& instruction, std::mt19937_64& rng);
    void mutate_set_8_instruction(SET_8_Instruction& instruction, std::mt19937_64& rng);
    void mutate_set_16_instruction(SET_16_Instruction& instruction, std::mt19937_64& rng);
    void mutate_set_32_instruction(SET_32_Instruction& instruction, std::mt19937_64& rng);
    void mutate_set_64_instruction(SET_64_Instruction& instruction, std::mt19937_64& rng);
    void mutate_set_128_instruction(SET_128_Instruction& instruction, std::mt19937_64& rng);
    void mutate_set_ff_instruction(SET_FF_Instruction& instruction, std::mt19937_64& rng);
    void mutate_mov_8_instruction(MOV_8_Instruction& instruction, std::mt19937_64& rng);
    void mutate_mov_16_instruction(MOV_16_Instruction& instruction, std::mt19937_64& rng);
    void mutate_not_16_instruction(NOT_16_Instruction& instruction, std::mt19937_64& rng);
    void mutate_cast_8_instruction(CAST_8_Instruction& instruction, std::mt19937_64& rng);
    void mutate_cast_16_instruction(CAST_16_Instruction& instruction, std::mt19937_64& rng);
    void mutate_sstore_instruction(SSTORE_Instruction& instruction, std::mt19937_64& rng);
    void mutate_sload_instruction(SLOAD_Instruction& instruction, std::mt19937_64& rng);
    void mutate_getenvvar_instruction(GETENVVAR_Instruction& instruction, std::mt19937_64& rng);
    void mutate_emit_nullifier_instruction(EMITNULLIFIER_Instruction& instruction, std::mt19937_64& rng);
    void mutate_nullifier_exists_instruction(NULLIFIEREXISTS_Instruction& instruction, std::mt19937_64& rng);
    void mutate_l1tol2msgexists_instruction(L1TOL2MSGEXISTS_Instruction& instruction, std::mt19937_64& rng);
    void mutate_emit_note_hash_instruction(EMITNOTEHASH_Instruction& instruction, std::mt19937_64& rng);
    void mutate_note_hash_exists_instruction(NOTEHASHEXISTS_Instruction& instruction, std::mt19937_64& rng);
    void mutate_calldatacopy_instruction(CALLDATACOPY_Instruction& instruction, std::mt19937_64& rng);
    void mutate_sendl2tol1msg_instruction(SENDL2TOL1MSG_Instruction& instruction, std::mt19937_64& rng);
    void mutate_emitpubliclog_instruction(EMITPUBLICLOG_Instruction& instruction, std::mt19937_64& rng);
    void mutate_call_instruction(CALL_Instruction& instruction, std::mt19937_64& rng);
    void mutate_returndatasize_instruction(RETURNDATASIZE_Instruction& instruction, std::mt19937_64& rng);
    void mutate_returndatacopy_instruction(RETURNDATACOPY_Instruction& instruction, std::mt19937_64& rng);
    void mutate_getcontractinstance_instruction(GETCONTRACTINSTANCE_Instruction& instruction, std::mt19937_64& rng);
    void mutate_successcopy_instruction(SUCCESSCOPY_Instruction& instruction, std::mt19937_64& rng);
    void mutate_ecadd_instruction(ECADD_Instruction& instruction, std::mt19937_64& rng);
    void mutate_poseidon2perm_instruction(POSEIDON2PERM_Instruction& instruction, std::mt19937_64& rng);
    void mutate_keccakf1600_instruction(KECCAKF1600_Instruction& instruction, std::mt19937_64& rng);
    void mutate_sha256compression_instruction(SHA256COMPRESSION_Instruction& instruction, std::mt19937_64& rng);
    void mutate_toradixbe_instruction(TORADIXBE_Instruction& instruction, std::mt19937_64& rng);
    void mutate_debuglog_instruction(DEBUGLOG_Instruction& instruction, std::mt19937_64& rng);
};

} // namespace bb::avm2::fuzzer
