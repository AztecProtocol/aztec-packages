mod config;

// docs:start:token_bridge_imports

// Minimal implementation of the token bridge that can move funds between L1 <> L2.
// The bridge has a corresponding Portal contract on L1 that it is attached to
// And corresponds to a Token on L2 that uses the `AuthWit` accounts pattern.
// Bridge has to be set as a minter on the token before it can be used

use dep::aztec::macros::aztec;

#[aztec]
pub contract TokenBridge {
    use crate::config::Config;

    use dep::aztec::{
        protocol_types::address::{AztecAddress, EthAddress},
        state_vars::PublicImmutable,
    };

    use dep::token_portal_content_hash_lib::{
        get_mint_to_private_content_hash, get_mint_to_public_content_hash,
        get_withdraw_content_hash,
    };

    use dep::token::Token;

    use dep::aztec::macros::{functions::{initializer, private, public, view}, storage::storage};
    // docs:end:token_bridge_imports

    // docs:start:token_bridge_storage_and_constructor
    // Storage structure, containing all storage, and specifying what slots they use.
    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
    }

    // Constructs the contract.
    #[public]
    #[initializer]
    fn constructor(token: AztecAddress, portal: EthAddress) {
        storage.config.initialize(Config { token, portal });
    }
    // docs:end:token_bridge_storage_and_constructor

    // docs:start:get_config
    #[private]
    #[view]
    fn get_config() -> Config {
        storage.config.read()
    }
    // docs:end:get_config

    #[public]
    #[view]
    fn get_config_public() -> Config {
        storage.config.read()
    }

    // docs:start:claim_public
    // Consumes a L1->L2 message and calls the token contract to mint the appropriate amount publicly
    #[public]
    fn claim_public(to: AztecAddress, amount: u128, secret: Field, message_leaf_index: Field) {
        let content_hash = get_mint_to_public_content_hash(to, amount);

        let config = storage.config.read();

        // Consume message and emit nullifier
        context.consume_l1_to_l2_message(content_hash, secret, config.portal, message_leaf_index);

        // Mint tokens
        Token::at(config.token).mint_to_public(to, amount).call(&mut context);
    }
    // docs:end:claim_public

    // docs:start:exit_to_l1_public
    // Burns the appropriate amount of tokens and creates a L2 to L1 withdraw message publicly
    // Requires `msg.sender` to give approval to the bridge to burn tokens on their behalf using witness signatures
    #[public]
    fn exit_to_l1_public(
        recipient: EthAddress, // ethereum address to withdraw to
        amount: u128,
        caller_on_l1: EthAddress, // ethereum address that can call this function on the L1 portal (0x0 if anyone can call)
        authwit_nonce: Field, // nonce used in the approval message by `msg.sender` to let bridge burn their tokens on L2
    ) {
        let config = storage.config.read();

        // Send an L2 to L1 message
        let content = get_withdraw_content_hash(recipient, amount, caller_on_l1);
        context.message_portal(config.portal, content);

        // Burn tokens
        Token::at(config.token).burn_public(context.msg_sender(), amount, authwit_nonce).call(
            &mut context,
        );
    }
    // docs:end:exit_to_l1_public

    // docs:start:claim_private
    /// Claims the bridged tokens and makes them accessible in private. Note that recipient's address is not revealed
    /// but the amount is. Hence it's most likely possible to determine to which L1 deposit this claim corresponds to
    /// (unless there are multiple pending deposits of the same amount).
    #[private]
    fn claim_private(
        recipient: AztecAddress, // recipient of the bridged tokens
        amount: u128,
        secret_for_L1_to_L2_message_consumption: Field, // secret used to consume the L1 to L2 message
        message_leaf_index: Field,
    ) {
        let config = storage.config.read();

        // Consume L1 to L2 message and emit nullifier
        let content_hash = get_mint_to_private_content_hash(amount);
        context.consume_l1_to_l2_message(
            content_hash,
            secret_for_L1_to_L2_message_consumption,
            config.portal,
            message_leaf_index,
        );

        // At last we mint the tokens
        // docs:start:call_mint_on_token
        Token::at(config.token).mint_to_private(recipient, amount).call(&mut context);
        // docs:end:call_mint_on_token
    }
    // docs:end:claim_private

    // docs:start:exit_to_l1_private
    // Burns the appropriate amount of tokens and creates a L2 to L1 withdraw message privately
    // Requires `msg.sender` (caller of the method) to give approval to the bridge to burn tokens on their behalf using witness signatures
    #[private]
    fn exit_to_l1_private(
        token: AztecAddress,
        recipient: EthAddress, // ethereum address to withdraw to
        amount: u128,
        caller_on_l1: EthAddress, // ethereum address that can call this function on the L1 portal (0x0 if anyone can call)
        authwit_nonce: Field, // nonce used in the approval message by `msg.sender` to let bridge burn their tokens on L2
    ) {
        // docs:start:assert_token_is_same
        let config = storage.config.read();

        // Assert that user provided token address is same as seen in storage.
        assert_eq(config.token, token, "Token address is not the same as seen in storage");
        // docs:end:assert_token_is_same

        // Send an L2 to L1 message
        let content = get_withdraw_content_hash(recipient, amount, caller_on_l1);
        context.message_portal(config.portal, content);

        // Burn tokens
        Token::at(token).burn_private(context.msg_sender(), amount, authwit_nonce).call(&mut context);
    }
    // docs:end:exit_to_l1_private
}
