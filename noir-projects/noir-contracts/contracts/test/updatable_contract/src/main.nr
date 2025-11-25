use aztec::macros::aztec;

/// A contract that can be updated to a new contract class. Used to test contract updates in e2e_contract_updates.test.ts.
#[aztec]
contract Updatable {
    use aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        messages::message_delivery::MessageDelivery,
        protocol_types::{
            constants::CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
            contract_class_id::ContractClassId,
        },
        state_vars::{PrivateMutable, PublicMutable},
    };
    use contract_instance_registry::ContractInstanceRegistry;
    use value_note::value_note::ValueNote;

    #[storage]
    struct Storage<Context> {
        private_value: PrivateMutable<ValueNote, Context>,
        public_value: PublicMutable<Field, Context>,
    }

    #[initializer]
    #[external("private")]
    fn initialize(initial_value: Field) {
        let owner = self.msg_sender().unwrap();
        let new_value = ValueNote::new(initial_value, owner);
        self.storage.private_value.initialize(new_value).emit(
            owner,
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
        self.enqueue_self.set_public_value(initial_value);
    }

    #[external("public")]
    fn set_public_value(new_value: Field) {
        self.storage.public_value.write(new_value);
    }

    #[external("private")]
    fn update_to(new_class_id: ContractClassId) {
        self.enqueue(ContractInstanceRegistry::at(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS)
            .update(new_class_id));
    }

    #[external("private")]
    fn set_update_delay(new_delay: u64) {
        self.enqueue(ContractInstanceRegistry::at(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS)
            .set_update_delay(new_delay));
    }

    #[external("public")]
    fn get_update_delay() -> u64 {
        self.view(ContractInstanceRegistry::at(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS)
            .get_update_delay())
    }

    #[external("utility")]
    unconstrained fn get_private_value() -> Field {
        self.storage.private_value.view_note().value()
    }

    #[external("utility")]
    unconstrained fn get_public_value() -> Field {
        self.storage.public_value.read()
    }

}
