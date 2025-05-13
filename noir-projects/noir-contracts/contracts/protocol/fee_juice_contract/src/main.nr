mod lib;

use dep::aztec::macros::aztec;

#[aztec]
pub contract FeeJuice {
    use dep::aztec::{
        macros::{functions::{internal, private, public, view}, storage::storage},
        protocol_types::{
            address::{AztecAddress, EthAddress},
            constants::FEE_JUICE_ADDRESS,
            traits::ToField,
        },
        state_vars::{Map, PublicMutable},
    };

    use crate::lib::get_bridge_gas_msg_hash;
    use std::ops::Add;

    #[storage]
    struct Storage<Context> {
        // This map is accessed directly by protocol circuits to check balances for fee payment.
        // Do not change this storage layout unless you also update the base rollup circuits.
        balances: Map<AztecAddress, PublicMutable<u128, Context>, Context>,
    }

    #[private]
    fn claim(to: AztecAddress, amount: u128, secret: Field, message_leaf_index: Field) {
        let content_hash = get_bridge_gas_msg_hash(to, amount);
        let portal_address = EthAddress::from_field(FEE_JUICE_ADDRESS.to_field());
        assert(!portal_address.is_zero());

        // Consume message and emit nullifier
        context.consume_l1_to_l2_message(content_hash, secret, portal_address, message_leaf_index);

        // TODO(palla/gas) Emit an unencrypted log to announce which L1 to L2 message has been claimed
        // Otherwise, we cannot trace L1 deposits to their corresponding claims on L2
        FeeJuice::at(context.this_address())._increase_public_balance(to, amount).enqueue(
            &mut context,
        );
    }

    #[public]
    #[internal]
    fn _increase_public_balance(to: AztecAddress, amount: u128) {
        let new_balance = storage.balances.at(to).read().add(amount);
        storage.balances.at(to).write(new_balance);
    }

    #[public]
    #[view]
    fn check_balance(fee_limit: u128) {
        assert(storage.balances.at(context.msg_sender()).read() >= fee_limit, "Balance too low");
    }

    // utility function for testing
    #[public]
    #[view]
    fn balance_of_public(owner: AztecAddress) -> pub u128 {
        storage.balances.at(owner).read()
    }
}
