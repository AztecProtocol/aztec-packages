mod storage;

// Single asset lending contract. Just for show.
contract Lending {
    use dep::aztec::{
        abi,
        abi::{
            PrivateContextInputs,
            PublicContextInputs,
            Hasher
        }
    };
    use dep::aztec::context::{
        PrivateContext,
        PublicContext
    };
    use dep::aztec::oracle::{
        logs::emit_unencrypted_log,
        create_nullifier::create_nullifier,
    };
    use dep::aztec::public_call_stack_item::PublicCallStackItem;
    use crate::storage::{Storage, Tot, Account};

    struct Pos {
        collateral: Field,
        static_debt: Field,
    }

    // Constructs the contract.
    #[aztec(private)]
    fn constructor(
    ) {}

    #[aztec(public)]
    open fn init() {
        let storage = Storage::init();

        let asset = storage.assets.at(0);

        let tot = asset.read();

        assert (tot.last_updated_ts == 0);
        assert (tot.interest_accumulator == 0);

        asset.write(Tot {
            interest_accumulator: 1000000000,
            last_updated_ts: context.timestamp() as u120,
        });

        context.return_values.push(1);
    }

    // Create a position.

    #[aztec(public)]
    open fn update_tot() {
        let storage = Storage::init();

        let asset = storage.assets.at(0);
        let mut tot = asset.read();

        let dt: u120 = context.timestamp() as u120  - tot.last_updated_ts;

        // Need proper interest computation here.
        // Assume constant rate because too few reads :cry:
        let rate: u120 = 100000;
        // Just need something that increases, but :cry:
        let multiplier: u120 = 1000000000 + dt * rate;
        let divisor: u120 = 1000000000;

        tot.interest_accumulator = (tot.interest_accumulator * multiplier) / divisor;
        tot.last_updated_ts = context.timestamp() as u120;

        asset.write(tot);

        context.return_values.push(1);
    }

    // This don't need to be on behalf of self. We should be able to repay on behalf of someone else.
    #[aztec(private)]
    fn deposit_private(
        secret: Field,
        owner: Field,
        amount: Field
    ) {
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
    }

    #[aztec(public)]
    open fn deposit_public(
        owner: Field,
        amount: Field
    ) {
        // @todo @LHerskind Transfer tokens into this contract. We can't do it now because too few writes.
    
        let return_values = context.call_public_function(context.this_address(), 3009041984, [owner, amount]);

        context.return_values.push(return_values[0]);
    }

    #[aztec(public)]
    open internal fn _deposit(
        owner: Field,
        amount: Field
    ) {
        let _void = context.call_public_function_no_args(context.this_address(), 1259373467)[0];

        let storage = Storage::init();

        let coll_loc = storage.collateral.at(owner);
        let collateral = coll_loc.read();

        coll_loc.write(collateral + amount);

        context.return_values.push(1);
    }

    #[aztec(private)]
    fn withdraw_private(
        secret: Field,
        amount: Field
    ) {
        let me = context.msg_sender();
        let account = Account::new(me, secret).key();
        let _callStackItem = context.call_public_function(
            context.this_address(), 
            1065861440,
            [account, amount]
        );
    }


    #[aztec(public)]
    open fn withdraw_public(
        amount: Field
    ) {
        // @todo @LHerskind Transfer tokens into this contract. We can't do it now because too few writes.
    
        let return_values = context.call_public_function(context.this_address(), 1065861440, [context.msg_sender(), amount]);

        context.return_values.push(return_values[0]);
    }

    #[aztec(public)]
     open internal fn _withdraw(
        owner: Field,
        // recipient: Field,
        amount: Field
    ) {
        let _void = context.call_public_function_no_args(context.this_address(), 1259373467)[0];

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
    }

    #[aztec(private)]
    fn borrow_private(
        secret: Field,
        amount: Field
    ) {
        let me = context.msg_sender();
        let account = Account::new(me, secret).key();

        let _callStackItem = context.call_public_function(
            context.this_address(), 
            1462609836,
            [account, amount]
        );
    }

    #[aztec(public)]
    open fn borrow_public(
        amount: Field
    ) {
        let return_values = context.call_public_function(context.this_address(), 1462609836, [context.msg_sender(), amount]);

        context.return_values.push(return_values[0]);
    }

    #[aztec(public)]
    open internal fn _borrow(
        owner: Field,
        amount: Field
    ) {
        // Access control.
        let _void = context.call_public_function_no_args(context.this_address(), 1259373467)[0];

        let storage = Storage::init();

        let coll_loc = storage.collateral.at(owner);
        let collateral: Field = coll_loc.read();

        let debt_loc = storage.static_debt.at(owner);
        let static_debt: Field = debt_loc.read();

        assert (static_debt as u120 + amount as u120 < collateral as u120);

        debt_loc.write(static_debt + amount);

        // @todo @LHerskind Transferring funds to the recipient.

        context.return_values.push(1);
    }

    // This doesn't need to be on behalf of self. We should be able to repay on behalf of someone else.
    #[aztec(private)]
    fn repay_private(
        secret: Field,
        owner: Field,
        amount: Field
    ) {
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
    }

    #[aztec(public)]
    open fn repay_public(
        owner: Field,
        amount: Field
    ) {
        // @todo @LHerskind Transfer tokens from msg.sender to this contract.
        let return_values = context.call_public_function(context.this_address(), 3985016136, [owner, amount]);

        context.return_values.push(return_values[0]);
    }

    #[aztec(public)]
    open internal fn _repay(
        owner: Field,
        amount: Field
    ) {
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
    }

    unconstrained fn getTot(
        assetId: Field,
    ) -> Tot {
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
