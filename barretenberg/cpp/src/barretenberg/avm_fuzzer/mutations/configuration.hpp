#pragma once

#include <vector>

#include "barretenberg/avm_fuzzer/common/weighted_selection.hpp"

constexpr uint8_t MAX_MUTATION_NUM = 20;

enum class VecMutationOptions { Insertion, Deletion, Swap, ElementMutation };

using VecMutationConfig = WeightedSelectionConfig<VecMutationOptions, 5>;

constexpr VecMutationConfig BASIC_VEC_MUTATION_CONFIGURATION = VecMutationConfig({
    { VecMutationOptions::Insertion, 7 },
    { VecMutationOptions::Deletion, 22 },
    { VecMutationOptions::Swap, 20 },
    { VecMutationOptions::ElementMutation, 100 },
});

// Generic uint mutation options (used by all uint types)
enum class UintMutationOptions { RandomSelection, IncrementBy1, DecrementBy1, AddRandomValue };

// Type aliases for backward compatibility
using Uint8MutationOptions = UintMutationOptions;
using Uint16MutationOptions = UintMutationOptions;
using Uint32MutationOptions = UintMutationOptions;
using Uint64MutationOptions = UintMutationOptions;
using Uint128MutationOptions = UintMutationOptions;

using Uint8MutationConfig = WeightedSelectionConfig<UintMutationOptions, 5>;
using Uint16MutationConfig = WeightedSelectionConfig<UintMutationOptions, 5>;
using Uint32MutationConfig = WeightedSelectionConfig<UintMutationOptions, 5>;
using Uint64MutationConfig = WeightedSelectionConfig<UintMutationOptions, 5>;
using Uint128MutationConfig = WeightedSelectionConfig<UintMutationOptions, 5>;

constexpr Uint8MutationConfig BASIC_UINT8_T_MUTATION_CONFIGURATION = Uint8MutationConfig({
    { UintMutationOptions::RandomSelection, 7 },
    { UintMutationOptions::IncrementBy1, 22 },
    { UintMutationOptions::DecrementBy1, 20 },
    { UintMutationOptions::AddRandomValue, 10 },
});

constexpr Uint16MutationConfig BASIC_UINT16_T_MUTATION_CONFIGURATION = Uint16MutationConfig({
    { UintMutationOptions::RandomSelection, 7 },
    { UintMutationOptions::IncrementBy1, 22 },
    { UintMutationOptions::DecrementBy1, 20 },
    { UintMutationOptions::AddRandomValue, 10 },
});

constexpr Uint32MutationConfig BASIC_UINT32_T_MUTATION_CONFIGURATION = Uint32MutationConfig({
    { UintMutationOptions::RandomSelection, 7 },
    { UintMutationOptions::IncrementBy1, 22 },
    { UintMutationOptions::DecrementBy1, 20 },
    { UintMutationOptions::AddRandomValue, 10 },
});

constexpr Uint64MutationConfig BASIC_UINT64_T_MUTATION_CONFIGURATION = Uint64MutationConfig({
    { UintMutationOptions::RandomSelection, 7 },
    { UintMutationOptions::IncrementBy1, 22 },
    { UintMutationOptions::DecrementBy1, 20 },
    { UintMutationOptions::AddRandomValue, 10 },
});

constexpr Uint128MutationConfig BASIC_UINT128_T_MUTATION_CONFIGURATION = Uint128MutationConfig({
    { UintMutationOptions::RandomSelection, 7 },
    { UintMutationOptions::IncrementBy1, 22 },
    { UintMutationOptions::DecrementBy1, 20 },
    { UintMutationOptions::AddRandomValue, 10 },
});

enum class FieldMutationOptions { RandomSelection, IncrementBy1, DecrementBy1, AddRandomValue };

using FieldMutationConfig = WeightedSelectionConfig<FieldMutationOptions, 5>;

constexpr FieldMutationConfig BASIC_FIELD_MUTATION_CONFIGURATION = FieldMutationConfig({
    { FieldMutationOptions::RandomSelection, 7 },
    { FieldMutationOptions::IncrementBy1, 22 },
    { FieldMutationOptions::DecrementBy1, 20 },
    { FieldMutationOptions::AddRandomValue, 10 },
});

enum class MemoryTagOptions { U1, U8, U16, U32, U64, U128, FF };

using MemoryTagGenerationConfig = WeightedSelectionConfig<MemoryTagOptions, 7>;

constexpr MemoryTagGenerationConfig BASIC_MEMORY_TAG_GENERATION_CONFIGURATION = MemoryTagGenerationConfig({
    { MemoryTagOptions::U1, 1 },
    { MemoryTagOptions::U8, 1 },
    { MemoryTagOptions::U16, 1 },
    { MemoryTagOptions::U32, 1 },
    { MemoryTagOptions::U64, 1 },
    { MemoryTagOptions::U128, 1 },
    { MemoryTagOptions::FF, 1 },
});

using MemoryTagMutationConfig = WeightedSelectionConfig<MemoryTagOptions, 7>;

constexpr MemoryTagMutationConfig BASIC_MEMORY_TAG_MUTATION_CONFIGURATION = MemoryTagMutationConfig({
    { MemoryTagOptions::U1, 1 },
    { MemoryTagOptions::U8, 1 },
    { MemoryTagOptions::U16, 1 },
    { MemoryTagOptions::U32, 1 },
    { MemoryTagOptions::U64, 1 },
    { MemoryTagOptions::U128, 1 },
    { MemoryTagOptions::FF, 1 },
});

enum class UnaryInstruction8MutationOptions { memory_tag, offset, result_offset };

using UnaryInstruction8MutationConfig = WeightedSelectionConfig<UnaryInstruction8MutationOptions, 3>;

constexpr UnaryInstruction8MutationConfig BASIC_UNARY_INSTRUCTION_8_MUTATION_CONFIGURATION =
    UnaryInstruction8MutationConfig({
        { UnaryInstruction8MutationOptions::memory_tag, 1 },
        { UnaryInstruction8MutationOptions::offset, 1 },
        { UnaryInstruction8MutationOptions::result_offset, 1 },
    });

enum class BinaryInstruction8MutationOptions { memory_tag, a_offset_index, b_offset_index, result_offset };

using BinaryInstruction8MutationConfig = WeightedSelectionConfig<BinaryInstruction8MutationOptions, 4>;

constexpr BinaryInstruction8MutationConfig BASIC_BINARY_INSTRUCTION_8_MUTATION_CONFIGURATION =
    BinaryInstruction8MutationConfig({
        { BinaryInstruction8MutationOptions::memory_tag, 1 },
        { BinaryInstruction8MutationOptions::a_offset_index, 4 },
        { BinaryInstruction8MutationOptions::b_offset_index, 4 },
        { BinaryInstruction8MutationOptions::result_offset, 1 },
    });

enum class Set8MutationOptions { value_tag, offset, value };

using Set8MutationConfig = WeightedSelectionConfig<Set8MutationOptions, 3>;

constexpr Set8MutationConfig BASIC_SET_8_MUTATION_CONFIGURATION = Set8MutationConfig({
    { Set8MutationOptions::value_tag, 1 },
    { Set8MutationOptions::offset, 1 },
    { Set8MutationOptions::value, 1 },
});

enum class Set16MutationOptions { value_tag, offset, value };

using Set16MutationConfig = WeightedSelectionConfig<Set16MutationOptions, 3>;

constexpr Set16MutationConfig BASIC_SET_16_MUTATION_CONFIGURATION = Set16MutationConfig({
    { Set16MutationOptions::value_tag, 1 },
    { Set16MutationOptions::offset, 1 },
    { Set16MutationOptions::value, 1 },
});

enum class Set32MutationOptions { value_tag, offset, value };

using Set32MutationConfig = WeightedSelectionConfig<Set32MutationOptions, 3>;

constexpr Set32MutationConfig BASIC_SET_32_MUTATION_CONFIGURATION = Set32MutationConfig({
    { Set32MutationOptions::value_tag, 1 },
    { Set32MutationOptions::offset, 1 },
    { Set32MutationOptions::value, 1 },
});

enum class Set64MutationOptions { value_tag, offset, value };

using Set64MutationConfig = WeightedSelectionConfig<Set64MutationOptions, 3>;

constexpr Set64MutationConfig BASIC_SET_64_MUTATION_CONFIGURATION = Set64MutationConfig({
    { Set64MutationOptions::value_tag, 1 },
    { Set64MutationOptions::offset, 1 },
    { Set64MutationOptions::value, 1 },
});

enum class Set128MutationOptions { value_tag, offset, value_low, value_high };

using Set128MutationConfig = WeightedSelectionConfig<Set128MutationOptions, 4>;

constexpr Set128MutationConfig BASIC_SET_128_MUTATION_CONFIGURATION = Set128MutationConfig({
    { Set128MutationOptions::value_tag, 1 },
    { Set128MutationOptions::offset, 1 },
    { Set128MutationOptions::value_low, 1 },
    { Set128MutationOptions::value_high, 1 },
});

enum class SetFFMutationOptions { value_tag, offset, value };

using SetFFMutationConfig = WeightedSelectionConfig<SetFFMutationOptions, 3>;

constexpr SetFFMutationConfig BASIC_SET_FF_MUTATION_CONFIGURATION = SetFFMutationConfig({
    { SetFFMutationOptions::value_tag, 1 },
    { SetFFMutationOptions::offset, 1 },
    { SetFFMutationOptions::value, 1 },
});

enum class ReturnMutationOptions { return_size, return_value_tag, return_value_offset_index };

using ReturnMutationConfig = WeightedSelectionConfig<ReturnMutationOptions, 3>;

constexpr ReturnMutationConfig BASIC_RETURN_MUTATION_CONFIGURATION = ReturnMutationConfig({
    { ReturnMutationOptions::return_size, 1 },
    { ReturnMutationOptions::return_value_tag, 1 },
    { ReturnMutationOptions::return_value_offset_index, 1 },
});

enum class InstructionGenerationOptions {
    ADD_8,
    SUB_8,
    MUL_8,
    DIV_8,
    EQ_8,
    LT_8,
    LTE_8,
    AND_8,
    OR_8,
    XOR_8,
    SHL_8,
    SHR_8,
    SET_8,
    SET_16,
    SET_32,
    SET_64,
    SET_128,
    SET_FF,
    ADD_16,
    SUB_16,
    MUL_16,
    DIV_16,
    FDIV_16,
    EQ_16,
    LT_16,
    LTE_16,
    AND_16,
    OR_16,
    XOR_16,
    NOT_16,
    SHL_16,
    SHR_16,
    CAST_8,
    CAST_16,
};

using InstructionGenerationConfig = WeightedSelectionConfig<InstructionGenerationOptions, 34>;

constexpr InstructionGenerationConfig BASIC_INSTRUCTION_GENERATION_CONFIGURATION = InstructionGenerationConfig({
    { InstructionGenerationOptions::ADD_8, 1 },   { InstructionGenerationOptions::SUB_8, 1 },
    { InstructionGenerationOptions::MUL_8, 1 },   { InstructionGenerationOptions::DIV_8, 1 },
    { InstructionGenerationOptions::EQ_8, 1 },    { InstructionGenerationOptions::LT_8, 1 },
    { InstructionGenerationOptions::LTE_8, 1 },   { InstructionGenerationOptions::AND_8, 1 },
    { InstructionGenerationOptions::OR_8, 1 },    { InstructionGenerationOptions::XOR_8, 1 },
    { InstructionGenerationOptions::SHL_8, 1 },   { InstructionGenerationOptions::SHR_8, 1 },
    { InstructionGenerationOptions::SET_8, 1 },   { InstructionGenerationOptions::SET_16, 1 },
    { InstructionGenerationOptions::SET_32, 1 },  { InstructionGenerationOptions::SET_64, 1 },
    { InstructionGenerationOptions::SET_128, 1 }, { InstructionGenerationOptions::SET_FF, 1 },
    { InstructionGenerationOptions::ADD_16, 1 },  { InstructionGenerationOptions::SUB_16, 1 },
    { InstructionGenerationOptions::MUL_16, 1 },  { InstructionGenerationOptions::DIV_16, 1 },
    { InstructionGenerationOptions::FDIV_16, 1 }, { InstructionGenerationOptions::EQ_16, 1 },
    { InstructionGenerationOptions::LT_16, 1 },   { InstructionGenerationOptions::LTE_16, 1 },
    { InstructionGenerationOptions::AND_16, 1 },  { InstructionGenerationOptions::OR_16, 1 },
    { InstructionGenerationOptions::XOR_16, 1 },  { InstructionGenerationOptions::NOT_16, 1 },
    { InstructionGenerationOptions::SHL_16, 1 },  { InstructionGenerationOptions::SHR_16, 1 },
    { InstructionGenerationOptions::CAST_8, 1 },  { InstructionGenerationOptions::CAST_16, 1 },
});

enum class ReturnOptionsMutationOptions { return_size, return_value_tag, return_value_offset_index };

using ReturnOptionsMutationConfig = WeightedSelectionConfig<ReturnOptionsMutationOptions, 3>;

constexpr ReturnOptionsMutationConfig BASIC_RETURN_OPTIONS_MUTATION_CONFIGURATION = ReturnOptionsMutationConfig({
    { ReturnOptionsMutationOptions::return_size, 1 },
    { ReturnOptionsMutationOptions::return_value_tag, 1 },
    { ReturnOptionsMutationOptions::return_value_offset_index, 1 },
});

enum class FuzzerDataMutationOptions {
    InstructionMutation,
    ControlFlowCommandMutation,
    ReturnOptionsMutation,
    CalldataMutation
};

using FuzzerDataMutationConfig = WeightedSelectionConfig<FuzzerDataMutationOptions, 4>;

constexpr FuzzerDataMutationConfig BASIC_FUZZER_DATA_MUTATION_CONFIGURATION = FuzzerDataMutationConfig({
    { FuzzerDataMutationOptions::InstructionMutation, 20 },
    { FuzzerDataMutationOptions::ControlFlowCommandMutation, 1 },
    { FuzzerDataMutationOptions::ReturnOptionsMutation, 1 },
    { FuzzerDataMutationOptions::CalldataMutation, 0 },
});

enum class JumpIfMutationOptions {
    then_program_block_instruction_block_idx,
    else_program_block_instruction_block_idx,
    condition_offset
};
using JumpIfMutationConfig = WeightedSelectionConfig<JumpIfMutationOptions, 3>;

constexpr JumpIfMutationConfig BASIC_JUMP_IF_MUTATION_CONFIGURATION = JumpIfMutationConfig({
    { JumpIfMutationOptions::then_program_block_instruction_block_idx, 1 },
    { JumpIfMutationOptions::else_program_block_instruction_block_idx, 1 },
    { JumpIfMutationOptions::condition_offset, 1 },
});

enum class CFGInstructionGenerationOptions {
    InsertSimpleInstructionBlock,
    JumpToNewBlock,
    JumpIfToNewBlock,
    JumpToBlock,
    JumpIfToBlock,
    FinalizeWithReturn,
    SwitchToNonTerminatedBlock,
};

using CFGInstructionGenerationConfig = WeightedSelectionConfig<CFGInstructionGenerationOptions, 7>;

constexpr CFGInstructionGenerationConfig BASIC_CFG_INSTRUCTION_GENERATION_CONFIGURATION =
    CFGInstructionGenerationConfig({
        { CFGInstructionGenerationOptions::InsertSimpleInstructionBlock, 6 },
        { CFGInstructionGenerationOptions::JumpToNewBlock, 2 },
        { CFGInstructionGenerationOptions::JumpIfToNewBlock, 2 },
        { CFGInstructionGenerationOptions::JumpToBlock, 1 },
        { CFGInstructionGenerationOptions::JumpIfToBlock, 1 },
        { CFGInstructionGenerationOptions::FinalizeWithReturn, 1 },
        { CFGInstructionGenerationOptions::SwitchToNonTerminatedBlock, 1 },
    });

enum class JumpIfToBlockMutationOptions { target_then_block_idx, target_else_block_idx, condition_offset_index };
using JumpIfToBlockMutationConfig = WeightedSelectionConfig<JumpIfToBlockMutationOptions, 3>;

constexpr JumpIfToBlockMutationConfig BASIC_JUMP_IF_TO_BLOCK_MUTATION_CONFIGURATION = JumpIfToBlockMutationConfig({
    { JumpIfToBlockMutationOptions::target_then_block_idx, 1 },
    { JumpIfToBlockMutationOptions::target_else_block_idx, 1 },
    { JumpIfToBlockMutationOptions::condition_offset_index, 1 },
});
