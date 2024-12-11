// Test contract to confirm that notes can be inserted and then later
// read (eventually even nullified) in the same TX. This contract
// also contains some "bad" test cases to ensure that notes cannot
// be read/nullified before their creation etc.
use dep::aztec::macros::aztec;

#[aztec]
contract PendingNoteHashes {
    // Libs
    use dep::aztec::encrypted_logs::encrypted_note_emission::encode_and_encrypt_note;
    use dep::aztec::macros::{functions::private, storage::storage};
    use dep::aztec::note::note_emission::NoteEmission;
    use dep::aztec::prelude::{
        AztecAddress, FunctionSelector, Map, NoteGetterOptions, PrivateContext, PrivateSet,
    };
    use dep::aztec::protocol_types::constants::{
        MAX_NOTE_HASH_READ_REQUESTS_PER_CALL, MAX_NOTE_HASHES_PER_CALL,
    };
    use dep::value_note::{filter::filter_notes_min_sum, value_note::ValueNote};

    #[storage]
    struct Storage<Context> {
        balances: Map<AztecAddress, PrivateSet<ValueNote, Context>, Context>,
    }

    // TODO(dbanks12): consolidate code into internal helper functions
    // (once Noir's support for this is more robust)

    // Confirm can access pending note hashes by creating / inserting a note and then
    // getting / reading that note all in the same contract function
    // Realistic way to describe this test is "Mint note A, then burn note A in the same transaction"
    #[private]
    fn test_insert_then_get_then_nullify_flat(
        amount: Field,
        owner: AztecAddress,
        sender: AztecAddress,
    ) -> Field {
        let owner_balance = storage.balances.at(owner);

        let mut note = ValueNote::new(amount, owner);

        // Insert note
        owner_balance.insert(&mut note).emit(encode_and_encrypt_note(&mut context, owner, sender));

        let options = NoteGetterOptions::with_filter(filter_notes_min_sum, amount);
        // get note inserted above
        let notes = owner_balance.pop_notes(options);

        let note0 = notes.get(0);
        assert(note.value == note0.value);
        assert(notes.len() == 1);

        note0.value
    }

    // Confirm cannot access note hashes inserted later in same function
    #[private]
    fn test_bad_get_then_insert_flat(amount: Field, owner: AztecAddress) -> Field {
        let owner_balance = storage.balances.at(owner);

        let options = NoteGetterOptions::with_filter(filter_notes_min_sum, amount);
        // get note (note inserted at bottom of function shouldn't exist yet)
        let notes = owner_balance.get_notes(options);

        assert(notes.len() == 0);

        // Insert note
        let mut note = ValueNote::new(amount, owner);
        owner_balance.insert(&mut note).discard();

        0
    }

    // Dummy nested/inner function (to pass a function which does nothing)
    #[private]
    fn dummy(amount: Field, owner: AztecAddress, sender: AztecAddress) {}

    // Nested/inner function to create and insert a note
    #[private]
    fn insert_note(amount: Field, owner: AztecAddress, sender: AztecAddress) {
        let owner_balance = storage.balances.at(owner);

        let mut note = ValueNote::new(amount, owner);

        // Insert note
        owner_balance.insert(&mut note).emit(encode_and_encrypt_note(&mut context, owner, sender));
    }

    // Nested/inner function to create and insert a note
    // TESTING: inserts a static randomness value to test notes with
    // the same note hash are dealt with correctly
    #[private]
    fn insert_note_static_randomness(amount: Field, owner: AztecAddress, sender: AztecAddress) {
        let mut owner_balance = storage.balances.at(owner);

        let mut note = ValueNote::new(amount, owner);
        note.randomness = 2;

        // Insert note
        owner_balance.insert(&mut note).emit(encode_and_encrypt_note(&mut context, owner, sender));
    }

    // Nested/inner function to create and insert a note
    // then emit another note log for the same note
    #[private]
    fn insert_note_extra_emit(amount: Field, owner: AztecAddress, sender: AztecAddress) {
        let mut owner_balance = storage.balances.at(owner);

        let mut note = ValueNote::new(amount, owner);

        // Insert note
        let emission = owner_balance.insert(&mut note);

        emission.emit(encode_and_encrypt_note(&mut context, owner, sender));

        // Emit note again
        emission.emit(encode_and_encrypt_note(&mut context, owner, sender));
    }

    // Nested/inner function to get a note and confirm it matches the expected value
    #[private]
    fn get_then_nullify_note(expected_value: Field, owner: AztecAddress) -> Field {
        let owner_balance = storage.balances.at(owner);

        let mut options = NoteGetterOptions::new();
        options = options.set_limit(1);
        let note = owner_balance.pop_notes(options).get(0);

        assert(expected_value == note.value);
        expected_value
    }

    // Nested/inner function to get a note and confirms that none is returned
    #[private]
    fn get_note_zero_balance(owner: AztecAddress) {
        let owner_balance = storage.balances.at(owner);

        let options = NoteGetterOptions::new();
        let notes = owner_balance.get_notes(options);

        assert(notes.len() == 0);
    }

    // Test pending note hashes with note insertion done in a nested call
    // and "read" / get of that pending note hash in another nested call
    // Realistic way to describe this test is "Mint note A, then burn note A in the same transaction"
    #[private]
    fn test_insert_then_get_then_nullify_all_in_nested_calls(
        amount: Field,
        owner: AztecAddress,
        sender: AztecAddress,
        insert_fn_selector: FunctionSelector,
        get_then_nullify_fn_selector: FunctionSelector,
    ) {
        // nested call to create/insert note
        let _res = context.call_private_function(
            inputs.call_context.contract_address,
            insert_fn_selector,
            [amount, owner.to_field(), sender.to_field()],
        );
        // nested call to read and nullify that note
        let _res = context.call_private_function(
            inputs.call_context.contract_address,
            get_then_nullify_fn_selector,
            [amount, owner.to_field()],
        );
    }

    // same test as above, but insert 2, get 2, nullify 2
    #[private]
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
        let _callStackItem1 = context.call_private_function(
            inputs.call_context.contract_address,
            insert_fn_selector,
            insertArgs,
        );
        let _callStackItem2 = context.call_private_function(
            inputs.call_context.contract_address,
            insert_fn_selector,
            insertArgs,
        );
        // nested call to read and nullify that note
        let _callStackItem3 = context.call_private_function(
            inputs.call_context.contract_address,
            get_then_nullify_fn_selector,
            getNullifyArgs,
        );
        let _callStackItem4 = context.call_private_function(
            inputs.call_context.contract_address,
            get_then_nullify_fn_selector,
            getNullifyArgs,
        );
        // nested call to confirm that balance is zero
        // TODO(dbanks12): once > 4 nested calls is supported, can confirm 0 balance:
        //let _callStackItem5 = context.call_private_function(inputs.call_context.contract_address, get_note_zero_fn_selector, [owner]);
    }

    // same test as above, but insert 2, get 1, nullify 1
    #[private]
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
        let _callStackItem1 = context.call_private_function(
            inputs.call_context.contract_address,
            insert_fn_selector,
            insertArgs,
        );
        let _callStackItem2 = context.call_private_function(
            inputs.call_context.contract_address,
            insert_fn_selector,
            insertArgs,
        );
        // nested call to read and nullify that note
        let _callStackItem3 = context.call_private_function(
            inputs.call_context.contract_address,
            get_then_nullify_fn_selector,
            getNullifyArgs,
        );
    }

    // insert 1 note, then get 2 notes (one pending, one persistent) and nullify both.
    // one nullifier will be squashed with the pending note, one will become persistent.
    // ONLY WORKS IF THERE IS A PERSISTENT NOTE TO GET
    #[private]
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
        let _callStackItem1 = context.call_private_function(
            inputs.call_context.contract_address,
            insert_fn_selector,
            insertArgs,
        );
        // nested call to read and nullify that note
        let _callStackItem2 = context.call_private_function(
            inputs.call_context.contract_address,
            get_then_nullify_fn_selector,
            getNullifyArgs,
        );
        let _callStackItem3 = context.call_private_function(
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
    // #[private]
    // fn test_bad_get_in_nested_call_then_insert(
    //    amount: Field,
    //    owner: AztecAddress,
    //    get_then_nullify_fn_selector: FunctionSelector,
    //) {
    //}

    #[private]
    fn test_recursively_create_notes(
        owner: AztecAddress,
        sender: AztecAddress,
        how_many_recursions: u64,
    ) {
        create_max_notes(owner, sender, storage, &mut context);

        PendingNoteHashes::at(context.this_address())
            .recursively_destroy_and_create_notes(owner, sender, how_many_recursions)
            .call(&mut context);
    }

    #[private]
    fn recursively_destroy_and_create_notes(
        owner: AztecAddress,
        sender: AztecAddress,
        executions_left: u64,
    ) {
        assert(executions_left > 0);

        destroy_max_notes(owner, storage);
        create_max_notes(owner, sender, storage, &mut context);

        let executions_left = executions_left - 1;

        if executions_left > 0 {
            PendingNoteHashes::at(context.this_address())
                .recursively_destroy_and_create_notes(owner, sender, executions_left)
                .call(&mut context);
        }
    }

    // TESTING: Forces the private context to accept a note log for a non-existent note
    // by using an existing note's counter via its header. This is used to check that
    // the pxe rejects the note log later.
    #[private]
    fn test_emit_bad_note_log(owner: AztecAddress, sender: AztecAddress) {
        let owner_balance = storage.balances.at(owner);

        let mut good_note = ValueNote::new(10, owner);
        // Insert good note with real log
        owner_balance.insert(&mut good_note).emit(encode_and_encrypt_note(
            &mut context,
            owner,
            sender,
        ));

        // We will emit a note log with an incorrect preimage to ensure the pxe throws
        // This note has not been inserted...
        let mut bad_note = ValueNote::new(5, owner);
        // ...but we need a 'good' note header to get the context to add the note log
        let existing_note_header = good_note.get_header();
        bad_note.set_header(existing_note_header);

        NoteEmission::new(bad_note).emit(encode_and_encrypt_note(&mut context, owner, sender));
    }

    #[contract_library_method]
    fn create_max_notes(
        owner: AztecAddress,
        sender: AztecAddress,
        storage: Storage<&mut PrivateContext>,
        context: &mut PrivateContext,
    ) {
        let owner_balance = storage.balances.at(owner);

        for i in 0..max_notes_per_call() {
            let mut note = ValueNote::new(i as Field, owner);
            owner_balance.insert(&mut note).emit(encode_and_encrypt_note(context, owner, sender));
        }
    }

    #[contract_library_method]
    fn destroy_max_notes(owner: AztecAddress, storage: Storage<&mut PrivateContext>) {
        let owner_balance = storage.balances.at(owner);
        // Note that we're relying on PXE actually returning the notes, we're not constraining that any specific
        // numer of notes are deleted.
        let _ = owner_balance.pop_notes(NoteGetterOptions::new());
    }

    #[contract_library_method]
    fn max_notes_per_call() -> u32 {
        if MAX_NOTE_HASHES_PER_CALL > MAX_NOTE_HASH_READ_REQUESTS_PER_CALL {
            MAX_NOTE_HASH_READ_REQUESTS_PER_CALL
        } else {
            MAX_NOTE_HASHES_PER_CALL
        }
    }
}
