// Test contract to confirm that notes can be inserted and then later
// read (eventually even nullified) in the same TX. This contract
// also contains some "bad" test cases to ensure that notes cannot
// be read/nullified before their creation etc.
mod filter;

use aztec::macros::aztec;

#[aztec]
pub contract PendingNoteHashes {
    // Libs
    use crate::filter::filter_notes_min_sum;
    use aztec::{
        macros::{functions::{external, internal}, storage::storage},
        messages::message_delivery::MessageDelivery,
        note::note_getter_options::NoteGetterOptions,
        protocol_types::{
            abis::function_selector::FunctionSelector,
            address::AztecAddress,
            constants::{MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, MAX_NOTE_HASHES_PER_CALL},
            traits::{Packable, ToField},
        },
        state_vars::{Owned, PrivateSet},
    };
    use field_note::field_note::FieldNote;

    #[storage]
    struct Storage<Context> {
        balances: Owned<PrivateSet<FieldNote, Context>, Context>,
    }

    // TODO(dbanks12): consolidate code into internal helper functions
    // (once Noir's support for this is more robust)

    // Confirm can access pending note hashes by creating / inserting a note and then
    // getting / reading that note all in the same contract function
    // Realistic way to describe this test is "Mint note A, then burn note A in the same transaction"
    #[external("private")]
    fn test_insert_then_get_then_nullify_flat(
        amount: Field,
        owner: AztecAddress,
        sender: AztecAddress,
    ) -> Field {
        let owner_balance = self.storage.balances.at(owner);

        let note = FieldNote { value: amount };

        // Insert note
        owner_balance.insert(note).deliver(owner, MessageDelivery.CONSTRAINED_ONCHAIN);

        let options = NoteGetterOptions::with_filter(filter_notes_min_sum, amount);
        // get note inserted above
        let notes = owner_balance.pop_notes(options);

        let note0 = notes.get(0);
        assert(note.value == note0.value);
        assert(notes.len() == 1);

        note0.value
    }

    // Confirm cannot access note hashes inserted later in same function
    #[external("private")]
    fn test_bad_get_then_insert_flat(amount: Field, owner: AztecAddress) -> Field {
        let owner_balance = self.storage.balances.at(owner);

        let options = NoteGetterOptions::with_filter(filter_notes_min_sum, amount);
        // get note (note inserted at bottom of function shouldn't exist yet)
        let notes = owner_balance.get_notes(options);

        assert(notes.len() == 0);

        // Insert note
        let note = FieldNote { value: amount };
        // Discard the message
        let _ = owner_balance.insert(note);

        0
    }

    // Dummy nested/inner function (to pass a function which does nothing)
    #[external("private")]
    fn dummy(amount: Field, owner: AztecAddress, sender: AztecAddress) {}

    // Nested/inner function to create and insert a note
    #[external("private")]
    fn insert_note(amount: Field, owner: AztecAddress, sender: AztecAddress) {
        let owner_balance = self.storage.balances.at(owner);

        let note = FieldNote { value: amount };

        // Insert note
        owner_balance.insert(note).deliver(owner, MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    // Nested/inner function to create and insert a note
    // TESTING: inserts a static randomness value to test notes with
    // the same note hash are dealt with correctly
    #[external("private")]
    fn insert_note_static_randomness(amount: Field, owner: AztecAddress, sender: AztecAddress) {
        let owner_balance = self.storage.balances.at(owner);

        // Note that the following is severely misusing the Packable trait as we should never be messing with internal
        // encoding. This is brittle but I don't care.
        let note = FieldNote::unpack([amount.to_field()]);

        // Insert note
        owner_balance.insert(note).deliver(owner, MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    // Nested/inner function to create and insert a note
    // then emit another note log for the same note
    #[external("private")]
    fn insert_note_extra_emit(amount: Field, owner: AztecAddress, sender: AztecAddress) {
        let owner_balance = self.storage.balances.at(owner);

        let note = FieldNote { value: amount };

        // Insert note
        let message = owner_balance.insert(note);

        message.deliver(owner, MessageDelivery.CONSTRAINED_ONCHAIN);

        // Deliver note message again
        message.deliver(owner, MessageDelivery.CONSTRAINED_ONCHAIN);
    }

    // Nested/inner function to get a note and confirm it matches the expected value
    #[external("private")]
    fn get_then_nullify_note(expected_value: Field, owner: AztecAddress) -> Field {
        let owner_balance = self.storage.balances.at(owner);

        let mut options = NoteGetterOptions::new();
        options = options.set_limit(1);
        let note = owner_balance.pop_notes(options).get(0);

        assert(expected_value == note.value);
        expected_value
    }

    // Nested/inner function to get a note and confirms that none is returned
    #[external("private")]
    fn get_note_zero_balance(owner: AztecAddress) {
        let owner_balance = self.storage.balances.at(owner);

        let options = NoteGetterOptions::new();
        let notes = owner_balance.get_notes(options);

        assert(notes.len() == 0);
    }

    // Test pending note hashes with note insertion done in a nested call
    // and "read" / get of that pending note hash in another nested call
    // Realistic way to describe this test is "Mint note A, then burn note A in the same transaction"
    #[external("private")]
    fn test_insert_then_get_then_nullify_all_in_nested_calls(
        amount: Field,
        owner: AztecAddress,
        sender: AztecAddress,
        insert_fn_selector: FunctionSelector,
        get_then_nullify_fn_selector: FunctionSelector,
    ) {
        // nested call to create/insert note
        let _res = self.context.call_private_function(
            inputs.call_context.contract_address,
            insert_fn_selector,
            [amount, owner.to_field(), sender.to_field()],
        );
        // nested call to read and nullify that note
        let _res = self.context.call_private_function(
            inputs.call_context.contract_address,
            get_then_nullify_fn_selector,
            [amount, owner.to_field()],
        );
    }

    // same test as above, but insert 2, get 2, nullify 2
    #[external("private")]
    fn test_insert2_then_get2_then_nullify2_all_in_nested_calls(
        amount: Field,
        owner: AztecAddress,
        sender: AztecAddress,
        insert_fn_selector: FunctionSelector,
        get_then_nullify_fn_selector: FunctionSelector,
    ) {
        // args for nested calls
        let insertArgs = [amount, owner.to_field(), sender.to_field()];
        let getNullifyArgs = [amount, owner.to_field()];

        // nested call to create/insert note
        let _callStackItem1 = self.context.call_private_function(
            inputs.call_context.contract_address,
            insert_fn_selector,
            insertArgs,
        );
        let _callStackItem2 = self.context.call_private_function(
            inputs.call_context.contract_address,
            insert_fn_selector,
            insertArgs,
        );
        // nested call to read and nullify that note
        let _callStackItem3 = self.context.call_private_function(
            inputs.call_context.contract_address,
            get_then_nullify_fn_selector,
            getNullifyArgs,
        );
        let _callStackItem4 = self.context.call_private_function(
            inputs.call_context.contract_address,
            get_then_nullify_fn_selector,
            getNullifyArgs,
        );
        // nested call to confirm that balance is zero
        // TODO(dbanks12): once > 4 nested calls is supported, can confirm 0 balance:
        //let _callStackItem5 = self.context.call_private_function(inputs.call_context.contract_address, get_note_zero_fn_selector, [owner]);
    }

    // same test as above, but insert 2, get 1, nullify 1
    #[external("private")]
    fn test_insert2_then_get2_then_nullify1_all_in_nested_calls(
        amount: Field,
        owner: AztecAddress,
        sender: AztecAddress,
        insert_fn_selector: FunctionSelector,
        get_then_nullify_fn_selector: FunctionSelector,
    ) {
        // args for nested calls
        let insertArgs = [amount, owner.to_field(), sender.to_field()];
        let getNullifyArgs = [amount, owner.to_field()];

        // nested call to create/insert note
        let _callStackItem1 = self.context.call_private_function(
            inputs.call_context.contract_address,
            insert_fn_selector,
            insertArgs,
        );
        let _callStackItem2 = self.context.call_private_function(
            inputs.call_context.contract_address,
            insert_fn_selector,
            insertArgs,
        );
        // nested call to read and nullify that note
        let _callStackItem3 = self.context.call_private_function(
            inputs.call_context.contract_address,
            get_then_nullify_fn_selector,
            getNullifyArgs,
        );
    }

    // insert 1 note, then get 2 notes (one pending, one persistent) and nullify both.
    // one nullifier will be squashed with the pending note, one will become persistent.
    // ONLY WORKS IF THERE IS A PERSISTENT NOTE TO GET
    #[external("private")]
    fn test_insert1_then_get2_then_nullify2_all_in_nested_calls(
        amount: Field,
        owner: AztecAddress,
        sender: AztecAddress,
        insert_fn_selector: FunctionSelector,
        get_then_nullify_fn_selector: FunctionSelector,
    ) {
        // args for nested calls
        let insertArgs = [amount, owner.to_field(), sender.to_field()];
        let getNullifyArgs = [amount, owner.to_field()];

        // nested call to create/insert note
        let _callStackItem1 = self.context.call_private_function(
            inputs.call_context.contract_address,
            insert_fn_selector,
            insertArgs,
        );
        // nested call to read and nullify that note
        let _callStackItem2 = self.context.call_private_function(
            inputs.call_context.contract_address,
            get_then_nullify_fn_selector,
            getNullifyArgs,
        );
        let _callStackItem3 = self.context.call_private_function(
            inputs.call_context.contract_address,
            get_then_nullify_fn_selector,
            getNullifyArgs,
        );
    }
    // Confirm cannot get/read a pending note hash in a nested call
    // that is created/inserted later in execution but in the parent.
    // NOTE: This test is especially important in an end-to-end context because the parent call
    // (and therefore the insertion) will be processed in an earlier kernel iteration, but the
    // nested call (later kernel iteration) should not be able to read the note hash despite
    // it being present at that stage in the kernel.
    // If we can somehow force the simulator to allow execution to succeed can ensure that this test fails in the kernel
    // #[external("private")]
    // fn test_bad_get_in_nested_call_then_insert(
    //    amount: Field,
    //    owner: AztecAddress,
    //    get_then_nullify_fn_selector: FunctionSelector,
    //) {
    //}

    #[external("private")]
    fn test_recursively_create_notes(
        owner: AztecAddress,
        sender: AztecAddress,
        how_many_recursions: u64,
    ) {
        self.internal.create_max_notes(owner);

        self.call_self.recursively_destroy_and_create_notes(owner, sender, how_many_recursions);
    }

    #[external("private")]
    fn recursively_destroy_and_create_notes(
        owner: AztecAddress,
        sender: AztecAddress,
        executions_left: u64,
    ) {
        assert(executions_left > 0);

        self.internal.destroy_max_notes(owner);
        self.internal.create_max_notes(owner);

        let executions_left = executions_left - 1;

        if executions_left > 0 {
            self.call_self.recursively_destroy_and_create_notes(owner, sender, executions_left);
        }
    }

    #[internal("private")]
    fn create_max_notes(owner: AztecAddress) {
        let owner_balance = self.storage.balances.at(owner);

        for i in 0..self.internal.max_notes_per_call() {
            let note = FieldNote { value: i as Field };
            owner_balance.insert(note).deliver(owner, MessageDelivery.CONSTRAINED_ONCHAIN);
        }
    }

    #[internal("private")]
    fn destroy_max_notes(owner: AztecAddress) {
        let owner_balance = self.storage.balances.at(owner);
        // Note that we're relying on PXE actually returning the notes, we're not constraining that any specific
        // number of notes are deleted.
        let _ = owner_balance.pop_notes(NoteGetterOptions::new());
    }

    #[internal("private")]
    fn max_notes_per_call() -> u32 {
        if MAX_NOTE_HASHES_PER_CALL > MAX_NOTE_HASH_READ_REQUESTS_PER_CALL {
            MAX_NOTE_HASH_READ_REQUESTS_PER_CALL
        } else {
            MAX_NOTE_HASHES_PER_CALL
        }
    }
}
