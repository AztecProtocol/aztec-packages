// docs:start:uniswap_setup
mod util;

// Demonstrates how to use portal contracts to swap on L1 Uniswap with funds on L2
// Has two separate flows for private and public respectively
// Uses the token bridge contract, which tells which input token we need to talk to and handles the exit funds to L1
use dep::aztec::macros::aztec;

#[aztec]
pub contract Uniswap {
    use dep::aztec::prelude::{AztecAddress, EthAddress, FunctionSelector, PublicImmutable};

    use dep::authwit::auth::{
        assert_current_call_valid_authwit_public, compute_authwit_message_hash_from_call,
        set_authorized,
    };

    use crate::util::{compute_swap_private_content_hash, compute_swap_public_content_hash};
    use dep::aztec::macros::{functions::{initializer, internal, private, public}, storage::storage};
    use dep::token::Token;
    use dep::token_bridge::TokenBridge;

    use dep::aztec::protocol_types::traits::ToField;

    #[storage]
    struct Storage<Context> {
        portal_address: PublicImmutable<EthAddress, Context>,
    }

    #[public]
    #[initializer]
    fn constructor(portal_address: EthAddress) {
        storage.portal_address.initialize(portal_address);
    }
    // docs:end:uniswap_setup

    // docs:start:swap_public
    #[public]
    fn swap_public(
        sender: AztecAddress,
        input_asset_bridge: AztecAddress,
        input_amount: u128,
        output_asset_bridge: AztecAddress,
        // params for using the transfer approval
        nonce_for_transfer_approval: Field,
        // params for the swap
        uniswap_fee_tier: Field,
        minimum_output_amount: u128,
        // params for the depositing output_asset back to Aztec
        recipient: AztecAddress,
        secret_hash_for_L1_to_l2_message: Field,
        caller_on_L1: EthAddress,
        // nonce for someone to call swap on sender's behalf
        nonce_for_swap_approval: Field,
    ) {
        if (!sender.eq(context.msg_sender())) {
            assert_current_call_valid_authwit_public(&mut context, sender);
        }

        let input_asset_bridge_config =
            TokenBridge::at(input_asset_bridge).get_config_public().view(&mut context);

        let input_asset = input_asset_bridge_config.token;
        let input_asset_bridge_portal_address = input_asset_bridge_config.portal;

        // Transfer funds to this contract
        Token::at(input_asset)
            .transfer_in_public(
                sender,
                context.this_address(),
                input_amount,
                nonce_for_transfer_approval,
            )
            .call(&mut context);

        // Approve bridge to burn this contract's funds and exit to L1 Uniswap Portal
        Uniswap::at(context.this_address())
            ._approve_bridge_and_exit_input_asset_to_L1(
                input_asset,
                input_asset_bridge,
                input_amount,
            )
            .call(&mut context);
        // Create swap message and send to Outbox for Uniswap Portal
        // this ensures the integrity of what the user originally intends to do on L1.
        let output_asset_bridge_portal_address =
            TokenBridge::at(output_asset_bridge).get_config_public().view(&mut context).portal;
        // ensure portal exists - else funds might be lost
        assert(
            !input_asset_bridge_portal_address.is_zero(),
            "L1 portal address of input_asset's bridge is 0",
        );
        assert(
            !output_asset_bridge_portal_address.is_zero(),
            "L1 portal address of output_asset's bridge is 0",
        );

        let content_hash = compute_swap_public_content_hash(
            input_asset_bridge_portal_address,
            input_amount,
            uniswap_fee_tier,
            output_asset_bridge_portal_address,
            minimum_output_amount,
            recipient,
            secret_hash_for_L1_to_l2_message,
            caller_on_L1,
        );
        context.message_portal(storage.portal_address.read(), content_hash);
    }
    // docs:end:swap_public

    // docs:start:swap_private
    #[private]
    fn swap_private(
        input_asset: AztecAddress, // since private, we pass here and later assert that this is as expected by input_bridge
        input_asset_bridge: AztecAddress,
        input_amount: u128,
        output_asset_bridge: AztecAddress,
        // params for using the transfer_to_public approval
        nonce_for_transfer_to_public_approval: Field,
        // params for the swap
        uniswap_fee_tier: Field, // which uniswap tier to use (eg 3000 for 0.3% fee)
        minimum_output_amount: u128, // minimum output amount to receive (slippage protection for the swap)
        // params for the depositing output_asset back to Aztec
        secret_hash_for_L1_to_l2_message: Field, // for when l1 uniswap portal inserts the message to consume output assets on L2
        caller_on_L1: EthAddress, // ethereum address that can call this function on the L1 portal (0x0 if anyone can call)
    ) {
        let input_asset_bridge_config =
            TokenBridge::at(input_asset_bridge).get_config().view(&mut context);
        let output_asset_bridge_config =
            TokenBridge::at(output_asset_bridge).get_config().view(&mut context);

        // Assert that user provided token address is same as expected by token bridge.
        // we can't directly use `input_asset_bridge.token` because that is a public method and public can't return data to private
        assert(
            input_asset.eq(input_asset_bridge_config.token),
            "input_asset address is not the same as seen in the bridge contract",
        );

        // Transfer funds to this contract
        Token::at(input_asset)
            .transfer_to_public(
                context.msg_sender(),
                context.this_address(),
                input_amount,
                nonce_for_transfer_to_public_approval,
            )
            .call(&mut context);

        // Approve bridge to burn this contract's funds and exit to L1 Uniswap Portal
        Uniswap::at(context.this_address())
            ._approve_bridge_and_exit_input_asset_to_L1(
                input_asset,
                input_asset_bridge,
                input_amount,
            )
            .enqueue(&mut context);

        // Create swap message and send to Outbox for Uniswap Portal
        // this ensures the integrity of what the user originally intends to do on L1.

        // ensure portal exists - else funds might be lost
        assert(
            !input_asset_bridge_config.portal.is_zero(),
            "L1 portal address of input_asset's bridge is 0",
        );
        assert(
            !output_asset_bridge_config.portal.is_zero(),
            "L1 portal address of output_asset's bridge is 0",
        );

        let content_hash = compute_swap_private_content_hash(
            input_asset_bridge_config.portal,
            input_amount,
            uniswap_fee_tier,
            output_asset_bridge_config.portal,
            minimum_output_amount,
            secret_hash_for_L1_to_l2_message,
            caller_on_L1,
        );
        context.message_portal(storage.portal_address.read(), content_hash);
    }
    // docs:end:swap_private

    // docs:start:authwit_uniswap_set
    // This helper method approves the bridge to burn this contract's funds and exits the input asset to L1
    // Assumes contract already has funds.
    // Assume `token` relates to `token_bridge` (ie token_bridge.token == token)
    // Note that private can't read public return values so created an internal public that handles everything
    // this method is used for both private and public swaps.
    #[public]
    #[internal]
    fn _approve_bridge_and_exit_input_asset_to_L1(
        token: AztecAddress,
        token_bridge: AztecAddress,
        amount: u128,
    ) {
        // Since we will authorize and instantly spend the funds, all in public, we can use the same nonce
        // every interaction. In practice, the authwit should be squashed, so this is also cheap!
        let authwit_nonce = 0xdeadbeef;

        let selector = FunctionSelector::from_signature("burn_public((Field),u128,Field)");
        let message_hash = compute_authwit_message_hash_from_call(
            token_bridge,
            token,
            context.chain_id(),
            context.version(),
            selector,
            [context.this_address().to_field(), amount as Field, authwit_nonce],
        );

        // We need to make a call to update it.
        set_authorized(&mut context, message_hash, true);

        let this_portal_address = storage.portal_address.read();
        // Exit to L1 Uniswap Portal !
        TokenBridge::at(token_bridge)
            .exit_to_l1_public(this_portal_address, amount, this_portal_address, authwit_nonce)
            .call(&mut context)
    }
    // docs:end:authwit_uniswap_set
}
