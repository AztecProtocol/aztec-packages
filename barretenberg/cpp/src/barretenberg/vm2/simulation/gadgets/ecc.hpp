#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/ecc_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/gt.hpp"
#include "barretenberg/vm2/simulation/gadgets/memory.hpp"
#include "barretenberg/vm2/simulation/gadgets/to_radix.hpp"
#include "barretenberg/vm2/simulation/interfaces/ecc.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"

namespace bb::avm2::simulation {

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
