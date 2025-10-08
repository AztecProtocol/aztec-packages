#pragma once

#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/calldata_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/poseidon2.hpp"
#include "barretenberg/vm2/simulation/interfaces/calldata_hashing.hpp"

namespace bb::avm2::simulation {

class CalldataHasher : public CalldataHashingInterface {
  public:
    CalldataHasher(uint32_t context_id, Poseidon2Interface& hasher, EventEmitterInterface<CalldataEvent>& events)
        : context_id(context_id)
        , events(events)
        , hasher(hasher)
    {}

    FF compute_calldata_hash(std::span<const FF> calldata) override;

  private:
    uint32_t context_id;
    EventEmitterInterface<CalldataEvent>& events;
    Poseidon2Interface& hasher;
};

class CalldataHashingProvider : public CalldataHashingProviderInterface {
  public:
    CalldataHashingProvider(Poseidon2Interface& hasher, EventEmitterInterface<CalldataEvent>& event_emitter)
        : hasher(hasher)
        , events(event_emitter)
    {}

    std::unique_ptr<CalldataHashingInterface> make_calldata_hasher(uint32_t context_id) override
    {
        return std::make_unique<CalldataHasher>(context_id, hasher, events);
    }

  private:
    Poseidon2Interface& hasher;
    EventEmitterInterface<CalldataEvent>& events;
};

} // namespace bb::avm2::simulation
