use aztec::macros::aztec;

/// Used to test state vars in e2e_state_vars.test.ts
#[aztec]
pub contract StateVars {
    use aztec::{
        macros::{functions::{private, public, utility, view}, storage::{storage, storage_no_init}},
        messages::logs::note::encode_and_encrypt_note,
        protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}},
        state_vars::{PrivateImmutable, PrivateMutable, PublicImmutable, PublicMutable},
    };

    use value_note::value_note::ValueNote;

    #[derive(Deserialize, Eq, Packable, Serialize)]
    pub struct MockStruct {
        account: AztecAddress,
        value: u8,
    }

    #[storage_no_init]
    struct Storage<Context> {
        mock_struct: PublicMutable<MockStruct, Context>,
        private_mutable: PrivateMutable<ValueNote, Context>,
        private_immutable: PrivateImmutable<ValueNote, Context>,
        public_immutable: PublicImmutable<MockStruct, Context>,
    }

    impl<Context> Storage<Context> {
        fn init(context: Context) -> Self {
            Storage {
                mock_struct: PublicMutable::new(context, 1),
                private_mutable: PrivateMutable::new(context, 3),
                private_immutable: PrivateImmutable::new(context, 6),
                public_immutable: PublicImmutable::new(context, 7),
            }
        }
    }

    #[public]
    fn initialize_public_immutable(value: u8) {
        let mut new_mock_struct = MockStruct { account: context.msg_sender(), value };
        storage.public_immutable.initialize(new_mock_struct);
    }

    #[private]
    fn match_public_immutable(account: AztecAddress, value: u8) {
        let expected = MockStruct { account, value };
        let read = storage.public_immutable.read();

        assert(read.account == expected.account, "Invalid account");
        assert(read.value == expected.value, "Invalid value");
    }

    #[private]
    fn get_public_immutable_constrained_private_indirect() -> MockStruct {
        let mut mock_struct = StateVars::at(context.this_address())
            .get_public_immutable_constrained_private()
            .view(&mut context);
        mock_struct.value += 1;
        mock_struct
    }

    #[public]
    fn get_public_immutable_constrained_public_indirect() -> MockStruct {
        // This is a public function that calls another public function
        // and returns the response.
        // Used to test that we can retrieve values through calls and
        // correctly return them in the simulation
        let mut mock_struct = StateVars::at(context.this_address())
            .get_public_immutable_constrained_public()
            .view(&mut context);
        mock_struct.value += 1;
        mock_struct
    }

    #[public]
    #[view]
    fn get_public_immutable_constrained_public() -> MockStruct {
        storage.public_immutable.read()
    }

    #[public]
    fn get_public_immutable_constrained_public_multiple() -> [MockStruct; 5] {
        let a = storage.public_immutable.read();
        [a, a, a, a, a]
    }

    #[private]
    #[view]
    fn get_public_immutable_constrained_private() -> MockStruct {
        storage.public_immutable.read()
    }

    #[utility]
    unconstrained fn get_public_immutable() -> MockStruct {
        storage.public_immutable.read()
    }

    #[private]
    fn initialize_private_immutable(randomness: Field, value: Field) {
        let new_note = ValueNote::new(value, context.msg_sender());

        storage.private_immutable.initialize(new_note).emit(encode_and_encrypt_note(
            &mut context,
            context.msg_sender(),
        ));
    }

    #[private]
    fn initialize_private(randomness: Field, value: Field) {
        let private_mutable = ValueNote::new(value, context.msg_sender());

        storage.private_mutable.initialize(private_mutable).emit(encode_and_encrypt_note(
            &mut context,
            context.msg_sender(),
        ));
    }

    #[private]
    fn update_private_mutable(randomness: Field, value: Field) {
        let new_note = ValueNote::new(value, context.msg_sender());

        storage.private_mutable.replace(new_note).emit(encode_and_encrypt_note(
            &mut context,
            context.msg_sender(),
        ));
    }

    #[private]
    fn increase_private_value() {
        // Get current value from private mutable storage
        let current = storage.private_mutable.get_note().note;

        // Increment value by 1
        let new_value = current.value + 1;

        // Create new note with incremented value
        let new_note = ValueNote::new(new_value, context.msg_sender());

        // Replace existing note with new note
        storage.private_mutable.replace(new_note).emit(encode_and_encrypt_note(
            &mut context,
            context.msg_sender(),
        ));
    }

    #[utility]
    unconstrained fn get_private_mutable() -> ValueNote {
        storage.private_mutable.view_note()
    }

    #[utility]
    unconstrained fn is_private_mutable_initialized() -> bool {
        storage.private_mutable.is_initialized()
    }

    #[utility]
    unconstrained fn view_private_immutable() -> ValueNote {
        storage.private_immutable.view_note()
    }

    #[utility]
    unconstrained fn is_priv_imm_initialized() -> bool {
        storage.private_immutable.is_initialized()
    }
}
