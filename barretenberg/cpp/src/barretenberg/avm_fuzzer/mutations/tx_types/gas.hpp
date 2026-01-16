#pragma once

#include <cstdint>
#include <random>

#include "barretenberg/avm_fuzzer/common/weighted_selection.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"

namespace bb::avm2::fuzzer {

// Fee bounds for mutation.
// MIN_FEE must be >= 1 to prevent underflow in compute_effective_gas_fees, since
// global_variables.gas_fees is hardcoded to {1, 1}. This can change once we enable
// smart mutations of global variables that maintain the invariant max_fees_per_gas >= gas_fees.
constexpr uint128_t MIN_FEE = 1;
constexpr uint128_t MAX_FEE = 1000;
//
// Gas bounds for mutation
constexpr uint32_t MIN_GAS = 0;
constexpr uint32_t AVM_MAX_PROCESSABLE_DA_GAS = (MAX_NOTE_HASHES_PER_TX * AVM_EMITNOTEHASH_BASE_DA_GAS) +
                                                (MAX_NULLIFIERS_PER_TX * AVM_EMITNULLIFIER_BASE_DA_GAS) +
                                                (MAX_L2_TO_L1_MSGS_PER_TX * AVM_SENDL2TOL1MSG_BASE_DA_GAS) +
                                                (MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * AVM_SSTORE_DYN_DA_GAS) +
                                                (PUBLIC_LOGS_LENGTH * AVM_EMITUNENCRYPTEDLOG_BASE_DA_GAS);

enum class GasSettingsMutationOptions : uint8_t {
    GasLimits,
    TeardownGasLimits,
    MaxFeesPerGas,
    MaxPriorityFeesPerGas,
};

using GasSettingsMutationConfig = WeightedSelectionConfig<GasSettingsMutationOptions, 4>;

constexpr GasSettingsMutationConfig GAS_SETTINGS_MUTATION_CONFIGURATION = GasSettingsMutationConfig({
    { GasSettingsMutationOptions::GasLimits, 20 },
    { GasSettingsMutationOptions::TeardownGasLimits, 10 },
    { GasSettingsMutationOptions::MaxFeesPerGas, 20 },
    { GasSettingsMutationOptions::MaxPriorityFeesPerGas, 5 },
});

Gas generate_gas(std::mt19937_64& rng);
void mutate_gas(Gas& gas,
                std::mt19937_64& rng,
                const Gas& max = Gas{ AVM_MAX_PROCESSABLE_L2_GAS, AVM_MAX_PROCESSABLE_DA_GAS });

GasSettings generate_gas_settings(std::mt19937_64& rng);
void mutate_gas_settings(GasSettings& data, std::mt19937_64& rng);

GasFees generate_gas_fees(std::mt19937_64& rng);
void mutate_gas_fees(GasFees& gas_fees, std::mt19937_64& rng);

// Compute effective gas fees matching TS computeEffectiveGasFees.
// Requires: maxFeesPerGas >= gasFees (otherwise underflow)
GasFees compute_effective_gas_fees(const GasFees& gas_fees, const GasSettings& gas_settings);

} // namespace bb::avm2::fuzzer
