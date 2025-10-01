#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/to_radix_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/memory.hpp"
#include "barretenberg/vm2/simulation/interfaces/to_radix.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"

namespace bb::avm2::simulation {

class ToRadix : public ToRadixInterface {
  public:
    ToRadix(ExecutionIdManagerInterface& execution_id_manager,
            GreaterThanInterface& gt,
            EventEmitterInterface<ToRadixEvent>& event_emitter,
            EventEmitterInterface<ToRadixMemoryEvent>& memory_event_emitter)
        : execution_id_manager(execution_id_manager)
        , gt(gt)
        , events(event_emitter)
        , memory_events(memory_event_emitter)
    {}

    std::pair<std::vector<uint8_t>, /* truncated */ bool> to_le_radix(const FF& value,
                                                                      uint32_t num_limbs,
                                                                      uint32_t radix) override;
    std::pair<std::vector<bool>, /* truncated */ bool> to_le_bits(const FF& value, uint32_t num_limbs) override;
    void to_be_radix(MemoryInterface& memory,
                     const FF& value,
                     uint32_t radix,
                     uint32_t num_limbs,
                     bool is_output_bits,
                     MemoryAddress dst_addr) override;

  private:
    ExecutionIdManagerInterface& execution_id_manager;
    GreaterThanInterface& gt;
    EventEmitterInterface<ToRadixEvent>& events;
    EventEmitterInterface<ToRadixMemoryEvent>& memory_events;
};

} // namespace bb::avm2::simulation
