#pragma once

#include <cstdint>
#include <memory>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

class RangeCheckInterface {
  public:
    virtual ~RangeCheckInterface() = default;
    virtual void assert_range(uint128_t value, uint8_t num_bits) = 0;
};

class RangeCheck : public RangeCheckInterface {
  public:
    RangeCheck(EventEmitterInterface<RangeCheckEvent>& event_emitter)
        : events(event_emitter)
    {}

    // Operands are expected to be direct.
    void assert_range(uint128_t value, uint8_t num_bits) override;

  private:
    EventEmitterInterface<RangeCheckEvent>& events;
};

} // namespace bb::avm2::simulation
