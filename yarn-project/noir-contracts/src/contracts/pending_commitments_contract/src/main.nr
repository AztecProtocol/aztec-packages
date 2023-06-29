contract PendingCommitments {
    use dep::aztec3::oracle::debug_log::debug_log;
    use dep::aztec3::oracle::debug_log::debug_log_format;
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

    // test mint and get bal both all inline in one call
    fn create_get_and_check_note_inline(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        amount: Field,
        owner: Point,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context0 = PrivateFunctionContext::new();
        context0.args = context0.args.push_array([amount, owner.x, owner.y]);

        let owner_balance = balances.at(owner.x);
        let note = Note::new(amount, owner);

        // Insert note and emit encrypted note preimage via oracle call
        debug_log("NOIR inline before insert");
        context0 = owner_balance.insert(context0, note);
        debug_log("NOIR inline before get_2");

        let (mut context1, (gotNote1, gotNote2)) = owner_balance.get_2(context0);
        debug_log("NOIR inline after get_2");

        debug_log_format("note value: {0}, gotNote1 value: {1}", [note.value, gotNote1.value]);
        debug_log_format("gotNote1.is_real: {0}", [gotNote1.is_real as Field]);

        assert(note.eq(gotNote1));
        debug_log("NOIR inline after assert got pending note");
        assert(!gotNote2.is_real);
        debug_log("NOIR inline after assert note2 fake");

        // TODO remove, just seeing if returning counter forces oracle ordering
        context1.return_values = context1.return_values.push(context1.sideeffect_counter);

        context1.finish(inputs)
    }

    fn create_note(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        amount: Field,
        owner: Point,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        debug_log("NOIR create");
        let mut context = PrivateFunctionContext::new();
        context.args = context.args.push_array([amount, owner.x, owner.y]);

        let owner_balance = balances.at(owner.x);
        let note = Note::new(amount, owner);

        // Insert note and emit encrypted note preimage via oracle call
        context = owner_balance.insert(context, note);

        context.finish(inputs)
    }

    fn get_and_check_note(
        //*********************************/
        // Should eventually be hidden:
        inputs: PrivateContextInputs,
        //*********************************/
        expected_value: Field,
        owner: Point,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        debug_log("NOIR get and check");
        let mut context0 = PrivateFunctionContext::new();
        context0.args = context0.args.push_array([owner.x, owner.y]);

        let owner_balance = balances.at(owner.x);

        let (mut context1, (gotNote1, gotNote2)) = owner_balance.get_2(context0);
        assert(expected_value == gotNote1.value);
        assert(!gotNote2.is_real);

        context1.finish(inputs)
    }

    // test mint and get bal both in child calls
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
        debug_log("NOIR nested");
        let mut context0 = PrivateFunctionContext::new();
        context0.args = context0.args.push_array([amount, owner.x, owner.y]);

        let mut args = [0; abi::MAX_ARGS];
        args[0] = amount;
        args[1] = owner.x;
        args[2] = owner.y;
        let (_callStackItem1, mut context1) = PrivateCallStackItem::call(inputs.call_context.storage_contract_address, createFnSelector, args, context0);

        let (_callStackItem2, mut context2) = PrivateCallStackItem::call(inputs.call_context.storage_contract_address, getAndCheckFnSelector, args, context1);

        context2.finish(inputs)
    }

    // TODO test mint in parent and then get bal in child call
    // TODO test mint in child call and then get bal in parent
}