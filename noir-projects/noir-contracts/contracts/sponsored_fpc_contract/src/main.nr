mod config;

use dep::aztec::macros::aztec;

/// FOR DEMONSTRATION ONLY
/// Sponsored Fee Payment Contract (Sponsored FPC)
/// This contract covers transaction fees for users under certain conditions.
#[aztec]
pub contract SponsoredFPC {
    use crate::config::Config;
    use dep::aztec::{
        macros::{functions::{initializer, private, public}, storage::storage},
        protocol_types::{abis::gas::Gas, address::AztecAddress},
        state_vars::PublicImmutable,
    };
    use dep::token::Token;

    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
    }

    /// Initializes the contract with the user and asset to be sponsored.
    #[public]
    #[initializer]
    fn constructor(sponsored_user: AztecAddress, sponsored_asset: AztecAddress) {
        let config = Config { sponsored_user, sponsored_asset };
        storage.config.initialize(config);
    }

    /// Sponsors the transaction unconditionally.
    #[private]
    fn sponsor_unconditionally() {
        // Set the FPC as the fee payer of the tx.
        context.set_as_fee_payer();
    }

    /// Sponsors a transaction if the sender matches the pre-configured sponsored user.
    #[private]
    fn sponsor_user() {
        let user = context.msg_sender();
        let sponsored_user = storage.config.read().sponsored_user;
        assert_eq(user, sponsored_user);

        context.set_as_fee_payer();
    }

    /// Sponsors a private token transfer of the pre-configured asset.
    #[private]
    fn sponsor_token_transfer(from: AztecAddress, to: AztecAddress, amount: u128, nonce: Field) {
        // Restrict the amount of gas the whole transaction can consume so that the user can't execute extra expensive
        // calls and make this contract pay for them.
        let gas_limits = context.gas_settings().gas_limits;
        assert(gas_limits.within(Gas::new(40000, 30000)));

        // This contract does not cover priority fees.
        let max_priority_fees_per_gas = context.gas_settings().max_priority_fees_per_gas;
        assert(max_priority_fees_per_gas.is_empty());

        // Call the function on the sponsored asset to transfer token for the user.
        let sponsored_asset = storage.config.read().sponsored_asset;
        let token = Token::at(sponsored_asset);
        token.transfer_in_private(from, to, amount, nonce).call(&mut context);

        context.set_as_fee_payer();
    }
}
