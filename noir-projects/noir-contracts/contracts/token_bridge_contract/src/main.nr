// docs:start:token_bridge_imports

// Minimal implementation of the token bridge that can move funds between L1 <> L2.
// The bridge has a corresponding Portal contract on L1 that it is attached to
// And corresponds to a Token on L2 that uses the `AuthWit` accounts pattern.
// Bridge has to be set as a minter on the token before it can be used

use dep::aztec::macros::aztec;

#[aztec]
contract TokenBridge {
    use dep::aztec::prelude::{AztecAddress, EthAddress, PublicImmutable};

    use dep::token_portal_content_hash_lib::{
        get_mint_to_private_content_hash, get_mint_to_public_content_hash,
        get_withdraw_content_hash,
    };

    use dep::token::Token;

    use dep::aztec::macros::{
        functions::{initializer, internal, private, public, view},
        storage::storage,
    };
    // docs:end:token_bridge_imports

    // docs:start:token_bridge_storage_and_constructor
    // Storage structure, containing all storage, and specifying what slots they use.
    #[storage]
    struct Storage<Context> {
        token: PublicImmutable<AztecAddress, Context>,
        portal_address: PublicImmutable<EthAddress, Context>,
    }

    // Constructs the contract.
    #[public]
    #[initializer]
    fn constructor(token: AztecAddress, portal_address: EthAddress) {
        storage.token.initialize(token);
        storage.portal_address.initialize(portal_address);
    }
    // docs:end:token_bridge_storage_and_constructor

    #[private]
    fn get_portal_address() -> EthAddress {
        storage.portal_address.read()
    }

    #[public]
    fn get_portal_address_public() -> EthAddress {
        storage.portal_address.read()
    }

    // docs:start:claim_public
    // Consumes a L1->L2 message and calls the token contract to mint the appropriate amount publicly
    #[public]
    fn claim_public(to: AztecAddress, amount: Field, secret: Field, message_leaf_index: Field) {
        let content_hash = get_mint_to_public_content_hash(to, amount);

        // Consume message and emit nullifier
        context.consume_l1_to_l2_message(
            content_hash,
            secret,
            storage.portal_address.read(),
            message_leaf_index,
        );

        // Mint tokens
        Token::at(storage.token.read()).mint_to_public(to, amount).call(&mut context);
    }
    // docs:end:claim_public

    // docs:start:exit_to_l1_public
    // Burns the appropriate amount of tokens and creates a L2 to L1 withdraw message publicly
    // Requires `msg.sender` to give approval to the bridge to burn tokens on their behalf using witness signatures
    #[public]
    fn exit_to_l1_public(
        recipient: EthAddress, // ethereum address to withdraw to
        amount: Field,
        caller_on_l1: EthAddress, // ethereum address that can call this function on the L1 portal (0x0 if anyone can call)
        nonce: Field, // nonce used in the approval message by `msg.sender` to let bridge burn their tokens on L2
    ) {
        // Send an L2 to L1 message
        let content = get_withdraw_content_hash(recipient, amount, caller_on_l1);
        context.message_portal(storage.portal_address.read(), content);

        // Burn tokens
        Token::at(storage.token.read()).burn_public(context.msg_sender(), amount, nonce).call(
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
        amount: Field,
        secret_for_L1_to_L2_message_consumption: Field, // secret used to consume the L1 to L2 message
        message_leaf_index: Field,
    ) {
        // Consume L1 to L2 message and emit nullifier
        let content_hash = get_mint_to_private_content_hash(amount);
        context.consume_l1_to_l2_message(
            content_hash,
            secret_for_L1_to_L2_message_consumption,
            storage.portal_address.read(),
            message_leaf_index,
        );

        // Read the token address from storage
        let token_address = storage.token.read();

        // At last we mint the tokens
        // docs:start:call_mint_on_token
        Token::at(token_address).mint_to_private(context.msg_sender(), recipient, amount).call(
            &mut context,
        );
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
        amount: Field,
        caller_on_l1: EthAddress, // ethereum address that can call this function on the L1 portal (0x0 if anyone can call)
        nonce: Field, // nonce used in the approval message by `msg.sender` to let bridge burn their tokens on L2
    ) {
        // Send an L2 to L1 message
        let content = get_withdraw_content_hash(recipient, amount, caller_on_l1);
        context.message_portal(storage.portal_address.read(), content);

        // docs:start:call_assert_token_is_same
        // Assert that user provided token address is same as seen in storage.
        TokenBridge::at(context.this_address())._assert_token_is_same(token).enqueue(&mut context);
        // docs:end:call_assert_token_is_same
        // Burn tokens
        Token::at(token).burn_private(context.msg_sender(), amount, nonce).call(&mut context);
    }
    /// docs:end:exit_to_l1_private
    // docs:start:get_token
    #[public]
    #[view]
    fn get_token() -> AztecAddress {
        storage.token.read()
    }
    // docs:end:get_token

    // docs:start:assert_token_is_same
    #[public]
    #[internal]
    fn _assert_token_is_same(token: AztecAddress) {
        assert(storage.token.read().eq(token), "Token address is not the same as seen in storage");
    }
    // docs:end:assert_token_is_same
}
