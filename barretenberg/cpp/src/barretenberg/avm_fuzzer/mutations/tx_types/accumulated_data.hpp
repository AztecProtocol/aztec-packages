#pragma once

#include <random>

#include "barretenberg/avm_fuzzer/common/weighted_selection.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"

namespace bb::avm2::fuzzer {

enum class AccumulatedDataMutationOptions : uint8_t {
    NoteHashes,
    NoteHashesLimit,
    Nullifiers,
    NullifiersLimit,
    L2ToL1Messages,
    L2ToL1MessagesLimit,
};

using AccumulatedDataMutationConfig = WeightedSelectionConfig<AccumulatedDataMutationOptions, 6>;

constexpr AccumulatedDataMutationConfig ACCUMULATED_DATA_MUTATION_CONFIGURATION = AccumulatedDataMutationConfig({
    { AccumulatedDataMutationOptions::NoteHashes, 10 },
    { AccumulatedDataMutationOptions::NoteHashesLimit, 1 },
    { AccumulatedDataMutationOptions::Nullifiers, 10 },
    { AccumulatedDataMutationOptions::NullifiersLimit, 1 },
    { AccumulatedDataMutationOptions::L2ToL1Messages, 10 },
    { AccumulatedDataMutationOptions::L2ToL1MessagesLimit, 1 },
});

template <typename T>
void mutate_vec_with_limit(std::vector<T>& vec,
                           std::mt19937_64& rng,
                           const std::function<void(T&, std::mt19937_64&)>& mutate_element_function,
                           const std::function<T(std::mt19937_64&)>& generate_random_element_function,
                           const VecMutationConfig& config,
                           size_t vec_limit)
{
    mutate_vec<T>(vec, rng, mutate_element_function, generate_random_element_function, config);
    if (vec.size() > vec_limit) {
        vec.resize(vec_limit);
    }
}

AccumulatedData generate_non_revertible_accumulated_data(std::mt19937_64& rng);
void mutate_non_revertible_accumulated_data(AccumulatedData& data, std::mt19937_64& rng);

AccumulatedData generate_revertible_accumulated_data(std::mt19937_64& rng);
void mutate_revertible_accumulated_data(AccumulatedData& data, std::mt19937_64& rng);

} // namespace bb::avm2::fuzzer
