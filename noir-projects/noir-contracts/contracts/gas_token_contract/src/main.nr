mod fee;

contract GasToken {
    use dep::aztec::protocol_types::{abis::function_selector::FunctionSelector, address::AztecAddress};
    use dep::aztec::{hash::{compute_secret_hash}, state_vars::{public_state::PublicState, map::Map}};

    use dep::safe_math::SafeU120;

    use crate::fee::calculate_fee;

    struct Storage {
        balances: Map<AztecAddress, PublicState<SafeU120>>,
    }

    #[aztec(private)]
    fn constructor() {}

    #[aztec(public)]
    fn redeem_bridged_balance(amount: Field, to: AztecAddress) {
        // mock
        let amount_u120 = SafeU120::new(amount);
        let new_balance = storage.balances.at(to).read().add(amount_u120);
        storage.balances.at(to).write(new_balance);
    }

    #[aztec(public)]
    fn check_balance(fee_limit: Field) {
        let fee_limit_u120 = SafeU120::new(fee_limit);
        assert(storage.balances.at(context.msg_sender()).read().ge(fee_limit_u120), "Balance too low");
    }

    #[aztec(public)]
    fn pay_fee(fee_limit: Field) -> Field {
        let fee_limit_u120 = SafeU120::new(fee_limit);
        let fee = calculate_fee(context);
        assert(fee.le(fee_limit_u120), "Fee too high");

        let sender_new_balance = storage.balances.at(context.msg_sender()).read().sub(fee);
        storage.balances.at(context.msg_sender()).write(sender_new_balance);

        let recipient_new_balance = storage.balances.at(context.fee_recipient()).read().add(fee);
        storage.balances.at(context.fee_recipient()).write(recipient_new_balance);

        let rebate = fee_limit_u120.sub(fee);
        rebate.value as Field
    }

    // utility function for testing
    unconstrained fn balance_of_public(owner: AztecAddress) -> pub Field {
        storage.balances.at(owner).read().value as Field
    }
}
