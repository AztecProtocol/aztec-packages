#pragma once

#include "barretenberg/vm2/simulation/events/calldata_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"

namespace bb::avm2::simulation {

class CalldataHashingInterface {
  public:
    virtual ~CalldataHashingInterface() = default;
    virtual FF compute_calldata_hash(const EnqueuedCallId enqueued_call_id, const std::vector<FF>& calldata) = 0;
};

class CalldataHasher : public CalldataHashingInterface {
  public:
    CalldataHasher(Poseidon2& hasher, EventEmitterInterface<CalldataHashingEvent>& events)
        : events(events)
        , hasher(hasher)
    {}

    FF compute_calldata_hash(const EnqueuedCallId enqueued_call_id, const std::vector<FF>& calldata) override;

  private:
    EventEmitterInterface<CalldataHashingEvent>& events;
    Poseidon2Interface& hasher;
};

} // namespace bb::avm2::simulation
