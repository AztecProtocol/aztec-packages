use crate::Test;
use dep::aztec::{
    history::contract_inclusion::{
        ProveContractDeployment, ProveContractInitialization, ProveContractNonDeployment,
        ProveContractNonInitialization,
    },
    protocol_types::address::AztecAddress,
    test::helpers::test_environment::TestEnvironment,
};

// These tests need to be here instead of a saner place like aztec-nr/aztec/src/history/contract_inclusion/test.nr
// because we are unable to define nor deploy a contract from that location and currently do not have plans to change
// that.

global CONTRACT_DEPLOYED_AT: u32 = 2;

// The TXE deploy oracle mines a block with the instance publication nullifier, so initialization happens on the
// following block.
global CONTRACT_INITIALIZED_AT: u32 = CONTRACT_DEPLOYED_AT + 1;

pub unconstrained fn setup() -> (&mut TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let owner = env.create_account(1);

    // We sanity check that the deployment block will be the next one
    assert_eq(env.next_block_number(), CONTRACT_DEPLOYED_AT);

    // Deploy contract and initialize
    let initializer = Test::interface().initialize();
    let test_contract = env.deploy_self("Test").with_private_initializer(owner, initializer);
    let contract_address = test_contract.to_address();

    // We sanity check that the initialization block was the last one
    assert_eq(env.last_block_number(), CONTRACT_INITIALIZED_AT);

    (&mut env, contract_address, owner)
}

#[test]
unconstrained fn contract_historical_proofs_happy_path() {
    let (env, contract_address, _owner) = setup();

    let context_at_block_before_deployment = env.private_at(CONTRACT_DEPLOYED_AT - 1);
    let context_at_block_of_deployment = env.private_at(CONTRACT_DEPLOYED_AT);

    let context_at_block_before_initialization = env.private_at(CONTRACT_INITIALIZED_AT - 1);
    let context_at_block_of_initialization = env.private_at(CONTRACT_INITIALIZED_AT);

    // We prove that the contract had not been deployed nor initialized at the block before deployment
    context_at_block_before_deployment.historical_header.prove_contract_non_deployment(
        contract_address,
    );
    context_at_block_before_initialization.historical_header.prove_contract_non_initialization(
        contract_address,
    );

    // And we prove that the contract has been been deployed and initialized at the block after deployment
    context_at_block_of_deployment.historical_header.prove_contract_deployment(contract_address);
    context_at_block_of_initialization.historical_header.prove_contract_initialization(
        contract_address,
    );
}

#[test(should_fail_with = "Nullifier membership witness not found at block 1.")]
unconstrained fn prove_contract_deployment_before_deployment_fais() {
    let (env, contract_address, _owner) = setup();

    // Note that we're only testing that the function fails, but not that it would correct reject bad hints from an oracle
    let context = env.private_at(CONTRACT_DEPLOYED_AT - 1);
    context.historical_header.prove_contract_deployment(contract_address);
}

#[test(should_fail_with = "Nullifier membership witness not found at block 2.")]
unconstrained fn prove_contract_initialization_before_initialization_fails() {
    let (env, contract_address, _owner) = setup();

    // Note that we're only testing that the function fails, but not that it would correct reject bad hints from an oracle
    let context = env.private_at(CONTRACT_INITIALIZED_AT - 1);
    context.historical_header.prove_contract_initialization(contract_address);
}

#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn prove_contract_non_deployment_of_deployed_fails() {
    let (env, contract_address, _owner) = setup();

    // Note that we're only testing that the function fails, but not that it would correct reject bad hints from an oracle
    let context = env.private_at(CONTRACT_DEPLOYED_AT);
    context.historical_header.prove_contract_non_deployment(contract_address);
}

#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn prove_contract_non_initialization_of_initialized_fails() {
    let (env, contract_address, _owner) = setup();

    // Note that we're only testing that the function fails, but not that it would correct reject bad hints from an oracle
    let context = env.private_at(CONTRACT_INITIALIZED_AT);
    context.historical_header.prove_contract_non_initialization(contract_address);
}
