contract PendingCommitments {
    use dep::aztec3::abi;
    use dep::aztec3::abi::PrivateContextInputs;
    use dep::aztec3::context::PrivateFunctionContext;
    use dep::aztec3::notes::value_note::Note;
    use dep::aztec3::private_call_stack_item::PrivateCallStackItem;
    use dep::aztec3::types::point::Point;
    use dep::aztec3::state_vars::map::Map;
    use dep::aztec3::state_vars::set::Set;

    global balances = Map { storage_slot: 1 };

    fn constructor(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs
        //*********************************/
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let context = PrivateFunctionContext::new();
        context.finish(inputs)
    }

    /// test pending commitments by creating / inserting a note
    /// and then getting / reading that note all in the same
    /// contract function
    fn create_get_and_check_note_inline(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        amount: Field,
        owner: Point,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context = PrivateFunctionContext::new();
        context.args = context.args.push_array([amount, owner.x, owner.y]);

        let owner_balance = balances.at(owner.x);
        let note = Note::new(amount, owner);

        // Insert note and emit encrypted note preimage via oracle call
        context = owner_balance.insert(context, note);

        let (context_tmp, (gotNote1, gotNote2)) = owner_balance.get_2(context);
        context = context_tmp;

        assert(note.eq(gotNote1));
        assert(!gotNote2.is_real);

        context.return_values = context.return_values.push(gotNote1.value);

        context.finish(inputs)
    }

    /// Create and insert a note
    fn create_note(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        amount: Field,
        owner: Point,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context = PrivateFunctionContext::new();
        context.args = context.args.push_array([amount, owner.x, owner.y]);

        let owner_balance = balances.at(owner.x);
        let note = Note::new(amount, owner);

        // Insert note and emit encrypted note preimage via oracle call
        context = owner_balance.insert(context, note);

        context.finish(inputs)
    }

    /// Get a note and confirm it has expected value
    fn get_and_check_note(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        expected_value: Field,
        owner: Point,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context = PrivateFunctionContext::new();
        context.args = context.args.push_array([owner.x, owner.y]);

        let owner_balance = balances.at(owner.x);

        let (context_tmp, (gotNote1, gotNote2)) = owner_balance.get_2(context);
        context = context_tmp;
        assert(expected_value == gotNote1.value);
        assert(!gotNote2.is_real);

        context.return_values = context.return_values.push(gotNote1.value);

        context.finish(inputs)
    }

    /// Test pending commitments with note insertion done in a nested call
    /// and "read" / get of that pending note/commitment in another nested call
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
        let mut context = PrivateFunctionContext::new();
        context.args = context.args.push_array([amount, owner.x, owner.y]);

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

        context.finish(inputs)
    }

    // TODO(dbanks12): tests different combinatiions of nested/parent calls
    // to create and get_and_check to flex private kernel constraints
}