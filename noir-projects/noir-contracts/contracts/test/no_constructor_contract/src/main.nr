use aztec::macros::aztec;

/// Used to test publication of a contract instance with no constructor in deploy_method.test.ts and in
/// private_initialization.test.ts
#[aztec]
pub contract NoConstructor {
    use aztec::{
        macros::{functions::external, storage::storage},
        messages::message_delivery::MessageDelivery,
        protocol_types::address::AztecAddress,
        state_vars::{Owned, PrivateMutable},
    };

    use field_note::field_note::FieldNote;

    #[storage]
    struct Storage<Context> {
        private_mutable: Owned<PrivateMutable<FieldNote, Context>, Context>,
    }

    /// Arbitrary public method used to test that publishing for public execution works for a contract with no constructor.
    #[external("public")]
    fn emit_public(value: Field) {
        self.context.emit_public_log(/*message=*/ value);
    }

    /// Arbitrary function used to test that we can call private functions on a contract with
    /// no constructor/initializer.
    #[external("private")]
    fn initialize_private_mutable(value: Field) {
        let owner = self.msg_sender().unwrap();
        let note = FieldNote { value };

        self.storage.private_mutable.at(owner).initialize(note).deliver(
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    /// Helper function used to test that call to `initialize_private_mutable` was successful or not yet performed.
    #[external("utility")]
    unconstrained fn is_private_mutable_initialized(owner: AztecAddress) -> bool {
        self.storage.private_mutable.at(owner).is_initialized()
    }

}
