#include "barretenberg/avm_fuzzer/mutations/fault_injection/memory_value.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/memory_tag.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include <random>

namespace bb::avm2::fuzzer {

MemoryValue mutate_memory_value(bb::avm2::MemoryValue& value,
                                std::mt19937_64& rng,
                                const MemoryValueMutationConfig& config)
{
    auto mutation = config.select(rng);
    switch (mutation) {
    case MemoryValueMutationOptions::Tag: {
        auto mutated_tag = value.get_tag();
        mutate_memory_tag(mutated_tag, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        return MemoryValue::from_tag(mutated_tag, value.as_ff());
    }
    case MemoryValueMutationOptions::Add1:
        return MemoryValue::from_tag_truncating(value.get_tag(), value.as_ff() + 1);
    case MemoryValueMutationOptions::Sub1:
        return MemoryValue::from_tag_truncating(value.get_tag(), value.as_ff() - 1);
    case MemoryValueMutationOptions::SetMin:
        return MemoryValue::from_tag_truncating(value.get_tag(), 0);
    case MemoryValueMutationOptions::SetMax:
        return MemoryValue::from_tag_truncating(value.get_tag(), get_tag_max_value(value.get_tag()));
    }
}

} // namespace bb::avm2::fuzzer
