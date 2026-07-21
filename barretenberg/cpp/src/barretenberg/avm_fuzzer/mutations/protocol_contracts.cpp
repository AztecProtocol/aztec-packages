#include "barretenberg/avm_fuzzer/mutations/protocol_contracts.hpp"

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::fuzzer {

namespace {

void update_enqueued_calls_for_protocol_contract(Tx& tx,
                                                 const AztecAddress& prev_address,
                                                 const AztecAddress& new_address)
{
    // Update setup_enqueued_calls
    for (auto& call : tx.setup_enqueued_calls) {
        if (call.request.contract_address == prev_address) {
            call.request.contract_address = new_address;
        }
    }
    // Update app_logic_enqueued_calls
    for (auto& call : tx.app_logic_enqueued_calls) {
        if (call.request.contract_address == prev_address) {
            call.request.contract_address = new_address;
        }
    }
    // Update teardown_enqueued_call
    if (tx.teardown_enqueued_call.has_value() && tx.teardown_enqueued_call->request.contract_address == prev_address) {
        tx.teardown_enqueued_call->request.contract_address = new_address;
    }
}

} // namespace

void mutate_protocol_contracts(ProtocolContracts& protocol_contracts,
                               Tx& tx,
                               const std::vector<AztecAddress>& contract_addresses,
                               std::mt19937_64& rng)
{
    if (contract_addresses.empty()) {
        return;
    }

    auto choice = PROTOCOL_CONTRACTS_MUTATION_CONFIGURATION.select(rng);
    switch (choice) {
    case ProtocolContractsMutationOptions::Mutate: {
        // Pick a random index and add a protocol contract
        auto protocol_contract_index = std::uniform_int_distribution<size_t>(0, MAX_PROTOCOL_CONTRACTS - 1)(rng);
        auto contract_address_index = std::uniform_int_distribution<size_t>(0, contract_addresses.size() - 1)(rng);

        AztecAddress derived_address = contract_addresses[contract_address_index];
        protocol_contracts.derived_addresses[protocol_contract_index] = derived_address;

        // The index of the protocol contracts array maps to canonical address.
        // Add 1 because canonical addresses are 1-indexed
        AztecAddress canonical_address(static_cast<uint256_t>(protocol_contract_index + 1));

        // todo(ilyas): there should be a more efficient way to do this
        // Update any enqueued calls that reference the derived address to now use the canonical address
        update_enqueued_calls_for_protocol_contract(
            tx, /*prev_address=*/derived_address, /*new_address=*/canonical_address);
        break;
    }
    case ProtocolContractsMutationOptions::Remove: {
        // Pick an index, and zero it out, removing the protocol contract. It may already be zero but the fuzzer should
        // figure out better mutations
        size_t idx = std::uniform_int_distribution<size_t>(0, MAX_PROTOCOL_CONTRACTS - 1)(rng);
        AztecAddress canonical_address(static_cast<uint256_t>(idx + 1));
        AztecAddress derived_address = protocol_contracts.derived_addresses[idx];
        // Update any enqueued calls that reference the canonical address to use the derived address
        update_enqueued_calls_for_protocol_contract(
            tx, /*prev_address=*/canonical_address, /*new_address=*/derived_address);
        // Set the derived address to zero
        protocol_contracts.derived_addresses[idx] = AztecAddress(0);
        break;
    }
    }
}

} // namespace bb::avm2::fuzzer
