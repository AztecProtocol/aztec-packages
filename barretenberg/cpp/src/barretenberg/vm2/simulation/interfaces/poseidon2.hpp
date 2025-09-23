#pragma once

#include <array>
#include <vector>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

// Forward declarations
class MemoryInterface;

class Poseidon2Interface {
  public:
    virtual ~Poseidon2Interface() = default;
    virtual FF hash(const std::vector<FF>& input) = 0;
    virtual std::array<FF, 4> permutation(const std::array<FF, 4>& input) = 0;
    // Overload for opcode execution that takes memory addresses
    virtual void permutation(MemoryInterface& memory, MemoryAddress src_address, MemoryAddress dst_address) = 0;
};

} // namespace bb::avm2::simulation
