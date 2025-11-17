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
    std::vector<uint16_t> storage_addresses;

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

    // Get used address from memory_address_to_tag map
    std::optional<uint16_t> get_untagged_address(uint16_t index);
};
