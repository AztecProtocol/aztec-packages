use crate::Test;
use aztec::{
    history::deployment::{
        assert_contract_bytecode_was_not_published_by, assert_contract_bytecode_was_published_by,
        assert_contract_was_initialized_by, assert_contract_was_not_initialized_by,
    },
    protocol::address::AztecAddress,
    test::helpers::test_environment::{PrivateContextOptions, TestEnvironment},
};

// These tests need to be here instead of a saner place like aztec-nr/aztec/src/history/deployment/test.nr
// because we are unable to define nor deploy a contract from that location and currently do not have plans to change
// that.

global CONTRACT_DEPLOYED_AT: u32 = 2;

// The TXE deploy oracle mines a block with the instance publication nullifier, so initialization happens on the
// following block.
global CONTRACT_INITIALIZED_AT: u32 = CONTRACT_DEPLOYED_AT + 1;

pub unconstrained fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let owner = env.create_light_account();

    // We sanity check that the deployment block will be the next one
    assert_eq(env.next_block_number(), CONTRACT_DEPLOYED_AT);

    // Deploy contract and initialize
    let initializer = Test::interface().initialize();
    let contract_address = env.deploy("Test").with_private_initializer(owner, initializer);

    // We sanity check that the initialization block was the last one
    assert_eq(env.last_block_number(), CONTRACT_INITIALIZED_AT);

    (env, contract_address, owner)
}

#[test]
unconstrained fn contract_historical_proofs_happy_path() {
    let (env, contract_address, _owner) = setup();

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(CONTRACT_DEPLOYED_AT - 1),
        |context| {
            assert_contract_bytecode_was_not_published_by(
                context.anchor_block_header,
                contract_address,
            );
        },
    );

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(CONTRACT_DEPLOYED_AT),
        |context| {
            assert_contract_bytecode_was_published_by(
                context.anchor_block_header,
                contract_address,
            );
        },
    );

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(CONTRACT_INITIALIZED_AT - 1),
        |context| {
            assert_contract_was_not_initialized_by(context.anchor_block_header, contract_address);
        },
    );

    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(CONTRACT_INITIALIZED_AT),
        |context| {
            assert_contract_was_initialized_by(context.anchor_block_header, contract_address);
        },
    );
}

#[test(should_fail_with = "Nullifier membership witness not found at block")]
unconstrained fn assert_contract_bytecode_was_published_by_before_deployment_fails() {
    let (env, contract_address, _owner) = setup();

    // Note that we're only testing that the function fails, but not that it would correct reject bad hints from an oracle
    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(CONTRACT_DEPLOYED_AT - 1),
        |context| {
            assert_contract_bytecode_was_published_by(
                context.anchor_block_header,
                contract_address,
            );
        },
    );
}

#[test(should_fail_with = "Nullifier membership witness not found at block")]
unconstrained fn assert_contract_was_initialized_by_before_initialization_fails() {
    let (env, contract_address, _owner) = setup();

    // Note that we're only testing that the function fails, but not that it would correct reject bad hints from an oracle
    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(CONTRACT_INITIALIZED_AT - 1),
        |context| {
            assert_contract_was_initialized_by(context.anchor_block_header, contract_address);
        },
    );
}

#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn assert_contract_bytecode_was_not_published_by_of_deployed_fails() {
    let (env, contract_address, _owner) = setup();

    // Note that we're only testing that the function fails, but not that it would correct reject bad hints from an oracle
    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(CONTRACT_DEPLOYED_AT),
        |context| {
            assert_contract_bytecode_was_not_published_by(
                context.anchor_block_header,
                contract_address,
            );
        },
    );
}

#[test(should_fail_with = "Proving nullifier non-inclusion failed")]
unconstrained fn assert_contract_was_not_initialized_by_of_initialized_fails() {
    let (env, contract_address, _owner) = setup();

    // Note that we're only testing that the function fails, but not that it would correct reject bad hints from an oracle
    env.private_context_opts(
        PrivateContextOptions::new().at_anchor_block_number(CONTRACT_INITIALIZED_AT),
        |context| {
            assert_contract_was_not_initialized_by(context.anchor_block_header, contract_address);
        },
    );
}
