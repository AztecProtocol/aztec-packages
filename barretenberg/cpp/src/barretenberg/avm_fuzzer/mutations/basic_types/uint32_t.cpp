#include "barretenberg/avm_fuzzer/mutations/basic_types/uint32_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint_mutations.hpp"

void mutate_uint32_t(uint32_t& value, std::mt19937_64& rng, const Uint32MutationConfig& config)
{
    mutate_uint(value, rng, config);
}
