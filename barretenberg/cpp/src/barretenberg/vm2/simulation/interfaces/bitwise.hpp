#pragma once

#include <utility>

#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

class BitwiseInterface {
  public:
    virtual ~BitwiseInterface() = default;
    virtual MemoryValue and_op(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue or_op(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue xor_op(const MemoryValue& a, const MemoryValue& b) = 0;
};

// Extends the scalar bitwise interface with the SIMD-64 operations used by keccak witness
// generation. Kept separate from BitwiseInterface because pure simulation never needs them.
class BitwiseSimdInterface : public BitwiseInterface {
  public:
    // SIMD-64: compute two independent U64 bitwise operations in a single sub-trace row by packing
    // them into the two halves of a U128. Lane 0 is (a1, b1), lane 1 is (a2, b2); returns (c1, c2).
    virtual std::pair<MemoryValue, MemoryValue> simd_and_op_64(const MemoryValue& a1,
                                                               const MemoryValue& b1,
                                                               const MemoryValue& a2,
                                                               const MemoryValue& b2) = 0;
    virtual std::pair<MemoryValue, MemoryValue> simd_xor_op_64(const MemoryValue& a1,
                                                               const MemoryValue& b1,
                                                               const MemoryValue& a2,
                                                               const MemoryValue& b2) = 0;
};

class BitwiseException : public std::runtime_error {
  public:
    BitwiseException(const std::string& msg)
        : std::runtime_error("Bitwise Exception: " + msg)
    {}
};

} // namespace bb::avm2::simulation
