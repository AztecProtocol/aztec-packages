use aztec::macros::aztec;

/// Used to test deployment of a contract with no constructor in deploy_method.test.ts and in
/// private_initialization.test.ts
#[aztec]
pub contract NoConstructor {
    use aztec::{
        encrypted_logs::log_assembly_strategies::default_aes128::note::encode_and_encrypt_note,
        macros::{functions::{private, public, utility}, storage::storage},
        prelude::PrivateMutable,
    };

    use value_note::value_note::ValueNote;

    #[storage]
    struct Storage<Context> {
        private_mutable: PrivateMutable<ValueNote, Context>,
    }

    #[public]
    fn emit_public(value: Field) {
        context.emit_public_log(/*message=*/ value);
    }

    #[private]
    fn initialize_private_mutable(value: Field) {
        let note = ValueNote::new(value, context.msg_sender());

        // create and broadcast note
        storage.private_mutable.initialize(note).emit(encode_and_encrypt_note(
            &mut context,
            context.msg_sender(),
            context.msg_sender(),
        ));
    }

    #[utility]
    unconstrained fn is_private_mutable_initialized() -> bool {
        storage.private_mutable.is_initialized()
    }

}
