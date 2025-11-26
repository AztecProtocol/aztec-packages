#pragma once

#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

using MemoryTag = bb::avm2::MemoryTag;

MemoryTag generate_memory_tag(std::mt19937_64& rng, const MemoryTagGenerationConfig& config);
void mutate_memory_tag(MemoryTag& value, std::mt19937_64& rng, const MemoryTagMutationConfig& config);
