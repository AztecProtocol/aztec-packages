use dep::aztec::{
    note::{note_getter::{MAX_NOTES_PER_PAGE, view_notes}, note_viewer_options::NoteViewerOptions},
    prelude::AztecAddress,
    protocol_types::storage::map::derive_storage_slot_in_map,
    test::helpers::test_environment::TestEnvironment,
};

use crate::EasyPrivateVoting;

pub fn setup() -> (&mut TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();

    let admin = env.create_account();

    let initializer_call_interface = EasyPrivateVoting::interface().constructor(admin);
    let voting_contract = env.deploy_self("EasyPrivateVoting").with_public_void_initializer(
        initializer_call_interface,
    );
    // std::println(voting_contract);
    (&mut env, voting_contract.to_address(), admin)
}
