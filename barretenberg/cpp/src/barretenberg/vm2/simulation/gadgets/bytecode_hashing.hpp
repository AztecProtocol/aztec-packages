#pragma once

#include <cstdint>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/interfaces/bytecode_hashing.hpp"
#include "barretenberg/vm2/simulation/interfaces/poseidon2.hpp"

namespace bb::avm2::simulation {

class BytecodeHasher : public BytecodeHashingInterface {
  public:
    BytecodeHasher(Poseidon2Interface& hasher, EventEmitterInterface<BytecodeHashingEvent>& events)
        : events(events)
        , hasher(hasher)
    {}

    void assert_public_bytecode_commitment(const BytecodeId& bytecode_id,
                                           const std::vector<uint8_t>& bytecode) override;

  private:
    EventEmitterInterface<BytecodeHashingEvent>& events;
    Poseidon2Interface& hasher;
};

} // namespace bb::avm2::simulation
