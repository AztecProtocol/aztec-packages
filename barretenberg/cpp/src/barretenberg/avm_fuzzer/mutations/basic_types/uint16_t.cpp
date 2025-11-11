#include "barretenberg/avm_fuzzer/mutations/basic_types/uint16_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint_mutations.hpp"

void mutate_uint16_t(uint16_t& value, std::mt19937_64& rng, const Uint16MutationConfig& config)
{
    mutate_uint(value, rng, config);
}
