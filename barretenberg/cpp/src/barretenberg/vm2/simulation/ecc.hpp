#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/to_radix.hpp"

namespace bb::avm2::simulation {

class EccInterface {
  public:
    virtual ~EccInterface() = default;
    virtual EmbeddedCurvePoint add(const EmbeddedCurvePoint& p, const EmbeddedCurvePoint& q) = 0;
    virtual EmbeddedCurvePoint scalar_mul(const EmbeddedCurvePoint& point, const FF& scalar) = 0;
};

class Ecc : public EccInterface {
  public:
    Ecc(ToRadixInterface& to_radix,
        EventEmitterInterface<EccAddEvent>& ecadd_event_emitter,
        EventEmitterInterface<ScalarMulEvent>& scalar_mul_event_emitter)
        : add_events(ecadd_event_emitter)
        , scalar_mul_events(scalar_mul_event_emitter)
        , to_radix(to_radix)
    {}

    EmbeddedCurvePoint add(const EmbeddedCurvePoint& p, const EmbeddedCurvePoint& q) override;
    EmbeddedCurvePoint scalar_mul(const EmbeddedCurvePoint& point, const FF& scalar) override;

  private:
    EventEmitterInterface<EccAddEvent>& add_events;
    EventEmitterInterface<ScalarMulEvent>& scalar_mul_events;
    ToRadixInterface& to_radix;
};

} // namespace bb::avm2::simulation
