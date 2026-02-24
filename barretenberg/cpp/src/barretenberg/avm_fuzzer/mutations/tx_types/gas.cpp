#include "barretenberg/avm_fuzzer/mutations/tx_types/gas.hpp"

#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"

using bb::avm2::AztecAddress;
using bb::avm2::FF;

namespace {

constexpr uint128_t MAX_U128 = ~static_cast<uint128_t>(0);

uint128_t generate_u128(std::mt19937_64& rng, uint128_t min = 0, uint128_t max = MAX_U128)
{
    uint64_t high = std::uniform_int_distribution<uint64_t>()(rng);
    uint64_t low = std::uniform_int_distribution<uint64_t>()(rng);
    uint128_t value = (static_cast<uint128_t>(high) << 64) | static_cast<uint128_t>(low);
    // Scale to desired range
    return min + (value % (max - min + 1));
}

} // namespace

namespace bb::avm2::fuzzer {

Gas generate_gas(std::mt19937_64& rng, const Gas& min, const Gas& max)
{
    uint32_t l2_gas = std::uniform_int_distribution<uint32_t>(min.l2_gas, max.l2_gas)(rng);
    uint32_t da_gas = std::uniform_int_distribution<uint32_t>(min.da_gas, max.da_gas)(rng);

    return Gas{ l2_gas, da_gas };
}

void mutate_gas(Gas& gas, std::mt19937_64& rng, const Gas& min, const Gas& max)
{
    auto choice = std::uniform_int_distribution<uint8_t>(0, 1)(rng);

    switch (choice) {
    case 0:
        // Mutate l2_gas
        gas.l2_gas = std::uniform_int_distribution<uint32_t>(min.l2_gas, max.l2_gas)(rng);
        break;
    case 1:
        // Mutate da_gas
        gas.da_gas = std::uniform_int_distribution<uint32_t>(min.da_gas, max.da_gas)(rng);
        break;
    }
}

GasFees generate_gas_fees(std::mt19937_64& rng)
{
    uint128_t fee_per_da_gas = generate_u128(rng, MIN_FEE, MAX_FEE);
    uint128_t fee_per_l2_gas = generate_u128(rng, MIN_FEE, MAX_FEE);

    return GasFees{
        fee_per_da_gas,
        fee_per_l2_gas,
    };
}

void mutate_gas_fees(GasFees& fees, std::mt19937_64& rng)
{
    auto choice = std::uniform_int_distribution<uint8_t>(0, 1)(rng);

    switch (choice) {
    case 0:
        // Mutate fee_per_da_gas
        fees.fee_per_da_gas = generate_u128(rng, MIN_FEE, MAX_FEE);
        break;
    case 1:
        // Mutate fee_per_l2_gas
        fees.fee_per_l2_gas = generate_u128(rng, MIN_FEE, MAX_FEE);
        break;
    }
}

GasSettings generate_gas_settings(std::mt19937_64& rng)
{
    Gas gas_limits = generate_gas(rng);
    Gas teardown_gas_limits = generate_gas(rng);
    GasFees max_fees_per_gas = generate_gas_fees(rng);
    GasFees max_priority_fees_per_gas = generate_gas_fees(rng);

    return GasSettings{
        gas_limits,
        teardown_gas_limits,
        max_fees_per_gas,
        max_priority_fees_per_gas,
    };
}

void mutate_gas_settings(GasSettings& gas_settings, std::mt19937_64& rng)
{
    auto choice = GAS_SETTINGS_MUTATION_CONFIGURATION.select(rng);

    switch (choice) {
    case GasSettingsMutationOptions::GasLimits:
        // Mutate gas_limits
        mutate_gas(gas_settings.gas_limits, rng);
        break;
    case GasSettingsMutationOptions::TeardownGasLimits:
        // Mutate teardown_gas_limits
        mutate_gas(gas_settings.teardown_gas_limits, rng);
        break;
    case GasSettingsMutationOptions::MaxFeesPerGas:
        // Mutate max_fees_per_gas
        mutate_gas_fees(gas_settings.max_fees_per_gas, rng);
        break;
    case GasSettingsMutationOptions::MaxPriorityFeesPerGas:
        // Mutate max_priority_fees_per_gas
        mutate_gas_fees(gas_settings.max_priority_fees_per_gas, rng);
        break;
    }
}

GasFees compute_effective_gas_fees(const GasFees& gas_fees, const GasSettings& gas_settings)
{
    // Match TS computeEffectiveGasFees from yarn-project/stdlib/src/fees/transaction_fee.ts
    // priorityFees = min(maxPriorityFeesPerGas, maxFeesPerGas - gasFees)
    // effectiveFees = gasFees + priorityFees
    auto min_u128 = [](uint128_t a, uint128_t b) { return a < b ? a : b; };

    uint128_t priority_da = min_u128(gas_settings.max_priority_fees_per_gas.fee_per_da_gas,
                                     gas_settings.max_fees_per_gas.fee_per_da_gas - gas_fees.fee_per_da_gas);
    uint128_t priority_l2 = min_u128(gas_settings.max_priority_fees_per_gas.fee_per_l2_gas,
                                     gas_settings.max_fees_per_gas.fee_per_l2_gas - gas_fees.fee_per_l2_gas);

    return GasFees{
        .fee_per_da_gas = gas_fees.fee_per_da_gas + priority_da,
        .fee_per_l2_gas = gas_fees.fee_per_l2_gas + priority_l2,
    };
}

} // namespace bb::avm2::fuzzer
