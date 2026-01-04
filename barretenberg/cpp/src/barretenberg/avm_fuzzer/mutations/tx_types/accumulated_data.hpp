#pragma once

#include <random>

#include "barretenberg/avm_fuzzer/common/weighted_selection.hpp"
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
    { AccumulatedDataMutationOptions::NoteHashes, 20 },
    { AccumulatedDataMutationOptions::NoteHashesLimit, 1 },
    { AccumulatedDataMutationOptions::Nullifiers, 20 },
    { AccumulatedDataMutationOptions::NullifiersLimit, 1 },
    { AccumulatedDataMutationOptions::L2ToL1Messages, 20 },
    { AccumulatedDataMutationOptions::L2ToL1MessagesLimit, 1 },
});

AccumulatedData generate_non_revertible_accumulated_data(std::mt19937_64& rng);
void mutate_non_revertible_accumulated_data(AccumulatedData& data, std::mt19937_64& rng);

AccumulatedData generate_revertible_accumulated_data(std::mt19937_64& rng);
void mutate_revertible_accumulated_data(AccumulatedData& data, std::mt19937_64& rng);

} // namespace bb::avm2::fuzzer
