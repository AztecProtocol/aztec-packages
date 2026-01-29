#pragma once

#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint16_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint32_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint64_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint8_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/avm_fuzzer/mutations/fault_injection/memory_value.hpp"
#include "barretenberg/vm2/simulation/events/events_container.hpp"
#include <array>
#include <cstdint>
#include <optional>
#include <random>
#include <vector>

namespace bb::avm2::fuzzer {

namespace detail {

enum class BytecodeFaultTarget : uint8_t { Retrieval, Hashing, Decomposition, InstructionFetching };

inline void mutate_tree_snapshot(::bb::avm2::AppendOnlyTreeSnapshot& snapshot, std::mt19937_64& rng)
{
    auto mutation = BASIC_FAULT_INJECTION_BYTECODE_RETRIEVAL_SNAPSHOT_CONFIGURATION.select(rng);
    switch (mutation) {
    case FaultInjectionBytecodeRetrievalSnapshotOptions::Root:
        mutate_field(snapshot.root, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionBytecodeRetrievalSnapshotOptions::NextIndex:
        mutate_uint64_t(snapshot.next_available_leaf_index, rng, BASIC_UINT64_T_MUTATION_CONFIGURATION);
        break;
    }
}

inline void fault_injection_bytecode_retrieval(simulation::BytecodeRetrievalEvent& event, std::mt19937_64& rng)
{
    auto mutation = BASIC_FAULT_INJECTION_BYTECODE_RETRIEVAL_EVENT_CONFIGURATION.select(rng);
    switch (mutation) {
    case FaultInjectionBytecodeRetrievalEventOptions::BytecodeId:
        mutate_field(event.bytecode_id, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionBytecodeRetrievalEventOptions::Address:
        mutate_field(event.address, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionBytecodeRetrievalEventOptions::CurrentClassId:
        mutate_field(event.current_class_id, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionBytecodeRetrievalEventOptions::ContractClassArtifactHash:
        mutate_field(event.contract_class.artifact_hash, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionBytecodeRetrievalEventOptions::ContractClassPrivateFunctionsRoot:
        mutate_field(event.contract_class.private_functions_root, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionBytecodeRetrievalEventOptions::NullifierRoot:
        mutate_field(event.nullifier_root, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionBytecodeRetrievalEventOptions::PublicDataTreeRoot:
        mutate_field(event.public_data_tree_root, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionBytecodeRetrievalEventOptions::SnapshotBefore:
        mutate_tree_snapshot(event.retrieved_bytecodes_snapshot_before, rng);
        break;
    case FaultInjectionBytecodeRetrievalEventOptions::SnapshotAfter:
        mutate_tree_snapshot(event.retrieved_bytecodes_snapshot_after, rng);
        break;
    case FaultInjectionBytecodeRetrievalEventOptions::Flags:
        switch (std::uniform_int_distribution<uint8_t>(0, 2)(rng)) {
        case 0:
            event.is_new_class = !event.is_new_class;
            break;
        case 1:
            event.instance_not_found_error = !event.instance_not_found_error;
            break;
        case 2:
            event.limit_error = !event.limit_error;
            break;
        default:
            break;
        }
        break;
    }
}

inline void fault_injection_bytecode_hashing(simulation::BytecodeHashingEvent& event, std::mt19937_64& rng)
{
    auto mutation = BASIC_FAULT_INJECTION_BYTECODE_HASHING_EVENT_CONFIGURATION.select(rng);
    switch (mutation) {
    case FaultInjectionBytecodeHashingEventOptions::BytecodeId:
        mutate_field(event.bytecode_id, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionBytecodeHashingEventOptions::BytecodeLength:
        mutate_uint32_t(event.bytecode_length, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionBytecodeHashingEventOptions::Field: {
        if (event.bytecode_fields.empty()) {
            return;
        }
        auto index = std::uniform_int_distribution<size_t>(0, event.bytecode_fields.size() - 1)(rng);
        mutate_field(event.bytecode_fields[index], rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    }
    }
}

inline void fault_injection_bytecode_decomposition(simulation::BytecodeDecompositionEvent& event, std::mt19937_64& rng)
{
    auto mutation = BASIC_FAULT_INJECTION_BYTECODE_DECOMP_EVENT_CONFIGURATION.select(rng);
    switch (mutation) {
    case FaultInjectionBytecodeDecompositionEventOptions::BytecodeId:
        mutate_field(event.bytecode_id, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionBytecodeDecompositionEventOptions::Byte:
        if (!event.bytecode || event.bytecode->empty()) {
            return;
        }
        {
            auto index = std::uniform_int_distribution<size_t>(0, event.bytecode->size() - 1)(rng);
            mutate_uint8_t((*event.bytecode)[index], rng, BASIC_UINT8_T_MUTATION_CONFIGURATION);
        }
        break;
    }
}

inline void fault_injection_instruction_fetching(simulation::InstructionFetchingEvent& event, std::mt19937_64& rng)
{
    auto mutation = BASIC_FAULT_INJECTION_INSTR_FETCH_EVENT_CONFIGURATION.select(rng);
    switch (mutation) {
    case FaultInjectionInstructionFetchingEventOptions::Pc:
        mutate_uint32_t(event.pc, rng, BASIC_UINT32_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionInstructionFetchingEventOptions::AddressingMode:
        mutate_uint16_t(event.instruction.addressing_mode, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    case FaultInjectionInstructionFetchingEventOptions::Operand: {
        if (event.instruction.operands.empty()) {
            return;
        }
        auto index = std::uniform_int_distribution<size_t>(0, event.instruction.operands.size() - 1)(rng);
        event.instruction.operands[index] = mutate_memory_value(event.instruction.operands[index], rng);
        break;
    }
    case FaultInjectionInstructionFetchingEventOptions::BytecodeByte:
        if (!event.bytecode || event.bytecode->empty()) {
            return;
        }
        {
            auto index = std::uniform_int_distribution<size_t>(0, event.bytecode->size() - 1)(rng);
            mutate_uint8_t((*event.bytecode)[index], rng, BASIC_UINT8_T_MUTATION_CONFIGURATION);
        }
        break;
    case FaultInjectionInstructionFetchingEventOptions::Error: {
        if (event.error.has_value() && std::uniform_int_distribution<uint8_t>(0, 1)(rng) == 0) {
            event.error = std::nullopt;
            return;
        }
        constexpr std::array<simulation::InstrDeserializationEventError, 4> kErrors = {
            simulation::InstrDeserializationEventError::PC_OUT_OF_RANGE,
            simulation::InstrDeserializationEventError::OPCODE_OUT_OF_RANGE,
            simulation::InstrDeserializationEventError::INSTRUCTION_OUT_OF_RANGE,
            simulation::InstrDeserializationEventError::TAG_OUT_OF_RANGE,
        };
        auto index = std::uniform_int_distribution<size_t>(0, kErrors.size() - 1)(rng);
        event.error = kErrors[index];
        break;
    }
    }
}

} // namespace detail

inline void fault_injection_bytecode(simulation::EventsContainer& events, std::mt19937_64& rng)
{
    std::vector<detail::BytecodeFaultTarget> targets;
    if (!events.bytecode_retrieval.empty()) {
        targets.push_back(detail::BytecodeFaultTarget::Retrieval);
    }
    if (!events.bytecode_hashing.empty()) {
        targets.push_back(detail::BytecodeFaultTarget::Hashing);
    }
    if (!events.bytecode_decomposition.empty()) {
        targets.push_back(detail::BytecodeFaultTarget::Decomposition);
    }
    if (!events.instruction_fetching.empty()) {
        targets.push_back(detail::BytecodeFaultTarget::InstructionFetching);
    }
    if (targets.empty()) {
        return;
    }

    auto target =
        static_cast<detail::BytecodeFaultTarget>(BASIC_FAULT_INJECTION_BYTECODE_EVENT_CONFIGURATION.select(rng));
    const auto target_available =
        (target == detail::BytecodeFaultTarget::Retrieval && !events.bytecode_retrieval.empty()) ||
        (target == detail::BytecodeFaultTarget::Hashing && !events.bytecode_hashing.empty()) ||
        (target == detail::BytecodeFaultTarget::Decomposition && !events.bytecode_decomposition.empty()) ||
        (target == detail::BytecodeFaultTarget::InstructionFetching && !events.instruction_fetching.empty());
    if (!target_available) {
        target = targets[std::uniform_int_distribution<size_t>(0, targets.size() - 1)(rng)];
    }
    switch (target) {
    case detail::BytecodeFaultTarget::Retrieval: {
        auto index = std::uniform_int_distribution<size_t>(0, events.bytecode_retrieval.size() - 1)(rng);
        detail::fault_injection_bytecode_retrieval(events.bytecode_retrieval[index], rng);
        break;
    }
    case detail::BytecodeFaultTarget::Hashing: {
        auto index = std::uniform_int_distribution<size_t>(0, events.bytecode_hashing.size() - 1)(rng);
        detail::fault_injection_bytecode_hashing(events.bytecode_hashing[index], rng);
        break;
    }
    case detail::BytecodeFaultTarget::Decomposition: {
        auto index = std::uniform_int_distribution<size_t>(0, events.bytecode_decomposition.size() - 1)(rng);
        detail::fault_injection_bytecode_decomposition(events.bytecode_decomposition[index], rng);
        break;
    }
    case detail::BytecodeFaultTarget::InstructionFetching: {
        auto index = std::uniform_int_distribution<size_t>(0, events.instruction_fetching.size() - 1)(rng);
        detail::fault_injection_instruction_fetching(events.instruction_fetching[index], rng);
        break;
    }
    }
}

} // namespace bb::avm2::fuzzer
