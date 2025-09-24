#pragma once

#include <cstdint>
#include <memory>

#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/range_check_event.hpp"
#include "barretenberg/vm2/simulation/interfaces/range_check.hpp"

namespace bb::avm2::simulation {

class RangeCheck : public RangeCheckInterface {
  public:
    RangeCheck(EventEmitterInterface<RangeCheckEvent>& event_emitter)
        : events(event_emitter)
    {}

    void assert_range(uint128_t value, uint8_t num_bits) override;

  private:
    EventEmitterInterface<RangeCheckEvent>& events;
};

} // namespace bb::avm2::simulation
