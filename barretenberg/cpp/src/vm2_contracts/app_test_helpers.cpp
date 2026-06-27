#include "vm2_contracts/app_test_helpers.hpp"

namespace bb::avm2::contracts {

testing::DeployedContract deploy_artifact(testing::PublicTxSimulationTester& tester,
                                          const ContractArtifact& artifact,
                                          uint64_t seed)
{
    const std::vector<uint8_t> bytecode = artifact.public_dispatch_bytecode();
    return tester.deploy_contract(bytecode,
                                  /*salt=*/FF(seed),
                                  /*artifact_hash=*/FF(seed + 1),
                                  /*private_functions_root=*/FF(seed + 3));
}

testing::DeployedContract deploy_artifact_with_constructor(testing::PublicTxSimulationTester& tester,
                                                           const ContractArtifact& artifact,
                                                           const std::vector<AbiValue>& constructor_args,
                                                           const AztecAddress& deployer,
                                                           uint64_t seed)
{
    const FunctionArtifact& constructor = artifact.get_function("constructor");
    const FF selector = compute_function_selector(constructor.name, constructor.parameters);
    const std::vector<FF> encoded = encode_arguments(constructor.parameters, constructor_args);
    const FF initialization_hash = compute_initialization_hash(selector, encoded);

    const std::vector<uint8_t> bytecode = artifact.public_dispatch_bytecode();
    return tester.deploy_contract(bytecode,
                                  /*salt=*/FF(seed),
                                  /*artifact_hash=*/FF(seed + 1),
                                  /*private_functions_root=*/FF(seed + 3),
                                  initialization_hash,
                                  deployer);
}

testing::TestEnqueuedCall make_call(const AztecAddress& address,
                                    const ContractArtifact& artifact,
                                    const std::string& function_name,
                                    const std::vector<AbiValue>& args,
                                    std::optional<AztecAddress> msg_sender)
{
    return testing::TestEnqueuedCall{
        .contract_address = address,
        .calldata = artifact.make_calldata(function_name, args),
        .msg_sender = msg_sender,
    };
}

} // namespace bb::avm2::contracts
