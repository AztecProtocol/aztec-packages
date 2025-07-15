mod config;
mod subscription_note;
mod dapp_payload;

use dep::aztec::macros::aztec;

/// # AppSubscription Contract
///
/// A contract that acts as a gateway for users to access other smart contracts through a subscription-based model.
/// This contract implements a pay-per-use system where users pay a subscription fee to gain access to a target
/// contract for a limited number of transactions within a specified time period.
///
/// ## Architecture Overview
///
/// The AppSubscription contract serves as an intermediary between users and a target contract. It:
/// - Manages user subscriptions with transaction limits and expiration blocks
/// - Handles subscription payments in a specified token
/// - Provides an entrypoint that validates subscriptions before forwarding calls to the target contract
/// - Implements fee management and gas limit controls
///
/// ## Key Components
///
/// ### Storage
/// - `config`: Public immutable configuration containing contract addresses, subscription price, and gas limits
/// - `subscriptions`: Private map storing subscription notes for each user address
///
/// ### Core Functions
/// - `entrypoint()`: Main gateway function that validates subscriptions and forwards calls to target contract
/// - `subscribe()`: Allows users to purchase subscriptions with transaction limits and expiration
/// - `constructor()`: Initializes the contract with configuration parameters
/// - `is_initialized()`: Utility function to check if a user has an active subscription
///
/// ## Usage Pattern
///
/// 1. **Contract Deployment**: Deploy with target contract address, recipient address, token address, price, and gas limits
/// 2. **User Subscription**: Users call `subscribe()` with payment and subscription parameters
/// 3. **DApp Interface**: Users interact with target contracts through `DefaultDappInterface`
/// 4. **Entrypoint Validation**: Each call goes through `entrypoint()` which validates subscription status
/// 5. **Call Forwarding**: Valid calls are forwarded to the target contract with proper fee handling

#[aztec]
pub contract AppSubscription {
    use crate::{config::Config, dapp_payload::DAppPayload, subscription_note::SubscriptionNote};

    use aztec::{
        authwit::auth::assert_current_call_valid_authwit,
        macros::{functions::{initializer, private, public, utility}, storage::storage},
        messages::logs::note::encode_and_encrypt_note,
        oracle::notes::set_sender_for_tags,
        protocol_types::{address::AztecAddress, constants::MAX_FIELD_VALUE, traits::ToField},
        state_vars::{Map, PrivateMutable, PublicImmutable},
        utils::comparison::Comparator,
    };
    use router::utils::privately_check_block_number;
    use token::Token;

    #[storage]
    struct Storage<Context> {
        config: PublicImmutable<Config, Context>,
        subscriptions: Map<AztecAddress, PrivateMutable<SubscriptionNote, Context>, Context>,
    }

    global SUBSCRIPTION_DURATION_IN_BLOCKS: u32 = 5;
    global SUBSCRIPTION_TXS: u32 = 5;

    #[private]
    fn entrypoint(payload: DAppPayload, user_address: AztecAddress) {
        // Safety: The sender for tags is only used to compute unconstrained shared secrets for emitting logs.
        // Since this value is only used for unconstrained tagging and not for any constrained logic,
        // it is safe to set from a constrained context.
        // We set the sender for tags to the user address because we don't want to force the user
        // to add this contract as a sender to their PXE. By setting it to the user address, user's PXE
        // will manage to find the notes even if this contract is not registered as a sender
        unsafe { set_sender_for_tags(user_address) };

        // Default msg_sender for entrypoints is now Fr.max_value rather than 0 addr (see #7190 & #7404)
        assert(context.msg_sender().to_field() == MAX_FIELD_VALUE);
        // This function takes a generic argument that corresponds to the number of params
        // the parent takes. See aztec-nr/src/authwit/auth.nr for more details.
        assert_current_call_valid_authwit::<2>(&mut context, user_address);

        let mut note = storage.subscriptions.at(user_address).get_note().note;
        assert(note.remaining_txs > 0, "you're out of txs");

        note.remaining_txs -= 1;

        storage.subscriptions.at(user_address).replace(note).emit(encode_and_encrypt_note(
            &mut context,
            user_address,
        ));

        context.set_as_fee_payer();

        let config = storage.config.read();

        // TODO(palla/gas) Assert fee_juice_limit_per_tx is less than this tx gas_limit
        let _gas_limit = config.fee_juice_limit_per_tx;

        context.end_setup();

        // We check that the note is not expired. We do that via the router contract to conceal which contract
        // is performing the check.
        privately_check_block_number(Comparator.LT, note.expiry_block_number, &mut context);

        payload.execute_calls(&mut context, config.target_address);
    }

    #[public]
    #[initializer]
    fn constructor(
        target_address: AztecAddress,
        subscription_recipient_address: AztecAddress,
        subscription_token_address: AztecAddress,
        subscription_price: u128,
        fee_juice_limit_per_tx: Field,
    ) {
        storage.config.initialize(
            Config {
                target_address,
                subscription_recipient_address,
                subscription_token_address,
                subscription_price,
                fee_juice_limit_per_tx,
            },
        );
    }

    #[private]
    fn subscribe(
        subscriber: AztecAddress,
        authwit_nonce: Field,
        expiry_block_number: u32,
        tx_count: u32,
    ) {
        assert(tx_count <= SUBSCRIPTION_TXS);

        let config = storage.config.read();

        Token::at(config.subscription_token_address)
            .transfer_in_private(
                context.msg_sender(),
                config.subscription_recipient_address,
                config.subscription_price,
                authwit_nonce,
            )
            .call(&mut context);

        // Assert that the `current_block_number > expiry_block_number - SUBSCRIPTION_DURATION_IN_BLOCKS`.
        // --> We do that via the router contract to conceal which contract is performing the check.
        privately_check_block_number(
            Comparator.GT,
            expiry_block_number - SUBSCRIPTION_DURATION_IN_BLOCKS,
            &mut context,
        );

        let subscription_note = SubscriptionNote::new(subscriber, expiry_block_number, tx_count);
        storage.subscriptions.at(subscriber).initialize_or_replace(subscription_note).emit(
            encode_and_encrypt_note(&mut context, subscriber),
        );
    }

    #[utility]
    unconstrained fn is_initialized(subscriber: AztecAddress) -> bool {
        storage.subscriptions.at(subscriber).is_initialized()
    }
}
