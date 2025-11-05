#pragma once

#include <random>

#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/vm2/common/field.hpp"

bb::avm2::FF generate_random_field(std::mt19937_64& rng);
void mutate_field(bb::avm2::FF& value, std::mt19937_64& rng, const FieldMutationConfig& config);
