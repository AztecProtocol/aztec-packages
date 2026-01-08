#pragma once

#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/common/weighted_selection.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

enum class TxMutationOptions {
    SetupEnqueuedCalls,
    AppLogicEnqueuedCalls,
    TearDownEnqueuedCall,
};

using TxMutationConfig = WeightedSelectionConfig<TxMutationOptions, 3>;

constexpr TxMutationConfig TX_MUTATION_CONFIGURATION = TxMutationConfig({
    { TxMutationOptions::SetupEnqueuedCalls, 30 },
    { TxMutationOptions::AppLogicEnqueuedCalls, 30 },
    { TxMutationOptions::TearDownEnqueuedCall, 10 },
});

namespace bb::avm2::fuzzer {

void mutate_tx(Tx& tx, std::vector<AztecAddress>& contract_addresses, std::mt19937_64& rng);

// GasSettings mutation
void mutate_gas_settings(GasSettings& gas_settings, std::mt19937_64& rng);

// Gas mutation
void mutate_gas(Gas& gas, std::mt19937_64& rng);

// GasFees mutation
void mutate_gas_fees(GasFees& fees, std::mt19937_64& rng);

// L2ToL1Msg vector mutation
void mutate_l2_to_l1_msg(ScopedL2ToL1Message& vec, std::mt19937_64& rng);
ScopedL2ToL1Message generate_l2_to_l1_msg(std::mt19937_64& rng);

void mutate_fuzzer_data_vec(std::vector<FuzzerData>& enqueued_calls, std::mt19937_64& rng, size_t max_size = 10);

} // namespace bb::avm2::fuzzer
