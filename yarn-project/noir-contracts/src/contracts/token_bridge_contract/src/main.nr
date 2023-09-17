mod types;
mod util;
mod token_interface;

// Minimal implementation of the token bridge that can move funds between L1 <> L2.
// The bridge has a corresponding Portal contract on L1 that it is attached to 
// And corresponds to a Token on L2 that uses the `AuthWit` accounts pattern.
// Bridge has to be set as a minter on the token before it can be sued

contract TokenBridge {
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

    // Storage structure, containing all storage, and specifying what slots they use.
    struct Storage {
        token: PublicState<Field, 1>,
    }

    impl Storage {
        fn init(context: Context) -> pub Self {
            Storage {
                token: PublicState::new(
                    context,
                    1,
                    FieldSerialisationMethods,
                ),
            }
        }
    }

    // Constructs the contract.
    #[aztec(private)]
    fn constructor() {
        // Currently not possible to execute public calls from constructor as code not yet available to sequencer.
        // let selector = compute_selector("_initialize((Field))");
        // let _callStackItem = context.call_public_function(context.this_address(), selector, [context.msg_sender()]);
    }

    // Consumes a L1->L2 message and calls the token contract to mint the appropriate amount publicly
    #[aztec(public)]
    fn deposit_public(
        amount: Field,
        msg_key: Field,
        secret: Field,
        canceller: EthereumAddress,
    ) -> Field {
        let storage = Storage::init(Context::public(&mut context));

        let content_hash = get_mint_content_hash(amount, context.msg_sender(), canceller.address);
        // Consume message and emit nullifier
        context.consume_l1_to_l2_message(msg_key, content_hash, secret);

        // Mint tokens 
        Token::at(storage.token.read()).mint_public(context, context.msg_sender(), amount);

        1
    }

    // Burns the appropriate amount of tokens and creates a L2 to L1 withdraw message publicly
    // Requires `from` to give approval to the bridge to burn tokens on their behalf using witness signatures 
    #[aztec(public)]
    fn withdraw_public(
        amount: Field,
        recipient: EthereumAddress, // ethereum address to withdraw to
        callerOnL1: EthereumAddress, // ethereum address that can call this function on the L1 portal (0x0 if anyone can call)
        nonce: Field,
    ) -> Field {
        let storage = Storage::init(Context::public(&mut context));

        // Burn tokens 
        Token::at(storage.token.read()).burn_public(context, context.msg_sender(), amount, nonce);

        // Send an L2 to L1 message
        let content = get_withdraw_content_hash(amount, recipient.address, callerOnL1.address);
        context.message_portal(content);        
        1
    }

    // Consumes a L1->L2 message and calls the token contract to mint the appropriate amount in private assets
    // User needs to call token.redeem_shield() to get the private assets
    #[aztec(private)]
    fn deposit_private(
        amount: Field,
        msg_key: Field, // L1 to L2 message key as derived from the inbox contract
        secret: Field,
        canceller: EthereumAddress,
    ) -> Field {
        // Consume L1 to L2 message and emit nullifier
        let content_hash = get_mint_content_hash(amount, context.msg_sender(), canceller.address);
        context.consume_l1_to_l2_message(inputs, msg_key, content_hash, secret);

        // Mint tokens on L2 
        // We hash the secret privately and send the hash in a public call so the secret isn't leaked
        // Furthermore, `mint_private` on token is public. So we can an internal public function 
        // which then calls the token contract
        let secret_hash = compute_secret_hash(secret);
        context.call_public_function(
            context.this_address(),
            compute_selector("_call_mint_on_token(Field,Field)"),
            [amount, secret_hash],
        );

        1
    }

    // Burns the appropriate amount of tokens and creates a L2 to L1 withdraw message privately
    // Requires `from` to give approval to the bridge to burn tokens on their behalf using witness signatures 
    #[aztec(private)]
    fn withdraw_private(
        token: AztecAddress,
        amount: Field,
        recipient: EthereumAddress, // ethereum address to withdraw to
        callerOnL1: EthereumAddress, // ethereum address that can call this function on the L1 portal (0x0 if anyone can call)
        nonce: Field,
    ) -> Field {
        // Burn tokens
        Token::at(token.address).burn(&mut context, context.msg_sender(), amount, nonce);

        // Send an L2 to L1 message
        let content = get_withdraw_content_hash(amount, recipient.address, callerOnL1.address);
        context.message_portal(content);

        // Assert that user provided token address is same as seen in storage. 
        context.call_public_function(context.this_address(), compute_selector("_assert_token_is_same(Field)"), [token.address]);

        1
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

    //  This way, user hashes their secret in private and only sends the hash in public
    // meaning only user can `redeem_shield` at a later time with their secret.
    #[aztec(public)]
    internal fn _call_mint_on_token(amount: Field, secret_hash: Field){
        let storage = Storage::init(Context::public(&mut context));
        Token::at(storage.token.read()).mint_private(context, amount, secret_hash);
    }

    #[aztec(public)]
    internal fn _assert_token_is_same(token: Field) {
        let storage = Storage::init(Context::public(&mut context));
        assert(storage.token.read() == token, "Token address is not the same as seen in storage");
    }
}
