use aztec::macros::aztec;

/// Used to test state vars in e2e_state_vars.test.ts
#[aztec]
pub contract StateVars {
    use aztec::{
        macros::{functions::{external, view}, storage::{storage, storage_no_init}},
        messages::message_delivery::MessageDelivery,
        protocol_types::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}},
        state_vars::{
            Owned, PrivateImmutable, PrivateMutable, PublicImmutable, PublicMutable, StateVariable,
        },
    };

    use field_note::field_note::FieldNote;

    #[derive(Deserialize, Eq, Packable, Serialize)]
    pub struct MockStruct {
        account: AztecAddress,
        value: u8,
    }

    #[storage_no_init]
    struct Storage<Context> {
        mock_struct: PublicMutable<MockStruct, Context>,
        private_mutable: Owned<PrivateMutable<FieldNote, Context>, Context>,
        private_immutable: Owned<PrivateImmutable<FieldNote, Context>, Context>,
        public_immutable: PublicImmutable<MockStruct, Context>,
    }

    impl<Context> Storage<Context> {
        fn init(context: Context) -> Self {
            Storage {
                mock_struct: PublicMutable::new(context, 1),
                private_mutable: Owned::new(context, 3),
                private_immutable: Owned::new(context, 6),
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
        let owner = self.msg_sender().unwrap();
        let new_note = FieldNote { value };

        self.storage.private_immutable.at(owner).initialize(new_note).deliver(
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    #[external("private")]
    fn initialize_private(randomness: Field, value: Field) {
        let owner = self.msg_sender().unwrap();
        let private_mutable = FieldNote { value };

        self.storage.private_mutable.at(owner).initialize(private_mutable).deliver(
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    #[external("private")]
    fn update_private_mutable(randomness: Field, value: Field) {
        let owner = self.msg_sender().unwrap();
        self.storage.private_mutable.at(owner).replace(|_old_note| FieldNote { value }).deliver(
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    #[external("private")]
    fn increase_private_value() {
        let owner = self.msg_sender().unwrap();
        // Replace existing note with new note containing incremented value
        self
            .storage
            .private_mutable
            .at(owner)
            .replace(|old_note| {
                let new_value = old_note.value + 1;
                FieldNote { value: new_value }
            })
            .deliver(MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    #[external("utility")]
    unconstrained fn get_private_mutable(owner: AztecAddress) -> FieldNote {
        self.storage.private_mutable.at(owner).view_note()
    }

    #[external("utility")]
    unconstrained fn is_private_mutable_initialized(owner: AztecAddress) -> bool {
        self.storage.private_mutable.at(owner).is_initialized()
    }

    #[external("utility")]
    unconstrained fn view_private_immutable(owner: AztecAddress) -> FieldNote {
        self.storage.private_immutable.at(owner).view_note()
    }

    #[external("utility")]
    unconstrained fn is_priv_imm_initialized(owner: AztecAddress) -> bool {
        self.storage.private_immutable.at(owner).is_initialized()
    }
}
