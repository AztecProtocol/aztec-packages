#pragma once

#include <cstdint>
#include <stdexcept>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/bitwise_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"

namespace bb::avm2::simulation {

class BitwiseInterface {
  public:
    virtual ~BitwiseInterface() = default;
    virtual MemoryValue and_op(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue or_op(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue xor_op(const MemoryValue& a, const MemoryValue& b) = 0;
};

class Bitwise : public BitwiseInterface {
  public:
    Bitwise(EventEmitterInterface<BitwiseEvent>& event_emitter)
        : events(event_emitter)
    {}

    MemoryValue and_op(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue or_op(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue xor_op(const MemoryValue& a, const MemoryValue& b) override;

  private:
    // TODO: Use deduplicating events + consider (see bottom paragraph of bitwise.pil) a further deduplication
    // when some inputs are prefixes of another ones (with a bigger tag).
    EventEmitterInterface<BitwiseEvent>& events;
};

} // namespace bb::avm2::simulation
