#pragma once

#include <cstdint>
#include <memory>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"
#include "barretenberg/vm2/simulation/range_check.hpp"

namespace bb::avm2::simulation {

class AluInterface {
  public:
    virtual ~AluInterface() = default;
    virtual MemoryValue add(const MemoryValue& a, const MemoryValue& b) = 0;
};

class Alu : public AluInterface {
  public:
    Alu(RangeCheckInterface& range_check, EventEmitterInterface<AluEvent>& event_emitter)
        : range_check(range_check)
        , events(event_emitter)
    {}

    MemoryValue add(const MemoryValue& a, const MemoryValue& b) override;

  private:
    RangeCheckInterface& range_check;
    EventEmitterInterface<AluEvent>& events;
};

} // namespace bb::avm2::simulation
