// TODO (12225): the #[aztec] macro currently does not support being used in aztec-nr, hence we cannot do any variation of the below.
// Replace the hacky work around in noir-contracts/counter_contract which tests the contract inclusion.

// use crate::history::note_inclusion::ProveNoteInclusion;
// use crate::note::retrieved_note::RetrievedNote;
// use crate::oracle::execution::get_contract_address;
// use crate::oracle::random::random;
// use crate::test::{helpers::test_environment::TestEnvironment, mocks::mock_note::MockNote};

// use dep::protocol_types::address::AztecAddress;

// use crate::macros::aztec;

// #[aztec]
// pub contract Dummy {
//     use crate::macros::functions::{initializer, private};

//     #[initializer]
//     #[private]
//     fn constructor() {
//     }
// }

// unconstrained fn setup() -> AztecAddress {
//     let mut env = TestEnvironment::new();

//     let initializer = Dummy::interface().constructor();
// let dummy_contract = env.deploy_self("Dummy").with_private_initializer(initializer);

// env.advance_block_by(1);

// dummy_contract.to_address()

//     AztecAddress::from_field(1)
// }
