#pragma once

#include <array>
#include <cstdint>

#include "barretenberg/vm2/simulation/bitwise.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/keccakf1600_event.hpp"

namespace bb::avm2::simulation {

class KeccakF1600Interface {
  public:
    virtual ~KeccakF1600Interface() = default;
    virtual std::array<std::array<uint64_t, 5>, 5> permutation(const std::array<std::array<uint64_t, 5>, 5>& input) = 0;
};

class KeccakF1600 : public KeccakF1600Interface {
  public:
    using State = std::array<std::array<uint64_t, 5>, 5>;

    KeccakF1600(EventEmitterInterface<KeccakF1600Event>& keccakf1600_emitter, BitwiseInterface& bitwise)
        : perm_events(keccakf1600_emitter)
        , bitwise(bitwise)
    {}

    State permutation(const State& input) override;

  private:
    EventEmitterInterface<KeccakF1600Event>& perm_events;
    BitwiseInterface& bitwise;
};

} // namespace bb::avm2::simulation
