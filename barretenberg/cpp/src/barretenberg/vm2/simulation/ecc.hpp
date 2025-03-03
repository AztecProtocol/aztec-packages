#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"

namespace bb::avm2::simulation {

class EccInterface {
  public:
    virtual ~EccInterface() = default;
    virtual AffinePoint add(const AffinePoint& p, const AffinePoint& q) = 0;
};

class Ecc : public EccInterface {
  public:
    Ecc(EventEmitterInterface<EccAddEvent>& ecadd_event_emitter,
        EventEmitterInterface<ScalarMulEvent>& scalar_mul_event_emitter)
        : add_events(ecadd_event_emitter)
        , scalar_mul_events(scalar_mul_event_emitter)
    {}

    AffinePoint add(const AffinePoint& p, const AffinePoint& q) override;
    AffinePoint scalar_mul(const AffinePoint& point, const FF& scalar);

  private:
    EventEmitterInterface<EccAddEvent>& add_events;
    EventEmitterInterface<ScalarMulEvent>& scalar_mul_events;
};

} // namespace bb::avm2::simulation
