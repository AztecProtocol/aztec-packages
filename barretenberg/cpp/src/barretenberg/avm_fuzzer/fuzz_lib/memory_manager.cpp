#include "barretenberg/avm_fuzzer/fuzz_lib/memory_manager.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"

using namespace bb::avm2::testing;

MemoryManager& MemoryManager::operator=(const MemoryManager& other)
{
    if (this != &other) {
        stored_variables = other.stored_variables;
        memory_address_to_tag = other.memory_address_to_tag;
    }
    return *this;
}

bool MemoryManager::is_memory_address_set(uint16_t address)
{
    return memory_address_to_tag.find(address) != memory_address_to_tag.end();
}

void MemoryManager::set_memory_address(bb::avm2::MemoryTag tag, uint32_t address)
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

std::optional<uint32_t> MemoryManager::get_memory_address_to_resolve(AddressRef address)
{
    auto memory_address = get_memory_offset(address.tag, address.index);
    if (!memory_address.has_value()) {
        return std::nullopt;
    }
    auto absolute_address = memory_address.value();
    switch (address.mode) {
    case AddressingMode::Indirect:
        absolute_address -= address.pointer_value;
        break;
    case AddressingMode::Relative:
        absolute_address -= address.base_offset;
        break;
    case AddressingMode::IndirectRelative:
        absolute_address -= address.pointer_value;
        absolute_address -= address.base_offset;
        break;
    case AddressingMode::Direct:
        break;
    }
    return absolute_address;
}

std::optional<uint32_t> MemoryManager::get_memory_address_to_resolve(ResultAddressRef address)
{
    auto absolute_address = address.address;
    switch (address.mode) {
    case AddressingMode::Indirect:
        absolute_address -= address.pointer_value;
        break;
    case AddressingMode::Relative:
        absolute_address -= address.base_offset;
        break;
    case AddressingMode::IndirectRelative:
        absolute_address -= address.pointer_value;
        absolute_address -= address.base_offset;
        break;
    case AddressingMode::Direct:
        break;
    }
    return absolute_address;
}

OperandBuilder MemoryManager::get_memory_address_operand(OperandBuilder operand, AddressingMode mode)
{
    switch (mode) {
    case AddressingMode::Indirect:
        operand = operand.indirect();
        break;
    case AddressingMode::Relative:
        operand = operand.relative();
        break;
    case AddressingMode::IndirectRelative:
        operand = operand.indirect();
        operand = operand.relative();
        break;
    case AddressingMode::Direct:
        break;
    }
    return operand;
}

std::optional<bb::avm2::testing::OperandBuilder> MemoryManager::get_memory_address_operand_8(AddressRef address)
{
    auto absolute_address = get_memory_address_to_resolve(address);
    if (!absolute_address.has_value()) {
        return std::nullopt;
    }
    if (absolute_address.value() > 255) {
        return std::nullopt;
    }
    auto operand = OperandBuilder::from<uint8_t>(static_cast<uint8_t>(absolute_address.value()));

    return get_memory_address_operand(operand, address.mode);
}

std::optional<bb::avm2::testing::OperandBuilder> MemoryManager::get_memory_address_operand_8(ResultAddressRef address)
{
    auto absolute_address = get_memory_address_to_resolve(address);
    if (!absolute_address.has_value()) {
        return std::nullopt;
    }
    if (absolute_address.value() > 255) {
        return std::nullopt;
    }
    auto operand = OperandBuilder::from<uint8_t>(static_cast<uint8_t>(absolute_address.value()));
    return get_memory_address_operand(operand, address.mode);
}

std::optional<bb::avm2::testing::OperandBuilder> MemoryManager::get_memory_address_operand_16(AddressRef address)
{
    auto absolute_address = get_memory_address_to_resolve(address);
    if (!absolute_address.has_value()) {
        return std::nullopt;
    }
    if (absolute_address.value() > 65535) {
        return std::nullopt;
    }
    auto operand = OperandBuilder::from<uint16_t>(static_cast<uint16_t>(absolute_address.value()));
    return get_memory_address_operand(operand, address.mode);
}

std::optional<bb::avm2::testing::OperandBuilder> MemoryManager::get_memory_address_operand_16(ResultAddressRef address)
{
    auto absolute_address = get_memory_address_to_resolve(address);
    if (!absolute_address.has_value()) {
        return std::nullopt;
    }
    if (absolute_address.value() > 65535) {
        return std::nullopt;
    }
    auto operand = OperandBuilder::from<uint16_t>(static_cast<uint16_t>(absolute_address.value()));
    return get_memory_address_operand(operand, address.mode);
}

std::optional<uint32_t> MemoryManager::get_memory_offset(bb::avm2::MemoryTag tag, uint32_t index)
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
    auto value = get_memory_offset(tag, index);
    if (!value.has_value()) {
        return std::nullopt;
    }

    if (value.value() > 255) {
        return std::nullopt;
    }

    return static_cast<uint8_t>(value.value());
}

void MemoryManager::append_slot(bb::avm2::FF slot)
{
    storage_addresses.push_back(slot);
}

std::optional<bb::avm2::FF> MemoryManager::get_slot(uint16_t slot_offset_index)
{
    if (storage_addresses.empty()) {
        return std::nullopt;
    }
    return storage_addresses[slot_offset_index % storage_addresses.size()];
}

void MemoryManager::append_emitted_note_hash(bb::avm2::FF note_hash)
{
    emitted_note_hashes.push_back(note_hash);
}

std::optional<bb::avm2::FF> MemoryManager::get_emitted_note_hash(uint16_t note_hash_index)
{
    if (emitted_note_hashes.empty()) {
        return std::nullopt;
    }
    return emitted_note_hashes[note_hash_index % emitted_note_hashes.size()];
}

std::optional<uint16_t> MemoryManager::get_leaf_index(uint16_t note_hash_index)
{
    if (emitted_note_hashes.empty()) {
        return std::nullopt;
    }
    return note_hash_index % emitted_note_hashes.size();
}
