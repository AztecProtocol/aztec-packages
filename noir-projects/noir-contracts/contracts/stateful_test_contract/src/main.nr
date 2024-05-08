// A contract used for testing a random hodgepodge of small features from simulator and end-to-end tests.
contract StatefulTest {
    use dep::aztec::prelude::{PrivateContext, NoteHeader, Map, PublicMutable, PrivateSet, AztecAddress, FunctionSelector};
    use dep::value_note::{
        balance_utils,
        utils::{increment, increment_without_calling_registry, decrement, decrement_without_calling_registry},
        value_note::{VALUE_NOTE_LEN, ValueNote}
    };
    use dep::aztec::{
        deploy::deploy_contract as aztec_deploy_contract,
        context::{PublicContext, Context, gas::GasOpts},
        oracle::get_contract_instance::get_contract_instance, initializer::assert_is_initialized_private
    };

    #[aztec(storage)]
    struct Storage {
        notes: Map<AztecAddress, PrivateSet<ValueNote>>,
        public_values: Map<AztecAddress, PublicMutable<Field>>,
    }

    #[aztec(private)]
    #[aztec(initializer)]
    fn constructor(owner: AztecAddress, value: Field) {
        StatefulTest::at(context.this_address()).create_note_no_init_check(owner, value).call(&mut context);
    }

    #[aztec(private)]
    #[aztec(initializer)]
    fn constructor_no_registry(
        owner: AztecAddress,
        owner_nullifier_public_key_hash: Field,
        value: Field
    ) {
        StatefulTest::at(context.this_address()).create_note_no_registry_no_init_check(owner, owner_nullifier_public_key_hash, value).call(&mut context);
    }

    #[aztec(private)]
    #[aztec(initializer)]
    fn wrong_constructor() {
        let selector = FunctionSelector::from_signature("not_exists(Field)");
        let _res = context.call_public_function(context.this_address(), selector, [42]);
    }

    #[aztec(public)]
    #[aztec(initializer)]
    fn public_constructor(owner: AztecAddress, value: Field) {
        StatefulTest::at(context.this_address()).increment_public_value_no_init_check(owner, value).call(&mut context);
    }

    #[aztec(private)]
    fn create_note(owner: AztecAddress, value: Field) {
        if (value != 0) {
            let loc = storage.notes.at(owner);
            increment(context, loc, value, owner);
        }
    }

    #[aztec(private)]
    #[aztec(noinitcheck)]
    fn create_note_no_init_check(owner: AztecAddress, value: Field) {
        if (value != 0) {
            let loc = storage.notes.at(owner);
            increment(context, loc, value, owner);
        }
    }

    #[aztec(private)]
    #[aztec(noinitcheck)]
    fn create_note_no_registry_no_init_check(
        owner: AztecAddress,
        owner_nullifier_public_key_hash: Field,
        value: Field
    ) {
        if (value != 0) {
            let loc = storage.notes.at(owner);
            increment_without_calling_registry(loc, value, owner_nullifier_public_key_hash);
        }
    }

    #[aztec(private)]
    fn destroy_and_create(recipient: AztecAddress, amount: Field) {
        assert_is_initialized_private(&mut context);
        let sender = context.msg_sender();

        let sender_notes = storage.notes.at(sender);
        decrement(context, sender_notes, amount, sender);

        let recipient_notes = storage.notes.at(recipient);
        increment(context, recipient_notes, amount, recipient);
    }

    #[aztec(private)]
    #[aztec(noinitcheck)]
    fn destroy_and_create_no_init_check(recipient: AztecAddress, amount: Field) {
        let sender = context.msg_sender();

        let sender_notes = storage.notes.at(sender);
        decrement(context, sender_notes, amount, sender);

        let recipient_notes = storage.notes.at(recipient);
        increment(context, recipient_notes, amount, recipient);
    }

    #[aztec(private)]
    #[aztec(noinitcheck)]
    fn destroy_and_create_no_registry_no_init_check(
        sender_nullifier_public_key_hash: Field,
        recipient: AztecAddress,
        recipient_nullifier_public_key_hash: Field,
        amount: Field
    ) {
        let sender_notes = storage.notes.at(context.msg_sender());
        decrement_without_calling_registry(sender_notes, amount, sender_nullifier_public_key_hash);

        let recipient_notes = storage.notes.at(recipient);
        increment_without_calling_registry(recipient_notes, amount, recipient_nullifier_public_key_hash);
    }

    #[aztec(public)]
    fn increment_public_value(owner: AztecAddress, value: Field) {
        let loc = storage.public_values.at(owner);
        loc.write(loc.read() + value);
    }

    #[aztec(public)]
    #[aztec(noinitcheck)]
    fn increment_public_value_no_init_check(owner: AztecAddress, value: Field) {
        let loc = storage.public_values.at(owner);
        loc.write(loc.read() + value);
    }

    unconstrained fn summed_values(owner: AztecAddress) -> pub Field {
        let owner_balance = storage.notes.at(owner);

        // Return the sum of all notes in the set.
        balance_utils::get_balance(owner_balance)
    }

    unconstrained fn get_public_value(owner: AztecAddress) -> pub Field {
        storage.public_values.at(owner).read()
    }
}
