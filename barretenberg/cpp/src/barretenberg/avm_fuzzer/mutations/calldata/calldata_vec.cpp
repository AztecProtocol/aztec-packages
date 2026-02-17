#include "barretenberg/avm_fuzzer/mutations/calldata/calldata_vec.hpp"

#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/fuzz_lib/instruction.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"

void mutate_calldata_vec(std::vector<bb::avm2::FF>& calldata, std::mt19937_64& rng)
{
    mutate_vec<bb::avm2::FF>(
        calldata,
        rng,
        [](bb::avm2::FF& value, std::mt19937_64& rng) { mutate_field(value, rng, BASIC_FIELD_MUTATION_CONFIGURATION); },
        generate_random_field,
        BASIC_VEC_MUTATION_CONFIGURATION);
}
