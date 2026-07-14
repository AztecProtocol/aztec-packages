#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/testing/public_tx_simulation_tester.hpp"
#include "vm2_contracts/contract_artifact.hpp"
#include "vm2_contracts/noir_abi.hpp"

namespace bb::avm2::contracts {

// Pseudo-deploys a contract from its artifact, mirroring the TS `registerAndDeployContract(seed)`:
// the public_dispatch bytecode is used as the packed bytecode, and the class id is derived with
// artifact_hash = seed+1 / private_functions_root = seed+3 (matching `makeContractClassPublic`),
// salt = seed (matching `makeContractInstanceFromClassId`). Distinct seeds therefore yield distinct
// class ids (and addresses) from the same artifact.
testing::DeployedContract deploy_artifact(testing::PublicTxSimulationTester& tester,
                                          const ContractArtifact& artifact,
                                          uint64_t seed = 0);

// Like deploy_artifact, but for a contract with a constructor (initializer): the deployed instance's
// initialization_hash is derived from the constructor selector + encoded args (and `deployer` is
// recorded) so a subsequent `constructor` call passes its initialization check. The caller is
// expected to then invoke "constructor" with the same args.
testing::DeployedContract deploy_artifact_with_constructor(testing::PublicTxSimulationTester& tester,
                                                           const ContractArtifact& artifact,
                                                           const std::vector<AbiValue>& constructor_args,
                                                           const AztecAddress& deployer,
                                                           uint64_t seed = 0);

// Builds an enqueued call to `function_name` on `address`, ABI-encoding `args` into calldata
// (prefixed with the function selector) using the given artifact's ABI. `msg_sender` overrides the
// tx-level sender for this call (needed for internal functions that require msg_sender == address).
testing::TestEnqueuedCall make_call(const AztecAddress& address,
                                    const ContractArtifact& artifact,
                                    const std::string& function_name,
                                    const std::vector<AbiValue>& args = {},
                                    std::optional<AztecAddress> msg_sender = std::nullopt);

} // namespace bb::avm2::contracts
