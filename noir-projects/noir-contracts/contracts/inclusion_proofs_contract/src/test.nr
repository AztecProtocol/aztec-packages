use crate::InclusionProofs;
use dep::aztec::{
    oracle::execution::get_contract_address,
    prelude::AztecAddress,
    test::helpers::{cheatcodes, test_environment::TestEnvironment},
};

global INITIAL_VALUE: Field = 69;

pub unconstrained fn setup(
    initial_value: Field,
) -> (&mut TestEnvironment, AztecAddress, AztecAddress) {
    // Setup env, generate keys
    let mut env = TestEnvironment::new();
    let owner = env.create_account(1);
    env.impersonate(owner);

    // We advance one block here, because we want to deploy our contract in block 3.
    // This is because we will do tests later that prove the non inclusion of values and of the contract itself at block 2.
    env.advance_block_by(1);

    // Deploy contract and initialize
    let initializer = InclusionProofs::interface().constructor(initial_value);
    let inclusion_proofs_contract =
        env.deploy_self("InclusionProofs").with_public_void_initializer(initializer);
    let contract_address = inclusion_proofs_contract.to_address();
    env.advance_block_by(1);
    (&mut env, contract_address, owner)
}

#[test]
unconstrained fn note_flow() {
    // This test creates a note and checks certain properties about it, namely its inclusion in the trees,
    // the non-inclusion of its nullifier, and its validity (the combination of the previous two)
    let (env, contract_address, owner) = setup(INITIAL_VALUE);
    env.impersonate(owner);

    let NOTE_VALUE = 69;
    InclusionProofs::at(contract_address).create_note(owner, NOTE_VALUE).call(&mut env.private());

    env.advance_block_by(1);

    let note_creation_block_number = env.block_number();

    // We advance by another block to make sure that the note creation block number != our current block number
    env.advance_block_by(1);

    let current_contract_address = get_contract_address();
    cheatcodes::set_contract_address(contract_address);

    // We fetch the note we created and make sure that it is valid.
    let note = InclusionProofs::get_note(owner);
    cheatcodes::set_contract_address(current_contract_address);

    assert(note.owner.eq(owner));
    assert(note.value.eq(NOTE_VALUE));

    // Each of these tests (note inclusion, note non-nullification, and validity (inclusion & non-nullification)) check the assertion at the block of creation of note, as well as at the "current" block
    InclusionProofs::at(contract_address)
        .test_note_inclusion(owner, true, note_creation_block_number, false)
        .call(&mut env.private());
    InclusionProofs::at(contract_address).test_note_inclusion(owner, false, 0, false).call(
        &mut env.private(),
    );

    InclusionProofs::at(contract_address)
        .test_note_not_nullified(owner, true, note_creation_block_number, false)
        .call(&mut env.private());
    InclusionProofs::at(contract_address).test_note_not_nullified(owner, false, 0, false).call(
        &mut env.private(),
    );

    InclusionProofs::at(contract_address)
        .test_note_validity(owner, true, note_creation_block_number, false)
        .call(&mut env.private());
    InclusionProofs::at(contract_address).test_note_validity(owner, false, 0, false).call(
        &mut env.private(),
    );
}

#[test]
unconstrained fn nullify_note_flow() {
    // This test creates a note, nullifies it, and checks certain properties about it, namely its inclusion in the trees,
    // the non-inclusion of its nullifier, and its validity (the combination of the previous two). These properties are checked before nullification.
    let (env, contract_address, owner) = setup(INITIAL_VALUE);
    env.impersonate(owner);

    InclusionProofs::at(contract_address).create_note(owner, 5).call(&mut env.private());

    env.advance_block_by(1);

    let note_valid_block_number = env.block_number();

    InclusionProofs::at(contract_address).nullify_note(owner).call(&mut env.private());

    env.advance_block_by(1);

    // We test note inclusion at the note creation block and at current block
    InclusionProofs::at(contract_address)
        .test_note_inclusion(owner, true, note_valid_block_number, true)
        .call(&mut env.private());

    InclusionProofs::at(contract_address).test_note_inclusion(owner, false, 0, true).call(
        &mut env.private(),
    );

    // We test note non-nullification and validity at the note creation block
    InclusionProofs::at(contract_address)
        .test_note_not_nullified(owner, true, note_valid_block_number, true)
        .call(&mut env.private());
    InclusionProofs::at(contract_address)
        .test_note_validity(owner, true, note_valid_block_number, true)
        .call(&mut env.private());
}

#[test(should_fail_with = "Assertion failed: Proving nullifier non-inclusion failed: low_nullifier.value < nullifier.value check failed")]
unconstrained fn note_not_nullified_after_nullified() {
    let (env, contract_address, owner) = setup(INITIAL_VALUE);
    env.impersonate(owner);

    InclusionProofs::at(contract_address).create_note(owner, 5).call(&mut env.private());

    env.advance_block_by(1);

    InclusionProofs::at(contract_address).nullify_note(owner).call(&mut env.private());

    env.advance_block_by(1);

    InclusionProofs::at(contract_address)
        .test_note_not_nullified(owner, true, env.block_number(), true)
        .call(&mut env.private());
}

#[test(should_fail_with = "Assertion failed: Proving nullifier non-inclusion failed: low_nullifier.value < nullifier.value check failed")]
unconstrained fn note_not_nullified_after_nullified_no_block_number() {
    let (env, contract_address, owner) = setup(INITIAL_VALUE);
    env.impersonate(owner);

    InclusionProofs::at(contract_address).create_note(owner, 5).call(&mut env.private());

    env.advance_block_by(1);

    InclusionProofs::at(contract_address).nullify_note(owner).call(&mut env.private());

    env.advance_block_by(1);

    InclusionProofs::at(contract_address).test_note_not_nullified(owner, false, 0, true).call(
        &mut env.private(),
    );
}

#[test(should_fail_with = "Assertion failed: Proving nullifier non-inclusion failed: low_nullifier.value < nullifier.value check failed")]
unconstrained fn validity_after_nullified() {
    let (env, contract_address, owner) = setup(INITIAL_VALUE);
    env.impersonate(owner);

    InclusionProofs::at(contract_address).create_note(owner, 5).call(&mut env.private());

    env.advance_block_by(1);

    InclusionProofs::at(contract_address).nullify_note(owner).call(&mut env.private());

    env.advance_block_by(1);

    InclusionProofs::at(contract_address)
        .test_note_validity(owner, true, env.block_number(), true)
        .call(&mut env.private());
}

#[test(should_fail_with = "Assertion failed: Proving nullifier non-inclusion failed: low_nullifier.value < nullifier.value check failed")]
unconstrained fn validity_after_nullified_no_block_number() {
    let (env, contract_address, owner) = setup(INITIAL_VALUE);
    env.impersonate(owner);

    InclusionProofs::at(contract_address).create_note(owner, 5).call(&mut env.private());

    env.advance_block_by(1);

    InclusionProofs::at(contract_address).nullify_note(owner).call(&mut env.private());

    env.advance_block_by(1);

    InclusionProofs::at(contract_address).test_note_validity(owner, false, 0, true).call(
        &mut env.private(),
    );
}

#[test(should_fail_with = "not found in NOTE_HASH_TREE")]
unconstrained fn note_inclusion_fail_case() {
    let (env, contract_address, owner) = setup(INITIAL_VALUE);
    env.impersonate(owner);

    let random_owner = AztecAddress::from_field(dep::aztec::oracle::random::random());

    let block_number = env.block_number();

    env.advance_block_by(1);

    InclusionProofs::at(contract_address)
        .test_note_inclusion_fail_case(random_owner, true, block_number)
        .call(&mut env.private());
}

#[test(should_fail_with = "not found in NOTE_HASH_TREE")]
unconstrained fn note_inclusion_fail_case_no_block_number() {
    let (env, contract_address, owner) = setup(INITIAL_VALUE);
    env.impersonate(owner);

    let random_owner = AztecAddress::from_field(dep::aztec::oracle::random::random());

    env.advance_block_by(1);

    InclusionProofs::at(contract_address)
        .test_note_inclusion_fail_case(random_owner, false, 0)
        .call(&mut env.private());
}

#[test]
unconstrained fn nullifier_inclusion() {
    let (env, contract_address, owner) = setup(INITIAL_VALUE);
    env.impersonate(owner);

    // The first nullifier emitted
    let nullifier = 6969 + 1;

    InclusionProofs::at(contract_address)
        .test_nullifier_inclusion(nullifier, true, env.block_number() - 1)
        .call(&mut env.private());

    InclusionProofs::at(contract_address).test_nullifier_inclusion(nullifier, false, 0).call(
        &mut env.private(),
    );
}

#[test]
unconstrained fn nullifier_inclusion_public() {
    let (env, contract_address, owner) = setup(INITIAL_VALUE);
    env.impersonate(owner);

    let unsiloed_nullifier = 0xffffff;
    InclusionProofs::at(contract_address).push_nullifier_public(unsiloed_nullifier).call(
        &mut env.public(),
    );

    env.advance_block_by(1);
    InclusionProofs::at(contract_address)
        .test_nullifier_inclusion_from_public(unsiloed_nullifier)
        .call(&mut env.public());
}

#[test(should_fail_with = "Nullifier witness not found for nullifier")]
unconstrained fn nullifier_non_existence() {
    let (env, contract_address, owner) = setup(INITIAL_VALUE);
    env.impersonate(owner);

    let block_number = env.block_number() - 1;

    let random_nullifier = dep::aztec::oracle::random::random();

    InclusionProofs::at(contract_address)
        .test_nullifier_inclusion(random_nullifier, true, block_number)
        .call(&mut env.private());
}

#[test(should_fail_with = "Nullifier witness not found for nullifier")]
unconstrained fn nullifier_non_existence_no_block_number() {
    let (env, contract_address, owner) = setup(INITIAL_VALUE);
    env.impersonate(owner);

    let random_nullifier = dep::aztec::oracle::random::random();

    InclusionProofs::at(contract_address).test_nullifier_inclusion(random_nullifier, false, 0).call(
        &mut env.private(),
    );
}

#[test]
unconstrained fn historical_reads() {
    let (env, contract_address, owner) = setup(INITIAL_VALUE);
    env.impersonate(owner);

    let block_number = env.block_number();

    InclusionProofs::at(contract_address)
        .test_storage_historical_read(INITIAL_VALUE, true, block_number)
        .call(&mut env.private());
    InclusionProofs::at(contract_address)
        .test_storage_historical_read(INITIAL_VALUE, false, 0)
        .call(&mut env.private());

    // We are using block number 2 because we know the public value has not been set at this point.
    InclusionProofs::at(contract_address).test_storage_historical_read(0, true, 2).call(
        &mut env.private(),
    );

    InclusionProofs::at(contract_address)
        .test_storage_historical_read_unset_slot(block_number)
        .call(&mut env.private());
}

#[test]
unconstrained fn contract_flow() {
    // This test deploys a contract and tests for its inclusion of deployment and initialization nullifier. It also checks non-inclusion before its deployment.
    let (env, contract_address, owner) = setup(INITIAL_VALUE);
    env.impersonate(owner);

    let block_number: u32 = env.block_number();

    InclusionProofs::at(contract_address)
        .test_contract_inclusion(contract_address, block_number, true, true)
        .call(&mut env.private());

    // We are using block number 2 because we know the contract has not been deployed nor initialized at this point.
    InclusionProofs::at(contract_address)
        .test_contract_non_inclusion(contract_address, 2, true, true)
        .call(&mut env.private());
}

#[test(should_fail_with = "Nullifier witness not found for nullifier")]
unconstrained fn contract_not_initialized() {
    let (env, contract_address, owner) = setup(INITIAL_VALUE);
    env.impersonate(owner);

    // We are using block number 2 because we know the contract has not been deployed nor initialized at this point.
    // We split the deployment check and the initialization check (true, false), because each one checks for the inclusion of the deployment / initialization nullifier specifically;
    // We can't set `true, true` to check for both in one test because the first failing condition won't let us check the other in isolation.
    // The above statements apply to the rest of the contract inclusion tests.
    InclusionProofs::at(contract_address)
        .test_contract_inclusion(contract_address, 2, true, false)
        .call(&mut env.private());
}

#[test(should_fail_with = "Nullifier witness not found for nullifier")]
unconstrained fn contract_not_deployed() {
    let (env, contract_address, owner) = setup(INITIAL_VALUE);
    env.impersonate(owner);

    // This checks for the inclusion of the initializer nullifier specifically.
    InclusionProofs::at(contract_address)
        .test_contract_inclusion(contract_address, 2, false, true)
        .call(&mut env.private());
}

#[test(should_fail_with = "Assertion failed: Proving nullifier non-inclusion failed")]
unconstrained fn contract_deployed_non_inclusion() {
    let (env, contract_address, owner) = setup(INITIAL_VALUE);
    env.impersonate(owner);

    let block_number: u32 = env.block_number();

    InclusionProofs::at(contract_address)
        .test_contract_non_inclusion(contract_address, block_number, true, false)
        .call(&mut env.private());
}

#[test(should_fail_with = "Assertion failed: Proving nullifier non-inclusion failed")]
unconstrained fn contract_initialized_non_inclusion() {
    let (env, contract_address, owner) = setup(INITIAL_VALUE);
    env.impersonate(owner);

    let block_number: u32 = env.block_number();

    InclusionProofs::at(contract_address)
        .test_contract_non_inclusion(contract_address, block_number, false, true)
        .call(&mut env.private());
}
