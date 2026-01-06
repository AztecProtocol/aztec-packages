use aztec::macros::aztec;

/// A contract that can be updated to a new contract class. Used to test contract updates in e2e_contract_updates.test.ts.
#[aztec]
contract Updatable {
    use aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        messages::message_delivery::MessageDelivery,
        protocol_types::{
            address::AztecAddress, constants::CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS,
            contract_class_id::ContractClassId,
        },
        state_vars::{Owned, PrivateMutable, PublicMutable},
    };
    use contract_instance_registry::ContractInstanceRegistry;
    use field_note::field_note::FieldNote;

    #[storage]
    struct Storage<Context> {
        private_value: Owned<PrivateMutable<FieldNote, Context>, Context>,
        public_value: PublicMutable<Field, Context>,
    }

    #[initializer]
    #[external("private")]
    fn initialize(initial_value: Field) {
        let owner = self.msg_sender().unwrap();
        let note = FieldNote { value: initial_value };
        self.storage.private_value.at(owner).initialize(note).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
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
    unconstrained fn get_private_value(owner: AztecAddress) -> Field {
        self.storage.private_value.at(owner).view_note().value
    }

    #[external("utility")]
    unconstrained fn get_public_value() -> Field {
        self.storage.public_value.read()
    }

}
