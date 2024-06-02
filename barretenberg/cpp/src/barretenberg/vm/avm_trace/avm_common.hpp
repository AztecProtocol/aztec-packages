#pragma once

#include "barretenberg/vm/avm_trace/constants.hpp"
#include "barretenberg/vm/generated/avm_flavor.hpp"

#include <array>
#include <cstdint>
#include <unordered_map>

namespace bb::avm_trace {

using Flavor = bb::AvmFlavor;
using FF = Flavor::FF;

} // namespace bb::avm_trace

// TODO: where is the best place for this to live?
namespace std {
template <> struct hash<bb::avm_trace::FF> {
    // We define a hash function for the AVM FF type for an unordered_map integration
    size_t operator()(const bb::avm_trace::FF& ff) const
    {
        return (
            std::hash<uint64_t>()(ff.data[0]) ^
            std::hash<uint64_t>()(ff.data[1] ^ std::hash<uint64_t>()(ff.data[2]) ^ std::hash<uint64_t>()(ff.data[3])));
    }
};
} // namespace std

namespace bb::avm_trace {

// There are 4 public input columns, 1 for context inputs, and 3 for emitting side effects
using VmPublicInputs = std::tuple<std::array<FF, KERNEL_INPUTS_LENGTH>,   // Input: Kernel context inputs
                                  std::array<FF, KERNEL_OUTPUTS_LENGTH>,  // Output: Kernel outputs data
                                  std::array<FF, KERNEL_OUTPUTS_LENGTH>,  // Output: Kernel outputs side effects
                                  std::array<FF, KERNEL_OUTPUTS_LENGTH>>; // Output: Kernel outputs metadata
// Constants for indexing into the tuple above
static const size_t KERNEL_INPUTS = 0;
static const size_t KERNEL_OUTPUTS_VALUE = 1;
static const size_t KERNEL_OUTPUTS_SIDE_EFFECT_COUNTER = 2;
static const size_t KERNEL_OUTPUTS_METADATA = 3;

// Number of rows
static const size_t AVM_TRACE_SIZE = 1 << 18;
enum class IntermRegister : uint32_t { IA = 0, IB = 1, IC = 2, ID = 3 };
enum class IndirectRegister : uint32_t { IND_A = 0, IND_B = 1, IND_C = 2, IND_D = 3 };

// Keep following enum in sync with MAX_NEM_TAG below
enum class AvmMemoryTag : uint32_t { U0 = 0, U8 = 1, U16 = 2, U32 = 3, U64 = 4, U128 = 5, FF = 6 };
static const uint32_t MAX_MEM_TAG = 6;

static const size_t NUM_MEM_SPACES = 256;
static const uint8_t INTERNAL_CALL_SPACE_ID = 255;
static const uint32_t MAX_SIZE_INTERNAL_STACK = 1 << 16;

// TODO: find a more suitable place for these
/**
 * Auxiliary hints are required when the executor is unable to work out a witness value
 * These hints will be required for any opcodes that will require database information
 */
struct ExecutionHints {
    // slot -> value
    std::unordered_map<FF, FF> storage_values;

    // Note hash value -> exists
    std::unordered_map<FF, bool> note_hash_exists;

    // Nullifier -> exists
    std::unordered_map<FF, bool> nullifier_exists;

    // L1 to L2 message exists
    std::unordered_map<FF, bool> l1_to_l2_msg_exists;

    ExecutionHints()
    {
        storage_values = std::unordered_map<FF, FF>();
        note_hash_exists = std::unordered_map<FF, bool>();
        nullifier_exists = std::unordered_map<FF, bool>();
        l1_to_l2_msg_exists = std::unordered_map<FF, bool>();
    }

    friend bool operator==(const ExecutionHints&, const ExecutionHints&);
    std::vector<uint8_t> bincodeSerialize() const;
    static ExecutionHints bincodeDeserialize(std::vector<uint8_t>);
};

} // namespace bb::avm_trace
