#pragma once

#include "barretenberg/avm_fuzzer/common/weighted_selection.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

#include <random>

namespace bb::avm2::fuzzer {

enum class ProtocolContractsMutationOptions : uint8_t {
    Mutate,
    Remove,
};

using ProtocolContractsMutationConfig = WeightedSelectionConfig<ProtocolContractsMutationOptions, 2>;

constexpr ProtocolContractsMutationConfig PROTOCOL_CONTRACTS_MUTATION_CONFIGURATION = ProtocolContractsMutationConfig({
    { ProtocolContractsMutationOptions::Mutate, 3 },
    { ProtocolContractsMutationOptions::Remove, 1 },
});

void mutate_protocol_contracts(bb::avm2::ProtocolContracts& protocol_contracts,
                               bb::avm2::Tx& tx,
                               const std::vector<AztecAddress>& contract_addresses,
                               std::mt19937_64& rng);

} // namespace bb::avm2::fuzzer
