#pragma once

#include <array>
#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/bitwise.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/keccakf1600_event.hpp"
#include "barretenberg/vm2/simulation/range_check.hpp"

namespace bb::avm2::simulation {

// This table needs to match with the one in pil
// Reference: https://keccak.team/keccak_specs_summary.html#rotationOffsets
constexpr std::array<std::array<uint8_t, 5>, 5> keccak_rotation_len = { {
    { 0, 36, 3, 41, 18 },
    { 1, 44, 10, 45, 2 },
    { 62, 6, 43, 15, 61 },
    { 28, 55, 25, 21, 56 },
    { 27, 20, 39, 8, 14 },
} };

// Pi permutation: state_pi[x][y] = state_rho[(x + 3*y) % 5][x]
// This table, pi_rho_x_coords[x_pi][y_pi], stores the x-coordinate for state_rho,
// i.e., (x_pi + 3*y_pi) % 5. The y-coordinate for state_rho is simply x_pi.
constexpr std::array<std::array<uint8_t, 5>, 5> keccak_pi_rho_x_coords = { {
    { 0, 3, 1, 4, 2 }, // x_pi = 0
    { 1, 4, 2, 0, 3 }, // x_pi = 1
    { 2, 0, 3, 1, 4 }, // x_pi = 2
    { 3, 1, 4, 2, 0 }, // x_pi = 3
    { 4, 2, 0, 3, 1 }, // x_pi = 4
} };

// Round constants
// Reference: https://keccak.team/keccak_specs_summary.html#roundConstants
constexpr std::array<uint64_t, 24> keccak_round_constants = { {
    0x0000000000000001, 0x0000000000008082, 0x800000000000808a, 0x8000000080008000, 0x000000000000808b,
    0x0000000080000001, 0x8000000080008081, 0x8000000000008009, 0x000000000000008a, 0x0000000000000088,
    0x0000000080008009, 0x000000008000000a, 0x000000008000808b, 0x800000000000008b, 0x8000000000008089,
    0x8000000000008003, 0x8000000000008002, 0x8000000000000080, 0x000000000000800a, 0x800000008000000a,
    0x8000000080008081, 0x8000000000008080, 0x0000000080000001, 0x8000000080008008,
} };

class KeccakF1600Interface {
  public:
    virtual ~KeccakF1600Interface() = default;
    virtual void permutation(ContextInterface& context, MemoryAddress dst_addr, MemoryAddress src_addr) = 0;
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

    void permutation(ContextInterface& context, MemoryAddress dst_addr, MemoryAddress src_addr) override;

  private:
    EventEmitterInterface<KeccakF1600Event>& perm_events;
    BitwiseInterface& bitwise;
    RangeCheckInterface& range_check;
};

} // namespace bb::avm2::simulation
