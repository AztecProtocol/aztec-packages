#pragma once

#include "barretenberg/vm2/simulation/events/ecc_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"

namespace bb::avm2::simulation {

class EccInterface {
  public:
    virtual ~EccInterface() = default;
    virtual AffinePoint add(const AffinePoint& p, const AffinePoint& q) = 0;
};

class Ecc : public EccInterface {
  public:
    Ecc(EventEmitterInterface<EccAddEvent>& event_emitter)
        : events(event_emitter)
    {}

    AffinePoint add(const AffinePoint& p, const AffinePoint& q) override;

  private:
    EventEmitterInterface<EccAddEvent>& events;
};

} // namespace bb::avm2::simulation
