#pragma once

#include <utility>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/bitwise_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/interfaces/bitwise.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Witness-generating implementation of bitwise AND/OR/XOR operations.
 */
class Bitwise : public BitwiseSimdInterface {
  public:
    /**
     * @param event_emitter Destination for BitwiseEvent emissions consumed by tracegen.
     */
    Bitwise(EventEmitterInterface<BitwiseEvent>& event_emitter)
        : events(event_emitter)
    {}

    MemoryValue and_op(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue or_op(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue xor_op(const MemoryValue& a, const MemoryValue& b) override;

    std::pair<MemoryValue, MemoryValue> simd_and_op_64(const MemoryValue& a1,
                                                       const MemoryValue& b1,
                                                       const MemoryValue& a2,
                                                       const MemoryValue& b2) override;
    std::pair<MemoryValue, MemoryValue> simd_xor_op_64(const MemoryValue& a1,
                                                       const MemoryValue& b1,
                                                       const MemoryValue& a2,
                                                       const MemoryValue& b2) override;

  private:
    EventEmitterInterface<BitwiseEvent>& events;
};

} // namespace bb::avm2::simulation
