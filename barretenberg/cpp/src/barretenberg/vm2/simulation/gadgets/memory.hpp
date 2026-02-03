#pragma once

#include <memory>

#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/vm2/simulation/interfaces/memory.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"

namespace bb::avm2::simulation {

class Memory : public MemoryInterface {
  public:
    Memory(uint16_t space_id,
           RangeCheckInterface& range_check,
           ExecutionIdGetterInterface& execution_id_manager,
           EventEmitterInterface<MemoryEvent>& event_emitter)
        : space_id(space_id)
        , range_check(range_check)
        , execution_id_manager(execution_id_manager)
        , events(event_emitter)
    {}

    const MemoryValue& get(MemoryAddress index) const override;
    void set(MemoryAddress index, MemoryValue value) override;

    uint16_t get_space_id() const override { return space_id; }

    // Only used in debug logging.
    const MemoryValue& unconstrained_get(MemoryAddress index) const;

  private:
    uint16_t space_id;
    unordered_flat_map<MemoryAddress, MemoryValue> memory;

    RangeCheckInterface& range_check;
    ExecutionIdGetterInterface& execution_id_manager;
    // TODO: consider a deduplicating event emitter (within the same clk).
    EventEmitterInterface<MemoryEvent>& events;

    void validate_tag(const MemoryValue& value) const;
};

class MemoryProvider : public MemoryProviderInterface {
  public:
    MemoryProvider(RangeCheckInterface& range_check,
                   ExecutionIdGetterInterface& execution_id_manager,
                   EventEmitterInterface<MemoryEvent>& event_emitter)
        : range_check(range_check)
        , execution_id_manager(execution_id_manager)
        , events(event_emitter)
    {}

    std::unique_ptr<MemoryInterface> make_memory(uint16_t space_id) override
    {
        return std::make_unique<Memory>(space_id, range_check, execution_id_manager, events);
    }

  private:
    RangeCheckInterface& range_check;
    ExecutionIdGetterInterface& execution_id_manager;
    EventEmitterInterface<MemoryEvent>& events;
};

} // namespace bb::avm2::simulation
