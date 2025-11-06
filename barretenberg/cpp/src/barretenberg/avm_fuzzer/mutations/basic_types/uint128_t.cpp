#include "barretenberg/avm_fuzzer/mutations/basic_types/uint128_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint_mutations.hpp"

void mutate_uint128_t(uint128_t& value, std::mt19937_64& rng, const Uint128MutationConfig& config)
{
    mutate_uint(value, rng, config);
}
