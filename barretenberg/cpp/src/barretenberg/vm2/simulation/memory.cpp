#include "barretenberg/vm2/simulation/memory.hpp"

#include <cstdint>
#include <memory>

#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

bool MemoryInterface::is_valid_address(const FF& address)
{
    // address fits in 32 bits
    return FF(static_cast<uint32_t>(address)) == address;
}

bool MemoryInterface::is_valid_address(const MemoryValue& address)
{
    return is_valid_address(address.as_ff()) && address.get_tag() == MemoryAddressTag;
}

void Memory::set(MemoryAddress index, MemoryValue value)
{
    // TODO: validate tag-value makes sense.
    memory[index] = value;
    debug("Memory write: ", index, " <- ", value.to_string());
    events.emit({ .mode = MemoryMode::WRITE, .addr = index, .value = value, .space_id = space_id });
}

const MemoryValue& Memory::get(MemoryAddress index) const
{
    static const auto default_value = MemoryValue::from<FF>(0);

    auto it = memory.find(index);
    const auto& vt = it != memory.end() ? it->second : default_value;
    events.emit({ .mode = MemoryMode::READ, .addr = index, .value = vt, .space_id = space_id });

    debug("Memory read: ", index, " -> ", vt.to_string());
    return vt;
}

} // namespace bb::avm2::simulation
