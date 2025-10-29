use aztec::macros::aztec;

#[aztec]
contract BoxReact {
    use aztec::{
        messages::message_delivery::MessageDelivery,
        macros::{functions::{external, initializer}, storage::storage},
        protocol_types::address::AztecAddress,
        state_vars::{Map, PrivateMutable},
    };
    use value_note::value_note::ValueNote;

    #[storage]
    struct Storage<Context> {
        numbers: Map<AztecAddress, PrivateMutable<ValueNote, Context>, Context>,
    }

    #[external("private")]
    #[initializer]
    fn constructor(number: Field, owner: AztecAddress) {
        let numbers = storage.numbers;
        let mut new_number = ValueNote::new(number, owner);

        numbers.at(owner).initialize(new_number).emit(
            owner,
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    #[external("private")]
    fn setNumber(number: Field, owner: AztecAddress) {
        let numbers = storage.numbers;


    numbers.at(owner)
        .replace(|_old| {
            ValueNote::new(number, owner)
        }).emit(
            owner,
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    #[external("utility")]
    unconstrained fn getNumber(owner: AztecAddress) -> ValueNote {
        let numbers = storage.numbers;
        numbers.at(owner).view_note()
    }
}
