#include "barretenberg/avm_fuzzer/mutations/tx_data.hpp"

#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"
#include "barretenberg/avm_fuzzer/mutations/fuzzer_data.hpp"
#include "barretenberg/avm_fuzzer/mutations/instructions/instruction_block.hpp"
#include "barretenberg/avm_fuzzer/mutations/tx_types/accumulated_data.hpp"
#include "barretenberg/avm_fuzzer/mutations/tx_types/gas.hpp"
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
    case TxMutationOptions::GasSettings:
        // Mutate gas_settings
        fuzz_info("Mutating gas settings");
        mutate_gas_settings(tx.gas_settings, rng);
        // Ensure effective_gas_fees <= max_fees_per_gas after mutation
        tx.effective_gas_fees.fee_per_da_gas =
            std::min(tx.effective_gas_fees.fee_per_da_gas, tx.gas_settings.max_fees_per_gas.fee_per_da_gas);
        tx.effective_gas_fees.fee_per_l2_gas =
            std::min(tx.effective_gas_fees.fee_per_l2_gas, tx.gas_settings.max_fees_per_gas.fee_per_l2_gas);
        break;
    case TxMutationOptions::GasFees:
        // Mutate effective_gas_fees
        fuzz_info("Mutating effective gas fees");
        mutate_gas_fees(tx.effective_gas_fees, rng);
        // Ensure effective_gas_fees <= max_fees_per_gas after mutation
        tx.effective_gas_fees.fee_per_da_gas =
            std::min(tx.effective_gas_fees.fee_per_da_gas, tx.gas_settings.max_fees_per_gas.fee_per_da_gas);
        tx.effective_gas_fees.fee_per_l2_gas =
            std::min(tx.effective_gas_fees.fee_per_l2_gas, tx.gas_settings.max_fees_per_gas.fee_per_l2_gas);
        break;
    case TxMutationOptions::GasUsedByPrivate:
        // Mutate gas_used_by_private
        fuzz_info("Mutating gas used by private");
        mutate_gas(tx.gas_used_by_private, rng, tx.gas_settings.gas_limits);
        break;
    case TxMutationOptions::FeePayer:
        // Mutate fee_payer
        fuzz_info("Mutating fee payer");
        mutate_field(tx.fee_payer, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    }
}

void mutate_fuzzer_data_vec(const FuzzerContext& context,
                            std::vector<FuzzerData>& enqueued_calls,
                            std::mt19937_64& rng,
                            size_t max_size)
{
    auto choice = ENQUEUED_CALL_MUTATION_CONFIGURATION.select(rng);

    switch (choice) {
    case EnqueuedCallMutation::Add:
        fuzz_info("Adding a new enqueued call");
        // Add a new enqueued call
        if (enqueued_calls.size() < max_size) {
            enqueued_calls.push_back(generate_fuzzer_data(rng, context));
        }
        break;

    case EnqueuedCallMutation::Mutate: {
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
    case EnqueuedCallMutation::Remove:
        // Remove an existing enqueued call
        fuzz_info("Removing an existing enqueued call");
        if (!enqueued_calls.empty()) {
            size_t idx = std::uniform_int_distribution<size_t>(0, enqueued_calls.size() - 1)(rng);
            enqueued_calls.erase(enqueued_calls.begin() + static_cast<std::ptrdiff_t>(idx));
        }
        break;
    }
}

} // namespace bb::avm2::fuzzer
