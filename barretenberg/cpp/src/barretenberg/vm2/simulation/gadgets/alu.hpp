#pragma once

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/gt.hpp"
#include "barretenberg/vm2/simulation/interfaces/alu.hpp"

namespace bb::avm2::simulation {

class Alu : public AluInterface {
  public:
    Alu(GreaterThanInterface& greater_than,
        FieldGreaterThanInterface& field_gt,
        RangeCheckInterface& range_check,
        EventEmitterInterface<AluEvent>& event_emitter)
        : greater_than(greater_than)
        , field_gt(field_gt)
        , range_check(range_check)
        , events(event_emitter)
    {}

    MemoryValue add(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue sub(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue mul(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue div(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue fdiv(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue eq(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue lt(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue lte(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue op_not(const MemoryValue& a) override;
    MemoryValue truncate(const FF& a, MemoryTag dst_tag) override;
    MemoryValue shr(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue shl(const MemoryValue& a, const MemoryValue& b) override;

  private:
    GreaterThanInterface& greater_than;
    FieldGreaterThanInterface& field_gt;
    RangeCheckInterface& range_check;
    EventEmitterInterface<AluEvent>& events;
};

} // namespace bb::avm2::simulation
