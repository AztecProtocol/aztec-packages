#pragma once

#include <cstdint>
#include <map>
#include <optional>
#include <vector>

#include "barretenberg/vm2/common/memory_types.hpp"

class MemoryManager {
  private:
    // map of Tag -> vector of memory addresses
    std::map<bb::avm2::MemoryTag, std::vector<uint16_t>> stored_variables;
    // inverse map MemoryAddress -> Tag
    std::map<uint16_t, bb::avm2::MemoryTag> memory_address_to_tag;

    // Public Storage used addresses
    std::vector<bb::avm2::FF> storage_addresses;

    std::vector<bb::avm2::FF> emitted_note_hashes;

  public:
    MemoryManager() = default;
    MemoryManager(const MemoryManager& other) = default;
    MemoryManager& operator=(const MemoryManager& other);
    MemoryManager(MemoryManager&& other) = default;
    MemoryManager& operator=(MemoryManager&& other) = default;
    ~MemoryManager() = default;
    void set_memory_address(bb::avm2::MemoryTag tag, uint16_t address);
    std::optional<uint16_t> get_memory_offset_16_bit(bb::avm2::MemoryTag tag, uint16_t address_index);
    std::optional<uint8_t> get_memory_offset_8_bit(bb::avm2::MemoryTag tag, uint16_t address_index);
    bool is_memory_address_set(uint16_t address);

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
