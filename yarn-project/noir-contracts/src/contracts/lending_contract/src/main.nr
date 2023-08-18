mod storage;
mod safe_math;
mod interest_math;
mod helpers;

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

        // collateral_asset.unshield(amount, asset_owner, this);
        let _callStackItem1 = context.call_private_function(collateral_asset, 2423803924, 
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

        let _transfer_return_values = context.call_public_function(collateral_asset, 1602017294, [context.msg_sender(), context.this_address(), amount]);

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

        // update_tot()
        let _void = context.call_public_function_no_args(context.this_address(), 1259373467)[0];

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

        // update_tot();
        let return_values = context.call_public_function_no_args(context.this_address(), 1259373467);
        let interest_accumulator = return_values[0] as u120;
        let loan_to_value = return_values[2] as u120;
        let oracle_address = return_values[3];

        // Fetch prices from oracle. Needs to be a static call.
        // keccak256("get_price(field)") -> 0xc83a9cd4 -> 3359284436
        let return_values_price = context.call_public_function(oracle_address, 3359284436, [0]);
        let price = return_values_price[0] as u120;
        
        let storage = Storage::init();

        let coll_loc = storage.collateral.at(owner);
        let collateral: Field = coll_loc.read();

        let debt_loc = storage.static_debt.at(owner);
        let static_debt: Field = debt_loc.read();

        // debt_covered will revert if decrease would leave insufficient collateral to cover debt.
        // or trying to remove more collateral than available
        let debt_covered = covered_by_collateral(price, loan_to_value, collateral as u120, 0, amount as u120);
        let debt_returns = debt_updates(interest_accumulator, static_debt as u120, 0, 0);

        // Ensure that debt is covered by collateral
        assert (debt_returns.debt_value < debt_covered);

        coll_loc.write(collateral - amount);

        // @todo @LHerskind Support both shielding and transfers (for now just transfer)
        let collateral_asset = storage.collateral_asset.read();
        let _transfer_return_values = context.call_public_function(collateral_asset, 1012824788, [recipient, amount]);

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
        // keccak256("update_tot()") -> 0x4b10839b -> 1259373467
        let return_values = context.call_public_function_no_args(context.this_address(), 1259373467);
        let interest_accumulator = return_values[0] as u120;
        let loan_to_value = return_values[2] as u120;
        let oracle_address = return_values[3];

        // Fetch prices from oracle. Needs to be a static call.
        // keccak256("get_price(field)") -> 0xc83a9cd4 -> 3359284436
        let return_values_price = context.call_public_function(oracle_address, 3359284436, [0]);
        let price: u120 = return_values_price[0] as u120;
        
        let storage = Storage::init();

        // Fetch collateral and static_debt, compute health of current position
        let collateral = storage.collateral.at(owner).read() as u120;
        let static_debt = storage.static_debt.at(owner).read() as u120;

        let debt_covered = covered_by_collateral(price, loan_to_value, collateral, 0, 0);
        let debt_returns = debt_updates(interest_accumulator, static_debt, amount as u120, 0);

        // Ensure that debt is covered by collateral
        assert (debt_returns.debt_value < debt_covered);

        // static_debt[owner] = debt_returns.static_debt;
        storage.static_debt.at(owner).write(debt_returns.static_debt as Field);

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
        // todo: need an explicit case to repay all debt.
        let mut context = PublicContext::new(inputs, abi::hash_args([owner, amount]));

        // Updating accumulator etc.
        // keccak256("update_tot()") -> 0x4b10839b -> 1259373467
        let return_values = context.call_public_function_no_args(context.this_address(), 1259373467);
        let interest_accumulator = return_values[0] as u120;

        let storage = Storage::init();
        // Should constrain access from private.
        // should only be callable from self from private.

        let static_debt = storage.static_debt.at(owner).read() as u120;
        let debt_returns = debt_updates(interest_accumulator, static_debt, 0, amount as u120);

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
