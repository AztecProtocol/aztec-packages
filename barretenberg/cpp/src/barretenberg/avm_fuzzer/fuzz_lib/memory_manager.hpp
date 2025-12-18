#pragma once

#include <cstdint>
#include <map>
#include <optional>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"

class MemoryManager {
  private:
    // map of Tag -> vector of memory addresses
    std::map<bb::avm2::MemoryTag, std::vector<uint32_t>> stored_variables;
    // inverse map MemoryAddress -> Tag
    std::map<uint32_t, bb::avm2::MemoryTag> memory_address_to_tag;

    // Public Storage used addresses
    std::vector<bb::avm2::FF> storage_addresses;

    std::vector<bb::avm2::FF> emitted_note_hashes;

    bb::avm2::testing::OperandBuilder get_memory_address_operand(bb::avm2::testing::OperandBuilder operand,
                                                                 AddressingMode mode);
    ResolvedAddress resolve_address(VariableRef address, uint32_t absolute_address, uint32_t max_operand_address);
    ResolvedAddress resolve_address(AddressRef address, uint32_t max_operand_address);
    std::optional<uint32_t> get_variable_address(bb::avm2::MemoryTag tag, uint32_t index, uint32_t max_value);

  public:
    MemoryManager() = default;
    MemoryManager(const MemoryManager& other) = default;
    MemoryManager& operator=(const MemoryManager& other);
    MemoryManager(MemoryManager&& other) = default;
    MemoryManager& operator=(MemoryManager&& other) = default;
    ~MemoryManager() = default;
    void set_memory_address(bb::avm2::MemoryTag tag, uint32_t address);
    std::optional<uint16_t> get_memory_offset_16(bb::avm2::MemoryTag tag, uint32_t address_index);
    std::optional<uint8_t> get_memory_offset_8(bb::avm2::MemoryTag tag, uint32_t address_index);
    bool is_memory_address_set(uint16_t address);

    std::optional<std::pair<ResolvedAddress, bb::avm2::testing::OperandBuilder>> get_resolved_address_and_operand_8(
        VariableRef address);
    std::optional<std::pair<ResolvedAddress, bb::avm2::testing::OperandBuilder>> get_resolved_address_and_operand_8(
        AddressRef address);
    std::optional<std::pair<ResolvedAddress, bb::avm2::testing::OperandBuilder>> get_resolved_address_and_operand_16(
        VariableRef address);
    std::optional<std::pair<ResolvedAddress, bb::avm2::testing::OperandBuilder>> get_resolved_address_and_operand_16(
        AddressRef address);

    // Append used slot to storage_addresses
    void append_slot(bb::avm2::FF slot);
    // Get slot from storage_addresses
    std::optional<bb::avm2::FF> get_slot(uint16_t slot_offset_index);

    // Append emitted note hash to emitted_note_hashes
    void append_emitted_note_hash(bb::avm2::FF note_hash);
    // Get emitted note hash from emitted_note_hashes
    std::optional<bb::avm2::FF> get_emitted_note_hash(uint16_t note_hash_index);
    // Get leaf index from emitted_note_hashes, nullopt if emitted_note_hashes is empty
    // note_hash_index % length(emitted_note_hashes)
    std::optional<uint16_t> get_leaf_index(uint16_t note_hash_index);
};
