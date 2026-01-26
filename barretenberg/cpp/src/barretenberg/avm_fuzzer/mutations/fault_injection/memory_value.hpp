#pragma once
//! Mutates memory value
//! 1) Mutate tag
//! 2) Add/Subtract 1
//! 3) Set min/max value

#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include <random>
namespace bb::avm2::fuzzer {

bb::avm2::MemoryValue mutate_memory_value(
    bb::avm2::MemoryValue& value,
    std::mt19937_64& rng,
    const MemoryValueMutationConfig& config = BASIC_MEMORY_VALUE_MUTATION_CONFIGURATION);
} // namespace bb::avm2::fuzzer
