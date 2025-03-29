#pragma once

#include <cstdint>
#include <memory>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

class AluInterface {
  public:
    virtual ~AluInterface() = default;
    // I'd like to return a ValueRefAndTag, but the MemoryValue& doesnt live long enough.
    virtual FF add(const ValueRefAndTag& a, const ValueRefAndTag& b) = 0;
};

class Alu : public AluInterface {
  public:
    Alu(EventEmitterInterface<AluEvent>& event_emitter)
        : events(event_emitter)
    {}

    FF add(const ValueRefAndTag& a, const ValueRefAndTag& b) override;

  private:
    EventEmitterInterface<AluEvent>& events;
};

} // namespace bb::avm2::simulation
