#pragma once

#include <memory>

#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/poseidon2.hpp"

namespace bb::avm2::simulation {

class BytecodeHashingInterface {
  public:
    virtual ~BytecodeHashingInterface() = default;
    virtual FF compute_public_bytecode_commitment(const ContractClassId class_id,
                                                  const std::vector<uint8_t>& bytecode) = 0;
};

class BytecodeHasher : public BytecodeHashingInterface {
  public:
    BytecodeHasher(Poseidon2& hasher, EventEmitterInterface<BytecodeHashingEvent>& events)
        : events(events)
        , hasher(hasher)
    {}

    FF compute_public_bytecode_commitment(const ContractClassId class_id,
                                          const std::vector<uint8_t>& bytecode) override;

  private:
    [[maybe_unused]] EventEmitterInterface<BytecodeHashingEvent>& events;
    Poseidon2Interface& hasher;

    unordered_flat_map<ContractClassId, FF> bytecode_commitments;
};

} // namespace bb::avm2::simulation
