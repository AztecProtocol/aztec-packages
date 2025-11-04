#include "barretenberg/avm_fuzzer/mutations/control_flow/return_options.hpp"

#include <random>

#include "barretenberg/avm_fuzzer/mutations/basic_types/memory_tag.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint16_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint8_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"

void mutate_return_options(ReturnOptions& return_options,
                           std::mt19937_64& rng,
                           const ReturnOptionsMutationConfig& config)
{
    ReturnOptionsMutationOptions option = config.select(rng);

    switch (option) {
    case ReturnOptionsMutationOptions::return_size:
        mutate_uint8_t(return_options.return_size, rng, BASIC_UINT8_T_MUTATION_CONFIGURATION);
        break;
    case ReturnOptionsMutationOptions::return_value_tag:
        mutate_memory_tag(return_options.return_value_tag.value, rng, BASIC_MEMORY_TAG_MUTATION_CONFIGURATION);
        break;
    case ReturnOptionsMutationOptions::return_value_offset_index:
        mutate_uint16_t(return_options.return_value_offset_index, rng, BASIC_UINT16_T_MUTATION_CONFIGURATION);
        break;
    }
}
