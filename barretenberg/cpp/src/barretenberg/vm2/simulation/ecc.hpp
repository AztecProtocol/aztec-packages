#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gt.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"
#include "barretenberg/vm2/simulation/to_radix.hpp"

namespace bb::avm2::simulation {

class EccInterface {
  public:
    virtual ~EccInterface() = default;
    virtual EmbeddedCurvePoint add(const EmbeddedCurvePoint& p, const EmbeddedCurvePoint& q) = 0;
    virtual EmbeddedCurvePoint scalar_mul(const EmbeddedCurvePoint& point, const FF& scalar) = 0;
    virtual void add(MemoryInterface& memory,
                     const EmbeddedCurvePoint& p,
                     const EmbeddedCurvePoint& q,
                     MemoryAddress dst_address) = 0;
};

class Ecc : public EccInterface {
  public:
    Ecc(ExecutionIdManagerInterface& execution_id_manager,
        GreaterThanInterface& gt,
        ToRadixInterface& to_radix,
        EventEmitterInterface<EccAddEvent>& ecadd_event_emitter,
        EventEmitterInterface<ScalarMulEvent>& scalar_mul_event_emitter,
        EventEmitterInterface<EccAddMemoryEvent>& add_memory_event_emitter)
        : add_events(ecadd_event_emitter)
        , scalar_mul_events(scalar_mul_event_emitter)
        , add_memory_events(add_memory_event_emitter)
        , gt(gt)
        , to_radix(to_radix)
        , execution_id_manager(execution_id_manager)
    {}

    EmbeddedCurvePoint add(const EmbeddedCurvePoint& p, const EmbeddedCurvePoint& q) override;
    EmbeddedCurvePoint scalar_mul(const EmbeddedCurvePoint& point, const FF& scalar) override;
    void add(MemoryInterface& memory,
             const EmbeddedCurvePoint& p,
             const EmbeddedCurvePoint& q,
             MemoryAddress dst_address) override;

  private:
    EventEmitterInterface<EccAddEvent>& add_events;
    EventEmitterInterface<ScalarMulEvent>& scalar_mul_events;
    EventEmitterInterface<EccAddMemoryEvent>& add_memory_events;
    GreaterThanInterface& gt;
    ToRadixInterface& to_radix;
    ExecutionIdManagerInterface& execution_id_manager;
};

} // namespace bb::avm2::simulation
