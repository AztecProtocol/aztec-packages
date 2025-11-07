#include "barretenberg/avm_fuzzer/mutations/basic_types/uint64_t.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/uint_mutations.hpp"

void mutate_uint64_t(uint64_t& value, std::mt19937_64& rng, const Uint64MutationConfig& config)
{
    mutate_uint(value, rng, config);
}
