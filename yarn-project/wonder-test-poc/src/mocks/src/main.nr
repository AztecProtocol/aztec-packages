contract MeaningOfLife {
    use dep::aztec::prelude::{AztecAddress, PrivateImmutable, PublicImmutable};
    use dep::aztec::state_vars::public_mutable::PublicMutable;
    use dep::field_note::field_note::FieldNote;

    struct Storage {
        value: PrivateImmutable<FieldNote>,
        public_value: PublicMutable<Field>,
        immutable_public_value: PublicImmutable<Field>,
    }

    #[aztec(private)]
    fn constructor() {
        storage.immutable_public_value.initialize(404);
    }

    unconstrained fn get_meaning_of_life() -> pub u32 {
        42
    }

    unconstrained fn get_public_value() -> pub Field {
        storage.public_value.read()
    }

    unconstrained fn get_public_storage_slot() -> pub Field {
        storage.public_value.get_storage_slot()
    }

    #[aztec(public)]
    fn public_function_to_call(value: Field) {
        storage.public_value.write(value);
    }

    #[aztec(private)]
    fn set_value(value: Field) {
        let mut note = FieldNote::new(value);
        storage.value.initialize(&mut note, false);
    }

    #[aztec(private)]
    fn get_value() -> Field {
        storage.value.get_note().value
    }

    unconstrained fn get_immutable_public_value() -> pub Field {
        storage.immutable_public_value.read()
    }
}
