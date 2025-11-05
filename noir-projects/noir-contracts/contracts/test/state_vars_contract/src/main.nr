use aztec::macros::aztec;

/// Used to test state vars in e2e_state_vars.test.ts
#[aztec]
pub contract StateVars {
    use aztec::{
        macros::{functions::{external, view}, storage::{storage, storage_no_init}},
        messages::message_delivery::MessageDelivery,
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

    #[external("public")]
    fn initialize_public_immutable(value: u8) {
        let mut new_mock_struct = MockStruct { account: self.msg_sender().unwrap(), value };
        self.storage.public_immutable.initialize(new_mock_struct);
    }

    #[external("private")]
    fn match_public_immutable(account: AztecAddress, value: u8) {
        let expected = MockStruct { account, value };
        let read = self.storage.public_immutable.read();

        assert(read.account == expected.account, "Invalid account");
        assert(read.value == expected.value, "Invalid value");
    }

    #[external("private")]
    fn get_public_immutable_constrained_private_indirect() -> MockStruct {
        let mut mock_struct = self.call_self_static.get_public_immutable_constrained_private();
        mock_struct.value += 1;
        mock_struct
    }

    #[external("public")]
    fn get_public_immutable_constrained_public_indirect() -> MockStruct {
        // This is a public function that calls another public function
        // and returns the response.
        // Used to test that we can retrieve values through calls and
        // correctly return them in the simulation
        let mut mock_struct = self.call_self_static.get_public_immutable_constrained_public();
        mock_struct.value += 1;
        mock_struct
    }

    #[external("public")]
    #[view]
    fn get_public_immutable_constrained_public() -> MockStruct {
        self.storage.public_immutable.read()
    }

    #[external("public")]
    fn get_public_immutable_constrained_public_multiple() -> [MockStruct; 5] {
        let a = self.storage.public_immutable.read();
        [a, a, a, a, a]
    }

    #[external("private")]
    #[view]
    fn get_public_immutable_constrained_private() -> MockStruct {
        self.storage.public_immutable.read()
    }

    #[external("utility")]
    unconstrained fn get_public_immutable() -> MockStruct {
        self.storage.public_immutable.read()
    }

    #[external("private")]
    fn initialize_private_immutable(randomness: Field, value: Field) {
        let new_note = ValueNote::new(value, self.msg_sender().unwrap());

        self.storage.private_immutable.initialize(new_note).emit(
            self.msg_sender().unwrap(),
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    #[external("private")]
    fn initialize_private(randomness: Field, value: Field) {
        let private_mutable = ValueNote::new(value, self.msg_sender().unwrap());

        self.storage.private_mutable.initialize(private_mutable).emit(
            self.msg_sender().unwrap(),
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    #[external("private")]
    fn update_private_mutable(randomness: Field, value: Field) {
        self
            .storage
            .private_mutable
            .replace(|_old_note| ValueNote::new(value, self.msg_sender().unwrap()))
            .emit(self.msg_sender().unwrap(), MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    #[external("private")]
    fn increase_private_value() {
        // Replace existing note with new note containing incremented value
        self
            .storage
            .private_mutable
            .replace(|old_note| {
                let new_value = old_note.value() + 1;
                ValueNote::new(new_value, self.msg_sender().unwrap())
            })
            .emit(self.msg_sender().unwrap(), MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    #[external("utility")]
    unconstrained fn get_private_mutable() -> ValueNote {
        self.storage.private_mutable.view_note()
    }

    #[external("utility")]
    unconstrained fn is_private_mutable_initialized() -> bool {
        self.storage.private_mutable.is_initialized()
    }

    #[external("utility")]
    unconstrained fn view_private_immutable() -> ValueNote {
        self.storage.private_immutable.view_note()
    }

    #[external("utility")]
    unconstrained fn is_priv_imm_initialized() -> bool {
        self.storage.private_immutable.is_initialized()
    }
}
