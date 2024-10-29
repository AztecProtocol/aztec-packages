use dep::aztec::macros::aztec;

#[aztec]
contract Vanilla {
    use dep::aztec::{
        protocol_types::public_keys::OvpkM,
        prelude::{AztecAddress, PrivateMutable, Map, NoteInterface, NoteHeader, Point},
        encrypted_logs::encrypted_note_emission::encode_and_encrypt_note,
        macros::{storage::storage, functions::{private, public, initializer}}
    };
    use dep::value_note::value_note::{ValueNote, VALUE_NOTE_LEN};

    #[storage]
    struct Storage<Context> {
        numbers: Map<AztecAddress, PrivateMutable<ValueNote, Context>, Context>,
    }

    #[private]
    #[initializer]
    fn constructor(
        number: Field,
        owner: AztecAddress,
        owner_ovpk_m: OvpkM
    ) {
        let numbers = storage.numbers;
        let mut new_number = ValueNote::new(number, owner);
        numbers.at(owner).initialize(&mut new_number).emit(encode_and_encrypt_note(&mut context, owner_ovpk_m, owner));
    }

    #[private]
    fn setNumber(
        number: Field,
        owner: AztecAddress,
        owner_ovpk_m: OvpkM
    ) {
        let numbers = storage.numbers;
        let mut new_number = ValueNote::new(number, owner);
        numbers.at(owner).replace(&mut new_number).emit(encode_and_encrypt_note(&mut context, owner_ovpk_m, owner));
    }

    unconstrained fn getNumber(owner: AztecAddress) -> pub ValueNote {
        let numbers = storage.numbers;
        numbers.at(owner).view_note()
    }
}
