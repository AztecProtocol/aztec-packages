#include "barretenberg/avm_fuzzer/fuzz_lib/memory_manager.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/vm2/testing/instruction_builder.hpp"

using namespace bb::avm2::testing;

namespace {

/**
 * @brief Get the nth element from a range that satisfies a predicate (zero-copy).
 *
 * @tparam Range The range type (e.g., std::vector<T>&)
 * @tparam Predicate A callable that takes an element and returns bool
 * @param range The input range to filter
 * @param predicate Filter predicate - elements where predicate(elem) is true are included
 * @param index Index used to select element: actual_index = index % count_of_matching_elements
 * @return std::optional containing the selected element, or std::nullopt if no elements match
 */
template <std::ranges::input_range Range, typename Predicate>
std::optional<std::ranges::range_value_t<Range>> get_nth_filtered(Range&& range, Predicate predicate, size_t index)
{
    auto filtered = range | std::views::filter(predicate);

    auto count = std::ranges::distance(filtered);
    if (count == 0) {
        return std::nullopt;
    }

    return *std::ranges::next(filtered.begin(), static_cast<long>(index % static_cast<size_t>(count)));
}

uint32_t get_max_variable_address(AddressingMode mode, uint32_t base_offset, uint32_t max_operand_address)
{
    switch (mode) {
    case AddressingMode::Direct:
        return max_operand_address;
    case AddressingMode::Relative:
        return base_offset + max_operand_address;
    case AddressingMode::Indirect:
    case AddressingMode::IndirectRelative:
        return AVM_HIGHEST_MEM_ADDRESS;
    }
}

uint32_t get_min_variable_address(AddressingMode mode, uint32_t base_offset)
{
    switch (mode) {
    case AddressingMode::Relative:
        return base_offset;
    case AddressingMode::Direct:
    case AddressingMode::Indirect:
    case AddressingMode::IndirectRelative:
        return 0;
    }
}

uint32_t trimmed_pointer_address(uint32_t pointer_address_seed, uint32_t max_operand_address)
{
    return pointer_address_seed % (max_operand_address + 1);
}

uint32_t trimmed_relative_pointer_address(uint32_t pointer_address_seed,
                                          uint32_t base_offset,
                                          uint32_t max_operand_address)
{
    return base_offset + (pointer_address_seed % (max_operand_address + 1));
}

} // namespace

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

ResolvedAddress MemoryManager::resolve_address(VariableRef variable,
                                               uint32_t absolute_address,
                                               uint32_t max_operand_address)
{
    ResolvedAddress resolved_address = {
        .absolute_address = absolute_address,
    };
    switch (variable.mode) {
    case AddressingMode::Indirect: {
        uint32_t trimmed_pointer_address_value =
            trimmed_pointer_address(variable.pointer_address_seed, max_operand_address);
        resolved_address.pointer_address = trimmed_pointer_address_value;
        resolved_address.operand_address = trimmed_pointer_address_value;
        break;
    }
    case AddressingMode::Relative:
        resolved_address.operand_address = absolute_address - base_offset;
        resolved_address.via_relative = true;
        break;
    case AddressingMode::IndirectRelative: {
        uint32_t trimmed_pointer_address_value =
            trimmed_relative_pointer_address(variable.pointer_address_seed, base_offset, max_operand_address);
        resolved_address.pointer_address = trimmed_pointer_address_value;
        // Relative addressing target is the pointer
        resolved_address.operand_address = trimmed_pointer_address_value - base_offset;
        resolved_address.via_relative = true;
        break;
    }
    case AddressingMode::Direct:
        // We can't change the absolute address, or it won't find anything useful there.
        resolved_address.operand_address = absolute_address;
        break;
    }
    BB_ASSERT_LTE(resolved_address.operand_address, max_operand_address);
    return resolved_address;
}

ResolvedAddress MemoryManager::resolve_address(AddressRef address, uint32_t max_operand_address)
{

    ResolvedAddress resolved_address = {
        .absolute_address = address.address,
    };
    switch (address.mode) {
    case AddressingMode::Indirect: {
        // Trim the pointer to max_operand_address bits for it to be reachable by the instruction
        uint32_t trimmed_pointer_address_value =
            trimmed_pointer_address(address.pointer_address_seed, max_operand_address);
        resolved_address.pointer_address = trimmed_pointer_address_value;
        resolved_address.operand_address = trimmed_pointer_address_value;
        break;
    }
    case AddressingMode::Relative:
        resolved_address.operand_address = address.address - base_offset;
        resolved_address.via_relative = true;
        break;
    case AddressingMode::IndirectRelative: {
        // Relative addressing target is the pointer
        uint32_t trimmed_pointer_address_value =
            trimmed_relative_pointer_address(address.pointer_address_seed, base_offset, max_operand_address);
        resolved_address.pointer_address = trimmed_pointer_address_value;

        resolved_address.operand_address = trimmed_pointer_address_value - base_offset;
        resolved_address.via_relative = true;
        break;
    }
    case AddressingMode::Direct:
        resolved_address.operand_address = resolved_address.absolute_address;
        break;
    }
    BB_ASSERT_LTE(resolved_address.operand_address, max_operand_address);
    return resolved_address;
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

std::optional<std::pair<ResolvedAddress, bb::avm2::testing::OperandBuilder>> MemoryManager::
    get_resolved_address_and_operand_8(ParamRef address)
{
    return std::visit(overloaded{ [&](VariableRef var) { return get_resolved_address_and_operand_8(var); },
                                  [&](AddressRef addr) { return get_resolved_address_and_operand_8(addr); } },
                      address);
}

std::optional<std::pair<ResolvedAddress, bb::avm2::testing::OperandBuilder>> MemoryManager::
    get_resolved_address_and_operand_8(VariableRef address)
{
    auto actual_address = get_variable_address(address.tag,
                                               address.index,
                                               get_min_variable_address(address.mode, base_offset),
                                               get_max_variable_address(address.mode, base_offset, 255));
    if (!actual_address.has_value()) {
        return std::nullopt;
    }
    auto resolved_address = resolve_address(address, actual_address.value(), 255);

    auto operand = OperandBuilder::from<uint8_t>(static_cast<uint8_t>(resolved_address.operand_address));

    return std::make_pair(resolved_address, get_memory_address_operand(operand, address.mode));
}

std::optional<std::pair<ResolvedAddress, bb::avm2::testing::OperandBuilder>> MemoryManager::
    get_resolved_address_and_operand_8(AddressRef address)
{
    auto resolved_address = resolve_address(address, 255);

    auto operand = OperandBuilder::from<uint8_t>(static_cast<uint8_t>(resolved_address.operand_address));
    return std::make_pair(resolved_address, get_memory_address_operand(operand, address.mode));
}

std::optional<std::pair<ResolvedAddress, bb::avm2::testing::OperandBuilder>> MemoryManager::
    get_resolved_address_and_operand_16(ParamRef address)
{
    return std::visit(overloaded{ [&](VariableRef var) { return get_resolved_address_and_operand_16(var); },
                                  [&](AddressRef addr) { return get_resolved_address_and_operand_16(addr); } },
                      address);
}

std::optional<std::pair<ResolvedAddress, bb::avm2::testing::OperandBuilder>> MemoryManager::
    get_resolved_address_and_operand_16(VariableRef address)
{
    auto actual_address = get_variable_address(address.tag,
                                               address.index,
                                               get_min_variable_address(address.mode, base_offset),
                                               get_max_variable_address(address.mode, base_offset, 65535));
    if (!actual_address.has_value()) {
        return std::nullopt;
    }

    auto resolved_address = resolve_address(address, actual_address.value(), 65535);

    auto operand = OperandBuilder::from<uint16_t>(static_cast<uint16_t>(resolved_address.operand_address));
    return std::make_pair(resolved_address, get_memory_address_operand(operand, address.mode));
}

std::optional<std::pair<ResolvedAddress, bb::avm2::testing::OperandBuilder>> MemoryManager::
    get_resolved_address_and_operand_16(AddressRef address)
{
    auto resolved_address = resolve_address(address, 65535);

    auto operand = OperandBuilder::from<uint16_t>(static_cast<uint16_t>(resolved_address.operand_address));
    return std::make_pair(resolved_address, get_memory_address_operand(operand, address.mode));
}

std::optional<uint32_t> MemoryManager::get_variable_address(bb::avm2::MemoryTag tag,
                                                            uint32_t index,
                                                            uint32_t min_value,
                                                            uint32_t max_value)
{
    return get_nth_filtered(
        this->stored_variables[tag],
        [min_value, max_value](uint32_t val) { return val >= min_value && val <= max_value; },
        index);
}

std::optional<uint8_t> MemoryManager::get_memory_offset_8(bb::avm2::MemoryTag tag, uint32_t index)
{
    auto value = get_variable_address(tag, index, 0, 255);
    if (!value.has_value()) {
        return std::nullopt;
    }
    return static_cast<uint8_t>(value.value());
}

std::optional<uint16_t> MemoryManager::get_memory_offset_16(bb::avm2::MemoryTag tag, uint32_t index)
{
    auto value = get_variable_address(tag, index, 0, 65535);
    if (!value.has_value()) {
        return std::nullopt;
    }
    return static_cast<uint16_t>(value.value());
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

void MemoryManager::set_base_offset(uint32_t base_offset)
{
    this->base_offset = base_offset;
}
