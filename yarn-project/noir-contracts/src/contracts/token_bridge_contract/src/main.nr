mod types;
mod util;
mod token_interface;

// Minimal implementation of the token bridge that can move funds between L1 <> L2.
// The bridge has a corresponding Portal contract on L1 that it is attached to 
// And corresponds to a Token on L2 that uses the `AuthWit` accounts pattern.
// Bridge has to be set as a minter on the token before it can be sued
contract TokenBridge {
    // Libs
    use dep::aztec::{
        context::{Context},
        state_vars::{public_state::PublicState},
        types::type_serialisation::field_serialisation::{
            FieldSerialisationMethods, FIELD_SERIALISED_LEN,
        },
        oracle::compute_selector::compute_selector,
    };

    use crate::types::{AztecAddress, EthereumAddress};
    use crate::token_interface::Token;
    use crate::util::{get_mint_content_hash, get_withdraw_content_hash, compute_secret_hash};

    struct Storage {
        token: PublicState<Field, FIELD_SERIALISED_LEN>,
    }

    impl Storage {
        fn init(context: Context) -> pub Self {
            Storage {
                token: PublicState::new(
                    context,
                    1,
                    FieldSerialisationMethods,
                )
            }
        }
    }

    #[aztec(private)]
    fn constructor() {
        // Currently not possible to execute public calls from constructor as code not yet available to sequencer.
        // let selector = compute_selector("_initialize((Field))");
        // let _callStackItem = context.call_public_function(context.this_address(), selector, [token]);
    }

    // Consumes a L1->L2 message and calls the token contract to mint the appropriate amount publicly
    #[aztec(public)]
    fn mint_public(
        recipient: AztecAddress,
        amount: Field,
        msg_key: Field, // L1 to L2 message key as derived from the inbox contract
        secret: Field,
        canceller: EthereumAddress,
    ) -> Field {
        let storage = Storage::init(Context::public(&mut context));

        let content_hash = get_mint_content_hash(amount, recipient.address, canceller.address);

        // Consume message and emit nullifier
        context.consume_l1_to_l2_message(msg_key, content_hash, secret);

        // Mint token on L2
        Token::at(storage.token.read()).mint_public(context, recipient.address, amount)
    }

    // Consumes a L1->L2 message and calls the token contract to mint the appropriate amount in private assets
    // User needs to call token.redeem_shield() to get the private assets
    // This method is public because it accesses public storage. For similar reasons, the corresponding call on the token is also public
    #[aztec(public)]
    fn mint(
        recipient: AztecAddress,
        amount: Field,
        msg_key: Field, // L1 to L2 message key as derived from the inbox contract
        secret: Field,
        canceller: EthereumAddress,
    ) -> Field {
        let storage = Storage::init(Context::public(&mut context));

        let content_hash = get_mint_content_hash(amount, recipient.address, canceller.address);

        // Consume message and emit nullifier
        context.consume_l1_to_l2_message(msg_key, content_hash, secret);

        // Mint token on L2
        let secret_hash = compute_secret_hash(secret);
        Token::at(storage.token.read()).mint_private(context, amount, secret_hash)
    }

    // Burns the appropriate amount of tokens and creates a L2 to L1 withdraw message publicly
    // Requires `from` to give approval to the bridge to burn tokens on their behalf using witness signatures 
    #[aztec(public)]
    fn withdraw_public(
        from: AztecAddress, // aztec address to withdraw from
        recipient: EthereumAddress, // ethereum address to withdraw to
        amount: Field,
        callerOnL1: EthereumAddress, // ethereum address that can call this function on the L1 portal (0x0 if anyone can call)
        nonce: Field, // used in creating the approval message (to prevent replay attacks)
    ) -> Field {
        let storage = Storage::init(Context::public(&mut context));

        // Burn tokens on L2
        let return_value = Token::at(storage.token.read()).burn_public(context, from.address, amount, nonce);

        let content = get_withdraw_content_hash(amount, recipient.address, callerOnL1.address);

        // Emit the l2 to l1 message
        context.message_portal(content);

        return_value
    }

    // Burns the appropriate amount of tokens and creates a L2 to L1 withdraw message privately
    // Requires `from` to give approval to the bridge to burn tokens on their behalf using witness signatures 
    #[aztec(private)]
    fn withdraw(
        token:AztecAddress, // can't read public storage in private, so pass the token and call an internal public fn to check if provided token is as expected.
        from: AztecAddress, // aztec address to withdraw from
        recipient: EthereumAddress, // ethereum address to withdraw to
        amount: Field,
        callerOnL1: EthereumAddress, // ethereum address that can call this function on the L1 portal (0x0 if anyone can call)
        nonce: Field, // used in creating the approval message (to prevent replay attacks)
    ) -> Field {
        // can't read public storage (`storage.token`) in private so let the user pass it in
        // later assert that this token address is as expected
        let return_value = Token::at(token.address).burn(&mut context, from.address, amount, nonce);

        let content = get_withdraw_content_hash(amount, recipient.address, callerOnL1.address);
        // Emit the l2 to l1 message
        context.message_portal(content);

        // Assert that user provided token address is same as seen in storage. 
        context.call_public_function(token.address, compute_selector("_assert_token_is_same(Field)"), [token.address]);

        return_value
    }

    // /// Unconstrained /// 

    unconstrained fn token() -> Field {
        let storage = Storage::init(Context::none());
        storage.token.read()
    }

    /// SHOULD BE Internal ///

    // We cannot do this from the constructor currently 
    // Since this should be internal, for now, we ignore the safety checks of it, as they are 
    // enforced by it being internal and only called from the constructor.
    #[aztec(public)]
    fn _initialize(token: AztecAddress) {
        let storage = Storage::init(Context::public(&mut context));
        storage.token.write(token.address);
    }

    #[aztec(public)]
    internal fn _assert_token_is_same(token: Field) {
        let storage = Storage::init(Context::public(&mut context));
        assert(storage.token.read() == token, "Token address is not the same as seen in storage");
    }

}
