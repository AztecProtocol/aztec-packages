#include "barretenberg/vm2/simulation/gadgets/memory.hpp"

#include <cstdint>

#include "barretenberg/common/log.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

namespace {

// Default value for uninitialized memory: FF(0) with tag FF.
const auto DEFAULT_MEM_VALUE = MemoryValue::from_tag(MemoryTag::FF, 0);

} // namespace

/**
 * @brief Writes a tagged value to memory at the given address.
 *
 * Validates that the value fits within its tag's bit-width (via a range check for non-FF tags),
 * stores the value, and emits a WRITE memory event for trace generation.
 */
void Memory::set(MemoryAddress index, MemoryValue value)
{
    // Improvement: reconsider tag validation strategy.
    validate_tag(value);
    memory[index] = value;
    debug("Memory write: ", index, " <- ", value.to_string());
    events.emit({ .execution_clk = execution_id_manager.get_execution_id(),
                  .mode = MemoryMode::WRITE,
                  .addr = index,
                  .value = value,
                  .space_id = space_id });
}

/**
 * @brief Reads a tagged value from memory at the given address.
 *
 * Returns the stored value, or FF(0) with tag FF for uninitialized addresses.
 * Emits a READ memory event for trace generation. No tag validation is needed
 * because stored values were already validated on write.
 */
const MemoryValue& Memory::get(MemoryAddress index) const
{
    auto it = memory.find(index);
    const auto& vt = it != memory.end() ? it->second : DEFAULT_MEM_VALUE;
    events.emit({ .execution_clk = execution_id_manager.get_execution_id(),
                  .mode = MemoryMode::READ,
                  .addr = index,
                  .value = vt,
                  .space_id = space_id });

    debug("Memory read: ", index, " -> ", vt.to_string());
    return vt;
}

/**
 * @brief Reads a value from memory without emitting an event.
 *
 * Used only for debug logging and other unconstrained contexts.
 * Does not produce a trace event, so this access is invisible to the prover.
 */
const MemoryValue& Memory::unconstrained_get(MemoryAddress index) const
{
    auto it = memory.find(index);
    return it != memory.end() ? it->second : DEFAULT_MEM_VALUE;
}

/**
 * @brief Validates that a value fits within its tag's bit-width via a range check.
 *
 * Only called on writes because reads return previously-validated values.
 * FF-tagged values are unconstrained and skip validation. For all other tags,
 * the value is range-checked against the tag's bit-width. This is "circuit-leaking":
 * in simulation the tag-value pair is always consistent, but the circuit needs an
 * explicit range check to enforce it.
 */
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
