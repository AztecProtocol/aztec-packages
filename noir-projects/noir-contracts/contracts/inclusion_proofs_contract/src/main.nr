// A demonstration of inclusion and non-inclusion proofs.
use dep::aztec::macros::aztec;

// mod test;

#[aztec]
pub contract InclusionProofs {
    use dep::aztec::encrypted_logs::log_assembly_strategies::default_aes128::note::encode_and_encrypt_note;
    use dep::aztec::{
        oracle::execution::get_contract_address,
        test::helpers::{cheatcodes, test_environment::TestEnvironment},
    };
    use dep::aztec::prelude::{AztecAddress, Map, NoteGetterOptions, PrivateSet, PublicMutable};

    use dep::aztec::{
        macros::{functions::{initializer, private, public}, storage::storage},
        note::{note_getter_options::NoteStatus, note_viewer_options::NoteViewerOptions},
    };
    // docs:start:value_note_imports
    use dep::value_note::value_note::ValueNote;
    // docs:end:value_note_imports

    #[test]
    unconstrained fn hello() {
        let mut env = TestEnvironment::new();
        let owner = env.create_account();
        env.impersonate(owner);

        // Advance a block so we know that at block 1 our contract has not been deployed yet.
        env.advance_block_by(1);

        let inclusion_proofs_contract = env.deploy_self("InclusionProofs").without_initializer();
        let contract_address = inclusion_proofs_contract.to_address();
    }
}
