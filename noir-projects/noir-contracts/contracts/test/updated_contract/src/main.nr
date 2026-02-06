use aztec::macros::aztec;

/// A contract to whose contract class the `Updatable` contract is updated to in `e2e_contract_updates.test.ts`.
#[aztec]
contract Updated {
    use aztec::{
        macros::{functions::external, storage::storage},
        messages::message_delivery::MessageDelivery,
        protocol::{address::AztecAddress, constants::CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS},
        state_vars::{Owned, PrivateMutable, PublicMutable},
    };
    use contract_instance_registry::ContractInstanceRegistry;
    use field_note::FieldNote;

    #[storage]
    struct Storage<CONTEXT> {
        private_value: Owned<PrivateMutable<FieldNote, CONTEXT>, CONTEXT>,
        public_value: PublicMutable<Field, CONTEXT>,
    }

    #[external("public")]
    fn set_public_value() {
        self.storage.public_value.write(27);
    }

    #[external("private")]
    fn set_private_value() {
        let owner = self.msg_sender();

        self.storage.private_value.at(owner).replace(|_old| FieldNote { value: 27 }).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
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
