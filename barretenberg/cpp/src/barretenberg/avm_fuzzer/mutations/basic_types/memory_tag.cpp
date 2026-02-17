/// This file contains mechanisms for deterministically mutating and generating memory tag

#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

using MemoryTag = bb::avm2::MemoryTag;

MemoryTag generate_memory_tag(std::mt19937_64& rng, const MemoryTagGenerationConfig& config)
{
    const MemoryTagOptions option = config.select(rng);
    switch (option) {
    case MemoryTagOptions::U1:
        return MemoryTag::U1;
    case MemoryTagOptions::U8:
        return MemoryTag::U8;
    case MemoryTagOptions::U16:
        return MemoryTag::U16;
    case MemoryTagOptions::U32:
        return MemoryTag::U32;
    case MemoryTagOptions::U64:
        return MemoryTag::U64;
    case MemoryTagOptions::U128:
        return MemoryTag::U128;
    case MemoryTagOptions::FF:
        return MemoryTag::FF;
    }
}

void mutate_memory_tag(MemoryTag& value, std::mt19937_64& rng, const MemoryTagMutationConfig& config)
{
    const MemoryTagOptions option = config.select(rng);
    switch (option) {
    case MemoryTagOptions::U1:
        value = MemoryTag::U1;
        break;
    case MemoryTagOptions::U8:
        value = MemoryTag::U8;
        break;
    case MemoryTagOptions::U16:
        value = MemoryTag::U16;
        break;
    case MemoryTagOptions::U32:
        value = MemoryTag::U32;
        break;
    case MemoryTagOptions::U64:
        value = MemoryTag::U64;
        break;
    case MemoryTagOptions::U128:
        value = MemoryTag::U128;
        break;
    case MemoryTagOptions::FF:
        value = MemoryTag::FF;
        break;
    }
}

void mutate_or_default_tag(MemoryTag& value, std::mt19937_64& rng, MemoryTag default_tag, double probability = 0.1)
{
    if (std::uniform_real_distribution<double>(0.0, 1.0)(rng) < probability) {
        mutate_memory_tag(value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
    } else {
        value = default_tag;
    }
}
