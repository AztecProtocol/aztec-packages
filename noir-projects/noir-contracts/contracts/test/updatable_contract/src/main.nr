use dep::aztec::macros::aztec;

/// A contract that can be updated to a new contract class. Used to test contract updates in e2e_contract_updates.test.ts.
#[aztec]
contract Updatable {
    use aztec::macros::{functions::{initializer, private, public, utility}, storage::storage};
    use aztec::messages::logs::note::encode_and_encrypt_note;
    use aztec::state_vars::{PrivateMutable, PublicMutable};

    use aztec::protocol_types::{
        constants::CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS, contract_class_id::ContractClassId,
    };
    use contract_instance_deployer::ContractInstanceDeployer;
    use value_note::value_note::ValueNote;

    #[storage]
    struct Storage<Context> {
        private_value: PrivateMutable<ValueNote, Context>,
        public_value: PublicMutable<Field, Context>,
    }

    #[initializer]
    #[private]
    fn initialize(initial_value: Field) {
        let owner = context.msg_sender();
        let new_value = ValueNote::new(initial_value, owner);
        storage.private_value.initialize(new_value).emit(encode_and_encrypt_note(
            &mut context,
            owner,
            owner,
        ));
        Updatable::at(context.this_address()).set_public_value(initial_value).enqueue(&mut context);
    }

    #[public]
    fn set_public_value(new_value: Field) {
        storage.public_value.write(new_value);
    }

    #[private]
    fn update_to(new_class_id: ContractClassId) {
        ContractInstanceDeployer::at(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS)
            .update(new_class_id)
            .enqueue(&mut context);
    }

    #[private]
    fn set_update_delay(new_delay: u64) {
        ContractInstanceDeployer::at(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS)
            .set_update_delay(new_delay)
            .enqueue(&mut context);
    }

    #[public]
    fn get_update_delay() -> u64 {
        ContractInstanceDeployer::at(CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS)
            .get_update_delay()
            .view(&mut context)
    }

    #[utility]
    unconstrained fn get_private_value() -> Field {
        storage.private_value.view_note().value
    }

    #[utility]
    unconstrained fn get_public_value() -> Field {
        storage.public_value.read()
    }

}
