#include "vm2_contracts/bulk_fixture.hpp"

#include "barretenberg/aztec/aztec_constants.hpp"
#include "vm2_contracts/app_test_helpers.hpp"
#include "vm2_contracts/contract_artifact.hpp"
#include "vm2_contracts/noir_abi.hpp"
#include "vm2_contracts/protocol_contracts.hpp"

namespace bb::avm2::contracts {

namespace {

using testing::DeployedContract;
using testing::TestEnqueuedCall;

} // namespace

TxSimulationResult bulk_test(AppTester& tester, const ExpectFn& expect)
{
    const ContractArtifact avm = ContractArtifact::load_noir_contract("avm_test_contract-AvmTest.json");
    const ContractArtifact fee_juice = ContractArtifact::load_noir_contract("fee_juice_contract-FeeJuice.json");
    const ContractArtifact auth_registry =
        ContractArtifact::load_noir_contract("auth_registry_contract-AuthRegistry.json");
    const ContractArtifact class_registry =
        ContractArtifact::load_noir_contract("contract_class_registry_contract-ContractClassRegistry.json");
    const ContractArtifact instance_registry =
        ContractArtifact::load_noir_contract("contract_instance_registry_contract-ContractInstanceRegistry.json");

    const DeployedContract avm_contract = tester.deploy(avm);

    register_protocol_contract(tester.inner(), CONTRACT_CLASS_REGISTRY_CONTRACT_ADDRESS, class_registry);
    register_protocol_contract(tester.inner(), CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS, instance_registry);
    register_protocol_contract(tester.inner(), FEE_JUICE_ADDRESS, fee_juice);
    register_standard_auth_registry(tester.inner(), auth_registry);

    const std::vector<FF> args_field = consecutive_fields(10);
    const std::vector<AbiValue> bulk_args = {
        AbiValue::fields(args_field),              // args_field: [Field; 10]
        AbiValue::fields(args_field),              // args_u8: [u8; 10]
        avm_contract.address,                      // get_instance_for_address
        avm_contract.instance.deployer,            // expected_deployer
        avm_contract.contract_class.id,            // expected_class_id
        avm_contract.instance.initialization_hash, // expected_initialization_hash
        avm_contract.instance.immutables_hash,     // expected_immutables_hash
        AbiValue::fields(schnorr_inputs()),        // schnorr_inputs: [Field; 7]
        AbiValue::boolean(false),                  // skip_strictly_limited_side_effects
    };

    const std::vector<FF> large_calldata = consecutive_fields(300);
    const std::vector<FF> small_calldata = consecutive_fields(3);

    const std::vector<TestEnqueuedCall> calls = {
        make_call(avm_contract.address, avm, "bulk_testing", bulk_args),
        make_call(avm_contract.address,
                  avm,
                  "assert_calldata_copy_large",
                  { AbiValue::fields(large_calldata), AbiValue::boolean(true) }),
        make_call(avm_contract.address,
                  avm,
                  "assert_calldata_copy",
                  { AbiValue::fields(small_calldata), AbiValue::boolean(true) }),
        make_call(avm_contract.address,
                  avm,
                  "assert_calldata_copy_large",
                  { AbiValue::fields(large_calldata), AbiValue::boolean(true) }),
        make_call(avm_contract.address, avm, "call_fee_juice"),
        make_call(avm_contract.address, avm, "call_auth_registry"),
        make_call(avm_contract.address, avm, "call_instance_registry"),
    };

    const TxSimulationResult result = tester.execute_tx_with_label("AvmTest/bulk_testing",
                                                                   testing::PublicTxSimulationTester::default_sender(),
                                                                   calls,
                                                                   /*commit=*/false);
    expect(is_ok(result));
    return result;
}

TxSimulationResult mega_bulk_test(AppTester& tester, const ExpectFn& expect)
{
    const ContractArtifact avm = ContractArtifact::load_noir_contract("avm_test_contract-AvmTest.json");
    const ContractArtifact fee_juice = ContractArtifact::load_noir_contract("fee_juice_contract-FeeJuice.json");

    const DeployedContract avm_contract = tester.deploy(avm);
    register_protocol_contract(tester.inner(), FEE_JUICE_ADDRESS, fee_juice);

    const std::vector<FF> schnorr = schnorr_inputs();
    const auto gen_args = [&](uint64_t first) {
        std::vector<FF> args_field = consecutive_fields(10);
        args_field[0] = FF(first);
        return std::vector<AbiValue>{
            AbiValue::fields(args_field),
            AbiValue::fields(consecutive_fields(10)),
            avm_contract.address,
            avm_contract.instance.deployer,
            avm_contract.contract_class.id,
            avm_contract.instance.initialization_hash,
            avm_contract.instance.immutables_hash,
            AbiValue::fields(schnorr),
            AbiValue::boolean(true), // skip strictly-limited side effects so bulk_testing can repeat
        };
    };

    const std::vector<TestEnqueuedCall> calls = {
        make_call(avm_contract.address, avm, "bulk_testing", gen_args(1)),
        make_call(avm_contract.address, avm, "bulk_testing", gen_args(3)),
        make_call(avm_contract.address, avm, "bulk_testing", gen_args(5)),
        make_call(avm_contract.address, avm, "bulk_testing", gen_args(7)),
        make_call(avm_contract.address, avm, "bulk_testing", gen_args(9)),
    };

    const TxSimulationResult result = tester.execute_tx_with_label(
        "AvmTest/mega_bulk_testing", testing::PublicTxSimulationTester::default_sender(), calls, /*commit=*/false);
    expect(is_ok(result));
    return result;
}

} // namespace bb::avm2::contracts
