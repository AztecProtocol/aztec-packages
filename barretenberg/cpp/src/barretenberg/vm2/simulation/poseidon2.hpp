#pragma once

#include <array>
#include <cstdint>
#include <vector>

#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/poseidon2_event.hpp"

namespace bb::avm2::simulation {

class Poseidon2Interface {
  public:
    virtual ~Poseidon2Interface() = default;
    virtual FF hash(const std::vector<FF>& input) = 0;
    virtual std::array<FF, 4> permutation(const std::array<FF, 4>& input) = 0;
};

class Poseidon2 : public Poseidon2Interface {
  public:
    Poseidon2(EventEmitterInterface<Poseidon2HashEvent>& hash_emitter,
              EventEmitterInterface<Poseidon2PermutationEvent>& perm_emitter)
        : hash_events(hash_emitter)
        , perm_events(perm_emitter)
    {}

    FF hash(const std::vector<FF>& input) override;
    std::array<FF, 4> permutation(const std::array<FF, 4>& input) override;

  private:
    EventEmitterInterface<Poseidon2HashEvent>& hash_events;
    EventEmitterInterface<Poseidon2PermutationEvent>& perm_events;
};

} // namespace bb::avm2::simulation
