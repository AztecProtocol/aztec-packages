use aztec::macros::aztec;

/// Used to test state vars in e2e_state_vars.test.ts
#[aztec]
pub contract StateVars {
    use aztec::{
        macros::{functions::{external, view}, storage::{storage, storage_no_init}},
        messages::delivery::MessageDelivery,
        protocol::{address::AztecAddress, traits::{Deserialize, Packable, Serialize}},
        state_vars::{
            RuntimeOwned, RuntimePrivateImmutable, RuntimePrivateMutable, RuntimePublicImmutable,
            RuntimePublicMutable, RuntimeStateVariable,
        },
    };

    use field_note::FieldNote;

    #[derive(Deserialize, Eq, Packable, Serialize)]
    pub struct MockStruct {
        account: AztecAddress,
        value: u8,
    }

    #[storage_no_init]
    struct StorageRuntime<Context> {
        mock_struct: RuntimePublicMutable<MockStruct, Context>,
        private_mutable: RuntimeOwned<RuntimePrivateMutable<FieldNote, Context>, Context>,
        private_immutable: RuntimeOwned<RuntimePrivateImmutable<FieldNote, Context>, Context>,
        public_immutable: RuntimePublicImmutable<MockStruct, Context>,
    }

    impl<Context> StorageRuntime<Context> {
        fn init(context: Context) -> Self {
            StorageRuntime {
                mock_struct: RuntimePublicMutable::new(context, 1),
                private_mutable: RuntimeOwned::new(context, 3),
                private_immutable: RuntimeOwned::new(context, 6),
                public_immutable: RuntimePublicImmutable::new(context, 7),
            }
        }
    }

    #[external("public")]
    fn initialize_public_immutable(value: u8) {
        let new_mock_struct = MockStruct { account: self.msg_sender(), value };
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
        let owner = self.msg_sender();
        let new_note = FieldNote { value };

        self.storage.private_immutable.at(owner).initialize(new_note).deliver(MessageDelivery::onchain_constrained());
    }

    #[external("private")]
    fn initialize_private(randomness: Field, value: Field) {
        let owner = self.msg_sender();
        let private_mutable = FieldNote { value };

        self.storage.private_mutable.at(owner).initialize(private_mutable).deliver(
            MessageDelivery::onchain_constrained(),
        );
    }

    #[external("private")]
    fn update_private_mutable(randomness: Field, value: Field) {
        let owner = self.msg_sender();
        self.storage.private_mutable.at(owner).replace(|_old_note| FieldNote { value }).deliver(
            MessageDelivery::onchain_constrained(),
        );
    }

    #[external("private")]
    fn increase_private_value() {
        let owner = self.msg_sender();
        // Replace existing note with new note containing incremented value
        self
            .storage
            .private_mutable
            .at(owner)
            .replace(|old_note| {
                let new_value = old_note.value + 1;
                FieldNote { value: new_value }
            })
            .deliver(MessageDelivery::onchain_constrained());
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
