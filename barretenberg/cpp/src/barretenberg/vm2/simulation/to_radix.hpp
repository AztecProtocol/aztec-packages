#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/to_radix_event.hpp"

namespace bb::avm2::simulation {

class ToRadixInterface {
  public:
    virtual ~ToRadixInterface() = default;
    virtual std::vector<uint8_t> to_le_radix(const FF& value, uint32_t num_limbs, uint32_t radix) = 0;
    virtual std::vector<bool> to_le_bits(const FF& value, uint32_t num_limbs) = 0;
};

class ToRadix : public ToRadixInterface {
  public:
    ToRadix(EventEmitterInterface<ToRadixEvent>& event_emitter)
        : events(event_emitter)
    {}

    std::vector<uint8_t> to_le_radix(const FF& value, uint32_t num_limbs, uint32_t radix) override;
    std::vector<bool> to_le_bits(const FF& value, uint32_t num_limbs) override;

  private:
    EventEmitterInterface<ToRadixEvent>& events;
};

} // namespace bb::avm2::simulation
