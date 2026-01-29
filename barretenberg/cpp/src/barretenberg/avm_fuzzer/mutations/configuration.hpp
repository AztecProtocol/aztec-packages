#pragma once

#include <vector>

#include "barretenberg/avm_fuzzer/common/weighted_selection.hpp"

constexpr uint8_t MAX_MUTATION_NUM = 20;

enum class VecMutationOptions { Insertion, Deletion, Swap, ElementMutation };

using VecMutationConfig = WeightedSelectionConfig<VecMutationOptions, 5>;

constexpr VecMutationConfig BASIC_VEC_MUTATION_CONFIGURATION = VecMutationConfig({
    { VecMutationOptions::Insertion, 30 },
    { VecMutationOptions::Deletion, 15 },
    { VecMutationOptions::Swap, 20 },
    { VecMutationOptions::ElementMutation, 100 },
});

// Generic uint mutation options (used by all uint types)
// BoundarySelection picks from a curated set of edge-case values (0, 1, max, midpoint, etc.)
// to dramatically improve coverage of boundary conditions in arithmetic operations
enum class UintMutationOptions { RandomSelection, IncrementBy1, DecrementBy1, AddRandomValue, BoundarySelection };

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
    { UintMutationOptions::BoundarySelection, 25 }, // ~30% - picks boundary values (0, 1, max, midpoint, etc.)
});

constexpr Uint16MutationConfig BASIC_UINT16_T_MUTATION_CONFIGURATION = Uint16MutationConfig({
    { UintMutationOptions::RandomSelection, 7 },
    { UintMutationOptions::IncrementBy1, 22 },
    { UintMutationOptions::DecrementBy1, 20 },
    { UintMutationOptions::AddRandomValue, 10 },
    { UintMutationOptions::BoundarySelection, 25 }, // ~30% - picks boundary values (0, 1, max, midpoint, etc.)
});

constexpr Uint32MutationConfig BASIC_UINT32_T_MUTATION_CONFIGURATION = Uint32MutationConfig({
    { UintMutationOptions::RandomSelection, 7 },
    { UintMutationOptions::IncrementBy1, 22 },
    { UintMutationOptions::DecrementBy1, 20 },
    { UintMutationOptions::AddRandomValue, 10 },
    { UintMutationOptions::BoundarySelection, 25 }, // ~30% - picks boundary values (0, 1, max, midpoint, etc.)
});

constexpr Uint64MutationConfig BASIC_UINT64_T_MUTATION_CONFIGURATION = Uint64MutationConfig({
    { UintMutationOptions::RandomSelection, 7 },
    { UintMutationOptions::IncrementBy1, 22 },
    { UintMutationOptions::DecrementBy1, 20 },
    { UintMutationOptions::AddRandomValue, 10 },
    { UintMutationOptions::BoundarySelection, 25 }, // ~30% - picks boundary values (0, 1, max, midpoint, etc.)
});

constexpr Uint128MutationConfig BASIC_UINT128_T_MUTATION_CONFIGURATION = Uint128MutationConfig({
    { UintMutationOptions::RandomSelection, 7 },
    { UintMutationOptions::IncrementBy1, 22 },
    { UintMutationOptions::DecrementBy1, 20 },
    { UintMutationOptions::AddRandomValue, 10 },
    { UintMutationOptions::BoundarySelection, 25 }, // ~30% - picks boundary values (0, 1, max, midpoint, etc.)
});

// BoundarySelection picks from a curated set of edge-case values (0, 1, p-1, limb boundaries, etc.)
// to dramatically improve coverage of boundary conditions in field arithmetic
enum class FieldMutationOptions { RandomSelection, IncrementBy1, DecrementBy1, AddRandomValue, BoundarySelection };

using FieldMutationConfig = WeightedSelectionConfig<FieldMutationOptions, 5>;

constexpr FieldMutationConfig BASIC_FIELD_MUTATION_CONFIGURATION = FieldMutationConfig({
    { FieldMutationOptions::RandomSelection, 7 },
    { FieldMutationOptions::IncrementBy1, 22 },
    { FieldMutationOptions::DecrementBy1, 20 },
    { FieldMutationOptions::AddRandomValue, 10 },
    { FieldMutationOptions::BoundarySelection, 25 }, // ~30% - picks boundary values (0, 1, p-1, limb boundaries)
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

enum class VariableRefMutationOptions { tag, index, pointer_address, mode };
using VariableRefMutationConfig = WeightedSelectionConfig<VariableRefMutationOptions, 4>;
constexpr VariableRefMutationConfig BASIC_VARIABLE_REF_MUTATION_CONFIGURATION = VariableRefMutationConfig({
    { VariableRefMutationOptions::tag, 3 },
    { VariableRefMutationOptions::index, 4 },
    { VariableRefMutationOptions::pointer_address, 1 },
    { VariableRefMutationOptions::mode, 2 },
});

enum class AddressRefMutationOptions { address, pointer_address, mode };
using AddressRefMutationConfig = WeightedSelectionConfig<AddressRefMutationOptions, 3>;
constexpr AddressRefMutationConfig BASIC_ADDRESS_REF_MUTATION_CONFIGURATION = AddressRefMutationConfig({
    { AddressRefMutationOptions::address, 1 },
    { AddressRefMutationOptions::pointer_address, 1 },
    { AddressRefMutationOptions::mode, 1 },
});

enum class UnaryInstruction8MutationOptions { a_address, result_address };

using UnaryInstruction8MutationConfig = WeightedSelectionConfig<UnaryInstruction8MutationOptions, 2>;

constexpr UnaryInstruction8MutationConfig BASIC_UNARY_INSTRUCTION_8_MUTATION_CONFIGURATION =
    UnaryInstruction8MutationConfig({
        { UnaryInstruction8MutationOptions::a_address, 1 },
        { UnaryInstruction8MutationOptions::result_address, 1 },
    });

enum class BinaryInstruction8MutationOptions { a_address, b_address, result_address };

using BinaryInstruction8MutationConfig = WeightedSelectionConfig<BinaryInstruction8MutationOptions, 3>;

constexpr BinaryInstruction8MutationConfig BASIC_BINARY_INSTRUCTION_8_MUTATION_CONFIGURATION =
    BinaryInstruction8MutationConfig({
        { BinaryInstruction8MutationOptions::a_address, 4 },
        { BinaryInstruction8MutationOptions::b_address, 4 },
        { BinaryInstruction8MutationOptions::result_address, 1 },
    });

enum class Set8MutationOptions { value_tag, result_address, value };

using Set8MutationConfig = WeightedSelectionConfig<Set8MutationOptions, 3>;

constexpr Set8MutationConfig BASIC_SET_8_MUTATION_CONFIGURATION = Set8MutationConfig({
    { Set8MutationOptions::value_tag, 1 },
    { Set8MutationOptions::result_address, 1 },
    { Set8MutationOptions::value, 1 },
});

enum class Set16MutationOptions { value_tag, result_address, value };

using Set16MutationConfig = WeightedSelectionConfig<Set16MutationOptions, 3>;

constexpr Set16MutationConfig BASIC_SET_16_MUTATION_CONFIGURATION = Set16MutationConfig({
    { Set16MutationOptions::value_tag, 1 },
    { Set16MutationOptions::result_address, 1 },
    { Set16MutationOptions::value, 1 },
});

enum class Set32MutationOptions { value_tag, result_address, value };

using Set32MutationConfig = WeightedSelectionConfig<Set32MutationOptions, 3>;

constexpr Set32MutationConfig BASIC_SET_32_MUTATION_CONFIGURATION = Set32MutationConfig({
    { Set32MutationOptions::value_tag, 1 },
    { Set32MutationOptions::result_address, 1 },
    { Set32MutationOptions::value, 1 },
});

enum class Set64MutationOptions { value_tag, result_address, value };

using Set64MutationConfig = WeightedSelectionConfig<Set64MutationOptions, 3>;

constexpr Set64MutationConfig BASIC_SET_64_MUTATION_CONFIGURATION = Set64MutationConfig({
    { Set64MutationOptions::value_tag, 1 },
    { Set64MutationOptions::result_address, 1 },
    { Set64MutationOptions::value, 1 },
});

enum class Set128MutationOptions { value_tag, result_address, value_low, value_high };

using Set128MutationConfig = WeightedSelectionConfig<Set128MutationOptions, 4>;

constexpr Set128MutationConfig BASIC_SET_128_MUTATION_CONFIGURATION = Set128MutationConfig({
    { Set128MutationOptions::value_tag, 1 },
    { Set128MutationOptions::result_address, 1 },
    { Set128MutationOptions::value_low, 1 },
    { Set128MutationOptions::value_high, 1 },
});

enum class SetFFMutationOptions { value_tag, result_address, value };

using SetFFMutationConfig = WeightedSelectionConfig<SetFFMutationOptions, 3>;

constexpr SetFFMutationConfig BASIC_SET_FF_MUTATION_CONFIGURATION = SetFFMutationConfig({
    { SetFFMutationOptions::value_tag, 1 },
    { SetFFMutationOptions::result_address, 1 },
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
    FDIV_8,
    EQ_8,
    LT_8,
    LTE_8,
    AND_8,
    OR_8,
    XOR_8,
    NOT_8,
    SHL_8,
    SHR_8,
    SET_8,
    SET_16,
    SET_32,
    SET_64,
    SET_128,
    SET_FF,
    MOV_8,
    MOV_16,
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
    SSTORE,
    SLOAD,
    GETENVVAR,
    EMITNULLIFIER,
    NULLIFIEREXISTS,
    L1TOL2MSGEXISTS,
    EMITNOTEHASH,
    NOTEHASHEXISTS,
    CALLDATACOPY,
    SENDL2TOL1MSG,
    EMITUNENCRYPTEDLOG,
    CALL,
    RETURNDATASIZE,
    RETURNDATACOPY,
    GETCONTRACTINSTANCE,
    SUCCESSCOPY,
    ECADD,
    POSEIDON2PERM,
    KECCAKF1600,
    SHA256COMPRESSION,
    TORADIXBE,
    DEBUGLOG,
};

using InstructionGenerationConfig = WeightedSelectionConfig<InstructionGenerationOptions, 60>;

constexpr InstructionGenerationConfig BASIC_INSTRUCTION_GENERATION_CONFIGURATION = InstructionGenerationConfig({
    { InstructionGenerationOptions::ADD_8, 1 },
    { InstructionGenerationOptions::SUB_8, 1 },
    { InstructionGenerationOptions::MUL_8, 1 },
    { InstructionGenerationOptions::DIV_8, 1 },
    { InstructionGenerationOptions::FDIV_8, 1 },
    { InstructionGenerationOptions::EQ_8, 1 },
    { InstructionGenerationOptions::LT_8, 1 },
    { InstructionGenerationOptions::LTE_8, 1 },
    { InstructionGenerationOptions::AND_8, 1 },
    { InstructionGenerationOptions::OR_8, 1 },
    { InstructionGenerationOptions::XOR_8, 1 },
    { InstructionGenerationOptions::NOT_8, 1 },
    { InstructionGenerationOptions::SHL_8, 1 },
    { InstructionGenerationOptions::SHR_8, 1 },
    { InstructionGenerationOptions::SET_8, 1 },
    { InstructionGenerationOptions::SET_16, 1 },
    { InstructionGenerationOptions::SET_32, 1 },
    { InstructionGenerationOptions::SET_64, 1 },
    { InstructionGenerationOptions::SET_128, 1 },
    { InstructionGenerationOptions::SET_FF, 1 },
    { InstructionGenerationOptions::MOV_8, 1 },
    { InstructionGenerationOptions::MOV_16, 1 },
    { InstructionGenerationOptions::ADD_16, 1 },
    { InstructionGenerationOptions::SUB_16, 1 },
    { InstructionGenerationOptions::MUL_16, 1 },
    { InstructionGenerationOptions::DIV_16, 1 },
    { InstructionGenerationOptions::FDIV_16, 1 },
    { InstructionGenerationOptions::EQ_16, 1 },
    { InstructionGenerationOptions::LT_16, 1 },
    { InstructionGenerationOptions::LTE_16, 1 },
    { InstructionGenerationOptions::AND_16, 1 },
    { InstructionGenerationOptions::OR_16, 1 },
    { InstructionGenerationOptions::XOR_16, 1 },
    { InstructionGenerationOptions::NOT_16, 1 },
    { InstructionGenerationOptions::SHL_16, 1 },
    { InstructionGenerationOptions::SHR_16, 1 },
    { InstructionGenerationOptions::CAST_8, 1 },
    { InstructionGenerationOptions::CAST_16, 1 },
    { InstructionGenerationOptions::SSTORE, 1 },
    { InstructionGenerationOptions::SLOAD, 0 },
    { InstructionGenerationOptions::GETENVVAR, 1 },
    { InstructionGenerationOptions::EMITNULLIFIER, 1 },
    { InstructionGenerationOptions::NULLIFIEREXISTS, 1 },
    { InstructionGenerationOptions::L1TOL2MSGEXISTS, 1 },
    { InstructionGenerationOptions::EMITNOTEHASH, 1 },
    { InstructionGenerationOptions::NOTEHASHEXISTS, 1 },
    { InstructionGenerationOptions::CALLDATACOPY, 1 },
    { InstructionGenerationOptions::SENDL2TOL1MSG, 1 },
    { InstructionGenerationOptions::EMITUNENCRYPTEDLOG, 1 },
    { InstructionGenerationOptions::CALL, 1 },
    { InstructionGenerationOptions::RETURNDATASIZE, 1 },
    { InstructionGenerationOptions::RETURNDATACOPY, 1 },
    { InstructionGenerationOptions::GETCONTRACTINSTANCE, 1 },
    { InstructionGenerationOptions::SUCCESSCOPY, 1 },
    { InstructionGenerationOptions::ECADD, 1 },
    { InstructionGenerationOptions::POSEIDON2PERM, 1 },
    { InstructionGenerationOptions::KECCAKF1600, 1 },
    { InstructionGenerationOptions::SHA256COMPRESSION, 1 },
    { InstructionGenerationOptions::TORADIXBE, 1 },
    { InstructionGenerationOptions::DEBUGLOG, 1 },
});

enum class SStoreMutationOptions { src_address, result_address, slot };
using SStoreMutationConfig = WeightedSelectionConfig<SStoreMutationOptions, 3>;

constexpr SStoreMutationConfig BASIC_SSTORE_MUTATION_CONFIGURATION = SStoreMutationConfig({
    { SStoreMutationOptions::src_address, 1 },
    { SStoreMutationOptions::result_address, 1 },
    { SStoreMutationOptions::slot, 1 },
});

enum class SLoadMutationOptions { slot_index, slot_address, contract_address_address, result_address };
using SLoadMutationConfig = WeightedSelectionConfig<SLoadMutationOptions, 4>;

constexpr SLoadMutationConfig BASIC_SLOAD_MUTATION_CONFIGURATION = SLoadMutationConfig({
    { SLoadMutationOptions::slot_index, 1 },
    { SLoadMutationOptions::slot_address, 1 },
    { SLoadMutationOptions::contract_address_address, 1 },
    { SLoadMutationOptions::result_address, 1 },
});

enum class GetEnvVarMutationOptions { result_address, type };
using GetEnvVarMutationConfig = WeightedSelectionConfig<GetEnvVarMutationOptions, 2>;

constexpr GetEnvVarMutationConfig BASIC_GETENVVAR_MUTATION_CONFIGURATION = GetEnvVarMutationConfig({
    { GetEnvVarMutationOptions::result_address, 1 },
    { GetEnvVarMutationOptions::type, 1 },
});

enum class NullifierExistsMutationOptions { nullifier_address, contract_address_address, result_address };
using NullifierExistsMutationConfig = WeightedSelectionConfig<NullifierExistsMutationOptions, 3>;

constexpr NullifierExistsMutationConfig BASIC_NULLIFIER_EXISTS_MUTATION_CONFIGURATION = NullifierExistsMutationConfig({
    { NullifierExistsMutationOptions::nullifier_address, 1 },
    { NullifierExistsMutationOptions::contract_address_address, 1 },
    { NullifierExistsMutationOptions::result_address, 1 },
});

enum class L1ToL2MsgExistsMutationOptions { msg_hash_address, leaf_index_address, result_address };
using L1ToL2MsgExistsMutationConfig = WeightedSelectionConfig<L1ToL2MsgExistsMutationOptions, 3>;

constexpr L1ToL2MsgExistsMutationConfig BASIC_L1TOL2MSGEXISTS_MUTATION_CONFIGURATION = L1ToL2MsgExistsMutationConfig({
    { L1ToL2MsgExistsMutationOptions::msg_hash_address, 1 },
    { L1ToL2MsgExistsMutationOptions::leaf_index_address, 1 },
    { L1ToL2MsgExistsMutationOptions::result_address, 1 },
});

enum class EmitNoteHashMutationOptions { note_hash_address, note_hash };
using EmitNoteHashMutationConfig = WeightedSelectionConfig<EmitNoteHashMutationOptions, 2>;

constexpr EmitNoteHashMutationConfig BASIC_EMITNOTEHASH_MUTATION_CONFIGURATION = EmitNoteHashMutationConfig({
    { EmitNoteHashMutationOptions::note_hash_address, 1 },
    { EmitNoteHashMutationOptions::note_hash, 1 },
});

enum class NoteHashExistsMutationOptions { notehash_address, leaf_index_address, result_address };
using NoteHashExistsMutationConfig = WeightedSelectionConfig<NoteHashExistsMutationOptions, 3>;

constexpr NoteHashExistsMutationConfig BASIC_NOTEHASHEXISTS_MUTATION_CONFIGURATION = NoteHashExistsMutationConfig({
    { NoteHashExistsMutationOptions::notehash_address, 1 },
    { NoteHashExistsMutationOptions::leaf_index_address, 1 },
    { NoteHashExistsMutationOptions::result_address, 1 },
});

enum class CalldataCopyMutationOptions {
    copy_size_address,
    cd_offset_address,
    dst_address,
};
using CalldataCopyMutationConfig = WeightedSelectionConfig<CalldataCopyMutationOptions, 3>;

constexpr CalldataCopyMutationConfig BASIC_CALLDATACOPY_MUTATION_CONFIGURATION = CalldataCopyMutationConfig({
    { CalldataCopyMutationOptions::copy_size_address, 1 },
    { CalldataCopyMutationOptions::cd_offset_address, 1 },
    { CalldataCopyMutationOptions::dst_address, 1 },
});

enum class SendL2ToL1MsgMutationOptions { recipient, recipient_address, content, content_address };
using SendL2ToL1MsgMutationConfig = WeightedSelectionConfig<SendL2ToL1MsgMutationOptions, 4>;

constexpr SendL2ToL1MsgMutationConfig BASIC_SENDL2TOL1MSG_MUTATION_CONFIGURATION = SendL2ToL1MsgMutationConfig({
    { SendL2ToL1MsgMutationOptions::recipient, 1 },
    { SendL2ToL1MsgMutationOptions::recipient_address, 1 },
    { SendL2ToL1MsgMutationOptions::content, 1 },
    { SendL2ToL1MsgMutationOptions::content_address, 1 },
});

enum class EmitUnencryptedLogMutationOptions { log_size_address, log_values_address };
using EmitUnencryptedLogMutationConfig = WeightedSelectionConfig<EmitUnencryptedLogMutationOptions, 2>;

constexpr EmitUnencryptedLogMutationConfig BASIC_EMITUNENCRYPTEDLOG_MUTATION_CONFIGURATION =
    EmitUnencryptedLogMutationConfig({
        { EmitUnencryptedLogMutationOptions::log_size_address, 1 },
        { EmitUnencryptedLogMutationOptions::log_values_address, 1 },
    });

enum class CallMutationOptions {
    l2_gas_address,
    da_gas_address,
    contract_address_address,
    calldata_size_address,
    calldata_size,
    calldata_address,
    is_static_call
};
using CallMutationConfig = WeightedSelectionConfig<CallMutationOptions, 7>;

constexpr CallMutationConfig BASIC_CALL_MUTATION_CONFIGURATION = CallMutationConfig({
    { CallMutationOptions::l2_gas_address, 1 },
    { CallMutationOptions::da_gas_address, 1 },
    { CallMutationOptions::contract_address_address, 1 },
    { CallMutationOptions::calldata_size_address, 1 },
    { CallMutationOptions::calldata_size, 1 },
    { CallMutationOptions::calldata_address, 1 },
    { CallMutationOptions::is_static_call, 1 },
});

enum class ReturndataCopyMutationOptions { copy_size_address, rd_offset_address, dst_address };
using ReturndataCopyMutationConfig = WeightedSelectionConfig<ReturndataCopyMutationOptions, 3>;

constexpr ReturndataCopyMutationConfig BASIC_RETURNDATACOPY_MUTATION_CONFIGURATION = ReturndataCopyMutationConfig({
    { ReturndataCopyMutationOptions::copy_size_address, 1 },
    { ReturndataCopyMutationOptions::rd_offset_address, 1 },
    { ReturndataCopyMutationOptions::dst_address, 1 },
});

enum class GetContractInstanceMutationOptions { contract_address_address, dst_address, member_enum };
using GetContractInstanceMutationConfig = WeightedSelectionConfig<GetContractInstanceMutationOptions, 3>;

constexpr GetContractInstanceMutationConfig BASIC_GETCONTRACTINSTANCE_MUTATION_CONFIGURATION =
    GetContractInstanceMutationConfig({
        { GetContractInstanceMutationOptions::contract_address_address, 1 },
        { GetContractInstanceMutationOptions::dst_address, 1 },
        { GetContractInstanceMutationOptions::member_enum, 1 },
    });

enum class SuccessCopyMutationOptions { dst_address };
using SuccessCopyMutationConfig = WeightedSelectionConfig<SuccessCopyMutationOptions, 1>;

constexpr SuccessCopyMutationConfig BASIC_SUCCESSCOPY_MUTATION_CONFIGURATION = SuccessCopyMutationConfig({
    { SuccessCopyMutationOptions::dst_address, 1 },
});

enum class ToRadixBEMutationOptions {
    value_address,
    radix_address,
    num_limbs_address,
    output_bits_address,
    dst_address,
    is_output_bits
};
using ToRadixBEMutationConfig = WeightedSelectionConfig<ToRadixBEMutationOptions, 6>;

constexpr ToRadixBEMutationConfig BASIC_TORADIXBE_MUTATION_CONFIGURATION = ToRadixBEMutationConfig({
    { ToRadixBEMutationOptions::value_address, 1 },
    { ToRadixBEMutationOptions::radix_address, 1 },
    { ToRadixBEMutationOptions::num_limbs_address, 1 },
    { ToRadixBEMutationOptions::output_bits_address, 1 },
    { ToRadixBEMutationOptions::dst_address, 1 },
    { ToRadixBEMutationOptions::is_output_bits, 1 },
});

enum class DebugLogMutationOptions { level_offset, message_offset, fields_offset, fields_size_offset, message_size };
using DebugLogMutationConfig = WeightedSelectionConfig<DebugLogMutationOptions, 5>;

constexpr DebugLogMutationConfig BASIC_DEBUGLOG_MUTATION_CONFIGURATION = DebugLogMutationConfig({
    { DebugLogMutationOptions::level_offset, 1 },
    { DebugLogMutationOptions::message_offset, 1 },
    { DebugLogMutationOptions::fields_offset, 1 },
    { DebugLogMutationOptions::fields_size_offset, 1 },
    { DebugLogMutationOptions::message_size, 1 },
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
    { FuzzerDataMutationOptions::CalldataMutation, 5 },
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
    FinalizeWithRevert,
    SwitchToNonTerminatedBlock,
    InsertInternalCall,
};

using CFGInstructionGenerationConfig = WeightedSelectionConfig<CFGInstructionGenerationOptions, 9>;

constexpr CFGInstructionGenerationConfig BASIC_CFG_INSTRUCTION_GENERATION_CONFIGURATION =
    CFGInstructionGenerationConfig({
        { CFGInstructionGenerationOptions::InsertSimpleInstructionBlock, 60 },
        { CFGInstructionGenerationOptions::JumpToNewBlock, 20 },
        { CFGInstructionGenerationOptions::JumpIfToNewBlock, 20 },
        { CFGInstructionGenerationOptions::JumpToBlock, 15 },
        { CFGInstructionGenerationOptions::JumpIfToBlock, 15 },
        { CFGInstructionGenerationOptions::FinalizeWithReturn, 7 },
        { CFGInstructionGenerationOptions::FinalizeWithRevert, 3 },
        { CFGInstructionGenerationOptions::SwitchToNonTerminatedBlock, 8 },
        { CFGInstructionGenerationOptions::InsertInternalCall, 3 },
    });

enum class JumpIfToBlockMutationOptions { target_then_block_idx, target_else_block_idx, condition_offset_index };
using JumpIfToBlockMutationConfig = WeightedSelectionConfig<JumpIfToBlockMutationOptions, 3>;

constexpr JumpIfToBlockMutationConfig BASIC_JUMP_IF_TO_BLOCK_MUTATION_CONFIGURATION = JumpIfToBlockMutationConfig({
    { JumpIfToBlockMutationOptions::target_then_block_idx, 1 },
    { JumpIfToBlockMutationOptions::target_else_block_idx, 1 },
    { JumpIfToBlockMutationOptions::condition_offset_index, 1 },
});

// ============== FAULT INJECTION CONFIGURATIONS ==============

// TODO(defkit): Implement fault injection for all events
enum class FaultInjectionEventOptions {
    AluEvent,
    BitwiseEvent,
    RangeCheckEvent,
    GtEvent,
    EcaddEvent,
    EcaddMemoryEvent,
    ScalarMulEvent,
    Poseidon2Event,
    ToRadixEvent,
    BytecodeEvent,
    MemoryEvent,
    AddressDerivationEvent,
    ClassIdDerivationEvent,
    Sha256CompressionEvent,
    KeccakF1600Event,
    DataCopyEvent,
    CalldataEvent,
};
using FaultInjectionEventConfig = WeightedSelectionConfig<FaultInjectionEventOptions, 17>;

constexpr FaultInjectionEventConfig BASIC_FAULT_INJECTION_EVENT_CONFIGURATION = FaultInjectionEventConfig({
    { FaultInjectionEventOptions::AluEvent, 1 },
    { FaultInjectionEventOptions::BitwiseEvent, 1 },
    { FaultInjectionEventOptions::RangeCheckEvent, 1 },
    { FaultInjectionEventOptions::GtEvent, 1 },
    { FaultInjectionEventOptions::EcaddEvent, 1 },
    { FaultInjectionEventOptions::EcaddMemoryEvent, 1 },
    { FaultInjectionEventOptions::ScalarMulEvent, 1 },
    { FaultInjectionEventOptions::Poseidon2Event, 1 },
    { FaultInjectionEventOptions::ToRadixEvent, 0 },
    { FaultInjectionEventOptions::BytecodeEvent, 1 },
    { FaultInjectionEventOptions::MemoryEvent, 1 },
    { FaultInjectionEventOptions::AddressDerivationEvent, 1 },
    { FaultInjectionEventOptions::ClassIdDerivationEvent, 1 },
    { FaultInjectionEventOptions::Sha256CompressionEvent, 1 },
    { FaultInjectionEventOptions::KeccakF1600Event, 1 },
    { FaultInjectionEventOptions::DataCopyEvent, 1 },
    { FaultInjectionEventOptions::CalldataEvent, 1 },
});

enum class MemoryValueMutationOptions { Tag, Add1, Sub1, SetMin, SetMax };
using MemoryValueMutationConfig = WeightedSelectionConfig<MemoryValueMutationOptions, 5>;

constexpr MemoryValueMutationConfig BASIC_MEMORY_VALUE_MUTATION_CONFIGURATION = MemoryValueMutationConfig({
    { MemoryValueMutationOptions::Tag, 1 },
    { MemoryValueMutationOptions::Add1, 40 },
    { MemoryValueMutationOptions::Sub1, 40 },
    { MemoryValueMutationOptions::SetMin, 3 },
    { MemoryValueMutationOptions::SetMax, 2 },
});

enum class FaultInjectionAluEventOptions { Operand, Result, Operation, FlipError };
using FaultInjectionAluEventConfig = WeightedSelectionConfig<FaultInjectionAluEventOptions, 4>;

constexpr FaultInjectionAluEventConfig BASIC_FAULT_INJECTION_ALU_EVENT_CONFIGURATION = FaultInjectionAluEventConfig({
    { FaultInjectionAluEventOptions::Operand,
      100 }, // Mutates a or b with 50% probability. If op is unary mutation will be on a.
    { FaultInjectionAluEventOptions::Result, 80 }, // Mutates c
    { FaultInjectionAluEventOptions::Operation, 7 },
    { FaultInjectionAluEventOptions::FlipError, 3 },
});

enum class FaultInjectionBitwiseEventOptions { Operand, Result, Operation };
using FaultInjectionBitwiseEventConfig = WeightedSelectionConfig<FaultInjectionBitwiseEventOptions, 3>;

constexpr FaultInjectionBitwiseEventConfig BASIC_FAULT_INJECTION_BITWISE_EVENT_CONFIGURATION =
    FaultInjectionBitwiseEventConfig({
        { FaultInjectionBitwiseEventOptions::Operand, 100 },
        { FaultInjectionBitwiseEventOptions::Result, 80 },
        { FaultInjectionBitwiseEventOptions::Operation, 2 },
    });

enum class FaultInjectionRangeCheckEventOptions { Value, NumBits };
using FaultInjectionRangeCheckEventConfig = WeightedSelectionConfig<FaultInjectionRangeCheckEventOptions, 2>;

constexpr FaultInjectionRangeCheckEventConfig BASIC_FAULT_INJECTION_RANGE_CHECK_EVENT_CONFIGURATION =
    FaultInjectionRangeCheckEventConfig({
        { FaultInjectionRangeCheckEventOptions::Value, 1 },
        { FaultInjectionRangeCheckEventOptions::NumBits, 1 },
    });

enum class FaultInjectionGtEventOptions { A, B, Result };
using FaultInjectionGtEventConfig = WeightedSelectionConfig<FaultInjectionGtEventOptions, 3>;

constexpr FaultInjectionGtEventConfig BASIC_FAULT_INJECTION_GT_EVENT_CONFIGURATION = FaultInjectionGtEventConfig({
    { FaultInjectionGtEventOptions::A, 1 },
    { FaultInjectionGtEventOptions::B, 1 },
    { FaultInjectionGtEventOptions::Result, 1 },
});

enum class FaultInjectionEccAddMemoryEventOptions : uint8_t {
    PointP,
    PointQ,
    Result,
    DstAddress,
    SpaceId,
    ExecutionClk,
};
using FaultInjectionEccAddMemoryEventConfig = WeightedSelectionConfig<FaultInjectionEccAddMemoryEventOptions, 6>;
constexpr FaultInjectionEccAddMemoryEventConfig BASIC_FAULT_INJECTION_ECCADD_MEMORY_EVENT_CONFIGURATION =
    FaultInjectionEccAddMemoryEventConfig({
        { FaultInjectionEccAddMemoryEventOptions::PointP, 1 },
        { FaultInjectionEccAddMemoryEventOptions::PointQ, 1 },
        { FaultInjectionEccAddMemoryEventOptions::Result, 1 },
        { FaultInjectionEccAddMemoryEventOptions::DstAddress, 1 },
        { FaultInjectionEccAddMemoryEventOptions::SpaceId, 1 },
        { FaultInjectionEccAddMemoryEventOptions::ExecutionClk, 1 },
    });

enum class FaultInjectionPoseidon2HashEventOptions : uint8_t { Input, IntermediateState, Output };
using FaultInjectionPoseidon2HashEventConfig = WeightedSelectionConfig<FaultInjectionPoseidon2HashEventOptions, 3>;
constexpr FaultInjectionPoseidon2HashEventConfig BASIC_FAULT_INJECTION_POSEIDON2_HASH_EVENT_CONFIGURATION =
    FaultInjectionPoseidon2HashEventConfig({
        { FaultInjectionPoseidon2HashEventOptions::Input, 1 },
        { FaultInjectionPoseidon2HashEventOptions::IntermediateState, 1 },
        { FaultInjectionPoseidon2HashEventOptions::Output, 1 },
    });

enum class FaultInjectionPoseidon2PermEventOptions : uint8_t { Input, Output };
using FaultInjectionPoseidon2PermEventConfig = WeightedSelectionConfig<FaultInjectionPoseidon2PermEventOptions, 2>;
constexpr FaultInjectionPoseidon2PermEventConfig BASIC_FAULT_INJECTION_POSEIDON2_PERM_EVENT_CONFIGURATION =
    FaultInjectionPoseidon2PermEventConfig({
        { FaultInjectionPoseidon2PermEventOptions::Input, 1 },
        { FaultInjectionPoseidon2PermEventOptions::Output, 1 },
    });

enum class FaultInjectionPoseidon2PermMemoryEventOptions : uint8_t {
    Input,
    Output,
    SrcAddress,
    DstAddress,
    SpaceId,
    ExecutionClk,
};
using FaultInjectionPoseidon2PermMemoryEventConfig =
    WeightedSelectionConfig<FaultInjectionPoseidon2PermMemoryEventOptions, 6>;
constexpr FaultInjectionPoseidon2PermMemoryEventConfig BASIC_FAULT_INJECTION_POSEIDON2_PERM_MEMORY_EVENT_CONFIGURATION =
    FaultInjectionPoseidon2PermMemoryEventConfig({
        { FaultInjectionPoseidon2PermMemoryEventOptions::Input, 1 },
        { FaultInjectionPoseidon2PermMemoryEventOptions::Output, 1 },
        { FaultInjectionPoseidon2PermMemoryEventOptions::SrcAddress, 1 },
        { FaultInjectionPoseidon2PermMemoryEventOptions::DstAddress, 1 },
        { FaultInjectionPoseidon2PermMemoryEventOptions::SpaceId, 1 },
        { FaultInjectionPoseidon2PermMemoryEventOptions::ExecutionClk, 1 },
    });

enum class FaultInjectionToRadixEventOptions : uint8_t { Value, Radix, Limbs };
using FaultInjectionToRadixEventConfig = WeightedSelectionConfig<FaultInjectionToRadixEventOptions, 3>;
constexpr FaultInjectionToRadixEventConfig BASIC_FAULT_INJECTION_TORADIX_EVENT_CONFIGURATION =
    FaultInjectionToRadixEventConfig({
        { FaultInjectionToRadixEventOptions::Value, 1 },
        { FaultInjectionToRadixEventOptions::Radix, 1 },
        { FaultInjectionToRadixEventOptions::Limbs, 1 },
    });

enum class FaultInjectionToRadixMemoryEventOptions : uint8_t {
    Value,
    Radix,
    NumLimbs,
    DstAddress,
    SpaceId,
    ExecutionClk,
    IsOutputBits,
    Limbs,
};
using FaultInjectionToRadixMemoryEventConfig = WeightedSelectionConfig<FaultInjectionToRadixMemoryEventOptions, 8>;
constexpr FaultInjectionToRadixMemoryEventConfig BASIC_FAULT_INJECTION_TORADIX_MEMORY_EVENT_CONFIGURATION =
    FaultInjectionToRadixMemoryEventConfig({
        { FaultInjectionToRadixMemoryEventOptions::Value, 1 },
        { FaultInjectionToRadixMemoryEventOptions::Radix, 1 },
        { FaultInjectionToRadixMemoryEventOptions::NumLimbs, 1 },
        { FaultInjectionToRadixMemoryEventOptions::DstAddress, 1 },
        { FaultInjectionToRadixMemoryEventOptions::SpaceId, 1 },
        { FaultInjectionToRadixMemoryEventOptions::ExecutionClk, 1 },
        { FaultInjectionToRadixMemoryEventOptions::IsOutputBits, 1 },
        { FaultInjectionToRadixMemoryEventOptions::Limbs, 1 },
    });

enum class FaultInjectionBytecodeEventOptions : uint8_t { Retrieval, Hashing, Decomposition, InstructionFetching };
using FaultInjectionBytecodeEventConfig = WeightedSelectionConfig<FaultInjectionBytecodeEventOptions, 4>;
constexpr FaultInjectionBytecodeEventConfig BASIC_FAULT_INJECTION_BYTECODE_EVENT_CONFIGURATION =
    FaultInjectionBytecodeEventConfig({
        { FaultInjectionBytecodeEventOptions::Retrieval, 1 },
        { FaultInjectionBytecodeEventOptions::Hashing, 1 },
        { FaultInjectionBytecodeEventOptions::Decomposition, 1 },
        { FaultInjectionBytecodeEventOptions::InstructionFetching, 1 },
    });

enum class FaultInjectionBytecodeRetrievalSnapshotOptions : uint8_t { Root, NextIndex };
using FaultInjectionBytecodeRetrievalSnapshotConfig =
    WeightedSelectionConfig<FaultInjectionBytecodeRetrievalSnapshotOptions, 2>;
constexpr FaultInjectionBytecodeRetrievalSnapshotConfig
    BASIC_FAULT_INJECTION_BYTECODE_RETRIEVAL_SNAPSHOT_CONFIGURATION = FaultInjectionBytecodeRetrievalSnapshotConfig({
        { FaultInjectionBytecodeRetrievalSnapshotOptions::Root, 1 },
        { FaultInjectionBytecodeRetrievalSnapshotOptions::NextIndex, 1 },
    });

enum class FaultInjectionBytecodeRetrievalEventOptions : uint8_t {
    BytecodeId,
    Address,
    CurrentClassId,
    ContractClassArtifactHash,
    ContractClassPrivateFunctionsRoot,
    NullifierRoot,
    PublicDataTreeRoot,
    SnapshotBefore,
    SnapshotAfter,
    Flags,
};
using FaultInjectionBytecodeRetrievalEventConfig =
    WeightedSelectionConfig<FaultInjectionBytecodeRetrievalEventOptions, 10>;
constexpr FaultInjectionBytecodeRetrievalEventConfig BASIC_FAULT_INJECTION_BYTECODE_RETRIEVAL_EVENT_CONFIGURATION =
    FaultInjectionBytecodeRetrievalEventConfig({
        { FaultInjectionBytecodeRetrievalEventOptions::BytecodeId, 1 },
        { FaultInjectionBytecodeRetrievalEventOptions::Address, 1 },
        { FaultInjectionBytecodeRetrievalEventOptions::CurrentClassId, 1 },
        { FaultInjectionBytecodeRetrievalEventOptions::ContractClassArtifactHash, 1 },
        { FaultInjectionBytecodeRetrievalEventOptions::ContractClassPrivateFunctionsRoot, 1 },
        { FaultInjectionBytecodeRetrievalEventOptions::NullifierRoot, 1 },
        { FaultInjectionBytecodeRetrievalEventOptions::PublicDataTreeRoot, 1 },
        { FaultInjectionBytecodeRetrievalEventOptions::SnapshotBefore, 1 },
        { FaultInjectionBytecodeRetrievalEventOptions::SnapshotAfter, 1 },
        { FaultInjectionBytecodeRetrievalEventOptions::Flags, 1 },
    });

enum class FaultInjectionBytecodeHashingEventOptions : uint8_t { BytecodeId, BytecodeLength, Field };
using FaultInjectionBytecodeHashingEventConfig = WeightedSelectionConfig<FaultInjectionBytecodeHashingEventOptions, 3>;
constexpr FaultInjectionBytecodeHashingEventConfig BASIC_FAULT_INJECTION_BYTECODE_HASHING_EVENT_CONFIGURATION =
    FaultInjectionBytecodeHashingEventConfig({
        { FaultInjectionBytecodeHashingEventOptions::BytecodeId, 1 },
        { FaultInjectionBytecodeHashingEventOptions::BytecodeLength, 1 },
        { FaultInjectionBytecodeHashingEventOptions::Field, 1 },
    });

enum class FaultInjectionBytecodeDecompositionEventOptions : uint8_t { BytecodeId, Byte };
using FaultInjectionBytecodeDecompositionEventConfig =
    WeightedSelectionConfig<FaultInjectionBytecodeDecompositionEventOptions, 2>;
constexpr FaultInjectionBytecodeDecompositionEventConfig BASIC_FAULT_INJECTION_BYTECODE_DECOMP_EVENT_CONFIGURATION =
    FaultInjectionBytecodeDecompositionEventConfig({
        { FaultInjectionBytecodeDecompositionEventOptions::BytecodeId, 1 },
        { FaultInjectionBytecodeDecompositionEventOptions::Byte, 1 },
    });

enum class FaultInjectionInstructionFetchingEventOptions : uint8_t {
    Pc,
    AddressingMode,
    Operand,
    BytecodeByte,
    Error,
};
using FaultInjectionInstructionFetchingEventConfig =
    WeightedSelectionConfig<FaultInjectionInstructionFetchingEventOptions, 5>;
constexpr FaultInjectionInstructionFetchingEventConfig BASIC_FAULT_INJECTION_INSTR_FETCH_EVENT_CONFIGURATION =
    FaultInjectionInstructionFetchingEventConfig({
        { FaultInjectionInstructionFetchingEventOptions::Pc, 1 },
        { FaultInjectionInstructionFetchingEventOptions::AddressingMode, 1 },
        { FaultInjectionInstructionFetchingEventOptions::Operand, 1 },
        { FaultInjectionInstructionFetchingEventOptions::BytecodeByte, 1 },
        { FaultInjectionInstructionFetchingEventOptions::Error, 1 },
    });

enum class FaultInjectionMemoryEventOptions : uint8_t { Value, Address, SpaceId, ExecutionClk, Mode };
using FaultInjectionMemoryEventConfig = WeightedSelectionConfig<FaultInjectionMemoryEventOptions, 5>;
constexpr FaultInjectionMemoryEventConfig BASIC_FAULT_INJECTION_MEMORY_EVENT_CONFIGURATION =
    FaultInjectionMemoryEventConfig({
        { FaultInjectionMemoryEventOptions::Value, 1 },
        { FaultInjectionMemoryEventOptions::Address, 1 },
        { FaultInjectionMemoryEventOptions::SpaceId, 1 },
        { FaultInjectionMemoryEventOptions::ExecutionClk, 1 },
        { FaultInjectionMemoryEventOptions::Mode, 1 },
    });

enum class FaultInjectionAddressDerivationEventOptions : uint8_t {
    Address,
    Salt,
    Deployer,
    ClassId,
    InitHash,
    NullifierKey,
    IncomingViewingKey,
    OutgoingViewingKey,
    TaggingKey,
    SaltedInitHash,
    PartialAddress,
    PublicKeysHash,
    Preaddress,
    PreaddressPublicKey,
    AddressPoint,
};
using FaultInjectionAddressDerivationEventConfig =
    WeightedSelectionConfig<FaultInjectionAddressDerivationEventOptions, 15>;
constexpr FaultInjectionAddressDerivationEventConfig BASIC_FAULT_INJECTION_ADDRESS_DERIVATION_EVENT_CONFIGURATION =
    FaultInjectionAddressDerivationEventConfig({
        { FaultInjectionAddressDerivationEventOptions::Address, 1 },
        { FaultInjectionAddressDerivationEventOptions::Salt, 1 },
        { FaultInjectionAddressDerivationEventOptions::Deployer, 1 },
        { FaultInjectionAddressDerivationEventOptions::ClassId, 1 },
        { FaultInjectionAddressDerivationEventOptions::InitHash, 1 },
        { FaultInjectionAddressDerivationEventOptions::NullifierKey, 1 },
        { FaultInjectionAddressDerivationEventOptions::IncomingViewingKey, 1 },
        { FaultInjectionAddressDerivationEventOptions::OutgoingViewingKey, 1 },
        { FaultInjectionAddressDerivationEventOptions::TaggingKey, 1 },
        { FaultInjectionAddressDerivationEventOptions::SaltedInitHash, 1 },
        { FaultInjectionAddressDerivationEventOptions::PartialAddress, 1 },
        { FaultInjectionAddressDerivationEventOptions::PublicKeysHash, 1 },
        { FaultInjectionAddressDerivationEventOptions::Preaddress, 1 },
        { FaultInjectionAddressDerivationEventOptions::PreaddressPublicKey, 1 },
        { FaultInjectionAddressDerivationEventOptions::AddressPoint, 1 },
    });

enum class FaultInjectionClassIdDerivationEventOptions : uint8_t {
    ClassId,
    ArtifactHash,
    PrivateFunctionsRoot,
    PublicBytecodeCommitment,
};
using FaultInjectionClassIdDerivationEventConfig =
    WeightedSelectionConfig<FaultInjectionClassIdDerivationEventOptions, 4>;
constexpr FaultInjectionClassIdDerivationEventConfig BASIC_FAULT_INJECTION_CLASS_ID_DERIVATION_EVENT_CONFIGURATION =
    FaultInjectionClassIdDerivationEventConfig({
        { FaultInjectionClassIdDerivationEventOptions::ClassId, 1 },
        { FaultInjectionClassIdDerivationEventOptions::ArtifactHash, 1 },
        { FaultInjectionClassIdDerivationEventOptions::PrivateFunctionsRoot, 1 },
        { FaultInjectionClassIdDerivationEventOptions::PublicBytecodeCommitment, 1 },
    });

enum class FaultInjectionSha256CompressionEventOptions : uint8_t {
    State,
    Input,
    Output,
    StateAddr,
    InputAddr,
    OutputAddr,
    SpaceId,
    ExecutionClk,
};
using FaultInjectionSha256CompressionEventConfig =
    WeightedSelectionConfig<FaultInjectionSha256CompressionEventOptions, 8>;
constexpr FaultInjectionSha256CompressionEventConfig BASIC_FAULT_INJECTION_SHA256_COMPRESSION_EVENT_CONFIGURATION =
    FaultInjectionSha256CompressionEventConfig({
        { FaultInjectionSha256CompressionEventOptions::State, 1 },
        { FaultInjectionSha256CompressionEventOptions::Input, 1 },
        { FaultInjectionSha256CompressionEventOptions::Output, 1 },
        { FaultInjectionSha256CompressionEventOptions::StateAddr, 1 },
        { FaultInjectionSha256CompressionEventOptions::InputAddr, 1 },
        { FaultInjectionSha256CompressionEventOptions::OutputAddr, 1 },
        { FaultInjectionSha256CompressionEventOptions::SpaceId, 1 },
        { FaultInjectionSha256CompressionEventOptions::ExecutionClk, 1 },
    });

enum class FaultInjectionKeccakF1600EventOptions : uint8_t {
    SrcMemValue,
    SrcAddr,
    DstAddr,
    SpaceId,
    ExecutionClk,
    Flags,
    RoundData,
};
using FaultInjectionKeccakF1600EventConfig = WeightedSelectionConfig<FaultInjectionKeccakF1600EventOptions, 7>;
constexpr FaultInjectionKeccakF1600EventConfig BASIC_FAULT_INJECTION_KECCAKF1600_EVENT_CONFIGURATION =
    FaultInjectionKeccakF1600EventConfig({
        { FaultInjectionKeccakF1600EventOptions::SrcMemValue, 1 },
        { FaultInjectionKeccakF1600EventOptions::SrcAddr, 1 },
        { FaultInjectionKeccakF1600EventOptions::DstAddr, 1 },
        { FaultInjectionKeccakF1600EventOptions::SpaceId, 1 },
        { FaultInjectionKeccakF1600EventOptions::ExecutionClk, 1 },
        { FaultInjectionKeccakF1600EventOptions::Flags, 1 },
        { FaultInjectionKeccakF1600EventOptions::RoundData, 1 },
    });

enum class FaultInjectionDataCopyEventOptions : uint8_t {
    CopyingData,
    Operation,
    WriteContextId,
    ReadContextId,
    DataCopySize,
    DataOffset,
    SrcDataAddr,
    SrcDataSize,
    DstAddr,
    IsNested,
    ExecutionClk,
};
using FaultInjectionDataCopyEventConfig = WeightedSelectionConfig<FaultInjectionDataCopyEventOptions, 11>;
constexpr FaultInjectionDataCopyEventConfig BASIC_FAULT_INJECTION_DATA_COPY_EVENT_CONFIGURATION =
    FaultInjectionDataCopyEventConfig({
        { FaultInjectionDataCopyEventOptions::CopyingData, 1 },
        { FaultInjectionDataCopyEventOptions::Operation, 1 },
        { FaultInjectionDataCopyEventOptions::WriteContextId, 1 },
        { FaultInjectionDataCopyEventOptions::ReadContextId, 1 },
        { FaultInjectionDataCopyEventOptions::DataCopySize, 1 },
        { FaultInjectionDataCopyEventOptions::DataOffset, 1 },
        { FaultInjectionDataCopyEventOptions::SrcDataAddr, 1 },
        { FaultInjectionDataCopyEventOptions::SrcDataSize, 1 },
        { FaultInjectionDataCopyEventOptions::DstAddr, 1 },
        { FaultInjectionDataCopyEventOptions::IsNested, 1 },
        { FaultInjectionDataCopyEventOptions::ExecutionClk, 1 },
    });

enum class FaultInjectionCalldataEventOptions : uint8_t {
    ContextId,
    Calldata,
};
using FaultInjectionCalldataEventConfig = WeightedSelectionConfig<FaultInjectionCalldataEventOptions, 2>;
constexpr FaultInjectionCalldataEventConfig BASIC_FAULT_INJECTION_CALLDATA_EVENT_CONFIGURATION =
    FaultInjectionCalldataEventConfig({
        { FaultInjectionCalldataEventOptions::ContextId, 1 },
        { FaultInjectionCalldataEventOptions::Calldata, 1 },
    });

enum class EmbeddedCurvePointMutationOptions { SetIdentity, SetGenerator, SetInvalid, SetInfiniteWithNonZeroX };
using EmbeddedCurvePointMutationConfig = WeightedSelectionConfig<EmbeddedCurvePointMutationOptions, 4>;

constexpr EmbeddedCurvePointMutationConfig BASIC_EMBEDDED_CURVE_POINT_MUTATION_CONFIGURATION =
    EmbeddedCurvePointMutationConfig({
        { EmbeddedCurvePointMutationOptions::SetIdentity, 2 },
        { EmbeddedCurvePointMutationOptions::SetGenerator, 3 },
        { EmbeddedCurvePointMutationOptions::SetInvalid, 1 },
        { EmbeddedCurvePointMutationOptions::SetInfiniteWithNonZeroX, 1 },
    });

enum class FaultInjectionScalarMul { Point, SetScalarZero, MutateScalar, MutateIntermediateState, Result };

using FaultInjectionScalarMulConfig = WeightedSelectionConfig<FaultInjectionScalarMul, 5>;

constexpr FaultInjectionScalarMulConfig BASIC_FAULT_INJECTION_SCALAR_MUL_MUTATION_CONFIGURATION =
    FaultInjectionScalarMulConfig({
        { FaultInjectionScalarMul::Point, 19 },
        { FaultInjectionScalarMul::SetScalarZero, 5 },
        { FaultInjectionScalarMul::MutateScalar, 11 },
        { FaultInjectionScalarMul::MutateIntermediateState, 17 },
        { FaultInjectionScalarMul::Result, 10 },
    });

enum class ScalarMulIntermediateStateMutationOptions { Res, Temp, FlipBit };
using ScalarMulIntermediateStateMutationConfig = WeightedSelectionConfig<ScalarMulIntermediateStateMutationOptions, 3>;

constexpr ScalarMulIntermediateStateMutationConfig BASIC_SCALAR_MUL_INTERMEDIATE_STATE_MUTATION_CONFIGURATION =
    ScalarMulIntermediateStateMutationConfig({
        { ScalarMulIntermediateStateMutationOptions::Res, 1 },
        { ScalarMulIntermediateStateMutationOptions::Temp, 1 },
        { ScalarMulIntermediateStateMutationOptions::FlipBit, 1 },
    });
