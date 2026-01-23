#pragma once

#include <memory>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"

namespace bb::avm2::simulation {

class MemoryInterface {
  public:
    virtual ~MemoryInterface() = default;

    // Returned reference is only valid until the next call to set.
    virtual const MemoryValue& get(MemoryAddress index) const = 0;
    // Sets value. Invalidates all references to previous values.
    virtual void set(MemoryAddress index, MemoryValue value) = 0;

    virtual uint16_t get_space_id() const = 0;

    // This checks the memory tag. It does not produce events.
    virtual bool is_valid_address(const MemoryValue& address) { return address.get_tag() == MemoryAddressTag; }
};

class MemoryProviderInterface {
  public:
    virtual ~MemoryProviderInterface() = default;
    virtual std::unique_ptr<MemoryInterface> make_memory(uint16_t space_id) = 0;
};

} // namespace bb::avm2::simulation
