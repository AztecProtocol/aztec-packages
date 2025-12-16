use aztec::macros::aztec;

#[aztec]
contract BoxReact {
    use aztec::{
        event::event_interface::MessageDelivery,
        macros::{functions::{initializer, private, utility}, storage::storage},
        protocol_types::address::AztecAddress,
        state_vars::{Map, PrivateMutable},
    };
    use value_note::value_note::ValueNote;

    #[storage]
    struct Storage<Context> {
        numbers: Map<AztecAddress, PrivateMutable<ValueNote, Context>, Context>,
    }

    #[private]
    #[initializer]
    fn constructor(number: Field, owner: AztecAddress) {
        let numbers = storage.numbers;
        let mut new_number = ValueNote::new(number, owner);

        numbers.at(owner).initialize(new_number).emit(
            &mut context,
            owner,
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    #[private]
    fn setNumber(number: Field, owner: AztecAddress) {
        let numbers = storage.numbers;
        let mut new_number = ValueNote::new(number, owner);

        numbers.at(owner).replace(new_number).emit(
            &mut context,
            owner,
            MessageDelivery.CONSTRAINED_ONCHAIN,
        );
    }

    #[utility]
    unconstrained fn getNumber(owner: AztecAddress) -> ValueNote {
        let numbers = storage.numbers;
        numbers.at(owner).view_note()
    }
}
