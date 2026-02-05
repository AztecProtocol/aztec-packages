#pragma once

#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include <random>
#include <vector>

namespace bb::avm2::fuzzer {

void mutate_bytecode(std::vector<ContractClassWithCommitment>& contract_classes,
                     std::vector<ContractInstance>& contract_instances,
                     const std::vector<AztecAddress>& contract_addresses,
                     std::vector<bb::crypto::merkle_tree::PublicDataLeafValue>& public_data_writes,
                     std::mt19937_64& rng);

void mutate_contract_classes(std::vector<ContractClassWithCommitment>& contract_classes,
                             std::vector<ContractInstance>& contract_instances,
                             std::vector<AztecAddress>& contract_addresses,
                             std::mt19937_64& rng);

void mutate_contract_instances(std::vector<ContractInstance>& contract_instances,
                               std::vector<AztecAddress>& contract_addresses,
                               std::mt19937_64& rng);

} // namespace bb::avm2::fuzzer
