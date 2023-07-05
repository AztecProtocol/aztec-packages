mod storage;

contract Yolo {
    use dep::aztec::{
        abi,
        abi::PrivateContextInputs,
        abi::PublicContextInputs
    };
    use dep::aztec::context::Context;
    use dep::aztec::oracle::{
        logs::emit_unencrypted_log,
        public_call,
        create_nullifier::create_nullifier
    };
    use crate::storage::{Storage, Tot};


    // Constructs the contract.
    fn constructor(
        inputs: PrivateContextInputs,
    ) -> distinct pub abi::PrivateCircuitPublicInputs {
        // Return private circuit public inputs. All private functions need to return this as it is part of the input of the private kernel.
        Context::new().finish(inputs)
    }

    open fn init(
        inputs: PublicContextInputs,
        _padding: [Field; abi::MAX_ARGS]
    ) -> Field {
        let storage = Storage::init();

        let asset = storage.assets.at(0);

        let tot = asset.read();

        assert (tot.last_updated_ts == 0);
        assert (tot.interest_accumulator == 0);

        asset.write(Tot {
            interest_accumulator: 1000000000000000000000000000,
            last_updated_ts: inputs.public_global_variables.timestamp,
        });

        1
    }

    // Create a position.

    open fn update_tot(
        inputs: PublicContextInputs,
        _padding: [Field; abi::MAX_ARGS]
    ) -> pub Field {
        let storage = Storage::init();

        let asset = storage.assets.at(0);
        let mut tot = asset.read();

        let dt = inputs.public_global_variables.timestamp - tot.last_updated_ts;

        // Need proper interest computation here.
        // Assume constant rate because too few reads :cry:
        let rate = 10000000000000000000000;
        let multiplier = 1000000000000000000000000000 + dt * rate;
        let divisor = 1000000000000000000000000000;

        tot.interest_accumulator = tot.interest_accumulator * multiplier / divisor;
        tot.last_updated_ts = inputs.public_global_variables.timestamp;

        asset.write(tot);

        1
    }

    open fn deposit(
        inputs: PublicContextInputs,
        owner: Field,
        amount: Field,
        _padding: [Field; abi::MAX_ARGS - 2]
    ) -> Field {
        let mut args = [0; abi::MAX_ARGS];
        let me = inputs.call_context.storage_contract_address;
        let targetSelector = 1259373467;
        let _void = public_call::call_public_function(me, targetSelector, args)[0];

        let storage = Storage::init();
        // @todo @lherskind Update meaningfully instead.

        let coll_loc = storage.collateral.at(owner);
        let collateral = coll_loc.read();

        coll_loc.write(collateral + amount);
        1
    }

     open fn withdraw(
        inputs: PublicContextInputs,
        owner: Field,
        amount: Field,
        _padding: [Field; abi::MAX_ARGS - 2]
    ) -> Field {
        // Access control.

        let mut args = [0; abi::MAX_ARGS];
        let me = inputs.call_context.storage_contract_address;
        let targetSelector = 1259373467;
        let _void = public_call::call_public_function(me, targetSelector, args)[0];

        let storage = Storage::init();

        let coll_loc = storage.collateral.at(owner);
        let collateral: Field = coll_loc.read();

        let debt_loc = storage.static_debt.at(owner);
        let static_debt: Field = debt_loc.read();

        assert (collateral as u120 >= amount as u120);
        assert (collateral as u120 - amount as u120 >= static_debt as u120);

        coll_loc.write(collateral - amount);
        1
    }

    open fn borrow(
        inputs: PublicContextInputs,
        owner: Field,
        amount: Field,
        _padding: [Field; abi::MAX_ARGS - 2]
    ) -> Field {
        // Access control.

        let mut args = [0; abi::MAX_ARGS];
        let me = inputs.call_context.storage_contract_address;
        let targetSelector = 1259373467;
        let _void = public_call::call_public_function(me, targetSelector, args)[0];

        let storage = Storage::init();

        let coll_loc = storage.collateral.at(owner);
        let collateral: Field = coll_loc.read();

        let debt_loc = storage.static_debt.at(owner);
        let static_debt: Field = debt_loc.read();

        assert (static_debt as u120 + amount as u120 < collateral as u120);

        debt_loc.write(static_debt + amount);
        1
    }

    open fn repay(
        inputs: PublicContextInputs,
        owner: Field,
        amount: Field,
        _padding: [Field; abi::MAX_ARGS - 2]
    ) -> Field {
        let mut args = [0; abi::MAX_ARGS];
        let me = inputs.call_context.storage_contract_address;
        let targetSelector = 1259373467;
        let _void = public_call::call_public_function(me, targetSelector, args)[0];

        let storage = Storage::init();
        // Should constrain access from private.
        // should only be callable from self from private.

        let debt_loc = storage.static_debt.at(owner);

        // @todo @LHerskind using "as" after using maps key => field have issues.
        // Need to be explicitly specified as field first.
        let static_debt: Field = debt_loc.read();

        assert (static_debt as u120 >= amount as u120);

        debt_loc.write(static_debt - amount);
        1
    }
}
