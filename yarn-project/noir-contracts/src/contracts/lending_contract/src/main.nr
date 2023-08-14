mod storage;

// Single asset CDP contract.
// Shoving re-entries up the ass.
contract Lending {
    use dep::aztec::{
        abi,
        abi::PrivateContextInputs,
        abi::PublicContextInputs
    };
    use dep::aztec::context::{
        PrivateContext,
        PublicContext
    };
    use dep::aztec::oracle::{logs::emit_unencrypted_log};
    use dep::aztec::public_call_stack_item::PublicCallStackItem;
    use crate::storage::{Storage, Asset, Account};

    struct Pos {
        collateral: Field,
        static_debt: Field,
    }

    // Constructs the contract.
    fn constructor(
        inputs: PrivateContextInputs
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel.
        PrivateContext::new(inputs, 0).finish()
    }

    open fn init_asset(
        inputs: PublicContextInputs,
        oracle_address: Field,
        loan_to_value: Field,
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([oracle_address, loan_to_value]));

        let storage = Storage::init();

        let asset = storage.assets.at(0);

        let tot = asset.read();

        assert (loan_to_value as u120 <= 10000);
        assert (tot.last_updated_ts == 0);
        assert (tot.interest_accumulator == 0);

        asset.write(Asset {
            interest_accumulator: 1000000000,
            last_updated_ts: context.timestamp() as u120,
            loan_to_value: loan_to_value as u120,
            oracle_address,
        });

        context.return_values.push(1);
        context.finish()
    }

    open fn update_tot(
        inputs: PublicContextInputs
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([]));
        let storage = Storage::init();

        let asset_loc = storage.assets.at(0);
        let mut asset = asset_loc.read();

        let dt: u120 = context.timestamp() as u120  - asset.last_updated_ts;

        // Need proper interest computation here.
        // Assume constant rate because too few reads :cry:
        let rate: u120 = 100000;
        // Just need something that increases, but :cry:
        let multiplier: u120 = 1000000000 + dt * rate;
        let divisor: u120 = 1000000000;

        asset.interest_accumulator = (asset.interest_accumulator * multiplier) / divisor;
        asset.last_updated_ts = context.timestamp() as u120;

        asset_loc.write(asset);

        context.return_values.push_array(asset.serialise());
        context.finish()        
    }

    // This don't need to be on behalf of self. We should be able to repay on behalf of someone else.
    fn deposit_private(
        inputs: PrivateContextInputs,
        secret: Field,
        owner: Field,
        amount: Field
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context = PrivateContext::new(inputs, abi::hash_args([
            secret,
            owner,
            amount
        ]));

        assert (!((secret == 0) as bool & (owner == 0) as bool));
        let mut account = owner;
        let me = context.msg_sender();

        if (secret != 0) {
            account = Account::new(me, secret).key();
        }

        // Unshield tokens into this contract.

        // _deposit(account, amount)
        let _callStackItem = context.call_public_function(
            context.this_address(), 
            3009041984,
            [account, amount]
        );

        context.finish()
    }

    open fn deposit_public(
        inputs: PublicContextInputs,
        owner: Field,
        amount: Field
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([owner, amount]));
        // @todo @LHerskind Transfer tokens into this contract. We can't do it now because too few writes.
    
        let return_values = context.call_public_function(context.this_address(), 3009041984, [owner, amount]);

        context.return_values.push(return_values[0]);
        context.finish()
    }

    open internal fn _deposit(
        inputs: PublicContextInputs,
        owner: Field,
        amount: Field
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([owner, amount]));

        let _void = context.call_public_function_no_args(context.this_address(), 1259373467)[0];

        let storage = Storage::init();

        let coll_loc = storage.collateral.at(owner);
        let collateral = coll_loc.read();

        coll_loc.write(collateral + amount);

        context.return_values.push(1);
        context.finish()
    }

    fn withdraw_private(
        inputs: PrivateContextInputs,
        secret: Field,
        amount: Field
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context = PrivateContext::new(inputs, abi::hash_args([
            secret,
            amount
        ]));

        let me = context.msg_sender();
        let account = Account::new(me, secret).key();
        let _callStackItem = context.call_public_function(
            context.this_address(), 
            1065861440,
            [account, amount]
        );

        context.finish()
    }


    open fn withdraw_public(
        inputs: PublicContextInputs,
        amount: Field
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([amount]));
        // @todo @LHerskind Transfer tokens into this contract. We can't do it now because too few writes.
    
        let return_values = context.call_public_function(context.this_address(), 1065861440, [context.msg_sender(), amount]);

        context.return_values.push(return_values[0]);
        context.finish()
    }

     open internal fn _withdraw(
        inputs: PublicContextInputs,
        owner: Field,
        // recipient: Field,
        amount: Field
    ) -> pub abi::PublicCircuitPublicInputs {
        // Access control.
        let mut context = PublicContext::new(inputs, abi::hash_args([owner, amount]));

        let _void = context.call_public_function_no_args(context.this_address(), 1259373467)[0];

        // Needs to check stuff similar to `_borrow`.

        let storage = Storage::init();

        let coll_loc = storage.collateral.at(owner);
        let collateral: Field = coll_loc.read();

        let debt_loc = storage.static_debt.at(owner);
        let static_debt: Field = debt_loc.read();

        assert (collateral as u120 >= amount as u120);
        assert (collateral as u120 - amount as u120 >= static_debt as u120);

        coll_loc.write(collateral - amount);

        // Transfer tokens to recipient (could be with shielding or without, for now, can't to either).
        context.return_values.push(1);
        context.finish()
    }

    fn borrow_private(
        inputs: PrivateContextInputs,
        secret: Field,
        amount: Field
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context = PrivateContext::new(inputs, abi::hash_args([
            secret,
            amount
        ]));

        let me = context.msg_sender();
        let account = Account::new(me, secret).key();

        let _callStackItem = context.call_public_function(
            context.this_address(), 
            1462609836,
            [account, amount]
        );

        context.finish()
    }

    open fn borrow_public(
        inputs: PublicContextInputs,
        amount: Field
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([amount]));
        let return_values = context.call_public_function(context.this_address(), 1462609836, [context.msg_sender(), amount]);

        context.return_values.push(return_values[0]);
        context.finish()
    }

    open internal fn _borrow(
        inputs: PublicContextInputs,
        owner: Field,
        amount: Field
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([owner, amount]));

        // Updating accumulator etc.
        let return_values = context.call_public_function_no_args(context.this_address(), 1259373467);
        let interest_accumulator: u120 = return_values[0] as u120;
        let loan_to_value: u120 = return_values[2] as u120;
        let oracle_address = return_values[3];

        // keccak256("get_price(field)") -> 0xc83a9cd4 -> 3359284436
        let return_values_price = context.call_public_function(oracle_address, 3359284436, [0]);
        let price: u120 = return_values_price[1] as u120;
        
        let storage = Storage::init();

        let collateral: Field = storage.collateral.at(owner).read();
        let debt_loc = storage.static_debt.at(owner);
        let static_debt: Field = debt_loc.read();

        // Using precision 1e9 for interest accumulator and price
        let divisor: u120 = 1000000000;

        // We are assuming that this is a 
        let current_debt: u120 = ((static_debt as u120) * interest_accumulator) / (divisor);
        let total_debt_after = current_debt + (amount as u120);

        let current_collateral: u120 = ((collateral as u120) * price) / (divisor);

        assert (total_debt_after < (current_collateral * loan_to_value) / 10000);

        debt_loc.write(static_debt + amount);

        // @todo @LHerskind Transferring funds to the recipient.

        context.return_values.push(1);
        context.finish()
    }

    // This don't need to be on behalf of self. We should be able to repay on behalf of someone else.
    fn repay_private(
        inputs: PrivateContextInputs,
        secret: Field,
        owner: Field,
        amount: Field
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context = PrivateContext::new(inputs, abi::hash_args([
            secret,
            owner,
            amount
        ]));

        assert (!((secret == 0) as bool & (owner == 0) as bool));
        let mut account = owner;
        let me = context.msg_sender();

        if (secret != 0) {
            account = Account::new(me, secret).key();
        }

        // @todo @lherskind Transfer tokens from me to this contract.

        let _callStackItem = context.call_public_function(
            context.this_address(), 
            3985016136,
            [account, amount]
        );

        context.finish()
    }

    open fn repay_public(
        inputs: PublicContextInputs,
        owner: Field,
        amount: Field
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([owner, amount]));
        // @todo @LHerskind Transfer tokens from msg.sender to this contract.
        let return_values = context.call_public_function(context.this_address(), 3985016136, [owner, amount]);

        context.return_values.push(return_values[0]);
        context.finish()
    }

    open internal fn _repay(
        inputs: PublicContextInputs,
        owner: Field,
        amount: Field
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([owner, amount]));
        let _void = context.call_public_function_no_args(context.this_address(), 1259373467)[0];

        let storage = Storage::init();
        // Should constrain access from private.
        // should only be callable from self from private.

        let debt_loc = storage.static_debt.at(owner);

        // @todo @LHerskind using "as" after using maps key => field have issues.
        // Need to be explicitly specified as field first.
        let static_debt: Field = debt_loc.read();

        assert (static_debt as u120 >= amount as u120);

        debt_loc.write(static_debt - amount);
        
        context.return_values.push(1);
        context.finish()
    }

    unconstrained fn getTot(
        assetId: Field,
    ) -> Asset {
        let storage = Storage::init();
        storage.assets.at(assetId).read()
    }

    unconstrained fn getPosition(
        owner: Field,
    ) -> Pos {
        let storage = Storage::init();
        let collateral = storage.collateral.at(owner).read();
        let static_debt = storage.static_debt.at(owner).read();
        Pos {collateral, static_debt}
    }
}
