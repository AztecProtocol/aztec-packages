#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/bitwise_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

class BitwiseInterface {
  public:
    virtual ~BitwiseInterface() = default;
    virtual void and_op(MemoryTag tag, uint128_t a, uint128_t b, uint128_t c) = 0;
    virtual void or_op(MemoryTag tag, uint128_t a, uint128_t b, uint128_t c) = 0;
    virtual void xor_op(MemoryTag tag, uint128_t a, uint128_t b, uint128_t c) = 0;
};

class Bitwise : public BitwiseInterface {
  public:
    Bitwise(EventEmitterInterface<BitwiseEvent>& event_emitter)
        : events(event_emitter)
    {}

    // Operands are expected to be direct.
    void and_op(MemoryTag tag, uint128_t a, uint128_t b, uint128_t c) override;
    void or_op(MemoryTag tag, uint128_t a, uint128_t b, uint128_t c) override;
    void xor_op(MemoryTag tag, uint128_t a, uint128_t b, uint128_t c) override;

  private:
    // TODO: Use deduplicating events
    EventEmitterInterface<BitwiseEvent>& events;
};

} // namespace bb::avm2::simulation