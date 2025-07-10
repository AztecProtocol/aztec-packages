use aztec::macros::aztec;

/// Used to test publication of a contract instance with no constructor in deploy_method.test.ts and in
/// private_initialization.test.ts
#[aztec]
pub contract NoConstructor {
    use aztec::{
        macros::{functions::{private, public, utility}, storage::storage},
        messages::logs::note::encode_and_encrypt_note,
        state_vars::PrivateMutable,
    };

    use value_note::value_note::ValueNote;

    #[storage]
    struct Storage<Context> {
        private_mutable: PrivateMutable<ValueNote, Context>,
    }

    /// Arbitrary public method used to test that publishing for public execution works for a contract with no constructor.
    #[public]
    fn emit_public(value: Field) {
        context.emit_public_log(/*message=*/ value);
    }

    /// Arbitrary function used to test that we can call private functions on a contract with
    /// no constructor/initializer.
    #[private]
    fn initialize_private_mutable(value: Field) {
        let note = ValueNote::new(value, context.msg_sender());

        storage.private_mutable.initialize(note).emit(encode_and_encrypt_note(
            &mut context,
            context.msg_sender(),
            context.msg_sender(),
        ));
    }

    /// Helper function used to test that call to `initialize_private_mutable` was successful or not yet performed.
    #[utility]
    unconstrained fn is_private_mutable_initialized() -> bool {
        storage.private_mutable.is_initialized()
    }

}
