#pragma once

#include <random>
#include <vector>

#include "barretenberg/avm_fuzzer/common/weighted_selection.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::fuzzer {

constexpr uint16_t MAX_CALLDATA_SIZE = 256;

enum class PublicCallRequestMutationOptions : uint8_t {
    ContractAddress,
    MsgSender,
    IsStaticCall,
    Calldata,
};

using PublicCallRequestMutationConfig = WeightedSelectionConfig<PublicCallRequestMutationOptions, 4>;

constexpr PublicCallRequestMutationConfig PUB_REQUEST_MUTATION_CONFIGURATION = PublicCallRequestMutationConfig({
    { PublicCallRequestMutationOptions::ContractAddress, 3 },
    { PublicCallRequestMutationOptions::MsgSender, 1 },
    { PublicCallRequestMutationOptions::IsStaticCall, 3 },
    { PublicCallRequestMutationOptions::Calldata, 5 },
});

PublicCallRequestWithCalldata generate_public_call_request(std::vector<AztecAddress>& contract_addresses,
                                                           std::mt19937_64& rng);

void mutate_public_call_request(PublicCallRequestWithCalldata& request,
                                std::vector<AztecAddress>& contract_addresses,
                                std::mt19937_64& rng);
} // namespace bb::avm2::fuzzer
