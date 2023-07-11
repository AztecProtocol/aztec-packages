mod storage;

contract PendingCommitments {
    // Libs
    use dep::token_utils::{
        balance_utils,
        value_note::{
            value_note::ValueNote,
            filter::get_2_notes,
        }
    };

    use crate::storage::Storage;

    use dep::aztec::abi;
    use dep::aztec::abi::PrivateContextInputs;
    use dep::aztec::context::Context;
    use dep::aztec::note::note_getter::NoteGetterOptions;
    use dep::aztec::note::note_getter_options::Sort;
    use dep::aztec::types::point::Point;
    use dep::aztec::state_vars::map::Map;
    use dep::aztec::state_vars::set::Set;
    use dep::aztec::log::emit_encrypted_log;
    use dep::aztec::log::emit_unencrypted_log;
    use dep::aztec::private_call_stack_item::PrivateCallStackItem;

    fn constructor(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs
        //*********************************/
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let storage = Storage::init();
        //let context = Context::new(inputs, abi::hash_args([]));
        let context = Context::new(inputs, 0);
        context.finish()
    }

    // Test pending commitments by creating / inserting a note and then
    // getting / reading that note all in the same contract function
    fn create_get_and_check_note_inline(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        amount: Field,
        owner: Point,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let storage = Storage::init();
        let mut context = Context::new(inputs, abi::hash_args([amount, owner.x, owner.y]));

        let owner_balance = storage.balances.at(owner.x);
        let note = ValueNote::new(amount, owner);

        // Insert note and emit encrypted note preimage via oracle call
        context = owner_balance.insert(context, note);

        // Hack: we add the return value from `notifyCreatedNote` oracle call
        // to the sort option to `getNotes` oracle call to force a dependency
        // and therefore ordering between these two oracles
        // TODO(dbanks12): remove when stepwise execution of acir is complete
        // https://github.com/noir-lang/noir/pull/1729
        // replace with `let options = NoteGetterOptions::with_filter(get_2_notes, 0);`
        let nada = Sort::nada();
        let sorting: [Sort; 6] = [Sort::new(0, context.oracle_connector as u8), nada, nada, nada, nada, nada];
        let options = NoteGetterOptions::new(get_2_notes, 0, sorting , 0);

        let (context_tmp, got_notes) = owner_balance.get_notes(context, options);
        context = context_tmp;

        assert(note.value == got_notes[0].value);
        assert(!got_notes[1].is_real);

        context.return_values = context.return_values.push(got_notes[0].value);

        context.finish()
    }

    // Create and insert a note
    fn create_note(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        amount: Field,
        owner: Point,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let storage = Storage::init();
        let mut context = Context::new(inputs, abi::hash_args([amount, owner.x, owner.y]));

        let owner_balance = storage.balances.at(owner.x);
        let note = ValueNote::new(amount, owner);

        // Insert note and emit encrypted note preimage via oracle call
        context = owner_balance.insert(context, note);

        context.finish()
    }

    // Get a note and confirm it has expected value
    fn get_and_check_note(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        expected_value: Field,
        owner: Point,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let storage = Storage::init();
        let mut context = Context::new(inputs, abi::hash_args([expected_value, owner.x, owner.y]));

        let owner_balance = storage.balances.at(owner.x);

        // Hack: we add the return value from `notifyCreatedNote` oracle call
        // to the sort option to `getNotes` oracle call to force a dependency
        // and therefore ordering between these two oracles
        // TODO(dbanks12): remove when stepwise execution of acir is complete
        // https://github.com/noir-lang/noir/pull/1729
        // replace with `let options = NoteGetterOptions::with_filter(get_2_notes, 0);`
        let nada = Sort::nada();
        let sorting: [Sort; 6] = [Sort::new(0, context.oracle_connector as u8), nada, nada, nada, nada, nada];
        let options = NoteGetterOptions::new(get_2_notes, 0, sorting , 0);

        let (context_tmp, got_notes) = owner_balance.get_notes(context, options);
        context = context_tmp;

        assert(expected_value == got_notes[0].value);
        assert(!got_notes[1].is_real);

        context.return_values = context.return_values.push(got_notes[0].value);

        context.finish()
    }

    // Test pending commitments with note insertion done in a nested call
    // and "read" / get of that pending note/commitment in another nested call
    fn create_get_and_check_note_in_nested_calls(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        amount: Field,
        owner: Point,
        createFnSelector: Field,
        getAndCheckFnSelector: Field,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context = Context::new(inputs, abi::hash_args([amount, owner.x, owner.y, createFnSelector, getAndCheckFnSelector]));

        // args for nested calls
        let mut args = [0; abi::MAX_ARGS];
        args[0] = amount;
        args[1] = owner.x;
        args[2] = owner.y;

        // nested call to create/insert note
        let (_callStackItem1, mut context_tmp0) = PrivateCallStackItem::call(inputs.call_context.storage_contract_address, createFnSelector, args, context);
        context = context_tmp0;
        // nested call to read that note / pending commitment
        let (_callStackItem2, mut context_tmp1) = PrivateCallStackItem::call(inputs.call_context.storage_contract_address, getAndCheckFnSelector, args, context);
        context = context_tmp1;

        context.finish()
    }

    // TODO(dbanks12): tests different combinatiions of nested/parent calls
    // to create and get_and_check to flex private kernel constraints
}