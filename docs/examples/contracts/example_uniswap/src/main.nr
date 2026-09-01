// docs:start:example_uniswap_setup
mod util;

// Example Uniswap L2 contract for tutorial purposes.
// Demonstrates how to use portal contracts to swap on L1 with funds on L2.
// Has two separate flows for public and private swaps.
use aztec::macros::aztec;

#[aztec]
pub contract ExampleUniswap {
    use aztec::{
        authwit::auth::{
            assert_current_call_valid_authwit_public, compute_authwit_message_hash_from_call,
            set_authorized,
        },
        macros::{functions::{external, initializer, only_self}, storage::storage},
        protocol::{
            abis::function_selector::FunctionSelector,
            address::{AztecAddress, EthAddress},
            traits::ToField,
        },
        state_vars::PublicImmutable,
    };

    use crate::util::{compute_swap_private_content_hash, compute_swap_public_content_hash};
    use token::Token;
    use token_bridge::TokenBridge;

    #[storage]
    struct Storage<Context> {
        portal_address: PublicImmutable<EthAddress, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(portal_address: EthAddress) {
        self.storage.portal_address.initialize(portal_address);
    }
    // docs:end:example_uniswap_setup

    // docs:start:swap_public
    #[external("public")]
    fn swap_public(
        sender: AztecAddress,
        input_asset_bridge: AztecAddress,
        input_amount: u128,
        output_asset_bridge: AztecAddress,
        // params for the swap
        uniswap_fee_tier: Field,
        minimum_output_amount: u128,
        // params for depositing output_asset back to Aztec
        recipient: AztecAddress,
        secret_hash_for_L1_to_l2_message: Field,
    ) {
        // If caller is not the sender, check they have approval
        if (!sender.eq(self.msg_sender())) {
            assert_current_call_valid_authwit_public(self.context, sender);
        }

        let input_asset_bridge_config =
            self.view(TokenBridge::at(input_asset_bridge).get_config_public());

        let input_asset = input_asset_bridge_config.token;
        let input_asset_bridge_portal_address = input_asset_bridge_config.portal;

        // Transfer funds from sender to this contract
        // We use a fixed nonce since we authorize and spend in the same public call
        let nonce_for_transfer = 0xdeadbeef;
        let transfer_selector =
            FunctionSelector::from_signature("transfer_in_public((Field),(Field),u128,Field)");
        let transfer_msg_hash = compute_authwit_message_hash_from_call(
            self.address,
            input_asset,
            self.context.chain_id(),
            self.context.version(),
            transfer_selector,
            [sender.to_field(), self.address.to_field(), input_amount as Field, nonce_for_transfer],
        );
        set_authorized(self.context, transfer_msg_hash, true);

        self.call(Token::at(input_asset).transfer_in_public(
            sender,
            self.address,
            input_amount,
            nonce_for_transfer,
        ));

        // Approve bridge to burn this contract's funds and exit to L1 Uniswap Portal.
        // `let _ =` explicitly discards the return value (Noir requires handling all return values).
        let _ = self.call_self._approve_bridge_and_exit_input_asset_to_L1(
            input_asset,
            input_asset_bridge,
            input_amount,
        );

        // Create swap message and send to Outbox for Uniswap Portal
        let output_asset_bridge_portal_address =
            self.view(TokenBridge::at(output_asset_bridge).get_config_public()).portal;

        // Ensure portals exist - else funds might be lost
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
        );
        self.context.message_portal(self.storage.portal_address.read(), content_hash);
    }
    // docs:end:swap_public

    // docs:start:swap_private
    #[external("private")]
    fn swap_private(
        input_asset: AztecAddress,
        input_asset_bridge: AztecAddress,
        input_amount: u128,
        output_asset_bridge: AztecAddress,
        // params for the swap
        uniswap_fee_tier: Field,
        minimum_output_amount: u128,
        // params for depositing output_asset back to Aztec
        secret_hash_for_L1_to_l2_message: Field,
    ) {
        let input_asset_bridge_config = self.view(TokenBridge::at(input_asset_bridge).get_config());
        let output_asset_bridge_config =
            self.view(TokenBridge::at(output_asset_bridge).get_config());

        // Verify the token address matches the bridge's config
        assert(
            input_asset.eq(input_asset_bridge_config.token),
            "input_asset address is not the same as seen in the bridge contract",
        );

        // Transfer funds from sender to this contract (private -> public)
        // We use a fixed nonce since we authorize and spend in the same tx
        let nonce_for_transfer = 0xdeadbeef;
        self.call(Token::at(input_asset).transfer_to_public(
            self.msg_sender(),
            self.address,
            input_amount,
            nonce_for_transfer,
        ));

        // Approve bridge to burn this contract's funds and exit to L1 Uniswap Portal
        self.enqueue_self._approve_bridge_and_exit_input_asset_to_L1(
            input_asset,
            input_asset_bridge,
            input_amount,
        );

        // Ensure portals exist
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
        );
        self.context.message_portal(self.storage.portal_address.read(), content_hash);
    }
    // docs:end:swap_private

    // docs:start:approve_bridge_and_exit
    // Internal helper: approves the bridge to burn this contract's funds and exits to L1.
    // Used by both public and private swap flows.
    #[external("public")]
    #[only_self]
    fn _approve_bridge_and_exit_input_asset_to_L1(
        token: AztecAddress,
        token_bridge: AztecAddress,
        amount: u128,
    ) {
        // Since we authorize and instantly spend in the same public call, reuse a fixed nonce.
        let authwit_nonce = 0xdeadbeef;

        let selector = FunctionSelector::from_signature("burn_public((Field),u128,Field)");
        let message_hash = compute_authwit_message_hash_from_call(
            token_bridge,
            token,
            self.context.chain_id(),
            self.context.version(),
            selector,
            [self.address.to_field(), amount as Field, authwit_nonce],
        );

        set_authorized(self.context, message_hash, true);

        let this_portal_address = self.storage.portal_address.read();
        // Exit to L1 Uniswap Portal
        self.call(TokenBridge::at(token_bridge).exit_to_l1_public(
            this_portal_address,
            amount,
            this_portal_address,
            authwit_nonce,
        ));
    }
    // docs:end:approve_bridge_and_exit
}
