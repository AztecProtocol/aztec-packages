#include "barretenberg/avm_fuzzer/fuzz_lib/memory_manager.hpp"

MemoryManager& MemoryManager::operator=(const MemoryManager& other)
{
    if (this != &other) {
        stored_variables = other.stored_variables;
        memory_address_to_tag = other.memory_address_to_tag;
    }
    return *this;
}

void MemoryManager::set_memory_address(bb::avm2::MemoryTag tag, uint16_t address)
{
    // if address is already set
    if (memory_address_to_tag.find(address) != memory_address_to_tag.end()) {
        auto stored_tag = memory_address_to_tag[address];
        // if address is already set to the same tag, do nothing
        if (stored_tag == tag) {
            return;
        }
        // if address is already set to different tag, remove address from stored_variables
        stored_variables[stored_tag].erase(
            std::remove(stored_variables[stored_tag].begin(), stored_variables[stored_tag].end(), address),
            stored_variables[stored_tag].end());
    }
    memory_address_to_tag[address] = tag;
    stored_variables[tag].push_back(address);
}

std::optional<uint16_t> MemoryManager::get_memory_offset_16_bit(bb::avm2::MemoryTag tag, uint16_t index)
{
    auto it = this->stored_variables.find(tag);
    if (it == this->stored_variables.end() || it->second.empty()) {
        return std::nullopt;
    }
    auto& arr = it->second;
    return arr[index % arr.size()];
}

std::optional<uint8_t> MemoryManager::get_memory_offset_8_bit(bb::avm2::MemoryTag tag, uint16_t index)
{
    auto value = get_memory_offset_16_bit(tag, index);

    if (!value.has_value()) {
        return std::nullopt;
    }

    if (value.value() > 255) {
        return std::nullopt;
    }

    return static_cast<uint8_t>(value.value());
}
