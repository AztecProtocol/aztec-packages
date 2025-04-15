#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/bitwise_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

// TODO(fcarreiro): think if it makes sense to have memory types like in TS with implicit tag
class BitwiseInterface {
  public:
    virtual ~BitwiseInterface() = default;
    virtual uint128_t and_op(MemoryTag tag, const uint128_t& a, const uint128_t& b) = 0;
    virtual uint128_t or_op(MemoryTag tag, const uint128_t& a, const uint128_t& b) = 0;
    virtual uint128_t xor_op(MemoryTag tag, const uint128_t& a, const uint128_t& b) = 0;
};

class Bitwise : public BitwiseInterface {
  public:
    Bitwise(EventEmitterInterface<BitwiseEvent>& event_emitter)
        : events(event_emitter)
    {}

    // Operands are expected to be direct.
    uint128_t and_op(MemoryTag tag, const uint128_t& a, const uint128_t& b) override;
    uint128_t or_op(MemoryTag tag, const uint128_t& a, const uint128_t& b) override;
    uint128_t xor_op(MemoryTag tag, const uint128_t& a, const uint128_t& b) override;

  private:
    // TODO: Use deduplicating events + consider (see bottom paragraph of bitwise.pil) a further deduplocation
    // when some inputs are prefixes of another ones (with a bigger tag).
    EventEmitterInterface<BitwiseEvent>& events;
};

} // namespace bb::avm2::simulation