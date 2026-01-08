#include "barretenberg/avm_fuzzer/mutations/tx_types/public_call_request.hpp"

#include "barretenberg/avm_fuzzer/fuzz_lib/constants.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/field.hpp"
#include "barretenberg/avm_fuzzer/mutations/basic_types/vector.hpp"
#include "barretenberg/avm_fuzzer/mutations/calldata/calldata_vec.hpp"
#include "barretenberg/avm_fuzzer/mutations/configuration.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

using bb::avm2::AztecAddress;
using bb::avm2::FF;

namespace {

void mutate_contract_address(AztecAddress& address, std::vector<AztecAddress>& contract_addresses, std::mt19937_64& rng)
{
    if (contract_addresses.empty()) {
        address = generate_random_field(rng);
    }
    // Most of the time we want to pick from the existing contract addresses, since a random address will fail early
    auto contract_address_choice = std::uniform_int_distribution<size_t>(0, contract_addresses.size() - 1)(rng);
    address = contract_addresses[contract_address_choice];

    // 1 in 1000 chance for the contract address to be random
    bool random_address = std::uniform_int_distribution<int>(0, 999)(rng) == 0;
    if (random_address) {
        fuzz_info("Mutating contract address to a random address");
        mutate_field(address, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
    }
}

void mutate_calldata(PublicCallRequestWithCalldata& request, std::mt19937_64& rng)
{
    mutate_calldata_vec(request.calldata, rng);
    if (request.calldata.size() > fuzzer::MAX_CALLDATA_SIZE) {
        request.calldata.resize(fuzzer::MAX_CALLDATA_SIZE);
    }

    request.request.calldata_hash = simulation::compute_calldata_hash(request.calldata);
}

} // namespace

namespace bb::avm2::fuzzer {

void mutate_public_call_request(PublicCallRequestWithCalldata& request,
                                std::vector<AztecAddress>& contract_addresses,
                                std::mt19937_64& rng)
{
    fuzz_info("Mutating public call request");
    auto choice = PUB_REQUEST_MUTATION_CONFIGURATION.select(rng);

    switch (choice) {
    case PublicCallRequestMutationOptions::ContractAddress:
        // Mutate contract_address
        mutate_contract_address(request.request.contract_address, contract_addresses, rng);
        break;
    case PublicCallRequestMutationOptions::MsgSender:
        // Mutate msg_sender
        mutate_field(request.request.msg_sender, rng, BASIC_FIELD_MUTATION_CONFIGURATION);
        break;
    case PublicCallRequestMutationOptions::IsStaticCall:
        // Mutate is_static_call
        request.request.is_static_call = !request.request.is_static_call;
        break;
    case PublicCallRequestMutationOptions::Calldata:
        // Mutate calldata, this also updates the calldata_hash
        mutate_calldata(request, rng);
        break;
    }
}

PublicCallRequestWithCalldata generate_public_call_request(std::vector<AztecAddress>& contract_addresses,
                                                           std::mt19937_64& rng)
{
    fuzz_info("Generating new public call request");
    // Generate random calldata
    size_t calldata_size = std::uniform_int_distribution<size_t>(0, MAX_CALLDATA_SIZE)(rng);
    std::vector<FF> calldata;
    calldata.reserve(calldata_size);
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
