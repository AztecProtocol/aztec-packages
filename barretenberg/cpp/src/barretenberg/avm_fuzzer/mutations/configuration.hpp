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

enum class Uint8MutationOptions { RandomSelection, IncrementBy1, DecrementBy1, AddRandomValue };

using Uint8MutationConfig = WeightedSelectionConfig<Uint8MutationOptions, 5>;

constexpr Uint8MutationConfig BASIC_UINT8_T_MUTATION_CONFIGURATION = Uint8MutationConfig({
    { Uint8MutationOptions::RandomSelection, 7 },
    { Uint8MutationOptions::IncrementBy1, 22 },
    { Uint8MutationOptions::DecrementBy1, 20 },
    { Uint8MutationOptions::AddRandomValue, 10 },
});

enum class Uint16MutationOptions { RandomSelection, IncrementBy1, DecrementBy1, AddRandomValue };

using Uint16MutationConfig = WeightedSelectionConfig<Uint16MutationOptions, 5>;

constexpr Uint16MutationConfig BASIC_UINT16_T_MUTATION_CONFIGURATION = Uint16MutationConfig({
    { Uint16MutationOptions::RandomSelection, 7 },
    { Uint16MutationOptions::IncrementBy1, 22 },
    { Uint16MutationOptions::DecrementBy1, 20 },
    { Uint16MutationOptions::AddRandomValue, 10 },
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

using InstructionGenerationConfig = WeightedSelectionConfig<InstructionGenerationOptions, 29>;

constexpr InstructionGenerationConfig BASIC_INSTRUCTION_GENERATION_CONFIGURATION = InstructionGenerationConfig({
    { InstructionGenerationOptions::ADD_8, 1 },   { InstructionGenerationOptions::SUB_8, 1 },
    { InstructionGenerationOptions::MUL_8, 1 },   { InstructionGenerationOptions::DIV_8, 1 },
    { InstructionGenerationOptions::EQ_8, 1 },    { InstructionGenerationOptions::LT_8, 1 },
    { InstructionGenerationOptions::LTE_8, 1 },   { InstructionGenerationOptions::AND_8, 1 },
    { InstructionGenerationOptions::OR_8, 1 },    { InstructionGenerationOptions::XOR_8, 1 },
    { InstructionGenerationOptions::SHL_8, 1 },   { InstructionGenerationOptions::SHR_8, 1 },
    { InstructionGenerationOptions::SET_8, 1 },   { InstructionGenerationOptions::ADD_16, 1 },
    { InstructionGenerationOptions::SUB_16, 1 },  { InstructionGenerationOptions::MUL_16, 1 },
    { InstructionGenerationOptions::DIV_16, 1 },  { InstructionGenerationOptions::FDIV_16, 1 },
    { InstructionGenerationOptions::EQ_16, 1 },   { InstructionGenerationOptions::LT_16, 1 },
    { InstructionGenerationOptions::LTE_16, 1 },  { InstructionGenerationOptions::AND_16, 1 },
    { InstructionGenerationOptions::OR_16, 1 },   { InstructionGenerationOptions::XOR_16, 1 },
    { InstructionGenerationOptions::NOT_16, 1 },  { InstructionGenerationOptions::SHL_16, 1 },
    { InstructionGenerationOptions::SHR_16, 1 },  { InstructionGenerationOptions::CAST_8, 1 },
    { InstructionGenerationOptions::CAST_16, 1 },
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
