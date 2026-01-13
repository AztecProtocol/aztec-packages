#include "barretenberg/avm_fuzzer/mutations/tx_data.hpp"

#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"
#include "barretenberg/avm_fuzzer/mutations/fuzzer_data.hpp"
#include "barretenberg/avm_fuzzer/mutations/instructions/instruction_block.hpp"
#include "barretenberg/avm_fuzzer/mutations/tx_types/accumulated_data.hpp"
#include "barretenberg/avm_fuzzer/mutations/tx_types/public_call_request.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

#include <optional>
#include <random>

namespace {

void mutate_enqueued_calls(std::vector<PublicCallRequestWithCalldata>& enqueued_calls,
                           std::vector<AztecAddress>& contract_addresses,
                           std::mt19937_64& rng)
{
    auto mutate_fn = [&](PublicCallRequestWithCalldata& call, std::mt19937_64& rng) {
        bb::avm2::fuzzer::mutate_public_call_request(call, contract_addresses, rng);
    };

    auto gen_fn = [&](std::mt19937_64& rng) {
        return bb::avm2::fuzzer::generate_public_call_request(contract_addresses, rng);
    };

    mutate_vec<PublicCallRequestWithCalldata>(enqueued_calls, rng, mutate_fn, gen_fn, BASIC_VEC_MUTATION_CONFIGURATION);
};

void mutate_teardown(std::optional<PublicCallRequestWithCalldata>& teardown_call,
                     std::vector<AztecAddress>& contract_addresses,
                     std::mt19937_64& rng)
{
    if (!teardown_call.has_value()) {
        // Nothing to mutate, generate a new one
        teardown_call = bb::avm2::fuzzer::generate_public_call_request(contract_addresses, rng);
        return;
    }

    // If we already have a teardown call, there's a 1 in 10 chance we discard it
    bool discard = std::uniform_int_distribution<int>(0, 9)(rng) == 0;
    if (discard) {
        fuzz_info("Discarding teardown enqueued call");
        teardown_call = std::nullopt;
    } else {
        // Mutate existing teardown call
        bb::avm2::fuzzer::mutate_public_call_request(teardown_call.value(), contract_addresses, rng);
    }
}

} // namespace

namespace bb::avm2::fuzzer {

// Gas bounds for mutation
constexpr uint32_t MIN_GAS = 1000;
constexpr uint32_t MAX_GAS = 10000000;

// Fee bounds for mutation
constexpr uint128_t MIN_FEE = 1;
constexpr uint128_t MAX_FEE = 1000;

constexpr uint32_t AVM_MAX_PROCESSABLE_DA_GAS = (MAX_NOTE_HASHES_PER_TX * AVM_EMITNOTEHASH_BASE_DA_GAS) +
                                                (MAX_NULLIFIERS_PER_TX * AVM_EMITNULLIFIER_BASE_DA_GAS) +
                                                (MAX_L2_TO_L1_MSGS_PER_TX * AVM_SENDL2TOL1MSG_BASE_DA_GAS) +
                                                (MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX * AVM_SSTORE_DYN_DA_GAS) +
                                                (PUBLIC_LOGS_LENGTH * AVM_EMITUNENCRYPTEDLOG_BASE_DA_GAS);

void mutate_tx(Tx& tx, std::vector<AztecAddress>& contract_addresses, std::mt19937_64& rng)
{
    auto choice = TX_MUTATION_CONFIGURATION.select(rng);

    switch (choice) {
    case TxMutationOptions::SetupEnqueuedCalls:
        // Mutate setup enqueued calls
        fuzz_info("Mutating setup enqueued calls: ", tx.setup_enqueued_calls.size());
        mutate_enqueued_calls(tx.setup_enqueued_calls, contract_addresses, rng);
        break;
    case TxMutationOptions::AppLogicEnqueuedCalls:
        // Mutate app logic enqueued calls
        fuzz_info("Mutating app logic enqueued calls: ", tx.app_logic_enqueued_calls.size());
        mutate_enqueued_calls(tx.app_logic_enqueued_calls, contract_addresses, rng);
        break;
    case TxMutationOptions::TearDownEnqueuedCall:
        // Mutate teardown enqueued call
        fuzz_info("Mutating teardown enqueued call");
        mutate_teardown(tx.teardown_enqueued_call, contract_addresses, rng);
        break;
    case TxMutationOptions::NonRevertibleData:
        // Mutate non-revertible accumulated data
        fuzz_info("Mutating non-revertible accumulated data");
        mutate_non_revertible_accumulated_data(tx.non_revertible_accumulated_data, rng);
        break;
    case TxMutationOptions::RevertibleData:
        // Mutate revertible accumulated data
        fuzz_info("Mutating revertible accumulated data");
        mutate_revertible_accumulated_data(tx.revertible_accumulated_data, rng);
        break;

        // case 2:
        //     // Mutate gas_settings
        //     mutate_gas_settings(tx.gas_settings, rng);
        //     break;
        // case 3:
        //     // Mutate effective_gas_fees
        //     mutate_gas_fees(tx.effective_gas_fees, rng);
        //     break;
        // case 4:
        //     // Mutate Deployment data
        //     break;
        // case 8:
        //     // Mutate gas_used_by_private
        //     break;
        // case 9:
        //     // Mutate fee_payer
        //     break;
        //}
    }
}

void mutate_gas_settings(GasSettings& gas_settings, std::mt19937_64& rng)
{
    auto choice = std::uniform_int_distribution<uint8_t>(0, 3)(rng);

    switch (choice) {
    case 0:
        // Pick a Gas Limit between [0, AVM_MAX_PROCESSABLE_L2_GAS]
        // fixme: probably should not mutate both l2_gas and da_gas to max in one go
        gas_settings.gas_limits.l2_gas = std::uniform_int_distribution<uint32_t>(0, AVM_MAX_PROCESSABLE_L2_GAS)(rng);
        gas_settings.gas_limits.da_gas = std::uniform_int_distribution<uint32_t>(0, AVM_MAX_PROCESSABLE_DA_GAS)(rng);
        break;
    case 1:
        // Mutate teardown_gas_limits
        gas_settings.teardown_gas_limits.l2_gas =
            std::uniform_int_distribution<uint32_t>(0, AVM_MAX_PROCESSABLE_L2_GAS)(rng);
        gas_settings.teardown_gas_limits.da_gas =
            std::uniform_int_distribution<uint32_t>(0, AVM_MAX_PROCESSABLE_DA_GAS)(rng);
        break;
    case 2:
        // Mutate max_fees_per_gas
        // mutate_gas_fees(gas_settings.max_fees_per_gas, rng);
        break;
    case 3:
        // Mutate max_priority_fees_per_gas
        // mutate_gas_fees(gas_settings.max_priority_fees_per_gas, rng);
        break;
    }
}

void mutate_gas(Gas& gas, std::mt19937_64& rng)
{
    auto choice = std::uniform_int_distribution<uint8_t>(0, 2)(rng);

    switch (choice) {
    case 0:
        // Mutate l2_gas
        gas.l2_gas = std::uniform_int_distribution<uint32_t>(MIN_GAS, MAX_GAS)(rng);
        break;
    case 1:
        // Mutate da_gas
        gas.da_gas = std::uniform_int_distribution<uint32_t>(MIN_GAS, MAX_GAS)(rng);
        break;
    case 2:
        // Set both to same value
        gas.l2_gas = gas.da_gas = std::uniform_int_distribution<uint32_t>(MIN_GAS, MAX_GAS)(rng);
        break;
    }
}

void mutate_gas_fees(GasFees& fees, std::mt19937_64& rng)
{
    auto choice = std::uniform_int_distribution<uint8_t>(0, 3)(rng);

    switch (choice) {
    case 0:
        // Mutate fee_per_da_gas
        fees.fee_per_da_gas = std::uniform_int_distribution<uint64_t>(MIN_FEE, MAX_FEE)(rng);
        break;
    case 1:
        // Mutate fee_per_l2_gas
        fees.fee_per_l2_gas = std::uniform_int_distribution<uint64_t>(MIN_FEE, MAX_FEE)(rng);
        break;
    case 2:
        // Set both to zero
        fees.fee_per_da_gas = 0;
        fees.fee_per_l2_gas = 0;
        break;
    case 3:
        // Set both to same non-zero value
        fees.fee_per_da_gas = fees.fee_per_l2_gas = std::uniform_int_distribution<uint64_t>(1, MAX_FEE)(rng);
        break;
    }
}

void mutate_fuzzer_data_vec(const FuzzerContext& context,
                            std::vector<FuzzerData>& enqueued_calls,
                            std::mt19937_64& rng,
                            size_t max_size)
{
    auto choice = std::uniform_int_distribution<uint8_t>(0, 1)(rng);
    switch (choice) {
    case 0: {
        fuzz_info("Adding a new enqueued call");
        // Add a new enqueued call
        if (enqueued_calls.size() < max_size) {
            FuzzerData new_enqueued_call = generate_fuzzer_data(rng, context);
            enqueued_calls.push_back(new_enqueued_call);
        }
        break;
    }
    case 1: {
        // Mutate an existing enqueued call
        fuzz_info("Mutating an existing enqueued call");
        if (!enqueued_calls.empty()) {
            size_t idx = std::uniform_int_distribution<size_t>(0, enqueued_calls.size() - 1)(rng);
            fuzz_info("Mutating enqueued call at index: ", idx);
            mutate_fuzzer_data(enqueued_calls[idx], rng, context);
            add_default_instruction_block_if_empty(enqueued_calls[idx], rng, context);
        }
        break;
    }
        // case 2: {
        //     // Remove an existing enqueued call
        //     vinfo("Removing an existing enqueued call");
        //     if (!enqueued_calls.empty()) {
        //         size_t idx = std::uniform_int_distribution<size_t>(0, enqueued_calls.size() - 1)(rng);
        //         enqueued_calls.erase(enqueued_calls.begin() + static_cast<std::ptrdiff_t>(idx));
        //     }
        //     break;
        // }
    }
}

} // namespace bb::avm2::fuzzer
