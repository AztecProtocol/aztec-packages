#pragma once

#include <array>
#include <cstdint>

#include "barretenberg/vm2/simulation/bitwise.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/keccakf1600_event.hpp"
#include "barretenberg/vm2/simulation/range_check.hpp"

namespace bb::avm2::simulation {

// This table needs to match with the one in pil
// Reference: https://keccak.team/keccak_specs_summary.html#rotationOffsets
constexpr std::array<std::array<uint8_t, 5>, 5> rotation_len = { {
    { 0, 36, 3, 41, 18 },
    { 1, 44, 10, 45, 2 },
    { 62, 6, 43, 15, 61 },
    { 28, 55, 25, 21, 56 },
    { 27, 20, 39, 8, 14 },
} };

class KeccakF1600Interface {
  public:
    virtual ~KeccakF1600Interface() = default;
    virtual KeccakF1600State permutation(const KeccakF1600State& input) = 0;
};

class KeccakF1600 : public KeccakF1600Interface {
  public:
    KeccakF1600(EventEmitterInterface<KeccakF1600Event>& keccakf1600_emitter,
                BitwiseInterface& bitwise,
                RangeCheckInterface& range_check)
        : perm_events(keccakf1600_emitter)
        , bitwise(bitwise)
        , range_check(range_check)
    {}

    KeccakF1600State permutation(const KeccakF1600State& input) override;

  private:
    EventEmitterInterface<KeccakF1600Event>& perm_events;
    BitwiseInterface& bitwise;
    RangeCheckInterface& range_check;
};

} // namespace bb::avm2::simulation
