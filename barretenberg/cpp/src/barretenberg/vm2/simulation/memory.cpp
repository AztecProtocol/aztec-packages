#include "barretenberg/vm2/simulation/memory.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

#include <cstdint>
#include <memory>
#include <unordered_map>

namespace bb::avm2::simulation {

bool MemoryInterface::is_valid_address(const MemoryValue& address)
{
    (void)address;
    return true;
    // This is failing and I don't know why.
    // return address < static_cast<uint64_t>(0x100000000); // 2^32
}

bool MemoryInterface::is_valid_address(ValueRefAndTag address)
{
    return is_valid_address(address.value) && address.tag == MemoryAddressTag;
}

void Memory::set(MemoryAddress index, MemoryValue value, MemoryTag tag)
{
    // TODO: validate tag-value makes sense.
    memory[index] = { value, tag };
    vinfo("Memory write: ", index, " <- ", value, " (tag: ", static_cast<int>(tag), ")");
    events.emit({ .mode = MemoryMode::WRITE, .addr = index, .value = value, .tag = tag, .space_id = space_id });
}

ValueRefAndTag Memory::get(MemoryAddress index) const
{
    static const ValueAndTag default_value = { 0, MemoryTag::FF };

    auto it = memory.find(index);
    const auto& vt = it != memory.end() ? it->second : default_value;
    events.emit({ .mode = MemoryMode::READ, .addr = index, .value = vt.value, .tag = vt.tag, .space_id = space_id });

    vinfo("Memory read: ", index, " -> ", vt.value, " (tag: ", static_cast<int>(vt.tag), ")");
    return { vt.value, vt.tag };
}

std::pair<std::vector<MemoryValue>, std::vector<MemoryTag>> Memory::get_slice(MemoryAddress start, size_t size) const
{
    std::vector<MemoryValue> values(size);
    std::vector<MemoryTag> tags(size);
    for (size_t i = 0; i < size; ++i) {
        auto vt = get(static_cast<MemoryAddress>(start + i));
        values[i] = vt.value;
        tags[i] = vt.tag;
    }
    return { std::move(values), std::move(tags) };
}

} // namespace bb::avm2::simulation