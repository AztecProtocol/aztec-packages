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

    // Advance a block so we know that at block 2 our contract has not been deployed yet.
    env.advance_block_by(2);

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
    let (env, contract_address, owner) = setup(INITIAL_VALUE);

    env.impersonate(owner);

    let block_number = env.block_number();

    let NOTE_VALUE = 69;
    InclusionProofs::at(contract_address).create_note(owner, NOTE_VALUE).call(&mut env.private());

    env.advance_block_by(2);

    let current_contract_address = get_contract_address();
    cheatcodes::set_contract_address(contract_address);

    let note = InclusionProofs::get_note(owner);
    cheatcodes::set_contract_address(current_contract_address);

    assert(note.owner.eq(owner));
    assert(note.value.eq(NOTE_VALUE));

    InclusionProofs::at(contract_address)
        .test_note_inclusion(owner, true, block_number, false)
        .call(&mut env.private());
    InclusionProofs::at(contract_address).test_note_inclusion(owner, false, 0, false).call(
        &mut env.private(),
    );

    InclusionProofs::at(contract_address)
        .test_note_not_nullified(owner, true, block_number, false)
        .call(&mut env.private());
    InclusionProofs::at(contract_address).test_note_not_nullified(owner, false, 0, false).call(
        &mut env.private(),
    );

    InclusionProofs::at(contract_address).test_note_validity(owner, true, block_number, false).call(
        &mut env.private(),
    );
    InclusionProofs::at(contract_address).test_note_validity(owner, false, 0, false).call(
        &mut env.private(),
    );
}

#[test]
unconstrained fn nullify_note_flow() {
    let (env, contract_address, owner) = setup(INITIAL_VALUE);

    env.impersonate(owner);

    let note_valid_block_number = env.block_number();

    InclusionProofs::at(contract_address).create_note(owner, 5).call(&mut env.private());

    env.advance_block_by(1);

    InclusionProofs::at(contract_address).nullify_note(owner).call(&mut env.private());

    env.advance_block_by(1);

    InclusionProofs::at(contract_address)
        .test_note_inclusion(owner, true, note_valid_block_number, true)
        .call(&mut env.private());

    InclusionProofs::at(contract_address).test_note_inclusion(owner, false, 0, true).call(
        &mut env.private(),
    );

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

    // TODO: env.block_number() should actually return the private context inputs block number, not the block that is currently being built !
    // Change env.block_number to subtract one, then just use `env.block_number()`.
    InclusionProofs::at(contract_address)
        .test_note_not_nullified(owner, true, env.block_number() - 1, true)
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
        .test_note_validity(owner, true, env.block_number() - 1, true)
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

    let block_number = env.block_number() - 1;
    env.impersonate(owner);
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

    let block_number = env.block_number() - 1;

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
    let (env, contract_address, owner) = setup(INITIAL_VALUE);

    env.impersonate(owner);

    let block_number = env.block_number() - 1;

    InclusionProofs::at(contract_address)
        .test_contract_inclusion(contract_address, block_number, true, true)
        .call(&mut env.private());

    // We are using block number 2 because we know the contract has not been deployed nor initialized at this point.
    InclusionProofs::at(contract_address)
        .test_contract_non_inclusion(contract_address, 2, true, true)
        .call(&mut env.private());
}

#[test(should_fail_with = "Nullifier witness not found for nullifier")]
unconstrained fn test_contract_not_initialized() {
    let (env, contract_address, owner) = setup(INITIAL_VALUE);

    env.impersonate(owner);

    // We are using block number 2 because we know the contract has not been deployed nor initialized at this point.
    InclusionProofs::at(contract_address)
        .test_contract_inclusion(contract_address, 2, true, false)
        .call(&mut env.private());
}

#[test(should_fail_with = "Nullifier witness not found for nullifier")]
unconstrained fn test_contract_not_deployed() {
    let (env, contract_address, owner) = setup(INITIAL_VALUE);

    env.impersonate(owner);

    // We are using block number 2 because we know the contract has not been deployed nor initialized at this point.
    InclusionProofs::at(contract_address)
        .test_contract_inclusion(contract_address, 2, false, true)
        .call(&mut env.private());
}
