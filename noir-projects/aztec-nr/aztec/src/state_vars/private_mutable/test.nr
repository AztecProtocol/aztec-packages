use crate::{
    context::PrivateContext, oracle::execution::get_contract_address,
    state_vars::private_mutable::PrivateMutable,
};
use crate::test::{helpers::test_environment::TestEnvironment, mocks::mock_note::MockNote};
use std::test::OracleMock;

global storage_slot: Field = 17;

unconstrained fn setup() -> TestEnvironment {
    let mut env = TestEnvironment::new();
    // Advance 1 block so we can read historic state from private
    env.advance_block_by(1);
    env
}

unconstrained fn in_private(
    env: &mut TestEnvironment,
) -> PrivateMutable<MockNote, &mut PrivateContext> {
    let state_var = PrivateMutable::new(&mut env.private(), storage_slot);

    // This oracle is called for its side effects alone - it's always expected to return 0.
    let _ = OracleMock::mock("notifyCreatedNote").returns(0);

    state_var
}

#[test]
unconstrained fn test_initialize_or_replace_without_nullifier() {
    let mut env = setup();
    let state_var = in_private(&mut env);

    let value = 42;
    let mut note = MockNote::new(value)
        .contract_address(get_contract_address())
        .storage_slot(storage_slot)
        .build();

    let _ = OracleMock::mock("checkNullifierExists").returns(0);
    state_var.initialize_or_replace(&mut note).discard();

    // Since we reported there was no nullifier, we should initialize and see the following side-effects:
    // - a new note being created
    // - no notes being read
    // - the initialization nullifier being emitted
    assert_eq(state_var.context.note_hashes.len(), 1);
    assert_eq(state_var.context.note_hash_read_requests.len(), 0);
    assert_eq(state_var.context.nullifiers.len(), 1);

    // Note that if the oracle was wrong and the initialization nullifier did exist, this attempt to write it again
    // would cause the sequencer to revert this transaction - we are therefore safe from bad oracles.
    let nullifier = state_var.context.nullifiers.get(0);
    assert_eq(nullifier.value, state_var.compute_initialization_nullifier());
    assert_eq(nullifier.note_hash, 0);
}

#[test]
unconstrained fn test_initialize_or_replace_with_nullifier() {
    // Here we'd want to test a scenario like the one above with the oracle indicating that the initialization
    // nullifier does exist. Unfortunately that requires us to produce a valid oracle return value for getNotes,
    // which is fairly involved as it deals with serialization of notes, and is relatively complicated to replicate
    // in Noir.
}
