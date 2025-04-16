#pragma once

#include <memory>

#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"

namespace bb::avm2::simulation {

class MemoryInterface {
  public:
    virtual ~MemoryInterface() = default;

    // Returned reference is only valid until the next call to set.
    virtual const MemoryValue& get(MemoryAddress index) const = 0;
    // Sets value. Invalidates all references to previous values.
    virtual void set(MemoryAddress index, MemoryValue value) = 0;

    virtual uint32_t get_space_id() const = 0;

    static bool is_valid_address(const MemoryValue& address);
    static bool is_valid_address(const FF& address);
};

class Memory : public MemoryInterface {
  public:
    Memory(uint32_t space_id, EventEmitterInterface<MemoryEvent>& event_emitter)
        : space_id(space_id)
        , events(event_emitter)
    {}

    const MemoryValue& get(MemoryAddress index) const override;
    void set(MemoryAddress index, MemoryValue value) override;

    uint32_t get_space_id() const override { return space_id; }

  private:
    uint32_t space_id;
    unordered_flat_map<size_t, MemoryValue> memory;
    EventEmitterInterface<MemoryEvent>& events;
};

} // namespace bb::avm2::simulation
