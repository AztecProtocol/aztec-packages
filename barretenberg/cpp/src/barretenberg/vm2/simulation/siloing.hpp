#pragma once

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/siloing_event.hpp"

namespace bb::avm2::simulation {

class SiloingInterface {
  public:
    virtual ~SiloingInterface() = default;
    virtual FF silo_nullifier(const FF& nullifier, const FF& silo_by) = 0;
};

class Siloing : public SiloingInterface {
  public:
    Siloing(EventEmitterInterface<SiloingEvent>& events)
        : events(events)
    {}

    FF silo_nullifier(const FF& nullifier, const FF& silo_by) override
    {
        return silo(GENERATOR_INDEX__OUTER_NULLIFIER, nullifier, silo_by, SiloingType::NULLIFIER);
    }

  private:
    FF silo(const FF& generator, const FF& elem, const FF& silo_by, SiloingType type);

    EventEmitterInterface<SiloingEvent>& events;
};

} // namespace bb::avm2::simulation
