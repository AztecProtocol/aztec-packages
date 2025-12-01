#include "barretenberg/avm_fuzzer/mutations/basic_types/uint8_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint_mutations.hpp"

void mutate_uint8_t(uint8_t& value, std::mt19937_64& rng, const Uint8MutationConfig& config)
{
    mutate_uint(value, rng, config);
}
