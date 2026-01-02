#include "barretenberg/avm_fuzzer/mutations/tx_data.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"
#include "barretenberg/avm_fuzzer/mutations/fuzzer_data.hpp"
#include "barretenberg/avm_fuzzer/mutations/instructions/instruction_block.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

#include <random>

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
    auto choice = std::uniform_int_distribution<uint8_t>(0, 1)(rng);

    switch (choice) {
    case 0:
        // Mutate setup enqueued calls
        fuzz_info("Mutating setup enqueued calls: ", tx.setup_enqueued_calls.size());
        mutate_vec<PublicCallRequestWithCalldata>(
            tx.setup_enqueued_calls,
            rng,
            [&](PublicCallRequestWithCalldata& call, std::mt19937_64& rng) {
                mutate_public_call_request(call, contract_addresses, rng);
            },
            [&](std::mt19937_64& rng) { return generate_public_call_request(contract_addresses, rng); },
            BASIC_VEC_MUTATION_CONFIGURATION);
        break;
    case 1:
        // Mutate app logic enqueued calls
        fuzz_info("Mutating app logic enqueued calls: ", tx.app_logic_enqueued_calls.size());
        mutate_vec<PublicCallRequestWithCalldata>(
            tx.app_logic_enqueued_calls,
            rng,
            [&](PublicCallRequestWithCalldata& call, std::mt19937_64& rng) {
                mutate_public_call_request(call, contract_addresses, rng);
            },
            [&](std::mt19937_64& rng) { return generate_public_call_request(contract_addresses, rng); },
            BASIC_VEC_MUTATION_CONFIGURATION);
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
        // case 5:
        //     // Mutate non-revertible accumulated data
        //     // fixme: maybe don't change all stuff
        //     mutate_ff_vec(tx.non_revertible_accumulated_data.note_hashes, rng, MAX_NOTE_HASHES_PER_TX);
        //     mutate_ff_vec(tx.non_revertible_accumulated_data.nullifiers, rng, MAX_NULLIFIERS_PER_TX);
        //     mutate_vec<ScopedL2ToL1Message>(tx.non_revertible_accumulated_data.l2_to_l1_messages,
        //                                     rng,
        //                                     mutate_l2_to_l1_msg,
        //                                     generate_l2_to_l1_msg,
        //                                     BASIC_VEC_MUTATION_CONFIGURATION);
        //     if (tx.non_revertible_accumulated_data.nullifiers.empty()) {
        //         // Need to ensure the "tx nullifier" exists
        //         tx.non_revertible_accumulated_data.nullifiers.push_back(generate_random_field(rng));
        //     }
        //     break;
        // case 6:
        //     // Mutate revertible accumulated data
        //     mutate_ff_vec(tx.revertible_accumulated_data.note_hashes, rng, MAX_NOTE_HASHES_PER_TX);
        //     mutate_ff_vec(tx.revertible_accumulated_data.nullifiers, rng, MAX_NULLIFIERS_PER_TX);
        //     mutate_vec<ScopedL2ToL1Message>(tx.revertible_accumulated_data.l2_to_l1_messages,
        //                                     rng,
        //                                     mutate_l2_to_l1_msg,
        //                                     generate_l2_to_l1_msg,
        //                                     BASIC_VEC_MUTATION_CONFIGURATION);
        //     break;
        // break;
        // case 7:
        //     // Mutate teardown enqueued call
        //
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

void mutate_ff_vec(std::vector<FF>& vec, std::mt19937_64& rng, size_t max_size)
{
    mutate_vec<FF>(
        vec,
        rng,
        [](bb::avm2::FF& value, std::mt19937_64& rng) { mutate_field(value, rng, BASIC_FIELD_MUTATION_CONFIGURATION); },
        generate_random_field,
        BASIC_VEC_MUTATION_CONFIGURATION);

    if (vec.size() > max_size) {
        vec.resize(max_size);
    }
}

void mutate_l2_to_l1_msg(ScopedL2ToL1Message& msg, std::mt19937_64& rng)
{
    auto choice = std::uniform_int_distribution<uint8_t>(0, 2)(rng);

    switch (choice) {
    case 0:
        // Mutate recipient
        msg.message.recipient = generate_random_field(rng);
        break;
    case 1:
        // Mutate content
        msg.message.content = generate_random_field(rng);
        break;
    case 2:
        // Mutate contract_address
        msg.contract_address = generate_random_field(rng);
        break;
    }
}

ScopedL2ToL1Message generate_l2_to_l1_msg(std::mt19937_64& rng)
{
    return ScopedL2ToL1Message{
        .message = L2ToL1Message{ .recipient = generate_random_field(rng), .content = generate_random_field(rng) },
        .contract_address = generate_random_field(rng),
    };
}

void mutate_bool_vec(std::vector<bool>& vec, size_t target_size, std::mt19937_64& rng)
{
    // Resize to match target size
    while (vec.size() < target_size) {
        vec.push_back(std::uniform_int_distribution<uint8_t>(0, 1)(rng) == 1);
    }
    while (vec.size() > target_size) {
        vec.pop_back();
    }

    // Flip a random bool with some probability
    if (!vec.empty()) {
        auto flip_prob = std::uniform_int_distribution<uint8_t>(0, 4)(rng);
        if (flip_prob == 0) {
            auto idx = std::uniform_int_distribution<size_t>(0, vec.size() - 1)(rng);
            vec[idx] = !vec[idx];
        }
    }
}

void mutate_fuzzer_data_vec(std::vector<FuzzerData>& enqueued_calls, std::mt19937_64& rng, size_t max_size)
{
    auto choice = std::uniform_int_distribution<uint8_t>(0, 1)(rng);
    switch (choice) {
    case 0: {
        fuzz_info("Adding a new enqueued call");
        // Add a new enqueued call
        if (enqueued_calls.size() < max_size) {
            FuzzerData new_enqueued_call = generate_fuzzer_data(rng);
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
            mutate_fuzzer_data(enqueued_calls[idx], rng);
            add_default_instruction_block_if_empty(enqueued_calls[idx], rng);
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

void mutate_public_call_request([[maybe_unused]] PublicCallRequestWithCalldata& request,
                                [[maybe_unused]] std::vector<AztecAddress>& contract_addresses,
                                [[maybe_unused]] std::mt19937_64& rng)
{
    if (contract_addresses.empty()) {
        return; // Nothing to mutate to
    }
    // fixme(ilyas): this should be weighted since stuff like mutate calldata hash is fail-early
    auto choice = std::uniform_int_distribution<uint8_t>(0, 0)(rng);
    //
    switch (choice) {
    case 0:
        // Mutate contract_address
        // This is likely to cause immediate failure, needs to be weighted appropriately
        auto contract_address_choice = std::uniform_int_distribution<size_t>(0, contract_addresses.size() - 1)(rng);
        auto contract_address = contract_addresses[contract_address_choice];
        request.request.contract_address = contract_address;
        break;
        //     case 1:
        //         // Mutate msg_sender
        //         request.request.msg_sender = generate_random_field(rng);
        //         break;
        //     case 2: {
        //         // Mutate is_static_call
        //         request.request.is_static_call = !request.request.is_static_call;
        //         break;
        //     }
        //     case 3:
        //         // Mutate calldata_hash - the intention here is to fail the hash check
        //         request.request.calldata_hash = generate_random_field(rng);
        //         break;
        //     case 4:
        //         // Mutate calldata
        //         mutate_ff_vec(request.calldata, rng, 256);
        //         // fixme: recompute calldata_hash when we start doing tracegen versions
        //         // request.calldata_hash = compute_calldata_hash(request.calldata);
        //         break;
    }
}

PublicCallRequestWithCalldata generate_public_call_request(std::vector<AztecAddress>& contract_addresses,
                                                           std::mt19937_64& rng)
{
    fuzz_info("Generating new public call request");
    // Generate random calldata
    size_t calldata_size = std::uniform_int_distribution<size_t>(0, 256)(rng);
    std::vector<FF> calldata{};
    for (size_t i = 0; i < calldata_size; ++i) {
        calldata.push_back(generate_random_field(rng));
    }

    auto contract_address =
        contract_addresses.empty()
            ? generate_random_field(rng)
            : contract_addresses[std::uniform_int_distribution<size_t>(0, contract_addresses.size() - 1)(rng)];
    fuzz_info("Using contract address: ", contract_address);
    FF calldata_hash = simulation::compute_calldata_hash(calldata);
    return PublicCallRequestWithCalldata{
        .request =
            PublicCallRequest{
                .msg_sender = generate_random_field(rng),
                .contract_address = contract_address,
                .is_static_call = (std::uniform_int_distribution<uint8_t>(0, 1)(rng) == 1),
                .calldata_hash = calldata_hash,
            },
        .calldata = calldata,
    };
}

} // namespace bb::avm2::fuzzer
