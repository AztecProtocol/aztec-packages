#include "barretenberg/vm2/simulation/memory.hpp"

#include <cstdint>
#include <memory>

#include "barretenberg/common/log.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

bool Memory::is_valid_address(const FF& address)
{
    // FIXME(fcarreiro): do not assert, do a boolean check.
    // address fits in 32 bits
    range_check.assert_range(static_cast<uint128_t>(address), 32);
    return true;
}

void Memory::set(MemoryAddress index, MemoryValue value)
{
    // TODO: validate address?
    // TODO: reconsider tag validation.
    validate_tag(value);
    memory[index] = value;
    debug("Memory write: ", index, " <- ", value.to_string());
    events.emit({ .mode = MemoryMode::WRITE, .addr = index, .value = value, .space_id = space_id });
}

const MemoryValue& Memory::get(MemoryAddress index) const
{
    // TODO: validate address?
    static const auto default_value = MemoryValue::from<FF>(0);

    auto it = memory.find(index);
    const auto& vt = it != memory.end() ? it->second : default_value;
    events.emit({ .mode = MemoryMode::READ, .addr = index, .value = vt, .space_id = space_id });

    debug("Memory read: ", index, " -> ", vt.to_string());
    return vt;
}

// Sadly this is circuit leaking. In simulation we know the tag-value is consistent.
// But the circuit does need to force a range check.
void Memory::validate_tag(const MemoryValue& value) const
{
    if (value.get_tag() == MemoryTag::FF) {
        return;
    }

    uint128_t value_as_uint128 = static_cast<uint128_t>(value.as_ff());
    uint8_t tag_bits = get_tag_bits(value.get_tag());
    range_check.assert_range(value_as_uint128, tag_bits);
}

} // namespace bb::avm2::simulation
