#pragma once

#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/common/weighted_selection.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_context.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

enum class TxMutationOptions {
    SetupEnqueuedCalls,
    AppLogicEnqueuedCalls,
    TearDownEnqueuedCall,
    NonRevertibleData,
    RevertibleData,
    GasSettings,
    GasFees,
    GasUsedByPrivate,
    FeePayer
};

using TxMutationConfig = WeightedSelectionConfig<TxMutationOptions, 9>;

constexpr TxMutationConfig TX_MUTATION_CONFIGURATION = TxMutationConfig({
    { TxMutationOptions::SetupEnqueuedCalls, 30 },
    { TxMutationOptions::AppLogicEnqueuedCalls, 30 },
    { TxMutationOptions::TearDownEnqueuedCall, 10 },
    { TxMutationOptions::NonRevertibleData, 15 },
    { TxMutationOptions::RevertibleData, 15 },
    { TxMutationOptions::GasSettings, 5 },
    { TxMutationOptions::GasFees, 3 },
    { TxMutationOptions::GasUsedByPrivate, 1 },
    { TxMutationOptions::FeePayer, 1 },
});

namespace bb::avm2::fuzzer {

void mutate_tx(Tx& tx, std::vector<AztecAddress>& contract_addresses, std::mt19937_64& rng);

void mutate_fuzzer_data_vec(const FuzzerContext& context,
                            std::vector<FuzzerData>& enqueued_calls,
                            std::mt19937_64& rng,
                            size_t max_size = 10);

} // namespace bb::avm2::fuzzer
