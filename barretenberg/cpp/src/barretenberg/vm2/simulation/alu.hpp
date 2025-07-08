#pragma once

#include <cstdint>
#include <memory>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/field_gt.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"
#include "barretenberg/vm2/simulation/range_check.hpp"

namespace bb::avm2::simulation {

class AluInterface {
  public:
    virtual ~AluInterface() = default;
    virtual MemoryValue add(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue eq(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue lt(const MemoryValue& a, const MemoryValue& b) = 0;
};

class Alu : public AluInterface {
  public:
    Alu(RangeCheckInterface& range_check,
        FieldGreaterThanInterface& field_gt,
        EventEmitterInterface<AluEvent>& event_emitter)
        : range_check(range_check)
        , field_gt(field_gt)
        , events(event_emitter)
    {}

    MemoryValue add(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue eq(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue lt(const MemoryValue& a, const MemoryValue& b) override;

  private:
    RangeCheckInterface& range_check;
    FieldGreaterThanInterface& field_gt;
    EventEmitterInterface<AluEvent>& events;
};

} // namespace bb::avm2::simulation
