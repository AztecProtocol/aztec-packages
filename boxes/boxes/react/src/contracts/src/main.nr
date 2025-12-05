use aztec::macros::aztec;

#[aztec]
contract BoxReact {
    use aztec::{
        macros::{functions::{external, initializer}, storage::storage},
        messages::message_delivery::MessageDelivery,
        protocol_types::address::AztecAddress,
        state_vars::{Owned, PrivateMutable},
    };
    use value_note::value_note::ValueNote;

    #[storage]
    struct Storage<Context> {
        numbers: Owned<PrivateMutable<ValueNote, Context>, Context>,
    }

    #[external("private")]
    #[initializer]
    fn constructor(number: Field, owner: AztecAddress) {
        let new_number = ValueNote::new(number);

        self.storage.numbers.at(owner).initialize(new_number).emit(
            owner,
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    #[external("private")]
    fn setNumber(number: Field, owner: AztecAddress) {
        self.storage.numbers.at(owner).replace(|_old| ValueNote::new(number)).emit(
            owner,
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    #[external("utility")]
    unconstrained fn getNumber(owner: AztecAddress) -> ValueNote {
        self.storage.numbers.at(owner).view_note()
    }
}
