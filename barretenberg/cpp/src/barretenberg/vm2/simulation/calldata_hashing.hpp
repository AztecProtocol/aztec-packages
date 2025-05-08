#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/calldata_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"

#include <vector>

namespace bb::avm2::simulation {

class CalldataHashingInterface {
  public:
    virtual ~CalldataHashingInterface() = default;
    virtual FF compute_calldata_hash(const uint32_t context_id, const std::vector<FF>& calldata) = 0;
};

class CalldataHasher : public CalldataHashingInterface {
  public:
    CalldataHasher(Poseidon2& hasher, EventEmitterInterface<CalldataEvent>& events)
        : events(events)
        , hasher(hasher)
    {}

    FF compute_calldata_hash(const uint32_t context_id, const std::vector<FF>& calldata) override;

  private:
    EventEmitterInterface<CalldataEvent>& events;
    Poseidon2Interface& hasher;
};

} // namespace bb::avm2::simulation
