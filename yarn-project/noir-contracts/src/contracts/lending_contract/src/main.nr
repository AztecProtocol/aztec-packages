mod storage;
mod safe_math;
mod interest_math;
mod helpers;
mod interfaces;

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
    use crate::safe_math::SafeU120;
    use crate::interest_math::compute_multiplier;
    use crate::helpers::{covered_by_collateral, DebtReturn, debt_updates, debt_value};
    use crate::interfaces::{Token, Lending, PriceFeed};

    struct Pos {
        collateral: Field,
        static_debt: Field,
        debt: Field,
    }

    // Constructs the contract.
    fn constructor(
        inputs: PrivateContextInputs
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel.
        PrivateContext::new(inputs, 0).finish()
    }

    open fn init(
        inputs: PublicContextInputs,
        oracle_address: Field,
        loan_to_value: Field,
        collateral_asset: Field,
        stable_coin: Field,
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([oracle_address, loan_to_value, collateral_asset, stable_coin]));
        let storage = Storage::init();
        let asset_loc = storage.assets.at(0);
        let asset = asset_loc.read();

        assert (loan_to_value as u120 <= 10000);
        assert (asset.last_updated_ts == 0);
        assert (asset.interest_accumulator == 0);

        asset_loc.write(Asset {
            interest_accumulator: 1000000000,
            last_updated_ts: context.timestamp() as u120,
            loan_to_value: loan_to_value as u120,
            oracle_address,
        });

        storage.collateral_asset.write(collateral_asset);
        storage.stable_coin.write(stable_coin);

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

        let dt: SafeU120 = SafeU120{value: context.timestamp() as u120}.sub(SafeU120{value: asset.last_updated_ts});

        // Only update if time has passed.
        if (!dt.is_zero()) {
            let precision: SafeU120 = SafeU120{value: 1000000000};
            let rate_per_second: u120 = 1268391679; // 4% yearly rate / (60 * 60 * 24 * 365)
            // if rate_per_second < sqrt(WAD) our approx is eq precision + rate * dt
            let multiplier = compute_multiplier(rate_per_second, dt);

            // accumulator *= multiplier, and multiplier >= 1
            asset.interest_accumulator = SafeU120{value: asset.interest_accumulator}.mul_div(multiplier, precision).value;
            asset.last_updated_ts = context.timestamp() as u120;

            asset_loc.write(asset);
        }

        context.return_values.push_array(asset.serialise());
        context.finish()        
    }

    // This don't need to be on behalf of self. We should be able to repay on behalf of someone else.
    fn deposit_private(
        inputs: PrivateContextInputs,
        secret: Field,
        asset_owner: Field,
        on_behalf_of: Field,
        amount: Field,
        collateral_asset: Field,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context = PrivateContext::new(inputs, abi::hash_args([
            secret,
            asset_owner,
            on_behalf_of,
            amount,
            collateral_asset,
        ]));

        assert (!((secret == 0) as bool & (on_behalf_of == 0) as bool));
        let mut account = on_behalf_of;

        if (secret != 0) {
            account = Account::new(context.msg_sender(), secret).key();
        }

        //let _res = Token::at(collateral_asset).unshield(&mut context, asset_owner, context.this_address(), amount);
        let _res = context.call_private_function(
            collateral_asset,
            2423803924, 
            [amount, asset_owner, context.this_address()]
        );

        // _deposit(account, amount, collateral_asset)
        let _callStackItem2 = context.call_public_function(
            context.this_address(), 
            139488848,
            [account, amount, collateral_asset]
        );

        context.finish()
    }

    open fn deposit_public(
        inputs: PublicContextInputs,
        owner: Field,
        amount: Field,
        collateral_asset: Field,
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([owner, amount, collateral_asset]));

        // If calling this with a mutating context. The following call will not execute as planned.
        // Token::at(collateral_asset).transfer_from_pub(context, context.msg_sender(), context.this_address(), amount);
        let _transfer_return_values = context.call_public_function(
            collateral_asset, 
            1602017294, 
            [context.msg_sender(), context.this_address(), amount]
        );

        let return_values = context.call_public_function(context.this_address(), 139488848, [owner, amount, collateral_asset]);

        context.return_values.push(return_values[0]);
        context.finish()
    }

    // uint256(keccak256("_deposit(field,field,field)")) >> 224 -> 139488848
    open internal fn _deposit(
        inputs: PublicContextInputs,
        owner: Field,
        amount: Field,
        collateral_asset: Field,
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([owner, amount, collateral_asset]));
        let _asset = Lending::at(context.this_address()).update_accumulator(context);

        let storage = Storage::init();

        let coll_asset = storage.collateral_asset.read();
        assert(coll_asset == collateral_asset);

        let coll_loc = storage.collateral.at(owner);
        let collateral = coll_loc.read();
        coll_loc.write(collateral + amount);

        context.return_values.push(1);
        context.finish()
    }

    fn withdraw_private(
        inputs: PrivateContextInputs,
        secret: Field,
        to: Field,
        amount: Field
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context = PrivateContext::new(inputs, abi::hash_args([
            secret,
            to,
            amount
        ]));

        let me = context.msg_sender();
        let account = Account::new(me, secret).key();
        let _callStackItem = context.call_public_function(
            context.this_address(), 
            1526134324,
            [account, to, amount]
        );

        context.finish()
    }

    open fn withdraw_public(
        inputs: PublicContextInputs,
        to: Field,
        amount: Field,
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([to, amount]));

        // _withdraw(msg.sender, to, amount);
        let return_values = context.call_public_function(context.this_address(), 1526134324, [context.msg_sender(), to, amount]);

        context.return_values.push(return_values[0]);
        context.finish()
    }

    // uint256(keccak256("_withdraw(field,field,field)")) >> 224 -> 1526134324
    open internal fn _withdraw(
        inputs: PublicContextInputs,
        owner: Field,
        recipient: Field,
        amount: Field
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([owner, recipient, amount]));
        let asset = Lending::at(context.this_address()).update_accumulator(context);
        let price = PriceFeed::at(asset.oracle_address).get_price(context);
        
        let storage = Storage::init();

        let coll_loc = storage.collateral.at(owner);
        let collateral: Field = coll_loc.read();

        let debt_loc = storage.static_debt.at(owner);
        let static_debt: Field = debt_loc.read();

        // debt_covered will revert if decrease would leave insufficient collateral to cover debt.
        // or trying to remove more collateral than available
        let debt_covered = covered_by_collateral(price, asset.loan_to_value, collateral as u120, 0, amount as u120);
        let debt_returns = debt_updates(asset.interest_accumulator, static_debt as u120, 0, 0);

        // Ensure that debt is covered by collateral
        assert (debt_returns.debt_value < debt_covered);

        coll_loc.write(collateral - amount);

        // @todo @LHerskind Support both shielding and transfers (for now just transfer)
        let collateral_asset = storage.collateral_asset.read();
        Token::at(collateral_asset).transfer_pub(context, recipient, amount);
        // let _transfer_return_values = context.call_public_function(
        //    collateral_asset,
        //    1012824788, 
        //    [recipient, amount]
        //);

        context.return_values.push(1);
        context.finish()
    }

    fn borrow_private(
        inputs: PrivateContextInputs,
        secret: Field,
        to: Field,
        amount: Field
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        let mut context = PrivateContext::new(inputs, abi::hash_args([
            secret,
            to,
            amount
        ]));

        let me = context.msg_sender();
        let account = Account::new(me, secret).key();

        // _borrow(msg.sender, to, amount)
        let _callStackItem = context.call_public_function(
            context.this_address(), 
            3472859930,
            [account, to, amount]
        );

        context.finish()
    }

    open fn borrow_public(
        inputs: PublicContextInputs,
        to: Field,
        amount: Field
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([to, amount]));
        // _borrow(msg.sender, to, amount)
        let return_values = context.call_public_function(context.this_address(), 3472859930, [context.msg_sender(), to, amount]);

        context.return_values.push(return_values[0]);
        context.finish()
    }

    // uint256(keccak256("_borrow(field,field,field)")) >> 224 -> 3472859930
    open internal fn _borrow(
        inputs: PublicContextInputs,
        owner: Field,
        to: Field,
        amount: Field
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([owner, to, amount]));
        let asset = Lending::at(context.this_address()).update_accumulator(context);
        let price = PriceFeed::at(asset.oracle_address).get_price(context);
        
        let storage = Storage::init();

        // Fetch collateral and static_debt, compute health of current position
        let collateral = storage.collateral.at(owner).read() as u120;
        let static_debt = storage.static_debt.at(owner).read() as u120;

        let debt_covered = covered_by_collateral(price, asset.loan_to_value, collateral, 0, 0);
        let debt_returns = debt_updates(asset.interest_accumulator, static_debt, amount as u120, 0);

        // Ensure that debt is covered by collateral
        assert (debt_returns.debt_value < debt_covered);

        // static_debt[owner] = debt_returns.static_debt;
        storage.static_debt.at(owner).write(debt_returns.static_debt as Field);

        // @todo @LHerskind Need to support both private and public minting.
        let stable_coin = storage.stable_coin.read();
        Token::at(stable_coin).owner_mint_pub(context, to, amount);
        // let _transfer_return_values = context.call_public_function(
        //    stable_coin, 
        //    1071038680, 
        //    [to, amount]
        //);

        context.return_values.push(1);
        context.finish()
    }

    // This don't need to be on behalf of self. We should be able to repay on behalf of someone else.
    fn repay_private(
        inputs: PrivateContextInputs,
        secret: Field,
        asset_owner: Field,
        on_behalf_of: Field,
        amount: Field,
        stable_coin: Field,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        // Take funds from asset_owner
        // Reduce debt of on_behalf_of

        let mut context = PrivateContext::new(inputs, abi::hash_args([
            secret,
            asset_owner,
            on_behalf_of,
            amount,
            stable_coin,
        ]));

        assert (!((secret == 0) as bool & (on_behalf_of == 0) as bool));
        let mut account = on_behalf_of;
        let me = context.msg_sender();

        if (secret != 0) {
            account = Account::new(me, secret).key();
        }

        // let _res = Token::at(stable_coin).unshield(&mut context, asset_owner, context.this_address(), amount);
        let _res = context.call_private_function(
            stable_coin, 
            2423803924, 
            [amount, asset_owner, context.this_address()]
        );

        let _callStackItem = context.call_public_function(
            context.this_address(), 
            4204047188,
            [account, amount, stable_coin]
        );

        context.finish()
    }

    open fn repay_public(
        inputs: PublicContextInputs,
        owner: Field,
        amount: Field,
        stable_coin: Field,
    ) -> pub abi::PublicCircuitPublicInputs {
        let mut context = PublicContext::new(inputs, abi::hash_args([owner, amount]));

        // Should probably just burn the tokens actually :thinking:
        Token::at(stable_coin).transfer_from_pub(context, context.msg_sender(), context.this_address(), amount);
        // let _transfer_return_values = context.call_public_function(
        //    stable_coin, 
        //    1602017294, 
        //    [context.msg_sender(), context.this_address(), amount]
        //);

        let return_values = context.call_public_function(context.this_address(), 4204047188, [owner, amount, stable_coin]);

        context.return_values.push(return_values[0]);
        context.finish()
    }

    // uint256(keccak256("_repay(field,field,field)")) >> 224 -> 4204047188
    open internal fn _repay(
        inputs: PublicContextInputs,
        owner: Field,
        amount: Field,
        stable_coin: Field,
    ) -> pub abi::PublicCircuitPublicInputs {
        // todo: need an explicit case to repay all debt.
        let mut context = PublicContext::new(inputs, abi::hash_args([owner, amount, stable_coin]));

        let asset = Lending::at(context.this_address()).update_accumulator(context);

        let storage = Storage::init();

        // To ensure that private is using the correct token.
        assert(stable_coin == storage.stable_coin.read());

        let static_debt = storage.static_debt.at(owner).read() as u120;
        let debt_returns = debt_updates(asset.interest_accumulator, static_debt, 0, amount as u120);

        // static_debt[owner] = debt_returns.static_debt;
        storage.static_debt.at(owner).write(debt_returns.static_debt as Field);
        
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
        let asset = storage.assets.at(0).read();
        let debt = debt_value(static_debt as u120, asset.interest_accumulator as u120) as Field;
        Pos {collateral, static_debt, debt}
    }

    unconstrained fn get_assets() -> [Field; 2] {
        let storage = Storage::init();
        [storage.collateral_asset.read(), storage.stable_coin.read()]
    }
}
