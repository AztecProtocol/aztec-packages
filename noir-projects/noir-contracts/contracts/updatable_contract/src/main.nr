use dep::aztec::macros::aztec;

#[aztec]
contract UpdatableContract {
    use aztec::encrypted_logs::encrypted_note_emission::encode_and_encrypt_note;
    use aztec::macros::{functions::{initializer, private, public}, storage::storage};
    use aztec::prelude::{PrivateMutable, PublicMutable};

    use dep::contract_instance_deployer::ContractInstanceDeployer;
    use aztec::protocol_types::{
        constants::DEPLOYER_CONTRACT_ADDRESS,
        contract_class_id::ContractClassId,
        traits::{Hash, Serialize},
    };
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
        let mut new_value = ValueNote::new(initial_value, owner);
        storage.private_value.initialize(&mut new_value).emit(encode_and_encrypt_note(
            &mut context,
            owner,
            owner,
        ));
        UpdatableContract::at(context.this_address()).set_public_value(initial_value).enqueue(
            &mut context,
        );
    }

    #[public]
    fn set_public_value(new_value: Field) {
        storage.public_value.write(new_value);
    }

    #[private]
    fn update_to(new_class_id: ContractClassId) {
        ContractInstanceDeployer::at(DEPLOYER_CONTRACT_ADDRESS).update(new_class_id).enqueue(
            &mut context,
        );
    }

    unconstrained fn get_private_value() -> pub Field {
        storage.private_value.view_note().value
    }

    unconstrained fn get_public_value() -> pub Field {
        storage.public_value.read()
    }

}
