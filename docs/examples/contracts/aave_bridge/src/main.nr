// docs:start:bridge_setup
mod config;

// A bridge contract that allows users to deposit tokens into Aave on L1 from Aztec L2,
// and claim yield-bearing tokens back on L2. The bridge mirrors TokenBridge's pattern:
// all Aave-specific logic lives on L1, while L2 simply burns/mints tokens and passes messages.

use aztec::macros::aztec;
#[aztec]
pub contract AaveBridge {
    use crate::config::Config;

    use aztec::{protocol::address::{AztecAddress, EthAddress}, state_vars::PublicImmutable};

    use token_portal_content_hash_lib::{
        get_mint_to_private_content_hash, get_mint_to_public_content_hash,
        get_withdraw_content_hash,
    };

    use token::Token;

    use aztec::macros::{functions::{external, initializer, view}, storage::storage};

    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
    }

    #[external("public")]
    #[initializer]
    fn constructor(token: AztecAddress, portal: EthAddress) {
        self.storage.config.initialize(Config { token, portal });
    }

    #[external("private")]
    #[view]
    fn get_config() -> Config {
        self.storage.config.read()
    }
    // docs:end:bridge_setup

    // docs:start:claim_public
    /// Consume an L1->L2 message and mint tokens publicly.
    /// Called after the L1 AavePortal withdraws from Aave and sends a message.
    #[external("public")]
    fn claim_public(to: AztecAddress, amount: u128, secret: Field, message_leaf_index: Field) {
        let content_hash = get_mint_to_public_content_hash(to, amount);
        let config = self.storage.config.read();

        // Consume message and emit nullifier
        self.context.consume_l1_to_l2_message(
            content_hash,
            secret,
            config.portal,
            message_leaf_index,
        );

        // Mint tokens (including any yield from Aave)
        self.call(Token::at(config.token).mint_to_public(to, amount));
    }
    // docs:end:claim_public

    // docs:start:claim_private
    /// Consume an L1->L2 message and mint tokens privately.
    /// The recipient's address is not revealed, but the amount is.
    #[external("private")]
    fn claim_private(
        recipient: AztecAddress,
        amount: u128,
        secret_for_L1_to_L2_message_consumption: Field,
        message_leaf_index: Field,
    ) {
        let config = self.storage.config.read();

        // Consume L1 to L2 message and emit nullifier
        let content_hash = get_mint_to_private_content_hash(amount);
        self.context.consume_l1_to_l2_message(
            content_hash,
            secret_for_L1_to_L2_message_consumption,
            config.portal,
            message_leaf_index,
        );

        // Mint tokens privately
        self.call(Token::at(config.token).mint_to_private(recipient, amount));
    }
    // docs:end:claim_private

    // docs:start:exit_to_l1_public
    /// Burn tokens publicly and create an L2->L1 message.
    /// The L1 AavePortal will consume this message and deposit into Aave.
    #[external("public")]
    fn exit_to_l1_public(
        recipient: EthAddress,
        amount: u128,
        caller_on_l1: EthAddress,
        authwit_nonce: Field,
    ) {
        let config = self.storage.config.read();

        // Send an L2 to L1 message
        let content = get_withdraw_content_hash(recipient, amount, caller_on_l1);
        self.context.message_portal(config.portal, content);

        // Burn tokens
        self.call(Token::at(config.token).burn_public(self.msg_sender(), amount, authwit_nonce));
    }
    // docs:end:exit_to_l1_public

    // docs:start:exit_to_l1_private
    /// Burn tokens privately and create an L2->L1 message.
    /// The L1 AavePortal will consume this message and deposit into Aave.
    #[external("private")]
    fn exit_to_l1_private(
        token: AztecAddress,
        recipient: EthAddress,
        amount: u128,
        caller_on_l1: EthAddress,
        authwit_nonce: Field,
    ) {
        let config = self.storage.config.read();

        // Assert that user provided token address is same as seen in storage
        assert_eq(config.token, token, "Token address is not the same as seen in storage");

        // Send an L2 to L1 message
        let content = get_withdraw_content_hash(recipient, amount, caller_on_l1);
        self.context.message_portal(config.portal, content);

        // Burn tokens privately
        self.call(Token::at(token).burn_private(self.msg_sender(), amount, authwit_nonce));
    }
    // docs:end:exit_to_l1_private
}
