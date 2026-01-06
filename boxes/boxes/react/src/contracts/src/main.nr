use aztec::macros::aztec;

#[aztec]
contract BoxReact {
    use aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        messages::message_delivery::MessageDelivery,
        protocol_types::address::AztecAddress,
        state_vars::{Owned, PrivateMutable},
    };
    use field_note::field_note::FieldNote;

    #[storage]
    struct Storage<Context> {
        numbers: Owned<PrivateMutable<FieldNote, Context>, Context>,
    }

    #[external("private")]
    #[initializer]
    fn constructor(number: Field, owner: AztecAddress) {
        let new_number = FieldNote { value: number };

        self.storage.numbers.at(owner).initialize(new_number).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
    }

    #[external("private")]
    fn setNumber(number: Field, owner: AztecAddress) {
        self.storage.numbers.at(owner).replace(|_old| FieldNote { value: number }).deliver(
            MessageDelivery.ONCHAIN_CONSTRAINED,
        );
    }

    #[external("utility")]
    unconstrained fn getNumber(owner: AztecAddress) -> FieldNote {
        self.storage.numbers.at(owner).view_note()
    }
}
